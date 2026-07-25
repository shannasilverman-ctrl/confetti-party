"""Bounded planner → coder → verifier loop for Confetti.

The graph deliberately does not deploy. It produces a reviewed candidate;
GitHub CI and the exact-SHA release procedure remain separate gates.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
from pathlib import Path
from typing import TypedDict

from langgraph.graph import END, START, StateGraph


class LoopState(TypedDict):
    goal: str
    acceptance: str
    plan: str
    code_output: str
    verify_report: str
    iteration: int
    max_iterations: int
    done: bool
    escalation_reason: str


class LoopConfig(TypedDict):
    workspace: Path
    state_file: Path
    gates: list[list[str]]
    planner_command: list[str]
    coder_command: list[str]
    reviewer_command: list[str]
    command_timeout_seconds: int


def run_agent(command: list[str], prompt: str, config: LoopConfig) -> str:
    if not command:
        raise RuntimeError("An agent command is required; no model endpoint is assumed.")
    result = subprocess.run(
        command,
        cwd=config["workspace"],
        input=prompt,
        capture_output=True,
        text=True,
        timeout=config["command_timeout_seconds"],
        check=False,
    )
    output = "\n".join(part for part in [result.stdout.strip(), result.stderr.strip()] if part)
    if result.returncode != 0:
        raise RuntimeError(
            f"{command[0]} exited with {result.returncode}:\n{output[-4000:]}"
        )
    return output[-20000:]


def persist(state: LoopState, config: LoopConfig) -> None:
    config["state_file"].parent.mkdir(parents=True, exist_ok=True)
    config["state_file"].write_text(
        json.dumps(state, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def run_gates(config: LoopConfig) -> tuple[bool, str]:
    rows: list[str] = []
    for command in config["gates"]:
        result = subprocess.run(
            command,
            cwd=config["workspace"],
            capture_output=True,
            text=True,
            timeout=config["command_timeout_seconds"],
            check=False,
        )
        label = shlex.join(command)
        combined = "\n".join(
            part for part in [result.stdout.strip(), result.stderr.strip()] if part
        )
        rows.append(f"## {label}\nexit={result.returncode}\n{combined[-6000:]}")
        if result.returncode != 0:
            return False, "\n\n".join(rows)
    return True, "\n\n".join(rows)


def build_graph(config: LoopConfig):
    def plan_node(state: LoopState) -> dict[str, object]:
        iteration = state["iteration"] + 1
        prompt = f"""You are the product planner for Confetti.

Goal:
{state["goal"]}

Acceptance contract:
{state["acceptance"]}

Iteration: {iteration} of {state["max_iterations"]}
Previous verification:
{state["verify_report"] or "No previous verification; create the smallest complete plan."}

Produce a bounded implementation plan. On later iterations, address verifier failures
specifically. Preserve user work, name customer-visible acceptance criteria, and never
include deployment or destructive data actions.
"""
        plan = run_agent(config["planner_command"], prompt, config)
        next_state = {**state, "plan": plan, "iteration": iteration}
        persist(next_state, config)
        return {"plan": plan, "iteration": iteration}

    def code_node(state: LoopState) -> dict[str, object]:
        prompt = f"""You are the coding agent for Confetti.

Goal:
{state["goal"]}

Approved plan:
{state["plan"]}

Implement the plan in {config["workspace"]}. Do not deploy, push, alter credentials,
weaken tests, or assess your own work. Preserve unrelated changes. Finish with a concise
list of files changed and commands you ran.
"""
        output = run_agent(config["coder_command"], prompt, config)
        next_state = {**state, "code_output": output}
        persist(next_state, config)
        return {"code_output": output}

    def verify_node(state: LoopState) -> dict[str, object]:
        gates_passed, gate_report = run_gates(config)
        if not gates_passed:
            report = f"FAIL — deterministic gate failed\n\n{gate_report}"
            done = False
        else:
            prompt = f"""You are the independent product reviewer for Confetti.

Goal:
{state["goal"]}

Acceptance contract:
{state["acceptance"]}

Plan:
{state["plan"]}

Coder report:
{state["code_output"]}

Deterministic gates:
{gate_report}

Inspect the working tree and judge the customer experience, correctness, accessibility,
responsive behavior, product truthfulness, security, and completeness. Start with exactly
PASS or FAIL. PASS only when every acceptance criterion is evidenced. For FAIL, give
specific reproducible gaps; do not implement fixes.
"""
            review = run_agent(config["reviewer_command"], prompt, config).strip()
            done = review.startswith("PASS")
            report = review if review.startswith(("PASS", "FAIL")) else f"FAIL — {review}"
        next_state = {**state, "verify_report": report, "done": done}
        persist(next_state, config)
        return {"verify_report": report, "done": done}

    def route(state: LoopState) -> str:
        if state["done"]:
            return END
        if state["iteration"] >= state["max_iterations"]:
            return "escalate"
        return "plan"

    def escalate_node(state: LoopState) -> dict[str, object]:
        reason = (
            f"Stopped after {state['iteration']} bounded iterations. "
            f"Latest verifier report:\n{state['verify_report']}"
        )
        next_state = {**state, "escalation_reason": reason}
        persist(next_state, config)
        return {"escalation_reason": reason}

    graph = StateGraph(LoopState)
    graph.add_node("plan", plan_node)
    graph.add_node("code", code_node)
    graph.add_node("verify", verify_node)
    graph.add_node("escalate", escalate_node)
    graph.add_edge(START, "plan")
    graph.add_edge("plan", "code")
    graph.add_edge("code", "verify")
    graph.add_conditional_edges("verify", route)
    graph.add_edge("escalate", END)
    return graph.compile()


def parse_command(value: str, label: str) -> list[str]:
    command = shlex.split(value)
    if not command:
        raise ValueError(f"{label} cannot be empty.")
    return command


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--goal-file", required=True, type=Path)
    parser.add_argument("--acceptance-file", required=True, type=Path)
    parser.add_argument(
        "--state-file",
        type=Path,
        default=Path(".loop/confetti-production/STATE.json"),
    )
    parser.add_argument("--max-iterations", type=int, default=4)
    parser.add_argument("--timeout-seconds", type=int, default=3600)
    parser.add_argument(
        "--planner-command",
        default=os.environ.get("CONFETTI_PLANNER_COMMAND", ""),
    )
    parser.add_argument(
        "--coder-command",
        default=os.environ.get("CONFETTI_CODER_COMMAND", ""),
    )
    parser.add_argument(
        "--reviewer-command",
        default=os.environ.get("CONFETTI_REVIEWER_COMMAND", ""),
    )
    args = parser.parse_args()

    if not 1 <= args.max_iterations <= 8:
        parser.error("--max-iterations must be between 1 and 8.")
    if args.timeout_seconds < 30:
        parser.error("--timeout-seconds must be at least 30.")

    workspace = Path.cwd().resolve()
    acceptance_payload = json.loads(
        Path("tools/confetti-loop/acceptance.json").read_text(encoding="utf-8")
    )
    config: LoopConfig = {
        "workspace": workspace,
        "state_file": args.state_file.resolve(),
        "gates": acceptance_payload["gates"],
        "planner_command": parse_command(args.planner_command, "planner command"),
        "coder_command": parse_command(args.coder_command, "coder command"),
        "reviewer_command": parse_command(args.reviewer_command, "reviewer command"),
        "command_timeout_seconds": args.timeout_seconds,
    }
    initial: LoopState = {
        "goal": args.goal_file.read_text(encoding="utf-8").strip(),
        "acceptance": args.acceptance_file.read_text(encoding="utf-8").strip(),
        "plan": "",
        "code_output": "",
        "verify_report": "",
        "iteration": 0,
        "max_iterations": args.max_iterations,
        "done": False,
        "escalation_reason": "",
    }
    persist(initial, config)
    result = build_graph(config).invoke(initial, {"recursion_limit": args.max_iterations * 4 + 4})
    print(result["verify_report"])
    if result["escalation_reason"]:
        print(result["escalation_reason"])
    return 0 if result["done"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
