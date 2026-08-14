import { eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { getDb } from "../../../../../../db";
import { getMembership } from "../../../../groups/group-access";
import { groupDuties, groupMembers, memberDuties, shiftAssignmentScenarios, shiftPlans, shiftSlots } from "../../../../../../db/schema";
import { buildDutyCoverageWarnings, buildMemberDutyMap, validateDutyAssignments } from "../../../../../duty-validation";
import { proposalMeta, proposalSettings } from "../../../../../shift-assignment-proposals";

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
  const currentSettings = (() => { try { return JSON.parse(scenario.settingsJson || "{}"); } catch { return {}; } })();
  if (proposalMeta(currentSettings).proposalStatus === "published") return Response.json({ error: "公開中の割当案は直接編集できません。複製して修正してください" }, { status: 409 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "JSONを読み取れません" }, { status: 400 }); }
  let assignments: unknown = body.assignments && typeof body.assignments === "object" ? body.assignments : {};
  if (!body.assignments) {
    try { assignments = JSON.parse(scenario.assignmentsJson); } catch { assignments = {}; }
  }
  const name = typeof body.name === "string" ? body.name.trim() : scenario.name;
  if (!name) return Response.json({ error: "案名を入力してください" }, { status: 400 });
  const storedSettings = proposalSettings(currentSettings, { proposalStatus: "candidate" });
  const slots = await result.db.select().from(shiftSlots).where(eq(shiftSlots.planId, id));
  const members = await result.db.select().from(groupMembers).where(eq(groupMembers.groupId, result.plan.groupId));
  const duties = await result.db.select({ id: groupDuties.id, name: groupDuties.name }).from(groupDuties).where(eq(groupDuties.groupId, result.plan.groupId));
  const dutyRows = await result.db.select({ userEmail: memberDuties.userEmail, dutyId: memberDuties.dutyId }).from(memberDuties).where(eq(memberDuties.groupId, result.plan.groupId));
  const memberDutyMap = buildMemberDutyMap(dutyRows);
  const assignmentRows = Object.entries(assignments as Record<string, unknown>).flatMap(([slotId, users]) => Array.isArray(users) ? users.filter((email): email is string => typeof email === "string").map((userEmail) => ({ slotId, userEmail })) : []);
  const dutyErrors = validateDutyAssignments(slots, assignmentRows, memberDutyMap);
  if (dutyErrors.length) return Response.json({ error: "担当可能ではないメンバーが割り当てられています", dutyErrors }, { status: 409 });
  const coverageWarnings = buildDutyCoverageWarnings({ slots, assignments: assignmentRows, members: members.filter((member) => member.status === "active").map((member) => ({ userEmail: member.userEmail, dutyIds: [...(memberDutyMap.get(member.userEmail) ?? new Set<string>())] })), duties });
  const [updated] = await result.db.update(shiftAssignmentScenarios).set({ name, description: typeof body.description === "string" ? body.description.trim() : scenario.description, settingsJson: JSON.stringify(storedSettings), assignmentsJson: JSON.stringify(assignments), updatedAt: new Date().toISOString() }).where(eq(shiftAssignmentScenarios.id, scenarioId)).returning();
  return Response.json({ scenario: { ...updated, settings: storedSettings, ...proposalMeta(storedSettings), assignments }, coverageWarnings });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; scenarioId: string }> }) {
  const { id, scenarioId } = await context.params;
  const result = await access(id);
  if ("error" in result) return result.error;
  const [scenario] = await result.db.select().from(shiftAssignmentScenarios).where(eq(shiftAssignmentScenarios.id, scenarioId)).limit(1);
  if (!scenario || scenario.planId !== id) return Response.json({ error: "割当案が見つかりません" }, { status: 404 });
  let settings: unknown = {};
  try { settings = JSON.parse(scenario.settingsJson || "{}"); } catch { /* legacy rows */ }
  if (proposalMeta(settings).proposalStatus === "published") return Response.json({ error: "公開中の割当案は削除できません" }, { status: 409 });
  await result.db.delete(shiftAssignmentScenarios).where(eq(shiftAssignmentScenarios.id, scenarioId));
  return Response.json({ ok: true });
}
