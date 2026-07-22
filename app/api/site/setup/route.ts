import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getChatGPTIdentity } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { siteSetupState, siteUsers } from "../../../../db/schema";
import { linkChatGPTIdentity } from "../../../site-access";

export const dynamic = "force-dynamic";

function configured(name: string) {
  return process.env[name] ?? (env as Record<string, string | undefined>)[name];
}

export async function POST(request: Request) {
  const identity = await getChatGPTIdentity();
  if (!identity) return Response.json({ error: "本人確認が必要です" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { secret?: string };
  const suppliedSecret = request.headers.get("x-initial-setup-secret") ?? body.secret ?? "";
  const expectedSecret = configured("INITIAL_SETUP_SECRET") ?? "";
  const ownerEmail = configured("INITIAL_OWNER_EMAIL")?.trim().toLowerCase() ?? "";
  if (!expectedSecret || !ownerEmail) return Response.json({ error: "初回セットアップが設定されていません" }, { status: 503 });
  if (identity.email.toLowerCase() !== ownerEmail || suppliedSecret !== expectedSecret) {
    return Response.json({ error: "初回セットアップの認証に失敗しました" }, { status: 403 });
  }

  const db = getDb();
  const [state] = await db.select().from(siteSetupState).where(eq(siteSetupState.id, "initial")).limit(1);
  if (state?.completedAt) return Response.json({ error: "初回セットアップは完了済みです" }, { status: 409 });
  const now = new Date().toISOString();
  const [existing] = await db.select().from(siteUsers).where(eq(siteUsers.userEmail, identity.email)).limit(1);
  const siteUserId = existing?.id ?? crypto.randomUUID();
  await db.batch([
    existing
      ? db.update(siteUsers).set({ displayName: identity.displayName, status: "active", isSiteAdmin: true, canCreateGroups: true, updatedAt: now }).where(eq(siteUsers.id, siteUserId))
      : db.insert(siteUsers).values({ id: siteUserId, userEmail: identity.email, displayName: identity.displayName, status: "active", isSiteAdmin: true, canCreateGroups: true }),
    state
      ? db.update(siteSetupState).set({ completedAt: now, completedBy: identity.email }).where(eq(siteSetupState.id, "initial"))
      : db.insert(siteSetupState).values({ id: "initial", completedAt: now, completedBy: identity.email }),
  ]);
  await linkChatGPTIdentity(siteUserId, identity);
  return Response.json({ ok: true, email: identity.email, completedAt: now });
}
