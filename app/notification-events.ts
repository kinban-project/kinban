import { and, eq, inArray } from "drizzle-orm";
import { assistantMessages, groupMembers } from "../db/schema";
import { sendWebPushToUsers } from "./push";
import { getDemoNow } from "./demo-clock";

type Database = ReturnType<typeof import("../db").getDb>;
type Urgency = "very-low" | "low" | "normal" | "high";

export async function activeGroupEmails(db: Database, groupId: string, managerOnly = false) {
  const members = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")));
  return members.filter((member) => !managerOnly || member.role === "owner" || member.role === "editor").map((member) => member.userEmail);
}

export async function sendBusinessPush(db: Database, input: { recipients: string[]; eventId: string; title: string; body: string; url: string; urgency?: Urgency }) {
  if (!input.recipients.length) return { attempted: 0, sent: 0, failed: 0, disabled: 0 };
  try {
    return await sendWebPushToUsers(db, [...new Set(input.recipients)], {
      eventId: input.eventId,
      title: input.title,
      body: input.body,
      url: input.url,
      urgency: input.urgency === "high" ? "high" : "normal",
    });
  } catch (error) {
    console.warn("business push failed", { eventId: input.eventId, error: error instanceof Error ? error.name : "UnknownError" });
    return { attempted: 0, sent: 0, failed: 1, disabled: 0 };
  }
}

export async function createSystemMessagesAndPush(db: Database, input: { groupId: string; recipients: string[]; eventId: string; eventType: string; body: string; pushTitle: string; pushBody: string; url: string }) {
  const recipients = [...new Set(input.recipients)];
  if (!recipients.length) return;
  const createdAt = (await getDemoNow(input.groupId)).toISOString();
  for (const memberEmail of recipients) {
    await db.insert(assistantMessages).values({
      id: crypto.randomUUID(), groupId: input.groupId, memberEmail, senderType: "system", body: input.body,
      status: "processed", eventType: input.eventType, eventId: input.eventId, createdAt,
    }).onConflictDoNothing();
  }
  await sendBusinessPush(db, { recipients, eventId: input.eventId, title: input.pushTitle, body: input.pushBody, url: input.url, urgency: "high" });
}
