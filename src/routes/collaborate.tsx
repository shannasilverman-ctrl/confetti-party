import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Users } from "lucide-react";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import {
  acceptCollaborationInvite,
  COLLABORATION_INVITE_SESSION_KEY,
  isCollaborationToken,
  normalizeCollaboratorDisplayName,
} from "@/lib/collaboration.functions";

export const Route = createFileRoute("/collaborate")({
  component: CollaboratePage,
  head: () => ({
    meta: [
      { title: "Join a planning team · Confetti" },
      { name: "description", content: "Accept a private Confetti cohost invitation." },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
});

function readAndScrubInvite(): string | null {
  const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("invite");
  if (isCollaborationToken(fragmentToken)) {
    window.sessionStorage.setItem(COLLABORATION_INVITE_SESSION_KEY, fragmentToken);
  }
  if (window.location.hash) {
    window.history.replaceState(window.history.state, "", "/collaborate");
  }
  const stored = window.sessionStorage.getItem(COLLABORATION_INVITE_SESSION_KEY);
  return isCollaborationToken(stored) ? stored : null;
}

function CollaboratePage() {
  const { user, loading } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [inviteReady, setInviteReady] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    try {
      const next = readAndScrubInvite();
      setToken(next);
      if (!next) setError("Open the private cohost link the host sent you.");
    } catch {
      setError("This browser couldn't hold the invitation safely. Open the link again.");
    } finally {
      setInviteReady(true);
    }
  }, []);

  useEffect(() => {
    if (displayName || !user) return;
    const suggested =
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : "";
    const clean = normalizeCollaboratorDisplayName(suggested);
    if (clean) setDisplayName(clean);
  }, [displayName, user]);

  async function accept() {
    if (!token) return;
    setAccepting(true);
    setError(null);
    const result = await acceptCollaborationInvite(token, displayName);
    setAccepting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    window.sessionStorage.removeItem(COLLABORATION_INVITE_SESSION_KEY);
    // This route intentionally does not mount PartyProvider. A full navigation
    // starts a clean, role-aware workspace load after membership exists.
    window.location.assign(`/party/${encodeURIComponent(result.data.partyId)}`);
  }

  return (
    <div className="min-h-screen bg-brand-wash">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-6">
        <BrandLockup />
        <Button asChild variant="ghost" size="sm">
          <Link to="/">Home</Link>
        </Button>
      </header>

      <main className="mx-auto flex max-w-lg px-5 pb-16 pt-10 sm:px-6 sm:pt-16">
        <div className="w-full rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-lift backdrop-blur sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Users className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="mt-5 font-display text-3xl font-medium text-secondary">
            Plan this party together
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            A party owner invited you as a trusted cohost. Cohosts can see and edit the full plan,
            including its guest list, notes, and budget.
          </p>

          <div className="mt-5 flex items-start gap-3 rounded-2xl border bg-muted/40 p-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <p className="text-xs leading-5 text-muted-foreground">
              The private key stays in this browser tab and is removed from the address bar before
              sign-in. It expires and works once. Only continue if you know the host and expect
              access to their plan.
            </p>
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-5 rounded-xl bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          {!inviteReady || loading ? (
            <div
              role="status"
              className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Checking your invitation…
            </div>
          ) : user ? (
            <div className="mt-6">
              <Label htmlFor="cohost-display-name">Name the host will recognize</Label>
              <Input
                id="cohost-display-name"
                className="mt-1.5"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={80}
                autoComplete="name"
                required
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Shown to this party's planning team. Confetti does not reveal your email here.
              </p>
              <Button
                className="mt-4 min-h-12 w-full"
                variant="festive"
                disabled={accepting || !token || !normalizeCollaboratorDisplayName(displayName)}
                onClick={() => void accept()}
              >
                {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users />}
                {accepting ? "Joining…" : "Join the planning team"}
              </Button>
            </div>
          ) : token ? (
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <Button asChild variant="festive" className="min-h-12">
                <Link to="/auth" search={{ mode: "signin", returnTo: "/collaborate" }}>
                  Sign in to join
                </Link>
              </Button>
              <Button asChild variant="outline" className="min-h-12">
                <Link to="/auth" search={{ mode: "signup", returnTo: "/collaborate" }}>
                  Create account
                </Link>
              </Button>
              <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">
                Keep this tab open. If email confirmation opens another tab, return here after
                confirming and sign in.
              </p>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
