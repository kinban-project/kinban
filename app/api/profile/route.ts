import { eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { accountProfiles } from "../../../db/schema";
import { recordAudit } from "../../audit-log";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const [profile] = await getDb().select().from(accountProfiles).where(eq(accountProfiles.userEmail, user.email)).limit(1);
  return Response.json({ email: user.email, nickname: profile?.nickname ?? "" });
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const body = await request.json() as { nickname?: string };
  const nickname = body.nickname?.trim() ?? "";
  if (nickname.length > 40) return Response.json({ error: "ニックネームは40文字以内で入力してください" }, { status: 400 });
  const db = getDb();
  const [existing] = await db.select().from(accountProfiles).where(eq(accountProfiles.userEmail, user.email)).limit(1);
  if (existing) await db.update(accountProfiles).set({ nickname }).where(eq(accountProfiles.userEmail, user.email));
  else await db.insert(accountProfiles).values({ userEmail: user.email, nickname });
  await recordAudit({ userEmail: user.email, action: "profile.update", entityType: "accountProfile", entityId: user.email, summary: "アカウントのニックネームを更新しました" });
  return Response.json({ ok: true, nickname });
}
