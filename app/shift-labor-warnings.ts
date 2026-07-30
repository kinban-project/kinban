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

export type LaborRules = {
  plannedBreakWarning?: boolean;
  dailyHoursWarning?: boolean;
  weeklyHoursWarning?: boolean;
  restIntervalWarning?: boolean;
  consecutiveDaysWarning?: boolean;
  weeklyRestWarning?: boolean;
  dailyHoursLimitMinutes?: number;
  weeklyHoursLimitMinutes?: number;
  restIntervalMinutes?: number;
  consecutiveDaysLimit?: number;
  weeklyRestDaysRequired?: number;
  fourWeekRestDaysRequired?: number;
};

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

function formatHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}時間${remainder}分` : `${hours}時間`;
}

export function buildLaborWarnings({
  slots,
  assignments,
  members,
  autoBreakSuggestion = true,
  rules = {},
  planStartDate,
  planEndDate,
}: {
  slots: LaborSlot[];
  assignments: LaborAssignment[] | Record<string, string[]>;
  members: LaborMember[];
  preferences?: LaborPreference[];
  autoBreakSuggestion?: boolean;
  rules?: LaborRules;
  planStartDate: string;
  planEndDate: string;
}) {
  const laborRules = {
    plannedBreakWarning: rules.plannedBreakWarning ?? true,
    dailyHoursWarning: rules.dailyHoursWarning ?? true,
    weeklyHoursWarning: rules.weeklyHoursWarning ?? true,
    restIntervalWarning: rules.restIntervalWarning ?? true,
    consecutiveDaysWarning: rules.consecutiveDaysWarning ?? true,
    weeklyRestWarning: rules.weeklyRestWarning ?? true,
    dailyHoursLimitMinutes: Math.max(1, rules.dailyHoursLimitMinutes ?? 480),
    weeklyHoursLimitMinutes: Math.max(1, rules.weeklyHoursLimitMinutes ?? 2400),
    restIntervalMinutes: Math.max(0, rules.restIntervalMinutes ?? 660),
    consecutiveDaysLimit: Math.max(1, rules.consecutiveDaysLimit ?? 7),
    weeklyRestDaysRequired: Math.max(0, rules.weeklyRestDaysRequired ?? 1),
    fourWeekRestDaysRequired: Math.max(0, rules.fourWeekRestDaysRequired ?? 4),
  };
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
      if (laborRules.plannedBreakWarning && !autoBreakSuggestion && breakMinutes > 0) {
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
      if (laborRules.dailyHoursWarning && effectiveMinutes > laborRules.dailyHoursLimitMinutes) {
        warnings.push({
          id: `daily-hours:${email}:${date}`,
          kind: "daily_hours",
          memberEmail: email,
          memberName: name,
          dates: [date],
          slotIds: blocks.flatMap((block) => block.slotIds),
          minutes: effectiveMinutes,
          message: `${date} ${name}：予定実労働時間が${formatHours(effectiveMinutes)}で、日上限${formatHours(laborRules.dailyHoursLimitMinutes)}を超えています`,
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
      if (laborRules.weeklyHoursWarning && weeklyEffectiveMinutes > laborRules.weeklyHoursLimitMinutes) {
        warnings.push({
          id: `weekly-hours:${email}:${windowDates[0]}`,
          kind: "weekly_hours",
          memberEmail: email,
          memberName: name,
          dates: windowDates,
          slotIds: windowBlocks.flatMap((block) => block.slotIds),
          minutes: weeklyEffectiveMinutes,
          message: `${windowDates[0]}〜${windowDates[6]} ${name}：週の予定実労働時間が${formatHours(weeklyEffectiveMinutes)}で、週上限${formatHours(laborRules.weeklyHoursLimitMinutes)}を超えています`,
        });
      }
    }
    for (let index = 1; index < allBlocks.length; index += 1) {
      const previous = allBlocks[index - 1];
      const current = allBlocks[index];
      const rest = dayNumber(current.date) * 1440 + current.start - (dayNumber(previous.date) * 1440 + previous.end);
      if (laborRules.restIntervalWarning && rest >= 0 && rest < laborRules.restIntervalMinutes) {
        warnings.push({
          id: `rest:${email}:${previous.date}:${current.date}:${current.start}`,
          kind: "rest_interval",
          memberEmail: email,
          memberName: name,
          dates: [previous.date, current.date],
          slotIds: [...previous.slotIds, ...current.slotIds],
          minutes: rest,
          message: `${current.date} ${name}：前回終業から次回始業までの間隔が${formatHours(rest)}で、休息間隔${formatHours(laborRules.restIntervalMinutes)}未満です`,
        });
      }
    }

    const workedDays = [...new Set(memberSlots.map((slot) => slot.date))].sort();
    let runStart = 0;
    for (let index = 1; index <= workedDays.length; index += 1) {
      const isConsecutive = index < workedDays.length && dayNumber(workedDays[index]) === dayNumber(workedDays[index - 1]) + 1;
      if (isConsecutive) continue;
      const run = workedDays.slice(runStart, index);
      if (laborRules.consecutiveDaysWarning && run.length >= laborRules.consecutiveDaysLimit) {
        warnings.push({
          id: `consecutive:${email}:${run[0]}`,
          kind: "consecutive_days",
          memberEmail: email,
          memberName: name,
          dates: run,
          slotIds: memberSlots.filter((slot) => run.includes(slot.date)).map((slot) => slot.id),
          message: `${run[0]}〜${run[run.length - 1]} ${name}：${run.length}日連続勤務です（連勤上限${laborRules.consecutiveDaysLimit}日）`,
        });
      }
      runStart = index;
    }

    for (let windowStart = startDay; windowStart + 6 <= endDay; windowStart += 7) {
      const windowDates = Array.from({ length: 7 }, (_, offset) => dateFromDay(windowStart + offset));
      const offDays = windowDates.filter((date) => !workedDays.includes(date));
      if (laborRules.weeklyRestWarning && offDays.length < laborRules.weeklyRestDaysRequired) {
        warnings.push({
          id: `weekly-rest:${email}:${windowDates[0]}`,
          kind: "weekly_rest",
          memberEmail: email,
          memberName: name,
          dates: windowDates,
          slotIds: memberSlots.filter((slot) => windowDates.includes(slot.date)).map((slot) => slot.id),
          message: `${windowDates[0]}〜${windowDates[6]} ${name}：7日間で休日${offDays.length}日（休日数${laborRules.weeklyRestDaysRequired}日以上が必要）`,
        });
      }
    }

    for (let windowStart = startDay; windowStart + 27 <= endDay; windowStart += 28) {
      const windowDates = Array.from({ length: 28 }, (_, offset) => dateFromDay(windowStart + offset));
      const offDays = windowDates.filter((date) => !workedDays.includes(date));
      if (laborRules.weeklyRestWarning && offDays.length < laborRules.fourWeekRestDaysRequired) {
        warnings.push({
          id: `four-week-rest:${email}:${windowDates[0]}`,
          kind: "weekly_rest",
          memberEmail: email,
          memberName: name,
          dates: windowDates,
          slotIds: memberSlots.filter((slot) => windowDates.includes(slot.date)).map((slot) => slot.id),
          message: `${windowDates[0]}〜${windowDates[27]} ${name}：28日間で休日${offDays.length}日（休日数${laborRules.fourWeekRestDaysRequired}日以上が必要）`,
        });
      }
    }
  }

  return warnings;
}
