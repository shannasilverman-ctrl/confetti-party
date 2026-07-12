import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  daysUntil,
  guestCounts,
  progressPct,
  totalSpent,
  useParties,
  OCCASION_LABELS,
  type OccasionType,
} from "@/lib/party-context";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarDays, Users, Wallet, Plus, ArrowRight, Sparkles, PartyPopper } from "lucide-react";

export const Route = createFileRoute("/app")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Your parties · Hostwell" },
      { name: "description", content: "See every party you're hosting, in one calm place." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function Dashboard() {
  const { parties } = useParties();
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <BrandLockup />
          <Button variant="festive" onClick={() => setWizardOpen(true)}>
            <Plus /> New Party
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-secondary">
              Your parties
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {parties.length} in flight — pick one to keep planning.
            </p>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {parties.map((p) => {
            const days = daysUntil(p.date);
            const g = guestCounts(p);
            const spent = totalSpent(p);
            const prog = progressPct(p);
            return (
              <Link
                key={p.id}
                to="/party/$id"
                params={{ id: p.id }}
                className="group flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-card transition hover:-translate-y-1 hover:shadow-elevated"
              >
                <div className="relative h-28 bg-festive p-5">
                  <div className="absolute inset-0 bg-confetti opacity-40 mix-blend-overlay" />
                  <Badge className="relative bg-white/90 text-secondary hover:bg-white">
                    {OCCASION_LABELS[p.occasion]}
                  </Badge>
                  <div className="relative mt-2 text-primary-foreground/90 text-sm">
                    {p.theme}
                  </div>
                </div>
                <div className="flex-1 p-5">
                  <h3 className="font-display text-xl font-semibold text-secondary">{p.name}</h3>
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {new Date(p.date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    <span className="mx-1">·</span>
                    <span className="font-medium text-primary">
                      {days > 0 ? `${days} days to go` : days === 0 ? "Today!" : "Past"}
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-muted/60 p-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Users className="h-3.5 w-3.5" /> Guests
                      </div>
                      <div className="mt-0.5 font-semibold text-secondary">
                        {g.total || p.guestEstimate}
                      </div>
                    </div>
                    <div className="rounded-xl bg-muted/60 p-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Wallet className="h-3.5 w-3.5" /> Budget
                      </div>
                      <div className="mt-0.5 font-semibold text-secondary">
                        ${spent} <span className="text-muted-foreground">/ ${p.budget}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Planning progress</span>
                      <span className="font-semibold text-secondary">{prog}%</span>
                    </div>
                    <Progress value={prog} />
                  </div>

                  <div className="mt-5 flex items-center text-sm font-medium text-primary opacity-0 transition group-hover:opacity-100">
                    Open workspace <ArrowRight className="ml-1 h-4 w-4" />
                  </div>
                </div>
              </Link>
            );
          })}

          <button
            onClick={() => setWizardOpen(true)}
            className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border bg-transparent p-6 text-muted-foreground transition hover:border-primary hover:bg-card hover:text-primary"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Plus className="h-6 w-6" />
            </div>
            <div className="font-display text-lg text-secondary">Start a new party</div>
            <div className="text-xs">3 quick steps</div>
          </button>
        </div>
      </main>

      <NewPartyWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}

const OCCASIONS: { value: OccasionType; label: string; emoji: string }[] = [
  { value: "birthday", label: "Birthday", emoji: "🎂" },
  { value: "baby-shower", label: "Baby Shower", emoji: "🍼" },
  { value: "graduation", label: "Graduation", emoji: "🎓" },
  { value: "holiday", label: "Holiday", emoji: "🎄" },
  { value: "dinner-party", label: "Dinner Party", emoji: "🍷" },
  { value: "other", label: "Other", emoji: "🎉" },
];

const THEMES = [
  "Elegant & Minimal",
  "Boho Garden",
  "Neon Retro",
  "Unicorn Rainbow",
  "Tropical Luau",
  "Cozy Cottagecore",
  "Backyard Casual",
  "Black Tie Glam",
];

function NewPartyWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { createParty } = useParties();
  const navigate = Route.useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [occasion, setOccasion] = useState<OccasionType | null>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [guestEstimate, setGuestEstimate] = useState(20);
  const [budget, setBudget] = useState(500);
  const [theme, setTheme] = useState<string | null>(null);

  function reset() {
    setStep(1);
    setOccasion(null);
    setName("");
    setDate("");
    setGuestEstimate(20);
    setBudget(500);
    setTheme(null);
  }

  function finish() {
    if (!occasion || !date || !theme) return;
    const id = createParty({
      name: name || `New ${OCCASION_LABELS[occasion]}`,
      occasion,
      date,
      guestEstimate,
      budget,
      theme,
    });
    onOpenChange(false);
    reset();
    void navigate({ to: "/party/$id", params: { id } });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-secondary">
            {step === 1 && "What are you hosting?"}
            {step === 2 && "The essentials"}
            {step === 3 && "Pick a vibe"}
          </DialogTitle>
          <div className="mt-2 flex gap-1.5">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={`h-1.5 flex-1 rounded-full transition ${
                  n <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </DialogHeader>

        {step === 1 && (
          <div className="grid grid-cols-2 gap-3 py-4">
            {OCCASIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setOccasion(o.value)}
                className={`rounded-2xl border p-5 text-left transition ${
                  occasion === o.value
                    ? "border-primary bg-primary/5 shadow-card"
                    : "border-border hover:border-primary/40 hover:bg-muted/40"
                }`}
              >
                <div className="text-2xl">{o.emoji}</div>
                <div className="mt-2 font-medium text-secondary">{o.label}</div>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 py-4">
            <div>
              <Label htmlFor="name">Party name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  occasion ? `e.g. Sam's ${OCCASION_LABELS[occasion]}` : "Give it a name"
                }
              />
            </div>
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="guests">Guests (est.)</Label>
                <Input
                  id="guests"
                  type="number"
                  min={1}
                  value={guestEstimate}
                  onChange={(e) => setGuestEstimate(Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="budget">Budget ($)</Label>
                <Input
                  id="budget"
                  type="number"
                  min={0}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid grid-cols-2 gap-3 py-4">
            {THEMES.map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`rounded-2xl border p-4 text-left transition ${
                  theme === t
                    ? "border-primary bg-primary/5 shadow-card"
                    : "border-border hover:border-primary/40 hover:bg-muted/40"
                }`}
              >
                <Sparkles className="h-4 w-4 text-primary" />
                <div className="mt-2 text-sm font-medium text-secondary">{t}</div>
              </button>
            ))}
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => (step === 1 ? onOpenChange(false) : setStep((step - 1) as 1 | 2))}
          >
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          {step < 3 ? (
            <Button
              variant="festive"
              disabled={
                (step === 1 && !occasion) || (step === 2 && (!date || !name))
              }
              onClick={() => setStep((step + 1) as 2 | 3)}
            >
              Continue <ArrowRight />
            </Button>
          ) : (
            <Button variant="festive" disabled={!theme} onClick={finish}>
              <PartyPopper /> Create party
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
