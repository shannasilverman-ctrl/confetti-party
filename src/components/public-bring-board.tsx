// Public Bring Board — guest-facing widget on the RSVP page.
//
// Contract with the RSVP page:
//   - `items` is canonical server state; the component syncs from it whenever
//     the parent re-fetches. Local optimistic state is only used *between*
//     the mutation call and the parent's canonical refetch.
//   - `defaultName` mirrors the RSVP form name and stays in sync UNLESS the
//     guest has edited the Bring Board name field themselves.
//   - `onChanged` fires after a successful claim/release so the parent can
//     re-fetch `get_rsvp_party` for canonical counts + board. The component
//     awaits it before releasing the busy state so double actions cannot race.
//   - `onRequestRefresh` powers the visible Refresh control; the parent owns
//     the actual RPC call and busy/last-updated indicators.
//
// Storage-failure compensation (see docs/rc-audit gap G7):
//   If localStorage rejects the claim receipt (quota / disabled / private
//   mode), we compensate by releasing the just-minted claim. If compensation
//   also fails, we retain the receipt IN MEMORY only (never printed) and
//   expose a high-urgency "Retry release" affordance so the same tab can
//   still recover. A canonical refresh that reports the item as claimed does
//   not hide that control while a memory receipt exists.

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { celebrate } from "@/components/confetti-burst";
import { clearSecret, loadSecrets, saveSecret } from "@/lib/bring-secrets";
import type { PublicBringItem } from "@/lib/rsvp.functions";
import { trackProductEvent } from "@/lib/product-telemetry";

type Props = {
  token: string;
  items: PublicBringItem[];
  defaultName?: string;
  onChanged?: () => void | Promise<void>;
  onRequestRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  lastUpdatedAt?: number | null;
};

type StatusMsg = { kind: "info" | "success" | "error" | "warn"; text: string } | null;

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

function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return /network|fetch|failed to fetch|timeout|offline/i.test(msg);
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
  // Canonical rows from props; sync a local mirror so single-mutation
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
  const [status, setStatus] = useState<StatusMsg>(null);

  // Two-tier receipt store. `secrets` is the union used for UI checks;
  // `memoryOnly` marks receipts that failed to persist and only live in this
  // tab. On unmount / token change the memory receipts are dropped along with
  // the tab's session — a canonical refresh from the server is authoritative.
  const [secrets, setSecrets] = useState<Record<string, string>>(() => loadSecrets(token).map);
  const memoryOnly = useRef<Set<string>>(new Set());

  useEffect(() => {
    // TanStack can reuse this component instance when only the route token
    // changes. Never carry claim capabilities, memory receipts, name edits,
    // busy state, or status from invite A into invite B.
    setSecrets(loadSecrets(token).map);
    memoryOnly.current = new Set();
    setBusyId(null);
    setStatus(null);
    nameDirty.current = false;
    setName(defaultName ?? "");
    // defaultName intentionally excluded — its own effect handles later changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Request sequencing: only the newest refresh is allowed to update rows.
  const refreshSeqRef = useRef(0);
  const awaitRefresh = useCallback(async () => {
    if (!onChanged && !onRequestRefresh) return;
    const seq = ++refreshSeqRef.current;
    try {
      await (onChanged ? onChanged() : onRequestRefresh?.());
    } catch {
      /* parent surfaces its own refresh error; ignore here */
    }
    // If a newer refresh started while we awaited, drop this one's effects.
    if (seq !== refreshSeqRef.current) return;
  }, [onChanged, onRequestRefresh]);

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
      setStatus({ kind: "error", text: "Add your name above to claim an item." });
      return;
    }
    if (busyId) return; // hard guard against double-clicks
    setBusyId(item.id);
    setStatus(null);
    try {
      let data: unknown = null;
      let error: unknown = null;
      try {
        const res = await supabase.rpc("claim_bring_item", {
          token,
          item_id: item.id,
          guest_name: who,
        });
        data = res.data;
        error = res.error;
      } catch (thrown) {
        error = thrown;
      }
      const okPayload = (data as { ok?: boolean } | null)?.ok === true;
      if (error || !okPayload) {
        // Distinguish thrown/network errors from a legitimate "already claimed"
        // reply so the copy is honest and retry guidance matches.
        const network = !!error && isNetworkError(error);
        setStatus(
          network
            ? {
                kind: "error",
                text: "Network hiccup — couldn't reach the server. Try again in a moment.",
              }
            : { kind: "warn", text: "Someone just claimed that one. Refreshing…" },
        );
        await awaitRefresh();
        return;
      }
      const secret = (data as { claimSecret?: string } | null)?.claimSecret;
      if (!secret) {
        setStatus({ kind: "error", text: "Couldn't confirm your claim — please try again." });
        await awaitRefresh();
        return;
      }
      // Try to persist the receipt. If storage rejects it, compensate by
      // releasing the just-minted claim. If compensation also fails, retain
      // the receipt in memory so this open page still has a recovery path.
      const persistStatus = saveSecret(token, item.id, secret);
      if (persistStatus !== "ok") {
        let releasedOk = false;
        try {
          const { data: relData, error: relErr } = await supabase.rpc("release_bring_item", {
            token,
            item_id: item.id,
            guest_name: who,
            claim_secret: secret,
          });
          releasedOk = !relErr && (relData as { ok?: boolean } | null)?.ok === true;
        } catch {
          releasedOk = false;
        }
        if (!releasedOk) {
          // Preserve receipt IN MEMORY only. Never print it. Mark for the UI
          // so we can render the high-urgency retry affordance.
          memoryOnly.current.add(item.id);
          setSecrets((prev) => ({ ...prev, [item.id]: secret }));
          setRows((prev) =>
            prev.map((row) => (row.id === item.id ? { ...row, status: "claimed" } : row)),
          );
          setStatus({
            kind: "warn",
            text: "This browser can't save your claim. Keep this tab open — use Retry release below to free the item.",
          });
        } else {
          setStatus({
            kind: "warn",
            text: "This browser can't remember claims, so we released it for someone else.",
          });
        }
        await awaitRefresh();
        return;
      }
      setSecrets((prev) => ({ ...prev, [item.id]: secret }));
      setRows((prev) => prev.map((r) => (r.id === item.id ? { ...r, status: "claimed" } : r)));
      trackProductEvent("bring_item_claimed");
      celebrate("micro", evt ? { x: evt.clientX, y: evt.clientY } : undefined);
      setStatus({ kind: "success", text: `You're on ${item.label}. Thanks!` });
      await awaitRefresh();
    } finally {
      setBusyId(null);
    }
  }

  async function release(item: PublicBringItem) {
    const who = name.trim();
    const secret = secrets[item.id];
    if (!secret) {
      setStatus({ kind: "error", text: "Only the browser that claimed this can release it." });
      return;
    }
    if (busyId) return;
    setBusyId(item.id);
    setStatus(null);
    try {
      let data: unknown = null;
      let error: unknown = null;
      try {
        const res = await supabase.rpc("release_bring_item", {
          token,
          item_id: item.id,
          guest_name: who,
          claim_secret: secret,
        });
        data = res.data;
        error = res.error;
      } catch (thrown) {
        error = thrown;
      }
      const okPayload = (data as { ok?: boolean } | null)?.ok === true;
      if (error || !okPayload) {
        const network = !!error && isNetworkError(error);
        setStatus({
          kind: "error",
          text: network
            ? "Network hiccup — your receipt is still here. Tap Release to retry."
            : "Couldn't release that item. Your receipt is still here — tap Release to retry.",
        });
        await awaitRefresh();
        return;
      }
      // Success — drop receipt from both tiers.
      memoryOnly.current.delete(item.id);
      clearSecret(token, item.id);
      setSecrets((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      setRows((prev) => prev.map((r) => (r.id === item.id ? { ...r, status: "open" } : r)));
      setStatus({ kind: "success", text: "Released. Someone else can grab it now." });
      await awaitRefresh();
    } finally {
      setBusyId(null);
    }
  }

  const rel = formatRelative(lastUpdatedAt);

  const statusToneClass =
    status?.kind === "success"
      ? "text-primary"
      : status?.kind === "warn"
        ? "text-amber-700 dark:text-amber-500"
        : status?.kind === "error"
          ? "text-destructive"
          : "text-muted-foreground";

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
      {/* Inline aria-live status — screen readers announce claim/release
          outcomes without relying on transient toast notifications. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`mt-2 min-h-[1.25rem] text-[12px] ${statusToneClass}`}
        data-testid="bring-status"
      >
        {status?.text ?? ""}
      </div>
      <div className="mt-3 space-y-4">
        {Object.entries(grouped).map(([cat, list]) => (
          <div key={cat}>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {cat}
            </div>
            <ul className="space-y-1.5">
              {list.map((it) => {
                const taken = it.status !== "open";
                const mine = !!secrets[it.id];
                // A memory-only receipt means the persisted release path is
                // gone the moment this tab closes. Surface that prominently.
                const memory = mine && memoryOnly.current.has(it.id);
                // Keep Release visible whenever we hold ANY receipt, even if
                // the server row happens to be open (compensation succeeded).
                const showRelease = mine;
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
                      {memory && (
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-500">
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          Only this tab can release it — don't close yet.
                        </div>
                      )}
                    </div>

                    {showRelease ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={memory ? "outline" : "ghost"}
                        disabled={busyId === it.id}
                        onClick={() => void release(it)}
                        className="min-h-11"
                      >
                        {memory ? "Retry release" : "Release"}
                      </Button>
                    ) : taken ? (
                      <span className="text-xs text-muted-foreground">Taken</span>
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
