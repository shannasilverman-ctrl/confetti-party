// Public Bring Board component for the guest RSVP page.
// Guests can claim/release items via SECURITY DEFINER RPCs (token-scoped).
// Release now requires a per-claim secret returned by claim_bring_item and
// stored in the guest's own localStorage — a shared name alone cannot un-claim.

import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { celebrate } from "@/components/confetti-burst";
import type { PublicBringItem } from "@/lib/rsvp.functions";

type Props = {
  token: string;
  items: PublicBringItem[];
  defaultName?: string;
};

const SECRET_STORAGE_KEY = (token: string) => `confetti.bring.secrets.${token}`;

function loadSecrets(token: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SECRET_STORAGE_KEY(token));
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveSecret(token: string, itemId: string, secret: string) {
  if (typeof window === "undefined") return;
  try {
    const map = loadSecrets(token);
    map[itemId] = secret;
    window.localStorage.setItem(SECRET_STORAGE_KEY(token), JSON.stringify(map));
  } catch {
    /* storage unavailable — release will fall back to name */
  }
}

function clearSecret(token: string, itemId: string) {
  if (typeof window === "undefined") return;
  try {
    const map = loadSecrets(token);
    delete map[itemId];
    window.localStorage.setItem(SECRET_STORAGE_KEY(token), JSON.stringify(map));
  } catch {
    /* noop */
  }
}

export function PublicBringBoard({ token, items, defaultName }: Props) {
  const [rows, setRows] = useState<PublicBringItem[]>(items);
  const [name, setName] = useState(defaultName ?? "");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<Record<string, string>>(() => loadSecrets(token));

  if (!rows.length) return null;

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
      toast.error("Couldn't claim that — it may already be taken. Refresh?");
      return;
    }
    const secret = (data as { claimSecret?: string } | null)?.claimSecret;
    if (secret) {
      saveSecret(token, item.id, secret);
      setSecrets((prev) => ({ ...prev, [item.id]: secret }));
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === item.id ? { ...r, status: "claimed", assigneeName: who } : r,
      ),
    );
    celebrate("micro", evt ? { x: evt.clientX, y: evt.clientY } : undefined);
    toast.success(`You're on ${item.label}. Thanks!`);
  }

  async function release(item: PublicBringItem) {
    const who = name.trim() || item.assigneeName || "";
    const secret = secrets[item.id];
    setBusyId(item.id);
    const { data, error } = await supabase.rpc("release_bring_item", {
      token,
      item_id: item.id,
      guest_name: who,
      claim_secret: secret ?? null,
    });
    setBusyId(null);
    if (error || (data && (data as { ok?: boolean }).ok === false)) {
      toast.error("Couldn't release that item.");
      return;
    }
    clearSecret(token, item.id);
    setSecrets((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    setRows((prev) =>
      prev.map((r) =>
        r.id === item.id ? { ...r, status: "open", assigneeName: null } : r,
      ),
    );
  }

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Bring board
          </div>
          <h2 className="mt-0.5 font-display text-lg font-semibold text-secondary">
            What still needs a hand
          </h2>
        </div>
      </div>
      <div className="mt-3">
        <Input
          placeholder="Your name (so the host knows who claimed it)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
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
                const mine =
                  taken &&
                  (!!secrets[it.id] ||
                    (!!name.trim() &&
                      it.assigneeName?.trim().toLowerCase() === name.trim().toLowerCase()));
                return (
                  <li
                    key={it.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/60 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-foreground">
                          {it.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          × {it.qty}
                          {it.unit ? ` ${it.unit}` : ""}
                        </span>
                        {it.dietaryTags?.map((t) => (
                          <Badge key={t} variant="secondary" className="h-5 text-[10px]">
                            {t}
                          </Badge>
                        ))}
                      </div>
                      {taken && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Claimed{it.assigneeName ? ` by ${it.assigneeName}` : ""}
                        </div>
                      )}
                    </div>
                    {taken ? (
                      mine ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === it.id}
                          onClick={() => release(it)}
                        >
                          Release
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Taken</span>
                      )
                    ) : (
                      <Button
                        size="sm"
                        disabled={busyId === it.id}
                        onClick={(e) => claim(it, e)}
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
