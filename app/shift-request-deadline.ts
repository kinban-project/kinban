const jstOffset = "+09:00";

export function shiftRequestDeadline(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.length === 10 ? `${value}T23:59:59` : value.length === 16 ? `${value}:00` : value;
  const parsed = new Date(normalized.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}${jstOffset}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function shiftRequestDeadlinePassed(value: string | null | undefined, now = new Date()) {
  const deadline = shiftRequestDeadline(value);
  return Boolean(deadline && now.getTime() > deadline.getTime());
}

export function toDateTimeLocal(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T23:59`;
  return value.slice(0, 16);
}
