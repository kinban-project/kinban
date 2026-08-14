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
