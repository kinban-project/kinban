import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { demoClocks } from "../../../db/schema";
import { advanceDemoClock, DEMO_DEFAULT_NOW } from "../../demo-clock";

export const dynamic = "force-dynamic";

const steps: Record<string, number> = {
  fiveMinutes: 5,
  fifteenMinutes: 15,
  hour: 60,
  sixHours: 6 * 60,
  day: 24 * 60,
  threeDays: 3 * 24 * 60,
  week: 7 * 24 * 60,
};

function jstDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as { year: string; month: string; day: string };
}

async function getCurrentClock() {
  const [clock] = await getDb()
    .select()
    .from(demoClocks)
    .where(eq(demoClocks.scope, "public-demo"))
    .limit(1);
  return new Date(clock?.currentAt ?? DEMO_DEFAULT_NOW);
}

async function saveClock(value: Date) {
  const currentAt = value.toISOString();
  const updatedAt = new Date().toISOString();
  await getDb()
    .insert(demoClocks)
    .values({ scope: "public-demo", currentAt, updatedAt })
    .onConflictDoUpdate({
      target: demoClocks.scope,
      set: { currentAt, updatedAt },
    });
  return currentAt;
}

export async function GET() {
  const current = await getCurrentClock();
  return Response.json({ currentAt: current.toISOString() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    step?: string;
    targetAt?: string;
  };
  const current = await getCurrentClock();

  if (body.targetAt) {
    const target = new Date(body.targetAt);
    if (Number.isNaN(target.getTime()) || target.getTime() <= current.getTime()) {
      return Response.json(
        { error: "現在時刻より後の日時を指定してください。" },
        { status: 400 },
      );
    }
    return Response.json({ currentAt: await saveClock(target) });
  }

  if (body.step === "nextDayNine") {
    const date = jstDateParts(current);
    const nextDayNine = new Date(
      Date.UTC(Number(date.year), Number(date.month) - 1, Number(date.day) + 1, 0, 0, 0),
    );
    return Response.json({ currentAt: await saveClock(nextDayNine) });
  }

  const minutes = steps[body.step ?? ""];
  if (!minutes) {
    return Response.json({ error: "進める時間を指定してください。" }, { status: 400 });
  }
  const next = await advanceDemoClock(minutes);
  return Response.json({ currentAt: next.toISOString() });
}
