export type DutySlotLike = {
  id: string;
  dutyId?: string | null;
  dutyNameSnapshot?: string | null;
  date?: string;
  startTime?: string;
  endTime?: string;
};

export type DutyAssignmentLike = { slotId: string; userEmail: string };

export type DutyValidationError = {
  slotId: string;
  userEmail: string;
  dutyId: string;
  dutyName: string;
  message: string;
};

export type DutyMemberLike = {
  userEmail: string;
  displayName?: string | null;
  dutyIds?: string[];
  status?: string | null;
};

export type DutyCoverageWarning = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  slotIds: string[];
  missingDutyIds: string[];
  missingDutyNames: string[];
  message: string;
};

function timeToMinutes(value?: string | null) {
  if (!value) return Number.NaN;
  const match = value.trim().match(/^(\d+):(\d{2})$/);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Reports missing capabilities for overlapping slot groups. A duty becomes a
 * required capability only when it is explicitly attached to one of the
 * overlapping slots, so legacy slots without duties keep their old behavior.
 */
export function buildDutyCoverageWarnings({
  slots,
  assignments,
  members,
}: {
  slots: DutySlotLike[];
  assignments: DutyAssignmentLike[];
  members: DutyMemberLike[];
}): DutyCoverageWarning[] {
  const validSlots = slots.filter((slot) => Number.isFinite(timeToMinutes(slot.startTime)) && Number.isFinite(timeToMinutes(slot.endTime)));
  const assignmentMap = new Map<string, Set<string>>();
  for (const row of assignments) {
    const users = assignmentMap.get(row.slotId) ?? new Set<string>();
    users.add(row.userEmail);
    assignmentMap.set(row.slotId, users);
  }
  const memberByEmail = new Map(members.map((member) => [member.userEmail, member]));
  const visited = new Set<string>();
  const warnings: DutyCoverageWarning[] = [];
  const overlaps = (left: DutySlotLike, right: DutySlotLike) =>
    left.date === right.date &&
    timeToMinutes(left.startTime) < timeToMinutes(right.endTime) &&
    timeToMinutes(right.startTime) < timeToMinutes(left.endTime);

  for (const root of validSlots) {
    if (visited.has(root.id)) continue;
    const component: DutySlotLike[] = [];
    const queue = [root];
    visited.add(root.id);
    while (queue.length) {
      const current = queue.shift()!;
      component.push(current);
      for (const candidate of validSlots) {
        if (visited.has(candidate.id) || !overlaps(current, candidate)) continue;
        visited.add(candidate.id);
        queue.push(candidate);
      }
    }
    const requiredByDuty = new Map<string, string>();
    for (const slot of component) {
      if (slot.dutyId) requiredByDuty.set(slot.dutyId, slot.dutyNameSnapshot?.trim() || slot.dutyId);
    }
    if (!requiredByDuty.size) continue;
    const assignedUsers = new Set(component.flatMap((slot) => [...(assignmentMap.get(slot.id) ?? [])]));
    const covered = new Set<string>();
    for (const userEmail of assignedUsers) {
      for (const dutyId of memberByEmail.get(userEmail)?.dutyIds ?? []) covered.add(dutyId);
    }
    const missing = [...requiredByDuty.entries()].filter(([dutyId]) => !covered.has(dutyId));
    if (!missing.length) continue;
    const start = Math.min(...component.map((slot) => timeToMinutes(slot.startTime)));
    const end = Math.max(...component.map((slot) => timeToMinutes(slot.endTime)));
    const startTime = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
    const endTime = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
    const missingDutyNames = missing.map(([, dutyName]) => dutyName);
    const slotIds = component.map((slot) => slot.id).sort();
    warnings.push({
      id: `coverage:${component[0].date}:${slotIds.join(",")}`,
      date: component[0].date ?? "",
      startTime,
      endTime,
      slotIds,
      missingDutyIds: missing.map(([dutyId]) => dutyId),
      missingDutyNames,
      message: `${component[0].date} ${startTime}〜${endTime}：体制不足（${missingDutyNames.join("、")}を担当可能な人がいません）`,
    });
  }
  return warnings;
}

/** A slot without a duty keeps the legacy all-members candidate behavior. */
export function buildMemberDutyMap(rows: Array<{ userEmail: string; dutyId: string }>) {
  const result = new Map<string, Set<string>>();
  for (const row of rows) {
    const duties = result.get(row.userEmail) ?? new Set<string>();
    duties.add(row.dutyId);
    result.set(row.userEmail, duties);
  }
  return result;
}

/** Duty-bound slots require an explicit member capability row. */
export function memberCanTakeDuty(
  slot: DutySlotLike,
  userEmail: string,
  memberDuties: Map<string, Set<string>>,
) {
  return !slot.dutyId || memberDuties.get(userEmail)?.has(slot.dutyId) === true;
}

export function validateDutyAssignments(
  slots: DutySlotLike[],
  assignments: DutyAssignmentLike[],
  memberDuties: Map<string, Set<string>>,
) {
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const errors: DutyValidationError[] = [];
  for (const assignment of assignments) {
    const slot = slotById.get(assignment.slotId);
    if (!slot?.dutyId || memberCanTakeDuty(slot, assignment.userEmail, memberDuties)) continue;
    const dutyName = slot.dutyNameSnapshot?.trim() || "担当";
    errors.push({
      slotId: slot.id,
      userEmail: assignment.userEmail,
      dutyId: slot.dutyId,
      dutyName,
      message: `${assignment.userEmail}は${dutyName}を担当可能として登録されていません`,
    });
  }
  return errors;
}
