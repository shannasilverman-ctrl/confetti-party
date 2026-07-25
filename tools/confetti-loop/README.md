# Confetti quality loop

This is a bounded development harness, not a production service. It keeps the
planner, coder, and reviewer independent; runs deterministic repository gates;
writes state after every node; stops after a hard iteration limit; and never
deploys.

## Miniconda setup

```bash
conda env create -f tools/confetti-loop/environment.yml
conda activate confetti-quality-loop
```

LangGraph is pinned to `1.2.9`, the current non-yanked PyPI release checked on
2026-07-25. Update the pin intentionally and rerun the loop tests when upgrading.

## Agent adapters

The harness does not assume that “Fable 5,” Codex, or Opus is available under a
particular executable. Configure three local commands that accept a prompt on
stdin:

```bash
export CONFETTI_PLANNER_COMMAND="<your planner CLI command>"
export CONFETTI_CODER_COMMAND="<your Codex CLI command>"
export CONFETTI_REVIEWER_COMMAND="<your reviewer CLI command>"
```

Then run:

```bash
python tools/confetti-loop/confetti_loop.py \
  --goal-file .loop/confetti-production/PROMPT.md \
  --acceptance-file .loop/confetti-production/ACCEPTANCE.md \
  --max-iterations 4
```

The final result is a candidate working tree. A human-readable review, GitHub
CI, exact-SHA deployment verification, and production smoke test are still
required. Do not put a deploy command into any of the three adapters.
