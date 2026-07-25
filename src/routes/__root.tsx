import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { lazy, Suspense, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { routeProviderNeeds } from "@/lib/route-providers";

const LazyToaster = lazy(() =>
  import("@/components/ui/sonner").then((module) => ({ default: module.Toaster })),
);
const LazyAuthProvider = lazy(() =>
  import("../lib/auth").then((module) => ({ default: module.AuthProvider })),
);
const LazyPartyProvider = lazy(() =>
  import("../lib/party-context").then((module) => ({ default: module.PartyProvider })),
);

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Confetti — Plan unforgettable gatherings" },
      {
        name: "description",
        content:
          "Confetti is your calm co-host for any gathering — from the first idea through the final toast. Guests, checklist, budget, day-of, and memories in one warm little app.",
      },
      { name: "author", content: "Confetti" },
      { name: "application-name", content: "Confetti" },
      { name: "theme-color", content: "#3B1E5E" },
      { name: "color-scheme", content: "light" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Confetti" },
      { property: "og:title", content: "Confetti — Plan unforgettable gatherings" },
      {
        property: "og:description",
        content: "From first idea to final toast — everything you need to host well.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Confetti" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Nunito:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const needs = routeProviderNeeds(pathname);
  const routedOutlet = needs.party ? (
    <LazyPartyProvider>
      <Outlet />
    </LazyPartyProvider>
  ) : (
    <Outlet />
  );
  const outlet = needs.auth ? (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div role="status" className="text-sm text-muted-foreground">
            Opening Confetti…
          </div>
        </div>
      }
    >
      <LazyAuthProvider>{routedOutlet}</LazyAuthProvider>
    </Suspense>
  ) : (
    routedOutlet
  );

  return (
    <QueryClientProvider client={queryClient}>
      {outlet}
      <Suspense fallback={null}>
        <LazyToaster />
      </Suspense>
    </QueryClientProvider>
  );
}
