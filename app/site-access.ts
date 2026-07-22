import { and, eq, gt } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../db";
import { authIdentities, siteInvitations, siteUsers } from "../db/schema";

type Identity = { email: string; displayName: string };

function configured(name: string) {
  return process.env[name] ?? (env as Record<string, string | undefined>)[name];
}

export async function getSiteUser(email: string) {
  const [row] = await getDb().select().from(siteUsers).where(eq(siteUsers.userEmail, email)).limit(1);
  return row ?? null;
}

async function linkChatGPTIdentity(siteUserId: string, identity: Identity) {
  const db = getDb();
  await db.insert(authIdentities).values({
    id: crypto.randomUUID(),
    siteUserId,
    provider: "chatgpt",
    providerSubject: identity.email,
    verifiedEmail: identity.email,
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

  const initialOwner = configured("INITIAL_OWNER_EMAIL")?.trim().toLowerCase();
  if (initialOwner && initialOwner === identity.email.toLowerCase()) {
    const id = existing?.id ?? crypto.randomUUID();
    await getDb().batch([
      existing
        ? getDb().update(siteUsers).set({ displayName: identity.displayName, status: "active", isSiteAdmin: true, canCreateGroups: true, updatedAt: now }).where(eq(siteUsers.id, id))
        : getDb().insert(siteUsers).values({ id, userEmail: identity.email, displayName: identity.displayName, status: "active", isSiteAdmin: true, canCreateGroups: true }),
    ]);
    const active = await getSiteUser(identity.email);
    if (active) await linkChatGPTIdentity(active.id, identity);
    return active;
  }
  return null;
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
