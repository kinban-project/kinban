function jstDateHour(value: string) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

function nextJstDate(date: string) {
  const value = new Date(`${date}T00:00:00+09:00`);
  value.setUTCDate(value.getUTCDate() + 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(value);
}

/** Returns true once the attendance record has crossed the next 06:00 JST boundary. */
export function attendanceExpired(startedAt?: string | null, now = new Date()) {
  if (!startedAt) return false;
  const local = jstDateHour(startedAt);
  const resetDate = local.hour < 6 ? local.date : nextJstDate(local.date);
  return now.getTime() >= new Date(`${resetDate}T06:00:00+09:00`).getTime();
}
