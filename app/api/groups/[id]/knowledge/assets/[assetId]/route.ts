import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../../../../chatgpt-auth";
import { getDb } from "../../../../../../../db";
import { knowledgeAssets } from "../../../../../../../db/schema";
import { requireGroupMembership } from "../../../../group-access";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await params;
  const user = await getChatGPTUser();
  if (!user) return new Response("ログインが必要です", { status: 401 });
  await requireGroupMembership(id, user.email);
  const [asset] = await getDb().select().from(knowledgeAssets).where(and(eq(knowledgeAssets.id, assetId), eq(knowledgeAssets.groupId, id))).limit(1);
  if (!asset) return new Response("画像が見つかりません", { status: 404 });
  const bucket = env.FILES;
  if (!bucket) return new Response("ファイル保存先が設定されていません", { status: 503 });
  const object = await bucket.get(asset.objectKey);
  if (!object) return new Response("画像が見つかりません", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": asset.contentType, "Cache-Control": "private, max-age=3600" } });
}
