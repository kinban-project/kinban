import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { agentUsageRecords, groupAssistants } from "../../../../db/schema";
import { requireApiIdentity } from "../../api-auth";

export const dynamic = "force-dynamic";

type UsagePayload = {
  groupId?: string | null;
  actorEmail?: string;
  userCategory?: string;
  model?: string;
  status?: "succeeded" | "failed";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  reasoningTokens?: number | null;
  cachedInputTokens?: number | null;
  pricingProfileId?: string;
  jpyPerUsd?: number;
  estimatedUsdMicros?: number | null;
  estimatedJpyMicros?: number | null;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};

function numberOrNull(value: unknown) {
  return value == null || value === "" ? null : Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : null;
}

export async function POST(request: Request) {
  const identity = await requireApiIdentity(request);
  if (identity instanceof Response) return identity;
  const canWrite = identity.scopes.includes("agent:usage:write") &&
    (identity.tokenType === "assistant" || (identity.tokenType === "personal" && identity.delegated));
  if (!canWrite) {
    return Response.json({ error: "A delegated assistant or member key with agent:usage:write scope is required." }, { status: 403 });
  }
  const payload = await request.json().catch(() => ({})) as UsagePayload;
  const groupId = payload.groupId || identity.groupId;
  if (!groupId || identity.groupId !== groupId) return Response.json({ error: "The key is restricted to its group." }, { status: 403 });
  if (identity.tokenType === "personal" && payload.actorEmail && payload.actorEmail !== identity.email) {
    return Response.json({ error: "A member usage record must belong to the authenticated member." }, { status: 403 });
  }
  const [assistant] = await getDb().select({ status: groupAssistants.status }).from(groupAssistants).where(eq(groupAssistants.groupId, groupId)).limit(1);
  if (assistant?.status !== "active") return Response.json({ error: "KINBAN assistant is inactive." }, { status: 403 });
  if (!payload.model || !payload.status || !payload.startedAt || !payload.completedAt || !payload.pricingProfileId) {
    return Response.json({ error: "model, status, startedAt, completedAt and pricingProfileId are required." }, { status: 400 });
  }
  const row = {
    id: crypto.randomUUID(),
    groupId,
    actorEmail: identity.tokenType === "personal" ? identity.email : payload.actorEmail?.trim() || identity.email,
    userCategory: identity.tokenType === "personal" ? "member" : payload.userCategory?.trim() || "unknown",
    model: payload.model.trim(),
    status: payload.status,
    startedAt: payload.startedAt,
    completedAt: payload.completedAt,
    durationMs: Math.max(0, Math.trunc(Number(payload.durationMs) || 0)),
    inputTokens: numberOrNull(payload.inputTokens),
    outputTokens: numberOrNull(payload.outputTokens),
    totalTokens: numberOrNull(payload.totalTokens),
    reasoningTokens: numberOrNull(payload.reasoningTokens),
    cachedInputTokens: numberOrNull(payload.cachedInputTokens),
    pricingProfileId: payload.pricingProfileId.trim(),
    jpyPerUsd: Math.max(1, Math.trunc(Number(payload.jpyPerUsd) || 160)),
    estimatedUsdMicros: numberOrNull(payload.estimatedUsdMicros),
    estimatedJpyMicros: numberOrNull(payload.estimatedJpyMicros),
    errorMessage: payload.errorMessage?.slice(0, 1000) || "",
    metadataJson: JSON.stringify(payload.metadata ?? {}),
  };
  await getDb().insert(agentUsageRecords).values(row);
  return Response.json({ data: { id: row.id, createdAt: new Date().toISOString() } }, { status: 201 });
}

export async function GET(request: Request) {
  const identity = await requireApiIdentity(request);
  if (identity instanceof Response) return identity;
  if (identity.tokenType !== "assistant" || !identity.scopes.includes("agent:usage:write")) return Response.json({ error: "Assistant usage scope is required." }, { status: 403 });
  const groupId = new URL(request.url).searchParams.get("groupId") || identity.groupId;
  if (!groupId || identity.groupId !== groupId) return Response.json({ error: "The assistant key is restricted to its group." }, { status: 403 });
  const rows = await getDb().select().from(agentUsageRecords).where(and(eq(agentUsageRecords.groupId, groupId), eq(agentUsageRecords.actorEmail, identity.email))).limit(100);
  return Response.json({ data: rows });
}
