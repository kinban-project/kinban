import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { calendarSubscriptions } from "../../../../../db/schema";
import { hashApiToken } from "../../../../api/api-auth";
import { getMembership } from "../../group-access";

export const dynamic = "force-dynamic";

function unauthorized() {
  return Response.json({ error: "ログインが必要です。" }, { status: 401 });
}

function makeToken() {
  return `kinban_cal_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

function feedUrl(request: Request, token: string) {
  return `${new URL(request.url).origin}/api/calendar/subscribe/${encodeURIComponent(token)}`;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const { id: groupId } = await context.params;
  if (!(await getMembership(groupId, user.email))) return Response.json({ error: "このグループのメンバーではありません。" }, { status: 403 });
  const [subscription] = await getDb().select({ status: calendarSubscriptions.status, tokenPrefix: calendarSubscriptions.tokenPrefix, createdAt: calendarSubscriptions.createdAt }).from(calendarSubscriptions).where(and(eq(calendarSubscriptions.groupId, groupId), eq(calendarSubscriptions.userEmail, user.email))).limit(1);
  return Response.json({ status: subscription?.status ?? "unconfigured", tokenPrefix: subscription?.tokenPrefix ?? null, createdAt: subscription?.createdAt ?? null, feedUrl: null }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const { id: groupId } = await context.params;
  if (!(await getMembership(groupId, user.email))) return Response.json({ error: "このグループのメンバーではありません。" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { action?: string };
  const action = body.action ?? "issue";
  const db = getDb();
  const [existing] = await db.select().from(calendarSubscriptions).where(and(eq(calendarSubscriptions.groupId, groupId), eq(calendarSubscriptions.userEmail, user.email))).limit(1);
  if (action === "revoke") {
    if (existing) await db.update(calendarSubscriptions).set({ status: "revoked", revokedAt: new Date().toISOString() }).where(eq(calendarSubscriptions.id, existing.id));
    return Response.json({ ok: true, status: "revoked" });
  }
  if (action !== "issue" && action !== "reissue") return Response.json({ error: "不正な操作です。" }, { status: 400 });
  if (action === "issue" && existing?.status === "active") return Response.json({ error: "すでに連携中です。URLを再発行する場合は再発行を選択してください。" }, { status: 409 });
  const token = makeToken();
  const tokenHash = await hashApiToken(token);
  const value = { id: existing?.id ?? crypto.randomUUID(), groupId, userEmail: user.email, tokenHash, tokenPrefix: `${token.slice(0, 20)}…`, status: "active" as const, lastUsedAt: null, revokedAt: null, createdAt: existing?.createdAt ?? new Date().toISOString() };
  if (existing) await db.update(calendarSubscriptions).set(value).where(eq(calendarSubscriptions.id, existing.id));
  else await db.insert(calendarSubscriptions).values(value);
  return Response.json({ ok: true, status: "active", tokenPrefix: value.tokenPrefix, feedUrl: feedUrl(request, token) }, { headers: { "Cache-Control": "no-store" } });
}
