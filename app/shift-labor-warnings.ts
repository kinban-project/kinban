import { shiftTimeToMinutes } from "./shift-time";

export type LaborWarning = {
  id: string;
  kind: "planned_break" | "daily_hours" | "weekly_hours" | "rest_interval" | "consecutive_days" | "weekly_rest";
  memberEmail: string;
  memberName?: string;
  dates: string[];
  slotIds: string[];
  startTime?: string;
  endTime?: string;
  minutes?: number;
  message: string;
};

type LaborSlot = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
};
type LaborAssignment = { slotId: string; userEmail: string };
type LaborMember = { userEmail: string; displayName?: string | null };

type WorkBlock = {
  date: string;
  start: number;
  end: number;
  slotIds: string[];
};

function dayNumber(date: string) {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

function dateFromDay(day: number) {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

function memberLabel(member: LaborMember | undefined, email: string) {
  return member?.displayName?.trim() || email.split("@")[0];
}

function buildBlocks(slots: LaborSlot[]) {
  const ordered = [...slots].sort((left, right) => {
    return shiftTimeToMinutes(left.startTime) - shiftTimeToMinutes(right.startTime);
  });
  const blocks: WorkBlock[] = [];
  for (const slot of ordered) {
    const start = shiftTimeToMinutes(slot.startTime);
    const end = shiftTimeToMinutes(slot.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const current = blocks[blocks.length - 1];
    if (current && start <= current.end) {
      current.end = Math.max(current.end, end);
      current.slotIds.push(slot.id);
    } else {
      blocks.push({ date: slot.date, start, end, slotIds: [slot.id] });
    }
  }
  return blocks;
}

function requiredBreakMinutes(minutes: number) {
  return minutes > 480 ? 60 : minutes > 360 ? 45 : 0;
}

export function buildLaborWarnings({
  slots,
  assignments,
  members,
  autoBreakSuggestion = true,
  planStartDate,
  planEndDate,
}: {
  slots: LaborSlot[];
  assignments: LaborAssignment[] | Record<string, string[]>;
  members: LaborMember[];
  preferences?: LaborPreference[];
  autoBreakSuggestion?: boolean;
  planStartDate: string;
  planEndDate: string;
}) {
  const assignmentRows = Array.isArray(assignments)
    ? assignments
    : Object.entries(assignments).flatMap(([slotId, userEmails]) =>
        userEmails.map((userEmail) => ({ slotId, userEmail })),
      );
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const memberByEmail = new Map(members.map((member) => [member.userEmail, member]));
  const byMember = new Map<string, LaborSlot[]>();
  for (const assignment of assignmentRows) {
    const slot = slotsById.get(assignment.slotId);
    if (!slot || !memberByEmail.has(assignment.userEmail)) continue;
    const rows = byMember.get(assignment.userEmail) ?? [];
    if (!rows.some((row) => row.id === slot.id)) rows.push(slot);
    byMember.set(assignment.userEmail, rows);
  }

  const warnings: LaborWarning[] = [];
  for (const [email, memberSlots] of byMember) {
    const name = memberLabel(memberByEmail.get(email), email);
    const blocksByDate = new Map<string, WorkBlock[]>();
    for (const slot of memberSlots) {
      const blocks = blocksByDate.get(slot.date) ?? [];
      blocksByDate.set(slot.date, [...blocks, ...buildBlocks([slot])]);
    }
    for (const date of blocksByDate.keys()) {
      blocksByDate.set(date, buildBlocks(memberSlots.filter((slot) => slot.date === date)));
    }
    for (const date of blocksByDate.keys()) {
      const blocks = buildBlocks(memberSlots.filter((slot) => slot.date === date));
      const grossMinutes = blocks.reduce((total, block) => total + block.end - block.start, 0);
      const breakMinutes = blocks.reduce((total, block) => total + requiredBreakMinutes(block.end - block.start), 0);
      const effectiveMinutes = Math.max(0, grossMinutes - breakMinutes);
      if (!autoBreakSuggestion && breakMinutes > 0) {
        for (const block of blocks) {
          const required = requiredBreakMinutes(block.end - block.start);
          if (!required) continue;
          warnings.push({
            id: `planned-break:${email}:${date}:${block.start}:${block.end}`,
            kind: "planned_break",
            memberEmail: email,
            memberName: name,
            dates: [date],
            slotIds: block.slotIds,
            startTime: `${String(Math.floor(block.start / 60)).padStart(2, "0")}:${String(block.start % 60).padStart(2, "0")}`,
            endTime: `${String(Math.floor(block.end / 60)).padStart(2, "0")}:${String(block.end % 60).padStart(2, "0")}`,
            minutes: required,
            message: `${date} ${name}：予定休憩が未設定の可能性があります（勤務ブロック${Math.round((block.end - block.start) / 60)}時間、目安${required}分）`,
          });
        }
      }
      if (effectiveMinutes > 480) {
        warnings.push({
          id: `daily-hours:${email}:${date}`,
          kind: "daily_hours",
          memberEmail: email,
          memberName: name,
          dates: [date],
          slotIds: blocks.flatMap((block) => block.slotIds),
          minutes: effectiveMinutes,
          message: `${date} ${name}：予定実労働時間が${Math.floor(effectiveMinutes / 60)}時間${effectiveMinutes % 60}分で、8時間を超えています`,
        });
      }
    }

    const allBlocks = [...blocksByDate.values()].flat().sort((left, right) => {
      return dayNumber(left.date) * 1440 + left.start - (dayNumber(right.date) * 1440 + right.start);
    });
    const startDay = dayNumber(planStartDate);
    const endDay = dayNumber(planEndDate);
    for (let windowStart = startDay; windowStart + 6 <= endDay; windowStart += 7) {
      const windowDates = Array.from({ length: 7 }, (_, offset) => dateFromDay(windowStart + offset));
      const windowBlocks = allBlocks.filter((block) => windowDates.includes(block.date));
      const weeklyEffectiveMinutes = windowBlocks.reduce(
        (total, block) => total + Math.max(0, block.end - block.start - requiredBreakMinutes(block.end - block.start)),
        0,
      );
      if (weeklyEffectiveMinutes > 2400) {
        warnings.push({
          id: `weekly-hours:${email}:${windowDates[0]}`,
          kind: "weekly_hours",
          memberEmail: email,
          memberName: name,
          dates: windowDates,
          slotIds: windowBlocks.flatMap((block) => block.slotIds),
          minutes: weeklyEffectiveMinutes,
          message: `${windowDates[0]}〜${windowDates[6]} ${name}：週の予定実労働時間が${Math.floor(weeklyEffectiveMinutes / 60)}時間${weeklyEffectiveMinutes % 60}分で、40時間を超えています`,
        });
      }
    }
    for (let index = 1; index < allBlocks.length; index += 1) {
      const previous = allBlocks[index - 1];
      const current = allBlocks[index];
      const rest = dayNumber(current.date) * 1440 + current.start - (dayNumber(previous.date) * 1440 + previous.end);
      if (rest >= 0 && rest < 660) {
        warnings.push({
          id: `rest:${email}:${previous.date}:${current.date}:${current.start}`,
          kind: "rest_interval",
          memberEmail: email,
          memberName: name,
          dates: [previous.date, current.date],
          slotIds: [...previous.slotIds, ...current.slotIds],
          minutes: rest,
          message: `${current.date} ${name}：前回終業から次回始業までの間隔が${rest}分で、11時間未満です`,
        });
      }
    }

    const workedDays = [...new Set(memberSlots.map((slot) => slot.date))].sort();
    let runStart = 0;
    for (let index = 1; index <= workedDays.length; index += 1) {
      const isConsecutive = index < workedDays.length && dayNumber(workedDays[index]) === dayNumber(workedDays[index - 1]) + 1;
      if (isConsecutive) continue;
      const run = workedDays.slice(runStart, index);
      if (run.length >= 6) {
        warnings.push({
          id: `consecutive:${email}:${run[0]}`,
          kind: "consecutive_days",
          memberEmail: email,
          memberName: name,
          dates: run,
          slotIds: memberSlots.filter((slot) => run.includes(slot.date)).map((slot) => slot.id),
          message: `${run[0]}〜${run[run.length - 1]} ${name}：${run.length}日連続勤務になっています`,
        });
      }
      runStart = index;
    }

    for (let windowStart = startDay; windowStart + 6 <= endDay; windowStart += 7) {
      const windowDates = Array.from({ length: 7 }, (_, offset) => dateFromDay(windowStart + offset));
      const offDays = windowDates.filter((date) => !workedDays.includes(date));
      if (offDays.length === 0) {
        warnings.push({
          id: `weekly-rest:${email}:${windowDates[0]}`,
          kind: "weekly_rest",
          memberEmail: email,
          memberName: name,
          dates: windowDates,
          slotIds: memberSlots.filter((slot) => windowDates.includes(slot.date)).map((slot) => slot.id),
          message: `${windowDates[0]}〜${windowDates[6]} ${name}：週1日の休日を満たさない可能性があります`,
        });
      }
    }

    for (let windowStart = startDay; windowStart + 27 <= endDay; windowStart += 28) {
      const windowDates = Array.from({ length: 28 }, (_, offset) => dateFromDay(windowStart + offset));
      const offDays = windowDates.filter((date) => !workedDays.includes(date));
      if (offDays.length < 4) {
        warnings.push({
          id: `four-week-rest:${email}:${windowDates[0]}`,
          kind: "weekly_rest",
          memberEmail: email,
          memberName: name,
          dates: windowDates,
          slotIds: memberSlots.filter((slot) => windowDates.includes(slot.date)).map((slot) => slot.id),
          message: `${windowDates[0]}〜${windowDates[27]} ${name}：4週間で4日以上の休日を満たさない可能性があります`,
        });
      }
    }
  }

  return warnings;
}
