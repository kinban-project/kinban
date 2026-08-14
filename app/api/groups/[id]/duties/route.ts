import { and, asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { groupDuties } from "../../../../../db/schema";
import { getGroup, getMembership } from "../../group-access";
import { recordAudit } from "../../../../audit-log";

export const dynamic = "force-dynamic";

async function requireAdmin(groupId: string) {
  const user = await getChatGPTUser();
  if (!user) return { error: Response.json({ error: "ログインが必要です" }, { status: 401 }) } as const;
  if (!(await getGroup(groupId))) return { error: Response.json({ error: "グループが見つかりません" }, { status: 404 }) } as const;
  const membership = await getMembership(groupId, user.email);
  if (!membership || (membership.role !== "owner" && membership.role !== "editor")) return { error: Response.json({ error: "管理者権限が必要です" }, { status: 403 }) } as const;
  return { user, db: getDb() } as const;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await requireAdmin(id);
  if ("error" in result) return result.error;
  const duties = await result.db.select().from(groupDuties).where(eq(groupDuties.groupId, id)).orderBy(asc(groupDuties.displayOrder), asc(groupDuties.name));
  return Response.json({ duties });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await requireAdmin(id);
  if ("error" in result) return result.error;
  const body = await request.json().catch(() => ({})) as { name?: unknown; description?: unknown };
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return Response.json({ error: "担当名を入力してください" }, { status: 400 });
  const existing = await result.db.select({ id: groupDuties.id }).from(groupDuties).where(and(eq(groupDuties.groupId, id), eq(groupDuties.name, name))).limit(1);
  if (existing.length) return Response.json({ error: "同じ担当名がすでにあります" }, { status: 409 });
  const duties = await result.db.select({ displayOrder: groupDuties.displayOrder }).from(groupDuties).where(eq(groupDuties.groupId, id));
  const duty = { id: crypto.randomUUID(), groupId: id, name, description: typeof body.description === "string" ? body.description.trim().slice(0, 300) : "", displayOrder: duties.reduce((max, item) => Math.max(max, item.displayOrder), -1) + 1, status: "active" as const };
  await result.db.insert(groupDuties).values(duty);
  await recordAudit({ groupId: id, userEmail: result.user.email, action: "group.duty.create", entityType: "groupDuty", entityId: duty.id, summary: `担当を追加: ${name}` });
  return Response.json({ duty }, { status: 201 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await requireAdmin(id);
  if ("error" in result) return result.error;
  const body = await request.json().catch(() => ({})) as { dutyId?: unknown; name?: unknown; description?: unknown; status?: unknown };
  const dutyId = typeof body.dutyId === "string" ? body.dutyId : "";
  if (!dutyId) return Response.json({ error: "担当IDが必要です" }, { status: 400 });
  const [current] = await result.db.select().from(groupDuties).where(and(eq(groupDuties.id, dutyId), eq(groupDuties.groupId, id))).limit(1);
  if (!current) return Response.json({ error: "担当が見つかりません" }, { status: 404 });
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : current.name;
  const status = body.status === "inactive" ? "inactive" : body.status === "active" ? "active" : current.status;
  if (!name) return Response.json({ error: "担当名を入力してください" }, { status: 400 });
  await result.db.update(groupDuties).set({ name, status, ...(typeof body.description === "string" ? { description: body.description.trim().slice(0, 300) } : {}) }).where(eq(groupDuties.id, dutyId));
  await recordAudit({ groupId: id, userEmail: result.user.email, action: "group.duty.update", entityType: "groupDuty", entityId: dutyId, summary: `担当を更新: ${name}`, details: { status } });
  const [duty] = await result.db.select().from(groupDuties).where(eq(groupDuties.id, dutyId)).limit(1);
  return Response.json({ duty });
}
