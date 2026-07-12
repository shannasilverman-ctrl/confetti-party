// Central affiliate configuration and retailer search link builders.
// Set amazonTag to your Amazon Associates tracking ID to enable
// affiliate links and the site-wide disclosure.
export const AFFILIATE = {
  amazonTag: "",
};

function clamp(q: string): string {
  const trimmed = q.trim().replace(/\s+/g, " ");
  return trimmed.length > 80 ? trimmed.slice(0, 80).trim() : trimmed;
}

export function amazonSearchUrl(query: string): string {
  const q = encodeURIComponent(clamp(query));
  const tag = AFFILIATE.amazonTag
    ? `&tag=${encodeURIComponent(AFFILIATE.amazonTag)}`
    : "";
  return `https://www.amazon.com/s?k=${q}${tag}`;
}

export function targetSearchUrl(query: string): string {
  return `https://www.target.com/s?searchTerm=${encodeURIComponent(clamp(query))}`;
}

export function walmartSearchUrl(query: string): string {
  return `https://www.walmart.com/search?q=${encodeURIComponent(clamp(query))}`;
}

export function affiliateDisclosureEnabled(): boolean {
  return AFFILIATE.amazonTag.trim().length > 0;
}

export const AFFILIATE_DISCLOSURE =
  "As an Amazon Associate, Confetti earns from qualifying purchases.";
