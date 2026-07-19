import { and, eq, inArray } from "drizzle-orm";
import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import { env } from "cloudflare:workers";
import { getDb } from "../db";
import { pushDeliveries, pushSubscriptions } from "../db/schema";

type Db = ReturnType<typeof getDb>;
type PushMessage = { eventId: string; title: string; body: string; url: string; urgency?: "normal" | "high" };
type PushRuntime = Record<string, string | undefined>;

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size));
  return chunks;
}

function setting(name: "VAPID_SUBJECT" | "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY") {
  return ((env as unknown as PushRuntime)[name] || process.env[name] || "").trim();
}

export function webPushConfig() {
  const subject = setting("VAPID_SUBJECT");
  const publicKey = setting("VAPID_PUBLIC_KEY");
  const privateKey = setting("VAPID_PRIVATE_KEY");
  return { subject, publicKey, privateKey, enabled: Boolean(subject && publicKey && privateKey) };
}

export async function sendWebPushToUsers(db: Db, userEmails: string[], message: PushMessage) {
  const recipients = [...new Set(userEmails.filter(Boolean))];
  if (!recipients.length) return { attempted: 0, sent: 0, failed: 0, disabled: 0 };
  const config = webPushConfig();
  const subscriptions = (
    await Promise.all(
      chunk(recipients, 50).map((emails) =>
        db
          .select()
          .from(pushSubscriptions)
          .where(
            and(
              inArray(pushSubscriptions.userEmail, emails),
              eq(pushSubscriptions.active, true),
            ),
          ),
      ),
    )
  ).flat();
  if (!config.enabled) {
    await Promise.all(subscriptions.map((subscription) => db.insert(pushDeliveries).values({ id: crypto.randomUUID(), eventId: message.eventId, userEmail: subscription.userEmail, subscriptionId: subscription.id, status: "disabled", errorCode: "vapid_not_configured" }).onConflictDoNothing()));
    return { attempted: subscriptions.length, sent: 0, failed: 0, disabled: subscriptions.length };
  }
  let sent = 0;
  let failed = 0;
  for (const subscription of subscriptions) {
    const deliveryId = crypto.randomUUID();
    await db.insert(pushDeliveries).values({ id: deliveryId, eventId: message.eventId, userEmail: subscription.userEmail, subscriptionId: subscription.id, status: "failed", errorCode: "pending" }).onConflictDoNothing();
    const [delivery] = await db.select().from(pushDeliveries).where(and(eq(pushDeliveries.eventId, message.eventId), eq(pushDeliveries.subscriptionId, subscription.id))).limit(1);
    if (!delivery || delivery.id !== deliveryId) continue;
    try {
      const payload = await buildPushPayload({ data: { title: message.title, body: message.body, url: message.url, eventId: message.eventId }, options: { ttl: 120, urgency: message.urgency ?? "normal" } }, { endpoint: subscription.endpoint, expirationTime: null, keys: { p256dh: subscription.p256dh, auth: subscription.auth } } satisfies PushSubscription, config);
      const response = await fetch(subscription.endpoint, payload);
      if (response.ok) {
        sent += 1;
        await db.update(pushDeliveries).set({ status: "sent", httpStatus: response.status, errorCode: "" }).where(eq(pushDeliveries.id, deliveryId));
      } else {
        failed += 1;
        await db.update(pushDeliveries).set({ status: "failed", httpStatus: response.status, errorCode: `http_${response.status}` }).where(eq(pushDeliveries.id, deliveryId));
        if (response.status === 404 || response.status === 410) await db.update(pushSubscriptions).set({ active: false }).where(eq(pushSubscriptions.id, subscription.id));
      }
    } catch (error) {
      failed += 1;
      await db.update(pushDeliveries).set({ status: "failed", errorCode: error instanceof Error ? error.name.slice(0, 80) : "push_error" }).where(eq(pushDeliveries.id, deliveryId));
    }
  }
  return { attempted: subscriptions.length, sent, failed, disabled: 0 };
}
