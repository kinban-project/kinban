export type ShiftDisplayStatus =
  "before-request" | "request-open" | "assignment" | "published" | "ended";

type ShiftStatusInput = {
  status: "draft" | "published" | string;
  endDate: string;
  requestStatus?: "pending" | "open" | "closed" | string | null;
};

export function getShiftDisplayStatus(
  plan: ShiftStatusInput,
  todayOverride?: string,
): ShiftDisplayStatus {
  const today = todayOverride ?? new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
  }).format(new Date());
  if (plan.endDate < today) return "ended";
  if (plan.status === "published") return "published";
  if (plan.requestStatus === "closed") return "assignment";
  if (plan.requestStatus === "open") return "request-open";
  return "before-request";
}

export function getShiftDisplayLabel(status: ShiftDisplayStatus) {
  return {
    "before-request": "希望受付前",
    "request-open": "希望受付中",
    assignment: "割当作業中",
    published: "公開済み",
    ended: "終了",
  }[status];
}
