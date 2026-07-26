import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  ExternalLink,
  House,
  MapPinned,
  Pencil,
  Plus,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { EditDetailsDialog } from "@/components/edit-details-dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { celebrate } from "@/components/confetti-burst";
import {
  localPlanningSuggestions,
  locationIsSpecific,
  type LocalPlanningKind,
  type LocalPlanningSuggestion,
} from "@/lib/local-planning";
import {
  LOCAL_SOURCING_STATUS_LABELS,
  localCostContext,
  localSourcingOptions,
  reconcileSourcingDecisionTasks,
  removeLocalSourcingOption,
  selectLocalSourcingOption,
  upsertLocalSourcingOption,
} from "@/lib/local-sourcing";
import { newId, useParties, type TaskAction } from "@/lib/party-context";
import type { LocalSourcingOption, LocalSourcingStatus } from "@/lib/party-intelligence";
import { validateSafeUrl } from "@/lib/safe-url";

type LocalDestination = "theme" | "shopping";

export function LocalSourcingPlanner({
  partyId,
  onNavigate,
}: {
  partyId: string;
  onNavigate: (tab: LocalDestination | TaskAction) => void;
}) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId)!;
  const suggestions = localPlanningSuggestions(party);
  const options = localSourcingOptions(party.planningProfile);
  const [editing, setEditing] = useState<LocalSourcingOption | null>(null);
  const [seed, setSeed] = useState<LocalPlanningSuggestion | null>(null);

  const openNew = (suggestion: LocalPlanningSuggestion) => {
    setEditing(null);
    setSeed(suggestion);
  };

  const openEdit = (option: LocalSourcingOption) => {
    setSeed(suggestions.find((suggestion) => suggestion.id === option.suggestionId) ?? null);
    setEditing(option);
  };

  const choose = (option: LocalSourcingOption) => {
    updateParty(party.id, (current) => {
      const currentOptions = localSourcingOptions(current.planningProfile);
      return {
        ...current,
        planningProfile: selectLocalSourcingOption(current.planningProfile, option.id),
        tasks: reconcileSourcingDecisionTasks(current.tasks, currentOptions, option, newId()),
      };
    });
    toast.success(`${option.providerName} is now the working choice—not a claimed booking.`);
    celebrate("micro");
  };

  const remove = (option: LocalSourcingOption) => {
    updateParty(party.id, (current) => ({
      ...current,
      planningProfile: removeLocalSourcingOption(current.planningProfile, option.id),
      tasks: current.tasks.filter((task) => task.sourcingOptionId !== option.id),
    }));
    toast.success("Option removed from this party.");
  };

  return (
    <section
      aria-labelledby="local-planning-title"
      data-testid="local-planning"
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-card"
    >
      <div className="border-b border-border bg-primary/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <MapPinned className="h-4 w-4 text-primary" aria-hidden />
              <h3
                id="local-planning-title"
                className="font-display text-lg font-semibold text-secondary"
              >
                Make it local
              </h3>
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Start with nearby options, bring the finalists back here, and keep the choice, price,
              and follow-through attached to this party.
            </p>
          </div>
          {!locationIsSpecific(party.location) && (
            <EditDetailsDialog partyId={party.id} triggerLabel="Add city or ZIP" />
          )}
        </div>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-3">
        {suggestions.map((suggestion) => {
          const tracked = options.filter((option) => option.suggestionId === suggestion.id);
          return (
            <article key={suggestion.id} className="flex flex-col bg-card p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <LocalPlanningIcon kind={suggestion.kind} />
              </div>
              <h4 className="mt-3 font-display text-base font-semibold text-secondary">
                {suggestion.title}
              </h4>
              <p className="mt-1 flex-1 text-sm leading-6 text-muted-foreground">
                {suggestion.reason}
              </p>
              <div className="mt-4 grid gap-2">
                {suggestion.searchUrl && suggestion.searchLabel ? (
                  <>
                    <Button asChild variant="outline" size="sm" className="min-h-11">
                      <a
                        href={suggestion.searchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                      >
                        {suggestion.searchLabel} <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                    <Button
                      type="button"
                      variant={tracked.length ? "ghost" : "secondary"}
                      size="sm"
                      className="min-h-11"
                      onClick={() => openNew(suggestion)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {tracked.length
                        ? `Add another · ${tracked.length} saved`
                        : "Save an option to compare"}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    onClick={() => onNavigate(suggestion.action ?? "theme")}
                  >
                    {suggestion.action === "shopping" ? "Open the list" : "Build this version"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {options.length > 0 && (
        <div
          className="border-t border-border bg-muted/20 p-4 sm:p-5"
          data-testid="local-sourcing-shortlist"
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Your local shortlist
              </div>
              <h4 className="mt-1 font-display text-lg font-semibold text-secondary">
                Compare only what matters
              </h4>
            </div>
            <span className="text-xs text-muted-foreground">
              Host-entered · verify directly with each provider
            </span>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {options.map((option) => (
              <SourcingOptionCard
                key={option.id}
                option={option}
                budget={party.budget}
                onChoose={() => choose(option)}
                onEdit={() => openEdit(option)}
                onRemove={() => remove(option)}
                onOpenBudget={() => onNavigate("budget")}
              />
            ))}
          </div>
        </div>
      )}

      <p className="border-t border-border px-5 py-3 text-[11px] leading-5 text-muted-foreground">
        Search results are not endorsements. Confetti does not verify ratings, pricing,
        availability, insurance, policies, or bookings. Confirm every material detail directly.
      </p>

      <SourcingOptionDialog
        key={`${seed?.id ?? "closed"}:${editing?.id ?? "new"}`}
        open={seed != null}
        suggestion={seed}
        option={editing}
        onOpenChange={(open) => {
          if (!open) {
            setSeed(null);
            setEditing(null);
          }
        }}
        onSave={(option) => {
          updateParty(party.id, (current) => ({
            ...current,
            planningProfile: upsertLocalSourcingOption(current.planningProfile, option),
            tasks: current.tasks.map((task) =>
              task.sourcingOptionId === option.id
                ? {
                    ...task,
                    title: `Confirm ${option.providerName}: availability, inclusions, and final price`,
                  }
                : task,
            ),
          }));
          setSeed(null);
          setEditing(null);
          toast.success(editing ? "Local option updated." : "Local option saved for comparison.");
        }}
      />
    </section>
  );
}

function SourcingOptionCard({
  option,
  budget,
  onChoose,
  onEdit,
  onRemove,
  onOpenBudget,
}: {
  option: LocalSourcingOption;
  budget: number;
  onChoose: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onOpenBudget: () => void;
}) {
  const cost = localCostContext(option.cost, budget);
  const href = option.url ? validateSafeUrl(option.url) : null;
  return (
    <article
      className={`rounded-2xl border bg-card p-4 ${
        option.selected ? "border-primary/40 ring-1 ring-primary/15" : "border-border"
      }`}
      data-testid={`local-sourcing-option-${option.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h5 className="font-semibold text-secondary">{option.providerName}</h5>
            {option.selected && <Badge variant="success">Working choice</Badge>}
            <Badge variant="soft">{LOCAL_SOURCING_STATUS_LABELS[option.status]}</Badge>
          </div>
          {cost && (
            <p className="mt-1 text-sm font-medium text-secondary">
              {cost}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                · {option.costBasis === "vendor-quote" ? "host-recorded quote" : "host estimate"}
              </span>
            </p>
          )}
          {option.notes && (
            <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
              {option.notes}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" className="min-h-11 min-w-11" onClick={onEdit}>
            <Pencil className="h-4 w-4" aria-hidden />
            <span className="sr-only">Edit {option.providerName}</span>
          </Button>
          <ConfirmDelete
            mode="confirm"
            itemLabel={option.providerName}
            title={`Remove ${option.providerName} from the shortlist?`}
            description="This removes the saved option and its linked confirmation task. It does not contact the provider."
            onConfirm={onRemove}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                <span className="sr-only">Remove {option.providerName}</span>
              </Button>
            }
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {!option.selected && (
          <Button type="button" variant="festive" size="sm" className="min-h-11" onClick={onChoose}>
            <Check className="h-4 w-4" /> Make working choice
          </Button>
        )}
        {href?.ok && (
          <Button asChild variant="outline" size="sm" className="min-h-11">
            <a
              href={href.url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              Open provider <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
        {option.status === "booked" && (
          <Button variant="ghost" size="sm" className="min-h-11" onClick={onOpenBudget}>
            Record payment <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {option.selected && (
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          Confetti added a confirmation task. This does not contact or book the provider.
        </p>
      )}
    </article>
  );
}

function SourcingOptionDialog({
  open,
  suggestion,
  option,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  suggestion: LocalPlanningSuggestion | null;
  option: LocalSourcingOption | null;
  onOpenChange: (open: boolean) => void;
  onSave: (option: LocalSourcingOption) => void;
}) {
  const [providerName, setProviderName] = useState(option?.providerName ?? "");
  const [url, setUrl] = useState(option?.url ?? "");
  const [cost, setCost] = useState(option?.cost != null ? String(option.cost) : "");
  const [costBasis, setCostBasis] = useState<"host-estimate" | "vendor-quote">(
    option?.costBasis ?? "host-estimate",
  );
  const [status, setStatus] = useState<LocalSourcingStatus>(option?.status ?? "considering");
  const [notes, setNotes] = useState(option?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const parsedCost = useMemo(() => (cost.trim() ? Number(cost) : undefined), [cost]);

  const save = () => {
    if (!suggestion || suggestion.kind === "at-home") return;
    const name = providerName.trim();
    if (!name) {
      setError("Add the business or provider name.");
      return;
    }
    const safeUrl = url.trim() ? validateSafeUrl(url) : null;
    if (safeUrl && !safeUrl.ok) {
      setError(safeUrl.error);
      return;
    }
    if (
      parsedCost != null &&
      (!Number.isFinite(parsedCost) || parsedCost < 0 || parsedCost > 1_000_000)
    ) {
      setError("Enter a cost between $0 and $1,000,000.");
      return;
    }
    setError(null);
    onSave({
      id: option?.id ?? newId(),
      suggestionId: suggestion.id,
      kind: suggestion.kind,
      providerName: name.slice(0, 100),
      status,
      ...(safeUrl?.ok ? { url: safeUrl.url } : {}),
      ...(parsedCost != null ? { cost: parsedCost, costBasis } : {}),
      ...(notes.trim() ? { notes: notes.trim().slice(0, 300) } : {}),
      ...(option?.selected ? { selected: true } : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-secondary">
            {option ? "Update this option" : "Save a local option"}
          </DialogTitle>
          <DialogDescription>
            Keep the useful facts from your search together. Everything here comes from you—not live
            Confetti inventory.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="sourcing-provider">Business or provider</Label>
            <Input
              id="sourcing-provider"
              value={providerName}
              onChange={(event) => setProviderName(event.target.value)}
              maxLength={100}
              placeholder="e.g. Flying Squirrel"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sourcing-url">Website or listing (optional)</Label>
            <Input
              id="sourcing-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              inputMode="url"
              autoComplete="off"
              placeholder="https://…"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sourcing-cost">Cost (optional)</Label>
              <Input
                id="sourcing-cost"
                type="number"
                min={0}
                max={1_000_000}
                step="0.01"
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                placeholder="325"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sourcing-cost-basis">What is that number?</Label>
              <Select
                value={costBasis}
                onValueChange={(value) => setCostBasis(value as "host-estimate" | "vendor-quote")}
                disabled={!cost.trim()}
              >
                <SelectTrigger id="sourcing-cost-basis" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="host-estimate">My estimate</SelectItem>
                  <SelectItem value="vendor-quote">Vendor quote</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sourcing-status">Where it stands</Label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as LocalSourcingStatus)}
            >
              <SelectTrigger id="sourcing-status" className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LOCAL_SOURCING_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sourcing-notes">What matters in the decision? (optional)</Label>
            <Textarea
              id="sourcing-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={300}
              placeholder="Package includes cleanup; confirm sibling fee and outside cake policy."
            />
            <p className="text-[11px] text-muted-foreground">
              Capture package fit, fees, accessibility, cancellation, or one concern—not a full
              message thread.
            </p>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="festive" onClick={save}>
            {option ? "Save changes" : "Add to shortlist"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LocalPlanningIcon({ kind }: { kind: LocalPlanningKind }) {
  if (kind === "food") return <UtensilsCrossed className="h-4 w-4" aria-hidden />;
  if (kind === "at-home") return <House className="h-4 w-4" aria-hidden />;
  return <MapPinned className="h-4 w-4" aria-hidden />;
}
