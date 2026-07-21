import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { demoClocks } from "../../../db/schema";
import { advanceDemoClock, DEMO_DEFAULT_NOW } from "../../demo-clock";

export const dynamic = "force-dynamic";

const steps: Record<string, number> = {
  hour: 60,
  day: 24 * 60,
  threeDays: 3 * 24 * 60,
  week: 7 * 24 * 60,
};

export async function GET() {
  const [clock] = await getDb().select().from(demoClocks).where(eq(demoClocks.scope, "public-demo")).limit(1);
  return Response.json({ currentAt: clock?.currentAt ?? DEMO_DEFAULT_NOW });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { step?: string };
  const minutes = steps[body.step ?? ""];
  if (!minutes) return Response.json({ error: "対応していない進行幅です" }, { status: 400 });
  const current = await advanceDemoClock(minutes);
  return Response.json({ currentAt: current.toISOString() });
}
