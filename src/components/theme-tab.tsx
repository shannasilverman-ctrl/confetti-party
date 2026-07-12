import { useState } from "react";
import { newId, useParties, type OccasionType } from "@/lib/party-context";
import { themeById, themesForOccasion, type DecorIdea, type Theme } from "@/lib/themes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Plus, Sparkles, DoorOpen, Utensils, Gamepad2, Camera } from "lucide-react";
import { toast } from "sonner";


export function ThemeTab({ partyId }: { partyId: string }) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId)!;
  const gallery = themesForOccasion(party.occasion);
  const activeTheme = themeById(party.themeId);
  const [pendingAdds, setPendingAdds] = useState<Set<string>>(new Set());

  function selectTheme(t: Theme) {
    updateParty(partyId, (p) => ({ ...p, themeId: t.id, theme: t.name }));
    setPendingAdds(new Set());
  }

  function addIdeaToChecklist(idea: DecorIdea, key: string) {
    updateParty(partyId, (p) => ({
      ...p,
      tasks: [
        ...p.tasks,
        {
          id: newId(),
          title: `${idea.kind === "DIY" ? "DIY: " : ""}${idea.title}`,
          bucket: idea.bucket,
          done: false,
        },
      ],
    }));
    setPendingAdds((s) => new Set(s).add(key));
    toast.success("Added to checklist", { description: idea.title });
  }

  if (gallery.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
        <div className="font-display text-lg text-secondary">
          No themes yet for {party.occasion}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          More theme collections are on the way.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Gallery */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold text-secondary">Theme gallery</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Curated for {occasionLabel(party.occasion)}. Pick one to build your vision board.
            </p>
          </div>
          {activeTheme && (
            <Badge variant="accent" className="hidden sm:inline-flex">
              Current: {activeTheme.name}
            </Badge>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gallery.map((t) => {
            const selected = t.id === activeTheme?.id;
            return (
              <button
                key={t.id}
                onClick={() => selectTheme(t)}
                className={`group overflow-hidden rounded-2xl border bg-card text-left shadow-card transition hover:-translate-y-1 hover:shadow-elevated ${
                  selected ? "border-primary ring-2 ring-primary/30" : "border-border"
                }`}
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                  <img
                    src={t.heroImage}
                    alt={t.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                  {selected && (
                    <div className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-card">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="font-display text-lg font-semibold text-secondary">{t.name}</div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.vibe}</p>
                  <div className="mt-3 flex gap-1.5">
                    {t.palette.map((c, i) => (
                      <span
                        key={i}
                        className="h-5 w-5 rounded-full border border-border"
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

      {/* Vision Board */}
      {activeTheme && (
        <>
          <section>
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="font-display text-2xl font-semibold text-secondary">
                Vision board · {activeTheme.name}
              </h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <VisionTile label="Table setting" src={activeTheme.visionBoard.table} />
              <VisionTile label="Decor setup" src={activeTheme.visionBoard.decor} />
              <VisionTile label="Dessert table" src={activeTheme.visionBoard.dessert} />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
              {/* Decor ideas */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold text-secondary">
                    Decor ideas
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {activeTheme.decorIdeas.length} ideas · tap to add
                  </span>
                </div>
                <ul className="space-y-2">
                  {activeTheme.decorIdeas.map((idea, i) => {
                    const key = `${activeTheme.id}-${i}`;
                    const added = pendingAdds.has(key);
                    return (
                      <li
                        key={key}
                        className="flex items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2"
                      >
                        <Badge
                          variant={idea.kind === "DIY" ? "accent" : "soft"}
                          className="w-11 justify-center"
                        >
                          {idea.kind}
                        </Badge>
                        <span className="flex-1 text-sm text-secondary">{idea.title}</span>
                        <span className="hidden text-[11px] text-muted-foreground sm:inline">
                          {idea.bucket}
                        </span>
                        <Button
                          size="sm"
                          variant={added ? "ghost" : "outline"}
                          disabled={added}
                          onClick={() => addIdeaToChecklist(idea, key)}
                        >
                          {added ? (
                            <>
                              <Check className="h-3.5 w-3.5" /> Added
                            </>
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5" /> Add
                            </>
                          )}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Palette + tips */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
                  <h3 className="font-display text-lg font-semibold text-secondary">Palette</h3>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {activeTheme.palette.map((c, i) => (
                      <div key={i} className="space-y-1">
                        <div
                          className="aspect-square rounded-xl border border-border"
                          style={{ backgroundColor: c }}
                        />
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Swatch {i + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
                  <h3 className="font-display text-lg font-semibold text-secondary">
                    Styling tips
                  </h3>
                  <ul className="mt-3 space-y-2 text-sm text-secondary">
                    {activeTheme.stylingTips.map((tip, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Setup Plan */}
          <section>
            <div className="mb-4">
              <h2 className="font-display text-2xl font-semibold text-secondary">Setup plan</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Four zones to build in the {activeTheme.name.toLowerCase()} style.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {activeTheme.setup.map((z) => {
                const Icon = zoneIcon(z.key);
                return (
                  <div
                    key={z.key}
                    className="rounded-2xl border border-border bg-card p-5 shadow-card"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <h3 className="font-display text-base font-semibold text-secondary">
                            {z.label}
                          </h3>
                          <span className="text-xs font-medium text-primary">
                            Start {z.minutesBefore} min before guests
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-secondary/90">{z.instruction}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function VisionTile({ label, src }: { label: string; src: string }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="aspect-square overflow-hidden bg-muted">
        <img src={src} alt={label} loading="lazy" className="h-full w-full object-cover" />
      </div>
      <figcaption className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </figcaption>
    </figure>
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

function occasionLabel(o: OccasionType): string {
  return o.replace("-", " ");
}

// Used by workspace to know bucket type is exported
export type { Bucket };
export { BUCKETS };
