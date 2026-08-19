"use client";

import { useEffect, useMemo, useState } from "react";
import { localApiFetch } from "./local-api";
import { getShiftDisplayLabel, getShiftDisplayStatus } from "./shift-status";
import { displayShiftTime, shiftTimeToMinutes } from "./shift-time";
import { buildLaborWarnings, type LaborRules, type LaborWarning } from "./shift-labor-warnings";
import { proposalMatchesSlots, proposalMeta, type AssignmentProposalSlot } from "./shift-assignment-proposals";
import { buildDutyCoverageWarnings, memberCanTakeDuty, parseDutyScopeIds } from "./duty-validation";

type Group = { id: string; name: string; membership: { role: string } };
type Plan = {
  id: string;
  groupId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "draft" | "published";
  version: number;
  requestStatus?: "pending" | "open" | "closed" | null;
};
type Slot = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  requiredCount: number;
  role: string;
  dutyId?: string | null;
  dutyNameSnapshot?: string | null;
  dutyScopeIds?: string | null;
};
type Member = { userEmail: string; displayName?: string | null; dutyIds?: string[] };
type MemberAvailability = {
  userEmail: string;
  dayOfWeek: number;
  status: string;
  startTime: string;
  endTime: string;
};
type RequestRow = {
  userEmail: string;
  date: string;
  startTime: string;
  endTime: string;
  preference: string;
};
type RequestSubmission = {
  periodId: string;
  userEmail: string;
  savedAt: string;
  requestComment?: string;
};
type Detail = {
  plan: Plan;
  slots: Slot[];
  assignments: Array<{ slotId: string; userEmail: string }>;
  members: Member[];
  duties?: Array<{ id: string; name: string }>;
  memberAvailability?: MemberAvailability[];
  requests?: RequestRow[];
  requestSubmissions?: RequestSubmission[];
  memberPreferences?: Array<Preference & { userEmail: string }>;
  autoBreakSuggestion?: boolean;
  laborRules?: LaborRules;
  demoTime?: { currentAt: string; today: string; timezone: string };
};
type AssignmentScenario = {
  id: string;
  name: string;
  description: string;
  seed: string;
  baseVersion: number;
  settings: Record<string, unknown>;
  assignments: Record<string, string[]>;
  createdAt: string;
  updatedAt: string;
  proposalStatus?: "candidate" | "published" | "superseded";
  publishedAt?: string;
  publishedBy?: string;
};
type AllocationScope = "unfilled" | "problems" | "all";
type CandidateFilter = "want" | "possible" | "off" | "unavailable" | "duty";
type Preference = {
  userEmail?: string;
  minDays: number;
  maxDays: number;
  minHours: number;
  maxHours: number;
};
type AssignmentIssue = {
  id: string;
  kind: "shortage" | "excess" | "overlap" | "duty" | "coverage" | "labor";
  slotIds: string[];
  message: string;
  memberEmail?: string;
  laborWarning?: LaborWarning;
};

function hours(start: string, end: string) {
  return Math.max(
    0,
    (shiftTimeToMinutes(end) - shiftTimeToMinutes(start)) / 60,
  );
}
function preferenceClass(value: string) {
  return ["want", "possible", "off", "unavailable"].includes(value)
    ? value
    : "possible";
}
function overlaps(left: Slot, right: Slot) {
  return (
    left.date === right.date &&
    shiftTimeToMinutes(left.startTime) < shiftTimeToMinutes(right.endTime) &&
    shiftTimeToMinutes(right.startTime) < shiftTimeToMinutes(left.endTime)
  );
}
function formatSubmissionTime(value: string | null) {
  if (!value) return "未登録";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
function suggestedBreakMinutes(slots: Slot[]) {
  const ordered = [...slots].sort(
    (left, right) =>
      shiftTimeToMinutes(left.startTime) - shiftTimeToMinutes(right.startTime),
  );
  const blocks: Array<{ start: number; end: number }> = [];
  for (const slot of ordered) {
    const start = shiftTimeToMinutes(slot.startTime);
    const end = shiftTimeToMinutes(slot.endTime);
    const current = blocks[blocks.length - 1];
    if (current && start <= current.end) current.end = Math.max(current.end, end);
    else blocks.push({ start, end });
  }
  return blocks.reduce((total, block) => {
    const duration = block.end - block.start;
    return total + (duration > 480 ? 60 : duration > 360 ? 45 : 0);
  }, 0);
}
function formatShiftDate(value: string) {
  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return value;
  const weekday = new Intl.DateTimeFormat("ja-JP", {
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(date);
  return `${value}（${weekday}）`;
}

function laborWarningLabel(kind: LaborWarning["kind"]) {
  switch (kind) {
    case "daily_hours": return "日上限超過";
    case "weekly_hours": return "週上限超過";
    case "rest_interval": return "休息間隔不足";
    case "consecutive_days": return "連勤上限";
    case "weekly_rest": return "休日数不足";
    case "planned_break": return "予定休憩確認";
    default: return "労務注意";
  }
}

export default function ShiftAdjustment({
  initialGroupId,
}: {
  initialGroupId?: string;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [groupId, setGroupId] = useState(initialGroupId ?? "");
  const [planId, setPlanId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [demoToday, setDemoToday] = useState<string>();
  const [baseAssignments, setBaseAssignments] = useState<Record<string, string[]>>({});
  const [preferences, setPreferences] = useState<Record<string, Preference>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [showAllWarnings, setShowAllWarnings] = useState(false);
  const [showAllPlannedBreaks, setShowAllPlannedBreaks] = useState(false);
  const [warningFilter, setWarningFilter] = useState<"all" | "warnings" | "duty" | "coverage" | "labor" | "plannedBreak">("all");
  const [candidateFilters, setCandidateFilters] = useState<Record<CandidateFilter, boolean>>({
    want: true,
    possible: true,
    off: false,
    unavailable: false,
    duty: false,
  });
  const [dutyDirectoryOpen, setDutyDirectoryOpen] = useState(false);
  const [dutyDirectoryScope, setDutyDirectoryScope] = useState<"visible" | "all">("all");
  const [viewMode, setViewMode] = useState<"preview" | "list" | "calendar" | "member">("preview");
  const [scenarios, setScenarios] = useState<AssignmentScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioDescription, setScenarioDescription] = useState("");
  const [scenarioSeed, setScenarioSeed] = useState("");
  const [scenarioPriority, setScenarioPriority] = useState("preference");
  const [scenarioLaborMode, setScenarioLaborMode] = useState("avoid");
  const [scenarioUnavailableMode, setScenarioUnavailableMode] = useState("exclude");
  const [scenarioAllocationScope, setScenarioAllocationScope] = useState<AllocationScope>("problems");
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [showScenarioCompare, setShowScenarioCompare] = useState(false);
  const selectedGroupName = groups.find((group) => group.id === groupId)?.name;
  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId);
  const scenarioIsStale = Boolean(selectedScenario && detail && !proposalMatchesSlots(proposalMeta(selectedScenario.settings), detail.slots as AssignmentProposalSlot[]));
  function allocationScopeFor(settings: Record<string, unknown> | undefined): AllocationScope {
    if (settings?.allocationScope === "all" || settings?.allocationScope === "problems" || settings?.allocationScope === "unfilled") return settings.allocationScope;
    if (settings?.existingMode === "recalculate" && settings?.target === "all") return "all";
    if (settings?.existingMode === "recalculate") return "problems";
    return "unfilled";
  }
  function defaultScenarioName() {
    const priority = scenarioPriority === "labor" ? "労務優先" : scenarioPriority === "fairness" ? "公平性優先" : scenarioPriority === "minimal" ? "変更最小" : "希望優先";
    const labor = scenarioLaborMode === "allow" ? "注意許容" : "注意回避";
    const unavailable = scenarioUnavailableMode === "prefer_exclude" ? "不可許容" : "不可除外";
    const scope = scenarioAllocationScope === "all" ? "全枠再計算" : scenarioAllocationScope === "problems" ? "問題枠再配置" : "不足補充";
    return `${priority}/${labor}/${unavailable}/${scope}`;
  }
  function uniqueScenarioName(baseName: string) {
    const usedNames = new Set(scenarios.map((scenario) => scenario.name));
    if (!usedNames.has(baseName)) return baseName;
    let suffix = 2;
    while (usedNames.has(`${baseName} (${suffix})`)) suffix += 1;
    return `${baseName} (${suffix})`;
  }
  async function loadGroups() {
    const response = await localApiFetch("/api/groups");
    if (!response.ok) return;
    const data = (await response.json()) as { groups: Group[] };
    setGroups(data.groups);
    if (!groupId && data.groups[0]) setGroupId(data.groups[0].id);
  }
  async function loadPlans(id: string) {
    if (!id) return;
    const response = await localApiFetch(
      `/api/shifts?groupId=${encodeURIComponent(id)}`,
    );
    if (!response.ok) return;
    const data = (await response.json()) as { plans: Plan[]; demoTime?: { today: string } };
    const next = data.plans;
    setDemoToday(data.demoTime?.today);
    setPlans(next);
    if (!planId && next[0]) setPlanId(next[0].id);
  }
  async function openPlan(id: string) {
    if (!id) return;
    const response = await localApiFetch(`/api/shifts/${id}`);
    if (response.ok) {
      const next = (await response.json()) as Detail;
      setDetail(next);
      setDemoToday(next.demoTime?.today);
      const map: Record<string, string[]> = {};
      for (const row of next.assignments) (map[row.slotId] ??= []).push(row.userEmail);
      setBaseAssignments(map);
    }
  }
  async function loadScenarios(id: string) {
    if (!id) return;
    const response = await localApiFetch(`/api/shifts/${id}/scenarios`);
    if (!response.ok) return;
    const data = (await response.json()) as { scenarios: AssignmentScenario[] };
    setScenarios(data.scenarios ?? []);
    setSelectedScenarioId("");
  }
  async function loadPreferences(id: string) {
    const response = await localApiFetch(`/api/groups/${id}/preferences`);
    if (!response.ok) return;
    const data = (await response.json()) as { preferences: Preference };
    setPreferences((current) => ({ ...current, [id]: data.preferences }));
  }
  useEffect(() => {
    void loadGroups();
  }, []);
  useEffect(() => {
    if (initialGroupId) setGroupId(initialGroupId);
  }, [initialGroupId]);
  useEffect(() => {
    void loadPlans(groupId);
    if (groupId) void loadPreferences(groupId);
  }, [groupId]);
  useEffect(() => {
    void openPlan(planId);
    void loadScenarios(planId);
  }, [planId]);
  const assignments = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const row of detail?.assignments ?? [])
      (map[row.slotId] ??= []).push(row.userEmail);
    return map;
  }, [detail]);
  const laborWarnings = useMemo(() => {
    if (!detail) return [];
    return buildLaborWarnings({
      slots: detail.slots,
      assignments: detail.assignments,
      members: detail.members,
      duties: detail.duties,
      autoBreakSuggestion: detail.autoBreakSuggestion,
      rules: detail.laborRules,
      planStartDate: detail.plan.startDate,
      planEndDate: detail.plan.endDate,
    });
  }, [detail]);
  const timeColumns = useMemo(
    () =>
      [
        ...new Map(
          (detail?.slots ?? []).map((slot) => [
            `${slot.startTime}|${slot.endTime}`,
            { startTime: slot.startTime, endTime: slot.endTime },
          ]),
        ).values(),
      ].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [detail],
  );
  const assignmentIssues = useMemo<AssignmentIssue[]>(() => {
    if (!detail) return [];
    const issues = new Map<string, AssignmentIssue>();
    for (const slot of detail.slots) {
      const assignedCount = new Set(assignments[slot.id] ?? []).size;
      if (assignedCount < slot.requiredCount) {
        issues.set(`shortage:${slot.id}`, {
          id: `shortage:${slot.id}`,
          kind: "shortage",
          slotIds: [slot.id],
          message: `${slot.date} ${displayShiftTime(slot.startTime)} ${slot.role || "共通"}：必要人数${slot.requiredCount}人に対して${assignedCount}人です`,
        });
      }
      if (assignedCount > slot.requiredCount) {
        issues.set(`excess:${slot.id}`, {
          id: `excess:${slot.id}`,
          kind: "excess",
          slotIds: [slot.id],
          message: `${slot.date} ${displayShiftTime(slot.startTime)} ${slot.role || "共通"}：${assignedCount - slot.requiredCount}人超過しています`,
        });
      }
    }
    const assignedSlots = detail.slots.flatMap((slot) =>
      [...new Set(assignments[slot.id] ?? [])].map((userEmail) => ({ slot, userEmail })),
    );
    const memberDutyMap = new Map(detail.members.map((member) => [member.userEmail, new Set(member.dutyIds ?? [])]));
    for (const { slot, userEmail } of assignedSlots) {
      if (!slot.dutyId && parseDutyScopeIds(slot.dutyScopeIds).length === 0) continue;
      const member = detail.members.find((row) => row.userEmail === userEmail);
      if (memberCanTakeDuty(slot, userEmail, memberDutyMap)) continue;
      const memberName = member?.displayName || userEmail.split("@")[0];
      const dutyName = slot.dutyNameSnapshot || "担当範囲";
      issues.set(`duty:${slot.id}:${userEmail}`, {
        id: `duty:${slot.id}:${userEmail}`,
        kind: "duty",
        slotIds: [slot.id],
        memberEmail: userEmail,
        message: `${slot.date} ${memberName}：${dutyName}の担当可否が未設定または不可です（既存割当の要確認）`,
      });
    }
    for (const warning of buildDutyCoverageWarnings({
      slots: detail.slots,
      assignments: detail.assignments,
      members: detail.members,
      duties: detail.duties,
    })) {
      issues.set(warning.id, {
        id: warning.id,
        kind: "coverage",
        slotIds: warning.slotIds,
        message: warning.message,
      });
    }
    for (let index = 0; index < assignedSlots.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < assignedSlots.length; nextIndex += 1) {
        const left = assignedSlots[index];
        const right = assignedSlots[nextIndex];
        if (left.userEmail !== right.userEmail || !overlaps(left.slot, right.slot)) continue;
        const [firstId, secondId] = [left.slot.id, right.slot.id].sort();
        const member = detail.members.find((row) => row.userEmail === left.userEmail);
        const memberName = member?.displayName || left.userEmail.split("@")[0];
        issues.set(`overlap:${left.userEmail}:${firstId}:${secondId}`, {
          id: `overlap:${left.userEmail}:${firstId}:${secondId}`,
          kind: "overlap",
          slotIds: [left.slot.id, right.slot.id],
          memberEmail: left.userEmail,
          message: `${left.slot.date} ${memberName}：${left.slot.role || "共通"}と${right.slot.role || "共通"}の時間帯が重複しています`,
        });
      }
    }
    for (const warning of laborWarnings) {
      issues.set(warning.id, {
        id: warning.id,
        kind: "labor",
        slotIds: warning.slotIds,
        message: warning.message,
        laborWarning: warning,
      });
    }
    return [...issues.values()];
  }, [detail, assignments, laborWarnings]);
  const filteredIssues = useMemo(() => {
    if (warningFilter === "labor") return assignmentIssues.filter((issue) => issue.kind === "labor");
    if (warningFilter === "duty") return assignmentIssues.filter((issue) => issue.kind === "duty");
    if (warningFilter === "coverage") return assignmentIssues.filter((issue) => issue.kind === "coverage");
    if (warningFilter === "warnings") return assignmentIssues.filter((issue) => ["shortage", "excess", "overlap"].includes(issue.kind));
    return assignmentIssues;
  }, [assignmentIssues, warningFilter]);
  const warningSlotIds = useMemo(
    () => new Set(filteredIssues.flatMap((issue) => issue.slotIds)),
    [filteredIssues],
  );
  const warningSummary = useMemo(
    () => ({
      shortage: assignmentIssues.filter((issue) => issue.kind === "shortage").length,
      excess: assignmentIssues.filter((issue) => issue.kind === "excess").length,
      overlap: assignmentIssues.filter((issue) => issue.kind === "overlap").length,
      duty: assignmentIssues.filter((issue) => issue.kind === "duty").length,
      coverage: assignmentIssues.filter((issue) => issue.kind === "coverage").length,
      labor: assignmentIssues.filter((issue) => issue.kind === "labor").length,
      warnings: assignmentIssues.filter((issue) => ["shortage", "excess", "overlap"].includes(issue.kind)).length,
    }),
    [assignmentIssues],
  );
  const plannedBreakSummary = useMemo(() => {
    if (!detail || detail.autoBreakSuggestion === false) return [];
    const byMemberDate = new Map<string, Slot[]>();
    for (const slot of detail.slots) {
      for (const userEmail of new Set(assignments[slot.id] ?? [])) {
        const key = `${userEmail}|${slot.date}`;
        const rows = byMemberDate.get(key) ?? [];
        rows.push(slot);
        byMemberDate.set(key, rows);
      }
    }
    return [...byMemberDate.entries()]
      .map(([key, slots]) => {
        const [userEmail, date] = key.split("|");
        return { userEmail, date, minutes: suggestedBreakMinutes(slots), slotIds: slots.map((slot) => slot.id) };
      })
      .filter((row) => row.minutes > 0)
      .sort((left, right) => `${left.date}|${left.userEmail}`.localeCompare(`${right.date}|${right.userEmail}`));
  }, [detail, assignments]);
  const plannedBreakByMemberDate = useMemo(
    () => new Map(plannedBreakSummary.map((row) => [`${row.userEmail}|${row.date}`, row.minutes] as const)),
    [plannedBreakSummary],
  );
  const plannedBreakSlotIds = useMemo(
    () => new Set(plannedBreakSummary.flatMap((row) => row.slotIds)),
    [plannedBreakSummary],
  );
  const visibleSlots = useMemo(() => {
    if (warningFilter === "all") return detail?.slots ?? [];
    const ids = warningFilter === "plannedBreak" ? plannedBreakSlotIds : warningSlotIds;
    return (detail?.slots ?? []).filter((slot) => ids.has(slot.id));
  }, [detail, warningFilter, plannedBreakSlotIds, warningSlotIds]);
  const dates = useMemo(
    () => [...new Set(visibleSlots.map((slot) => slot.date))].sort(),
    [visibleSlots],
  );
  const memberSummary = useMemo(() => {
    if (!detail) return [];
    const start = new Date(`${detail.plan.startDate}T00:00:00Z`);
    const end = new Date(`${detail.plan.endDate}T00:00:00Z`);
    const periodWeeks = Math.max(
      1 / 7,
      (end.getTime() - start.getTime()) / 86400000 + 1,
    ) / 7;
    return detail.members.map((member) => {
      const slots = detail.slots.filter((slot) =>
        (assignments[slot.id] ?? []).includes(member.userEmail),
      );
      const days = new Set(slots.map((slot) => slot.date)).size;
      const slotsByDate = new Map<string, Slot[]>();
      for (const slot of slots) {
        const rows = slotsByDate.get(slot.date) ?? [];
        rows.push(slot);
        slotsByDate.set(slot.date, rows);
      }
      const totalHours = [...slotsByDate.values()].reduce(
        (sum, rows) => sum + Math.max(
          0,
          rows.reduce((rowTotal, slot) => rowTotal + hours(slot.startTime, slot.endTime), 0) - suggestedBreakMinutes(rows) / 60,
        ),
        0,
      );
      const pref = detail.memberPreferences?.find(
        (candidate) => candidate.userEmail === member.userEmail,
      );
      const weeklyDays = days / periodWeeks;
      const weeklyHours = totalHours / periodWeeks;
      const preferenceOutOfRange =
        pref &&
        (weeklyDays < pref.minDays ||
          weeklyDays > pref.maxDays ||
          weeklyHours < pref.minHours ||
          weeklyHours > pref.maxHours);
      const dayDifference = pref
        ? weeklyDays < pref.minDays
          ? weeklyDays - pref.minDays
          : weeklyDays > pref.maxDays
            ? weeklyDays - pref.maxDays
            : 0
        : 0;
      const hourDifference = pref
        ? weeklyHours < pref.minHours
          ? weeklyHours - pref.minHours
          : weeklyHours > pref.maxHours
            ? weeklyHours - pref.maxHours
            : 0
        : 0;
      const updatedAt =
        detail.requestSubmissions?.find(
          (submission) => submission.userEmail === member.userEmail,
        )?.savedAt ?? null;
      const requestComment = detail.requestSubmissions?.find(
        (submission) => submission.userEmail === member.userEmail,
      )?.requestComment?.trim() ?? "";
      return {
        member,
        days,
        totalHours,
        weeklyDays,
        weeklyHours,
        pref,
        preferenceOutOfRange: Boolean(preferenceOutOfRange),
        warnings: Boolean(preferenceOutOfRange || laborWarnings.some((warning) => warning.memberEmail === member.userEmail)),
        laborWarningCount: laborWarnings.filter((warning) => warning.memberEmail === member.userEmail).length,
        dayDifference,
        hourDifference,
        updatedAt,
        requestComment,
      };
    });
  }, [detail, assignments, laborWarnings]);
  function preferenceFor(slot: Slot, userEmail: string) {
    const request = detail?.requests?.find(
      (row) =>
        row.userEmail === userEmail &&
        row.date === slot.date &&
        row.startTime === slot.startTime &&
        row.endTime === slot.endTime,
    );
    if (request) return preferenceClass(request.preference);
    const weekday = new Date(`${slot.date}T00:00:00`).getDay();
    const rows =
      detail?.memberAvailability?.filter(
        (row) => row.userEmail === userEmail && row.dayOfWeek === weekday,
      ) ?? [];
    if (!rows.length) return "possible";
    const match = rows.find(
      (row) =>
        (!row.startTime && !row.endTime) ||
        (shiftTimeToMinutes(row.startTime) <=
          shiftTimeToMinutes(slot.startTime) &&
          shiftTimeToMinutes(row.endTime) >= shiftTimeToMinutes(slot.endTime)),
    );
    return match ? preferenceClass(match.status) : "unavailable";
  }
  function previewPreferenceFor(slot: Slot, userEmail: string) {
    const request = detail?.requests?.find(
      (row) => row.userEmail === userEmail && row.date === slot.date && row.startTime === slot.startTime && row.endTime === slot.endTime,
    );
    if (request) return preferenceClass(request.preference);
    const weekday = new Date(`${slot.date}T00:00:00`).getDay();
    const rows = detail?.memberAvailability?.filter((row) => row.userEmail === userEmail && row.dayOfWeek === weekday) ?? [];
    if (!rows.length) return "none";
    const match = rows.find(
      (row) => (!row.startTime && !row.endTime) ||
        (shiftTimeToMinutes(row.startTime) <= shiftTimeToMinutes(slot.startTime) && shiftTimeToMinutes(row.endTime) >= shiftTimeToMinutes(slot.endTime)),
    );
    return match ? preferenceClass(match.status) : "unavailable";
  }
  function toggle(slotId: string, userEmail: string) {
    setDetail((currentDetail) => {
      if (!currentDetail) return currentDetail;
      const current = currentDetail.assignments
        .filter((row) => row.slotId === slotId)
        .map((row) => row.userEmail);
      const next = current.includes(userEmail)
        ? current.filter((email) => email !== userEmail)
        : [...current, userEmail];
      return {
        ...currentDetail,
        assignments: currentDetail.assignments
          .filter((row) => row.slotId !== slotId)
          .concat(next.map((email) => ({ slotId, userEmail: email }))),
      };
    });
  }
  function candidateIsVisible(slot: Slot, member: Member, assigned: boolean) {
    if (assigned) return true;
    const preference = preferenceFor(slot, member.userEmail);
    const scopeIds = parseDutyScopeIds(slot.dutyScopeIds);
    const isDutyMismatch = scopeIds.length > 0
      ? !scopeIds.every((dutyId) => member.dutyIds?.includes(dutyId))
      : Boolean(slot.dutyId) && !member.dutyIds?.includes(slot.dutyId!);
    const preferenceVisible = candidateFilters[preference as CandidateFilter] ?? false;
    if (isDutyMismatch) return candidateFilters.duty;
    return preferenceVisible;
  }
  const dutyDirectoryMembers = useMemo(() => {
    if (!detail) return [];
    if (dutyDirectoryScope === "all") return detail.members;
    return detail.members.filter((member) =>
      visibleSlots.some((slot) =>
        candidateIsVisible(slot, member, (assignments[slot.id] ?? []).includes(member.userEmail)),
      ),
    );
  }, [detail, dutyDirectoryScope, visibleSlots, assignments, candidateFilters]);
  const dutyDirectoryDuties = detail?.duties ?? [];
  function memberDutyNames(member: Member) {
    const ids = new Set(member.dutyIds ?? []);
    return dutyDirectoryDuties.filter((duty) => ids.has(duty.id)).map((duty) => duty.name);
  }
  function renderMember(slot: Slot, member: Member) {
    const assigned = (assignments[slot.id] ?? []).includes(member.userEmail);
    if (!candidateIsVisible(slot, member, assigned)) return null;
    const preference = preferenceFor(slot, member.userEmail);
    const plannedBreakMinutes = assigned
      ? plannedBreakByMemberDate.get(`${member.userEmail}|${slot.date}`) ?? 0
      : 0;
    const hasMemberOverlap = assigned && assignmentIssues.some(
      (issue) => issue.kind === "overlap" && issue.memberEmail === member.userEmail && issue.slotIds.includes(slot.id),
    );
    const laborLabels = assigned
      ? [...new Set(laborWarnings
        .filter((warning) => warning.memberEmail === member.userEmail && warning.slotIds.includes(slot.id))
        .map((warning) => laborWarningLabel(warning.kind)))]
      : [];
    const scopeIds = parseDutyScopeIds(slot.dutyScopeIds);
    const dutyReview = scopeIds.length > 0
      ? !scopeIds.every((dutyId) => member.dutyIds?.includes(dutyId))
      : Boolean(slot.dutyId) && !member.dutyIds?.includes(slot.dutyId!);
    const dutyNames = memberDutyNames(member);
    const dutySummary = dutyNames.length > 2
      ? `${dutyNames.slice(0, 2).join("、")} +${dutyNames.length - 2}`
      : dutyNames.join("、");
    return (
      <label
        className={`${assigned ? "assigned " : ""}pref-${preference}`}
        key={member.userEmail}
        >
        <input
          type="checkbox"
          checked={assigned}
          onChange={() => toggle(slot.id, member.userEmail)}
        />
        <span className="assignment-member-name">
          {member.displayName || member.userEmail.split("@")[0]}
          {hasMemberOverlap && <small className="assignment-overlap-badge">（時間重複）</small>}
          {dutyReview && <small className="assignment-duty-badge">適性外</small>}
        </span>
        {dutySummary && <small className="assignment-duty-summary">担当可能: {dutySummary}</small>}
        {plannedBreakMinutes > 0 && (
          <small className="assignment-break-badge">休憩{plannedBreakMinutes}分</small>
        )}
        {laborLabels.map((label) => <small className="assignment-labor-badge" key={label}>{label}</small>)}
      </label>
    );
  }
  function renderPreviewPerson(slot: Slot, userEmail: string, index: number) {
    const member = detail?.members.find((item) => item.userEmail === userEmail);
    const preference = previewPreferenceFor(slot, userEmail);
    const minutes = plannedBreakByMemberDate.get(`${userEmail}|${slot.date}`) ?? 0;
    const laborLabels = [...new Set(laborWarnings
      .filter((warning) => warning.memberEmail === userEmail && warning.slotIds.includes(slot.id))
      .map((warning) => laborWarningLabel(warning.kind)))];
    const hasOverlap = assignmentIssues.some(
      (issue) => issue.kind === "overlap" && issue.memberEmail === userEmail && issue.slotIds.includes(slot.id),
    );
    const scopeIds = parseDutyScopeIds(slot.dutyScopeIds);
    const dutyReview = scopeIds.length > 0
      ? !scopeIds.every((dutyId) => member?.dutyIds?.includes(dutyId))
      : Boolean(slot.dutyId) && !member?.dutyIds?.includes(slot.dutyId);
    const labels = [
      ...(minutes > 0 ? [`予定休憩${minutes}分`] : []),
      ...laborLabels,
      ...(hasOverlap ? ["時間重複"] : []),
      ...(dutyReview ? ["適性外"] : []),
    ];
    return (
      <span className={`assignment-preview-person pref-${preference}`} key={`${slot.id}|${userEmail}|${index}`}>
        <strong>{member?.displayName || userEmail.split("@")[0]}</strong>
        {labels.length > 0 && <small>（{labels.join("、")}）</small>}
      </span>
    );
  }
  function dutyScopeLabel(slot: Slot) {
    const scopeIds = parseDutyScopeIds(slot.dutyScopeIds);
    if (!scopeIds.length) return "";
    const names = new Map((detail?.duties ?? []).map((duty) => [duty.id, duty.name]));
    return scopeIds.map((dutyId) => names.get(dutyId) ?? dutyId).join("・");
  }
  function renderSlot(slot: Slot) {
    const assignedCount = new Set(assignments[slot.id] ?? []).size;
    const isShortage = assignedCount < slot.requiredCount;
    const isExcess = assignedCount > slot.requiredCount;
    return (
      <div className={`assignment-calendar-slot ${isShortage ? "is-shortage" : ""} ${isExcess ? "is-excess" : ""}`} key={slot.id}>
        <strong>
          {slot.role || "共通"}
          <small>{assignedCount}/{slot.requiredCount}人</small>
        </strong>
        {dutyScopeLabel(slot) && <small className="assignment-duty-scope">担当範囲：{dutyScopeLabel(slot)}</small>}
        <div className="assignment-members">
          {detail?.members.map((member) => renderMember(slot, member))}
        </div>
      </div>
    );
  }
  const memberViewSlotGroups = useMemo(
    () => {
      const groups = new Map<string, { key: string; date: string; startTime: string; endTime: string; slots: Slot[] }>();
      [...visibleSlots]
        .sort((left, right) =>
          `${left.date}|${left.startTime}|${left.endTime}|${left.role}`.localeCompare(
            `${right.date}|${right.startTime}|${right.endTime}|${right.role}`,
          ),
        )
        .forEach((slot) => {
          const key = `${slot.date}|${slot.startTime}|${slot.endTime}`;
          const group = groups.get(key);
          if (group) group.slots.push(slot);
          else groups.set(key, { key, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, slots: [slot] });
        });
      return [...groups.values()];
    },
    [visibleSlots],
  );
  function cycleMemberViewAssignment(group: (typeof memberViewSlotGroups)[number], userEmail: string) {
    setDetail((currentDetail) => {
      if (!currentDetail) return currentDetail;
      const assignedSlots = group.slots.filter((slot) =>
        currentDetail.assignments.some((row) => row.slotId === slot.id && row.userEmail === userEmail),
      );
      const currentIndex = assignedSlots.length === 1
        ? group.slots.findIndex((slot) => slot.id === assignedSlots[0].id)
        : -1;
      const nextIndex = currentIndex < 0 ? 0 : currentIndex + 1 < group.slots.length ? currentIndex + 1 : -1;
      const groupSlotIds = new Set(group.slots.map((slot) => slot.id));
      const nextAssignments = currentDetail.assignments.filter(
        (row) => !(groupSlotIds.has(row.slotId) && row.userEmail === userEmail),
      );
      if (nextIndex >= 0) nextAssignments.push({ slotId: group.slots[nextIndex].id, userEmail });
      return { ...currentDetail, assignments: nextAssignments };
    });
  }
  function renderMemberViewCell(member: Member, group: (typeof memberViewSlotGroups)[number]) {
    const assignedSlots = group.slots.filter((slot) => (assignments[slot.id] ?? []).includes(member.userEmail));
    const assignedSlot = assignedSlots.length === 1 ? assignedSlots[0] : null;
    const preference = preferenceFor(group.slots[0], member.userEmail);
    const groupSlotIds = new Set(group.slots.map((slot) => slot.id));
    const hasOverlap = assignedSlots.some((slot) => assignmentIssues.some(
      (issue) => issue.kind === "overlap" && issue.memberEmail === member.userEmail && issue.slotIds.some((id) => groupSlotIds.has(id)),
    ));
    const dutyReview = assignedSlots.some((slot) => {
      const scopeIds = parseDutyScopeIds(slot.dutyScopeIds);
      return scopeIds.length > 0
        ? !scopeIds.every((dutyId) => member.dutyIds?.includes(dutyId))
        : Boolean(slot.dutyId) && !member.dutyIds?.includes(slot.dutyId!);
    });
    const laborLabels = assignedSlots.length > 0
      ? [...new Set(laborWarnings
        .filter((warning) => warning.memberEmail === member.userEmail && warning.slotIds.some((id) => groupSlotIds.has(id)))
        .map((warning) => laborWarningLabel(warning.kind)))]
      : [];
    const editable = detail?.plan.status !== "published" && selectedScenario?.proposalStatus !== "published";
    const labels = [
      ...(hasOverlap ? ["時間重複"] : []),
      ...(dutyReview && assignedSlots.length > 0 ? ["適性外"] : []),
      ...laborLabels,
    ];
    return (
      <td className={`assignment-member-cell pref-${preference}${assignedSlots.length ? " is-assigned" : ""}${labels.length ? " has-issue" : ""}`} key={group.key}>
        <button
          type="button"
          className="assignment-member-cell-button"
          disabled={!editable || busy}
          aria-pressed={assignedSlots.length > 0}
          title={`${formatShiftDate(group.date)} ${displayShiftTime(group.startTime)}〜${displayShiftTime(group.endTime)} 担当を切り替え`}
          onClick={() => cycleMemberViewAssignment(group, member.userEmail)}
        >
          <strong>{assignedSlot?.role || (assignedSlots.length > 1 ? "複数担当" : "—")}</strong>
          <small>{preference === "want" ? "出勤希望" : preference === "possible" ? "可能" : preference === "off" ? "休み希望" : "勤務不可"}</small>
          {labels.length > 0 && <em>（{labels.join("、")}）</em>}
        </button>
      </td>
    );
  }
  function selectScenario(value: string) {
    setSelectedScenarioId(value);
    const scenario = scenarios.find((item) => item.id === value);
    if (!scenario) {
      setScenarioName("");
      setScenarioDescription("");
      if (detail) void openPlan(detail.plan.id);
      return;
    }
    setScenarioName(scenario.name);
    setScenarioDescription(scenario.description);
    setScenarioSeed(scenario.seed);
    setScenarioPriority(typeof scenario.settings.priority === "string" ? scenario.settings.priority : "preference");
    setScenarioLaborMode(typeof scenario.settings.laborMode === "string" ? scenario.settings.laborMode : "avoid");
    setScenarioUnavailableMode(typeof scenario.settings.unavailableMode === "string" ? scenario.settings.unavailableMode : "exclude");
    setScenarioAllocationScope(allocationScopeFor(scenario.settings));
    setDetail((current) => current ? {
      ...current,
      assignments: Object.entries(scenario.assignments).flatMap(([slotId, users]) => users.map((userEmail) => ({ slotId, userEmail }))),
    } : current);
  }
  async function createScenario(action: "manual" | "auto", overrides?: {
    name?: string;
    description?: string;
    seed?: string;
    priority?: string;
    laborMode?: string;
    unavailableMode?: string;
    allocationScope?: AllocationScope;
  }) {
    if (!detail) {
      setNotice("シフトを読み込んでください");
      return;
    }
    const priority = overrides?.priority ?? scenarioPriority;
    const laborMode = overrides?.laborMode ?? scenarioLaborMode;
    const unavailableMode = overrides?.unavailableMode ?? scenarioUnavailableMode;
    const allocationScope = overrides?.allocationScope ?? scenarioAllocationScope;
    const resolvedName = uniqueScenarioName(overrides?.name?.trim() || scenarioName.trim() || defaultScenarioName());
    const resolvedDescription = overrides?.description ?? scenarioDescription.trim();
    const resolvedSeed = overrides?.seed?.trim() || scenarioSeed.trim() || crypto.randomUUID();
    setBusy(true);
    const response = await localApiFetch(`/api/shifts/${detail.plan.id}/scenarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: action === "auto" ? "auto" : undefined,
        name: resolvedName,
        description: resolvedDescription,
        seed: resolvedSeed,
        settings: { priority, laborMode, allocationScope, unavailableMode },
        assignments: assignments,
      }),
    });
    const data = (await response.json()) as { error?: string; scenario?: AssignmentScenario };
    if (!response.ok || !data.scenario) {
      setNotice(data.error ?? "割当案を保存できませんでした");
      setBusy(false);
      return;
    }
    setScenarios((current) => [data.scenario!, ...current]);
    setSelectedScenarioId(data.scenario.id);
    setScenarioName(resolvedName);
    setScenarioSeed(data.scenario.seed);
    setScenarioDescription(data.scenario.description);
    setScenarioPriority(typeof data.scenario.settings.priority === "string" ? data.scenario.settings.priority : "preference");
    setScenarioLaborMode(typeof data.scenario.settings.laborMode === "string" ? data.scenario.settings.laborMode : "avoid");
    setScenarioUnavailableMode(typeof data.scenario.settings.unavailableMode === "string" ? data.scenario.settings.unavailableMode : "exclude");
    setScenarioAllocationScope(allocationScopeFor(data.scenario.settings));
    if (action === "auto") setDetail((current) => current ? { ...current, assignments: Object.entries(data.scenario!.assignments).flatMap(([slotId, users]) => users.map((userEmail) => ({ slotId, userEmail }))) } : current);
    setScenarioOpen(false);
    setNotice("割当案を作成し、案一覧に保存しました。現在の下書きは変更していません。");
    setBusy(false);
  }
  async function recalculateSelectedScenario() {
    if (!selectedScenario) return;
    await createScenario("auto", {
      name: `${selectedScenario.name} 再計算`,
      description: selectedScenario.description,
      seed: selectedScenario.seed,
      priority: typeof selectedScenario.settings.priority === "string" ? selectedScenario.settings.priority : "preference",
      laborMode: typeof selectedScenario.settings.laborMode === "string" ? selectedScenario.settings.laborMode : "avoid",
      unavailableMode: typeof selectedScenario.settings.unavailableMode === "string" ? selectedScenario.settings.unavailableMode : "exclude",
      allocationScope: allocationScopeFor(selectedScenario.settings),
    });
  }
  async function saveSelectedScenario() {
    if (!detail || !selectedScenarioId) return;
    setBusy(true);
    const response = await localApiFetch(`/api/shifts/${detail.plan.id}/scenarios/${selectedScenarioId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: scenarioName.trim(), description: scenarioDescription.trim(), assignments }),
    });
    const data = (await response.json()) as { error?: string; scenario?: AssignmentScenario };
    if (response.ok && data.scenario) setScenarios((current) => current.map((item) => item.id === data.scenario!.id ? data.scenario! : item));
    setNotice(response.ok ? "割当案を更新しました。本体割当はまだ変更されていません。" : (data.error ?? "割当案を更新できませんでした"));
    setBusy(false);
  }
  async function publishSelectedScenario() {
    if (!detail || !selectedScenarioId || !selectedScenario) return;
    if (selectedScenario.proposalStatus === "published") return;
    if (scenarioIsStale) {
      setNotice("この割当案は勤務枠の変更前に作成されています。現在の勤務枠で再計算してください。");
      return;
    }
    if (!window.confirm(`「${selectedScenario.name}」を公開版にしますか？現在の公開版がある場合は履歴として残ります。`)) return;
    setBusy(true);
    const response = await localApiFetch(`/api/shifts/${detail.plan.id}/scenarios/${selectedScenarioId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true, expectedVersion: detail.plan.version }),
    });
    const data = await response.json().catch(() => ({})) as { error?: string; dutyErrors?: Array<{ message?: string }> };
    const detailError = data.dutyErrors?.map((item) => item.message).filter(Boolean).join("、");
    setNotice(response.ok ? "割当案を公開版にしました。" : [data.error ?? "割当案を公開できませんでした。", detailError].filter(Boolean).join(" "));
    setBusy(false);
    if (response.ok) {
      await openPlan(detail.plan.id);
      await loadScenarios(detail.plan.id);
    }
  }
  function duplicateSelectedScenario() {
    const scenario = scenarios.find((item) => item.id === selectedScenarioId);
    if (!scenario) return;
    setScenarioName(`${scenario.name} コピー`);
    setScenarioDescription(scenario.description);
      setScenarioSeed(`${scenario.seed}-copy`);
      setScenarioPriority(typeof scenario.settings.priority === "string" ? scenario.settings.priority : "preference");
    setScenarioLaborMode(typeof scenario.settings.laborMode === "string" ? scenario.settings.laborMode : "avoid");
    setScenarioUnavailableMode(typeof scenario.settings.unavailableMode === "string" ? scenario.settings.unavailableMode : "exclude");
    setScenarioAllocationScope(allocationScopeFor(scenario.settings));
    setScenarioOpen(true);
  }
  function scenarioAssignedCount(scenario: AssignmentScenario) {
    return Object.values(scenario.assignments).reduce((total, users) => total + users.length, 0);
  }
  function scenarioUnfilledCount(scenario: AssignmentScenario) {
    return detail?.slots.filter((slot) => (scenario.assignments[slot.id]?.length ?? 0) < slot.requiredCount).length ?? 0;
  }
  function scenarioLaborCount(scenario: AssignmentScenario) {
    if (!detail) return 0;
    return buildLaborWarnings({
      slots: detail.slots,
      assignments: Object.entries(scenario.assignments).flatMap(([slotId, users]) => users.map((userEmail) => ({ slotId, userEmail }))),
      members: detail.members,
      autoBreakSuggestion: detail.autoBreakSuggestion,
      rules: detail.laborRules,
      planStartDate: detail.plan.startDate,
      planEndDate: detail.plan.endDate,
    }).length;
  }
  function scenarioPreferenceOutOfRangeCount(scenario: AssignmentScenario) {
    if (!detail) return 0;
    return detail.members.filter((member) => {
      const assignedSlots = detail.slots.filter((slot) => (scenario.assignments[slot.id] ?? []).includes(member.userEmail));
      const days = new Set(assignedSlots.map((slot) => slot.date)).size;
      const totalHours = assignedSlots.reduce((total, slot) => total + hours(slot.startTime, slot.endTime), 0);
      const preference = detail.memberPreferences?.find((item) => item.userEmail === member.userEmail);
      return Boolean(preference && (days < preference.minDays || days > preference.maxDays || totalHours < preference.minHours || totalHours > preference.maxHours));
    }).length;
  }
  function scenarioDifferenceCount(scenario: AssignmentScenario) {
    if (!detail) return 0;
    return detail.slots.reduce((total, slot) => {
      const current = new Set(baseAssignments[slot.id] ?? []);
      const candidate = new Set(scenario.assignments[slot.id] ?? []);
      return total + [...new Set([...current, ...candidate])].filter((email) => current.has(email) !== candidate.has(email)).length;
    }, 0);
  }
  function preferenceOutOfRangeCount(source: Record<string, string[]>) {
    if (!detail) return 0;
    return detail.members.filter((member) => {
      const assignedSlots = detail.slots.filter((slot) => (source[slot.id] ?? []).includes(member.userEmail));
      const days = new Set(assignedSlots.map((slot) => slot.date)).size;
      const totalHours = assignedSlots.reduce((total, slot) => total + hours(slot.startTime, slot.endTime), 0);
      const preference = detail.memberPreferences?.find((item) => item.userEmail === member.userEmail);
      return Boolean(preference && (days < preference.minDays || days > preference.maxDays || totalHours < preference.minHours || totalHours > preference.maxHours));
    }).length;
  }
  function baseAssignedCount() {
    return Object.values(baseAssignments).reduce((total, users) => total + users.length, 0);
  }
  function baseUnfilledCount() {
    return detail?.slots.filter((slot) => (baseAssignments[slot.id]?.length ?? 0) < slot.requiredCount).length ?? 0;
  }
  function baseLaborCount() {
    if (!detail) return 0;
    return buildLaborWarnings({
      slots: detail.slots,
      assignments: Object.entries(baseAssignments).flatMap(([slotId, users]) => users.map((userEmail) => ({ slotId, userEmail }))),
      members: detail.members,
      autoBreakSuggestion: detail.autoBreakSuggestion,
      rules: detail.laborRules,
      planStartDate: detail.plan.startDate,
      planEndDate: detail.plan.endDate,
    }).length;
  }
  async function deleteSelectedScenario() {
    if (!detail || !selectedScenarioId || !window.confirm("この割当案を削除しますか？")) return;
    setBusy(true);
    const response = await localApiFetch(`/api/shifts/${detail.plan.id}/scenarios/${selectedScenarioId}`, { method: "DELETE" });
    if (response.ok) {
      setScenarios((current) => current.filter((item) => item.id !== selectedScenarioId));
      setSelectedScenarioId("");
      setScenarioName("");
      setScenarioDescription("");
      await openPlan(detail.plan.id);
    }
    setNotice(response.ok ? "割当案を削除しました" : "割当案を削除できませんでした");
    setBusy(false);
  }
  async function save(status: "draft" | "published") {
    if (!detail) return;
    const nextStatus = detail.plan.status === "published" ? "published" : status;
    const publishedUpdate = detail.plan.status === "published";
    const reason = publishedUpdate ? window.prompt("公開済みシフトの変更理由（任意）") ?? "" : "";
    const warningText = assignmentIssues.length
      ? `\n\n未解消の警告が${assignmentIssues.length}件あります。`
      : "";
    if (
      nextStatus === "published" &&
      !window.confirm(
        `「${detail.plan.name}」を公開します。担当割り当てを確定し、メンバーのカレンダーに反映します。${warningText}\n\n公開してよいですか？`,
      )
    )
      return;
    setBusy(true);
    const response = await localApiFetch(`/api/shifts/${detail.plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments, status: nextStatus, reason, expectedVersion: detail.plan.version }),
    });
    const data = (await response.json()) as { error?: string; dutyErrors?: Array<{ userEmail?: string; dutyId?: string; message?: string }> };
    const dutyErrorText = data.dutyErrors?.map((item) => item.message).filter(Boolean).join("、");
    setNotice(
      response.ok
        ? nextStatus === "published"
          ? "シフトを公開しました"
          : "割り当てを保存しました"
        : [data.error ?? "保存できませんでした", dutyErrorText].filter(Boolean).join(" "),
    );
    setBusy(false);
    if (response.ok) await openPlan(detail.plan.id);
  }
  const renderedWarnings = showAllWarnings
    ? filteredIssues
    : filteredIssues.slice(0, 5);
  const filterHasContent = warningFilter === "plannedBreak"
    ? plannedBreakSummary.length > 0
    : warningFilter === "all"
      ? assignmentIssues.length > 0 || plannedBreakSummary.length > 0
      : filteredIssues.length > 0;
  return (
    <section className="shift-adjustment-card">
      <div className="shift-builder-head">
        <div>
          <p className="eyebrow">SHIFT ADJUSTMENT</p>
          <h2>シフト割当{selectedGroupName ? `（${selectedGroupName}）` : ""}</h2>
          <p>勤務希望を確認しながら担当者を割り当てます。</p>
        </div>
      </div>
      <div className="shift-adjustment-toolbar">
        {!initialGroupId && <select
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
        >
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>}
        <select
          value={planId}
          onChange={(event) => setPlanId(event.target.value)}
        >
          <option value="">勤務枠を選択</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} ／ {plan.startDate}〜{plan.endDate} ／{" "}
              {getShiftDisplayLabel(getShiftDisplayStatus(plan, detail?.demoTime?.today ?? demoToday))}
            </option>
          ))}
        </select>
        {detail && (
          <div className="view-toggle">
            <button
              type="button"
              className={viewMode === "preview" ? "active" : ""}
              onClick={() => setViewMode("preview")}
            >
              プレビュー
            </button>
            <button
              type="button"
              className={viewMode === "list" ? "active" : ""}
              onClick={() => setViewMode("list")}
            >
              一覧
            </button>
            <button
              type="button"
              className={viewMode === "calendar" ? "active" : ""}
              onClick={() => setViewMode("calendar")}
            >
              時刻を列で表示
            </button>
            <button
              type="button"
              className={viewMode === "member" ? "active" : ""}
              onClick={() => setViewMode("member")}
            >
              人を行で表示
            </button>
          </div>
        )}
      </div>
      {detail && (
        <>
          <div className="shift-actions shift-actions-top">
            {!selectedScenarioId && <button
              className="ghost-button"
              onClick={() => void save("draft")}
              disabled={busy}
            >
              下書きの変更を保存
            </button>}
          </div>
          <div className="assignment-scenarios">
            <div className="assignment-scenarios-head">
              <strong>割当案</strong>
              <span>現行下書き以外の案は、採用するまで本体の割当・公開シフトに影響しません。</span>
            </div>
            <div className="assignment-scenarios-controls">
              <select value={selectedScenarioId} onChange={(event) => selectScenario(event.target.value)}>
                <option value="">現行下書き（本体割当）</option>
                {scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
              </select>
              <button type="button" className="ghost-button" onClick={() => { setScenarioName(""); setScenarioDescription(""); setScenarioSeed(""); setScenarioPriority("preference"); setScenarioLaborMode("avoid"); setScenarioUnavailableMode("exclude"); setScenarioAllocationScope("problems"); setScenarioOpen(true); }}>＋割当案を作成</button>
              {selectedScenarioId && <>
                <button type="button" className="primary-button" onClick={() => void publishSelectedScenario()} disabled={busy || scenarioIsStale || selectedScenario?.proposalStatus === "published"}>公開版にする</button>
                <button type="button" className="ghost-button" onClick={duplicateSelectedScenario} disabled={busy}>複製</button>
                <button type="button" className="ghost-button" onClick={() => setShowScenarioCompare((value) => !value)}>{showScenarioCompare ? "比較を閉じる" : "比較"}</button>
                <button type="button" className="ghost-button" onClick={() => void saveSelectedScenario()} disabled={busy || selectedScenario?.proposalStatus === "published"}>案を保存</button>
                <button type="button" className="ghost-button danger-button" onClick={() => void deleteSelectedScenario()} disabled={busy || selectedScenario?.proposalStatus === "published"}>案を削除</button>
              </>}
            </div>
            <p className="assignment-scenario-meta">表示中：{selectedScenario ? `${selectedScenario.name}（${selectedScenario.proposalStatus === "published" ? "公開版" : selectedScenario.proposalStatus === "superseded" ? "旧公開版" : "候補"}）` : "現在の下書き"}{detail && ` ／ version ${detail.plan.version}`}</p>
            {selectedScenario && scenarioIsStale && <div className="assignment-scenario-stale" role="status">
              <strong>この案は勤務枠の変更前に作成されています</strong>
              <span>現在の勤務枠と案作成時の勤務枠が異なるため、公開できません。</span>
              <button type="button" className="ghost-button" onClick={() => setShowScenarioCompare(true)}>差分を確認</button>
              <button type="button" className="ghost-button" onClick={() => void recalculateSelectedScenario()} disabled={busy}>同じ条件で再計算して新しい案を作る</button>
            </div>}
            {selectedScenarioId && <p className="assignment-scenario-meta">{scenarioDescription || "説明なし"} ／ seed: {scenarioSeed || selectedScenario?.seed || "-"}</p>}
            {showScenarioCompare && <div className="assignment-scenario-compare">
              <strong>割当案の比較</strong>
              <div className="assignment-scenario-compare-list">
                <span>現行下書き：{baseAssignedCount()}人枠／未充足 {baseUnfilledCount()}枠／労務注意 {baseLaborCount()}件／希望範囲外 {preferenceOutOfRangeCount(baseAssignments)}人／差分 -</span>
                {scenarios.map((scenario) => <span key={scenario.id}>{scenario.name}：{scenarioAssignedCount(scenario)}人枠／未充足 {scenarioUnfilledCount(scenario)}枠／労務注意 {scenarioLaborCount(scenario)}件／希望範囲外 {scenarioPreferenceOutOfRangeCount(scenario)}人／現行との差分 {scenarioDifferenceCount(scenario)}件</span>)}
              </div>
            </div>}
            {scenarioOpen && <div className="assignment-scenario-form">
              <input value={scenarioName} onChange={(event) => setScenarioName(event.target.value)} placeholder="案名（例：希望優先案A）" />
              <input value={scenarioDescription} onChange={(event) => setScenarioDescription(event.target.value)} placeholder="説明・店長メモ" />
              <input value={scenarioSeed} onChange={(event) => setScenarioSeed(event.target.value)} placeholder="乱数シード（同じ条件なら再現）" />
              <select value={scenarioPriority} onChange={(event) => setScenarioPriority(event.target.value)}><option value="labor">労務優先</option><option value="preference">希望優先</option><option value="fairness">公平性優先</option><option value="minimal">変更最小</option></select>
              <select value={scenarioLaborMode} onChange={(event) => setScenarioLaborMode(event.target.value)}><option value="avoid">労務注意：原則避ける</option><option value="allow">労務注意：許容</option></select>
              <select value={scenarioUnavailableMode} onChange={(event) => setScenarioUnavailableMode(event.target.value)}><option value="exclude">勤務不可：絶対除外</option><option value="prefer_exclude">勤務不可：許容（原則除外）</option></select>
              <select value={scenarioAllocationScope} onChange={(event) => setScenarioAllocationScope(event.target.value as AllocationScope)}><option value="unfilled">不足枠だけ補充</option><option value="problems">問題のある枠を再配置</option><option value="all">全枠を再計算</option></select>
              <button type="button" className="ghost-button" onClick={() => void createScenario("manual")} disabled={busy}>現在の割当を案として保存</button>
              <button type="button" className="primary-button" onClick={() => void createScenario("auto")} disabled={busy}>条件で案を作成</button>
              <span className="assignment-scenario-form-help">案一覧に保存します。現在の下書きは変更しません。</span>
              <button type="button" className="ghost-button" onClick={() => setScenarioOpen(false)}>キャンセル</button>
            </div>}
          </div>
          <div className="assignment-summary">
            <strong>{detail.plan.name}</strong>
            <span>{detail.slots.length}枠</span>
            <span className="assignment-legend">
              <i className="pref-want">出勤希望</i>
              <i className="pref-possible">可能</i>
              <i className="pref-off">休み希望</i>
              <i className="pref-unavailable">勤務不可</i>
              <i className="pref-none">希望未提出</i>
              <i className="is-unassigned">未割当</i>
            </span>
          </div>
          <div className="assignment-warning-filter" aria-label="割り当て警告の表示">
            <div className="assignment-warning-filter-buttons">
              <button type="button" className={warningFilter === "all" ? "active" : ""} onClick={() => setWarningFilter("all")}>すべて {assignmentIssues.length + plannedBreakSummary.length}件</button>
              <button type="button" className={warningFilter === "warnings" ? "active" : ""} onClick={() => setWarningFilter("warnings")}>警告 {warningSummary.warnings}件</button>
              <button type="button" className={warningFilter === "duty" ? "active" : ""} onClick={() => setWarningFilter("duty")}>適性外 {warningSummary.duty}件</button>
              <button type="button" className={warningFilter === "coverage" ? "active" : ""} onClick={() => setWarningFilter("coverage")}>体制不足 {warningSummary.coverage}件</button>
              <button type="button" className={warningFilter === "labor" ? "active" : ""} onClick={() => setWarningFilter("labor")}>労務注意 {warningSummary.labor}件</button>
              <button type="button" className={warningFilter === "plannedBreak" ? "active" : ""} onClick={() => setWarningFilter("plannedBreak")}>予定休憩 {plannedBreakSummary.length}件</button>
            </div>
            <span>未充足 {warningSummary.shortage}・過剰配置 {warningSummary.excess}・時間重複 {warningSummary.overlap}・適性外 {warningSummary.duty}・体制不足 {warningSummary.coverage}・労務注意 {warningSummary.labor}</span>
          </div>
          {warningFilter === "all" || warningFilter === "plannedBreak" ? plannedBreakSummary.length > 0 && (
            <div className="planned-break-summary">
              <strong>予定休憩（自動提案）</strong>
              <div className={showAllPlannedBreaks ? "" : "is-collapsed"}>
                {plannedBreakSummary.map((row) => (
                  <span key={`${row.date}|${row.userEmail}`}>
                    {formatShiftDate(row.date)}・{detail.members.find((member) => member.userEmail === row.userEmail)?.displayName || row.userEmail.split("@")[0]}：{row.minutes}分
                  </span>
                ))}
              </div>
              {plannedBreakSummary.length > 5 && (
                <button
                  type="button"
                  className="warning-toggle planned-break-toggle"
                  onClick={() => setShowAllPlannedBreaks((current) => !current)}
                >
                  {showAllPlannedBreaks ? "一部を隠す" : `すべて表示（残り${plannedBreakSummary.length - 5}件）`}
                </button>
              )}
            </div>
          ) : null}
          {filteredIssues.length > 0 && warningFilter !== "plannedBreak" && (
            <div className="assignment-warnings" role="alert">
              <strong>
                {warningFilter === "labor" ? "労務注意を確認してください" : warningFilter === "duty" ? "適性外の割り当てを確認してください" : warningFilter === "coverage" ? "体制不足を確認してください" : "割り当てを確認してください"}（{filteredIssues.length}件）
              </strong>
              <ul>
                {renderedWarnings.map((warning) => (
                  <li key={warning.id}>{warning.message}</li>
                ))}
              </ul>
              {filteredIssues.length > 5 && (
                <button
                  type="button"
                  className="warning-toggle"
                  onClick={() => setShowAllWarnings((current) => !current)}
                >
                  {showAllWarnings
                    ? "一部を隠す"
                    : `すべて表示（残り${filteredIssues.length - 5}件）`}
                </button>
              )}
            </div>
          )}
          <div className="assignment-candidate-filter" aria-label="候補者の表示">
            <strong>表示する候補</strong>
            {([
              ["want", "出勤希望"],
              ["possible", "可能"],
              ["off", "休み希望"],
              ["unavailable", "勤務不可"],
              ["duty", "適性外"],
            ] as Array<[CandidateFilter, string]>).map(([filter, label]) => (
              <label key={filter}>
                <input
                  type="checkbox"
                  checked={candidateFilters[filter]}
                  onChange={() => setCandidateFilters((current) => ({ ...current, [filter]: !current[filter] }))}
                />
                {label}
              </label>
            ))}
            <button type="button" className="ghost-button duty-directory-button" onClick={() => setDutyDirectoryOpen(true)}>
              担当可能一覧
            </button>
            <small>表示のみの絞り込みです。割当済みのメンバーは常に表示されます。</small>
          </div>
          {!filterHasContent ? (
            <p className="assignment-warning-empty">該当する警告・労務注意・予定休憩はありません。</p>
          ) : <>
          {viewMode === "preview" && (
            <div className="assignment-preview-wrap">
              <table className="assignment-preview-table">
                <thead><tr><th>日付</th>{timeColumns.map((time) => <th key={`${time.startTime}|${time.endTime}`}>{displayShiftTime(time.startTime)}<small>{displayShiftTime(time.endTime)}</small></th>)}</tr></thead>
                <tbody>{dates.map((date) => <tr key={date}><th>{formatShiftDate(date)}</th>{timeColumns.map((time) => <td key={`${date}|${time.startTime}|${time.endTime}`}>{visibleSlots.filter((slot) => slot.date === date && slot.startTime === time.startTime && slot.endTime === time.endTime).map((slot) => {
                  const emails = [...new Set(assignments[slot.id] ?? [])];
                  const assignedCount = emails.length;
                  const people = [
                    ...emails.map((email) => ({ email, unassigned: false })),
                    ...Array.from({ length: Math.max(0, slot.requiredCount - assignedCount) }, () => ({ email: "", unassigned: true })),
                  ];
                  return <div className={`assignment-preview-slot ${assignedCount < slot.requiredCount ? "is-shortage" : ""} ${assignedCount > slot.requiredCount ? "is-excess" : ""}`} key={slot.id}><div><strong>{slot.role || "共通"}</strong><span>{assignedCount}/{slot.requiredCount}人</span></div>{dutyScopeLabel(slot) && <small className="assignment-duty-scope">担当範囲：{dutyScopeLabel(slot)}</small>}<div className="assignment-preview-people">{people.length > 0 ? people.map((person, index) => person.unassigned ? <span className="assignment-preview-person is-unassigned" key={`${slot.id}|unassigned|${index}`}>未割当</span> : renderPreviewPerson(slot, person.email, index)) : <span className="assignment-preview-person is-unassigned">未割当</span>}</div></div>;
                })}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
          {viewMode === "list" ? (
            <div className="assignment-table-wrap">
              <table className="assignment-table">
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>時間</th>
                    <th>担当</th>
                    <th>必要</th>
                    <th>メンバー</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSlots.map((slot) => {
                    const assignedCount = new Set(assignments[slot.id] ?? []).size;
                    return <tr className={`${assignedCount < slot.requiredCount ? "assignment-row-shortage" : ""} ${assignedCount > slot.requiredCount ? "assignment-row-excess" : ""}`} key={slot.id}>
                      <td>{formatShiftDate(slot.date)}</td>
                      <td>
                        {displayShiftTime(slot.startTime)}〜
                        {displayShiftTime(slot.endTime)}
                      </td>
                      <td>{slot.role || "共通"}{dutyScopeLabel(slot) && <small className="assignment-duty-scope">担当範囲：{dutyScopeLabel(slot)}</small>}</td>
                      <td><span className={assignedCount < slot.requiredCount ? "assignment-count shortage" : assignedCount > slot.requiredCount ? "assignment-count excess" : "assignment-count"}>{assignedCount}/{slot.requiredCount}人</span></td>
                      <td className={assignedCount < slot.requiredCount ? "assignment-members-cell shortage" : "assignment-members-cell"}>
                        <div className="assignment-members">
                          {detail.members.map((member) =>
                            renderMember(slot, member),
                          )}
                        </div>
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          ) : viewMode === "calendar" ? (
            <div className="assignment-calendar-wrap">
              <table className="assignment-calendar">
                <thead>
                  <tr>
                    <th>日付</th>
                    {timeColumns.map((time) => (
                      <th key={`${time.startTime}|${time.endTime}`}>
                        {displayShiftTime(time.startTime)}
                        <small>{displayShiftTime(time.endTime)}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dates.map((date) => (
                    <tr key={date}>
                      <th>{formatShiftDate(date)}</th>
                      {timeColumns.map((time) => (
                        <td key={`${date}|${time.startTime}|${time.endTime}`}>
                          {visibleSlots
                            .filter(
                              (slot) =>
                                slot.date === date &&
                                slot.startTime === time.startTime &&
                                slot.endTime === time.endTime,
                            )
                            .map(renderSlot)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : viewMode === "member" ? (
            <div className="assignment-member-view-wrap">
              <table className="assignment-member-view-table">
                <thead>
                  <tr>
                    <th className="assignment-member-view-name">メンバー</th>
                    {memberViewSlotGroups.map((group) => (
                      <th key={group.key}>
                        <span>{formatShiftDate(group.date)}</span>
                        <small>{displayShiftTime(group.startTime)}〜{displayShiftTime(group.endTime)}</small>
                        {group.slots.map((slot) => (
                          (() => {
                            const assignedCount = new Set(assignments[slot.id] ?? []).size;
                            return (
                              <small
                                key={slot.id}
                                className={assignedCount < slot.requiredCount ? "assignment-member-view-slot-summary is-shortage" : "assignment-member-view-slot-summary"}
                              >
                                {slot.role || "共通"}・必要{slot.requiredCount}人（割当{assignedCount}人）
                              </small>
                            );
                          })()
                        ))}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.members.map((member) => (
                    <tr key={member.userEmail}>
                      <th className="assignment-member-view-name">
                        {member.displayName || member.userEmail.split("@")[0]}
                      </th>
                      {memberViewSlotGroups.map((group) => renderMemberViewCell(member, group))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}</>}
          <div className="member-summary">
            <h3>勤務状況サマリ</h3>
            <div className="member-summary-head" aria-hidden="true">
              <span>メンバー</span>
              <span>希望日数</span>
              <span>希望時間</span>
              <span>期間内割当</span>
              <span>週平均換算</span>
              <span>差分・判定</span>
              <span>希望更新</span>
            </div>
            {memberSummary.map((row) => (
              <div
                className={`member-summary-row ${row.warnings ? "has-warning" : ""}`}
                key={row.member.userEmail}
              >
                <strong>
                  {row.member.displayName || row.member.userEmail.split("@")[0]}
                </strong>
                <span>{row.pref ? `週${row.pref.minDays}〜${row.pref.maxDays}日` : "未設定"}</span>
                <span>{row.pref ? `週${row.pref.minHours}〜${row.pref.maxHours}時間` : "未設定"}</span>
                <span>{row.days}日 / {row.totalHours.toFixed(1)}時間</span>
                <span>{row.weeklyDays.toFixed(1)}日 / {row.weeklyHours.toFixed(1)}時間</span>
                <span className={row.preferenceOutOfRange ? "summary-warning" : "summary-ok"}>
                  {row.pref
                    ? row.preferenceOutOfRange
                      ? `範囲外（差分 ${row.dayDifference >= 0 ? "+" : ""}${row.dayDifference.toFixed(1)}日 / ${row.hourDifference >= 0 ? "+" : ""}${row.hourDifference.toFixed(1)}時間）`
                      : "範囲内"
                    : "希望未設定"}
                  {row.laborWarningCount > 0 && <small className="summary-warning summary-labor-warning">労務注意 {row.laborWarningCount}件</small>}
                </span>
                <span className={row.updatedAt ? "" : "not-registered"}>
                  希望更新：{formatSubmissionTime(row.updatedAt)}
                </span>
                {row.requestComment && (
                  <span className="member-request-comment">今回の希望: {row.requestComment}</span>
                )}
              </div>
            ))}
          </div>
          <div className="shift-actions">
            {!selectedScenarioId && <>
              <button
                className="ghost-button"
                onClick={() => void save("draft")}
                disabled={busy}
              >
                下書きの変更を保存
              </button>
              <button
                className="primary-button"
                onClick={() => void save("published")}
                disabled={busy}
              >
                チェックして公開
              </button>
            </>}
          </div>
        </>
      )}
      {dutyDirectoryOpen && (
        <div className="approval-detail-overlay duty-directory-overlay" role="dialog" aria-modal="true" aria-labelledby="duty-directory-title" onClick={(event) => { if (event.target === event.currentTarget) setDutyDirectoryOpen(false); }}>
          <div className="approval-detail-panel duty-directory-panel">
            <div className="duty-directory-header">
              <div>
                <span className="eyebrow">DUTY DIRECTORY</span>
                <h3 id="duty-directory-title">担当可能一覧</h3>
                <p>担当マスタとメンバーごとの担当可能設定を表示します。割当や候補判定は変更しません。</p>
              </div>
              <button type="button" className="duty-directory-close" onClick={() => setDutyDirectoryOpen(false)} aria-label="担当可能一覧を閉じる">×</button>
            </div>
            <div className="duty-directory-scope" role="group" aria-label="表示対象">
              <button type="button" className={dutyDirectoryScope === "visible" ? "active" : ""} onClick={() => setDutyDirectoryScope("visible")}>現在表示中の候補</button>
              <button type="button" className={dutyDirectoryScope === "all" ? "active" : ""} onClick={() => setDutyDirectoryScope("all")}>全メンバー</button>
            </div>
            {dutyDirectoryDuties.length === 0 ? (
              <p className="duty-directory-empty">担当業務はまだ登録されていません。</p>
            ) : (
              <div className="duty-directory-table-wrap">
                <table className="duty-directory-table">
                  <thead><tr><th>メンバー</th>{dutyDirectoryDuties.map((duty) => <th key={duty.id}>{duty.name}</th>)}</tr></thead>
                  <tbody>
                    {dutyDirectoryMembers.map((member) => {
                      const names = new Set(memberDutyNames(member));
                      return <tr key={member.userEmail}>
                        <th>{member.displayName || member.userEmail.split("@")[0]}</th>
                        {dutyDirectoryDuties.map((duty) => <td className={names.has(duty.name) ? "is-capable" : "is-unavailable"} key={duty.id} aria-label={`${duty.name}: ${names.has(duty.name) ? "担当可能" : "担当不可または未設定"}`}>{names.has(duty.name) ? "✓ 可能" : "—"}</td>)}
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      {notice && (
        <p className="group-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
