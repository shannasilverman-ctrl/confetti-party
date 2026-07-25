import { useMemo, useState } from "react";
import {
  newId,
  useParties,
  addShoppingItem,
  addThemeToShopping,
  togglePin,
  OCCASION_LABELS,
} from "@/lib/party-context";
import { themeById, themesForOccasion, type DecorIdea, type Theme } from "@/lib/themes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Check,
  Plus,
  Sparkles,
  DoorOpen,
  Utensils,
  Gamepad2,
  Camera,
  ShoppingCart,
  Pin,
  // Pin used for both states, color differentiates.
  ExternalLink,
  ShoppingBag,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { celebrate, celebrateAtEvent } from "@/components/confetti-burst";
import { amazonSearchUrl, targetSearchUrl, walmartSearchUrl } from "@/lib/affiliates";
import { ProductTiles } from "@/components/product-tiles";

type TileKey = "table" | "decor" | "dessert" | "entry" | "activity" | "photoSpot";

const TILE_LABELS: Record<TileKey, string> = {
  table: "Table setting",
  decor: "Decor setup",
  dessert: "Dessert table",
  entry: "Entry moment",
  activity: "Activity zone",
  photoSpot: "Photo spot",
};

function tileImage(theme: Theme, key: TileKey): string {
  if (key === "table") return theme.visionBoard.table;
  if (key === "decor") return theme.visionBoard.decor;
  if (key === "dessert") return theme.visionBoard.dessert;
  if (theme.inspiration) return theme.inspiration[key];
  // Fallback: rotate through vision board when inspiration images not generated yet.
  const pool = [theme.visionBoard.decor, theme.visionBoard.table, theme.visionBoard.dessert];
  return pool[key === "entry" ? 0 : key === "activity" ? 1 : 2];
}

function ideaThumb(theme: Theme, idea: DecorIdea): string {
  const t = idea.title.toLowerCase();
  if (/(cake|cookie|dessert|cupcake|treat|favor|candy)/.test(t)) return theme.visionBoard.dessert;
  if (/(table|runner|tablecloth|napkin|plate|linen|centerpiece)/.test(t))
    return theme.visionBoard.table;
  return theme.visionBoard.decor;
}

export function ThemeTab({ partyId }: { partyId: string }) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId)!;
  const gallery = themesForOccasion(party.occasion);
  const activeTheme = themeById(party.themeId);

  const [lightbox, setLightbox] = useState<TileKey | null>(null);
  const [bundleOpen, setBundleOpen] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<{
    theme: Theme;
    origin?: { x: number; y: number };
  } | null>(null);

  function selectTheme(t: Theme, e?: React.MouseEvent) {
    if (party.themeId === t.id) return;
    const origin = e ? { x: e.clientX, y: e.clientY } : undefined;
    // First-time selection (no active theme yet): commit immediately.
    if (!activeTheme) {
      updateParty(partyId, (p) => ({ ...p, themeId: t.id, theme: t.name }));
      if (e) celebrateAtEvent("small", e);
      return;
    }
    setPendingSwitch({ theme: t, origin });
  }

  function confirmSwitch() {
    if (!pendingSwitch) return;
    const t = pendingSwitch.theme;
    updateParty(partyId, (p) => ({ ...p, themeId: t.id, theme: t.name }));
    celebrate("small", pendingSwitch.origin);
    setPendingSwitch(null);
  }

  function addDiyToChecklist(idea: DecorIdea) {
    const title = `DIY: ${idea.title}`;
    updateParty(partyId, (p) => ({
      ...p,
      tasks: [...p.tasks, { id: newId(), title, bucket: idea.bucket, done: false }],
    }));
    toast.success("Added to checklist", { description: idea.title });
  }

  function addBuyToShopping(idea: DecorIdea) {
    if (idea.estPrice <= 0) return;
    updateParty(partyId, (p) =>
      addShoppingItem(p, {
        name: idea.title,
        category: "Decorations",
        qty: 1,
        estPrice: idea.estPrice,
      }),
    );
    toast.success("In cart", { description: idea.title });
  }

  function togglePinTile(key: TileKey) {
    if (!activeTheme) return;
    const pinId = `${activeTheme.id}:${key}`;
    updateParty(partyId, (p) => togglePin(p, pinId));
  }

  const shoppingNames = useMemo(
    () => new Set(party.shoppingItems.map((i) => i.name)),
    [party.shoppingItems],
  );
  const taskTitles = useMemo(() => new Set(party.tasks.map((t) => t.title)), [party.tasks]);
  const isAdded = (idea: DecorIdea) =>
    idea.kind === "Buy"
      ? idea.estPrice <= 0 || shoppingNames.has(idea.title)
      : taskTitles.has(`DIY: ${idea.title}`);

  // Bundle stats for the active theme
  const bundleStats = useMemo(() => {
    if (!activeTheme) return { toAdd: [] as DecorIdea[], alreadyIn: 0, estTotal: 0 };
    const buys = activeTheme.decorIdeas.filter((i) => i.kind === "Buy" && i.estPrice > 0);
    const toAdd = buys.filter((i) => !shoppingNames.has(i.title));
    const alreadyIn = buys.length - toAdd.length;
    const estTotal = toAdd.reduce((s, i) => s + i.estPrice, 0);
    return { toAdd, alreadyIn, estTotal };
  }, [activeTheme, shoppingNames]);

  const diyStats = useMemo(() => {
    if (!activeTheme) return { toAdd: [] as DecorIdea[] };
    const diys = activeTheme.decorIdeas.filter((i) => i.kind === "DIY");
    const toAdd = diys.filter((i) => !taskTitles.has(`DIY: ${i.title}`));
    return { toAdd };
  }, [activeTheme, taskTitles]);

  function openBundle() {
    if (bundleStats.toAdd.length === 0) {
      toast("Everything from this theme is already in your list");
      return;
    }
    setBundleOpen(true);
  }

  function confirmBundle(e?: React.MouseEvent) {
    if (!activeTheme) return;
    let addedCount = 0;
    let estTotal = 0;
    updateParty(partyId, (p) => {
      const r = addThemeToShopping(p, activeTheme);
      addedCount = r.added;
      estTotal = r.estTotal;
      return r.party;
    });
    if (e) celebrateAtEvent("small", e);
    else celebrate("small");
    toast.success(`Added ${addedCount} items · $${estTotal}`, {
      description: `To ${TILE_LABELS.decor.toLowerCase()} shopping list`,
    });
    setBundleOpen(false);
  }

  function addAllDiys() {
    if (!activeTheme || diyStats.toAdd.length === 0) {
      toast("All DIY ideas are already on your checklist");
      return;
    }
    updateParty(partyId, (p) => ({
      ...p,
      tasks: [
        ...p.tasks,
        ...diyStats.toAdd.map((idea) => ({
          id: newId(),
          title: `DIY: ${idea.title}`,
          bucket: idea.bucket,
          done: false,
        })),
      ],
    }));
    toast.success(`Added ${diyStats.toAdd.length} DIY tasks to checklist`);
  }

  if (gallery.length === 0) {
    const label = OCCASION_LABELS[party.occasion];
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
        <div className="font-display text-lg text-secondary">
          Themes for {label} are coming soon
        </div>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          You can keep planning — your checklist, guests, budget, and shopping list all work without
          a theme. Décor themes for watch parties and cookouts land next.
        </p>
      </div>
    );
  }

  const tiles: TileKey[] = ["table", "decor", "dessert", "entry", "activity", "photoSpot"];
  const pinnedForTheme = activeTheme
    ? party.pinnedInspiration.filter((id) => id.startsWith(`${activeTheme.id}:`))
    : [];

  return (
    <div className="space-y-10">
      {/* Theme picker strip */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-secondary">
              {activeTheme ? "Browse other themes" : "Pick a theme"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Curated for {OCCASION_LABELS[party.occasion]}
            </p>
          </div>
        </div>
        <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          {gallery.map((t) => {
            const selected = t.id === activeTheme?.id;
            return (
              <button
                key={t.id}
                onClick={(e) => selectTheme(t, e)}
                className={`group relative w-40 shrink-0 overflow-hidden rounded-2xl border bg-card text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-elevated ${
                  selected ? "border-primary ring-2 ring-primary/30" : "border-border"
                }`}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                  <img
                    src={t.heroImage}
                    alt={t.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                  {selected && (
                    <div className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-card">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <div className="truncate font-display text-sm font-semibold text-secondary">
                    {t.name}
                  </div>
                  <div className="mt-1 flex gap-1">
                    {t.palette.map((c, i) => (
                      <span
                        key={i}
                        className="h-3 w-3 rounded-full border border-border"
                        style={{ backgroundColor: c }}
                        aria-hidden
                      />
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {activeTheme && (
        <>
          {/* Product hero */}
          <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
            <div className="grid gap-0 md:grid-cols-[1.1fr_1fr]">
              <div className="relative aspect-[4/3] overflow-hidden bg-muted md:aspect-auto">
                <img
                  src={activeTheme.heroImage}
                  alt={activeTheme.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex flex-col gap-4 p-5 sm:p-7">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="accent">{OCCASION_LABELS[party.occasion]}</Badge>
                    <Badge variant="soft">{activeTheme.decorIdeas.length} ideas</Badge>
                  </div>
                  <h1 className="mt-2 font-display text-2xl font-semibold text-secondary sm:text-3xl">
                    {activeTheme.name}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">{activeTheme.vibe}</p>
                </div>

                <div className="flex gap-1.5">
                  {activeTheme.palette.map((c, i) => (
                    <span
                      key={i}
                      className="h-6 w-6 rounded-full border border-border"
                      style={{ backgroundColor: c }}
                      aria-hidden
                    />
                  ))}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="festive"
                    onClick={openBundle}
                    disabled={bundleStats.toAdd.length === 0}
                  >
                    <ShoppingBag />
                    {bundleStats.toAdd.length > 0
                      ? `Shop this theme — $${bundleStats.estTotal}`
                      : "Everything's in your cart"}
                  </Button>
                  <Button variant="outline" onClick={addAllDiys}>
                    <ListChecks />
                    {diyStats.toAdd.length > 0
                      ? `Add ${diyStats.toAdd.length} DIYs to checklist`
                      : "All DIYs added"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {bundleStats.alreadyIn} of {bundleStats.alreadyIn + bundleStats.toAdd.length}{" "}
                  shoppable items already in your list.
                </p>
              </div>
            </div>
          </section>

          {/* Your pins */}
          {pinnedForTheme.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <Pin className="h-3.5 w-3.5 text-primary" />
                <h3 className="font-display text-sm font-semibold text-secondary">Your pins</h3>
              </div>
              <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
                {pinnedForTheme.map((pinId) => {
                  const key = pinId.split(":")[1] as TileKey;
                  if (!TILE_LABELS[key]) return null;
                  return (
                    <figure
                      key={pinId}
                      className="group relative w-24 shrink-0 overflow-hidden rounded-xl border border-border bg-card shadow-card"
                    >
                      <button
                        type="button"
                        onClick={() => setLightbox(key)}
                        className="block aspect-square w-full overflow-hidden"
                        aria-label={`View ${TILE_LABELS[key]}`}
                      >
                        <img
                          src={tileImage(activeTheme, key)}
                          alt={TILE_LABELS[key]}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePinTile(key)}
                        aria-label={`Unpin ${TILE_LABELS[key]}`}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card/90 text-[10px] font-semibold text-secondary opacity-0 shadow-card transition group-hover:opacity-100 hover:border-primary hover:text-primary focus:opacity-100"
                      >
                        ×
                      </button>
                      <figcaption className="truncate px-1.5 py-1 text-[10px] font-medium text-secondary">
                        {TILE_LABELS[key]}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </section>
          )}

          {/* Inspiration board */}
          <section>
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="font-display text-2xl font-semibold text-secondary">
                Inspiration board
              </h2>
              {pinnedForTheme.length > 0 && (
                <Badge variant="accent" className="ml-1">
                  {pinnedForTheme.length} pinned
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {tiles.map((key, i) => {
                const src = tileImage(activeTheme, key);
                const pinId = `${activeTheme.id}:${key}`;
                const pinned = party.pinnedInspiration.includes(pinId);
                // masonry-ish: make every 5th tile taller
                const tall = i === 1 || i === 4;
                return (
                  <figure
                    key={key}
                    className={`group relative overflow-hidden rounded-2xl border border-border bg-card shadow-card ${
                      tall ? "row-span-2 aspect-[3/5]" : "aspect-square"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setLightbox(key)}
                      className="absolute inset-0 h-full w-full"
                      aria-label={`View ${TILE_LABELS[key]}`}
                    >
                      <img
                        src={src}
                        alt={TILE_LABELS[key]}
                        loading="lazy"
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePinTile(key);
                      }}
                      className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border shadow-card transition ${
                        pinned
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card/90 text-secondary hover:border-primary hover:text-primary"
                      }`}
                      aria-label={pinned ? "Unpin" : "Pin"}
                    >
                      <Pin className="h-4 w-4" />
                    </button>
                    <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-white">
                      {TILE_LABELS[key]}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </section>

          {/* Decor ideas as product tiles */}
          <section>
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-semibold text-secondary">
                  Shop the details
                </h2>
                <p className="text-sm text-muted-foreground">
                  Real ideas from the {activeTheme.name.toLowerCase()} look. Tap Add to cart.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeTheme.decorIdeas.map((idea, i) => (
                <IdeaCard
                  key={`${activeTheme.id}-${i}`}
                  theme={activeTheme}
                  idea={idea}
                  added={isAdded(idea)}
                  onAddBuy={() => addBuyToShopping(idea)}
                  onAddDiy={() => addDiyToChecklist(idea)}
                />
              ))}
            </div>
          </section>

          {/* Styling tips + Setup plan */}
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="font-display text-lg font-semibold text-secondary">Styling tips</h3>
              <ul className="mt-3 space-y-2 text-sm text-secondary">
                {activeTheme.stylingTips.map((tip, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="font-display text-lg font-semibold text-secondary">Setup plan</h3>
              <ul className="mt-3 space-y-3">
                {activeTheme.setup.map((z) => {
                  const Icon = zoneIcon(z.key);
                  return (
                    <li key={z.key} className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-sm font-semibold text-secondary">{z.label}</span>
                          <span className="text-[11px] text-primary">
                            {z.minutesBefore} min before
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-secondary/90">{z.instruction}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          {/* Lightbox */}
          <Dialog open={lightbox !== null} onOpenChange={(o) => !o && setLightbox(null)}>
            <DialogContent className="max-w-2xl overflow-hidden p-0">
              {lightbox && (
                <>
                  <div className="aspect-video overflow-hidden bg-muted">
                    <img
                      src={tileImage(activeTheme, lightbox)}
                      alt={TILE_LABELS[lightbox]}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 p-4">
                    <div>
                      <div className="font-display text-lg font-semibold text-secondary">
                        {TILE_LABELS[lightbox]}
                      </div>
                      <div className="text-xs text-muted-foreground">{activeTheme.name}</div>
                    </div>
                    <Button
                      variant={
                        party.pinnedInspiration.includes(`${activeTheme.id}:${lightbox}`)
                          ? "festive"
                          : "outline"
                      }
                      size="sm"
                      onClick={() => togglePinTile(lightbox)}
                    >
                      <Pin className="h-4 w-4" />
                      {party.pinnedInspiration.includes(`${activeTheme.id}:${lightbox}`)
                        ? "Pinned"
                        : "Pin this look"}
                    </Button>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>

          {/* Shop-the-theme confirmation */}
          <Dialog open={bundleOpen} onOpenChange={setBundleOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Shop this theme</DialogTitle>
                <DialogDescription>
                  Add {bundleStats.toAdd.length} items · est ${bundleStats.estTotal} to your
                  shopping list. DIYs stay off the cart.
                </DialogDescription>
              </DialogHeader>
              <ul className="max-h-[45vh] space-y-1.5 overflow-y-auto rounded-xl border border-border bg-background/60 p-3 text-sm">
                {bundleStats.toAdd.map((idea) => (
                  <li key={idea.title} className="flex items-center justify-between gap-3">
                    <span className="text-secondary">{idea.title}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      ${idea.estPrice}
                    </span>
                  </li>
                ))}
              </ul>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setBundleOpen(false)}>
                  Cancel
                </Button>
                <Button variant="festive" onClick={confirmBundle}>
                  <ShoppingCart /> Add all
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Switch-theme confirmation */}
          <Dialog open={pendingSwitch !== null} onOpenChange={(o) => !o && setPendingSwitch(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Switch to {pendingSwitch?.theme.name}?</DialogTitle>
                <DialogDescription>
                  Your guests, budget, checklist, and shopping list stay exactly as they are. Only
                  the vision board, décor ideas, and theme suggestions update.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setPendingSwitch(null)}>
                  Cancel
                </Button>
                <Button variant="festive" onClick={confirmSwitch}>
                  Use this theme
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function IdeaCard({
  theme,
  idea,
  added,
  onAddBuy,
  onAddDiy,
}: {
  theme: Theme;
  idea: DecorIdea;
  added: boolean;
  onAddBuy: () => void;
  onAddDiy: () => void;
}) {
  const isBuy = idea.kind === "Buy";
  const thumb = ideaThumb(theme, idea);
  const query = `${idea.title} ${theme.name} party`;
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition hover:-translate-y-0.5 hover:shadow-elevated">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={thumb}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition group-hover:scale-105"
        />
        <Badge variant={isBuy ? "soft" : "accent"} className="absolute left-2 top-2">
          {idea.kind}
        </Badge>
        {isBuy && idea.estPrice > 0 && (
          <div className="absolute right-2 top-2 rounded-full bg-card/95 px-2.5 py-1 text-xs font-semibold text-secondary shadow-card">
            ${idea.estPrice}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="text-sm font-medium text-secondary">{idea.title}</div>
        <div className="text-[11px] text-muted-foreground">{idea.bucket}</div>
        <div className="mt-auto flex flex-wrap items-center gap-2">
          {isBuy ? (
            <Button
              size="sm"
              variant={added ? "ghost" : "festive"}
              onClick={onAddBuy}
              disabled={added || idea.estPrice <= 0}
              className="flex-1"
            >
              {added ? (
                <>
                  <Check className="h-3.5 w-3.5" /> In cart
                </>
              ) : (
                <>
                  <ShoppingCart className="h-3.5 w-3.5" /> Add to cart
                </>
              )}
            </Button>
          ) : (
            <Button
              size="sm"
              variant={added ? "ghost" : "outline"}
              onClick={onAddDiy}
              disabled={added}
              className="flex-1"
            >
              {added ? (
                <>
                  <Check className="h-3.5 w-3.5" /> On checklist
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" /> Add to checklist
                </>
              )}
            </Button>
          )}
        </div>
        {isBuy && (
          <>
            <ProductTiles
              query={query}
              limit={3}
              emptyFallback={
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <RetailerChip label="Amazon" href={amazonSearchUrl(query)} />
                  <RetailerChip label="Target" href={targetSearchUrl(query)} />
                  <RetailerChip label="Walmart" href={walmartSearchUrl(query)} />
                </div>
              }
            />
          </>
        )}
      </div>
    </article>
  );
}

function RetailerChip({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-secondary transition hover:border-primary hover:text-primary"
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function zoneIcon(key: "entry" | "food" | "activity" | "photo") {
  switch (key) {
    case "entry":
      return DoorOpen;
    case "food":
      return Utensils;
    case "activity":
      return Gamepad2;
    case "photo":
      return Camera;
  }
}
