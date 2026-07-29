import { supabase } from "@/integrations/supabase/client";

export type PartyRole = "owner" | "cohost";

export type PartyMember = {
  userId: string;
  role: PartyRole;
  displayName: string | null;
  joinedAt: string;
  isYou: boolean;
};

export type CollaborationInvitation = {
  id: string;
  role: "cohost";
  tokenHint: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  status: "pending" | "accepted" | "expired" | "revoked";
};

export type PartyPeople = {
  callerRole: PartyRole;
  members: PartyMember[];
  invitations: CollaborationInvitation[];
};

export const COLLABORATION_INVITE_SESSION_KEY = "confetti:collaboration-invite:v1";

export function isCollaborationToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export function buildCollaborationInviteUrl(origin: string, token: string): string {
  if (!isCollaborationToken(token)) throw new Error("invalid collaboration token");
  const base = new URL("/collaborate", origin);
  base.hash = new URLSearchParams({ invite: token }).toString();
  return base.toString();
}

export function normalizeCollaboratorDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return null;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 1 || normalized.length > 80) return null;
  return normalized;
}

type RpcFailure = { ok: false; message: string };
type RpcSuccess<T> = { ok: true; data: T };
type RpcResult<T> = RpcSuccess<T> | RpcFailure;

function safeFailure(): RpcFailure {
  return { ok: false, message: "That didn't work. Please try again." };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parsePartyPeople(value: unknown): PartyPeople | null {
  if (!isRecord(value)) return null;
  if (value.callerRole !== "owner" && value.callerRole !== "cohost") return null;
  if (!Array.isArray(value.members) || !Array.isArray(value.invitations)) return null;

  const members: PartyMember[] = [];
  for (const item of value.members) {
    if (!isRecord(item)) return null;
    if (item.role !== "owner" && item.role !== "cohost") return null;
    if (
      typeof item.userId !== "string" ||
      typeof item.joinedAt !== "string" ||
      typeof item.isYou !== "boolean"
    )
      return null;
    members.push({
      userId: item.userId,
      role: item.role,
      displayName: typeof item.displayName === "string" ? item.displayName : null,
      joinedAt: item.joinedAt,
      isYou: item.isYou,
    });
  }

  const invitations: CollaborationInvitation[] = [];
  for (const item of value.invitations) {
    if (!isRecord(item) || item.role !== "cohost") return null;
    if (
      typeof item.id !== "string" ||
      typeof item.tokenHint !== "string" ||
      typeof item.createdAt !== "string" ||
      typeof item.expiresAt !== "string" ||
      !["pending", "accepted", "expired", "revoked"].includes(String(item.status))
    )
      return null;
    invitations.push({
      id: item.id,
      role: "cohost",
      tokenHint: item.tokenHint,
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
      acceptedAt: typeof item.acceptedAt === "string" ? item.acceptedAt : null,
      revokedAt: typeof item.revokedAt === "string" ? item.revokedAt : null,
      status: item.status as CollaborationInvitation["status"],
    });
  }
  return { callerRole: value.callerRole, members, invitations };
}

export async function loadPartyPeople(partyId: string): Promise<RpcResult<PartyPeople>> {
  const { data, error } = await supabase.rpc("list_party_people", { _party_id: partyId });
  if (error) return safeFailure();
  const parsed = parsePartyPeople(data);
  return parsed ? { ok: true, data: parsed } : safeFailure();
}

export async function createCollaborationInvite(
  partyId: string,
): Promise<RpcResult<{ token: string; expiresAt: string }>> {
  const { data, error } = await supabase.rpc("create_collaboration_invite", {
    _party_id: partyId,
    _expires_in_hours: 168,
  });
  if (error || !isRecord(data) || typeof data.token !== "string") return safeFailure();
  return {
    ok: true,
    data: {
      token: data.token,
      expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : "",
    },
  };
}

export async function acceptCollaborationInvite(
  token: string,
  displayName: string,
): Promise<RpcResult<{ partyId: string; role: PartyRole; alreadyAccepted: boolean }>> {
  if (!isCollaborationToken(token))
    return { ok: false, message: "This invitation link doesn't look right." };
  const cleanDisplayName = normalizeCollaboratorDisplayName(displayName);
  if (!cleanDisplayName)
    return { ok: false, message: "Add the name the host will recognize you by." };
  const { data, error } = await supabase.rpc("accept_collaboration_invite", {
    _token: token,
    _display_name: cleanDisplayName,
  });
  if (
    error ||
    !isRecord(data) ||
    typeof data.partyId !== "string" ||
    (data.role !== "owner" && data.role !== "cohost")
  )
    return { ok: false, message: "This invitation is invalid, expired, or already used." };
  return {
    ok: true,
    data: {
      partyId: data.partyId,
      role: data.role,
      alreadyAccepted: data.alreadyAccepted === true,
    },
  };
}

export async function revokeCollaborationInvite(
  partyId: string,
  invitationId: string,
): Promise<RpcResult<true>> {
  const { error } = await supabase.rpc("revoke_collaboration_invite", {
    _party_id: partyId,
    _invitation_id: invitationId,
  });
  return error ? safeFailure() : { ok: true, data: true };
}

export async function removePartyMember(partyId: string, userId: string): Promise<RpcResult<true>> {
  const { error } = await supabase.rpc("remove_party_member", {
    _party_id: partyId,
    _user_id: userId,
  });
  return error ? safeFailure() : { ok: true, data: true };
}

export async function leaveParty(partyId: string): Promise<RpcResult<true>> {
  const { error } = await supabase.rpc("leave_party", { _party_id: partyId });
  return error ? safeFailure() : { ok: true, data: true };
}

export async function transferPartyOwnership(
  partyId: string,
  userId: string,
): Promise<RpcResult<true>> {
  const { error } = await supabase.rpc("transfer_party_ownership", {
    _party_id: partyId,
    _new_owner_id: userId,
  });
  return error ? safeFailure() : { ok: true, data: true };
}
