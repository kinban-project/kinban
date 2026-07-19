import { and, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { pushDeliveries, pushSubscriptions } from "../../../db/schema";
import { sendWebPushToUsers, webPushConfig } from "../../push";

export const dynamic = "force-dynamic";

type SubscriptionPayload = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

function validSubscription(value: SubscriptionPayload) {
  return Boolean(value.endpoint?.startsWith("https://") && value.keys?.p256dh && value.keys.auth);
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ChatGPT sign-in is required." }, { status: 401 });
  const db = getDb();
  const [subscriptions, deliveries] = await Promise.all([
    db.select({ id: pushSubscriptions.id, active: pushSubscriptions.active, lastSeenAt: pushSubscriptions.lastSeenAt, createdAt: pushSubscriptions.createdAt }).from(pushSubscriptions).where(eq(pushSubscriptions.userEmail, user.email)),
    db.select({ status: pushDeliveries.status, createdAt: pushDeliveries.createdAt }).from(pushDeliveries).where(eq(pushDeliveries.userEmail, user.email)).orderBy(desc(pushDeliveries.createdAt)).limit(10),
  ]);
  const config = webPushConfig();
  return Response.json({ configured: config.enabled, publicKey: config.publicKey || null, subscriptions, deliveries });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ChatGPT sign-in is required." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { action?: "subscribe" | "unsubscribe" | "test"; subscription?: SubscriptionPayload; endpoint?: string };
  const db = getDb();
  if (body.action === "subscribe") {
    if (!body.subscription || !validSubscription(body.subscription)) return Response.json({ error: "Invalid push subscription." }, { status: 400 });
    const now = new Date().toISOString();
    const existing = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, body.subscription.endpoint!)).limit(1);
    if (existing[0] && existing[0].userEmail !== user.email) return Response.json({ error: "This browser subscription belongs to another account." }, { status: 409 });
    if (existing[0]) await db.update(pushSubscriptions).set({ p256dh: body.subscription.keys!.p256dh!, auth: body.subscription.keys!.auth!, active: true, userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? "", lastSeenAt: now }).where(eq(pushSubscriptions.id, existing[0].id));
    else await db.insert(pushSubscriptions).values({ id: crypto.randomUUID(), userEmail: user.email, endpoint: body.subscription.endpoint!, p256dh: body.subscription.keys!.p256dh!, auth: body.subscription.keys!.auth!, userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? "", lastSeenAt: now });
    return Response.json({ ok: true });
  }
  if (body.action === "unsubscribe") {
    const endpoint = body.endpoint?.trim() ?? "";
    if (!endpoint) return Response.json({ error: "endpoint is required." }, { status: 400 });
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userEmail, user.email), eq(pushSubscriptions.endpoint, endpoint)));
    return Response.json({ ok: true });
  }
  if (body.action === "test") {
    const config = webPushConfig();
    if (!config.enabled) return Response.json({ error: "Web Push is not configured on this server." }, { status: 409 });
    const result = await sendWebPushToUsers(db, [user.email], { eventId: `push-test:${user.email}:${crypto.randomUUID()}`, title: "KINBAN", body: "テスト通知です", url: "/", urgency: "normal" });
    return Response.json({ ok: true, result });
  }
  return Response.json({ error: "Unsupported action." }, { status: 400 });
}
