/**
 * Supabase implicit-flow recovery links carry `type=recovery` in their hash.
 * Accept a query marker too for compatible auth proxies, but never treat a
 * generic authenticated session or an arbitrary reset page visit as proof.
 */
export function isRecoveryRedirect(search: string, hash: string): boolean {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  return query.get("type") === "recovery" || fragment.get("type") === "recovery";
}
