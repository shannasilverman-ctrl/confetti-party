// Host-side Bring Board editor.
// Add / edit / remove contribution items, seed from a holiday pack, and
// see guest claims. Persists through useParties.updateParty().

import { useMemo, useState } from "react";
import { Plus, Trash2, Sparkles, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { useParties, type BringItem, type BringCategory, newId } from "@/lib/party-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PACKS, packBringBoard, listPacks, type PackId } from "@/lib/holiday-packs";
import { celebrate } from "@/components/confetti-burst";

const CATEGORIES: BringCategory[] = [
  "Main",
  "Sides",
  "Dessert",
  "Drinks",
  "Ice / Serveware",
  "Kids",
  "Décor",
];

export function BringBoardEditor({ partyId }: { partyId: string }) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId)!;
  const items = useMemo(() => party.bringBoard ?? [], [party.bringBoard]);

  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<BringCategory>("Sides");
  const [qty, setQty] = useState(1);

  const grouped = useMemo(() => {
    return items.reduce<Record<string, BringItem[]>>((acc, it) => {
      (acc[it.category] ??= []).push(it);
      return acc;
    }, {});
  }, [items]);

  const openCount = items.filter((i) => i.status === "open").length;
  const claimedCount = items.filter((i) => i.status === "claimed").length;

  function add(evt?: React.MouseEvent) {
    const text = label.trim();
    if (!text) return;
    // Duplicate detection (case-insensitive, same category).
    const dup = items.find(
      (i) => i.label.trim().toLowerCase() === text.toLowerCase() && i.category === category,
    );
    if (dup) {
      toast.info("You already have that on the board.");
      return;
    }
    const next: BringItem = {
      id: newId(),
      category,
      label: text,
      qty: Math.max(1, Math.min(999, qty)),
      status: "open",
      source: "host",
    };
    updateParty(party.id, (p) => ({ ...p, bringBoard: [...(p.bringBoard ?? []), next] }));
    setLabel("");
    setQty(1);
    if (evt) celebrate("micro", { x: evt.clientX, y: evt.clientY });
  }

  function remove(id: string) {
    updateParty(party.id, (p) => ({
      ...p,
      bringBoard: (p.bringBoard ?? []).filter((i) => i.id !== id),
    }));
  }

  function unassign(id: string) {
    updateParty(party.id, (p) => ({
      ...p,
      bringBoard: (p.bringBoard ?? []).map((i) =>
        i.id === id
          ? {
              ...i,
              status: "open",
              assigneeName: undefined,
              assigneeHousehold: undefined,
              claimedAt: undefined,
            }
          : i,
      ),
    }));
  }

  function applyPack(packId: PackId) {
    const seeds = packBringBoard(PACKS[packId], newId);
    if (!seeds.length) return;
    updateParty(party.id, (p) => {
      const existing = p.bringBoard ?? [];
      const known = new Set(existing.map((i) => `${i.category}::${i.label.toLowerCase()}`));
      const additions = seeds.filter((s) => !known.has(`${s.category}::${s.label.toLowerCase()}`));
      return {
        ...p,
        holidayPackId: packId,
        bringBoard: [...existing, ...additions],
      };
    });
    toast.success(`Added ${PACKS[packId].label} suggestions.`);
    celebrate("small");
  }

  // Missing-category prompts
  const missingCats = CATEGORIES.filter(
    (c) =>
      !items.some((i) => i.category === c) && ["Main", "Sides", "Dessert", "Drinks"].includes(c),
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-semibold text-secondary">Bring Board</h2>
            <p className="text-sm text-muted-foreground">
              What you're asking guests to bring. They can claim items from their Party Pass.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="soft">{openCount} open</Badge>
            <Badge variant="secondary">{claimedCount} claimed</Badge>
          </div>
        </div>

        {!party.holidayPackId && (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/30 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Seed from a holiday pack
            </div>
            <div className="flex flex-wrap gap-2">
              {listPacks()
                .slice(0, 6)
                .map((p) => (
                  <Button key={p.id} size="sm" variant="outline" onClick={() => applyPack(p.id)}>
                    {p.emoji} {p.label}
                  </Button>
                ))}
            </div>
          </div>
        )}

        {/* Add item */}
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_180px_100px_auto]">
          <div>
            <Label htmlFor="bb-label" className="sr-only">
              Item
            </Label>
            <Input
              id="bb-label"
              placeholder="e.g. Pumpkin pie"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              maxLength={80}
            />
          </div>
          <Select value={category} onValueChange={(v) => setCategory(v as BringCategory)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={1}
            max={999}
            value={qty}
            onChange={(e) => setQty(parseInt(e.target.value || "1", 10))}
            aria-label="Quantity"
          />
          <Button variant="festive" onClick={add} disabled={!label.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        {missingCats.length > 0 && items.length > 0 && (
          <div className="mt-3 text-xs text-muted-foreground">
            Nothing yet in: {missingCats.join(", ")}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card/60 p-8 text-center text-sm text-muted-foreground">
          Nothing on the board yet. Add an item above or seed from a holiday pack.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat} className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {cat}
              </div>
              <ul className="divide-y divide-border">
                {list.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-secondary">
                        {i.label}{" "}
                        <span className="font-normal text-muted-foreground">
                          × {i.qty}
                          {i.unit ? ` ${i.unit}` : ""}
                        </span>
                      </div>
                      {i.status === "claimed" && i.assigneeName && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-primary">
                          <UserCheck className="h-3 w-3" /> {i.assigneeName}
                          {i.assigneeHousehold ? ` · ${i.assigneeHousehold}` : ""}
                        </div>
                      )}
                    </div>
                    {i.status === "claimed" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => unassign(i.id)}
                        aria-label={`Unassign ${i.label}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Badge variant="soft" className="text-[10px]">
                        Open
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(i.id)}
                      aria-label={`Remove ${i.label}`}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
