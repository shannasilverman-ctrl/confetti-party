import { createFileRoute } from "@tanstack/react-router";
import { isProductTelemetryPayload } from "@/lib/product-telemetry";

const MAX_TELEMETRY_BYTES = 256;
const RELEASE_SHA =
  typeof __CONFETTI_RELEASE_SHA__ === "string" ? __CONFETTI_RELEASE_SHA__ : "unknown";

function noStoreResponse(status: number): Response {
  return new Response(null, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
}

/**
 * Privacy-minimal activation and failure telemetry.
 *
 * The endpoint accepts only a fixed event and fixed route category. It never
 * accepts identifiers, free text, party details, guest answers, or tokens and
 * deliberately ignores request headers and Cloudflare request metadata.
 */
export function createProductTelemetryHandler(
  log: (record: Readonly<Record<string, string>>) => void = (record) =>
    console.info("[product]", record),
): (request: Request) => Promise<Response> {
  return async function handleProductTelemetry(request: Request): Promise<Response> {
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/json") return noStoreResponse(415);

    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_TELEMETRY_BYTES) {
      return noStoreResponse(413);
    }

    let raw: string;
    try {
      raw = await request.text();
    } catch {
      return noStoreResponse(400);
    }
    if (new TextEncoder().encode(raw).byteLength > MAX_TELEMETRY_BYTES) {
      return noStoreResponse(413);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return noStoreResponse(400);
    }
    if (!isProductTelemetryPayload(payload)) return noStoreResponse(400);

    log({
      type: "product_event",
      event: payload.event,
      surface: payload.surface,
      release: RELEASE_SHA,
    });
    return noStoreResponse(204);
  };
}

const defaultHandler = createProductTelemetryHandler();

export const Route = createFileRoute("/api/telemetry")({
  server: {
    handlers: {
      POST: ({ request }) => defaultHandler(request),
    },
  },
});
