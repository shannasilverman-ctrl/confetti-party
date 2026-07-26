// Host-side Bring Board editor.
// Add / edit / remove contribution items, seed from a holiday pack, and
// see guest claims. Persists through useParties.updateParty().

import { useMemo, useState } from "react";
import { Pencil, Plus, Sparkles, Trash2, UserCheck, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { useParties, type BringItem, type BringCategory, newId } from "@/lib/party-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PACKS, packBringBoard, listPacks, type PackId } from "@/lib/holiday-packs";
import { celebrate } from "@/components/confetti-burst";
import { missingBringBoardSuggestions } from "@/lib/bring-board-suggestions";

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
  const [editing, setEditing] = useState<BringItem | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editCategory, setEditCategory] = useState<BringCategory>("Sides");
  const [editQty, setEditQty] = useState(1);
  const [editUnit, setEditUnit] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [pendingUnassign, setPendingUnassign] = useState<BringItem | null>(null);

  const grouped = useMemo(() => {
    return items.reduce<Record<string, BringItem[]>>((acc, it) => {
      (acc[it.category] ??= []).push(it);
      return acc;
    }, {});
  }, [items]);

  const openCount = items.filter((i) => i.status === "open").length;
  const claimedCount = items.filter((i) => i.status !== "open").length;
  const suggestions = useMemo(
    () =>
      missingBringBoardSuggestions(
        {
          occasion: party.occasion,
          holidayPackId: party.holidayPackId,
          guestEstimate: party.guestEstimate,
          planningProfile: party.planningProfile,
        },
        items,
      ),
    [items, party.guestEstimate, party.holidayPackId, party.occasion, party.planningProfile],
  );

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
    setPendingUnassign(null);
    toast.success("Available again for guests to claim.");
  }

  function startEdit(item: BringItem) {
    if (item.status !== "open") return;
    setEditing(item);
    setEditLabel(item.label);
    setEditCategory(item.category);
    setEditQty(item.qty);
    setEditUnit(item.unit ?? "");
    setEditAssignee("");
  }

  function saveEdit() {
    if (!editing) return;
    const text = editLabel.trim();
    if (!text) return;
    const assignee = editAssignee.trim();
    const result: { outcome: "saved" | "duplicate" | "changed" } = { outcome: "changed" };
    updateParty(party.id, (p) => {
      const board = p.bringBoard ?? [];
      const current = board.find((item) => item.id === editing.id);
      if (!current || current.status !== "open") return p;
      const duplicate = board.some(
        (item) =>
          item.id !== editing.id &&
          item.category === editCategory &&
          item.label.trim().toLocaleLowerCase() === text.toLocaleLowerCase(),
      );
      if (duplicate) {
        result.outcome = "duplicate";
        return p;
      }
      result.outcome = "saved";
      return {
        ...p,
        bringBoard: board.map((item) =>
          item.id === editing.id
            ? {
                ...item,
                label: text,
                category: editCategory,
                qty: Math.max(1, Math.min(999, editQty)),
                unit: editUnit.trim() || undefined,
                ...(assignee
                  ? {
                      status: "claimed" as const,
                      assigneeName: assignee,
                      claimedAt: new Date().toISOString(),
                    }
                  : {}),
              }
            : item,
        ),
      };
    });
    if (result.outcome === "duplicate") {
      toast.info("You already have that on the board.");
      return;
    }
    if (result.outcome === "changed") {
      setEditing(null);
      toast.info("This responsibility changed while you were editing it. Review the latest board.");
      return;
    }
    setEditing(null);
    toast.success(assignee ? `Assigned to ${assignee}.` : "Bring item updated.");
    if (assignee) celebrate("micro");
  }

  function addSuggestedBoard() {
    if (!suggestions.length) return;
    let addedCount = 0;
    updateParty(party.id, (p) => {
      const freshSuggestions = missingBringBoardSuggestions(
        {
          occasion: p.occasion,
          holidayPackId: p.holidayPackId,
          guestEstimate: p.guestEstimate,
          planningProfile: p.planningProfile,
        },
        p.bringBoard ?? [],
      );
      addedCount = freshSuggestions.length;
      return {
        ...p,
        bringBoard: [
          ...(p.bringBoard ?? []),
          ...freshSuggestions.map(({ reason: _reason, ...item }) => ({
            ...item,
            id: newId(),
            status: "open" as const,
            source: "host" as const,
          })),
        ],
      };
    });
    if (!addedCount) {
      toast.info("Your starter board is already up to date.");
      return;
    }
    toast.success(
      `Added ${addedCount} ${party.occasion === "other" ? "starter" : "occasion-aware"} responsibilities.`,
    );
    celebrate("small");
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
    <div className="space-y-6" data-testid="bring-board">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-semibold text-secondary">Bring Board</h2>
            <p className="text-sm text-muted-foreground">
              Give each contribution one clear owner. Guests can claim open items from their invite,
              or you can assign someone directly.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="soft">{openCount} open</Badge>
            <Badge variant="secondary">{claimedCount} claimed</Badge>
          </div>
        </div>

        {suggestions.length > 0 && (
          <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/[0.055] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  <WandSparkles className="h-4 w-4" aria-hidden /> Confetti starter board
                </div>
                <p className="mt-1 text-sm font-medium text-secondary">
                  {suggestions
                    .slice(0, 3)
                    .map((item) => item.label)
                    .join(" · ")}
                  {suggestions.length > 3 ? ` · +${suggestions.length - 3} more` : ""}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Sized from the working headcount and shaped for this kind of gathering. Edit or
                  remove anything.
                </p>
              </div>
              <Button
                type="button"
                variant="festive"
                onClick={addSuggestedBoard}
                className="shrink-0"
              >
                Add {suggestions.length} suggestions
              </Button>
            </div>
          </div>
        )}

        {party.occasion === "holiday" && !party.holidayPackId && (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/30 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Or use a holiday-specific board
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
            <SelectTrigger aria-label="Category">
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
          <div>
            <Label htmlFor="bb-quantity" className="sr-only">
              Amount one guest should bring
            </Label>
            <Input
              id="bb-quantity"
              type="number"
              min={1}
              max={999}
              value={qty}
              onChange={(e) => setQty(parseInt(e.target.value || "1", 10))}
              aria-label="Amount one guest should bring"
            />
          </div>
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
          Nothing on the board yet. Add Confetti&apos;s starter board above or write your first
          responsibility.
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
                  <li
                    key={i.id}
                    data-testid="bring-item"
                    data-bring-label={i.label}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-secondary">
                        {i.label}{" "}
                        <span className="font-normal text-muted-foreground">
                          × {i.qty}
                          {i.unit ? ` ${i.unit}` : ""}
                        </span>
                      </div>
                      {i.status !== "open" && i.assigneeName && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-primary">
                          <UserCheck className="h-3 w-3" /> {i.assigneeName}
                          {i.assigneeHousehold ? ` · ${i.assigneeHousehold}` : ""}
                        </div>
                      )}
                    </div>
                    {i.status !== "open" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPendingUnassign(i)}
                        aria-label={`Make ${i.label} available again`}
                        className="min-h-11"
                      >
                        Make available
                      </Button>
                    ) : (
                      <>
                        <Badge variant="soft" className="hidden text-[10px] sm:inline-flex">
                          Open
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(i)}
                          aria-label={`Edit or assign ${i.label}`}
                          className="min-h-11 min-w-11"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => remove(i.id)}
                          aria-label={`Remove ${i.label}`}
                          className="min-h-11 min-w-11"
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit or assign this responsibility</DialogTitle>
            <DialogDescription>
              One person claims the full amount. Assign it now, or leave the name blank so a guest
              can choose it from the invite.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="bb-edit-label">What should they bring?</Label>
              <Input
                id="bb-edit-label"
                value={editLabel}
                onChange={(event) => setEditLabel(event.target.value)}
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bb-edit-category">Category</Label>
              <Select
                value={editCategory}
                onValueChange={(value) => setEditCategory(value as BringCategory)}
              >
                <SelectTrigger id="bb-edit-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bb-edit-quantity">Amount</Label>
                <Input
                  id="bb-edit-quantity"
                  type="number"
                  min={1}
                  max={999}
                  value={editQty}
                  onChange={(event) => setEditQty(Number(event.target.value) || 1)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bb-edit-unit">Unit (optional)</Label>
                <Input
                  id="bb-edit-unit"
                  value={editUnit}
                  onChange={(event) => setEditUnit(event.target.value)}
                  placeholder="bags, bottles…"
                  maxLength={24}
                />
              </div>
            </div>
            <div className="space-y-1.5 rounded-2xl border border-primary/15 bg-primary/[0.045] p-3">
              <Label htmlFor="bb-edit-assignee">Assign to someone (optional)</Label>
              <Input
                id="bb-edit-assignee"
                value={editAssignee}
                onChange={(event) => setEditAssignee(event.target.value)}
                placeholder="e.g. Maya"
                maxLength={80}
                autoComplete="off"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Leave blank to keep it open. Assigned items are locked so another guest cannot claim
                the same job.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveEdit} disabled={!editLabel.trim()}>
              {editAssignee.trim() ? `Save and assign to ${editAssignee.trim()}` : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!pendingUnassign}
        onOpenChange={(open) => !open && setPendingUnassign(null)}
      >
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Make this available again?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingUnassign?.assigneeName
                ? `${pendingUnassign.assigneeName} will no longer be listed for “${pendingUnassign.label}.”`
                : `“${pendingUnassign?.label ?? "This item"}” will return to the open board.`}{" "}
              Confetti will not message them automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep assignment</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingUnassign && unassign(pendingUnassign.id)}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/90"
            >
              Make available
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
