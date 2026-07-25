import { useMemo, useState } from "react";
import {
  addShoppingItem,
  markShoppingPurchased,
  removeShoppingItem,
  setPreferredRetailer,
  setShoppingStatus,
  totalSpent,
  unmarkShoppingPurchased,
  useParties,
  type Retailer,
  type ShoppingCategoryName,
  type ShoppingItem,
  type Party,
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
import { Check, Plus, ShoppingCart, Trash2, AlertTriangle, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { celebrate } from "@/components/confetti-burst";
import {
  amazonSearchUrl,
  targetSearchUrl,
  walmartSearchUrl,
  affiliateDisclosureEnabled,
  AFFILIATE_DISCLOSURE,
} from "@/lib/affiliates";
import { ProductTiles } from "@/components/product-tiles";
import { EmptyState } from "@/components/empty-state";

const RETAILERS: { key: Retailer; label: string }[] = [
  { key: "amazon", label: "Amazon" },
  { key: "target", label: "Target" },
  { key: "walmart", label: "Walmart" },
];

function retailerUrl(retailer: Retailer, query: string): string {
  if (retailer === "target") return targetSearchUrl(query);
  if (retailer === "walmart") return walmartSearchUrl(query);
  return amazonSearchUrl(query);
}

const CATEGORY_NAMES: ShoppingCategoryName[] = [
  "Venue",
  "Food & Drink",
  "Cake & Desserts",
  "Decorations",
  "Entertainment",
  "Favors",
];

function buildQuery(item: ShoppingItem, party: Party): string {
  const themed = item.category === "Decorations" || item.category === "Favors";
  const suffix = themed && party.theme ? `${party.theme} party` : "party";
  const q = `${item.name} ${suffix}`.trim().replace(/\s+/g, " ");
  return q.length > 80 ? q.slice(0, 80).trim() : q;
}

export function ShoppingTab({ partyId }: { partyId: string }) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId)!;
  const spent = totalSpent(party);

  const [confirm, setConfirm] = useState<{ item: ShoppingItem; price: string } | null>(null);
  const [shopOpen, setShopOpen] = useState(false);

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

  const needed = party.shoppingItems.filter((i) => i.status === "needed" || i.status === "in-cart");
  const showDisclosure = affiliateDisclosureEnabled();

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
    const wasOver = projected > party.budget;
    updateParty(partyId, (p) => markShoppingPurchased(p, confirm.item.id, n));
    toast.success("Purchased", { description: `${confirm.item.name} · $${n}` });
    celebrate("small");
    const nextProjected = projected - confirm.item.qty * confirm.item.estPrice + n;
    if (wasOver && nextProjected <= party.budget) {
      toast.success("Back under budget!", {
        description: `Projected $${Math.round(nextProjected)} of $${party.budget}.`,
      });
    }
    setConfirm(null);
  }

  function cycleStatus(item: ShoppingItem, next: ShoppingItem["status"]) {
    if (next === "purchased") {
      openPurchase(item);
      return;
    }
    if (item.status === "purchased") {
      updateParty(partyId, (p) => {
        const cleaned = unmarkShoppingPurchased(p, item.id);
        return next === "needed" ? cleaned : setShoppingStatus(cleaned, item.id, next);
      });
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

  function copyList() {
    const lines = needed.map((i) => `- ${i.name} · qty ${i.qty} · ~$${i.qty * i.estPrice}`);
    const total = needed.reduce((s, i) => s + i.qty * i.estPrice, 0);
    const text = [`${party.name} — shopping list`, ...lines, ``, `Estimated total: $${total}`].join(
      "\n",
    );
    navigator.clipboard.writeText(text).then(
      () => {
        toast.success("List copied");
        celebrate("micro");
      },
      () => toast.error("Copy failed"),
    );
  }

  return (
    <div className="space-y-8">
      {/* Summary */}
      <section
        className={`rounded-2xl border p-5 shadow-card ${
          overBudget ? "border-warning bg-warning/10" : "border-border bg-card"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-semibold text-secondary">Shopping summary</h2>
          {overBudget && (
            <Badge variant="warning">
              <AlertTriangle className="mr-1 h-3 w-3" /> Over budget
            </Badge>
          )}
          <div className="ml-auto">
            <Button
              variant="festive"
              size="sm"
              onClick={() => setShopOpen(true)}
              disabled={needed.length === 0}
            >
              <ShoppingCart /> Open cart ({needed.length})
            </Button>
          </div>
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
          <Input placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} />
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
      {party.shoppingItems.length === 0 ? (
        <EmptyState
          title="Nothing on the list yet"
          body="Add a first item above — decorations, favors, drinks. We'll group by category and track spend against your budget."
        />
      ) : (
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
                      query={buildQuery(it, party)}
                      onStatus={(s) => cycleStatus(it, s)}
                      onRemove={() => removeItem(it.id)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {showDisclosure && (
        <p className="text-center text-xs text-muted-foreground">{AFFILIATE_DISCLOSURE}</p>
      )}

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
              onChange={(e) => setConfirm((c) => (c ? { ...c, price: e.target.value } : c))}
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

      {/* Cart with retailer handoff */}
      <CartDialog
        open={shopOpen}
        onOpenChange={setShopOpen}
        needed={needed}
        party={party}
        onSetRetailer={(id, r) => updateParty(partyId, (p) => setPreferredRetailer(p, id, r))}
        onMarkAllInCart={(ids) =>
          updateParty(partyId, (p) =>
            ids.reduce((acc, id) => setShoppingStatus(acc, id, "in-cart"), p),
          )
        }
        onCopyList={copyList}
        showDisclosure={showDisclosure}
      />
    </div>
  );
}

function CartDialog({
  open,
  onOpenChange,
  needed,
  party,
  onSetRetailer,
  onMarkAllInCart,
  onCopyList,
  showDisclosure,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  needed: ShoppingItem[];
  party: Party;
  onSetRetailer: (id: string, r: Retailer) => void;
  onMarkAllInCart: (ids: string[]) => void;
  onCopyList: () => void;
  showDisclosure: boolean;
}) {
  const grouped = useMemo(() => {
    const g: Record<Retailer, ShoppingItem[]> = { amazon: [], target: [], walmart: [] };
    for (const it of needed) g[it.preferredRetailer ?? "amazon"].push(it);
    return g;
  }, [needed]);

  async function openGroup(retailer: Retailer) {
    const items = grouped[retailer];
    if (items.length === 0) return;
    // First tab opens immediately from the click (preserves the user gesture).
    const first = items[0];
    window.open(retailerUrl(retailer, buildQuery(first, party)), "_blank", "noopener,noreferrer");
    if (items.length === 1) return;
    // Stagger the rest so popup blockers don't swallow them.
    let blocked = false;
    for (let i = 1; i < items.length; i++) {
      await new Promise((r) => setTimeout(r, 180));
      const w = window.open(
        retailerUrl(retailer, buildQuery(items[i], party)),
        "_blank",
        "noopener,noreferrer",
      );
      if (!w) {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      toast("Popups were blocked", {
        description: "Allow popups for Confetti to open every search at once.",
      });
    }
  }

  const totalNeeded = needed.reduce((s, i) => s + i.qty * i.estPrice, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Your cart</DialogTitle>
          <DialogDescription>
            Open every search on your favorite retailer, then mark items Purchased to track them in
            your budget.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {needed.length} item{needed.length === 1 ? "" : "s"} · est ${totalNeeded}
          </span>
          <Button variant="outline" size="sm" onClick={onCopyList}>
            <Copy /> Copy list
          </Button>
        </div>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {RETAILERS.map(({ key, label }) => {
            const items = grouped[key];
            if (items.length === 0) return null;
            const groupEst = items.reduce((s, i) => s + i.qty * i.estPrice, 0);
            return (
              <section key={key} className="rounded-2xl border border-border bg-background/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-display text-sm font-semibold text-secondary">{label}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {items.length} item{items.length === 1 ? "" : "s"} · est ${groupEst}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onMarkAllInCart(items.map((i) => i.id))}
                    >
                      Mark all In cart
                    </Button>
                    <Button size="sm" variant="festive" onClick={() => openGroup(key)}>
                      <ExternalLink /> Open {items.length} on {label}
                    </Button>
                  </div>
                </div>
                <ul className="mt-3 space-y-2">
                  {items.map((it) => (
                    <li key={it.id} className="rounded-xl border border-border bg-card p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-secondary">
                            {it.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Qty {it.qty} · ~${it.qty * it.estPrice} · {it.category}
                          </div>
                        </div>
                        <a
                          href={retailerUrl(
                            it.preferredRetailer ?? "amazon",
                            buildQuery(it, party),
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 rounded-full border border-border bg-background px-2 py-1 text-[11px] font-semibold text-secondary hover:border-primary hover:text-primary"
                        >
                          Open
                        </a>
                      </div>
                      <div className="mt-2 flex gap-1">
                        {RETAILERS.map((r) => {
                          const active = (it.preferredRetailer ?? "amazon") === r.key;
                          return (
                            <button
                              key={r.key}
                              type="button"
                              onClick={() => onSetRetailer(it.id, r.key)}
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                                active
                                  ? "bg-primary text-primary-foreground"
                                  : "border border-border bg-background text-muted-foreground hover:text-primary"
                              }`}
                            >
                              {r.label}
                            </button>
                          );
                        })}
                      </div>
                      <ProductTiles query={buildQuery(it, party)} limit={3} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        {showDisclosure && (
          <p className="text-center text-[11px] text-muted-foreground">{AFFILIATE_DISCLOSURE}</p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      <div
        className={`mt-0.5 font-display text-xl font-semibold ${valueClass ?? "text-secondary"}`}
      >
        {value}
      </div>
    </div>
  );
}

function RetailerButtons({ query }: { query: string }) {
  const links: { label: string; href: string }[] = [
    { label: "Amazon", href: amazonSearchUrl(query) },
    { label: "Target", href: targetSearchUrl(query) },
    { label: "Walmart", href: walmartSearchUrl(query) },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-secondary transition hover:border-primary hover:text-primary"
        >
          {l.label}
          <ExternalLink className="h-3 w-3" />
        </a>
      ))}
    </div>
  );
}

function ShoppingRow({
  item,
  query,
  onStatus,
  onRemove,
}: {
  item: ShoppingItem;
  query: string;
  onStatus: (s: ShoppingItem["status"]) => void;
  onRemove: () => void;
}) {
  const [showShop, setShowShop] = useState(false);
  const est = item.qty * item.estPrice;
  const priceLabel =
    item.status === "purchased" && item.actualPrice != null
      ? `$${item.actualPrice} paid`
      : `~$${est}`;
  const isPurchased = item.status === "purchased";

  return (
    <li className="group rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-center gap-3">
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
        {!isPurchased && (
          <button
            onClick={() => setShowShop((s) => !s)}
            className="rounded-full px-2 py-1 text-[11px] font-semibold text-muted-foreground transition hover:text-primary"
            aria-expanded={showShop}
          >
            {showShop ? "Hide" : "Shop"}
          </button>
        )}
        <button
          onClick={onRemove}
          className="text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
          aria-label="Remove item"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {!isPurchased && showShop && (
        <div className="mt-2 space-y-2">
          <ProductTiles query={query} limit={3} emptyFallback={<RetailerButtons query={query} />} />
          <RetailerButtons query={query} />
        </div>
      )}
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
