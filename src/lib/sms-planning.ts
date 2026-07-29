import { analyzePlanningIdea } from "./talk-demo";
import { mergeDraftLog, type DraftPatch } from "./talk-materialize";

export type SmsPlanningState = {
  status: "active" | "stopped";
  draft: DraftPatch;
  turnCount: number;
};

export type SmsPlanningResult = {
  state: SmsPlanningState;
  reply: string | null;
  kind: "planning" | "help" | "stopped" | "resumed" | "reset" | "ignored";
  readyForClaim: boolean;
};

export const EMPTY_SMS_PLANNING_STATE: SmsPlanningState = {
  status: "active",
  draft: {},
  turnCount: 0,
};

function exactCommand(body: string): string {
  return body
    .trim()
    .replace(/[.!]+$/, "")
    .toUpperCase();
}

function nextQuestion(draft: DraftPatch): string | null {
  if (!draft.identity?.occasion) return "What are you planning?";
  if (!draft.when?.date) return "What date, or should I leave the date open for now?";
  if (draft.people?.expectedCount == null) return "About how many people are you inviting?";
  if (!draft.where?.venueKind && !draft.where?.display)
    return "Where are you thinking of hosting it?";
  return null;
}

function readyForClaim(draft: DraftPatch): boolean {
  return Boolean(
    draft.identity?.occasion && draft.when?.date && draft.people?.expectedCount != null,
  );
}

/**
 * Provider-independent SMS conversation policy.
 *
 * Transport code must process STOP/START/HELP before any model call, validate
 * the provider signature, enforce consent/rate limits, and persist the returned
 * state atomically with the provider message id.
 */
export function planSmsMessage(
  current: SmsPlanningState,
  body: string,
  options: { now?: Date } = {},
): SmsPlanningResult {
  const command = exactCommand(body);

  if (
    ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"].includes(
      command,
    )
  ) {
    return {
      state: { ...current, status: "stopped" },
      reply:
        "You’re opted out of Confetti texts. No more messages will be sent. Reply START to resume.",
      kind: "stopped",
      readyForClaim: false,
    };
  }

  if (command === "START" || command === "UNSTOP") {
    return {
      state: { ...current, status: "active" },
      reply:
        "Confetti texts are back on. Tell me what you’re planning, or reply HELP for options. Reply STOP to opt out.",
      kind: "resumed",
      readyForClaim: readyForClaim(current.draft),
    };
  }

  if (current.status === "stopped") {
    return {
      state: current,
      reply: null,
      kind: "ignored",
      readyForClaim: false,
    };
  }

  if (command === "HELP" || command === "INFO") {
    return {
      state: current,
      reply:
        "Confetti helps you build a party plan one question at a time. Text your idea, SKIP to leave a detail open, RESET to restart, or STOP to opt out.",
      kind: "help",
      readyForClaim: readyForClaim(current.draft),
    };
  }

  if (command === "RESET" || command === "RESTART") {
    return {
      state: EMPTY_SMS_PLANNING_STATE,
      reply:
        "Your text draft is cleared. What are you planning? Reply STOP to opt out of Confetti texts.",
      kind: "reset",
      readyForClaim: false,
    };
  }

  const analysis =
    command === "SKIP" ? { draftPatch: {}, capturedFacts: [] } : analyzePlanningIdea(body, options);
  const draft = mergeDraftLog([current.draft, analysis.draftPatch]);
  const state: SmsPlanningState = {
    status: "active",
    draft,
    turnCount: current.turnCount + 1,
  };
  const question = nextQuestion(draft);
  const captured = analysis.capturedFacts.length
    ? `I caught ${analysis.capturedFacts.join(", ")}.`
    : "I kept your draft.";
  const ready = readyForClaim(draft);
  const reply = ready
    ? `${captured} Your starting plan is ready to continue securely online.`
    : `${captured} ${question ?? "What would you like to add?"}`;

  return {
    state,
    reply: state.turnCount === 1 ? `Confetti here. ${reply} Reply STOP to opt out.` : reply,
    kind: "planning",
    readyForClaim: ready,
  };
}
