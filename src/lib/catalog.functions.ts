import { createServerFn } from "@tanstack/react-start";

// Shopify Global Catalog MCP (UCP) — keyless tier.
// Docs: https://shopify.dev/docs/agents/catalog/global-catalog
const CATALOG_ENDPOINT = "https://catalog.shopify.com/api/ucp/mcp";
// A real, reachable UCP agent profile Shopify publishes for testing.
const UCP_AGENT_PROFILE =
  "https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json";

export type CatalogProduct = {
  id: string;
  title: string;
  image: string | null;
  priceMinor: number | null;
  currency: string | null;
  url: string;
  seller: string | null;
};

type SearchInput = { query: string; limit?: number };

function parseSearchInput(input: unknown): SearchInput {
  const raw = input as Partial<SearchInput> | undefined;
  const query = String(raw?.query ?? "")
    .trim()
    .slice(0, 120);
  if (!query) throw new Error("query is required");
  const limit = Math.min(Math.max(Number(raw?.limit ?? 3) || 3, 1), 6);
  return { query, limit };
}

type CatalogPrice = { amount?: number; currency?: string } | null | undefined;
type CatalogMedia = { type?: string; url?: string } | undefined;
type CatalogSeller = { name?: string } | undefined;
type CatalogVariant = {
  url?: string;
  checkout_url?: string;
  price?: CatalogPrice;
  seller?: CatalogSeller;
};
type CatalogItem = {
  id?: string;
  title?: string;
  media?: CatalogMedia[];
  variants?: CatalogVariant[];
  price_range?: { min?: CatalogPrice };
};

export const searchCatalogProducts = createServerFn({ method: "POST" })
  .validator(parseSearchInput)
  .handler(async ({ data }): Promise<CatalogProduct[]> => {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "search_catalog",
        arguments: {
          meta: { "ucp-agent": { profile: UCP_AGENT_PROFILE } },
          catalog: {
            query: data.query,
            context: {
              address_country: "US",
              intent: "Party host shopping for decorations and supplies",
            },
            pagination: { limit: data.limit ?? 3 },
            view: "compact",
          },
        },
      },
    };

    let response: Response;
    try {
      response = await fetch(CATALOG_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(body),
      });
    } catch {
      return [];
    }
    if (!response.ok) return [];
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return [];
    }
    const root = payload as {
      error?: unknown;
      result?: { structuredContent?: { products?: CatalogItem[] } };
    };
    if (root.error) return [];
    const products = root.result?.structuredContent?.products ?? [];

    return products.slice(0, data.limit ?? 3).flatMap((p): CatalogProduct[] => {
      const variant = p.variants?.[0];
      const price = variant?.price ?? p.price_range?.min;
      const url = variant?.checkout_url || variant?.url;
      if (!url || !p.title) return [];
      const image = p.media?.find((m) => m?.type === "image")?.url ?? null;
      return [
        {
          id: String(p.id ?? url),
          title: String(p.title),
          image,
          priceMinor: typeof price?.amount === "number" ? price.amount : null,
          currency: price?.currency ?? null,
          url,
          seller: variant?.seller?.name ?? null,
        },
      ];
    });
  });
