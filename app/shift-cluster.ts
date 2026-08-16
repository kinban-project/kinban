import { shiftTimeToMinutes } from "./shift-time";

export type ShiftClusterInterval = {
  date: string;
  startTime: string;
  endTime: string;
};

function intervalMinutes(interval: ShiftClusterInterval) {
  return {
    start: shiftTimeToMinutes(interval.startTime),
    end: shiftTimeToMinutes(interval.endTime),
  };
}

/** 同じ日の勤務枠を、接続する枠も含めた勤務ブロック数にまとめます。 */
export function sameDayWorkClusterCount(intervals: ShiftClusterInterval[], date: string) {
  const ranges = intervals
    .filter((interval) => interval.date === date)
    .map(intervalMinutes)
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  let clusters = 0;
  let currentEnd = -1;
  for (const range of ranges) {
    if (range.start > currentEnd) {
      clusters += 1;
      currentEnd = range.end;
    } else {
      currentEnd = Math.max(currentEnd, range.end);
    }
  }
  return clusters;
}

/** 候補枠の追加で同日中抜けが増えないかを判定します。 */
export function doesNotCreateSplitShift(existing: ShiftClusterInterval[], candidate: ShiftClusterInterval) {
  const before = sameDayWorkClusterCount(existing, candidate.date);
  const after = sameDayWorkClusterCount([...existing, candidate], candidate.date);
  return { allowed: before === 0 || after <= before, before, after, delta: after - before };
}
