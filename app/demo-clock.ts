import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { demoClocks } from "../db/schema";
import { isDemoModeServer } from "./demo-mode";

export const DEMO_DEFAULT_NOW = "2026-07-21T09:00:00+09:00";

export async function getDemoNow(groupId: string) {
  void groupId;
  if (!isDemoModeServer()) return new Date();
  const [clock] = await getDb().select().from(demoClocks).where(eq(demoClocks.scope, "public-demo")).limit(1);
  return new Date(clock?.currentAt ?? DEMO_DEFAULT_NOW);
}

export async function getDemoTimeContext(groupId: string) {
  const current = await getDemoNow(groupId);
  const today = jstDate(current);
  return {
    groupId,
    demoMode: isDemoModeServer(),
    currentAt: current.toISOString(),
    today,
    month: today.slice(0, 7),
    timezone: "Asia/Tokyo",
  };
}

export async function advanceDemoClock(minutes: number) {
  const db = getDb();
  const [clock] = await db.select().from(demoClocks).where(eq(demoClocks.scope, "public-demo")).limit(1);
  const current = new Date(clock?.currentAt ?? DEMO_DEFAULT_NOW);
  const next = new Date(current.getTime() + Math.max(1, minutes) * 60_000);
  const currentAt = next.toISOString();
  const updatedAt = new Date().toISOString();
  await db.insert(demoClocks).values({ scope: "public-demo", currentAt, updatedAt }).onConflictDoUpdate({
    target: demoClocks.scope,
    set: { currentAt, updatedAt },
  });
  return next;
}

export function jstDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(value);
}
