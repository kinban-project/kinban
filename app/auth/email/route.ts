import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../../db";
import { siteInvitations, siteUsers } from "../../../db/schema";
import { linkIdentity } from "../../site-access";
import { issueSiteSession, serializeCookie, SITE_SESSION_COOKIE } from "../../site-sessions";

async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (!token) return Response.json({ error: "招待リンクがありません。" }, { status: 400 });
  const now = new Date().toISOString();
  const db = getDb();
  const [invitation] = await db.select().from(siteInvitations).where(and(eq(siteInvitations.tokenHash, await sha256(token)), eq(siteInvitations.status, "pending"), gt(siteInvitations.expiresAt, now))).limit(1);
  if (!invitation) return Response.json({ error: "招待リンクが無効か、有効期限が切れています。" }, { status: 410 });
  const [user] = await db.select().from(siteUsers).where(eq(siteUsers.userEmail, invitation.email)).limit(1);
  if (user?.status === "suspended") return Response.json({ error: "このアカウントは利用停止中です。" }, { status: 403 });
  const siteUserId = user?.id ?? crypto.randomUUID();
  await db.batch([user ? db.update(siteUsers).set({ status: "active", updatedAt: now }).where(eq(siteUsers.id, siteUserId)) : db.insert(siteUsers).values({ id: siteUserId, userEmail: invitation.email, displayName: invitation.email, status: "active" }), db.update(siteInvitations).set({ status: "accepted", acceptedAt: now }).where(eq(siteInvitations.id, invitation.id))]);
  await linkIdentity(siteUserId, "email_link", invitation.email, invitation.email);
  const session = await issueSiteSession(siteUserId);
  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", serializeCookie(SITE_SESSION_COOKIE, session.token, { maxAge: 60 * 60 * 24 * 30, httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "Lax", path: "/" }));
  return new Response(null, { status: 302, headers });
}
