export type RouteProviderNeeds = { auth: boolean; party: boolean };

/**
 * Keep heavyweight authenticated workspace state off public guest/legal
 * routes. This contract is deliberately explicit so adding a new route that
 * calls useAuth/useParties requires an accompanying test update.
 */
export function routeProviderNeeds(pathname: string): RouteProviderNeeds {
  const party = pathname === "/app" || pathname.startsWith("/party/");
  const auth =
    pathname === "/" ||
    pathname === "/talk" ||
    pathname === "/auth" ||
    pathname === "/reset-password" ||
    pathname === "/account" ||
    party;
  return { auth, party };
}
