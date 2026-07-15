import { eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { attachments, events } from "../../../db/schema";
import { env } from "cloudflare:workers";
import { getMembership } from "../groups/group-access";

export const dynamic = "force-dynamic";
const MAX_FILE_BYTES = 1024 * 1024;

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const eventId = String(form.get("eventId") ?? "");
  if (!(file instanceof File) || !eventId) return Response.json({ error: "fileとeventIdが必要です" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return Response.json({ error: "添付ファイルは1MB以下にしてください" }, { status: 413 });
  if (!env.FILES) return Response.json({ error: "ローカルストレージが利用できません" }, { status: 500 });
  const db = getDb();
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) return Response.json({ error: "予定が見つかりません" }, { status: 404 });
  if (event.groupId) {
    const membership = await getMembership(event.groupId, user.email);
    if (!membership || (membership.role !== "owner" && membership.role !== "editor")) return Response.json({ error: "グループ予定への添付権限がありません" }, { status: 403 });
  } else if (event.ownerEmail !== user.email) return Response.json({ error: "この予定への添付権限がありません" }, { status: 403 });
  try {
    const id = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const objectKey = `${user.email}/${eventId}/${id}-${safeName}`;
    await env.FILES.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    const attachment = { id, ownerEmail: user.email, eventId, objectKey, filename: file.name, contentType: file.type || "application/octet-stream", size: file.size };
    await db.insert(attachments).values(attachment);
    return Response.json({ attachment }, { status: 201 });
  } catch (error) {
    return Response.json({ error: `添付ファイルの保存に失敗しました。${error instanceof Error ? error.message : "unknown upload error"}` }, { status: 500 });
  }
}
