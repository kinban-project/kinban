import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { siteInvitations, siteUsers } from "../../../../db/schema";
import { recordAudit } from "../../../audit-log";
import { requireSiteAdmin } from "../../../site-access";
import { invitationUrl, sendInvitationEmail } from "../../../resend";

export const dynamic = "force-dynamic";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function admin() {
  const user = await getChatGPTUser();
  if (!user) return { error: Response.json({ error: "ログインが必要です" }, { status: 401 }) };
  const siteAdmin = await requireSiteAdmin(user.email);
  if (!siteAdmin) return { error: Response.json({ error: "サイト管理者のみ利用できます" }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const auth = await admin();
  if (auth.error) return auth.error;
  const db = getDb();
  const [users, invitations] = await Promise.all([db.select().from(siteUsers), db.select().from(siteInvitations)]);
  const now = new Date().toISOString();
  return Response.json({
    users,
    invitations: invitations.map(({ tokenHash: _tokenHash, ...invitation }) => ({ ...invitation, status: invitation.status === "pending" && invitation.expiresAt <= now ? "expired" : invitation.status })),
  });
}

export async function POST(request: Request) {
  const auth = await admin();
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({})) as { email?: string; displayName?: string; delivery?: "manual" | "resend" };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@")) return Response.json({ error: "招待するメールアドレスを入力してください" }, { status: 400 });
  const db = getDb();
  const [existing] = await db.select().from(siteUsers).where(eq(siteUsers.userEmail, email)).limit(1);
  if (existing?.status === "active") return Response.json({ error: "すでに有効なサイト利用者です" }, { status: 409 });
  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const invitation = { id: crypto.randomUUID(), email, invitedBy: auth.user.email, tokenHash: await sha256(token), status: "pending" as const, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() };
  await db.batch([
    db.update(siteInvitations).set({ status: "revoked" }).where(and(eq(siteInvitations.email, email), eq(siteInvitations.status, "pending"))),
    existing
      ? db.update(siteUsers).set({ displayName: body.displayName?.trim().slice(0, 80) ?? existing.displayName, status: "invited", updatedAt: new Date().toISOString() }).where(eq(siteUsers.id, existing.id))
      : db.insert(siteUsers).values({ id: crypto.randomUUID(), userEmail: email, displayName: body.displayName?.trim().slice(0, 80) ?? "", status: "invited" }),
    db.insert(siteInvitations).values(invitation),
  ]);
  await recordAudit({ userEmail: auth.user.email, action: "site.invitation.create", entityType: "siteInvitation", entityId: invitation.id, summary: `${email}をサイトへ招待しました`, details: { delivery: body.delivery ?? "manual" } });
  const delivery = body.delivery ?? "manual";
  if (delivery === "resend") {
    try {
      const mail = await sendInvitationEmail({ to: email, token, expiresAt: invitation.expiresAt });
      if (!mail.sent) return Response.json({ error: "Resendが設定されていません。招待URLを発行するか、RESEND_API_KEYを設定してください。" }, { status: 503 });
      return Response.json({ invitation: { id: invitation.id, email, expiresAt: invitation.expiresAt }, emailSent: mail.sent }, { status: 201 });
    } catch (error) {
      return Response.json({ error: `招待メールを送信できませんでした: ${error instanceof Error ? error.message : "unknown error"}`, invitation: { id: invitation.id, email, expiresAt: invitation.expiresAt } }, { status: 502 });
    }
  }
  return Response.json({ invitation: { id: invitation.id, email, expiresAt: invitation.expiresAt }, invitationUrl: invitationUrl(token), emailSent: false }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await admin();
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({})) as { invitationId?: string };
  if (!body.invitationId) return Response.json({ error: "招待IDが必要です" }, { status: 400 });
  const db = getDb();
  const [invitation] = await db.select().from(siteInvitations).where(eq(siteInvitations.id, body.invitationId)).limit(1);
  if (!invitation) return Response.json({ error: "招待が見つかりません" }, { status: 404 });
  await db.update(siteInvitations).set({ status: "revoked" }).where(eq(siteInvitations.id, invitation.id));
  await recordAudit({ userEmail: auth.user.email, action: "site.invitation.revoke", entityType: "siteInvitation", entityId: invitation.id, summary: `${invitation.email}への招待を取り消しました` });
  return Response.json({ ok: true });
}

export async function PATCH(request: Request) {
  const auth = await admin();
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({})) as { email?: string; status?: "active" | "suspended" | "invited"; isSiteAdmin?: boolean; canCreateGroups?: boolean };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email) return Response.json({ error: "対象メールアドレスが必要です" }, { status: 400 });
  if (email === auth.user.email && (body.status === "suspended" || body.isSiteAdmin === false)) return Response.json({ error: "自分自身の停止・管理者解除はできません" }, { status: 400 });
  const [target] = await getDb().select().from(siteUsers).where(eq(siteUsers.userEmail, email)).limit(1);
  if (!target) return Response.json({ error: "サイト利用者が見つかりません" }, { status: 404 });
  await getDb().update(siteUsers).set({ ...(body.status ? { status: body.status } : {}), ...(typeof body.isSiteAdmin === "boolean" ? { isSiteAdmin: body.isSiteAdmin } : {}), ...(typeof body.canCreateGroups === "boolean" ? { canCreateGroups: body.canCreateGroups } : {}), updatedAt: new Date().toISOString() }).where(eq(siteUsers.id, target.id));
  await recordAudit({ userEmail: auth.user.email, action: "site.user.update", entityType: "siteUser", entityId: target.id, summary: `${email}のサイト権限を更新しました`, details: { status: body.status, isSiteAdmin: body.isSiteAdmin, canCreateGroups: body.canCreateGroups } });
  return Response.json({ ok: true });
}
