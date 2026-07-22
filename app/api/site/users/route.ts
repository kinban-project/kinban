import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { siteInvitations, siteUsers } from "../../../../db/schema";
import { recordAudit } from "../../../audit-log";
import { requireSiteAdmin } from "../../../site-access";

export const dynamic = "force-dynamic";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function loginRequired() {
  return Response.json({ error: "ログインが必要です" }, { status: 401 });
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return loginRequired();
  if (!await requireSiteAdmin(user.email)) return Response.json({ error: "サイト管理者のみ利用できます" }, { status: 403 });
  const db = getDb();
  const [users, invitations] = await Promise.all([db.select().from(siteUsers), db.select().from(siteInvitations)]);
  return Response.json({ users, invitations: invitations.map(({ tokenHash: _tokenHash, ...invitation }) => invitation) });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return loginRequired();
  if (!await requireSiteAdmin(user.email)) return Response.json({ error: "サイト管理者のみ招待できます" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { email?: string; displayName?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@")) return Response.json({ error: "招待するメールアドレスを入力してください" }, { status: 400 });
  const db = getDb();
  const [existing] = await db.select().from(siteUsers).where(eq(siteUsers.userEmail, email)).limit(1);
  if (existing?.status === "active") return Response.json({ error: "すでに有効なサイト利用者です" }, { status: 409 });
  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const invitation = { id: crypto.randomUUID(), email, invitedBy: user.email, tokenHash: await sha256(token), status: "pending" as const, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() };
  await db.batch([
    existing
      ? db.update(siteUsers).set({ displayName: body.displayName?.trim().slice(0, 80) ?? existing.displayName, status: "invited", updatedAt: new Date().toISOString() }).where(eq(siteUsers.id, existing.id))
      : db.insert(siteUsers).values({ id: crypto.randomUUID(), userEmail: email, displayName: body.displayName?.trim().slice(0, 80) ?? "", status: "invited" }),
    db.insert(siteInvitations).values(invitation),
  ]);
  await recordAudit({ userEmail: user.email, action: "site.invitation.create", entityType: "siteInvitation", entityId: invitation.id, summary: `${email}をサイトへ招待しました` });
  return Response.json({ invitation: { id: invitation.id, email, expiresAt: invitation.expiresAt, token } }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return loginRequired();
  if (!await requireSiteAdmin(user.email)) return Response.json({ error: "サイト管理者のみ変更できます" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { email?: string; status?: "active" | "suspended" | "invited"; isSiteAdmin?: boolean; canCreateGroups?: boolean };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email) return Response.json({ error: "対象メールアドレスが必要です" }, { status: 400 });
  if (email === user.email && (body.status === "suspended" || body.isSiteAdmin === false)) return Response.json({ error: "自分自身の停止・管理者解除はできません" }, { status: 400 });
  const [target] = await getDb().select().from(siteUsers).where(eq(siteUsers.userEmail, email)).limit(1);
  if (!target) return Response.json({ error: "サイト利用者が見つかりません" }, { status: 404 });
  await getDb().update(siteUsers).set({ ...(body.status ? { status: body.status } : {}), ...(typeof body.isSiteAdmin === "boolean" ? { isSiteAdmin: body.isSiteAdmin } : {}), ...(typeof body.canCreateGroups === "boolean" ? { canCreateGroups: body.canCreateGroups } : {}), updatedAt: new Date().toISOString() }).where(eq(siteUsers.id, target.id));
  await recordAudit({ userEmail: user.email, action: "site.user.update", entityType: "siteUser", entityId: target.id, summary: `${email}のサイト権限を更新しました`, details: { status: body.status, isSiteAdmin: body.isSiteAdmin, canCreateGroups: body.canCreateGroups } });
  return Response.json({ ok: true });
}
