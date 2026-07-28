import { and, eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { accountProfiles, assistantMessages, assistantReadStates, events, groupAssistants, groupJoinRequests, groupMembers, groups as groupTable, shiftAssignments, shiftSlots, siteUsers } from "../../../db/schema";
import { getMembership } from "../groups/group-access";
import { toPublicMember } from "../groups/member-dto";

export const dynamic = "force-dynamic";

const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

function timestamp(value: string) {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function unauthorized() {
  return Response.json({ error: "ログインが必要です" }, { status: 401 });
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const db = getDb();
  const memberships = await db.select().from(groupMembers).where(and(eq(groupMembers.userEmail, user.email), eq(groupMembers.status, "active")));
  const [profile] = await db.select().from(accountProfiles).where(eq(accountProfiles.userEmail, user.email)).limit(1);
  const [siteUser] = await db.select().from(siteUsers).where(eq(siteUsers.userEmail, user.email)).limit(1);
  const groupTableRows = memberships.length ? await db.select().from(groupTable).where(inArray(groupTable.id, memberships.map((item) => item.groupId))) : [];
  const pendingMemberRequests = memberships.length ? await db.select().from(groupJoinRequests).where(inArray(groupJoinRequests.groupId, memberships.map((item) => item.groupId))) : [];
  const assistantRows = memberships.length ? await db.select().from(groupAssistants).where(inArray(groupAssistants.groupId, memberships.map((item) => item.groupId))) : [];
  const assistantMessagesRows = memberships.length ? await db.select().from(assistantMessages).where(inArray(assistantMessages.groupId, memberships.map((item) => item.groupId))) : [];
  const managerAttentionStatuses = new Set(["pending", "processing", "needs_review", "failed"]);
  const assistantReadRows = memberships.length ? await db.select().from(assistantReadStates).where(and(eq(assistantReadStates.readerEmail, user.email), inArray(assistantReadStates.groupId, memberships.map((item) => item.groupId)))) : [];
  const visibleGroupIds = memberships.filter((item) => item.showInPersonal).map((item) => item.groupId);
  const personalDisplayName = memberships.find((item) => item.userEmail === user.email)?.displayName?.trim() || profile?.nickname?.trim() || user.email.split("@")[0];
  const personalRows = await db.select().from(events).where(eq(events.ownerEmail, user.email));
  const eventGroupRows = visibleGroupIds.length ? await db.select().from(events).where(inArray(events.groupId, visibleGroupIds)) : [];
  const candidateRows = [...new Map([...personalRows, ...eventGroupRows].map((event) => [event.id, event])).values()];
  const shiftPlanIds = [...new Set(candidateRows.map((event) => event.shiftPlanId).filter((id): id is string => Boolean(id)))];
  const shiftSlotRows = shiftPlanIds.length ? await db.select().from(shiftSlots).where(inArray(shiftSlots.planId, shiftPlanIds)) : [];
  const assignmentChunks = await Promise.all(chunk(shiftSlotRows.map((slot) => slot.id), 50).map((slotIds) => slotIds.length ? db.select().from(shiftAssignments).where(inArray(shiftAssignments.slotId, slotIds)) : Promise.resolve([])));
  const assignedSlotIds = new Set(assignmentChunks.flat().filter((assignment) => assignment.userEmail === user.email).map((assignment) => assignment.slotId));
  const groupNameById = new Map(groupTableRows.map((group) => [group.id, group.name]));
  const planGroupById = new Map(
    candidateRows
      .filter((event) => Boolean(event.shiftPlanId && event.groupId))
      .map((event) => [event.shiftPlanId!, event.groupId!] as const),
  );
  const slotByEventKey = new Set(
    shiftSlotRows
      .filter((slot) => assignedSlotIds.has(slot.id))
      .map((slot) => {
        const groupName = groupNameById.get(planGroupById.get(slot.planId) ?? "") ?? "予定";
        return `${slot.planId}|${slot.date}|${slot.startTime}|${slot.role?.trim() || groupName}`;
      }),
  );
  const visibleRows = candidateRows.filter((event) => {
    if (event.groupId && !visibleGroupIds.includes(event.groupId)) return false;
    if (!event.shiftPlanId) return !event.groupId || visibleGroupIds.includes(event.groupId);
    return slotByEventKey.has(`${event.shiftPlanId}|${event.date}|${event.startTime}|${event.title}`);
  });
  const rows = visibleRows
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
    .reduce<typeof visibleRows>((merged, event) => {
      const previous = merged.at(-1);
      const canMerge = Boolean(
        event.shiftPlanId &&
          previous?.shiftPlanId === event.shiftPlanId &&
          previous.groupId === event.groupId &&
          previous.title === event.title &&
          previous.date === event.date &&
          previous.endDate === event.endDate &&
          previous.endTime === event.startTime,
      );
      if (canMerge && previous) {
        previous.endTime = event.endTime;
        return merged;
      }
      merged.push({ ...event });
      return merged;
    }, [])
    .sort((a, b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`));
  return Response.json({
    email: user.email,
    siteAccess: { isSiteAdmin: Boolean(siteUser?.isSiteAdmin), canCreateGroups: Boolean(siteUser?.isSiteAdmin || siteUser?.canCreateGroups) },
    groups: memberships.map((membership) => {
      const manager = membership.role === "owner" || membership.role === "editor";
      const memberReadState = assistantReadRows.find((row) => row.groupId === membership.groupId && row.memberEmail === user.email);
      const lastMemberReadTimestamp = memberReadState?.lastReadAt ? timestamp(memberReadState.lastReadAt) : 0;
      const memberAssistantUnread = assistantMessagesRows.some((message) => message.groupId === membership.groupId && message.memberEmail === user.email && timestamp(message.createdAt) > lastMemberReadTimestamp && (message.senderType === "assistant" || message.senderType === "system" || message.senderType === "manager"));
      const managerAssistantUnread = manager && assistantMessagesRows.some((message) => message.groupId === membership.groupId && message.senderType === "member" && message.memberEmail !== user.email && managerAttentionStatuses.has(message.status));
      return { ...toPublicMember(membership, false), name: groupTableRows.find((group) => group.id === membership.groupId)?.name ?? membership.groupId, assistantDisplayName: assistantRows.find((assistant) => assistant.groupId === membership.groupId)?.displayName?.trim() || "KINBANアシスタント", unreadAssistant: memberAssistantUnread, managerAssistantUnread, pendingMemberRequests: groupTableRows.find((group) => group.id === membership.groupId)?.ownerEmail === user.email ? pendingMemberRequests.filter((request) => request.groupId === membership.groupId && request.status === "pending").length : 0 };
    }),
    events: rows.map((event) => {
      const membership = event.groupId ? memberships.find((item) => item.groupId === event.groupId) : null;
      const groupName = event.groupId ? groupTableRows.find((group) => group.id === event.groupId)?.name ?? event.groupId : null;
      return { ...event, title: event.title, notes: event.shiftPlanId ? `担当：${personalDisplayName}` : event.notes, groupName, readOnly: Boolean(event.shiftPlanId || (event.groupId && membership?.role !== "owner" && membership?.role !== "editor")) };
    }),
  });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const payload = await request.json() as Partial<typeof events.$inferInsert>;
  const title = payload.title?.trim() ?? "";
  const date = payload.date?.trim() ?? "";
  if (!title || !date) return Response.json({ error: "title and date are required" }, { status: 400 });
  const groupId = payload.groupId ?? null;
  if (groupId) {
    const membership = await getMembership(groupId, user.email);
    if (!membership) return Response.json({ error: "このグループのメンバーではありません" }, { status: 403 });
    if (membership.role !== "owner" && membership.role !== "editor") return Response.json({ error: "グループ予定を編集する権限がありません" }, { status: 403 });
  }
  const event = {
    id: crypto.randomUUID(), ownerEmail: user.email, groupId, title, date, endDate: payload.endDate ?? date,
    startTime: payload.startTime ?? "", endTime: payload.endTime ?? "",
    category: payload.category ?? "予定", notes: payload.notes ?? "", completed: false,
  };
  await getDb().insert(events).values(event);
  return Response.json({ event: { ...event, readOnly: false } }, { status: 201 });
}
