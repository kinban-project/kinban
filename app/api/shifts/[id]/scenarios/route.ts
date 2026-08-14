import { and, desc, eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { getMembership } from "../../../groups/group-access";
import { buildLaborWarnings } from "../../../../shift-labor-warnings";
import { shiftTimeToMinutes } from "../../../../shift-time";
import { groupMembers, memberDuties, shiftAssignmentScenarios, shiftAssignments, shiftPlans, shiftSlots, shiftAvailability, groupPreferences, shiftRequestPeriods, shiftRequests, groups } from "../../../../../db/schema";
import { buildDutyCoverageWarnings, buildMemberDutyMap, memberCanTakeDuty } from "../../../../duty-validation";
import { proposalMeta, proposalSettings, proposalSlotSignature } from "../../../../shift-assignment-proposals";
import { pruneInvalidShiftRequests } from "../../../../shift-request-cleanup";

export const dynamic = "force-dynamic";

type ScenarioSettings = {
  priority?: "labor" | "preference" | "fairness" | "minimal";
  laborMode?: "avoid" | "allow";
  unavailableMode?: "exclude" | "prefer_exclude";
  existingMode?: "fixed" | "keep" | "recalculate";
  target?: "unfilled" | "all";
  allocationScope?: "unfilled" | "problems" | "all";
};

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function seededScore(seed: string, value: string) {
  let hash = 2166136261;
  for (const char of `${seed}|${value}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function overlaps(left: { date: string; startTime: string; endTime: string }, right: { date: string; startTime: string; endTime: string }) {
  return left.date === right.date &&
    shiftTimeToMinutes(left.startTime) < shiftTimeToMinutes(right.endTime) &&
    shiftTimeToMinutes(right.startTime) < shiftTimeToMinutes(left.endTime);
}

function preferenceStatus(value: string | undefined) {
  return value === "unavailable" || value === "off" ? value : value === "want" ? "want" : "possible";
}

function settingsFor(value: unknown): ScenarioSettings {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const legacyScope = input.existingMode === "recalculate" && input.target === "all"
    ? "all"
    : input.existingMode === "recalculate"
      ? "problems"
      : "unfilled";
  return {
    priority: ["labor", "preference", "fairness", "minimal"].includes(text(input.priority)) ? input.priority as ScenarioSettings["priority"] : "preference",
    laborMode: input.laborMode === "allow" ? "allow" : "avoid",
    unavailableMode: input.unavailableMode === "prefer_exclude" ? "prefer_exclude" : "exclude",
    existingMode: ["fixed", "keep", "recalculate"].includes(text(input.existingMode)) ? input.existingMode as ScenarioSettings["existingMode"] : "keep",
    target: input.target === "all" ? "all" : "unfilled",
    allocationScope: ["unfilled", "problems", "all"].includes(text(input.allocationScope))
      ? input.allocationScope as ScenarioSettings["allocationScope"]
      : legacyScope,
  };
}

async function access(id: string) {
  const user = await getChatGPTUser();
  if (!user) return { error: Response.json({ error: "ログインが必要です" }, { status: 401 }) } as const;
  const db = getDb();
  const [plan] = await db.select().from(shiftPlans).where(eq(shiftPlans.id, id)).limit(1);
  if (!plan) return { error: Response.json({ error: "シフト計画が見つかりません" }, { status: 404 }) } as const;
  const membership = await getMembership(plan.groupId, user.email);
  if (!membership || (membership.role !== "owner" && membership.role !== "editor")) return { error: Response.json({ error: "割当案の管理権限がありません" }, { status: 403 }) } as const;
  return { user, db, plan } as const;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await access(id);
  if ("error" in result) return result.error;
  const scenarios = await result.db.select().from(shiftAssignmentScenarios).where(eq(shiftAssignmentScenarios.planId, id)).orderBy(desc(shiftAssignmentScenarios.updatedAt));
  return Response.json({ scenarios: scenarios.map((row) => {
    const settings = parseJson(row.settingsJson, {});
    return { ...row, settings, ...proposalMeta(settings), assignments: parseJson(row.assignmentsJson, {}) };
  }) });
}

async function generateAssignments(db: ReturnType<typeof getDb>, planId: string, groupId: string, seed: string, rawSettings: unknown) {
  const settings = settingsFor(rawSettings);
  const [plan] = await db.select().from(shiftPlans).where(eq(shiftPlans.id, planId)).limit(1);
  const slots = await db.select().from(shiftSlots).where(eq(shiftSlots.planId, planId));
  const members = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")));
  const availability = await db.select().from(shiftAvailability).where(eq(shiftAvailability.groupId, groupId));
  const dutyRows = await db.select({ userEmail: memberDuties.userEmail, dutyId: memberDuties.dutyId }).from(memberDuties).where(eq(memberDuties.groupId, groupId));
  const memberDutyMap = buildMemberDutyMap(dutyRows);
  const preferences = await db.select().from(groupPreferences).where(eq(groupPreferences.groupId, groupId));
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  const laborRules: Parameters<typeof buildLaborWarnings>[0]["rules"] = group ? {
    plannedBreakWarning: group.laborPlannedBreakWarning,
    dailyHoursWarning: group.laborDailyHoursWarning,
    weeklyHoursWarning: group.laborWeeklyHoursWarning,
    restIntervalWarning: group.laborRestIntervalWarning,
    consecutiveDaysWarning: group.laborConsecutiveDaysWarning,
    weeklyRestWarning: group.laborWeeklyRestWarning,
    dailyHoursLimitMinutes: group.laborDailyHoursLimitMinutes,
    weeklyHoursLimitMinutes: group.laborWeeklyHoursLimitMinutes,
    restIntervalMinutes: group.laborRestIntervalMinutes,
    consecutiveDaysLimit: group.laborConsecutiveDaysLimit,
    weeklyRestDaysRequired: group.laborWeeklyRestDaysRequired,
    fourWeekRestDaysRequired: group.laborFourWeekRestDaysRequired,
  } : undefined;
  const [period] = await db.select().from(shiftRequestPeriods).where(eq(shiftRequestPeriods.planId, planId)).limit(1);
  await pruneInvalidShiftRequests(db, planId);
  const requests = period ? await db.select().from(shiftRequests).where(eq(shiftRequests.periodId, period.id)) : [];
  const basicPreference = new Map(preferences.map((row) => [row.userEmail, row]));
  const existingBySlot = new Map<string, string[]>();
  const existingChunks = await Promise.all(chunk(slots.map((slot) => slot.id), 50).map((slotIds) =>
    slotIds.length ? db.select().from(shiftAssignments).where(inArray(shiftAssignments.slotId, slotIds)) : Promise.resolve([]),
  ));
  const allExistingRows = existingChunks.flat();
  for (const row of allExistingRows) existingBySlot.set(row.slotId, [...(existingBySlot.get(row.slotId) ?? []), row.userEmail]);
  const existingAssignments: Record<string, string[]> = {};
  for (const slot of slots) existingAssignments[slot.id] = [...new Set(existingBySlot.get(slot.id) ?? [])];
  const allocationScope = settings.allocationScope ?? "unfilled";
  const problemSlotIds = new Set<string>();
  if (allocationScope === "problems") {
    for (const slot of slots) {
      const count = existingAssignments[slot.id]?.length ?? 0;
      if (count !== slot.requiredCount) problemSlotIds.add(slot.id);
      if (slot.dutyId && (existingAssignments[slot.id] ?? []).some((email) => !memberCanTakeDuty(slot, email, memberDutyMap))) problemSlotIds.add(slot.id);
    }
    const existingRows = slots.flatMap((slot) => (existingAssignments[slot.id] ?? []).map((userEmail) => ({ slotId: slot.id, userEmail })));
    const existingLaborWarnings = buildLaborWarnings({
      slots,
      assignments: existingRows,
      members,
      rules: laborRules,
      planStartDate: plan?.startDate ?? slots[0]?.date ?? "",
      planEndDate: plan?.endDate ?? slots[slots.length - 1]?.date ?? "",
    });
    for (const warning of existingLaborWarnings) for (const slotId of warning.slotIds) problemSlotIds.add(slotId);
    const existingCoverageWarnings = buildDutyCoverageWarnings({
      slots,
      assignments: existingRows,
      members: members.map((member) => ({ ...member, dutyIds: [...(memberDutyMap.get(member.userEmail) ?? new Set<string>())] })),
    });
    for (const warning of existingCoverageWarnings) for (const slotId of warning.slotIds) problemSlotIds.add(slotId);
    for (let index = 0; index < slots.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < slots.length; nextIndex += 1) {
        const left = slots[index];
        const right = slots[nextIndex];
        if (!overlaps(left, right)) continue;
        const shared = (existingAssignments[left.id] ?? []).some((email) => (existingAssignments[right.id] ?? []).includes(email));
        if (shared) {
          problemSlotIds.add(left.id);
          problemSlotIds.add(right.id);
        }
      }
    }
  }
  const assignments: Record<string, string[]> = {};
  for (const slot of slots) {
    assignments[slot.id] = allocationScope === "all" || (allocationScope === "problems" && problemSlotIds.has(slot.id))
      ? []
      : [...(existingAssignments[slot.id] ?? [])];
  }
  const assignedFor = (email: string) => slots.filter((slot) => (assignments[slot.id] ?? []).includes(email));
  const laborCost = (email: string, slot: typeof slots[number]) => {
    if (settings.laborMode === "allow") return 0;
    const candidateRows = slots.flatMap((item) => (assignments[item.id] ?? []).includes(email) || item.id === slot.id
      ? [{ slotId: item.id, userEmail: email }]
      : []);
    return buildLaborWarnings({
      slots,
      assignments: candidateRows,
      members,
      rules: laborRules,
      planStartDate: plan?.startDate ?? slot.date,
      planEndDate: plan?.endDate ?? slot.date,
    }).filter((warning) => warning.memberEmail === email).length;
  };
  const canWork = (email: string, slot: typeof slots[number]) => {
    const request = requests.find((row) => row.userEmail === email && row.date === slot.date && row.startTime === slot.startTime && row.endTime === slot.endTime);
    if (request) {
      const status = preferenceStatus(request.preference);
      return { status, allowed: status !== "unavailable" && status !== "off" };
    }
    const memberAvailability = availability.filter((row) => row.userEmail === email && row.dayOfWeek === new Date(`${slot.date}T00:00:00Z`).getUTCDay());
    const match = memberAvailability.find((row) => !row.startTime || (shiftTimeToMinutes(row.startTime) <= shiftTimeToMinutes(slot.startTime) && shiftTimeToMinutes(row.endTime) >= shiftTimeToMinutes(slot.endTime)));
    const status = preferenceStatus(match?.status ?? (memberAvailability.length ? "unavailable" : undefined));
    const weekend = [0, 6].includes(new Date(`${slot.date}T00:00:00Z`).getUTCDay());
    const weekendRestricted = weekend && basicPreference.get(email)?.weekendPolicy === "prefer_off";
    const allowed = settings.unavailableMode === "exclude"
      ? status !== "unavailable" && status !== "off"
      : true;
    return { status, allowed: allowed && !weekendRestricted };
  };
  const orderedSlots = [...slots].sort((a, b) => {
    const aCandidates = members.filter((member) => memberCanTakeDuty(a, member.userEmail, memberDutyMap) && canWork(member.userEmail, a).allowed).length;
    const bCandidates = members.filter((member) => memberCanTakeDuty(b, member.userEmail, memberDutyMap) && canWork(member.userEmail, b).allowed).length;
    return aCandidates - bCandidates || a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
  });
  for (const slot of orderedSlots) {
    const current = assignments[slot.id] ?? [];
    const candidates = members.filter((member) => {
      if (current.includes(member.userEmail)) return false;
      if (!memberCanTakeDuty(slot, member.userEmail, memberDutyMap)) return false;
      const availabilityResult = canWork(member.userEmail, slot);
      if (!availabilityResult.allowed) return false;
      return !assignedFor(member.userEmail).some((other) => overlaps(slot, other));
    }).sort((a, b) => {
      const av = canWork(a.userEmail, slot).status;
      const bv = canWork(b.userEmail, slot).status;
      const prefScore = (value: string) => value === "want" ? 30 : value === "possible" ? 10 : 0;
      const aCount = assignedFor(a.userEmail).length;
      const bCount = assignedFor(b.userEmail).length;
      const preferenceOrder = settings.priority === "preference" ? prefScore(bv) - prefScore(av) : 0;
      const fairnessOrder = settings.priority === "fairness" ? aCount - bCount : 0;
      const minimalOrder = settings.priority === "minimal" ? bCount - aCount : 0;
      const laborOrder = settings.priority === "labor" ? laborCost(a.userEmail, slot) - laborCost(b.userEmail, slot) : 0;
      return laborOrder || preferenceOrder || fairnessOrder || minimalOrder || seededScore(seed, `${slot.id}|${a.userEmail}`) - seededScore(seed, `${slot.id}|${b.userEmail}`);
    });
    for (const candidate of candidates) {
      if ((assignments[slot.id] ?? []).length >= slot.requiredCount) break;
      assignments[slot.id].push(candidate.userEmail);
    }
  }
  const warnings = plan ? buildLaborWarnings({ slots, assignments: slots.flatMap((slot) => (assignments[slot.id] ?? []).map((userEmail) => ({ slotId: slot.id, userEmail }))), members, rules: laborRules, planStartDate: plan.startDate, planEndDate: plan.endDate }) : [];
  const dutyWarnings = slots.flatMap((slot) => (assignments[slot.id] ?? []).filter((email) => !memberCanTakeDuty(slot, email, memberDutyMap)).map((email) => `${email}は${slot.dutyNameSnapshot || "担当付き勤務枠"}を担当可能として登録されていません`));
  const coverageWarnings = buildDutyCoverageWarnings({
    slots,
    assignments: slots.flatMap((slot) => (assignments[slot.id] ?? []).map((userEmail) => ({ slotId: slot.id, userEmail }))),
    members: members.map((member) => ({ ...member, dutyIds: [...(memberDutyMap.get(member.userEmail) ?? new Set<string>())] })),
  });
  return { assignments, settings, seed, warnings: [...warnings.map((warning) => warning.message), ...dutyWarnings, ...coverageWarnings.map((warning) => warning.message)], coverageWarnings, unfilled: slots.filter((slot) => (assignments[slot.id] ?? []).length < slot.requiredCount).length };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await access(id);
  if ("error" in result) return result.error;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "JSONを読み取れません" }, { status: 400 }); }
  const name = text(body.name);
  if (!name) return Response.json({ error: "案名を入力してください" }, { status: 400 });
  const seed = text(body.seed, crypto.randomUUID());
  const generated = body.action === "auto" ? await generateAssignments(result.db, id, result.plan.groupId, seed, body.settings) : null;
  const assignments = generated?.assignments ?? (body.assignments && typeof body.assignments === "object" ? body.assignments : {});
  const settings = generated?.settings ?? settingsFor(body.settings);
  const baseSlots = await result.db.select().from(shiftSlots).where(eq(shiftSlots.planId, id));
  const storedSettings = proposalSettings(settings, { proposalStatus: "candidate", baseSlotIds: baseSlots.map((slot) => slot.id), baseSlotSignature: proposalSlotSignature(baseSlots) });
  const [row] = await result.db.insert(shiftAssignmentScenarios).values({ id: crypto.randomUUID(), planId: id, name, description: text(body.description), createdBy: result.user.email, seed, settingsJson: JSON.stringify(storedSettings), baseVersion: result.plan.version, assignmentsJson: JSON.stringify(assignments) }).returning();
  return Response.json({ scenario: { ...row, settings: storedSettings, ...proposalMeta(storedSettings), assignments }, generated }, { status: 201 });
}
