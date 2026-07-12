import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { attachments } from "../../../../db/schema";
import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user || !env.FILES) return new Response("Not found", { status: 404 });
  const { id } = await context.params;
  const db = getDb();
  const [file] = await db.select().from(attachments).where(and(eq(attachments.id, id), eq(attachments.ownerEmail, user.email))).limit(1);
  if (!file) return new Response("Not found", { status: 404 });
  const object = await env.FILES.get(file.objectKey);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": file.contentType, "Content-Length": String(file.size), "Content-Disposition": file.contentType.startsWith("image/") ? "inline" : `attachment; filename="${file.filename.replace(/"/g, "")}"`, "Cache-Control": "private, max-age=3600" } });
}
