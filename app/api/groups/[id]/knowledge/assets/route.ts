import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { getDb } from "../../../../../../db";
import { knowledgeAssets } from "../../../../../../db/schema";
import { requireGroupMembership } from "../../../group-access";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const membership = await requireGroupMembership(id, user.email);
  if (membership.role !== "owner" && membership.role !== "editor") return Response.json({ error: "管理者権限が必要です" }, { status: 403 });
  const form = await request.formData();
  const input = form.get("file");
  if (!(input instanceof File)) return Response.json({ error: "画像ファイルを選択してください" }, { status: 400 });
  if (!input.type.startsWith("image/")) return Response.json({ error: "画像ファイルのみ添付できます" }, { status: 400 });
  if (input.size > 5 * 1024 * 1024) return Response.json({ error: "画像は5MB以下にしてください" }, { status: 413 });
  const bucket = env.FILES;
  if (!bucket) return Response.json({ error: "ファイル保存先が設定されていません" }, { status: 503 });
  const assetId = crypto.randomUUID();
  const safeName = input.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "image";
  const objectKey = `knowledge/${id}/${assetId}-${safeName}`;
  await bucket.put(objectKey, input.stream(), { httpMetadata: { contentType: input.type, cacheControl: "private, max-age=3600" } });
  const asset = { id: assetId, groupId: id, objectKey, fileName: input.name.slice(0, 120), contentType: input.type, size: input.size, createdBy: user.email };
  await getDb().insert(knowledgeAssets).values(asset);
  return Response.json({ asset: { ...asset, url: `/api/groups/${encodeURIComponent(id)}/knowledge/assets/${assetId}` } }, { status: 201 });
}
