import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import {
  accountProfiles,
  announcementReads,
  announcementReplies,
  auditLogs,
  events,
  groupAnnouncements,
  groupJoinRequests,
  groupMembers,
  groupPreferences,
  groups,
  shiftAssignments,
  shiftAvailability,
  shiftPlans,
  shiftRequests,
  shiftRequestPeriods,
  shiftRequestSubmissions,
  shiftSlots,
  workRecords,
  workBreaks,
  monthlyWorkClaims,
} from "../../../../../../db/schema";
import { requireApiIdentity } from "../../../../api-auth";
import { pruneInvalidShiftRequestsForPlans } from "../../../../../shift-request-cleanup";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function chunk<T>(values: T[], size = 50) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export async function GET(_request: Request, context: Context) {
  const identity = await requireApiIdentity(_request);
  if (identity instanceof Response) return identity;

  const { id: groupId } = await context.params;
  const db = getDb();
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group) return error("Group not found.", 404);

  const [membership] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userEmail, identity.email)))
    .limit(1);
  if (!membership || membership.status !== "active") return error("Active group membership is required.", 403);
  if (membership.role !== "owner" && membership.role !== "editor") return error("Owner or editor permission is required.", 403);

  const [members, joinRequests, plans, preferences, availability, announcements, logs, groupEvents, records, monthlyClaims] = await Promise.all([
    db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId)),
    db.select().from(groupJoinRequests).where(eq(groupJoinRequests.groupId, groupId)),
    db.select().from(shiftPlans).where(eq(shiftPlans.groupId, groupId)),
    db.select().from(groupPreferences).where(eq(groupPreferences.groupId, groupId)),
    db.select().from(shiftAvailability).where(eq(shiftAvailability.groupId, groupId)),
    db.select().from(groupAnnouncements).where(eq(groupAnnouncements.groupId, groupId)),
    db.select().from(auditLogs).where(eq(auditLogs.groupId, groupId)),
    db.select().from(events).where(eq(events.groupId, groupId)),
    db.select().from(workRecords).where(eq(workRecords.groupId, groupId)),
    db.select().from(monthlyWorkClaims).where(eq(monthlyWorkClaims.groupId, groupId)),
  ]);

  const emails = [...new Set(members.map((member) => member.userEmail))];
  const planIds = plans.map((plan) => plan.id);
  await pruneInvalidShiftRequestsForPlans(db, planIds);
  const announcementIds = announcements.map((announcement) => announcement.id);

  const [profiles, slots, periods, assignments, requests, submissions, reads, replies] = await Promise.all([
    emails.length ? db.select().from(accountProfiles).where(inArray(accountProfiles.userEmail, emails)) : [],
    planIds.length ? db.select().from(shiftSlots).where(inArray(shiftSlots.planId, planIds)) : [],
    planIds.length ? db.select().from(shiftRequestPeriods).where(inArray(shiftRequestPeriods.planId, planIds)) : [],
    [],
    [],
    [],
    announcementIds.length ? db.select().from(announcementReads).where(inArray(announcementReads.announcementId, announcementIds)) : [],
    announcementIds.length ? db.select().from(announcementReplies).where(inArray(announcementReplies.announcementId, announcementIds)) : [],
  ]);

  const slotIds = slots.map((slot) => slot.id);
  const periodIds = periods.map((period) => period.id);
  const [assignmentRows, requestRows, submissionRows] = await Promise.all([
    Promise.all(chunk(slotIds).map((ids) => db.select().from(shiftAssignments).where(inArray(shiftAssignments.slotId, ids)))).then((rows) => rows.flat()),
    Promise.all(chunk(periodIds).map((ids) => db.select().from(shiftRequests).where(inArray(shiftRequests.periodId, ids)))).then((rows) => rows.flat()),
    Promise.all(chunk(periodIds).map((ids) => db.select().from(shiftRequestSubmissions).where(inArray(shiftRequestSubmissions.periodId, ids)))).then((rows) => rows.flat()),
  ]);
  const recordIds = records.map((record) => record.id);
  const breaks = (await Promise.all(chunk(recordIds).map((ids) => db.select().from(workBreaks).where(inArray(workBreaks.workRecordId, ids))))).flat();

  return Response.json({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: identity.email,
    group,
    members,
    profiles,
    joinRequests,
    preferences,
    availability,
    plans,
    periods,
    slots,
    assignments: assignmentRows,
    requests: requestRows,
    submissions: submissionRows,
    announcements,
    announcementReads: reads,
    announcementReplies: replies,
    auditLogs: logs,
    events: groupEvents,
    workRecords: records,
    workBreaks: breaks,
    monthlyWorkClaims: monthlyClaims,
  }, { headers: { "Cache-Control": "no-store" } });
}
