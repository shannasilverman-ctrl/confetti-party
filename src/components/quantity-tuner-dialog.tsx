import { useEffect, useState } from "react";
import { Calculator, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useParties } from "@/lib/party-context";
import {
  type FoodRole,
  type FoodServiceStyle,
  type PartyPlanningProfile,
} from "@/lib/party-intelligence";
import { quantityTuningDefaults } from "@/lib/party-quantities";

const FOOD_ROLES: Array<{ value: FoodRole; label: string; detail: string }> = [
  {
    value: "light-bites",
    label: "Cake + light bites",
    detail: "Food does not replace lunch or dinner.",
  },
  {
    value: "full-meal",
    label: "A full meal",
    detail: "Guests will count on this as lunch or dinner.",
  },
  {
    value: "grazing",
    label: "Food throughout",
    detail: "Guests will snack or graze across the gathering.",
  },
];

const DURATIONS = [
  { value: 90, label: "1½ hours" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
  { value: 240, label: "4+ hours" },
] as const;

const SERVICE_STYLES: Array<{
  value: FoodServiceStyle;
  label: string;
  detail: string;
}> = [
  {
    value: "self-serve",
    label: "Self-serve",
    detail: "Buffet, food table, or help-yourself stations.",
  },
  {
    value: "family-style",
    label: "Family-style",
    detail: "Shared dishes passed around a table.",
  },
  {
    value: "served",
    label: "Portioned per guest",
    detail: "Plated, boxed, or otherwise served individually.",
  },
];

export function QuantityTunerDialog({
  partyId,
  triggerLabel = "Sharpen estimate",
}: {
  partyId: string;
  triggerLabel?: string;
}) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId);
  const [open, setOpen] = useState(false);
  const defaults = quantityTuningDefaults({ occasion: party?.occasion });
  const [foodRole, setFoodRole] = useState<FoodRole>(defaults.foodRole);
  const [durationMinutes, setDurationMinutes] = useState(defaults.durationMinutes);
  const [serviceStyle, setServiceStyle] = useState<FoodServiceStyle>(defaults.foodServiceStyle);

  useEffect(() => {
    if (!open || !party) return;
    const nextDefaults = quantityTuningDefaults({ occasion: party.occasion });
    setFoodRole(party.planningProfile?.foodRole ?? nextDefaults.foodRole);
    setDurationMinutes(party.planningProfile?.durationMinutes ?? nextDefaults.durationMinutes);
    setServiceStyle(party.planningProfile?.foodServiceStyle ?? nextDefaults.foodServiceStyle);
  }, [open, party]);

  if (!party) return null;

  const save = () => {
    updateParty(partyId, (current) => ({
      ...current,
      planningProfile: {
        ...(current.planningProfile ?? ({ version: 1 } satisfies PartyPlanningProfile)),
        version: 1,
        foodRole,
        durationMinutes,
        foodServiceStyle: serviceStyle,
      },
    }));
    setOpen(false);
    toast.success("Quantity estimate updated", {
      description: "Confetti recalculated the plan from the details you confirmed.",
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11"
        onClick={() => setOpen(true)}
      >
        <Calculator aria-hidden /> {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-display text-2xl text-secondary">
              Make the quantity estimate yours
            </DialogTitle>
            <DialogDescription>
              Three quick choices replace Confetti&apos;s starting assumptions. You can change them
              anytime.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 space-y-5 overflow-y-auto py-2 pr-1">
            <ChoiceGroup
              legend="What role does the food play?"
              options={FOOD_ROLES}
              selected={foodRole}
              onSelect={(value) => setFoodRole(value as FoodRole)}
            />

            <fieldset>
              <legend className="text-sm font-semibold text-secondary">
                How long will guests be eating and drinking?
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {DURATIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={durationMinutes === option.value}
                    onClick={() => setDurationMinutes(option.value)}
                    className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                      durationMinutes === option.value
                        ? "border-primary bg-primary/10 text-secondary"
                        : "border-border bg-background text-secondary hover:border-primary/40"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <ChoiceGroup
              legend="How will food be served?"
              options={SERVICE_STYLES}
              selected={serviceStyle}
              onSelect={(value) => setServiceStyle(value as FoodServiceStyle)}
            />

            <div className="rounded-2xl border border-primary/15 bg-primary/[0.045] p-4 text-xs leading-5 text-muted-foreground">
              Confetti keeps these as planning estimates. A recipe yield, package label, or
              caterer&apos;s stated servings becomes the final source before you buy.
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border pt-3 sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="festive" onClick={save}>
              <Check aria-hidden /> Use these details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChoiceGroup({
  legend,
  options,
  selected,
  onSelect,
}: {
  legend: string;
  options: Array<{ value: string; label: string; detail: string }>;
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-secondary">{legend}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const active = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(option.value)}
              className={`min-h-24 rounded-2xl border p-3 text-left transition ${
                active
                  ? "border-primary bg-primary/10 text-secondary"
                  : "border-border bg-background text-secondary hover:border-primary/40"
              }`}
            >
              <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                {option.label}
                {active && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {option.detail}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
