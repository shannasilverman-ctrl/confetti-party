// Account / Settings surface — the sole self-serve lifecycle page.
//
// Signed-out users are bounced to /auth?returnTo=/account so they arrive
// back here after signing in. All destructive controls (export, delete)
// gate on session freshness and confirm intent explicitly.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, LogOut, ShieldAlert, Trash2, ArrowLeft, Info } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useServerFn } from "@tanstack/react-start";
import { deleteMyAccount, exportMyData, EXPORT_SCHEMA_VERSION } from "@/lib/account.functions";
import { clearDemoState } from "@/lib/demo-storage";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account · Confetti" },
      {
        name: "description",
        content: "Manage your Confetti account, export your data, or delete.",
      },
      { property: "og:title", content: "Account · Confetti" },
      {
        property: "og:description",
        content: "Manage your Confetti account, export your data, or delete.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountPage,
});

/** Masks an email for casual display: `a****z@example.com`. */
function maskEmail(email: string | null): string {
  if (!email) return "—";
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0] ?? ""}*@${domain}`;
  return `${local[0]}${"*".repeat(Math.max(1, local.length - 2))}${local[local.length - 1]}@${domain}`;
}

function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  // Client-side gate. Public route (SSR on) — bounce to /auth once we know
  // there's no session. Preserve returnTo so users land back here.
  useEffect(() => {
    if (!loading && !user) {
      void navigate({
        to: "/auth",
        search: { mode: "signin", returnTo: "/account" },
        replace: true,
      });
    }
  }, [loading, user, navigate]);

  const runExport = useServerFn(exportMyData);
  const runDelete = useServerFn(deleteMyAccount);

  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");

  const email = user?.email ?? null;
  const masked = maskEmail(email);

  const onExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    let url: string | null = null;
    try {
      const env = await runExport();
      const blob = new Blob([env.json], { type: "application/json;charset=utf-8" });
      url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = env.generatedAt.replace(/[:.]/g, "-");
      a.download = `confetti-export-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(
        `Exported ${env.partyCount} ${env.partyCount === 1 ? "party" : "parties"}, ${env.draftCount} draft(s), ${env.sessionCount} voice session(s).`,
      );
    } catch {
      toast.error("We couldn't build your export just now. Try again in a moment.");
    } finally {
      // Revoke on the next tick so the anchor download has grabbed it.
      if (url) setTimeout(() => URL.revokeObjectURL(url!), 5_000);
      setExporting(false);
    }
  }, [exporting, runExport]);

  const canConfirmDelete =
    confirmText === "DELETE" &&
    !!email &&
    confirmEmail.trim().toLowerCase() === email.toLowerCase();

  const onDelete = useCallback(async () => {
    if (deleting || !canConfirmDelete) return;
    setDeleting(true);
    try {
      const res = await runDelete();
      if (!res.ok && res.reason === "reauth") {
        toast.error("Please sign in again to delete your account.");
        setDeleteOpen(false);
        setDeleting(false);
        await signOut();
        void navigate({
          to: "/auth",
          search: { mode: "signin", returnTo: "/account" },
          replace: true,
        });
        return;
      }
      // Success — clear local traces, sign out, land on a calm state.
      try {
        clearDemoState();
      } catch {
        // Non-fatal — best-effort local cleanup.
      }
      await signOut();
      toast.success("Your account and data have been deleted.");
      void navigate({ to: "/", replace: true });
    } catch {
      toast.error("We couldn't complete the deletion. Nothing was changed.");
      setDeleting(false);
    }
  }, [canConfirmDelete, deleting, navigate, runDelete, signOut]);

  const onClearLocalDemo = useCallback(() => {
    try {
      clearDemoState();
      toast.success("Local demo data cleared from this browser.");
    } catch {
      toast.error("Couldn't clear local demo data on this browser.");
    }
  }, []);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-6 sm:px-6">
        <BrandLockup />
        <Button asChild variant="ghost" size="sm">
          <Link to="/app">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Your parties
          </Link>
        </Button>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        <h1 className="font-display text-3xl font-semibold text-secondary sm:text-4xl">Account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage your Confetti account, download your data, or delete everything you've saved.
        </p>

        {loading || !user ? (
          <Card className="mt-6 p-6 text-sm text-muted-foreground">Loading your account…</Card>
        ) : (
          <div className="mt-6 space-y-4">
            {/* Identity */}
            <Card className="p-4 sm:p-5">
              <h2 className="font-display text-lg font-semibold text-secondary">Signed in as</h2>
              <p className="mt-1 text-sm text-secondary" aria-label="Account email (masked)">
                {masked}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your full email is on file with your account. This page shows a masked form.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await signOut();
                    void navigate({ to: "/" });
                  }}
                >
                  <LogOut className="mr-1.5 h-4 w-4" /> Sign out
                </Button>
              </div>
            </Card>

            {/* Export */}
            <Card className="p-4 sm:p-5">
              <h2 className="font-display text-lg font-semibold text-secondary">Export my data</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Download a JSON file with every party, guest, dietary/allergen tag, bring-board
                item, host update, and voice-session metadata Confetti stores for your account.
                Claim secrets, raw transcripts, and other users' data are excluded.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                File format: JSON, schema version {EXPORT_SCHEMA_VERSION}.
              </p>
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onExport}
                  disabled={exporting}
                  aria-busy={exporting}
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  {exporting ? "Preparing…" : "Download JSON"}
                </Button>
              </div>
            </Card>

            {/* Clear local demo */}
            <Card className="p-4 sm:p-5">
              <h2 className="font-display text-lg font-semibold text-secondary">
                Clear local demo data
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Confetti stores browser-only sample parties and preferences in this device's local
                storage. This is separate from your saved cloud account. Clearing local demo data
                does not affect anything you've saved to your account.
              </p>
              <div className="mt-4">
                <Button variant="ghost" size="sm" onClick={onClearLocalDemo}>
                  Clear local demo data
                </Button>
              </div>
            </Card>

            {/* Delete */}
            <Card className="border-destructive/40 bg-destructive/5 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
                <div className="flex-1">
                  <h2 className="font-display text-lg font-semibold text-secondary">
                    Delete my account
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Permanently removes your account, every party you've created, guest RSVPs on
                    those parties, drafts, and voice-session metadata. Guest RSVP links you shared
                    will stop working. This can't be undone. Export first if you want a copy.
                  </p>
                  <div className="mt-4">
                    <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                      <Trash2 className="mr-1.5 h-4 w-4" /> Delete account…
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                See our{" "}
                <Link to="/privacy" className="underline underline-offset-2">
                  Privacy
                </Link>{" "}
                page for exact retention and deletion behavior.
              </span>
            </p>
          </div>
        )}
      </main>

      <Dialog open={deleteOpen} onOpenChange={(o) => !deleting && setDeleteOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This deletes your account and every party, RSVP, bring-board item, and voice-session
              record we have for you. Guest links stop working immediately. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="confirm-delete">
                Type <span className="font-semibold">DELETE</span> to confirm
              </Label>
              <Input
                id="confirm-delete"
                autoComplete="off"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
              />
            </div>
            <div>
              <Label htmlFor="confirm-email">Type your account email</Label>
              <Input
                id="confirm-email"
                autoComplete="off"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={email ?? ""}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                For safety, we may ask you to sign in again before finishing.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={!canConfirmDelete || deleting}
              aria-busy={deleting}
            >
              {deleting ? "Deleting…" : "Delete my account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { maskEmail };
