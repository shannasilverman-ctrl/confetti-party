import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: React.ComponentProps<typeof Button>["variant"];
  };
  className?: string;
  /** Toned background — subtle warm gradient matching the landing motif. */
  tone?: "cream" | "muted";
};

/**
 * Branded, action-led empty state used across shopping, tasks, guests,
 * bring, timeline, updates, photo drop, and budget surfaces.
 *
 * Reuses the design tokens (border, card, primary) so it never looks
 * like a dead form. One primary next action, warm cream frame, editorial
 * headline in the display font.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
  tone = "cream",
}: EmptyStateProps) {
  const toneClass =
    tone === "cream"
      ? "bg-gradient-to-br from-primary/[0.06] via-card to-accent/[0.08]"
      : "bg-card/60";
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border px-6 py-12 text-center shadow-card ${toneClass} ${
        className ?? ""
      }`}
      data-testid="empty-state"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary shadow-sm">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <div className="max-w-sm">
        <h3 className="font-display text-xl font-semibold text-secondary">{title}</h3>
        {body && <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>}
      </div>
      {action && (
        <Button
          variant={action.variant ?? "festive"}
          onClick={action.onClick}
          className="mt-1 min-h-11"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
