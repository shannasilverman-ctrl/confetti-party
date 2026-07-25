// Public Bring Board — guest-facing widget on the RSVP page.
//
// Contract with the RSVP page:
//   - `items` is canonical server state; the component syncs from it whenever
//     the parent re-fetches. Local optimistic state is only used *between*
//     the mutation call and the parent's canonical refetch.
//   - `defaultName` mirrors the RSVP form name and stays in sync UNLESS the
//     guest has edited the Bring Board name field themselves.
//   - `onChanged` fires after a successful claim/release so the parent can
//     re-fetch `get_rsvp_party` for canonical counts + board.
//   - `onRequestRefresh` powers the visible Refresh control; the parent owns
//     the actual RPC call and busy/last-updated indicators.
//
// Storage-failure compensation (see docs/rc-audit gap G7):
//   If localStorage rejects the claim receipt (quota / disabled / private
//   mode), we do NOT leave the guest with a claim they can never release.
//   We immediately call `release_bring_item` with the freshly-minted secret
//   and surface a clear message. There is no name fallback for release.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { celebrate } from "@/components/confetti-burst";
import { clearSecret, loadSecrets, saveSecret } from "@/lib/bring-secrets";
import type { PublicBringItem } from "@/lib/rsvp.functions";

type Props = {
  token: string;
  items: PublicBringItem[];
  defaultName?: string;
  onChanged?: () => void;
  onRequestRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  lastUpdatedAt?: number | null;
};

function formatRelative(ts: number | null | undefined): string | null {
  if (!ts) return null;
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function PublicBringBoard({
  token,
  items,
  defaultName,
  onChanged,
  onRequestRefresh,
  refreshing,
  lastUpdatedAt,
}: Props) {
  // Canonical rows come from props; sync a local mirror so single-mutation
  // optimism is possible without discarding fresh server state on refetch.
  const [rows, setRows] = useState<PublicBringItem[]>(items);
  const itemsKey = useRef(JSON.stringify(items));
  useEffect(() => {
    const nextKey = JSON.stringify(items);
    if (nextKey !== itemsKey.current) {
      itemsKey.current = nextKey;
      setRows(items);
    }
  }, [items]);

  // Name stays in sync with the RSVP form field UNTIL the guest edits it here.
  const [name, setName] = useState(defaultName ?? "");
  const nameDirty = useRef(false);
  useEffect(() => {
    if (!nameDirty.current) setName(defaultName ?? "");
  }, [defaultName]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<Record<string, string>>(() => loadSecrets(token).map);

  // Re-tick the "updated Xs ago" label without a hard re-render loop.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!lastUpdatedAt) return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, [lastUpdatedAt]);

  if (!rows.length && !onRequestRefresh) return null;

  const grouped = rows.reduce<Record<string, PublicBringItem[]>>((acc, it) => {
    (acc[it.category] ??= []).push(it);
    return acc;
  }, {});

  async function claim(item: PublicBringItem, evt?: React.MouseEvent) {
    const who = name.trim();
    if (!who) {
      toast.error("Add your name above to claim an item.");
      return;
    }
    setBusyId(item.id);
    const { data, error } = await supabase.rpc("claim_bring_item", {
      token,
      item_id: item.id,
      guest_name: who,
    });
    setBusyId(null);
    if (error || (data && (data as { ok?: boolean }).ok === false)) {
      toast.error("That item was just claimed by someone else. Refreshing…");
      await onRequestRefresh?.();
      return;
    }
    const secret = (data as { claimSecret?: string } | null)?.claimSecret;
    if (!secret) {
      toast.error("Couldn't confirm your claim — please try again.");
      await onRequestRefresh?.();
      return;
    }
    // Try to persist the receipt. If storage rejects it, compensate by
    // releasing the just-minted claim so the guest is never stranded.
    const status = saveSecret(token, item.id, secret);
    if (status !== "ok") {
      const { data: relData, error: relErr } = await supabase.rpc("release_bring_item", {
        token,
        item_id: item.id,
        guest_name: who,
        claim_secret: secret,
      });
      const releasedOk = !relErr && (relData as { ok?: boolean } | null)?.ok !== false;
      toast.error(
        releasedOk
          ? "This browser can't remember claims (private mode or storage full). We released the claim so someone else can take it."
          : "This browser can't remember claims. Please try again on a device that allows storage.",
      );
      await onRequestRefresh?.();
      return;
    }
    setSecrets((prev) => ({ ...prev, [item.id]: secret }));
    setRows((prev) => prev.map((r) => (r.id === item.id ? { ...r, status: "claimed" } : r)));
    celebrate("micro", evt ? { x: evt.clientX, y: evt.clientY } : undefined);
    toast.success(`You're on ${item.label}. Thanks!`);
    onChanged?.();
  }

  async function release(item: PublicBringItem) {
    const who = name.trim();
    const secret = secrets[item.id];
    if (!secret) {
      toast.error("Only the browser that claimed this can release it.");
      return;
    }
    setBusyId(item.id);
    const { data, error } = await supabase.rpc("release_bring_item", {
      token,
      item_id: item.id,
      guest_name: who,
      claim_secret: secret,
    });
    setBusyId(null);
    if (error || (data && (data as { ok?: boolean }).ok === false)) {
      toast.error("Couldn't release that item. Refreshing…");
      await onRequestRefresh?.();
      return;
    }
    clearSecret(token, item.id);
    setSecrets((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    setRows((prev) => prev.map((r) => (r.id === item.id ? { ...r, status: "open" } : r)));
    toast.success("Released. Someone else can grab it now.");
    onChanged?.();
  }

  const rel = formatRelative(lastUpdatedAt);

  return (
    <section
      className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
      aria-labelledby="bring-board-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Bring board
          </div>
          <h2
            id="bring-board-heading"
            className="mt-0.5 font-display text-lg font-semibold text-secondary"
          >
            What still needs a hand
          </h2>
          {rel && (
            <div className="mt-0.5 text-[11px] text-muted-foreground" aria-live="polite">
              Updated {rel}
            </div>
          )}
        </div>
        {onRequestRefresh && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void onRequestRefresh()}
            disabled={refreshing}
            aria-label="Refresh bring board"
            className="min-h-11 min-w-11"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            <span className="ml-1">Refresh</span>
          </Button>
        )}
      </div>
      <div className="mt-3 space-y-1.5">
        <Label htmlFor="bring-name">Your name</Label>
        <Input
          id="bring-name"
          placeholder="So the host knows who claimed it"
          value={name}
          onChange={(e) => {
            nameDirty.current = true;
            setName(e.target.value);
          }}
          maxLength={80}
          autoComplete="name"
          className="min-h-11"
        />
      </div>
      <div className="mt-4 space-y-4">
        {Object.entries(grouped).map(([cat, list]) => (
          <div key={cat}>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {cat}
            </div>
            <ul className="space-y-1.5">
              {list.map((it) => {
                const taken = it.status !== "open";
                const mine = taken && !!secrets[it.id];
                return (
                  <li
                    key={it.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/60 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-foreground">{it.label}</span>
                        <span className="text-xs text-muted-foreground">
                          × {it.qty}
                          {it.unit ? ` ${it.unit}` : ""}
                        </span>
                      </div>
                      {taken && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {mine ? "Claimed by you" : "Claimed"}
                        </div>
                      )}
                    </div>

                    {taken ? (
                      mine ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busyId === it.id}
                          onClick={() => void release(it)}
                          className="min-h-11"
                        >
                          Release
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Taken</span>
                      )
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={busyId === it.id}
                        onClick={(e) => void claim(it, e)}
                        className="min-h-11"
                      >
                        I'll bring it
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
