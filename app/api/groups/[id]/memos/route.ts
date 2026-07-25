import { and, asc, desc, eq, isNull, like, or } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { groupMembers, memoFolders, memos } from "../../../../../db/schema";
import { recordAudit } from "../../../../audit-log";
import { requireGroupMembership } from "../../group-access";

export const dynamic = "force-dynamic";

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
}

async function currentUser() {
  const user = await getChatGPTUser();
  if (!user) return null;
  return user;
}

async function ensureDailyFolder(groupId: string, email: string) {
  const db = getDb();
  const [existing] = await db.select().from(memoFolders)
    .where(and(eq(memoFolders.groupId, groupId), eq(memoFolders.name, "日報"))).limit(1);
  if (existing) return existing;
  const folder = { id: crypto.randomUUID(), groupId, name: "日報", createdBy: email };
  try {
    await db.insert(memoFolders).values(folder);
    return folder;
  } catch {
    const [created] = await db.select().from(memoFolders)
      .where(and(eq(memoFolders.groupId, groupId), eq(memoFolders.name, "日報"))).limit(1);
    return created ?? folder;
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id: groupId } = await context.params;
  const membership = await requireGroupMembership(groupId, user.email);
  const db = getDb();
  await ensureDailyFolder(groupId, user.email);
  const params = new URL(request.url).searchParams;
  const folderId = params.get("folderId")?.trim() ?? "";
  const q = params.get("q")?.trim() ?? "";
  const targetDate = params.get("date")?.trim() ?? "";
  const requestedAuthorEmail = params.get("authorEmail")?.trim() ?? "";
  const isManager = membership.role === "owner" || membership.role === "editor";
  const folders = await db.select().from(memoFolders).where(eq(memoFolders.groupId, groupId)).orderBy(asc(memoFolders.name));
  const conditions = [eq(memos.groupId, groupId), isNull(memos.deletedAt)];
  if (folderId) conditions.push(eq(memos.folderId, folderId));
  if (targetDate) conditions.push(eq(memos.targetDate, targetDate));
  if (q) conditions.push(or(like(memos.title, `%${q}%`), like(memos.body, `%${q}%`))!);
  if (!isManager) {
    conditions.push(eq(memos.authorEmail, user.email));
    conditions.push(or(eq(memos.visibility, "group"), eq(memos.authorEmail, user.email))!);
  } else if (requestedAuthorEmail && requestedAuthorEmail !== "all") {
    conditions.push(eq(memos.authorEmail, requestedAuthorEmail === "self" ? user.email : requestedAuthorEmail));
  }
  const rows = await db.select().from(memos).where(and(...conditions)).orderBy(desc(memos.targetDate), desc(memos.updatedAt));
  const members = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")));
  const displayNames = new Map(members.map((member) => [member.userEmail, member.displayName || member.userEmail]));
  return Response.json({
    folders,
    notes: rows.map((note) => ({ ...note, authorName: displayNames.get(note.authorEmail) ?? note.authorEmail, canEdit: note.authorEmail === user.email || membership.role === "owner" || membership.role === "editor" })),
    members: isManager ? members.map((member) => ({ email: member.userEmail, name: displayNames.get(member.userEmail) ?? member.userEmail })) : [],
    currentEmail: user.email,
    role: membership.role,
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id: groupId } = await context.params;
  const membership = await requireGroupMembership(groupId, user.email);
  const body = await request.json() as { action?: "create" | "folder"; folderId?: string; name?: string; targetDate?: string; title?: string; body?: string; visibility?: string };
  const db = getDb();

  if (body.action === "folder") {
    if (membership.role !== "owner" && membership.role !== "editor") return Response.json({ error: "フォルダ作成は管理者のみ可能です" }, { status: 403 });
    const name = body.name?.trim().slice(0, 80) ?? "";
    if (!name) return Response.json({ error: "フォルダ名を入力してください" }, { status: 400 });
    const folder = { id: crypto.randomUUID(), groupId, name, createdBy: user.email };
    try { await db.insert(memoFolders).values(folder); } catch { return Response.json({ error: "同じ名前のフォルダが既にあります" }, { status: 409 }); }
    await recordAudit({ groupId, userEmail: user.email, action: "memo.folder.create", entityType: "memo_folder", entityId: folder.id, summary: `業務メモフォルダを作成: ${name}` });
    return Response.json({ folder }, { status: 201 });
  }

  if (body.action !== "create") return Response.json({ error: "不正な操作です" }, { status: 400 });
  const folder = body.folderId
    ? (await db.select().from(memoFolders).where(and(eq(memoFolders.id, body.folderId), eq(memoFolders.groupId, groupId))).limit(1))[0]
    : await ensureDailyFolder(groupId, user.email);
  if (!folder) return Response.json({ error: "フォルダが見つかりません" }, { status: 404 });
  const targetDate = body.targetDate?.trim() || todayKey();
  const title = body.title?.trim().slice(0, 120) || (folder.name === "日報" ? `${targetDate} 日報` : "");
  if (!title) return Response.json({ error: "タイトルを入力してください" }, { status: 400 });
  const visibility = ["group", "managers", "private"].includes(body.visibility ?? "") ? body.visibility! : "group";
  const note = { id: crypto.randomUUID(), groupId, folderId: folder.id, authorEmail: user.email, targetDate, title, body: body.body?.trim().slice(0, 10000) ?? "", visibility: visibility as "group" | "managers" | "private" };
  await db.insert(memos).values(note);
  await recordAudit({ groupId, userEmail: user.email, action: "memo.create", entityType: "memo", entityId: note.id, summary: `業務メモを作成: ${title}` });
  return Response.json({ note }, { status: 201 });
}
