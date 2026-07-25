import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { authIdentities, siteInvitations, siteUsers } from "../db/schema";

type Identity = { email: string; displayName: string };

export async function getSiteUser(email: string) {
  const [row] = await getDb().select().from(siteUsers).where(eq(siteUsers.userEmail, email)).limit(1);
  return row ?? null;
}

export async function linkChatGPTIdentity(siteUserId: string, identity: Identity) {
  return linkIdentity(siteUserId, "chatgpt", identity.email, identity.email);
}

export async function linkIdentity(siteUserId: string, provider: "google" | "microsoft" | "email_link" | "chatgpt", providerSubject: string, verifiedEmail: string) {
  const db = getDb();
  await db.insert(authIdentities).values({
    id: crypto.randomUUID(),
    siteUserId,
    provider,
    providerSubject,
    verifiedEmail,
  }).onConflictDoNothing();
}

/**
 * ChatGPT supplies the verified identity. This function adds the application's
 * invitation/approval decision on top of it. Local mode intentionally keeps
 * the developer switch available, but group creation still checks site_users.
 */
export async function ensureSiteAccess(identity: Identity) {
  const existing = await getSiteUser(identity.email);
  if (existing) {
    if (existing.status === "active") {
      await linkChatGPTIdentity(existing.id, identity);
      return existing;
    }
    if (existing.status === "suspended") return null;
  }

  const now = new Date().toISOString();
  const [invitation] = await getDb()
    .select()
    .from(siteInvitations)
    .where(and(eq(siteInvitations.email, identity.email), eq(siteInvitations.status, "pending"), gt(siteInvitations.expiresAt, now)))
    .limit(1);
  if (invitation) {
    const id = existing?.id ?? crypto.randomUUID();
    await getDb().batch([
      existing
        ? getDb().update(siteUsers).set({ displayName: identity.displayName, status: "active", updatedAt: now }).where(eq(siteUsers.id, id))
        : getDb().insert(siteUsers).values({ id, userEmail: identity.email, displayName: identity.displayName, status: "active" }),
      getDb().update(siteInvitations).set({ status: "accepted", acceptedAt: now }).where(eq(siteInvitations.id, invitation.id)),
    ]);
    const active = await getSiteUser(identity.email);
    if (active) await linkChatGPTIdentity(active.id, identity);
    return active;
  }

  return null;
}

export async function ensureProviderAccess(input: {
  email: string;
  displayName: string;
  provider: "google" | "microsoft" | "email_link";
  providerSubject: string;
}) {
  const existing = await getSiteUser(input.email);
  if (existing?.status === "active") {
    await linkIdentity(existing.id, input.provider, input.providerSubject, input.email);
    return existing;
  }
  if (existing?.status === "suspended") return null;

  const now = new Date().toISOString();
  const [invitation] = await getDb().select().from(siteInvitations)
    .where(and(eq(siteInvitations.email, input.email), eq(siteInvitations.status, "pending"), gt(siteInvitations.expiresAt, now)))
    .limit(1);
  if (!invitation) return null;

  const siteUserId = existing?.id ?? crypto.randomUUID();
  await getDb().batch([
    existing
      ? getDb().update(siteUsers).set({ displayName: input.displayName, status: "active", updatedAt: now }).where(eq(siteUsers.id, siteUserId))
      : getDb().insert(siteUsers).values({ id: siteUserId, userEmail: input.email, displayName: input.displayName, status: "active" }),
    getDb().update(siteInvitations).set({ status: "accepted", acceptedAt: now }).where(eq(siteInvitations.id, invitation.id)),
  ]);
  await linkIdentity(siteUserId, input.provider, input.providerSubject, input.email);
  return getSiteUser(input.email);
}

export async function requireSiteAdmin(email: string) {
  const user = await getSiteUser(email);
  return user?.status === "active" && user.isSiteAdmin ? user : null;
}

export async function canCreateGroups(email: string) {
  const user = await getSiteUser(email);
  return Boolean(user && user.status === "active" && (user.isSiteAdmin || user.canCreateGroups));
}

export function siteAccessError() {
  return Response.json({ error: "サイトへの招待・承認が必要です" }, { status: 403 });
}
