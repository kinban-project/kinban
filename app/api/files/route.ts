import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { attachments } from "../../../db/schema";
import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ChatGPT sign-in is required." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const eventId = String(form.get("eventId") ?? "");
  if (!(file instanceof File) || !eventId) return Response.json({ error: "file and eventId are required" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return Response.json({ error: "Files must be 10MB or smaller" }, { status: 413 });
  if (!env.FILES) return Response.json({ error: "R2 binding FILES is unavailable" }, { status: 500 });

  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const objectKey = `${user.email}/${eventId}/${id}-${safeName}`;
  await env.FILES.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
  const db = getDb();
  const attachment = { id, ownerEmail: user.email, eventId, objectKey, filename: file.name, contentType: file.type || "application/octet-stream", size: file.size };
  await db.insert(attachments).values(attachment);
  return Response.json({ attachment }, { status: 201 });
}
