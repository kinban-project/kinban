import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { groupMembers, knowledgeFolders, knowledgePages } from "../../../../../db/schema";
import { recordAudit } from "../../../../audit-log";
import { requireGroupMembership } from "../../group-access";

export const dynamic = "force-dynamic";

function manager(role: string) { return role === "owner" || role === "editor"; }
async function context(request: Request, id: string) {
  const user = await getChatGPTUser();
  if (!user) return { error: Response.json({ error: "ログインが必要です" }, { status: 401 }) } as const;
  const membership = await requireGroupMembership(id, user.email);
  return { user, membership } as const;
}

async function ensureFolders(groupId: string, email: string) {
  const db = getDb();
  for (const name of ["業務マニュアル", "店舗ルール", "よくある質問"]) {
    const [existing] = await db.select().from(knowledgeFolders).where(and(eq(knowledgeFolders.groupId, groupId), eq(knowledgeFolders.name, name))).limit(1);
    if (!existing) { try { await db.insert(knowledgeFolders).values({ id: crypto.randomUUID(), groupId, name, createdBy: email }); } catch { /* concurrent initialization */ } }
  }
  return db.select().from(knowledgeFolders).where(eq(knowledgeFolders.groupId, groupId)).orderBy(asc(knowledgeFolders.createdAt));
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await context(request, id);
  if ("error" in auth) return auth.error;
  const { user, membership } = auth;
  const db = getDb();
  const folders = await ensureFolders(id, user.email);
  const search = new URL(request.url).searchParams;
  const folderId = search.get("folderId")?.trim() ?? "";
  const query = search.get("q")?.trim() ?? "";
  const isManager = manager(membership.role);
  const conditions = [eq(knowledgePages.groupId, id)];
  if (folderId) conditions.push(eq(knowledgePages.folderId, folderId));
  if (!isManager) conditions.push(eq(knowledgePages.status, "published"));
  if (query) conditions.push(or(like(knowledgePages.title, `%${query}%`), like(knowledgePages.body, `%${query}%`))!);
  const pages = await db.select().from(knowledgePages).where(and(...conditions)).orderBy(desc(knowledgePages.updatedAt));
  const members = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, id), eq(groupMembers.status, "active")));
  return Response.json({ folders, pages, role: membership.role, currentEmail: user.email, members: isManager ? members : [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await context(request, id);
  if ("error" in auth) return auth.error;
  const { user, membership } = auth;
  if (!manager(membership.role)) return Response.json({ error: "管理者権限が必要です" }, { status: 403 });
  const body = await request.json() as { action?: "folder" | "page"; name?: string; folderId?: string; title?: string; content?: string; status?: "draft" | "published"; imageUrl?: string; imageAlt?: string };
  const db = getDb();
  if (body.action === "folder") {
    const name = body.name?.trim().slice(0, 80) ?? "";
    if (!name) return Response.json({ error: "フォルダ名を入力してください" }, { status: 400 });
    const folder = { id: crypto.randomUUID(), groupId: id, name, createdBy: user.email };
    try { await db.insert(knowledgeFolders).values(folder); } catch { return Response.json({ error: "同名のフォルダが既にあります" }, { status: 409 }); }
    await recordAudit({ groupId: id, userEmail: user.email, action: "knowledge.folder.create", entityType: "knowledge_folder", entityId: folder.id, summary: `業務ナレッジフォルダを作成: ${name}` });
    return Response.json({ folder }, { status: 201 });
  }
  if (body.action !== "page") return Response.json({ error: "不正な操作です" }, { status: 400 });
  const title = body.title?.trim().slice(0, 120) ?? "";
  const folderId = body.folderId?.trim() ?? "";
  if (!title || !folderId) return Response.json({ error: "タイトルとフォルダを指定してください" }, { status: 400 });
  const [folder] = await db.select().from(knowledgeFolders).where(and(eq(knowledgeFolders.id, folderId), eq(knowledgeFolders.groupId, id))).limit(1);
  if (!folder) return Response.json({ error: "フォルダが見つかりません" }, { status: 404 });
  const page = { id: crypto.randomUUID(), groupId: id, folderId, authorEmail: user.email, title, body: body.content?.slice(0, 30000) ?? "", status: body.status === "published" ? "published" as const : "draft" as const, imageUrl: body.imageUrl?.trim().slice(0, 2000) || null, imageAlt: body.imageAlt?.trim().slice(0, 200) ?? "" };
  await db.insert(knowledgePages).values(page);
  await recordAudit({ groupId: id, userEmail: user.email, action: "knowledge.page.create", entityType: "knowledge_page", entityId: page.id, summary: `業務ナレッジを作成: ${title}` });
  return Response.json({ page }, { status: 201 });
}
