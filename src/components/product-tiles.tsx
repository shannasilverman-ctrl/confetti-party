import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";
import { searchCatalogProducts, type CatalogProduct } from "@/lib/catalog.functions";

function formatPrice(minor: number | null, currency: string | null): string | null {
  if (minor == null || !currency) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `$${(minor / 100).toFixed(2)}`;
  }
}

export function ProductTiles({
  query,
  limit = 3,
  enabled = true,
  compact = false,
  emptyFallback = null,
}: {
  query: string;
  limit?: number;
  enabled?: boolean;
  compact?: boolean;
  emptyFallback?: React.ReactNode;
}) {
  const search = useServerFn(searchCatalogProducts);
  const trimmed = query.trim();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["catalog-search", trimmed, limit],
    queryFn: () => search({ data: { query: trimmed, limit } }),
    enabled: enabled && trimmed.length > 0,
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });

  if (!enabled || !trimmed) return null;
  if (isLoading) {
    return (
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: limit }).map((_, i) => (
          <div
            key={i}
            className="h-[124px] w-[132px] shrink-0 animate-pulse rounded-xl border border-border bg-muted/40"
          />
        ))}
      </div>
    );
  }
  if (isError || !data || data.length === 0) return <>{emptyFallback}</>;

  return (
    <div className={`mt-3 flex gap-2 overflow-x-auto pb-1 ${compact ? "" : ""}`}>
      {data.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

function ProductCard({ product }: { product: CatalogProduct }) {
  const price = formatPrice(product.priceMinor, product.currency);
  return (
    <a
      href={product.url}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="group flex w-[132px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-shadow hover:shadow-card"
    >
      <div className="relative aspect-square w-full bg-muted">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wider text-muted-foreground">
            No image
          </div>
        )}
        <span className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-secondary opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
          <ExternalLink className="h-3 w-3" />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 px-2 py-1.5">
        <div className="line-clamp-2 text-[11px] font-medium leading-tight text-secondary">
          {product.title}
        </div>
        <div className="mt-auto flex items-center justify-between gap-1 pt-1">
          <span className="truncate text-[10px] text-muted-foreground">
            {product.seller ?? "Shopify"}
          </span>
          {price && (
            <span className="tabular-nums text-[11px] font-semibold text-secondary">{price}</span>
          )}
        </div>
      </div>
    </a>
  );
}
