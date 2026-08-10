import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { shiftRequestPeriods, shiftRequests, shiftSlots } from "../db/schema";

const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size));
  return chunks;
};

/** Remove saved request rows whose date/time no longer exists in the plan. */
export async function pruneInvalidShiftRequests(
  db: ReturnType<typeof getDb>,
  planId: string,
) {
  const periods = await db
    .select({ id: shiftRequestPeriods.id })
    .from(shiftRequestPeriods)
    .where(eq(shiftRequestPeriods.planId, planId));
  if (!periods.length) return 0;

  const slots = await db
    .select({ date: shiftSlots.date, startTime: shiftSlots.startTime, endTime: shiftSlots.endTime })
    .from(shiftSlots)
    .where(eq(shiftSlots.planId, planId));
  const validSlots = new Set(
    slots.map((slot) => `${slot.date}|${slot.startTime}|${slot.endTime}`),
  );
  const requests = await db
    .select({ id: shiftRequests.id, date: shiftRequests.date, startTime: shiftRequests.startTime, endTime: shiftRequests.endTime })
    .from(shiftRequests)
    .where(inArray(shiftRequests.periodId, periods.map((period) => period.id)));
  const invalidIds = requests
    .filter((request) => !validSlots.has(`${request.date}|${request.startTime}|${request.endTime}`))
    .map((request) => request.id);
  for (const ids of chunk(invalidIds, 50)) {
    await db.delete(shiftRequests).where(inArray(shiftRequests.id, ids));
  }
  return invalidIds.length;
}

export async function pruneInvalidShiftRequestsForPlans(
  db: ReturnType<typeof getDb>,
  planIds: string[],
) {
  let total = 0;
  for (const planId of [...new Set(planIds)]) {
    total += await pruneInvalidShiftRequests(db, planId);
  }
  return total;
}
