const MAX_SHIFT_MINUTES = 30 * 60;

export function shiftTimeToMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes < 0 || minutes > MAX_SHIFT_MINUTES || Number(match[2]) >= 60) return Number.NaN;
  return minutes;
}

export function isValidShiftTime(value: string) {
  const minutes = shiftTimeToMinutes(value);
  return Number.isFinite(minutes) && minutes % 30 === 0 && (minutes < MAX_SHIFT_MINUTES || value === "30:00");
}

export function minutesToShiftTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function displayShiftTime(value: string) {
  const minutes = shiftTimeToMinutes(value);
  if (!Number.isFinite(minutes) || minutes < 24 * 60) return value;
  return `${value}（翌${minutesToShiftTime(minutes - 24 * 60)}）`;
}

export function addDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function shiftDateTime(date: string, time: string) {
  const minutes = shiftTimeToMinutes(time);
  if (!Number.isFinite(minutes)) return { date, time };
  return { date: addDate(date, Math.floor(minutes / (24 * 60))), time: minutesToShiftTime(minutes % (24 * 60)) };
}
