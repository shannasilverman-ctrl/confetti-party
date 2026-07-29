export const PRODUCT_TELEMETRY_EVENTS = [
  "landing_plan_started",
  "planning_started",
  "plan_created",
  "invite_opened",
  "rsvp_completed",
  "bring_item_claimed",
  "party_save_failed",
  "rsvp_failed",
  "client_render_failed",
] as const;

export type ProductTelemetryEvent = (typeof PRODUCT_TELEMETRY_EVENTS)[number];

export const PRODUCT_TELEMETRY_SURFACES = [
  "landing",
  "talk",
  "quick_start",
  "party",
  "day_of",
  "reveal",
  "rsvp",
  "sample_invite",
  "auth",
  "account",
  "other",
] as const;

export type ProductTelemetrySurface = (typeof PRODUCT_TELEMETRY_SURFACES)[number];

export interface ProductTelemetryPayload {
  event: ProductTelemetryEvent;
  surface: ProductTelemetrySurface;
}

const sentOnce = new Set<string>();

export function productTelemetrySurface(pathname: string): ProductTelemetrySurface {
  if (pathname === "/") return "landing";
  if (pathname === "/talk") return "talk";
  if (pathname === "/app") return "quick_start";
  if (pathname === "/sample-invite") return "sample_invite";
  if (pathname === "/auth" || pathname === "/reset-password") return "auth";
  if (pathname === "/account") return "account";
  if (/^\/rsvp\/[^/]+$/.test(pathname)) return "rsvp";
  if (/^\/party\/[^/]+\/day-of$/.test(pathname)) return "day_of";
  if (/^\/party\/[^/]+\/reveal$/.test(pathname)) return "reveal";
  if (/^\/party\/[^/]+$/.test(pathname)) return "party";
  return "other";
}

export function isProductTelemetryPayload(value: unknown): value is ProductTelemetryPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "event" && key !== "surface")) return false;
  return (
    PRODUCT_TELEMETRY_EVENTS.includes(record.event as ProductTelemetryEvent) &&
    PRODUCT_TELEMETRY_SURFACES.includes(record.surface as ProductTelemetrySurface)
  );
}

/**
 * Records one allowlisted product signal without identifiers or user content.
 *
 * Requests omit credentials and referrers so RSVP and collaboration bearer
 * links can never become telemetry. Failure is intentionally silent: measuring
 * Confetti must never interrupt planning.
 */
export function trackProductEvent(
  event: ProductTelemetryEvent,
  options: { once?: boolean } = {},
): void {
  if (typeof window === "undefined" || typeof fetch !== "function") return;

  const payload: ProductTelemetryPayload = {
    event,
    surface: productTelemetrySurface(window.location.pathname),
  };
  const onceKey = `${payload.event}:${payload.surface}`;
  if (options.once && sentOnce.has(onceKey)) return;
  if (options.once) sentOnce.add(onceKey);

  void fetch("/api/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    credentials: "omit",
    keepalive: true,
    referrerPolicy: "no-referrer",
  }).catch(() => {
    // Telemetry is best-effort and must never create product noise.
  });
}
