import { eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { getDb } from "../../../../../../db";
import { getMembership } from "../../../../groups/group-access";
import { shiftAssignmentScenarios, shiftPlans } from "../../../../../../db/schema";

export const dynamic = "force-dynamic";

async function access(planId: string) {
  const user = await getChatGPTUser();
  if (!user) return { error: Response.json({ error: "ログインが必要です" }, { status: 401 }) } as const;
  const db = getDb();
  const [plan] = await db.select().from(shiftPlans).where(eq(shiftPlans.id, planId)).limit(1);
  if (!plan) return { error: Response.json({ error: "シフト計画が見つかりません" }, { status: 404 }) } as const;
  const membership = await getMembership(plan.groupId, user.email);
  if (!membership || (membership.role !== "owner" && membership.role !== "editor")) return { error: Response.json({ error: "割当案の管理権限がありません" }, { status: 403 }) } as const;
  return { db, plan } as const;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string; scenarioId: string }> }) {
  const { id, scenarioId } = await context.params;
  const result = await access(id);
  if ("error" in result) return result.error;
  const [scenario] = await result.db.select().from(shiftAssignmentScenarios).where(eq(shiftAssignmentScenarios.id, scenarioId)).limit(1);
  if (!scenario || scenario.planId !== id) return Response.json({ error: "割当案が見つかりません" }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "JSONを読み取れません" }, { status: 400 }); }
  const assignments = body.assignments && typeof body.assignments === "object" ? body.assignments : JSON.parse(scenario.assignmentsJson);
  const name = typeof body.name === "string" ? body.name.trim() : scenario.name;
  if (!name) return Response.json({ error: "案名を入力してください" }, { status: 400 });
  const [updated] = await result.db.update(shiftAssignmentScenarios).set({ name, description: typeof body.description === "string" ? body.description.trim() : scenario.description, assignmentsJson: JSON.stringify(assignments), updatedAt: new Date().toISOString() }).where(eq(shiftAssignmentScenarios.id, scenarioId)).returning();
  return Response.json({ scenario: { ...updated, assignments } });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; scenarioId: string }> }) {
  const { id, scenarioId } = await context.params;
  const result = await access(id);
  if ("error" in result) return result.error;
  const [scenario] = await result.db.select().from(shiftAssignmentScenarios).where(eq(shiftAssignmentScenarios.id, scenarioId)).limit(1);
  if (!scenario || scenario.planId !== id) return Response.json({ error: "割当案が見つかりません" }, { status: 404 });
  await result.db.delete(shiftAssignmentScenarios).where(eq(shiftAssignmentScenarios.id, scenarioId));
  return Response.json({ ok: true });
}
