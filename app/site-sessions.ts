import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { siteSessions, siteUsers } from "../db/schema";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function issueSiteSession(siteUserId: string, days = 30) {
  const token = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  await getDb().insert(siteSessions).values({ id: crypto.randomUUID(), siteUserId, sessionHash: await sha256(token), expiresAt });
  return { token, expiresAt };
}

export async function getSiteSession(token: string) {
  if (!token) return null;
  const [row] = await getDb().select({ session: siteSessions, user: siteUsers }).from(siteSessions)
    .innerJoin(siteUsers, eq(siteUsers.id, siteSessions.siteUserId))
    .where(and(eq(siteSessions.sessionHash, await sha256(token)), gt(siteSessions.expiresAt, new Date().toISOString()), eq(siteUsers.status, "active")))
    .limit(1);
  return row ? { ...row.user, session: row.session } : null;
}

export async function revokeSiteSession(token: string) {
  if (!token) return;
  await getDb().delete(siteSessions).where(eq(siteSessions.sessionHash, await sha256(token)));
}
