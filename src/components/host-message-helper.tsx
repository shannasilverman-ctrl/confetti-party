import { useEffect, useMemo, useState } from "react";
import { Copy, LockKeyhole, MessageCircleMore, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useParties } from "@/lib/party-context";
import {
  hostMessageDrafts,
  recommendedHostMessage,
  type HostMessageIntent,
} from "@/lib/host-message-helper";
import { celebrate } from "@/components/confetti-burst";

function audienceSummary(names: string[]) {
  if (names.length === 0) return "Review the guest list before sending.";
  const visible = names.slice(0, 5);
  const rest = names.length - visible.length;
  return `${visible.join(", ")}${rest > 0 ? ` +${rest} more` : ""}`;
}

function naturalList(items: string[]) {
  if (items.length < 2) return items[0] ?? "";
  if (items.length === 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

export function HostMessageHelper({ partyId }: { partyId: string }) {
  const { getParty, isDemo } = useParties();
  const party = getParty(partyId)!;
  const [origin, setOrigin] = useState("");
  const [selectedId, setSelectedId] = useState<HostMessageIntent | null>(null);
  const [messageEdits, setMessageEdits] = useState<Partial<Record<HostMessageIntent, string>>>({});

  useEffect(() => setOrigin(window.location.origin), []);

  const inviteUrl =
    !isDemo && origin && party.rsvpToken ? `${origin}/rsvp/${party.rsvpToken}` : undefined;
  const drafts = useMemo(() => hostMessageDrafts(party, inviteUrl), [inviteUrl, party]);
  const recommended = useMemo(() => recommendedHostMessage(drafts), [drafts]);
  const selected =
    drafts.find((draft) => draft.id === selectedId) ?? recommended ?? drafts.at(0) ?? null;

  if (!selected) return null;
  const message = messageEdits[selected.id] ?? selected.message;

  const choose = (id: HostMessageIntent) => {
    const draft = drafts.find((candidate) => candidate.id === id);
    if (!draft) return;
    setSelectedId(id);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.trim());
      toast.success("Message copied", {
        description: "Paste it into the right one-to-one or group conversation.",
      });
      celebrate("micro");
    } catch {
      toast.error("Couldn't copy the message. Select the text and copy it manually.");
    }
  };

  return (
    <section
      aria-labelledby="host-message-helper-title"
      className="overflow-hidden rounded-3xl border border-primary/20 bg-card shadow-card"
      data-testid="host-message-helper"
    >
      <div className="bg-gradient-to-r from-primary/[0.095] via-accent/[0.08] to-transparent p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <MessageCircleMore className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="host-message-helper-title"
                className="font-display text-xl font-semibold text-secondary"
              >
                The right follow-up, already thought through
              </h2>
              {recommended?.id === selected.id && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                  <Sparkles className="h-3 w-3" aria-hidden /> Best next message
                </span>
              )}
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Confetti finds the audience and drafts the useful message. You review, copy, and
              choose where it goes—nothing sends from here.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {drafts.map((draft) => (
            <button
              key={draft.id}
              type="button"
              onClick={() => choose(draft.id)}
              aria-pressed={selected.id === draft.id}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition ${
                selected.id === draft.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-secondary hover:border-primary/40"
              }`}
            >
              {draft.label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
          <div className="space-y-3 rounded-2xl bg-muted/45 p-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                <Users className="h-4 w-4" aria-hidden /> Suggested audience
              </div>
              <p className="mt-2 text-sm font-semibold text-secondary">{selected.audienceLabel}</p>
              <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                {audienceSummary(selected.audienceNames)}
              </p>
            </div>
            <div className="border-t border-border pt-3">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Why this matters
              </div>
              <p className="mt-1 text-sm leading-6 text-secondary">{selected.reason}</p>
            </div>
            {selected.missingDetails.length > 0 && (
              <div
                className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-secondary"
                data-testid="message-missing-details"
              >
                <strong>Before sending:</strong> add {naturalList(selected.missingDetails)}.
                Confetti did not guess.
              </div>
            )}
            {selected.privacyNote && (
              <div className="flex gap-2 rounded-xl border border-primary/15 bg-background p-3 text-xs leading-5 text-muted-foreground">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                {selected.privacyNote}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Textarea
              value={message}
              onChange={(event) =>
                setMessageEdits((current) => ({
                  ...current,
                  [selected.id]: event.target.value.slice(0, 2000),
                }))
              }
              aria-label="Editable guest message"
              className="min-h-52 resize-y bg-background leading-6"
              maxLength={2000}
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-muted-foreground">
                Review the audience above before pasting. Confetti does not store contacts or claim
                a message was sent.
              </p>
              <Button
                type="button"
                variant="festive"
                className="min-h-11 shrink-0"
                onClick={copy}
                disabled={!message.trim()}
              >
                <Copy aria-hidden /> Copy message
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
