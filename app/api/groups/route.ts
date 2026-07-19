import { and, eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { groupAssistants, groupJoinRequests, groupMembers, groups, shiftRequestPeriods } from "../../../db/schema";
import { recordAudit } from "../../audit-log";
import { toPublicMember } from "../groups/member-dto";

export const dynamic = "force-dynamic";

function identityRequired() {
  return Response.json({ error: "ログインが必要です" }, { status: 401 });
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return identityRequired();
  const db = getDb();
  const memberships = await db.select().from(groupMembers).where(eq(groupMembers.userEmail, user.email));
  const activeMemberships = memberships.filter((item) => item.status === "active");
  const owned = await db.select().from(groups).where(eq(groups.ownerEmail, user.email));
  const ids = [...new Set([...activeMemberships.map((item) => item.groupId), ...owned.map((item) => item.id)])];
  const rows = ids.length ? await db.select().from(groups).where(inArray(groups.id, ids)) : [];
  const requests = await db.select().from(groupJoinRequests).where(and(eq(groupJoinRequests.userEmail, user.email), eq(groupJoinRequests.status, "pending")));
  const pendingMemberRequests = ids.length ? await db.select().from(groupJoinRequests).where(and(inArray(groupJoinRequests.groupId, ids), eq(groupJoinRequests.status, "pending"))) : [];
  const periods = ids.length ? await db.select().from(shiftRequestPeriods).where(inArray(shiftRequestPeriods.groupId, ids)) : [];
  return Response.json({ groups: rows.map((group) => { const membership = activeMemberships.find((item) => item.groupId === group.id); const nextRequestCloseDate = periods.filter((period) => period.groupId === group.id && period.status === "open" && period.closesOn).map((period) => period.closesOn).sort()[0] ?? null; return { ...group, membership: membership ? toPublicMember(membership, false) : { role: "owner", status: "active", showInPersonal: true }, pendingJoin: requests.some((item) => item.groupId === group.id), pendingMemberRequests: group.ownerEmail === user.email ? pendingMemberRequests.filter((item) => item.groupId === group.id).length : 0, nextRequestCloseDate }; }) });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return identityRequired();
  const body = await request.json() as { name?: string; description?: string };
  const name = body.name?.trim() ?? "";
  if (!name) return Response.json({ error: "グループ名は必須です" }, { status: 400 });
  const id = crypto.randomUUID();
  const db = getDb();
  await db.batch([
    db.insert(groups).values({ id, name, description: body.description?.trim() ?? "", ownerEmail: user.email }),
    db.insert(groupMembers).values({ id: crypto.randomUUID(), groupId: id, userEmail: user.email, role: "owner", showInPersonal: true }),
    db.insert(groupAssistants).values({ groupId: id }),
  ]);
  await recordAudit({ groupId: id, userEmail: user.email, action: "group.create", entityType: "group", entityId: id, summary: `グループを作成: ${name}` });
  return Response.json({ group: { id, name, description: body.description?.trim() ?? "", ownerEmail: user.email, membership: { role: "owner", showInPersonal: true } } }, { status: 201 });
}
