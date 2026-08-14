export type DutySlotLike = {
  id: string;
  dutyId?: string | null;
  dutyNameSnapshot?: string | null;
  coverageDutyIds?: string[] | string | null;
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

function parseCoverageDutyIds(value: DutySlotLike["coverageDutyIds"]): string[] {
  if (Array.isArray(value)) return value.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0) : [];
  } catch {
    return [];
  }
}

/** Reports missing capabilities for each actual simultaneous time interval. */
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
  const warnings: DutyCoverageWarning[] = [];
  const slotsByDate = new Map<string, DutySlotLike[]>();
  for (const slot of validSlots) {
    const date = slot.date ?? "";
    const rows = slotsByDate.get(date) ?? [];
    rows.push(slot);
    slotsByDate.set(date, rows);
  }

  for (const [date, dateSlots] of slotsByDate) {
    const boundaries = [...new Set(dateSlots.flatMap((slot) => [timeToMinutes(slot.startTime), timeToMinutes(slot.endTime)]))].sort((a, b) => a - b);
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const start = boundaries[index];
      const end = boundaries[index + 1];
      if (start >= end) continue;
      const activeSlots = dateSlots.filter((slot) => timeToMinutes(slot.startTime) < end && timeToMinutes(slot.endTime) > start);
      const requiredByDuty = new Map<string, string>();
      for (const slot of activeSlots) {
        for (const dutyId of parseCoverageDutyIds(slot.coverageDutyIds)) {
          requiredByDuty.set(dutyId, dutyId);
        }
      }
      if (!requiredByDuty.size) continue;
      const assignedUsers = new Set(activeSlots.flatMap((slot) => [...(assignmentMap.get(slot.id) ?? [])]));
      const covered = new Set<string>();
      for (const userEmail of assignedUsers) {
        for (const dutyId of memberByEmail.get(userEmail)?.dutyIds ?? []) covered.add(dutyId);
      }
      const missing = [...requiredByDuty.entries()].filter(([dutyId]) => !covered.has(dutyId));
      if (!missing.length) continue;
      const startTime = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
      const endTime = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
      const missingDutyNames = missing.map(([, dutyName]) => dutyName);
      const slotIds = activeSlots.map((slot) => slot.id).sort();
      warnings.push({
        id: `coverage:${date}:${startTime}-${endTime}:${missing.map(([dutyId]) => dutyId).join(",")}`,
        date,
        startTime,
        endTime,
        slotIds,
        missingDutyIds: missing.map(([dutyId]) => dutyId),
        missingDutyNames,
        message: `${date} ${startTime}〜${endTime}：体制不足（${missingDutyNames.join("、")}を担当可能な人がいません）`,
      });
    }
  }
  return warnings;
}

export function buildMemberDutyMap(rows: Array<{ userEmail: string; dutyId: string }>) {
  const result = new Map<string, Set<string>>();
  for (const row of rows) {
    const duties = result.get(row.userEmail) ?? new Set<string>();
    duties.add(row.dutyId);
    result.set(row.userEmail, duties);
  }
  return result;
}

export function memberCanTakeDuty(slot: DutySlotLike, userEmail: string, memberDuties: Map<string, Set<string>>) {
  return !slot.dutyId || memberDuties.get(userEmail)?.has(slot.dutyId) === true;
}

export function validateDutyAssignments(slots: DutySlotLike[], assignments: DutyAssignmentLike[], memberDuties: Map<string, Set<string>>) {
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
