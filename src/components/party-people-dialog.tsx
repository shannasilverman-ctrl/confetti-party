import { useEffect, useState } from "react";
import { ArrowRightLeft, Copy, Link2, Loader2, LogOut, UserMinus, Users } from "lucide-react";
import { toast } from "sonner";
import {
  createCollaborationInvite,
  buildCollaborationInviteUrl,
  leaveParty,
  loadPartyPeople,
  removePartyMember,
  revokeCollaborationInvite,
  transferPartyOwnership,
  type PartyPeople,
} from "@/lib/collaboration.functions";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Props = {
  partyId: string;
  partyName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMembershipChanged: () => void;
};

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function memberLabel(member: PartyPeople["members"][number]): string {
  if (member.isYou) return "You";
  if (member.displayName?.trim()) return member.displayName.trim();
  return "Trusted cohost";
}

export function PartyPeopleDialog({
  partyId,
  partyName,
  open,
  onOpenChange,
  onMembershipChanged,
}: Props) {
  const [people, setPeople] = useState<PartyPeople | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [transferringTo, setTransferringTo] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    const result = await loadPartyPeople(partyId);
    if (result.ok) setPeople(result.data);
    else setError(result.message);
    setLoading(false);
  }

  useEffect(() => {
    if (!open) {
      setFreshLink(null);
      return;
    }
    void reload();
    // partyId is the identity boundary; open intentionally controls reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, partyId]);

  async function createLink() {
    setCreating(true);
    setError(null);
    const result = await createCollaborationInvite(partyId);
    setCreating(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const link = buildCollaborationInviteUrl(window.location.origin, result.data.token);
    setFreshLink(link);
    await reload();
    if (await copyText(link)) toast.success("Cohost link copied");
    else toast.message("Link created. Copy it below.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-secondary">Plan together</DialogTitle>
          <DialogDescription>
            Invite a trusted cohost to help with {partyName}. Cohosts can see and edit the full
            plan—including the guest list, notes, and budget.
          </DialogDescription>
        </DialogHeader>

        {loading && !people ? (
          <div role="status" className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading your planning team…
          </div>
        ) : error && !people ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button className="mt-3" variant="outline" size="sm" onClick={() => void reload()}>
              Try again
            </Button>
          </div>
        ) : people ? (
          <div className="space-y-5">
            <section aria-labelledby="planning-team-heading">
              <h3 id="planning-team-heading" className="text-sm font-semibold text-secondary">
                Planning team
              </h3>
              <div className="mt-2 divide-y rounded-2xl border bg-card">
                {people.members.map((member) => (
                  <div
                    key={member.userId}
                    className="flex min-h-14 items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{memberLabel(member)}</div>
                      <div className="text-xs text-muted-foreground">
                        {member.role === "owner" ? "Owns this party" : "Can see and edit the plan"}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={member.role === "owner" ? "default" : "soft"}>
                        {member.role === "owner" ? "Owner" : "Cohost"}
                      </Badge>
                      {people.callerRole === "owner" && member.role === "cohost" ? (
                        <>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Transfer ownership to ${memberLabel(member)}`}
                              >
                                <ArrowRightLeft className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Transfer party ownership?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {memberLabel(member)} will become the owner. You will remain a
                                  cohost and will no longer be able to delete the party or manage
                                  people.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel disabled={transferringTo !== null}>
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  disabled={transferringTo !== null}
                                  onClick={() => {
                                    setTransferringTo(member.userId);
                                    void (async () => {
                                      const result = await transferPartyOwnership(
                                        partyId,
                                        member.userId,
                                      );
                                      setTransferringTo(null);
                                      if (!result.ok) {
                                        toast.error(result.message);
                                        return;
                                      }
                                      await reload();
                                      onMembershipChanged();
                                      toast.success("Ownership transferred");
                                    })();
                                  }}
                                >
                                  {transferringTo === member.userId
                                    ? "Transferring…"
                                    : "Transfer ownership"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <ConfirmDelete
                            mode="confirm"
                            itemLabel="cohost"
                            title="Remove this cohost?"
                            description="They will immediately lose access to this party. Their prior edits remain in the plan."
                            onConfirm={async () => {
                              const result = await removePartyMember(partyId, member.userId);
                              if (!result.ok) return { ok: false, error: result.message };
                              await reload();
                              return { ok: true };
                            }}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Remove ${memberLabel(member)}`}
                              >
                                <UserMinus className="h-4 w-4" />
                              </Button>
                            }
                          />
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {people.callerRole === "owner" ? (
              <section aria-labelledby="invite-cohost-heading">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 id="invite-cohost-heading" className="text-sm font-semibold text-secondary">
                      Invite a cohost
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Links expire after 7 days and work once.
                    </p>
                  </div>
                  <Button onClick={() => void createLink()} disabled={creating} variant="festive">
                    {creating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                    Create link
                  </Button>
                </div>

                {freshLink ? (
                  <div className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
                    <label
                      htmlFor="fresh-cohost-link"
                      className="text-xs font-medium text-secondary"
                    >
                      New cohost link
                    </label>
                    <div className="mt-1.5 flex gap-2">
                      <Input id="fresh-cohost-link" value={freshLink} readOnly />
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Copy cohost link"
                        onClick={async () => {
                          if (await copyText(freshLink)) toast.success("Cohost link copied");
                          else toast.error("Couldn't copy. Select the link and copy it manually.");
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Send this privately. Anyone signed in with this one-time link can join the
                      planning team.
                    </p>
                  </div>
                ) : null}

                {people.invitations.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {people.invitations.map((invitation) => (
                      <div
                        key={invitation.id}
                        className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs"
                      >
                        <span className="text-muted-foreground">
                          Link ending {invitation.tokenHint} · {invitation.status}
                        </span>
                        {invitation.status === "pending" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              const result = await revokeCollaborationInvite(
                                partyId,
                                invitation.id,
                              );
                              if (!result.ok) {
                                toast.error(result.message);
                                return;
                              }
                              await reload();
                              toast.success("Invitation revoked");
                            }}
                          >
                            Revoke
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : (
              <section className="rounded-2xl border bg-muted/40 p-4">
                <div className="flex items-start gap-3">
                  <Users className="mt-0.5 h-4 w-4 text-primary" aria-hidden />
                  <div>
                    <h3 className="text-sm font-semibold text-secondary">You're a cohost</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Your edits save to the same plan. Only the owner can invite or remove people
                      and delete the party.
                    </p>
                    <ConfirmDelete
                      mode="confirm"
                      itemLabel="planning team"
                      title="Leave this planning team?"
                      description="You will immediately lose access to this party. Your previous edits stay in the plan."
                      onConfirm={async () => {
                        const result = await leaveParty(partyId);
                        if (!result.ok) return { ok: false, error: result.message };
                        onMembershipChanged();
                        window.location.assign("/app");
                        return { ok: true };
                      }}
                      trigger={
                        <Button className="mt-3" variant="outline" size="sm">
                          <LogOut className="h-4 w-4" /> Leave party
                        </Button>
                      }
                    />
                  </div>
                </div>
              </section>
            )}

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
