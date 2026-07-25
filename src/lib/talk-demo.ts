/**
 * Bounded demo brain for the signed-out /talk experience.
 * Runs entirely in the browser — no server calls, no persistence.
 * We surface warm, on-brand replies and steer the guest toward
 * signing up to save/continue.
 */
export type DemoMsg = { role: "user" | "assistant"; content: string };

const DEMO_TURNS = [
  {
    reply:
      "Love that. Tell me a bit more — who's it for, roughly when, and what's the vibe you want people to leave with?",
    assumptions: ["Casual gathering", "Adults + a few close friends"],
    openQuestions: ["Weekday evening or weekend afternoon?", "Any dietary must-haves?"],
  },
  {
    reply:
      "Got it. I'd lean into a warm, low-lift setup: a signature drink, a shared main, and one small game or moment to anchor the night. Want me to sketch a starter checklist?",
    assumptions: ["Serving food + drinks", "6–12 guests"],
    openQuestions: ["Do you want to cook or lean on takeout?", "Any theme cue we should honor?"],
  },
  {
    reply:
      "Here's what I'd set up: a checklist grouped by week, a lightweight bring board so guests can pitch in, and a day-of timeline. Ready to review the plan? Sign up free and I'll save this as a real workspace.",
    assumptions: ["Bring board on", "Day-of mode enabled"],
    openQuestions: [],
    complete: true as const,
  },
] as const;

export function demoReply(index: number): {
  reply: string;
  assumptions: string[];
  openQuestions: string[];
  complete: boolean;
} {
  const turn = DEMO_TURNS[Math.min(index, DEMO_TURNS.length - 1)];
  return {
    reply: turn.reply,
    assumptions: [...turn.assumptions],
    openQuestions: [...turn.openQuestions],
    complete: "complete" in turn ? turn.complete : false,
  };
}

export const DEMO_MAX_TURNS = DEMO_TURNS.length;
