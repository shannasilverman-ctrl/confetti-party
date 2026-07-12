import { useMemo, useState } from "react";
import {
  addShoppingItem,
  markShoppingPurchased,
  removeShoppingItem,
  setShoppingStatus,
  totalSpent,
  unmarkShoppingPurchased,
  useParties,
  type ShoppingCategoryName,
  type ShoppingItem,
} from "@/lib/party-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Check, Plus, ShoppingCart, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const CATEGORY_NAMES: ShoppingCategoryName[] = [
  "Venue",
  "Food & Drink",
  "Cake & Desserts",
  "Decorations",
  "Entertainment",
  "Favors",
];

export function ShoppingTab({ partyId }: { partyId: string }) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId)!;
  const spent = totalSpent(party);

  const [confirm, setConfirm] = useState<{ item: ShoppingItem; price: string } | null>(null);

  // Custom add form
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ShoppingCategoryName>("Decorations");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  const grouped = useMemo(() => {
    const g: Record<string, ShoppingItem[]> = {};
    for (const c of CATEGORY_NAMES) g[c] = [];
    for (const it of party.shoppingItems) {
      if (!g[it.category]) g[it.category] = [];
      g[it.category].push(it);
    }
    return g;
  }, [party.shoppingItems]);

  const purchasedTotal = party.shoppingItems
    .filter((i) => i.status === "purchased")
    .reduce((s, i) => s + (i.actualPrice ?? 0), 0);
  const remainingEst = party.shoppingItems
    .filter((i) => i.status !== "purchased")
    .reduce((s, i) => s + i.qty * i.estPrice, 0);
  const projected = spent + remainingEst;
  const overBudget = projected > party.budget;

  function openPurchase(item: ShoppingItem) {
    setConfirm({ item, price: String(item.qty * item.estPrice) });
  }

  function confirmPurchase() {
    if (!confirm) return;
    const n = Number(confirm.price);
    if (!n || n <= 0) {
      toast.error("Enter a valid price");
      return;
    }
    updateParty(partyId, (p) => markShoppingPurchased(p, confirm.item.id, n));
    toast.success("Purchased", { description: `${confirm.item.name} · $${n}` });
    setConfirm(null);
  }

  function cycleStatus(item: ShoppingItem, next: ShoppingItem["status"]) {
    if (next === "purchased") {
      openPurchase(item);
      return;
    }
    if (item.status === "purchased" && next !== "purchased") {
      updateParty(partyId, (p) => unmarkShoppingPurchased(p, item.id));
      // Then set to next (needed vs in-cart)
      if (next !== "needed") {
        updateParty(partyId, (p) => setShoppingStatus(p, item.id, next));
      }
      return;
    }
    updateParty(partyId, (p) => setShoppingStatus(p, item.id, next));
  }

  function addCustom() {
    const q = Math.max(1, Math.floor(Number(qty) || 0));
    const pr = Number(price);
    if (!name.trim() || !q || !pr || pr <= 0) {
      toast.error("Fill in name, quantity and price");
      return;
    }
    updateParty(partyId, (p) =>
      addShoppingItem(p, { name: name.trim(), category, qty: q, estPrice: pr }),
    );
    setName("");
    setQty("1");
    setPrice("");
    toast.success("Added to shopping list");
  }

  function removeItem(id: string) {
    updateParty(partyId, (p) => removeShoppingItem(p, id));
  }

  return (
    <div className="space-y-8">
      {/* Summary */}
      <section
        className={`rounded-2xl border p-5 shadow-card ${
          overBudget ? "border-warning bg-warning/10" : "border-border bg-card"
        }`}
      >
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-semibold text-secondary">
            Shopping summary
          </h2>
          {overBudget && (
            <Badge variant="warning" className="ml-auto">
              <AlertTriangle className="mr-1 h-3 w-3" /> Over budget
            </Badge>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SumStat label="Purchased" value={`$${purchasedTotal}`} />
          <SumStat label="Est. remaining" value={`$${remainingEst}`} />
          <SumStat
            label="Projected total"
            value={`$${projected}`}
            valueClass={overBudget ? "text-warning-foreground" : "text-secondary"}
          />
          <SumStat label="Budget" value={`$${party.budget}`} />
        </div>
      </section>

      {/* Add custom item */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h3 className="font-display text-base font-semibold text-secondary">Add an item</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_160px_90px_110px_auto]">
          <Input
            placeholder="Item name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select value={category} onValueChange={(v) => setCategory(v as ShoppingCategoryName)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_NAMES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            aria-label="Quantity"
          />
          <Input
            type="number"
            min={0}
            placeholder="$ each"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-label="Estimated price"
          />
          <Button variant="festive" onClick={addCustom}>
            <Plus /> Add
          </Button>
        </div>
      </section>

      {/* Groups */}
      <div className="space-y-6">
        {CATEGORY_NAMES.map((cat) => {
          const items = grouped[cat] ?? [];
          if (items.length === 0) return null;
          const catRemaining = items
            .filter((i) => i.status !== "purchased")
            .reduce((s, i) => s + i.qty * i.estPrice, 0);
          const catPurchased = items
            .filter((i) => i.status === "purchased")
            .reduce((s, i) => s + (i.actualPrice ?? 0), 0);
          return (
            <section key={cat}>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-display text-lg font-semibold text-secondary">{cat}</h2>
                <span className="text-xs text-muted-foreground">
                  ${catPurchased} purchased · ${catRemaining} to go
                </span>
              </div>
              <ul className="space-y-2">
                {items.map((it) => (
                  <ShoppingRow
                    key={it.id}
                    item={it}
                    onStatus={(s) => cycleStatus(it, s)}
                    onRemove={() => removeItem(it.id)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Purchase confirm */}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as purchased</DialogTitle>
            <DialogDescription>
              {confirm && (
                <>
                  {confirm.item.name} · qty {confirm.item.qty} · est $
                  {confirm.item.qty * confirm.item.estPrice}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="actual-price">Actual price paid</Label>
            <Input
              id="actual-price"
              type="number"
              min={0}
              value={confirm?.price ?? ""}
              onChange={(e) =>
                setConfirm((c) => (c ? { ...c, price: e.target.value } : c))
              }
              onKeyDown={(e) => e.key === "Enter" && confirmPurchase()}
            />
            <p className="text-xs text-muted-foreground">
              A single expense will be added to the {confirm?.item.category} category.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="festive" onClick={confirmPurchase}>
              <Check /> Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SumStat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl bg-background/60 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-display text-xl font-semibold ${valueClass ?? "text-secondary"}`}>
        {value}
      </div>
    </div>
  );
}

function ShoppingRow({
  item,
  onStatus,
  onRemove,
}: {
  item: ShoppingItem;
  onStatus: (s: ShoppingItem["status"]) => void;
  onRemove: () => void;
}) {
  const est = item.qty * item.estPrice;
  const priceLabel =
    item.status === "purchased" && item.actualPrice != null
      ? `$${item.actualPrice} paid`
      : `~$${est}`;

  return (
    <li className="group flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
      <div className="flex-1 min-w-[140px]">
        <div className="text-sm font-medium text-secondary">{item.name}</div>
        <div className="text-xs text-muted-foreground">
          Qty {item.qty} · ${item.estPrice} each · {priceLabel}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <StatusChip
          active={item.status === "needed"}
          variant="soft"
          onClick={() => onStatus("needed")}
        >
          Needed
        </StatusChip>
        <StatusChip
          active={item.status === "in-cart"}
          variant="accent"
          onClick={() => onStatus("in-cart")}
        >
          In cart
        </StatusChip>
        <StatusChip
          active={item.status === "purchased"}
          variant="success"
          onClick={() => onStatus("purchased")}
        >
          Purchased
        </StatusChip>
      </div>
      <button
        onClick={onRemove}
        className="text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
        aria-label="Remove item"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

function StatusChip({
  active,
  variant,
  onClick,
  children,
}: {
  active: boolean;
  variant: "soft" | "accent" | "success";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2 py-1 text-[11px] font-semibold transition ${
        active
          ? variant === "success"
            ? "bg-success/15 text-success ring-1 ring-success/40"
            : variant === "accent"
              ? "bg-accent/30 text-secondary ring-1 ring-accent/60"
              : "bg-muted text-secondary ring-1 ring-border"
          : "text-muted-foreground hover:text-secondary"
      }`}
    >
      {children}
    </button>
  );
}
