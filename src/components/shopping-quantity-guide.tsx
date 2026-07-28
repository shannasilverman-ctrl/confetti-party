import { Calculator, Info } from "lucide-react";
import { QuantityTunerDialog } from "@/components/quantity-tuner-dialog";
import { useParties } from "@/lib/party-context";
import { partyQuantityPlan } from "@/lib/party-quantities";

export function ShoppingQuantityGuide({ partyId }: { partyId: string }) {
  const { getParty } = useParties();
  const party = getParty(partyId);
  if (!party) return null;
  const plan = partyQuantityPlan(party.planningProfile, {
    occasion: party.occasion,
    holidayPackId: party.holidayPackId,
  });
  if (!plan) return null;

  return (
    <section
      aria-labelledby="shopping-quantity-guide-title"
      data-testid="shopping-quantity-guide"
      className="rounded-3xl border border-primary/20 bg-card p-5 shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Calculator className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              {plan.confidence === "tuned" ? "Your tuned quantities" : "Ordering guide"}
            </div>
            <h2
              id="shopping-quantity-guide-title"
              className="mt-0.5 font-display text-lg font-semibold text-secondary"
            >
              Keep the headcount math beside the list
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Use these serving targets while choosing real recipes, packages, or vendor orders.
              Confetti will not invent a package size or price.
            </p>
          </div>
        </div>
        <QuantityTunerDialog
          partyId={partyId}
          triggerLabel={plan.confidence === "tuned" ? "Adjust food plan" : "Confirm assumptions"}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {plan.estimates.map((estimate) => (
          <div key={estimate.id} className="rounded-2xl border border-border bg-background p-3">
            <div className="font-display text-xl font-semibold text-secondary">
              {estimate.recommendation}
            </div>
            <div className="mt-0.5 text-xs font-medium text-secondary">{estimate.label}</div>
            <div className="mt-1 text-[10px] leading-4 text-muted-foreground">
              {estimate.assumption}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2 rounded-xl bg-muted/45 p-3 text-[11px] leading-5 text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span>
          Before buying, check the stated yield: “serves 8,” “12 slices,” or a caterer&apos;s
          guaranteed count. That is what turns this guide into the final quantity.
        </span>
      </div>
    </section>
  );
}
