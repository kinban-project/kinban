import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  like,
  lt,
  lte,
  or,
} from "drizzle-orm";
import { getDb } from "../../db";
import { getDemoNow, getDemoTimeContext } from "../demo-clock";
import {
  accountProfiles,
  assistantAnnouncementDrafts,
  assistantMessageExecutions,
  assistantMessages,
  auditLogs,
  announcementReads,
  announcementReplies,
  events,
  groupInvitations,
  groupAnnouncements,
  groupAssistants,
  groupJoinRequests,
  groupMembers,
  groupPreferences,
  groups,
  knowledgeFolders,
  knowledgePages,
  memoFolders,
  memos,
  shiftAssignments,
  shiftSwapCandidates,
  shiftSwapRequests,
  shiftAvailability,
  shiftPlans,
  shiftRequestPeriods,
  shiftRequestSubmissions,
  shiftRequests,
  shiftSlots,
} from "../../db/schema";
import { requireApiIdentity } from "../api/api-auth";
import { canViewAdminNote, toPublicMember } from "../api/groups/member-dto";
import { shiftRequestDeadlinePassed } from "../shift-request-deadline";
import { isPreferenceStatus, preferenceStatuses } from "../preference-status";
import { recordAudit } from "../audit-log";
import { shiftDateTime, shiftTimeToMinutes } from "../shift-time";
import { buildLaborWarnings } from "../shift-labor-warnings";
import {
  getMcpWorkRecords,
  mcpClock,
  mcpCreateWorkRecord,
  mcpDailyReview,
  mcpReopenWorkRecord,
  mcpSaveWorkRecord,
  mcpReviewMonthly,
  mcpSubmitMonthly,
} from "./work-tools";
import {
  activeGroupEmails,
  createSystemMessagesAndPush,
  sendBusinessPush,
} from "../notification-events";

export const dynamic = "force-dynamic";

type Args = Record<string, unknown>;
type RpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: string; arguments?: Args };
};
const mutating =
  "This operation changes saved data. Re-run with confirm:true after confirming the target and scope.";
const editorRoles = new Set(["owner", "editor"]);
const preferenceValues = new Set(preferenceStatuses);
const assistantTools = new Set([
  "get_demo_time",
  "get_profile",
  "list_groups",
  "get_group_members",
  "list_shift_plans",
  "get_shift_plan",
  "list_knowledge_pages",
  "search_knowledge_pages",
  "get_knowledge_page",
  "check_shift_assignments",
  "get_shift_request_overview",
  "get_work_records",
  "list_announcements",
  "group_dashboard",
  "get_assistant_message_queue_summary",
  "claim_next_assistant_message",
  "list_assistant_messages",
  "reply_assistant_message",
  "release_assistant_message",
  "defer_assistant_message",
  "complete_assistant_message",
  "create_shift_swap_announcement_draft",
  "list_shift_swap_requests",
  "respond_shift_swap_candidate",
  "confirm_shift_swap",
  "create_shift_plan",
  "delete_draft_shift_plan",
  "update_slot_counts",
  "set_shift_assignments",
  "submit_work_record",
  "review_monthly_work",
  "create_announcement",
  "delete_announcement",
  "send_member_message",
]);
// Personal keys are intentionally member-scoped even when the key owner is
// also a group manager. Keep this allowlist server-side; prompt text and
// user-supplied IDs must never grant manager capabilities.
const personalTools = new Set([
  "get_demo_time",
  "list_groups",
  "get_profile",
  "set_profile_nickname",
  "get_group_preferences",
  "save_group_preferences",
  "list_shift_plans",
  "get_shift_plan",
  "list_knowledge_pages",
  "search_knowledge_pages",
  "get_knowledge_page",
  "get_shift_requests",
  "save_shift_requests",
  "get_work_records",
  "clock_work",
  "submit_work_record",
  "create_work_record",
  "reopen_work_record",
  "save_work_record",
  "submit_monthly_work",
  "list_announcements",
  "mark_announcement_read",
  "reply_announcement",
  "send_manager_message",
  "list_my_tasks",
  "create_task",
  "update_task",
  "delete_task",
  "list_personal_assistant_messages",
  "list_my_memos",
  "get_my_memo",
  "create_my_memo",
  "update_my_memo",
  "delete_my_memo",
]);
const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size));
  return chunks;
};

function hasScope(
  identity: Awaited<ReturnType<typeof requireApiIdentity>>,
  scope: string,
) {
  return (
    !(identity instanceof Response) &&
    (identity.tokenType !== "assistant" || identity.scopes.includes(scope))
  );
}

function assistantGroupError(
  identity: Awaited<ReturnType<typeof requireApiIdentity>>,
  groupId: string,
) {
  if (identity instanceof Response) return null;
  if (identity.tokenType !== "assistant" && identity.tokenType !== "personal")
    return null;
  if (!groupId)
    return "groupId is required. Use the exact groupId returned by list_groups.";
  if (identity.tokenType === "personal" && !identity.groupId)
    return "This personal AI key is not bound to a group. Issue a new key from group settings.";
  if (identity.groupId !== groupId)
    return `${identity.tokenType === "personal" ? "Personal" : "Assistant"} key is restricted to groupId "${identity.groupId}"; received "${groupId}".`;
  return null;
}

async function assistantActiveError(
  db: ReturnType<typeof getDb>,
  identity: Awaited<ReturnType<typeof requireApiIdentity>>,
) {
  if (
    identity instanceof Response ||
    identity.tokenType !== "assistant" ||
    !identity.groupId
  )
    return null;
  const [assistant] = await db
    .select({ status: groupAssistants.status })
    .from(groupAssistants)
    .where(eq(groupAssistants.groupId, identity.groupId))
    .limit(1);
  return assistant?.status === "active"
    ? null
    : "KINBAN assistant is inactive.";
}

type AssistantPermission =
  | "canCreateShifts"
  | "canPublishShifts"
  | "canReviewDailyWork"
  | "canReviewMonthlyWork"
  | "canCreateAnnouncements";
const assistantManagementTools = new Set([
  "create_shift_plan",
  "delete_draft_shift_plan",
  "update_slot_counts",
  "set_shift_assignments",
  "confirm_shift_swap",
  "submit_work_record",
  "review_monthly_work",
  "create_announcement",
  "delete_announcement",
  "send_member_message",
]);
const assistantExecutionLeaseMs = 60 * 1000;
const assistantClaimLeaseMs = 10 * 60 * 1000;
function assistantExecutionTarget(name: string, args: Args) {
  if (name === "create_shift_plan")
    return `${text(args.name)}|${text(args.startDate)}|${text(args.endDate)}`;
  if (name === "review_monthly_work")
    return `${text(args.userEmail)}|${text(args.month)}|${text(args.action)}`;
  if (name === "submit_work_record")
    return `${text(args.recordId)}|${text(args.status)}`;
  if (name === "create_announcement")
    return `${text(args.title)}|${text(args.body)}`;
  if (name === "delete_announcement") return text(args.announcementId);
  if (name === "send_member_message")
    return `${text(args.recipientEmail)}|${text(args.body)}`;
  if (name === "confirm_shift_swap")
    return `${text(args.requestId)}|${text(args.replacementEmail)}`;
  return text(args.planId);
}
async function renewAssistantClaim(
  db: ReturnType<typeof getDb>,
  groupId: string,
  messageId: string,
  activeClaimId: string,
) {
  const claimExpiresAt = new Date(
    Date.now() + assistantClaimLeaseMs,
  ).toISOString();
  const [message] = await db
    .update(assistantMessages)
    .set({ claimExpiresAt })
    .where(
      and(
        eq(assistantMessages.id, messageId),
        eq(assistantMessages.groupId, groupId),
        inArray(assistantMessages.senderType, ["member", "manager"]),
        eq(assistantMessages.status, "processing"),
        eq(assistantMessages.claimId, activeClaimId),
      ),
    )
    .returning();
  return message;
}
async function assistantPermissionError(
  db: ReturnType<typeof getDb>,
  identity: Awaited<ReturnType<typeof requireApiIdentity>>,
  groupId: string,
  permission: AssistantPermission,
  sourceMessageId: unknown,
  claimId: unknown,
) {
  if (identity instanceof Response || identity.tokenType !== "assistant")
    return null;
  const restricted = assistantGroupError(identity, groupId);
  if (restricted) return restricted;
  const messageId = text(sourceMessageId);
  const [assistant] = await db
    .select()
    .from(groupAssistants)
    .where(eq(groupAssistants.groupId, groupId))
    .limit(1);
  if (assistant?.status !== "active") return "KINBAN assistant is inactive.";
  if (!assistant[permission])
    return "This group has disabled the AI assistant permission for this operation.";

  // A group-bound assistant key is issued only by an active manager. When the
  // manager talks to the assistant directly, the key owner is the authority;
  // member-originated queue messages still need the claim checks below.
  if (!messageId) {
    const issuer = await membership(db, groupId, identity.email);
    if (!issuer || issuer.status !== "active" || !editorRoles.has(issuer.role))
      return "Direct assistant operations require the assistant key owner to be an active manager.";
    return null;
  }
  const activeClaimId = text(claimId);
  if (!activeClaimId)
    return "claimId from the current message claim is required for this assistant operation.";
  const source = await renewAssistantClaim(
    db,
    groupId,
    messageId,
    activeClaimId,
  );
  if (!source)
    return "sourceMessageId must identify a currently claimed human manager message in this group.";
  const sender = await membership(db, groupId, source.memberEmail);
  if (!sender || sender.status !== "active" || !editorRoles.has(sender.role))
    return "The claimed message sender is not an active manager.";
  return null;
}

const tools = [
  {
    name: "get_demo_time",
    description:
      "Get the group's authoritative business date and time. In demo mode, use this before interpreting relative dates such as today, tomorrow, next week, deadlines, or month-end. The returned currentAt, today, month, and timezone are the date context for subsequent operations.",
    inputSchema: {
      type: "object",
      required: ["groupId"],
      properties: { groupId: { type: "string" } },
    },
  },
  {
    name: "list_my_tasks",
    description: "List the authenticated user's personal tasks.",
    inputSchema: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" } },
    },
  },
  {
    name: "create_task",
    description: "Create a personal task. Requires confirm:true.",
    inputSchema: {
      type: "object",
      required: ["title", "date", "confirm"],
      properties: {
        title: { type: "string" },
        date: { type: "string" },
        startTime: { type: "string" },
        endTime: { type: "string" },
        category: { type: "string", enum: ["仕事", "生活", "予定"] },
        notes: { type: "string" },
        confirm: { type: "boolean" },
      },
    },
  },
  {
    name: "update_task",
    description: "Update a personal task. Requires confirm:true.",
    inputSchema: {
      type: "object",
      required: ["id", "confirm"],
      properties: {
        id: { type: "string" },
        confirm: { type: "boolean" },
        title: { type: "string" },
        date: { type: "string" },
        startTime: { type: "string" },
        endTime: { type: "string" },
        category: { type: "string" },
        notes: { type: "string" },
        completed: { type: "boolean" },
      },
    },
  },
  {
    name: "delete_task",
    description: "Delete a personal task. Requires confirm:true.",
    inputSchema: {
      type: "object",
      required: ["id", "confirm"],
      properties: { id: { type: "string" }, confirm: { type: "boolean" } },
    },
  },
  {
    name: "list_personal_assistant_messages",
    description: "List the authenticated member's own KINBAN assistant conversation in one group. Other members and manager queues are never returned.",
    inputSchema: {
      type: "object",
      required: ["groupId"],
      properties: { groupId: { type: "string" }, limit: { type: "number", minimum: 1, maximum: 100 } },
    },
  },
  {
    name: "list_my_memos",
    description: "List the authenticated member's own work memos and available folders in one group.",
    inputSchema: {
      type: "object",
      required: ["groupId"],
      properties: { groupId: { type: "string" }, folderId: { type: "string" }, query: { type: "string" } },
    },
  },
  {
    name: "get_my_memo",
    description: "Get one of the authenticated member's own work memos.",
    inputSchema: { type: "object", required: ["groupId", "memoId"], properties: { groupId: { type: "string" }, memoId: { type: "string" } } },
  },
  {
    name: "create_my_memo",
    description: "Create a work memo for the authenticated member. Requires confirm:true.",
    inputSchema: { type: "object", required: ["groupId", "confirm"], properties: { groupId: { type: "string" }, folderId: { type: "string" }, targetDate: { type: "string" }, title: { type: "string" }, body: { type: "string" }, confirm: { type: "boolean" } } },
  },
  {
    name: "update_my_memo",
    description: "Update the authenticated member's own work memo. Requires confirm:true.",
    inputSchema: { type: "object", required: ["groupId", "memoId", "confirm"], properties: { groupId: { type: "string" }, memoId: { type: "string" }, folderId: { type: "string" }, targetDate: { type: "string" }, title: { type: "string" }, body: { type: "string" }, confirm: { type: "boolean" } } },
  },
  {
    name: "delete_my_memo",
    description: "Delete the authenticated member's own work memo. Requires confirm:true.",
    inputSchema: { type: "object", required: ["groupId", "memoId", "confirm"], properties: { groupId: { type: "string" }, memoId: { type: "string" }, confirm: { type: "boolean" } } },
  },
  {
    name: "list_groups",
    description: "List groups where the authenticated user is a member.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_profile",
    description: "Get the authenticated account nickname.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "set_profile_nickname",
    description:
      "Change the authenticated account nickname. Requires confirm:true.",
    inputSchema: {
      type: "object",
      required: ["nickname", "confirm"],
      properties: {
        nickname: { type: "string" },
        confirm: { type: "boolean" },
      },
    },
  },
  {
    name: "get_group_members",
    description: "List members and group-local nicknames.",
    inputSchema: {
      type: "object",
      required: ["groupId"],
      properties: { groupId: { type: "string" } },
    },
  },
  {
    name: "update_group_member",
    description:
      "Change a group-local nickname, visibility, or role. Requires confirm:true.",
    inputSchema: {
      type: "object",
      required: ["groupId", "userEmail", "confirm"],
      properties: {
        groupId: { type: "string" },
        userEmail: { type: "string" },
        displayName: { type: "string" },
        showInPersonal: { type: "boolean" },
        role: { type: "string", enum: ["owner", "editor", "member"] },
        confirm: { type: "boolean" },
      },
    },
  },
  {
    name: "list_join_requests",
    description: "List pending and past join requests. Owner only.",
    inputSchema: {
      type: "object",
      required: ["groupId"],
      properties: { groupId: { type: "string" } },
    },
  },
  {
    name: "decide_join_request",
    description:
      "Approve or reject a join request. Requires owner role and confirm:true.",
    inputSchema: {
      type: "object",
      required: ["groupId", "requestId", "action", "confirm"],
      properties: {
        groupId: { type: "string" },
        requestId: { type: "string" },
        action: { type: "string", enum: ["approve", "reject"] },
        confirm: { type: "boolean" },
      },
    },
  },
  {
    name: "get_group_preferences",
    description:
      "Get the authenticated member's basic work preferences and weekly availability.",
    inputSchema: {
      type: "object",
      required: ["groupId"],
      properties: { groupId: { type: "string" } },
    },
  },
  {
    name: "save_group_preferences",
    description:
      "Save basic work preferences and weekly availability. Status must be want, possible, off, or unavailable. Requires confirm:true.",
    inputSchema: {
      type: "object",
      required: ["groupId", "confirm"],
      properties: {
        groupId: { type: "string" },
        confirm: { type: "boolean" },
        minDays: { type: "number" },
        maxDays: { type: "number" },
        minHours: { type: "number" },
        maxHours: { type: "number" },
        weekendPolicy: { type: "string" },
        freeComment: { type: "string" },
        availability: {
          type: "array",
          items: {
            type: "object",
            required: ["dayOfWeek", "status"],
            properties: {
              dayOfWeek: { type: "integer", minimum: 0, maximum: 6 },
              status: {
                type: "string",
                enum: ["want", "possible", "off", "unavailable"],
              },
              startTime: { type: "string" },
              endTime: { type: "string" },
              note: { type: "string" },
            },
          },
        },
      },
    },
  },
  {
    name: "list_shift_plans",
    description: "List work-slot plans for a group.",
    inputSchema: {
      type: "object",
      required: ["groupId"],
      properties: { groupId: { type: "string" } },
    },
  },
  {
    name: "get_shift_plan",
    description: "Get a plan, its slots, and assignments.",
    inputSchema: {
      type: "object",
      required: ["planId"],
      properties: { planId: { type: "string" } },
    },
  },
  {
    name: "list_knowledge_pages",
    description:
      "List published business guide pages in the authenticated member's group. Draft and private pages are never returned.",
    inputSchema: {
      type: "object",
      required: ["groupId"],
      properties: {
        groupId: { type: "string" },
        folderId: { type: "string" },
      },
    },
  },
  {
    name: "search_knowledge_pages",
    description:
      "Search published business guide pages by title or Markdown body within the authenticated member's group.",
    inputSchema: {
      type: "object",
      required: ["groupId", "query"],
      properties: {
        groupId: { type: "string" },
        query: { type: "string" },
        folderId: { type: "string" },
      },
    },
  },
  {
    name: "get_knowledge_page",
    description:
      "Get one published business guide page, including its Markdown body, image description, and update time.",
    inputSchema: {
      type: "object",
      required: ["groupId", "pageId"],
      properties: {
        groupId: { type: "string" },
        pageId: { type: "string" },
      },
    },
  },
  {
    name: "check_shift_assignments",
    description:
      "Validate a shift plan without saving. Reports shortages, excess staffing, duplicate overlapping assignments, inactive members, preference conflicts, and member day/hour range warnings.",
    inputSchema: {
      type: "object",
      required: ["planId"],
      properties: { planId: { type: "string" } },
    },
  },
  {
    name: "get_audit_logs",
    description:
      "List audited group operations for an editor or owner. Supports action, userEmail, search, date range, and limit.",
    inputSchema: {
      type: "object",
      required: ["groupId"],
      properties: {
        groupId: { type: "string" },
        action: { type: "string" },
        userEmail: { type: "string" },
        search: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_work_records",
    description:
      "List work records and breaks for the authenticated member, or all members for an active manager. For an assistant key, groupId must exactly match the groupId returned by list_groups and the key needs work:read scope. Supports from, to, status, and userEmail filters.",
    inputSchema: {
      type: "object",
      required: ["groupId"],
      properties: {
        groupId: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
        status: { type: "string" },
        userEmail: { type: "string" },
      },
    },
  },
  {
    name: "clock_work",
    description:
      "Record start, end, break-start, or break-end for the authenticated member. The operation is audited.",
    inputSchema: {
      type: "object",
      required: ["groupId", "action"],
      properties: {
        groupId: { type: "string" },
        action: {
          type: "string",
          enum: ["start", "end", "break-start", "break-end"],
        },
        recordId: { type: "string" },
      },
    },
  },
  {
    name: "submit_work_record",
    description:
      "Submit one daily work record, or approve/reject it when called by a manager. Direct calls with an assistant key issued to an active manager may omit sourceMessageId and claimId; member-message processing must provide the current claim.",
    inputSchema: {
      type: "object",
      required: ["groupId", "recordId", "status", "confirm"],
      properties: {
        groupId: { type: "string" },
        recordId: { type: "string" },
        status: { type: "string", enum: ["submitted", "approved", "rejected"] },
        managerNote: { type: "string" },
        sourceMessageId: { type: "string" },
        claimId: { type: "string" },
        confirm: { type: "boolean" },
      },
    },
  },
  {
    name: "create_work_record",
    description: "Create the authenticated member's daily work declaration. With slotId it uses an assigned published shift as the initial value; without slotId it creates a manual declaration. Requires confirm:true.",
    inputSchema: {
      type: "object",
      required: ["groupId", "scheduledDate", "confirm"],
      properties: {
        groupId: { type: "string" },
        slotId: { type: "string" },
        scheduledDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        claimedStartAt: { type: "string" },
        claimedEndAt: { type: "string" },
        claimedBreakMinutes: { type: "number", minimum: 0, maximum: 1440 },
        employeeNote: { type: "string", maxLength: 500 },
        confirm: { type: "boolean" },
      },
    },
  },
  {
    name: "reopen_work_record",
    description:
      "Return the authenticated member's submitted or approved daily work record to an editable, unsubmitted state. The member can then correct it and submit it again. Monthly-approved records remain locked until an administrator reopens the month.",
    inputSchema: {
      type: "object",
      required: ["groupId", "recordId", "confirm"],
      properties: {
        groupId: { type: "string" },
        recordId: { type: "string" },
        confirm: { type: "boolean" },
      },
    },
  },
  {
    name: "save_work_record",
    description:
      "Save the authenticated member's own daily work declaration after it is editable. Updates claimed start/end times, break minutes, and employee note. Use reopen_work_record first when the record is submitted or approved, then submit_work_record with status submitted.",
    inputSchema: {
      type: "object",
      required: ["groupId", "recordId", "confirm"],
      properties: {
        groupId: { type: "string" },
        recordId: { type: "string" },
        confirm: { type: "boolean" },
        claimedStartAt: { type: "string", description: "ISO time, e.g. 2026-07-20T09:40+09:00. Omit to keep the current value; empty string clears it." },
        claimedEndAt: { type: "string", description: "ISO time, e.g. 2026-07-20T17:00+09:00. Omit to keep the current value; empty string clears it." },
        claimedBreakMinutes: { type: "number", minimum: 0, maximum: 1440 },
        employeeNote: { type: "string", maxLength: 500 },
      },
    },
  },
  {
    name: "submit_monthly_work",
    description:
      "Submit the authenticated member's monthly work claim after checking incomplete records.",
    inputSchema: {
      type: "object",
      required: ["groupId", "month"],
      properties: {
        groupId: { type: "string" },
        month: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
      },
    },
  },
  {
    name: "review_monthly_work",
    description:
      "Approve, reject, or reopen a member's monthly work claim. Direct calls with an assistant key issued to an active manager may omit sourceMessageId and claimId; member-message processing must provide the current claim.",
    inputSchema: {
      type: "object",
      required: ["groupId", "month", "userEmail", "action"],
      properties: {
        groupId: { type: "string" },
        month: { type: "string" },
        userEmail: { type: "string" },
        action: { type: "string", enum: ["approve", "reject", "reopen"] },
        managerNote: { type: "string" },
        sourceMessageId: { type: "string" },
        claimId: { type: "string" },
      },
    },
  },
  {
    name: "create_shift_plan",
    description:
      "Create a work-slot plan and request period. Direct manager-key calls may omit sourceMessageId and claimId; member-message processing must provide the current manager claim and the group's shift-creation permission.",
    inputSchema: {
      type: "object",
      required: ["groupId", "name", "startDate", "endDate"],
      properties: {
        groupId: { type: "string" },
        name: { type: "string" },
        startDate: { type: "string" },
        endDate: { type: "string" },
        openingTime: { type: "string" },
        closingTime: { type: "string" },
        slotMinutes: { type: "number", enum: [30, 60, 120] },
        notes: { type: "string" },
        reason: { type: "string" },
        slotRules: { type: "array" },
        requestPeriod: {
          type: "object",
          description:
            "Optional shift-request window. If supplied, all three fields are required.",
          required: ["opensOn", "closesOn"],
          properties: {
            name: { type: "string" },
            opensOn: { type: "string", description: "YYYY-MM-DD" },
            closesOn: { type: "string", description: "YYYY-MM-DD" },
          },
        },
        confirm: { type: "boolean" },
        sourceMessageId: { type: "string" },
        claimId: { type: "string" },
      },
    },
  },
  {
    name: "delete_draft_shift_plan",
    description:
      "Delete a draft plan and its slots. Published plans cannot be deleted. Direct manager-key calls may omit sourceMessageId and claimId; member-message processing must provide the current claim.",
    inputSchema: {
      type: "object",
      required: ["planId"],
      properties: {
        planId: { type: "string" },
        confirm: { type: "boolean" },
        sourceMessageId: { type: "string" },
        claimId: { type: "string" },
      },
    },
  },
  {
    name: "update_slot_counts",
    description:
      "Adjust required counts or close/reopen dates in a draft plan. Direct manager-key calls may omit sourceMessageId and claimId; member-message processing must provide the current claim.",
    inputSchema: {
      type: "object",
      required: ["planId", "confirm", "expectedVersion"],
      properties: {
        planId: { type: "string" },
        confirm: { type: "boolean" },
        expectedVersion: { type: "number" },
        slots: { type: "array" },
        closedDates: { type: "array" },
        sourceMessageId: { type: "string" },
        claimId: { type: "string" },
      },
    },
  },
  {
    name: "get_shift_requests",
    description:
      "Get the authenticated user's shift requests for a request period.",
    inputSchema: {
      type: "object",
      required: ["groupId"],
      properties: { groupId: { type: "string" }, periodId: { type: "string" } },
    },
  },
  {
    name: "get_shift_request_overview",
    description:
      "Get all active members' shift requests and period-specific comments for AI shift assignment. This is the manager-AI tool for group-wide request reading; get_shift_requests is only for the authenticated member. groupId must be copied from list_groups.",
    inputSchema: {
      type: "object",
      required: ["groupId", "periodId"],
      properties: { groupId: { type: "string" }, periodId: { type: "string" } },
    },
  },
  {
    name: "save_shift_requests",
    description:
      "Replace the authenticated user's shift requests and period-specific comment. Status must be want, possible, off, or unavailable. Invalid entries are rejected. Requires confirm:true.",
    inputSchema: {
      type: "object",
      required: ["groupId", "periodId", "requests", "confirm"],
      properties: {
        groupId: { type: "string" },
        periodId: { type: "string" },
        requests: {
          type: "array",
          items: {
            type: "object",
            required: ["date", "startTime", "endTime", "preference"],
            properties: {
              date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
              startTime: { type: "string" },
              endTime: { type: "string" },
              preference: {
                type: "string",
                enum: ["want", "possible", "off", "unavailable"],
              },
              note: { type: "string" },
            },
          },
        },
        requestComment: { type: "string", maxLength: 500 },
        confirm: { type: "boolean" },
      },
    },
  },
  {
    name: "set_shift_assignments",
    description:
      "Replace assignments and optionally publish a plan. Direct manager-key calls may omit sourceMessageId and claimId; member-message processing must provide the current claim and matching shift permission.",
    inputSchema: {
      type: "object",
      required: ["planId", "assignments", "expectedVersion"],
      properties: {
        planId: { type: "string" },
        assignments: { type: "object" },
        status: { type: "string", enum: ["draft", "published"] },
        expectedVersion: { type: "number" },
        reason: { type: "string" },
        confirm: { type: "boolean" },
        sourceMessageId: { type: "string" },
        claimId: { type: "string" },
      },
    },
  },
  {
    name: "list_announcements",
    description: "List group announcements, read states, and replies. Assistant keys can only read their issued group and need announcement:read scope.",
    inputSchema: {
      type: "object",
      required: ["groupId"],
      properties: { groupId: { type: "string" } },
    },
  },
  {
    name: "get_assistant_message_queue_summary",
    description:
      "Get aggregate counts for pending KINBAN assistant member messages without returning message bodies or member identities.",
    inputSchema: {
      type: "object",
      required: ["groupId"],
      properties: { groupId: { type: "string" } },
    },
  },
  {
    name: "claim_next_assistant_message",
    description:
      "Claim one pending assistant message for 10 minutes. Use the returned message.id and claimId together for replies, state changes, and permitted manager operations. If the claim has expired but another worker has not reclaimed the message, the same claimId can continue and will be renewed; a different claimId always wins.",
    inputSchema: {
      type: "object",
      required: ["groupId"],
      properties: { groupId: { type: "string" } },
    },
  },
  {
    name: "list_assistant_messages",
    description:
      "List KINBAN assistant conversations. Managers can list all members or filter by memberEmail and status; members can only list their own conversation.",
    inputSchema: {
      type: "object",
      required: ["groupId"],
      properties: {
        groupId: { type: "string" },
        memberEmail: { type: "string" },
        status: {
          type: "string",
          enum: [
            "pending",
            "processing",
            "processed",
            "failed",
            "needs_review",
          ],
        },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "reply_assistant_message",
    description:
      "Reply as KINBAN assistant to one currently claimed message and mark it processed. Pass the claimId returned when the message was claimed.",
    inputSchema: {
      type: "object",
      required: ["groupId", "messageId", "claimId", "body"],
      properties: {
        groupId: { type: "string" },
        messageId: { type: "string" },
        claimId: { type: "string" },
        body: { type: "string" },
      },
    },
  },
  {
    name: "release_assistant_message",
    description:
      "Return a currently claimed member message to the pending queue without replying. Use when it should be retried later.",
    inputSchema: {
      type: "object",
      required: ["groupId", "messageId", "claimId"],
      properties: {
        groupId: { type: "string" },
        messageId: { type: "string" },
        claimId: { type: "string" },
      },
    },
  },
  {
    name: "defer_assistant_message",
    description:
      "Mark a currently claimed member message as needs_review without replying. Use when a manager decision is needed.",
    inputSchema: {
      type: "object",
      required: ["groupId", "messageId", "claimId", "reason"],
      properties: {
        groupId: { type: "string" },
        messageId: { type: "string" },
        claimId: { type: "string" },
        reason: { type: "string", maxLength: 500 },
      },
    },
  },
  {
    name: "complete_assistant_message",
    description:
      "Mark a currently claimed member message as processed without sending a reply. Use only when no member response is needed.",
    inputSchema: {
      type: "object",
      required: ["groupId", "messageId", "claimId", "reason"],
      properties: {
        groupId: { type: "string" },
        messageId: { type: "string" },
        claimId: { type: "string" },
        reason: { type: "string", maxLength: 500 },
      },
    },
  },
  {
    name: "create_shift_swap_announcement_draft",
    description:
      "For a currently claimed member request, create a manager-reviewable shift-swap announcement draft from exactly one of that member's published assignments. This never distributes an announcement. Supply slotId when the member has multiple eligible published assignments.",
    inputSchema: {
      type: "object",
      required: ["groupId", "messageId", "claimId"],
      properties: {
        groupId: { type: "string" },
        messageId: { type: "string" },
        claimId: { type: "string" },
        slotId: { type: "string" },
      },
    },
  },
  {
    name: "list_shift_swap_requests",
    description:
      "List shift replacement requests, candidate responses, and current safety status for a group. Manager-only operational read.",
    inputSchema: {
      type: "object",
      required: ["groupId"],
      properties: {
        groupId: { type: "string" },
        status: { type: "string", enum: ["needs_review", "open", "candidate_review", "confirmed", "failed", "cancelled"] },
        requestId: { type: "string" },
      },
    },
  },
  {
    name: "respond_shift_swap_candidate",
    description:
      "Record the currently claimed member's availability for an open shift replacement request. This never changes assignments or publishes an announcement.",
    inputSchema: {
      type: "object",
      required: ["groupId", "requestId", "messageId", "claimId", "status"],
      properties: {
        groupId: { type: "string" },
        requestId: { type: "string" },
        messageId: { type: "string" },
        claimId: { type: "string" },
        status: { type: "string", enum: ["available", "unavailable"] },
        note: { type: "string", maxLength: 500 },
      },
    },
  },
  {
    name: "confirm_shift_swap",
    description:
      "Confirm one replacement candidate for a published shift after direct manager instruction. Rechecks the latest plan version, active membership, overlap, preference conflicts, and slot coverage before changing the assignment.",
    inputSchema: {
      type: "object",
      required: ["groupId", "requestId", "replacementEmail", "expectedVersion", "confirm"],
      properties: {
        groupId: { type: "string" },
        requestId: { type: "string" },
        replacementEmail: { type: "string" },
        expectedVersion: { type: "number" },
        managerNote: { type: "string", maxLength: 500 },
        confirm: { type: "boolean" },
        sourceMessageId: { type: "string" },
        claimId: { type: "string" },
      },
    },
  },
  {
    name: "mark_announcement_read",
    description: "Mark a group announcement as read.",
    inputSchema: {
      type: "object",
      required: ["announcementId"],
      properties: { announcementId: { type: "string" } },
    },
  },
  {
    name: "create_announcement",
    description:
      "Create a group announcement. Direct manager-key calls may omit sourceMessageId and claimId; member-message processing must provide the current manager claim and announcement permission.",
    inputSchema: {
      type: "object",
      required: ["groupId", "title", "body"],
      properties: {
        groupId: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        confirm: { type: "boolean" },
        sourceMessageId: { type: "string" },
        claimId: { type: "string" },
      },
    },
  },
  {
    name: "delete_announcement",
    description:
      "Delete one group announcement and its replies/read states. This is irreversible and requires confirm:true plus manager permission. Direct manager-key calls may omit sourceMessageId and claimId.",
    inputSchema: {
      type: "object",
      required: ["groupId", "announcementId"],
      properties: {
        groupId: { type: "string" },
        announcementId: { type: "string" },
        confirm: { type: "boolean" },
        sourceMessageId: { type: "string" },
        claimId: { type: "string" },
      },
    },
  },
  {
    name: "send_member_message",
    description:
      "Send a new private message to one active member of the same group. The recipient receives it in the KINBAN assistant conversation and, when configured, as a Web Push notification. Requires confirm:true; direct manager-key calls may omit sourceMessageId and claimId, while member-message processing must provide the claimed manager instruction and announcement permission.",
    inputSchema: {
      type: "object",
      required: ["groupId", "recipientEmail", "body"],
      properties: {
        groupId: { type: "string" },
        recipientEmail: { type: "string" },
        body: { type: "string" },
        confirm: { type: "boolean" },
        sourceMessageId: { type: "string" },
        claimId: { type: "string" },
      },
    },
  },
  {
    name: "send_manager_message",
    description:
      "Send a private message from the authenticated member to the active managers of a group. The message is queued for the KINBAN assistant and manager review.",
    inputSchema: {
      type: "object",
      required: ["groupId", "body"],
      properties: {
        groupId: { type: "string" },
        body: { type: "string" },
        confirm: { type: "boolean" },
      },
    },
  },
  {
    name: "reply_announcement",
    description: "Reply to a group announcement.",
    inputSchema: {
      type: "object",
      required: ["announcementId", "body"],
      properties: {
        announcementId: { type: "string" },
        body: { type: "string" },
      },
    },
  },
  {
    name: "group_dashboard",
    description: "Get group member, plan, assignment, and announcement counts.",
    inputSchema: {
      type: "object",
      required: ["groupId"],
      properties: { groupId: { type: "string" } },
    },
  },
];

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}
function textEncodingIssue(value: unknown, label: string) {
  if (typeof value !== "string" || !value) return null;
  const questionMarks = (value.match(/\?/g) ?? []).length;
  const replacementCharacter = value.includes("\uFFFD");
  const repeatedQuestionMarks = /\?{2,}/.test(value);
  if (replacementCharacter || (questionMarks >= 3 && repeatedQuestionMarks))
    return `Text encoding check failed for ${label}. Send the MCP request as UTF-8 and retry.`;
  return null;
}
function firstTextEncodingIssue(
  fields: Array<[label: string, value: unknown]>,
) {
  for (const [label, value] of fields) {
    const issue = textEncodingIssue(value, label);
    if (issue) return issue;
  }
  return null;
}
function rpc(id: RpcRequest["id"], value: unknown) {
  return Response.json({
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    },
  });
}
function rpcError(id: RpcRequest["id"], message: string) {
  return Response.json({
    jsonrpc: "2.0",
    id,
    result: { isError: true, content: [{ type: "text", text: message }] },
  });
}
async function membership(
  db: ReturnType<typeof getDb>,
  groupId: string,
  email: string,
) {
  const [row] = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userEmail, email),
        eq(groupMembers.status, "active"),
      ),
    )
    .limit(1);
  return row;
}
async function planFor(
  db: ReturnType<typeof getDb>,
  planId: string,
  email: string,
) {
  const [plan] = await db
    .select()
    .from(shiftPlans)
    .where(eq(shiftPlans.id, planId))
    .limit(1);
  if (!plan) return { error: "Shift plan not found" as const };
  const member = await membership(db, plan.groupId, email);
  if (!member) return { error: "Group membership required" as const };
  return { plan, member };
}

export async function POST(request: Request) {
  const identity = await requireApiIdentity(request);
  if (identity instanceof Response) return identity;
  const payload = (await request.json().catch(() => ({}))) as RpcRequest;
  if (payload.method === "initialize")
    return Response.json({
      jsonrpc: "2.0",
      id: payload.id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "my-day", version: "1.1.0" },
      },
    });
  if (payload.method === "notifications/initialized")
    return new Response(null, { status: 202 });
  if (payload.method === "tools/list")
    return Response.json({
      jsonrpc: "2.0",
      id: payload.id,
      result: {
        tools:
          identity.tokenType === "personal"
            ? tools.filter((tool) => personalTools.has(tool.name))
            : identity.tokenType === "assistant"
              ? tools.filter((tool) => assistantTools.has(tool.name))
              : tools,
      },
    });
  if (payload.method !== "tools/call" || !payload.params?.name)
    return Response.json(
      {
        jsonrpc: "2.0",
        id: payload.id,
        error: { code: -32601, message: "Unsupported MCP method" },
      },
      { status: 400 },
    );
  const name = payload.params.name;
  const args = payload.params.arguments ?? {};
  const db = getDb();
  let activeExecution: { id: string; groupId: string; leaseId: string } | null =
    null;
  async function completeManagedExecution(value: unknown) {
    if (activeExecution) {
      await db
        .update(assistantMessageExecutions)
        .set({
          status: "succeeded",
          errorCode: "",
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(assistantMessageExecutions.id, activeExecution.id),
            eq(assistantMessageExecutions.status, "processing"),
            eq(assistantMessageExecutions.leaseId, activeExecution.leaseId),
          ),
        );
      activeExecution = null;
    }
    return rpc(payload.id, value);
  }
  if (identity.tokenType === "assistant" && !assistantTools.has(name))
    return rpcError(
      payload.id,
      "This operation is not available to an assistant token.",
    );
  if (identity.tokenType === "personal" && !personalTools.has(name))
    return rpcError(
      payload.id,
      "This operation is not available to a personal member key. Use the group operation AI key for manager actions.",
    );
  const assistantStatusError = await assistantActiveError(db, identity);
  if (assistantStatusError) return rpcError(payload.id, assistantStatusError);
  try {
    if (name === "get_demo_time") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      return rpc(payload.id, await getDemoTimeContext(groupId));
    }
    if (
      identity.tokenType === "assistant" &&
      assistantManagementTools.has(name)
    ) {
      let groupId = text(args.groupId);
      let permission: AssistantPermission = "canCreateShifts";
      if (
        [
          "delete_draft_shift_plan",
          "update_slot_counts",
          "set_shift_assignments",
        ].includes(name)
      ) {
        const [plan] = await db
          .select()
          .from(shiftPlans)
          .where(eq(shiftPlans.id, text(args.planId)))
          .limit(1);
        if (!plan) return rpcError(payload.id, "Shift plan not found");
        groupId = plan.groupId;
        permission =
          name === "set_shift_assignments" &&
          (plan.status === "published" || args.status === "published")
            ? "canPublishShifts"
            : "canCreateShifts";
      } else if (name === "submit_work_record") {
        if (!["approved", "rejected"].includes(text(args.status)))
          return rpcError(
            payload.id,
            "Assistant work-record actions are limited to approval or rejection.",
          );
        permission = "canReviewDailyWork";
      } else if (name === "review_monthly_work")
        permission = "canReviewMonthlyWork";
      else if (name === "create_announcement")
        permission = "canCreateAnnouncements";
      else if (name === "delete_announcement")
        permission = "canCreateAnnouncements";
      else if (name === "send_member_message")
        permission = "canCreateAnnouncements";
      else if (name === "confirm_shift_swap")
        permission = "canPublishShifts";
      const permissionError = await assistantPermissionError(
        db,
        identity,
        groupId,
        permission,
        args.sourceMessageId,
        args.claimId,
      );
      if (permissionError) return rpcError(payload.id, permissionError);
      const sourceMessageId = text(args.sourceMessageId);
      // Keep direct manager operations idempotent without adding a migration:
      // the token itself is the stable instruction namespace when no queued
      // member message is being processed.
      const target = assistantExecutionTarget(name, args);
      const directInvocationId =
        typeof payload.id === "string" || typeof payload.id === "number"
          ? String(payload.id)
          : target;
      const messageId =
        sourceMessageId ||
        `direct:${identity.tokenId}:${groupId}:${directInvocationId}`;
      const executionId = crypto.randomUUID();
      const executionLeaseId = crypto.randomUUID();
      const executionNow = new Date().toISOString();
      await db
        .insert(assistantMessageExecutions)
        .values({
          id: executionId,
          groupId,
          messageId,
          operation: name,
          target,
          status: "processing",
          errorCode: "",
          attemptCount: 1,
          leaseId: executionLeaseId,
          updatedAt: executionNow,
        })
        .onConflictDoNothing();
      const [execution] = await db
        .select()
        .from(assistantMessageExecutions)
        .where(
          and(
            eq(assistantMessageExecutions.messageId, messageId),
            eq(assistantMessageExecutions.operation, name),
            eq(assistantMessageExecutions.target, target),
          ),
        )
        .limit(1);
      if (!execution)
        return rpcError(
          payload.id,
          "Could not reserve this manager instruction. Retry the operation.",
        );
      if (execution.id !== executionId) {
        if (execution?.status === "succeeded")
          return rpc(payload.id, {
            ok: true,
            duplicate: true,
            message:
              "This manager instruction has already been executed for the same operation and target.",
          });
        const retryLeaseId = crypto.randomUUID();
        const retryNow = new Date().toISOString();
        const expiredBefore = new Date(
          Date.now() - assistantExecutionLeaseMs,
        ).toISOString();
        const canRecoverProcessing =
          execution.status === "processing" &&
          execution.updatedAt <= expiredBefore;
        if (execution.status === "processing" && !canRecoverProcessing)
          return rpcError(
            payload.id,
            "This manager instruction is already being processed. Retry after it completes.",
          );
        const [retried] = await db
          .update(assistantMessageExecutions)
          .set({
            status: "processing",
            errorCode: canRecoverProcessing
              ? "recovered_expired_processing"
              : "",
            attemptCount: execution.attemptCount + 1,
            leaseId: retryLeaseId,
            updatedAt: retryNow,
          })
          .where(
            and(
              eq(assistantMessageExecutions.id, execution.id),
              eq(
                assistantMessageExecutions.status,
                canRecoverProcessing ? "processing" : "failed",
              ),
              eq(assistantMessageExecutions.updatedAt, execution.updatedAt),
            ),
          )
          .returning();
        if (!retried)
          return rpcError(
            payload.id,
            "This manager instruction is already being processed. Retry after it completes.",
          );
        activeExecution = { id: retried.id, groupId, leaseId: retryLeaseId };
      } else {
        activeExecution = {
          id: executionId,
          groupId,
          leaseId: executionLeaseId,
        };
      }
      await recordAudit({
        groupId,
        userEmail: identity.email,
        action: "assistant.execute",
        entityType: "assistantMessage",
        entityId: messageId,
        summary: `MCPで管理者指示を実行: ${name}`,
        details: {
          source: "mcp",
          sourceMessageId: sourceMessageId || null,
          executionMode: sourceMessageId ? "claimed_manager_message" : "direct_manager_key",
          operation: name,
          target,
        },
      });
      (args as { confirm?: boolean }).confirm = true;
    }
    if (name === "set_shift_assignments") {
      const [targetPlan] = await db
        .select()
        .from(shiftPlans)
        .where(eq(shiftPlans.id, text(args.planId)))
        .limit(1);
      if (targetPlan?.status === "published") {
        if (args.status === "draft")
          return rpcError(
            payload.id,
            "Published shift plans cannot be returned to draft",
          );
        (args as { status?: string }).status = "published";
      }
    }
    if (
      identity.tokenType === "assistant" &&
      [
        "reply_assistant_message",
        "release_assistant_message",
        "defer_assistant_message",
        "complete_assistant_message",
        "create_shift_swap_announcement_draft",
        "respond_shift_swap_candidate",
      ].includes(name)
    ) {
      const [claimed] = await db
        .select({ id: assistantMessages.id })
        .from(assistantMessages)
        .where(
          and(
            eq(assistantMessages.id, text(args.messageId)),
            eq(assistantMessages.groupId, text(args.groupId)),
            inArray(assistantMessages.senderType, ["member", "manager"]),
            eq(assistantMessages.status, "processing"),
            eq(assistantMessages.claimId, text(args.claimId)),
          ),
        )
        .limit(1);
      if (!claimed)
        return rpcError(
          payload.id,
          "A current claimId is required for this message operation.",
        );
    }
    if (name === "get_work_records") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (identity.tokenType === "personal" && args.userEmail !== undefined)
        return rpcError(payload.id, "A personal member key can only read its owner's work records.");
      if (
        identity.tokenType === "assistant" &&
        !hasScope(identity, "work:read")
      )
        return rpcError(
          payload.id,
          "Assistant token scope does not allow work-record reads.",
        );
      const result = await getMcpWorkRecords(db, groupId, identity.email, args);
      return "error" in result
        ? rpcError(payload.id, result.error)
        : completeManagedExecution(result);
    }
    if (name === "clock_work") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      const result = await mcpClock(
        db,
        groupId,
        identity.email,
        text(args.action),
        text(args.recordId) || undefined,
      );
      return "error" in result
        ? rpcError(payload.id, result.error)
        : completeManagedExecution(result);
    }
    if (name === "submit_work_record") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      const status = text(args.status);
      if (identity.tokenType === "personal" && status !== "submitted")
        return rpcError(
          payload.id,
          "A personal member key can only submit its owner's work record; approval and rejection require the operation AI key.",
        );
      if (identity.tokenType === "personal" && args.confirm !== true)
        return rpcError(payload.id, mutating);
      const encodingIssue = textEncodingIssue(
        args.managerNote,
        "work-record manager note",
      );
      if (encodingIssue) return rpcError(payload.id, encodingIssue);
      const result = await mcpDailyReview(
        db,
        groupId,
        identity.email,
        text(args.recordId),
        status,
        text(args.managerNote),
      );
      return "error" in result
        ? rpcError(payload.id, result.error)
        : completeManagedExecution(result);
    }
    if (name === "create_work_record") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (identity.tokenType !== "personal") return rpcError(payload.id, "This member declaration tool requires a personal AI key.");
      const encodingIssue = textEncodingIssue(args.employeeNote, "employee note");
      if (encodingIssue) return rpcError(payload.id, encodingIssue);
      const result = await mcpCreateWorkRecord(db, groupId, identity.email, args);
      return "error" in result ? rpcError(payload.id, result.error) : completeManagedExecution(result);
    }
    if (name === "reopen_work_record") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (identity.tokenType !== "personal")
        return rpcError(payload.id, "This member correction tool requires a personal AI key.");
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const result = await mcpReopenWorkRecord(
        db,
        groupId,
        identity.email,
        text(args.recordId),
      );
      return "error" in result
        ? rpcError(payload.id, result.error)
        : completeManagedExecution(result);
    }
    if (name === "save_work_record") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (identity.tokenType !== "personal")
        return rpcError(payload.id, "This member declaration tool requires a personal AI key.");
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const encodingIssue = textEncodingIssue(args.employeeNote, "employee note");
      if (encodingIssue) return rpcError(payload.id, encodingIssue);
      const result = await mcpSaveWorkRecord(
        db,
        groupId,
        identity.email,
        text(args.recordId),
        args,
      );
      return "error" in result
        ? rpcError(payload.id, result.error)
        : completeManagedExecution(result);
    }
    if (name === "submit_monthly_work") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      const result = await mcpSubmitMonthly(
        db,
        groupId,
        identity.email,
        text(args.month),
      );
      return "error" in result
        ? rpcError(payload.id, result.error)
        : rpc(payload.id, result);
    }
    if (name === "review_monthly_work") {
      const groupId = text(args.groupId);
      const encodingIssue = textEncodingIssue(
        args.managerNote,
        "monthly-work manager note",
      );
      if (encodingIssue) return rpcError(payload.id, encodingIssue);
      const result = await mcpReviewMonthly(
        db,
        groupId,
        identity.email,
        text(args.month),
        text(args.userEmail),
        text(args.action),
        text(args.managerNote),
      );
      return "error" in result
        ? rpcError(payload.id, result.error)
        : completeManagedExecution(result);
    }
    if (name === "list_personal_assistant_messages") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      const self = await membership(db, groupId, identity.email);
      if (!self) return rpcError(payload.id, "Group membership required");
      const limit = Math.max(1, Math.min(100, Number(args.limit) || 50));
      const rows = await db.select().from(assistantMessages).where(and(eq(assistantMessages.groupId, groupId), eq(assistantMessages.memberEmail, identity.email))).orderBy(desc(assistantMessages.createdAt)).limit(limit);
      return rpc(payload.id, rows.map((row) => ({ id: row.id, senderType: row.senderType, senderEmail: row.senderEmail, body: row.body, status: row.status, createdAt: row.createdAt, eventType: row.eventType })));
    }
    if (["list_my_memos", "get_my_memo", "create_my_memo", "update_my_memo", "delete_my_memo"].includes(name)) {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      const self = await membership(db, groupId, identity.email);
      if (!self) return rpcError(payload.id, "Group membership required");
      if (name === "list_my_memos") {
        const conditions = [eq(memos.groupId, groupId), eq(memos.authorEmail, identity.email), isNull(memos.deletedAt)];
        if (args.folderId) conditions.push(eq(memos.folderId, text(args.folderId)));
        if (args.query) conditions.push(or(like(memos.title, `%${text(args.query)}%`), like(memos.body, `%${text(args.query)}%`))!);
        const folders = await db.select().from(memoFolders).where(eq(memoFolders.groupId, groupId)).orderBy(memoFolders.createdAt);
        const notes = await db.select().from(memos).where(and(...conditions)).orderBy(desc(memos.targetDate), desc(memos.updatedAt));
        return rpc(payload.id, { folders, notes });
      }
      const memoId = text(args.memoId);
      if (name === "get_my_memo") {
        const [note] = await db.select().from(memos).where(and(eq(memos.id, memoId), eq(memos.groupId, groupId), eq(memos.authorEmail, identity.email), isNull(memos.deletedAt))).limit(1);
        return note ? rpc(payload.id, note) : rpcError(payload.id, "Memo not found");
      }
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      if (name === "create_my_memo") {
        let folderId = text(args.folderId);
        if (!folderId) {
          const [folder] = await db.select().from(memoFolders).where(eq(memoFolders.groupId, groupId)).orderBy(memoFolders.createdAt).limit(1);
          if (folder) folderId = folder.id;
        }
        if (!folderId) return rpcError(payload.id, "folderId is required; call list_my_memos first.");
        const [folder] = await db.select().from(memoFolders).where(and(eq(memoFolders.id, folderId), eq(memoFolders.groupId, groupId))).limit(1);
        if (!folder) return rpcError(payload.id, "folderId must belong to the requested group.");
        const title = text(args.title);
        if (!title) return rpcError(payload.id, "title is required");
        const note = { id: crypto.randomUUID(), groupId, folderId, authorEmail: identity.email, targetDate: text(args.targetDate), title: title.slice(0, 120), body: text(args.body).slice(0, 10000), visibility: "managers" as const, deletedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        await db.insert(memos).values(note);
        await recordAudit({ groupId, userEmail: identity.email, action: "memo.create", entityType: "memo", entityId: note.id, summary: "業務メモを作成しました", details: { source: "mcp" } });
        return completeManagedExecution(note);
      }
      const [note] = await db.select().from(memos).where(and(eq(memos.id, memoId), eq(memos.groupId, groupId), eq(memos.authorEmail, identity.email), isNull(memos.deletedAt))).limit(1);
      if (!note) return rpcError(payload.id, "Memo not found");
      if (name === "delete_my_memo") {
        await db.update(memos).set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(memos.id, note.id));
        await recordAudit({ groupId, userEmail: identity.email, action: "memo.delete", entityType: "memo", entityId: note.id, summary: "業務メモを削除しました", details: { source: "mcp" } });
        return completeManagedExecution({ ok: true, memoId: note.id });
      }
      let nextFolderId = note.folderId;
      if (args.folderId !== undefined) {
        const [folder] = await db.select().from(memoFolders).where(and(eq(memoFolders.id, text(args.folderId)), eq(memoFolders.groupId, groupId))).limit(1);
        if (!folder) return rpcError(payload.id, "folderId must belong to the requested group.");
        nextFolderId = folder.id;
      }
      const next = { folderId: nextFolderId, targetDate: args.targetDate === undefined ? note.targetDate : text(args.targetDate), title: args.title === undefined ? note.title : text(args.title).slice(0, 120), body: args.body === undefined ? note.body : text(args.body).slice(0, 10000), updatedAt: new Date().toISOString() };
      await db.update(memos).set(next).where(eq(memos.id, note.id));
      await recordAudit({ groupId, userEmail: identity.email, action: "memo.update", entityType: "memo", entityId: note.id, summary: "業務メモを更新しました", details: { source: "mcp" } });
      return completeManagedExecution({ ...note, ...next });
    }
    /* Group invitations and join requests remain screen-managed. Personal keys
       are bound to an existing group, so they cannot safely discover or join
       another group. */
    if (name === "list_my_group_invitations") {
      return rpcError(payload.id, "Group invitations and join requests are managed from the KINBAN screen.");
    }
    if (name === "accept_group_invitation" || name === "request_group_join") {
      return rpcError(payload.id, "Group invitations and join requests are managed from the KINBAN screen.");
    }
    if (name === "list_my_group_invitations") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      const rows = await db.select().from(groupInvitations).where(and(eq(groupInvitations.groupId, groupId), eq(groupInvitations.inviteeEmail, identity.email), eq(groupInvitations.status, "pending")));
      return rpc(payload.id, rows);
    }
    if (name === "accept_group_invitation") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      const conditions = [eq(groupInvitations.groupId, groupId), eq(groupInvitations.inviteeEmail, identity.email), eq(groupInvitations.status, "pending")];
      if (args.invitationId) conditions.push(eq(groupInvitations.id, text(args.invitationId)));
      const [invitation] = await db.select().from(groupInvitations).where(and(...conditions)).limit(1);
      if (!invitation || invitation.expiresAt <= new Date().toISOString()) return rpcError(payload.id, "No valid group invitation was found.");
      const [existing] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userEmail, identity.email))).limit(1);
      if (existing) await db.update(groupMembers).set({ status: "active" }).where(eq(groupMembers.id, existing.id));
      else await db.insert(groupMembers).values({ id: crypto.randomUUID(), groupId, userEmail: identity.email, role: "member", showInPersonal: true });
      await db.update(groupInvitations).set({ status: "accepted", acceptedAt: new Date().toISOString() }).where(eq(groupInvitations.id, invitation.id));
      await recordAudit({ groupId, userEmail: identity.email, action: "group.invitation.accept", entityType: "groupInvitation", entityId: invitation.id, summary: "グループ招待を承認しました", details: { source: "mcp" } });
      return completeManagedExecution({ ok: true, invitationId: invitation.id, groupId });
    }
    if (name === "request_group_join") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const groupId = text(args.groupId);
      const group = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
      if (!group[0]) return rpcError(payload.id, "Group not found");
      if (group[0].participationMode !== "request_to_join") return rpcError(payload.id, "This group does not accept join requests.");
      const [member] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userEmail, identity.email))).limit(1);
      if (member) return rpc(payload.id, { membership: member });
      const [existing] = await db.select().from(groupJoinRequests).where(and(eq(groupJoinRequests.groupId, groupId), eq(groupJoinRequests.userEmail, identity.email), eq(groupJoinRequests.status, "pending"))).limit(1);
      if (existing) return rpc(payload.id, { request: existing });
      const requestRow = { id: crypto.randomUUID(), groupId, userEmail: identity.email, status: "pending" as const };
      await db.insert(groupJoinRequests).values(requestRow);
      await recordAudit({ groupId, userEmail: identity.email, action: "group.join", entityType: "joinRequest", entityId: requestRow.id, summary: "グループ参加を申請しました", details: { source: "mcp" } });
      return completeManagedExecution({ request: requestRow });
    }
    if (name === "list_my_tasks") {
      const rows = await db
        .select()
        .from(events)
        .where(eq(events.ownerEmail, identity.email));
      return rpc(
        payload.id,
        rows.filter(
          (row) =>
            (!args.from || row.date >= String(args.from)) &&
            (!args.to || row.date <= String(args.to)),
        ),
      );
    }
    if (name === "create_task") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const title = text(args.title);
      const date = text(args.date);
      const category = text(args.category, "予定");
      if (!title || !date)
        return rpcError(payload.id, "title and date are required");
      if (!["仕事", "生活", "予定"].includes(category))
        return rpcError(payload.id, "category must be 仕事, 生活, or 予定");
      const row = {
        id: crypto.randomUUID(),
        ownerEmail: identity.email,
        title,
        date,
        startTime: text(args.startTime),
        endTime: text(args.endTime),
        category,
        notes: text(args.notes),
        completed: false,
      };
      await db.insert(events).values(row);
      await recordAudit({ groupId: null, userEmail: identity.email, action: "event.create", entityType: "event", entityId: row.id, summary: "個人予定を作成しました", details: { source: "mcp" } });
      return rpc(payload.id, row);
    }
    if (name === "update_task" || name === "delete_task") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const id = text(args.id);
      const [row] = await db
        .select()
        .from(events)
        .where(and(eq(events.id, id), eq(events.ownerEmail, identity.email)))
        .limit(1);
      if (!row) return rpcError(payload.id, "Task not found");
      if (name === "delete_task") {
        await db.delete(events).where(eq(events.id, id));
        await recordAudit({ groupId: row.groupId ?? null, userEmail: identity.email, action: "event.delete", entityType: "event", entityId: row.id, summary: "個人予定を削除しました", details: { source: "mcp" } });
        return rpc(payload.id, { ok: true, id });
      }
      const next = {
        title: args.title === undefined ? row.title : text(args.title),
        date: args.date === undefined ? row.date : text(args.date),
        startTime:
          args.startTime === undefined ? row.startTime : text(args.startTime),
        endTime: args.endTime === undefined ? row.endTime : text(args.endTime),
        category:
          args.category === undefined ? row.category : text(args.category),
        notes: args.notes === undefined ? row.notes : text(args.notes),
        completed:
          args.completed === undefined
            ? row.completed
            : Boolean(args.completed),
      };
      await db.update(events).set(next).where(eq(events.id, id));
      await recordAudit({ groupId: row.groupId ?? null, userEmail: identity.email, action: "event.update", entityType: "event", entityId: row.id, summary: "個人予定を更新しました", details: { source: "mcp" } });
      return rpc(payload.id, { ...row, ...next });
    }
    if (name === "list_groups") {
      if (identity.tokenType === "personal" && !identity.groupId)
        return rpcError(payload.id, "This personal AI key is not bound to a group. Issue a new key from group settings.");
      const ms = await db
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.userEmail, identity.email),
            eq(groupMembers.status, "active"),
          ),
        );
      const visible =
        (identity.tokenType === "assistant" || identity.tokenType === "personal") && identity.groupId
          ? ms.filter((m) => m.groupId === identity.groupId)
          : ms;
      const gs = visible.length
        ? await db
            .select()
            .from(groups)
            .where(
              inArray(
                groups.id,
                visible.map((m) => m.groupId),
              ),
            )
        : [];
      return rpc(
        payload.id,
        gs.map((g) => ({
          ...g,
          role: visible.find((m) => m.groupId === g.id)?.role,
          tokenType: identity.tokenType,
        })),
      );
    }
    if (name === "get_profile") {
      const [profile] = await db
        .select()
        .from(accountProfiles)
        .where(eq(accountProfiles.userEmail, identity.email))
        .limit(1);
      return rpc(payload.id, {
        email: identity.email,
        nickname: profile?.nickname ?? "",
      });
    }
    if (name === "set_profile_nickname") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const nickname = text(args.nickname);
      if (nickname.length > 40)
        return rpcError(payload.id, "nickname must be 40 characters or fewer");
      const [profile] = await db
        .select()
        .from(accountProfiles)
        .where(eq(accountProfiles.userEmail, identity.email))
        .limit(1);
      if (profile)
        await db
          .update(accountProfiles)
          .set({ nickname })
          .where(eq(accountProfiles.userEmail, identity.email));
      else
        await db
          .insert(accountProfiles)
          .values({ userEmail: identity.email, nickname });
      const memberships = await db
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.userEmail, identity.email),
            eq(groupMembers.status, "active"),
          ),
        );
      for (const member of memberships)
        await recordAudit({
          groupId: member.groupId,
          userEmail: identity.email,
          action: "account.profile",
          entityType: "accountProfile",
          entityId: identity.email,
          summary: "アカウントニックネームを変更",
          details: { source: "mcp" },
        });
      return rpc(payload.id, { ok: true, nickname });
    }
    if (name === "get_group_members") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (
        identity.tokenType === "assistant" &&
        !hasScope(identity, "assistant:read")
      )
        return rpcError(
          payload.id,
          "Assistant token scope does not allow member reads.",
        );
      const self = await membership(db, groupId, identity.email);
      if (!self) return rpcError(payload.id, "Group membership required");
      const ms = await db
        .select()
        .from(groupMembers)
        .where(eq(groupMembers.groupId, groupId));
      const profiles = ms.length
        ? await db
            .select()
            .from(accountProfiles)
            .where(
              inArray(
                accountProfiles.userEmail,
                ms.map((m) => m.userEmail),
              ),
            )
        : [];
      return rpc(
        payload.id,
        ms.map((m) => ({
          ...toPublicMember(
            m,
            identity.tokenType !== "assistant" && canViewAdminNote(self.role),
          ),
          accountNickname:
            profiles.find((p) => p.userEmail === m.userEmail)?.nickname ?? "",
        })),
      );
    }
    if (name === "update_group_member") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const groupId = text(args.groupId);
      const self = await membership(db, groupId, identity.email);
      const targetEmail = text(args.userEmail);
      const target = await membership(db, groupId, targetEmail);
      if (!self || !target)
        return rpcError(payload.id, "Group member not found");
      if (self.role !== "owner" && targetEmail !== identity.email)
        return rpcError(payload.id, "Owner permission required");
      if (args.displayName !== undefined && targetEmail !== identity.email)
        return rpcError(
          payload.id,
          "Group nickname can only be changed by the member",
        );
      if (args.role !== undefined && self.role !== "owner")
        return rpcError(payload.id, "Only the owner can change permissions");
      if (args.role === "owner" && targetEmail !== identity.email)
        return rpcError(
          payload.id,
          "Owner transfer requires a dedicated operation",
        );
      if (
        args.role !== undefined &&
        args.role !== "editor" &&
        args.role !== "member"
      )
        return rpcError(payload.id, "Invalid group role");
      await db
        .update(groupMembers)
        .set({
          ...(args.displayName !== undefined
            ? { displayName: text(args.displayName).slice(0, 40) }
            : {}),
          ...(typeof args.showInPersonal === "boolean"
            ? { showInPersonal: args.showInPersonal }
            : {}),
          ...(typeof args.role === "string"
            ? { role: args.role as "owner" | "editor" | "member" }
            : {}),
        })
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userEmail, targetEmail),
          ),
        );
      await recordAudit({
        groupId,
        userEmail: identity.email,
        action: "group.member",
        entityType: "groupMember",
        entityId: targetEmail,
        summary: `MCPでメンバー情報を変更: ${targetEmail}`,
        details: {
          source: "mcp",
          role: args.role,
          displayName: args.displayName !== undefined,
          showInPersonal: args.showInPersonal,
        },
      });
      return rpc(payload.id, { ok: true });
    }
    if (name === "list_join_requests") {
      const groupId = text(args.groupId);
      const group = await db
        .select()
        .from(groups)
        .where(eq(groups.id, groupId))
        .limit(1);
      if (!group[0] || group[0].ownerEmail !== identity.email)
        return rpcError(payload.id, "Owner permission required");
      return rpc(
        payload.id,
        await db
          .select()
          .from(groupJoinRequests)
          .where(eq(groupJoinRequests.groupId, groupId)),
      );
    }
    if (name === "decide_join_request") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const groupId = text(args.groupId);
      const group = await db
        .select()
        .from(groups)
        .where(eq(groups.id, groupId))
        .limit(1);
      if (!group[0] || group[0].ownerEmail !== identity.email)
        return rpcError(payload.id, "Owner permission required");
      const requestId = text(args.requestId);
      const [joinRequest] = await db
        .select()
        .from(groupJoinRequests)
        .where(
          and(
            eq(groupJoinRequests.id, requestId),
            eq(groupJoinRequests.groupId, groupId),
          ),
        )
        .limit(1);
      if (!joinRequest) return rpcError(payload.id, "Join request not found");
      const status = args.action === "approve" ? "approved" : "rejected";
      const statements = [
        db
          .update(groupJoinRequests)
          .set({ status })
          .where(eq(groupJoinRequests.id, requestId)),
      ];
      if (status === "approved")
        statements.push(
          db.insert(groupMembers).values({
            id: crypto.randomUUID(),
            groupId,
            userEmail: joinRequest.userEmail,
            role: "member",
            showInPersonal: true,
          }),
        );
      await db.batch(statements);
      await recordAudit({
        groupId,
        userEmail: identity.email,
        action: "group.join_request",
        entityType: "groupJoinRequest",
        entityId: requestId,
        summary: `MCPで参加申請を${status === "approved" ? "承認" : "却下"}`,
        details: { source: "mcp", targetEmail: joinRequest.userEmail, status },
      });
      return rpc(payload.id, { ok: true, status });
    }
    if (name === "get_group_preferences") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (!(await membership(db, groupId, identity.email)))
        return rpcError(payload.id, "Group membership required");
      const [preferences] = await db
        .select()
        .from(groupPreferences)
        .where(
          and(
            eq(groupPreferences.groupId, groupId),
            eq(groupPreferences.userEmail, identity.email),
          ),
        )
        .limit(1);
      const availability = await db
        .select()
        .from(shiftAvailability)
        .where(
          and(
            eq(shiftAvailability.groupId, groupId),
            eq(shiftAvailability.userEmail, identity.email),
          ),
        );
      return rpc(payload.id, {
        preferences: preferences ?? null,
        availability,
      });
    }
    if (name === "save_group_preferences") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (!(await membership(db, groupId, identity.email)))
        return rpcError(payload.id, "Group membership required");
      const entries = Array.isArray(args.availability)
        ? (args.availability as Array<Record<string, unknown>>)
        : [];
      const invalidIndex = entries.findIndex(
        (e) =>
          !Number.isInteger(e.dayOfWeek) ||
          Number(e.dayOfWeek) < 0 ||
          Number(e.dayOfWeek) > 6 ||
          !isPreferenceStatus(e.status),
      );
      if (invalidIndex >= 0)
        return rpcError(
          payload.id,
          `availability[${invalidIndex}] has an invalid preference status or dayOfWeek`,
        );
      const values = {
        minDays: Number(args.minDays ?? 0),
        maxDays: Number(args.maxDays ?? 7),
        minHours: Number(args.minHours ?? 0),
        maxHours: Number(args.maxHours ?? 40),
        weekendPolicy: text(args.weekendPolicy, "any"),
        freeComment: text(args.freeComment).slice(0, 2000),
      };
      const [old] = await db
        .select()
        .from(groupPreferences)
        .where(
          and(
            eq(groupPreferences.groupId, groupId),
            eq(groupPreferences.userEmail, identity.email),
          ),
        )
        .limit(1);
      if (old)
        await db
          .update(groupPreferences)
          .set(values)
          .where(eq(groupPreferences.id, old.id));
      else
        await db.insert(groupPreferences).values({
          id: crypto.randomUUID(),
          groupId,
          userEmail: identity.email,
          ...values,
        });
      await db.batch([
        db
          .delete(shiftAvailability)
          .where(
            and(
              eq(shiftAvailability.groupId, groupId),
              eq(shiftAvailability.userEmail, identity.email),
            ),
          ),
        ...entries.map((e) =>
          db.insert(shiftAvailability).values({
            id: crypto.randomUUID(),
            groupId,
            userEmail: identity.email,
            dayOfWeek: Number(e.dayOfWeek),
            status: text(e.status),
            startTime: text(e.startTime),
            endTime: text(e.endTime),
            note: text(e.note),
          }),
        ),
      ]);
      await recordAudit({
        groupId,
        userEmail: identity.email,
        action: "group.preferences",
        entityType: "groupPreference",
        entityId: identity.email,
        summary: "MCPで基本勤務希望を保存",
        details: { source: "mcp", availabilityCount: entries.length },
      });
      return rpc(payload.id, { ok: true, availabilityCount: entries.length });
    }
    if (name === "list_knowledge_pages" || name === "search_knowledge_pages") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (!(await membership(db, groupId, identity.email)))
        return rpcError(payload.id, "Group membership required");
      const folderId = text(args.folderId);
      const query = text(args.query);
      if (name === "search_knowledge_pages" && !query)
        return rpcError(payload.id, "query is required");
      const filters = [
        eq(knowledgePages.groupId, groupId),
        eq(knowledgePages.status, "published"),
        ...(folderId ? [eq(knowledgePages.folderId, folderId)] : []),
        ...(query
          ? [
              or(
                like(knowledgePages.title, `%${query}%`),
                like(knowledgePages.body, `%${query}%`),
              ),
            ]
          : []),
      ];
      const [pages, folders] = await Promise.all([
        db
          .select()
          .from(knowledgePages)
          .where(and(...filters))
          .orderBy(desc(knowledgePages.updatedAt)),
        db
          .select({ id: knowledgeFolders.id, name: knowledgeFolders.name })
          .from(knowledgeFolders)
          .where(eq(knowledgeFolders.groupId, groupId)),
      ]);
      const folderNames = new Map(folders.map((folder) => [folder.id, folder.name]));
      return rpc(
        payload.id,
        pages.map((page) => ({
          id: page.id,
          groupId: page.groupId,
          folderId: page.folderId,
          folderName: folderNames.get(page.folderId) ?? "",
          title: page.title,
          status: page.status,
          imageUrl: page.imageUrl,
          imageAlt: page.imageAlt,
          updatedAt: page.updatedAt,
        })),
      );
    }
    if (name === "get_knowledge_page") {
      const groupId = text(args.groupId);
      const pageId = text(args.pageId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (!pageId) return rpcError(payload.id, "pageId is required");
      if (!(await membership(db, groupId, identity.email)))
        return rpcError(payload.id, "Group membership required");
      const [page] = await db
        .select()
        .from(knowledgePages)
        .where(
          and(
            eq(knowledgePages.id, pageId),
            eq(knowledgePages.groupId, groupId),
            eq(knowledgePages.status, "published"),
          ),
        )
        .limit(1);
      if (!page) return rpcError(payload.id, "Published business guide page not found");
      const [folder] = await db
        .select({ id: knowledgeFolders.id, name: knowledgeFolders.name })
        .from(knowledgeFolders)
        .where(eq(knowledgeFolders.id, page.folderId))
        .limit(1);
      return rpc(payload.id, {
        id: page.id,
        groupId: page.groupId,
        folderId: page.folderId,
        folderName: folder?.name ?? "",
        title: page.title,
        body: page.body,
        status: page.status,
        imageUrl: page.imageUrl,
        imageAlt: page.imageAlt,
        updatedAt: page.updatedAt,
      });
    }
    if (name === "list_shift_plans") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (
        identity.tokenType === "assistant" &&
        !hasScope(identity, "shift:read")
      )
        return rpcError(
          payload.id,
          "Assistant token scope does not allow shift reads.",
        );
      if (!(await membership(db, groupId, identity.email)))
        return rpcError(payload.id, "Group membership required");
      const [plans, requestPeriods] = await Promise.all([
        db
          .select()
          .from(shiftPlans)
          .where(eq(shiftPlans.groupId, groupId))
          .orderBy(desc(shiftPlans.startDate)),
        db
          .select()
          .from(shiftRequestPeriods)
          .where(eq(shiftRequestPeriods.groupId, groupId))
          .orderBy(desc(shiftRequestPeriods.opensOn)),
      ]);
      return rpc(
        payload.id,
        {
          demoTime: await getDemoTimeContext(groupId),
          plans: plans
            .filter(
              (plan) =>
                identity.tokenType !== "personal" || plan.status === "published",
            )
            .map((plan) => {
          const linkedPeriods = requestPeriods.filter(
            (period) => period.planId === plan.id,
          );
          return {
            ...plan,
            requestPeriodId: linkedPeriods[0]?.id ?? null,
            requestPeriods: linkedPeriods,
          };
            }),
        },
      );
    }
    if (name === "get_shift_plan") {
      const found = await planFor(db, text(args.planId), identity.email);
      if ("error" in found) return rpcError(payload.id, found.error);
      const restricted = assistantGroupError(identity, found.plan.groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (identity.tokenType === "personal" && found.plan.status !== "published")
        return rpcError(payload.id, "Personal member keys can only read published shifts.");
      if (
        identity.tokenType === "assistant" &&
        !hasScope(identity, "shift:read")
      )
        return rpcError(
          payload.id,
          "Assistant token scope does not allow shift reads.",
        );
      const slots = await db
        .select()
        .from(shiftSlots)
        .where(eq(shiftSlots.planId, found.plan.id));
      const assignmentChunks = await Promise.all(
        chunk(
          slots.map((slot) => slot.id),
          50,
        ).map((slotIds) =>
          db
            .select()
            .from(shiftAssignments)
            .where(inArray(shiftAssignments.slotId, slotIds)),
        ),
      );
      const allAssignments = assignmentChunks.flat();
      return rpc(payload.id, {
        demoTime: await getDemoTimeContext(found.plan.groupId),
        plan: found.plan,
        slots,
        assignments:
          identity.tokenType === "personal"
            ? allAssignments.filter(
                (assignment) => assignment.userEmail === identity.email,
              )
            : allAssignments,
      });
    }
    if (name === "check_shift_assignments") {
      const found = await planFor(db, text(args.planId), identity.email);
      if ("error" in found) return rpcError(payload.id, found.error);
      const restricted = assistantGroupError(identity, found.plan.groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (
        identity.tokenType === "assistant" &&
        !hasScope(identity, "shift:read")
      )
        return rpcError(
          payload.id,
          "Assistant token scope does not allow shift reads.",
        );
      const slots = await db
        .select()
        .from(shiftSlots)
        .where(eq(shiftSlots.planId, found.plan.id));
      const slotIds = slots.map((slot) => slot.id);
      const assignmentChunks = await Promise.all(
        chunk(slotIds, 50).map((ids) =>
          ids.length
            ? db
                .select()
                .from(shiftAssignments)
                .where(inArray(shiftAssignments.slotId, ids))
            : Promise.resolve([]),
        ),
      );
      const assignments = assignmentChunks.flat();
      const members = await db
        .select()
        .from(groupMembers)
        .where(eq(groupMembers.groupId, found.plan.groupId));
      const memberByEmail = new Map(
        members.map((member) => [member.userEmail, member]),
      );
      const memberEmails = members.map((member) => member.userEmail);
      const [period] = await db
        .select()
        .from(shiftRequestPeriods)
        .where(
          and(
            eq(shiftRequestPeriods.groupId, found.plan.groupId),
            eq(shiftRequestPeriods.planId, found.plan.id),
          ),
        )
        .orderBy(desc(shiftRequestPeriods.opensOn))
        .limit(1);
      const [requests, submissions, preferences, availability] =
        await Promise.all([
          period
            ? db
                .select()
                .from(shiftRequests)
                .where(eq(shiftRequests.periodId, period.id))
            : Promise.resolve([]),
          period
            ? db
                .select()
                .from(shiftRequestSubmissions)
                .where(eq(shiftRequestSubmissions.periodId, period.id))
            : Promise.resolve([]),
          memberEmails.length
            ? db
                .select()
                .from(groupPreferences)
                .where(
                  and(
                    eq(groupPreferences.groupId, found.plan.groupId),
                    inArray(groupPreferences.userEmail, memberEmails),
                  ),
                )
            : Promise.resolve([]),
          memberEmails.length
            ? db
                .select()
                .from(shiftAvailability)
                .where(
                  and(
                    eq(shiftAvailability.groupId, found.plan.groupId),
                    inArray(shiftAvailability.userEmail, memberEmails),
                  ),
                )
            : Promise.resolve([]),
        ]);
      const memberName = (email: string) =>
        memberByEmail.get(email)?.displayName?.trim() || email.split("@")[0];
      const assignedBySlot = new Map<string, string[]>();
      for (const assignment of assignments) {
        const current = assignedBySlot.get(assignment.slotId) ?? [];
        if (!current.includes(assignment.userEmail))
          current.push(assignment.userEmail);
        assignedBySlot.set(assignment.slotId, current);
      }
      const issues: Array<Record<string, unknown>> = [];
      for (const slot of slots) {
        const assigned = assignedBySlot.get(slot.id) ?? [];
        if (assigned.length < slot.requiredCount)
          issues.push({
            type: "shortage",
            severity: "error",
            slotId: slot.id,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            role: slot.role,
            required: slot.requiredCount,
            assigned: assigned.length,
            message: `${slot.date} ${slot.startTime}-${slot.endTime} ${slot.role || "共通"}: 必要${slot.requiredCount}名に対して${assigned.length}名`,
          });
        if (assigned.length > slot.requiredCount)
          issues.push({
            type: "excess",
            severity: "warning",
            slotId: slot.id,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            role: slot.role,
            required: slot.requiredCount,
            assigned: assigned.length,
            message: `${slot.date} ${slot.startTime}-${slot.endTime} ${slot.role || "共通"}: 必要数を${assigned.length - slot.requiredCount}名超過`,
          });
        for (const email of assigned) {
          const member = memberByEmail.get(email);
          if (!member || member.status !== "active")
            issues.push({
              type: "inactive_member",
              severity: "error",
              slotId: slot.id,
              memberEmail: email,
              memberName: memberName(email),
              message: `${memberName(email)}は有効なメンバーではありません`,
            });
        }
      }
      const startOf = (slot: typeof slots[number]) => {
        const base = Date.parse(`${slot.date}T00:00:00Z`) / 60000;
        return base + shiftTimeToMinutes(slot.startTime);
      };
      const endOf = (slot: typeof slots[number]) => {
        const base = Date.parse(`${slot.date}T00:00:00Z`) / 60000;
        return base + shiftTimeToMinutes(slot.endTime);
      };
      const assignedSlots = [...assignedBySlot.entries()].flatMap(
        ([slotId, emails]) => {
          const slot = slots.find((row) => row.id === slotId);
          return slot
            ? emails.map((userEmail) => ({ slot, userEmail }))
            : [];
        },
      );
      for (let index = 0; index < assignedSlots.length; index += 1) {
        for (let next = index + 1; next < assignedSlots.length; next += 1) {
          const left = assignedSlots[index];
          const right = assignedSlots[next];
          if (left.userEmail !== right.userEmail) continue;
          if (startOf(left.slot) >= endOf(right.slot) || startOf(right.slot) >= endOf(left.slot)) continue;
          issues.push({
            type: "overlap",
            severity: "error",
            slotIds: [left.slot.id, right.slot.id],
            memberEmail: left.userEmail,
            memberName: memberName(left.userEmail),
            message: `${memberName(left.userEmail)}に重複する時間帯があります: ${left.slot.date} ${left.slot.role || "共通"} / ${right.slot.role || "共通"}`,
          });
        }
      }
      const preferenceFor = (slot: typeof slots[number], email: string) => {
        const exact = requests.find(
          (request) =>
            request.userEmail === email &&
            request.date === slot.date &&
            request.startTime === slot.startTime &&
            request.endTime === slot.endTime,
        );
        if (exact) return exact.preference;
        const weekday = new Date(`${slot.date}T00:00:00Z`).getUTCDay();
        const rows = availability.filter(
          (entry) => entry.userEmail === email && entry.dayOfWeek === weekday,
        );
        if (!rows.length) return "possible";
        const start = shiftTimeToMinutes(slot.startTime);
        const end = shiftTimeToMinutes(slot.endTime);
        const match = rows.find(
          (entry) =>
            (!entry.startTime && !entry.endTime) ||
            (shiftTimeToMinutes(entry.startTime) <= start &&
              shiftTimeToMinutes(entry.endTime) >= end),
        );
        return match?.status ?? "unavailable";
      };
      for (const { slot, userEmail } of assignedSlots) {
        const preference = preferenceFor(slot, userEmail);
        if (preference === "off" || preference === "unavailable")
          issues.push({
            type: "preference_conflict",
            severity: "warning",
            slotId: slot.id,
            date: slot.date,
            memberEmail: userEmail,
            memberName: memberName(userEmail),
            preference,
            message: `${memberName(userEmail)}は${preference === "off" ? "休み希望" : "勤務不可"}です`,
          });
      }
      for (const member of members.filter((row) => row.status === "active")) {
        const memberSlots = assignedSlots
          .filter((row) => row.userEmail === member.userEmail)
          .map((row) => row.slot);
        const days = new Set(memberSlots.map((slot) => slot.date)).size;
        const totalMinutes = memberSlots.reduce(
          (sum, slot) => sum + Math.max(0, endOf(slot) - startOf(slot)),
          0,
        );
        const preference = preferences.find(
          (row) => row.userEmail === member.userEmail,
        );
        if (
          preference &&
          (days < preference.minDays ||
            days > preference.maxDays ||
            totalMinutes < preference.minHours * 60 ||
            totalMinutes > preference.maxHours * 60)
        )
          issues.push({
            type: "member_range",
            severity: "warning",
            memberEmail: member.userEmail,
            memberName: memberName(member.userEmail),
            days,
            totalMinutes,
            minDays: preference.minDays,
            maxDays: preference.maxDays,
            minHours: preference.minHours,
            maxHours: preference.maxHours,
            message: `${memberName(member.userEmail)}の勤務日数・時間が基本設定の範囲外です`,
          });
      }
      const [groupRules] = await db
        .select({ autoBreakSuggestion: groups.autoBreakSuggestion, laborPlannedBreakWarning: groups.laborPlannedBreakWarning, laborDailyHoursWarning: groups.laborDailyHoursWarning, laborWeeklyHoursWarning: groups.laborWeeklyHoursWarning, laborRestIntervalWarning: groups.laborRestIntervalWarning, laborConsecutiveDaysWarning: groups.laborConsecutiveDaysWarning, laborWeeklyRestWarning: groups.laborWeeklyRestWarning, laborDailyHoursLimitMinutes: groups.laborDailyHoursLimitMinutes, laborWeeklyHoursLimitMinutes: groups.laborWeeklyHoursLimitMinutes, laborRestIntervalMinutes: groups.laborRestIntervalMinutes, laborConsecutiveDaysLimit: groups.laborConsecutiveDaysLimit, laborWeeklyRestDaysRequired: groups.laborWeeklyRestDaysRequired, laborFourWeekRestDaysRequired: groups.laborFourWeekRestDaysRequired })
        .from(groups)
        .where(eq(groups.id, found.plan.groupId))
        .limit(1);
      const laborWarnings = buildLaborWarnings({
        slots,
        assignments,
        members,
        autoBreakSuggestion: groupRules?.autoBreakSuggestion !== false,
        rules: groupRules ? { plannedBreakWarning: groupRules.laborPlannedBreakWarning, dailyHoursWarning: groupRules.laborDailyHoursWarning, weeklyHoursWarning: groupRules.laborWeeklyHoursWarning, restIntervalWarning: groupRules.laborRestIntervalWarning, consecutiveDaysWarning: groupRules.laborConsecutiveDaysWarning, weeklyRestWarning: groupRules.laborWeeklyRestWarning, dailyHoursLimitMinutes: groupRules.laborDailyHoursLimitMinutes, weeklyHoursLimitMinutes: groupRules.laborWeeklyHoursLimitMinutes, restIntervalMinutes: groupRules.laborRestIntervalMinutes, consecutiveDaysLimit: groupRules.laborConsecutiveDaysLimit, weeklyRestDaysRequired: groupRules.laborWeeklyRestDaysRequired, fourWeekRestDaysRequired: groupRules.laborFourWeekRestDaysRequired } : undefined,
        planStartDate: found.plan.startDate,
        planEndDate: found.plan.endDate,
      });
      for (const warning of laborWarnings) {
        issues.push({
          type: warning.kind,
          severity: "warning",
          memberEmail: warning.memberEmail,
          memberName: warning.memberName,
          dates: warning.dates,
          slotIds: warning.slotIds,
          startTime: warning.startTime,
          endTime: warning.endTime,
          minutes: warning.minutes,
          message: warning.message,
        });
      }
      const errors = issues.filter((issue) => issue.severity === "error");
      const warnings = issues.filter((issue) => issue.severity === "warning");
      return rpc(payload.id, {
        demoTime: await getDemoTimeContext(found.plan.groupId),
        ok: errors.length === 0,
        canPublish: errors.length === 0,
        plan: {
          id: found.plan.id,
          name: found.plan.name,
          status: found.plan.status,
          version: found.plan.version,
        },
        requestPeriod: period ?? null,
        summary: {
          slotCount: slots.length,
          assignmentCount: assignedSlots.length,
          errorCount: errors.length,
          warningCount: warnings.length,
        },
        errors,
        warnings,
        memberSummaries: members
          .filter((member) => member.status === "active")
          .map((member) => {
            const memberSlots = assignedSlots
              .filter((row) => row.userEmail === member.userEmail)
              .map((row) => row.slot);
            return {
              userEmail: member.userEmail,
              displayName: memberName(member.userEmail),
              days: new Set(memberSlots.map((slot) => slot.date)).size,
              totalMinutes: memberSlots.reduce(
                (sum, slot) => sum + Math.max(0, endOf(slot) - startOf(slot)),
                0,
              ),
              requestSavedAt:
                submissions.find((row) => row.userEmail === member.userEmail)
                  ?.savedAt ?? null,
              requestComment:
                submissions.find((row) => row.userEmail === member.userEmail)
                  ?.requestComment ?? "",
            };
          }),
      });
    }
    if (name === "get_audit_logs") {
      const groupId = text(args.groupId);
      const self = await membership(db, groupId, identity.email);
      if (!self || !editorRoles.has(self.role))
        return rpcError(payload.id, "Editor membership required");
      const conditions = [eq(auditLogs.groupId, groupId)];
      const action = text(args.action);
      const userEmail = text(args.userEmail);
      const search = text(args.search);
      const from = text(args.from);
      const to = text(args.to);
      if (action) conditions.push(eq(auditLogs.action, action));
      if (userEmail) conditions.push(eq(auditLogs.userEmail, userEmail));
      if (search) conditions.push(like(auditLogs.summary, `%${search}%`));
      if (from) conditions.push(gte(auditLogs.createdAt, `${from}T00:00:00`));
      if (to) conditions.push(lte(auditLogs.createdAt, `${to}T23:59:59`));
      const limit = Math.min(300, Math.max(1, Number(args.limit ?? 100)));
      const logs = await db
        .select()
        .from(auditLogs)
        .where(and(...conditions))
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit);
      return rpc(payload.id, { logs, limit });
    }
    if (name === "create_shift_plan") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const groupId = text(args.groupId);
      const member = await membership(db, groupId, identity.email);
      if (!member || !editorRoles.has(member.role))
        return rpcError(payload.id, "Editor membership required");
      const startDate = text(args.startDate);
      const endDate = text(args.endDate);
      const openingTime = text(args.openingTime, "09:00");
      const closingTime = text(args.closingTime, "18:00");
      const slotMinutes = Number(args.slotMinutes ?? 60);
      const rules = (
        Array.isArray(args.slotRules)
          ? args.slotRules
          : [{ role: "", requiredCount: 1 }]
      ) as Array<Record<string, unknown>>;
      const encodingIssue = firstTextEncodingIssue([
        ["plan name", args.name],
        ["plan notes", args.notes],
        ...rules.map((rule) => ["slot role", rule.role] as [string, unknown]),
        [
          "request period name",
          (args.requestPeriod as Record<string, unknown> | undefined)?.name,
        ],
      ]);
      if (encodingIssue) return rpcError(payload.id, encodingIssue);
      if (
        !text(args.name) ||
        !startDate ||
        !endDate ||
        startDate > endDate ||
        ![30, 60, 120].includes(slotMinutes)
      )
        return rpcError(payload.id, "Invalid plan fields");
      const parse = (v: string) => {
        const [h, m] = v.split(":").map(Number);
        return h * 60 + m;
      };
      if (parse(closingTime) <= parse(openingTime))
        return rpcError(payload.id, "closingTime must be after openingTime");
      const requestPeriodProvided =
        args.requestPeriod !== undefined && args.requestPeriod !== null;
      const period =
        args.requestPeriod &&
        typeof args.requestPeriod === "object" &&
        !Array.isArray(args.requestPeriod)
          ? (args.requestPeriod as Record<string, unknown>)
          : undefined;
      if (
        requestPeriodProvided &&
        (!period || !text(period.opensOn) || !text(period.closesOn))
      )
        return rpcError(
          payload.id,
          "requestPeriod requires opensOn and closesOn in YYYY-MM-DD format",
        );
      const requestPeriodId = period ? crypto.randomUUID() : null;
      const planId = crypto.randomUUID();
      const dates: string[] = [];
      const cursor = new Date(`${startDate}T00:00:00Z`);
      const last = new Date(`${endDate}T00:00:00Z`);
      while (cursor <= last) {
        dates.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      const rows: Array<typeof shiftSlots.$inferInsert> = [];
      for (const date of dates)
        for (
          let t = parse(openingTime);
          t + slotMinutes <= parse(closingTime);
          t += slotMinutes
        )
          for (const rule of rules)
            rows.push({
              id: crypto.randomUUID(),
              planId,
              date,
              startTime: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`,
              endTime: `${String(Math.floor((t + slotMinutes) / 60)).padStart(2, "0")}:${String((t + slotMinutes) % 60).padStart(2, "0")}`,
              role: text(rule.role),
              requiredCount: Math.max(1, Number(rule.requiredCount ?? 1)),
            });
      await db.batch([
        db.insert(shiftPlans).values({
          id: planId,
          groupId,
          name: text(args.name),
          startDate,
          endDate,
          openingTime,
          closingTime,
          slotMinutes,
          defaultRequiredCount: Number(rules[0]?.requiredCount ?? 1),
          notes: text(args.notes).slice(0, 2000),
          status: "draft",
          createdBy: identity.email,
        }),
        ...Array.from({ length: Math.ceil(rows.length / 8) }, (_, i) =>
          db.insert(shiftSlots).values(rows.slice(i * 8, i * 8 + 8)),
        ),
      ]);
      if (period && requestPeriodId)
        await db.insert(shiftRequestPeriods).values({
          id: requestPeriodId,
          groupId,
          planId,
          name: text(period.name, text(args.name)),
          opensOn: text(period.opensOn),
          closesOn: text(period.closesOn),
          status: "open",
          createdBy: identity.email,
        });
      await recordAudit({
        groupId,
        userEmail: identity.email,
        action: "shift.create",
        entityType: "shiftPlan",
        entityId: planId,
        summary: `MCPでシフトを作成: ${text(args.name)}`,
        details: { source: "mcp", slotCount: rows.length },
      });
      return completeManagedExecution({
        planId,
        slotCount: rows.length,
        requestPeriod: period
          ? {
              id: requestPeriodId,
              name: text(period.name, text(args.name)),
              opensOn: text(period.opensOn),
              closesOn: text(period.closesOn),
              status: "open",
            }
          : null,
      });
    }
    if (name === "delete_draft_shift_plan") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const found = await planFor(db, text(args.planId), identity.email);
      if ("error" in found || !editorRoles.has(found.member.role))
        return rpcError(payload.id, "Editor membership required");
      if (found.plan.status !== "draft")
        return rpcError(payload.id, "Only draft plans can be deleted");
      const slots = await db
        .select()
        .from(shiftSlots)
        .where(eq(shiftSlots.planId, found.plan.id));
      const slotIds = slots.map((s) => s.id);
      await db.batch([
        ...(slotIds.length
          ? [
              db
                .delete(shiftAssignments)
                .where(inArray(shiftAssignments.slotId, slotIds)),
            ]
          : []),
        db.delete(shiftSlots).where(eq(shiftSlots.planId, found.plan.id)),
        db
          .delete(shiftRequestPeriods)
          .where(eq(shiftRequestPeriods.planId, found.plan.id)),
        db.delete(shiftPlans).where(eq(shiftPlans.id, found.plan.id)),
      ]);
      await recordAudit({
        groupId: found.plan.groupId,
        userEmail: identity.email,
        action: "shift.delete",
        entityType: "shiftPlan",
        entityId: found.plan.id,
        summary: "MCPで下書きシフトを削除",
        details: { source: "mcp" },
      });
      return completeManagedExecution({ ok: true, planId: found.plan.id });
    }
    if (name === "update_slot_counts") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const found = await planFor(db, text(args.planId), identity.email);
      if ("error" in found || !editorRoles.has(found.member.role))
        return rpcError(payload.id, "Editor membership required");
      if (found.plan.status !== "draft")
        return rpcError(payload.id, "Only draft plans can be adjusted");
      const expectedVersion = Number(args.expectedVersion);
      if (
        !Number.isInteger(expectedVersion) ||
        expectedVersion !== found.plan.version
      )
        return rpcError(
          payload.id,
          "Shift plan version conflict. Reload the plan and retry with its latest version.",
        );
      const [locked] = await db
        .update(shiftPlans)
        .set({ version: expectedVersion + 1 })
        .where(
          and(
            eq(shiftPlans.id, found.plan.id),
            eq(shiftPlans.version, expectedVersion),
          ),
        )
        .returning({ version: shiftPlans.version });
      if (!locked)
        return rpcError(
          payload.id,
          "Shift plan version conflict. Reload the plan and retry with its latest version.",
        );
      const changes = Array.isArray(args.slots)
        ? (args.slots as Array<Record<string, unknown>>)
        : [];
      const slotUpdates = changes
        .filter((change) => text(change.slotId))
        .map((change) =>
          db
            .update(shiftSlots)
            .set({
              requiredCount: Math.max(0, Number(change.requiredCount ?? 0)),
            })
            .where(
              and(
                eq(shiftSlots.id, text(change.slotId)),
                eq(shiftSlots.planId, found.plan.id),
              ),
            ),
        );
      await db.batch(slotUpdates);
      await recordAudit({
        groupId: found.plan.groupId,
        userEmail: identity.email,
        action: "shift.adjust",
        entityType: "shiftPlan",
        entityId: found.plan.id,
        summary: `MCPで勤務枠を調整: ${found.plan.name}`,
        details: {
          source: "mcp",
          updated: changes.length,
          closedDates: Array.isArray(args.closedDates) ? args.closedDates : [],
        },
      });
      return completeManagedExecution({
        ok: true,
        updated: changes.length,
        version: found.plan.version + 1,
        closedDates: Array.isArray(args.closedDates) ? args.closedDates : [],
      });
    }
    if (name === "get_shift_requests") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (!(await membership(db, groupId, identity.email)))
        return rpcError(payload.id, "Group membership required");
      const periods = await db
        .select()
        .from(shiftRequestPeriods)
        .where(eq(shiftRequestPeriods.groupId, groupId));
      const period =
        periods.find((p) => p.id === text(args.periodId)) ?? periods[0];
      if (!period)
        return rpc(payload.id, {
          period: null,
          requests: [],
          submission: null,
        });
      const [submission] = await db
        .select()
        .from(shiftRequestSubmissions)
        .where(
          and(
            eq(shiftRequestSubmissions.periodId, period.id),
            eq(shiftRequestSubmissions.userEmail, identity.email),
          ),
        )
        .limit(1);
      return rpc(payload.id, {
        period,
        requests: await db
          .select()
          .from(shiftRequests)
          .where(
            and(
              eq(shiftRequests.periodId, period.id),
              eq(shiftRequests.userEmail, identity.email),
            ),
          ),
        submission: submission ?? null,
      });
    }
    if (name === "get_shift_request_overview") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (identity.tokenType !== "assistant")
        return rpcError(
          payload.id,
          "This overview is available to an assistant token only.",
        );
      if (!hasScope(identity, "shift:read"))
        return rpcError(
          payload.id,
          "Assistant token scope does not allow shift reads.",
        );
      const self = await membership(db, groupId, identity.email);
      if (!self || self.status !== "active" || !editorRoles.has(self.role))
        return rpcError(payload.id, "Active editor membership required");
      const [period] = await db
        .select()
        .from(shiftRequestPeriods)
        .where(
          and(
            eq(shiftRequestPeriods.id, text(args.periodId)),
            eq(shiftRequestPeriods.groupId, groupId),
          ),
        )
        .limit(1);
      if (!period)
        return rpcError(payload.id, "Shift request period not found");
      const members = await db
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.status, "active"),
          ),
        );
      const emails = members.map((member) => member.userEmail);
      const [profiles, requests, submissions, preferences, availability] =
        await Promise.all([
          emails.length
            ? db
                .select()
                .from(accountProfiles)
                .where(inArray(accountProfiles.userEmail, emails))
            : [],
          db
            .select()
            .from(shiftRequests)
            .where(eq(shiftRequests.periodId, period.id)),
          db
            .select()
            .from(shiftRequestSubmissions)
            .where(eq(shiftRequestSubmissions.periodId, period.id)),
          emails.length
            ? db
                .select()
                .from(groupPreferences)
                .where(
                  and(
                    eq(groupPreferences.groupId, groupId),
                    inArray(groupPreferences.userEmail, emails),
                  ),
                )
            : [],
          emails.length
            ? db
                .select()
                .from(shiftAvailability)
                .where(
                  and(
                    eq(shiftAvailability.groupId, groupId),
                    inArray(shiftAvailability.userEmail, emails),
                  ),
                )
            : [],
        ]);
      return rpc(payload.id, {
        period,
        members: members.map((member) => ({
          member: {
            ...toPublicMember(member, false),
            accountNickname:
              profiles.find((profile) => profile.userEmail === member.userEmail)
                ?.nickname ?? "",
          },
          preferences:
            preferences.find(
              (preference) => preference.userEmail === member.userEmail,
            ) ?? null,
          availability: availability.filter(
            (entry) => entry.userEmail === member.userEmail,
          ),
          requests: requests.filter(
            (requestRow) => requestRow.userEmail === member.userEmail,
          ),
          submission:
            submissions.find(
              (submission) => submission.userEmail === member.userEmail,
            ) ?? null,
        })),
      });
    }
    if (name === "save_shift_requests") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (!(await membership(db, groupId, identity.email)))
        return rpcError(payload.id, "Group membership required");
      const [period] = await db
        .select()
        .from(shiftRequestPeriods)
        .where(
          and(
            eq(shiftRequestPeriods.id, text(args.periodId)),
            eq(shiftRequestPeriods.groupId, groupId),
          ),
        )
        .limit(1);
      if (!period || period.status !== "open")
        return rpcError(payload.id, "Open request period required");
      if (shiftRequestDeadlinePassed(period.closesOn)) {
        await db
          .update(shiftRequestPeriods)
          .set({ status: "closed" })
          .where(eq(shiftRequestPeriods.id, period.id));
        return rpcError(payload.id, "Shift request deadline has passed.");
      }
      const slots = await db
        .select()
        .from(shiftSlots)
        .where(eq(shiftSlots.planId, period.planId));
      const valid = new Set(
        slots.map((s) => `${s.date}|${s.startTime}|${s.endTime}`),
      );
      const requests = (
        Array.isArray(args.requests) ? args.requests : []
      ) as Array<Record<string, unknown>>;
      const invalidIndex = requests.findIndex(
        (r) =>
          !valid.has(
            `${text(r.date)}|${text(r.startTime)}|${text(r.endTime)}`,
          ) ||
          !preferenceValues.has(text(r.preference)) ||
          !isPreferenceStatus(r.preference),
      );
      if (invalidIndex >= 0)
        return rpcError(
          payload.id,
          `requests[${invalidIndex}] does not match a shift slot or has an invalid preference status`,
        );
      const rows = requests.map((r) => ({
        id: crypto.randomUUID(),
        periodId: period.id,
        userEmail: identity.email,
        date: text(r.date),
        startTime: text(r.startTime),
        endTime: text(r.endTime),
        preference: text(r.preference),
        note: text(r.note),
      }));
      const savedAt = new Date().toISOString();
      const requestComment = text(args.requestComment).slice(0, 500);
      const [submission] = await db
        .select()
        .from(shiftRequestSubmissions)
        .where(
          and(
            eq(shiftRequestSubmissions.periodId, period.id),
            eq(shiftRequestSubmissions.userEmail, identity.email),
          ),
        )
        .limit(1);
      const submissionStatement = submission
        ? db
            .update(shiftRequestSubmissions)
            .set({ savedAt, requestComment })
            .where(eq(shiftRequestSubmissions.id, submission.id))
        : db.insert(shiftRequestSubmissions).values({
            id: crypto.randomUUID(),
            periodId: period.id,
            userEmail: identity.email,
            savedAt,
            requestComment,
          });
      await db.batch([
        db
          .delete(shiftRequests)
          .where(
            and(
              eq(shiftRequests.periodId, period.id),
              eq(shiftRequests.userEmail, identity.email),
            ),
          ),
        ...rows.map((row) => db.insert(shiftRequests).values(row)),
        submissionStatement,
      ]);
      await recordAudit({
        groupId,
        userEmail: identity.email,
        action: "shift.request",
        entityType: "shiftRequestPeriod",
        entityId: period.id,
        summary: `勤務希望を保存: ${period.name}`,
        details: { count: rows.length, savedAt, requestComment, source: "mcp" },
      });
      return rpc(payload.id, {
        ok: true,
        count: rows.length,
        normalizedCount: rows.length,
        submissionStatus: "submitted",
        savedAt,
        requestComment,
      });
    }
    if (name === "set_shift_assignments") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const found = await planFor(db, text(args.planId), identity.email);
      if ("error" in found || !editorRoles.has(found.member.role))
        return rpcError(payload.id, "Editor membership required");
      const expectedVersion = Number(args.expectedVersion);
      if (
        !Number.isInteger(expectedVersion) ||
        expectedVersion !== found.plan.version
      )
        return rpcError(
          payload.id,
          "Shift plan version conflict. Reload the plan and retry with its latest version.",
        );
      const [locked] = await db
        .update(shiftPlans)
        .set({ version: expectedVersion + 1 })
        .where(
          and(
            eq(shiftPlans.id, found.plan.id),
            eq(shiftPlans.version, expectedVersion),
          ),
        )
        .returning({ version: shiftPlans.version });
      if (!locked)
        return rpcError(
          payload.id,
          "Shift plan version conflict. Reload the plan and retry with its latest version.",
        );
      const slots = await db
        .select()
        .from(shiftSlots)
        .where(eq(shiftSlots.planId, found.plan.id));
      const members = await db
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, found.plan.groupId),
            eq(groupMembers.status, "active"),
          ),
        );
      const memberEmails = new Set(members.map((m) => m.userEmail));
      const input = (args.assignments ?? {}) as Record<string, unknown>;
      const rows: Array<typeof shiftAssignments.$inferInsert> = [];
      for (const slot of slots)
        for (const email of Array.isArray(input[slot.id])
          ? (input[slot.id] as unknown[])
          : [])
          if (typeof email === "string" && memberEmails.has(email))
            rows.push({
              id: crypto.randomUUID(),
              slotId: slot.id,
              userEmail: email,
            });
      const status = args.status === "published" ? "published" : "draft";
      // D1 has a bound-variable/statement limit. Keep this path aligned with
      // the HTTP API and split the replacement into small statements so large
      // plans do not fail with `too many SQL variables`.
      const statements = [
        ...chunk(slots.map((slot) => slot.id), 50).map((slotIds) =>
          db.delete(shiftAssignments).where(inArray(shiftAssignments.slotId, slotIds)),
        ),
        ...chunk(rows, 8).map((insertRows) =>
          db.insert(shiftAssignments).values(insertRows),
        ),
        db
          .update(shiftPlans)
          .set({ status })
          .where(eq(shiftPlans.id, found.plan.id)),
        db.delete(events).where(eq(events.shiftPlanId, found.plan.id)),
      ];
      if (status === "published") {
        const profiles = members.length
          ? await db
              .select()
              .from(accountProfiles)
              .where(
                inArray(
                  accountProfiles.userEmail,
                  members.map((member) => member.userEmail),
                ),
              )
          : [];
        const memberNames = new Map(
          members.map((member) => [
            member.userEmail,
            member.displayName?.trim() ||
              profiles
                .find((profile) => profile.userEmail === member.userEmail)
                ?.nickname?.trim() ||
              member.userEmail.split("@")[0],
          ]),
        );
        const [group] = await db
          .select()
          .from(groups)
          .where(eq(groups.id, found.plan.groupId))
          .limit(1);
        const publishedEvents = slots
          .map((slot) => ({
            slot,
            assigned: rows
              .filter((row) => row.slotId === slot.id)
              .map((row) => memberNames.get(row.userEmail) ?? row.userEmail),
          }))
          .filter((item) => item.assigned.length > 0)
          .map((item) => {
            const start = shiftDateTime(item.slot.date, item.slot.startTime);
            const end = shiftDateTime(item.slot.date, item.slot.endTime);
            return {
              id: crypto.randomUUID(),
              ownerEmail: found.plan.createdBy,
              groupId: found.plan.groupId,
              shiftPlanId: found.plan.id,
              title: item.slot.role?.trim() || group?.name || "予定",
              date: start.date,
              endDate: end.date,
              startTime: start.time,
              endTime: end.time,
              category: "仕事",
              notes: `担当：${item.assigned.join("、")}`,
              completed: false,
            };
          });
        for (const eventRows of chunk(publishedEvents, 8))
          statements.push(db.insert(events).values(eventRows));
      }
      await db.batch(statements);
      await recordAudit({
        groupId: found.plan.groupId,
        userEmail: identity.email,
        action: status === "published" ? "shift.publish" : "shift.assign",
        entityType: "shiftPlan",
        entityId: found.plan.id,
        summary:
          status === "published"
            ? `MCPでシフトを公開: ${found.plan.name}`
            : `MCPで担当割当を保存: ${found.plan.name}`,
        details: {
          source: "mcp",
          assignedCount: rows.length,
          reason: text(args.reason),
        },
      });
      return completeManagedExecution({
        ok: true,
        assigned: rows.length,
        status,
        calendarEvents: status === "published" ? rows.length : 0,
        version: expectedVersion + 1,
      });
    }
    if (name === "get_assistant_message_queue_summary") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (identity.tokenType !== "assistant")
        return rpcError(
          payload.id,
          "This queue summary is available to an assistant token only.",
        );
      if (!hasScope(identity, "assistant:read"))
        return rpcError(
          payload.id,
          "Assistant token scope does not allow assistant reads.",
        );
      const self = await membership(db, groupId, identity.email);
      if (!self || self.status !== "active" || !editorRoles.has(self.role))
        return rpcError(payload.id, "Active editor membership required");
      const now = new Date().toISOString();
      const messageCreatedAt = (await getDemoNow(groupId)).toISOString();
      const base = and(
        eq(assistantMessages.groupId, groupId),
        inArray(assistantMessages.senderType, ["member", "manager"]),
      );
      const [pending, activeProcessing, reclaimableProcessing, needsReview] =
        await Promise.all([
          db
            .select({ value: count() })
            .from(assistantMessages)
            .where(and(base, eq(assistantMessages.status, "pending"))),
          db
            .select({ value: count() })
            .from(assistantMessages)
            .where(
              and(
                base,
                eq(assistantMessages.status, "processing"),
                gt(assistantMessages.claimExpiresAt, now),
              ),
            ),
          db
            .select({ value: count() })
            .from(assistantMessages)
            .where(
              and(
                base,
                eq(assistantMessages.status, "processing"),
                lt(assistantMessages.claimExpiresAt, now),
              ),
            ),
          db
            .select({ value: count() })
            .from(assistantMessages)
            .where(and(base, eq(assistantMessages.status, "needs_review"))),
        ]);
      return rpc(payload.id, {
        pendingCount: pending[0]?.value ?? 0,
        processingCount: activeProcessing[0]?.value ?? 0,
        reclaimableCount: reclaimableProcessing[0]?.value ?? 0,
        needsReviewCount: needsReview[0]?.value ?? 0,
        messageBodiesIncluded: false,
      });
    }
    if (name === "claim_next_assistant_message") {
      if (identity.tokenType !== "assistant" || !identity.groupId)
        return rpcError(payload.id, "An assistant token is required.");
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (!hasScope(identity, "assistant:read"))
        return rpcError(
          payload.id,
          "Assistant token scope does not allow assistant reads.",
        );
      const now = new Date().toISOString();
      const candidates = await db
        .select()
        .from(assistantMessages)
        .where(
          and(
            eq(assistantMessages.groupId, groupId),
            inArray(assistantMessages.senderType, ["member", "manager"]),
            or(
              eq(assistantMessages.status, "pending"),
              and(
                eq(assistantMessages.status, "processing"),
                lt(assistantMessages.claimExpiresAt, now),
              ),
            ),
          ),
        )
        .orderBy(assistantMessages.createdAt)
        .limit(10);
      for (const candidate of candidates) {
        const claimExpiresAt = new Date(
          Date.now() + assistantClaimLeaseMs,
        ).toISOString();
        const claimId = crypto.randomUUID();
        const [claimed] = await db
          .update(assistantMessages)
          .set({
            status: "processing",
            claimedAt: now,
            claimExpiresAt,
            claimId,
          })
          .where(
            and(
              eq(assistantMessages.id, candidate.id),
              or(
                eq(assistantMessages.status, "pending"),
                and(
                  eq(assistantMessages.status, "processing"),
                  lt(assistantMessages.claimExpiresAt, now),
                ),
              ),
            ),
          )
          .returning();
        if (!claimed) continue;
        const sender = await membership(db, groupId, claimed.memberEmail);
        const mode =
          sender?.status === "active" && editorRoles.has(sender.role)
            ? "manager"
            : "member";
        await recordAudit({
          groupId,
          userEmail: identity.email,
          action: "assistant.claim",
          entityType: "assistantMessage",
          entityId: claimed.id,
          summary: `MCPでアシスタント問い合わせを取得: ${claimed.memberEmail}`,
          details: { source: "mcp", claimExpiresAt },
        });
        return rpc(payload.id, {
          message: claimed,
          contextMode: mode,
          claimId,
          claimExpiresAt,
        });
      }
      return rpc(payload.id, { message: null });
    }
    if (name === "list_shift_swap_requests") {
      if (identity.tokenType !== "assistant" || !identity.groupId)
        return rpcError(payload.id, "An assistant token is required.");
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (!hasScope(identity, "shift:read"))
        return rpcError(payload.id, "Assistant token scope does not allow shift reads.");
      const manager = await membership(db, groupId, identity.email);
      if (!manager || manager.status !== "active" || !editorRoles.has(manager.role))
        return rpcError(payload.id, "Active manager membership required.");
      const filters = [eq(shiftSwapRequests.groupId, groupId)];
      const requestId = text(args.requestId);
      const status = text(args.status);
      if (requestId) filters.push(eq(shiftSwapRequests.id, requestId));
      if (["needs_review", "open", "candidate_review", "confirmed", "failed", "cancelled"].includes(status))
        filters.push(eq(shiftSwapRequests.status, status as typeof shiftSwapRequests.status.enumValues[number]));
      const requests = await db.select().from(shiftSwapRequests).where(and(...filters)).orderBy(desc(shiftSwapRequests.createdAt));
      const candidates = requests.length
        ? await db.select().from(shiftSwapCandidates).where(inArray(shiftSwapCandidates.requestId, requests.map((request) => request.id)))
        : [];
      return rpc(payload.id, {
        ok: true,
        requests: requests.map((request) => ({
          ...request,
          candidates: candidates.filter((candidate) => candidate.requestId === request.id),
        })),
      });
    }
    if (name === "create_shift_swap_announcement_draft") {
      if (identity.tokenType !== "assistant" || !identity.groupId)
        return rpcError(payload.id, "An assistant token is required.");
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (
        !hasScope(identity, "assistant:reply") ||
        !hasScope(identity, "shift:read")
      )
        return rpcError(
          payload.id,
          "Assistant token requires assistant:reply and shift:read scopes.",
        );
      const messageId = text(args.messageId);
      const [source, existing] = await Promise.all([
        db
          .select()
          .from(assistantMessages)
          .where(
            and(
              eq(assistantMessages.id, messageId),
              eq(assistantMessages.groupId, groupId),
              eq(assistantMessages.senderType, "member"),
            ),
          )
          .limit(1),
        db
          .select()
          .from(assistantAnnouncementDrafts)
          .where(eq(assistantAnnouncementDrafts.sourceMessageId, messageId))
          .limit(1),
      ]);
      if (!source[0]) return rpcError(payload.id, "Member message not found.");
      if (existing[0])
        return rpc(payload.id, {
          ok: true,
          duplicate: true,
          draft: existing[0],
        });
      const sender = await membership(db, groupId, source[0].memberEmail);
      if (!sender || sender.status !== "active" || editorRoles.has(sender.role))
        return rpcError(
          payload.id,
          "Only an active member request can create a shift-swap draft.",
        );
      const plans = await db
        .select()
        .from(shiftPlans)
        .where(
          and(
            eq(shiftPlans.groupId, groupId),
            eq(shiftPlans.status, "published"),
          ),
        );
      const planIds = plans.map((plan) => plan.id);
      const slots = planIds.length
        ? (
            await Promise.all(
              chunk(planIds, 50).map((ids) =>
                db
                  .select()
                  .from(shiftSlots)
                  .where(inArray(shiftSlots.planId, ids)),
              ),
            )
          ).flat()
        : [];
      const slotIds = slots.map((slot) => slot.id);
      const assignments = slotIds.length
        ? (
            await Promise.all(
              chunk(slotIds, 50).map((ids) =>
                db
                  .select()
                  .from(shiftAssignments)
                  .where(
                    and(
                      inArray(shiftAssignments.slotId, ids),
                      eq(shiftAssignments.userEmail, source[0].memberEmail),
                    ),
                  ),
              ),
            )
          ).flat()
        : [];
      const requestedSlotId = text(args.slotId);
      const candidates = slots.filter(
        (slot) =>
          assignments.some((assignment) => assignment.slotId === slot.id) &&
          (!requestedSlotId || slot.id === requestedSlotId),
      );
      if (candidates.length !== 1) {
        const [deferred] = await db
          .update(assistantMessages)
          .set({
            status: "needs_review",
            claimedAt: null,
            claimExpiresAt: null,
            claimId: null,
          })
          .where(
            and(
              eq(assistantMessages.id, messageId),
              eq(assistantMessages.groupId, groupId),
              eq(assistantMessages.senderType, "member"),
              eq(assistantMessages.status, "processing"),
              eq(assistantMessages.claimId, text(args.claimId)),
            ),
          )
          .returning();
        if (!deferred)
          return rpcError(
            payload.id,
            "The message claim is no longer current. Claim the message again before deferring it.",
          );
        await recordAudit({
          groupId,
          userEmail: identity.email,
          action: "assistant.shift_swap_draft.defer",
          entityType: "assistantMessage",
          entityId: messageId,
          summary: "交代希望の対象シフトを自動特定できず管理者確認へ",
          details: {
            sourceMessageId: messageId,
            candidateSlotIds: candidates.map((slot) => slot.id),
          },
        });
        return rpc(payload.id, {
          ok: false,
          needsReview: true,
          reason: candidates.length
            ? "Multiple published shifts matched. Select one slotId."
            : "No published shift matched this member.",
          candidates: candidates.map((slot) => ({
            id: slot.id,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            role: slot.role,
          })),
        });
      }
      const slot = candidates[0];
      const role = slot.role || "勤務";
      const title = `【交代募集】${slot.date.slice(5).replace("-", "/")} ${slot.startTime}〜${slot.endTime} ${role}`;
      const body = `${slot.date} ${slot.startTime}〜${slot.endTime} の${role}で、交代可能な方を募集しています。\n対応可能な方は管理者へご連絡ください。`;
      const swapRequest = {
        id: crypto.randomUUID(),
        groupId,
        sourceMessageId: messageId,
        requesterEmail: source[0].memberEmail,
        planId: plans.find((plan) => plan.id === slot.planId)?.id ?? "",
        slotId: slot.id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        role: slot.role,
        reason: source[0].body.slice(0, 1000),
        createdBy: identity.email,
      };
      const draft = {
        id: crypto.randomUUID(),
        groupId,
        sourceMessageId: messageId,
        requesterEmail: source[0].memberEmail,
        slotId: slot.id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        role: slot.role,
        title,
        body,
        swapRequestId: swapRequest.id,
        createdBy: identity.email,
      };
      const [reviewRequested] = await db
        .update(assistantMessages)
        .set({
          status: "needs_review",
          claimedAt: null,
          claimExpiresAt: null,
          claimId: null,
        })
        .where(
          and(
            eq(assistantMessages.id, messageId),
            eq(assistantMessages.groupId, groupId),
            eq(assistantMessages.senderType, "member"),
            eq(assistantMessages.status, "processing"),
            eq(assistantMessages.claimId, text(args.claimId)),
          ),
        )
        .returning();
      if (!reviewRequested)
        return rpcError(
          payload.id,
          "The message claim is no longer current. Claim the message again before creating a draft.",
        );
      await db.batch([
        db.insert(shiftSwapRequests).values(swapRequest),
        db.insert(assistantAnnouncementDrafts).values(draft),
      ]);
      await recordAudit({
        groupId,
        userEmail: identity.email,
        action: "assistant.shift_swap_draft.create",
        entityType: "assistantAnnouncementDraft",
        entityId: draft.id,
        summary: "交代希望から管理者確認用のお知らせ案を作成",
        details: {
          sourceMessageId: messageId,
          slotId: slot.id,
          swapRequestId: swapRequest.id,
          requesterEmail: source[0].memberEmail,
        },
      });
      const reviewers = await activeGroupEmails(db, groupId, true);
      await createSystemMessagesAndPush(db, {
        groupId,
        recipients: reviewers,
        eventId: `assistant-review:${messageId}`,
        eventType: "assistant_needs_review",
        body: "管理者による確認が必要なアシスタント依頼があります。",
        pushTitle: "KINBAN",
        pushBody: "KINBANアシスタントから新しい連絡があります",
        url: `/?group=${encodeURIComponent(groupId)}&view=assistant`,
      });
      return rpc(payload.id, {
        ok: true,
        draft: { ...draft, status: "needs_review" },
        swapRequest,
      });
    }
    if (name === "respond_shift_swap_candidate") {
      if (identity.tokenType !== "assistant" || !identity.groupId)
        return rpcError(payload.id, "An assistant token is required.");
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (!hasScope(identity, "assistant:reply") || !hasScope(identity, "shift:read"))
        return rpcError(payload.id, "Assistant token requires assistant:reply and shift:read scopes.");
      const messageId = text(args.messageId);
      const claimId = text(args.claimId);
      const [source, request] = await Promise.all([
        db.select().from(assistantMessages).where(and(eq(assistantMessages.id, messageId), eq(assistantMessages.groupId, groupId), eq(assistantMessages.senderType, "member"))).limit(1),
        db.select().from(shiftSwapRequests).where(and(eq(shiftSwapRequests.id, text(args.requestId)), eq(shiftSwapRequests.groupId, groupId))).limit(1),
      ]);
      if (!source[0]) return rpcError(payload.id, "Member message not found.");
      if (!request[0] || !["open", "candidate_review"].includes(request[0].status))
        return rpcError(payload.id, "The shift replacement request is not accepting candidates.");
      const member = await membership(db, groupId, source[0].memberEmail);
      if (!member || member.status !== "active" || source[0].memberEmail === request[0].requesterEmail)
        return rpcError(payload.id, "Only another active group member can respond as a candidate.");
      const current = await db.select().from(shiftSwapCandidates).where(and(eq(shiftSwapCandidates.requestId, request[0].id), eq(shiftSwapCandidates.memberEmail, source[0].memberEmail))).limit(1);
      const candidateValues = {
        status: text(args.status) === "available" ? "available" as const : "unavailable" as const,
        note: text(args.note).slice(0, 500),
        updatedAt: new Date().toISOString(),
      };
      if (current[0]) {
        await db.update(shiftSwapCandidates).set(candidateValues).where(eq(shiftSwapCandidates.id, current[0].id));
      } else {
        await db.insert(shiftSwapCandidates).values({ id: crypto.randomUUID(), requestId: request[0].id, groupId, memberEmail: source[0].memberEmail, ...candidateValues });
      }
      await db.update(shiftSwapRequests).set({ status: "candidate_review", updatedAt: candidateValues.updatedAt }).where(and(eq(shiftSwapRequests.id, request[0].id), inArray(shiftSwapRequests.status, ["open", "candidate_review"])));
      await recordAudit({ groupId, userEmail: identity.email, action: "assistant.shift_swap_candidate.respond", entityType: "shiftSwapRequest", entityId: request[0].id, summary: "A shift replacement candidate response was recorded.", details: { memberEmail: source[0].memberEmail, status: candidateValues.status, sourceMessageId: messageId } });
      return rpc(payload.id, { ok: true, requestId: request[0].id, memberEmail: source[0].memberEmail, status: candidateValues.status });
    }
    if (name === "confirm_shift_swap") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const groupId = text(args.groupId);
      const requestId = text(args.requestId);
      const replacementEmail = text(args.replacementEmail).toLowerCase();
      const [swapRequest] = await db.select().from(shiftSwapRequests).where(and(eq(shiftSwapRequests.id, requestId), eq(shiftSwapRequests.groupId, groupId))).limit(1);
      if (!swapRequest) return rpcError(payload.id, "Shift replacement request not found.");
      if (!["open", "candidate_review"].includes(swapRequest.status)) return rpcError(payload.id, "This shift replacement request is no longer confirmable.");
      const [candidate, replacement, found] = await Promise.all([
        db.select().from(shiftSwapCandidates).where(and(eq(shiftSwapCandidates.requestId, requestId), eq(shiftSwapCandidates.memberEmail, replacementEmail), eq(shiftSwapCandidates.status, "available"))).limit(1),
        membership(db, groupId, replacementEmail),
        planFor(db, swapRequest.planId, identity.email),
      ]);
      if (!candidate[0]) return rpcError(payload.id, "The selected member has not offered availability for this request.");
      if (!replacement || replacement.status !== "active") return rpcError(payload.id, "Replacement member is not active.");
      if ("error" in found) return rpcError(payload.id, found.error);
      if (found.plan.status !== "published") return rpcError(payload.id, "The published shift plan is no longer available.");
      const expectedVersion = Number(args.expectedVersion);
      if (!Number.isInteger(expectedVersion) || expectedVersion !== found.plan.version)
        return rpcError(payload.id, "Shift plan version conflict. Reload the plan and retry with its latest version.");
      const [slot] = await db.select().from(shiftSlots).where(and(eq(shiftSlots.id, swapRequest.slotId), eq(shiftSlots.planId, found.plan.id))).limit(1);
      if (!slot) return rpcError(payload.id, "The assigned slot no longer exists.");
      const slotAssignments = await db.select().from(shiftAssignments).where(eq(shiftAssignments.slotId, slot.id));
      if (!slotAssignments.some((assignment) => assignment.userEmail === swapRequest.requesterEmail))
        return rpcError(payload.id, "The original member is no longer assigned to this slot.");
      const allSlots = await db.select().from(shiftSlots).where(eq(shiftSlots.planId, found.plan.id));
      const assignmentChunks = await Promise.all(
        chunk(allSlots.map((item) => item.id), 50).map((slotIds) =>
          db.select().from(shiftAssignments).where(inArray(shiftAssignments.slotId, slotIds)),
        ),
      );
      const allAssignments = assignmentChunks.flat();
      const timeValue = (date: string, time: string) => Date.parse(`${date}T00:00:00Z`) / 60000 + shiftTimeToMinutes(time);
      const replacementOverlaps = allAssignments.filter((assignment) => assignment.userEmail === replacementEmail && assignment.slotId !== slot.id).some((assignment) => {
        const other = allSlots.find((item) => item.id === assignment.slotId);
        return Boolean(other) && timeValue(slot.date, slot.startTime) < timeValue(other.date, other.endTime) && timeValue(other.date, other.startTime) < timeValue(slot.date, slot.endTime);
      });
      if (replacementOverlaps) return rpcError(payload.id, "Replacement member already has an overlapping assignment.");
      const [period] = await db.select().from(shiftRequestPeriods).where(and(eq(shiftRequestPeriods.groupId, groupId), eq(shiftRequestPeriods.planId, found.plan.id))).limit(1);
      if (period) {
        const [conflict] = await db.select().from(shiftRequests).where(and(eq(shiftRequests.periodId, period.id), eq(shiftRequests.userEmail, replacementEmail), eq(shiftRequests.date, slot.date), inArray(shiftRequests.preference, ["off", "unavailable"]))).limit(1);
        if (conflict) return rpcError(payload.id, "Replacement member has an unavailable preference for this slot.");
      }
      const now = new Date().toISOString();
      const [locked] = await db.update(shiftPlans).set({ version: expectedVersion + 1 }).where(and(eq(shiftPlans.id, found.plan.id), eq(shiftPlans.version, expectedVersion), eq(shiftPlans.status, "published"))).returning({ version: shiftPlans.version });
      if (!locked) return rpcError(payload.id, "Shift plan version conflict. Reload the plan and retry with its latest version.");
      const remaining = slotAssignments.filter((assignment) => assignment.userEmail !== swapRequest.requesterEmail).map((assignment) => assignment.userEmail);
      remaining.push(replacementEmail);
      const [requesterProfile, replacementProfile] = await Promise.all([
        db.select().from(accountProfiles).where(eq(accountProfiles.userEmail, swapRequest.requesterEmail)).limit(1),
        db.select().from(accountProfiles).where(eq(accountProfiles.userEmail, replacementEmail)).limit(1),
      ]);
      const requesterName = requesterProfile[0]?.nickname || swapRequest.requesterEmail.split("@")[0];
      const replacementName = replacementProfile[0]?.nickname || replacement.displayName || replacementEmail.split("@")[0];
      const eventDate = shiftDateTime(slot.date, slot.startTime);
      const eventEnd = shiftDateTime(slot.date, slot.endTime);
      await db.batch([
        db.delete(shiftAssignments).where(eq(shiftAssignments.slotId, slot.id)),
        ...remaining.map((email) => db.insert(shiftAssignments).values({ id: crypto.randomUUID(), slotId: slot.id, userEmail: email })),
        db.update(events).set({ notes: `Assigned: ${remaining.map((email) => email === replacementEmail ? replacementName : email === swapRequest.requesterEmail ? requesterName : email).join(", ")}` }).where(and(eq(events.shiftPlanId, found.plan.id), eq(events.date, eventDate.date), eq(events.startTime, eventDate.time), eq(events.endDate, eventEnd.date), eq(events.endTime, eventEnd.time))),
        db.update(shiftSwapRequests).set({ status: "confirmed", replacementEmail, managerNote: text(args.managerNote).slice(0, 500), reviewedBy: identity.email, confirmedAt: now, version: swapRequest.version + 1, updatedAt: now }).where(and(eq(shiftSwapRequests.id, requestId), inArray(shiftSwapRequests.status, ["open", "candidate_review"]))),
        db.insert(assistantMessages).values({ id: crypto.randomUUID(), groupId, memberEmail: swapRequest.requesterEmail, senderType: "assistant", senderEmail: identity.email, body: "Your shift replacement has been confirmed. Please review the updated shift.", status: "processed", eventType: "shift_swap_confirmed", eventId: `shift-swap:${requestId}:requester`, createdAt: messageCreatedAt }).onConflictDoNothing(),
        db.insert(assistantMessages).values({ id: crypto.randomUUID(), groupId, memberEmail: replacementEmail, senderType: "assistant", senderEmail: identity.email, body: "You have been assigned to the replacement shift. Please review the updated shift.", status: "processed", eventType: "shift_swap_confirmed", eventId: `shift-swap:${requestId}:replacement`, createdAt: messageCreatedAt }).onConflictDoNothing(),
      ]);
      await Promise.all([
        sendBusinessPush(db, { recipients: [swapRequest.requesterEmail], eventId: `shift-swap:${requestId}:requester`, title: "KINBAN", body: "Your shift replacement has been confirmed.", url: `/?group=${encodeURIComponent(groupId)}&view=shifts`, urgency: "high" }),
        sendBusinessPush(db, { recipients: [replacementEmail], eventId: `shift-swap:${requestId}:replacement`, title: "KINBAN", body: "You have been assigned to a replacement shift.", url: `/?group=${encodeURIComponent(groupId)}&view=shifts`, urgency: "high" }),
      ]);
      await recordAudit({ groupId, userEmail: identity.email, action: "assistant.shift_swap.confirm", entityType: "shiftSwapRequest", entityId: requestId, summary: "A published shift replacement was confirmed.", details: { planId: found.plan.id, slotId: slot.id, requesterEmail: swapRequest.requesterEmail, replacementEmail, version: expectedVersion + 1 } });
      return completeManagedExecution({ ok: true, status: "confirmed", requestId, planId: found.plan.id, slotId: slot.id, replacementEmail, version: expectedVersion + 1 });
    }
    if (name === "list_assistant_messages") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (
        identity.tokenType === "assistant" &&
        !hasScope(identity, "assistant:read")
      )
        return rpcError(
          payload.id,
          "Assistant token scope does not allow assistant reads.",
        );
      const self = await membership(db, groupId, identity.email);
      if (!self) return rpcError(payload.id, "Group membership required");
      const manager = editorRoles.has(self.role);
      const memberEmail = manager ? text(args.memberEmail) : identity.email;
      const filters = [eq(assistantMessages.groupId, groupId)];
      if (memberEmail)
        filters.push(eq(assistantMessages.memberEmail, memberEmail));
      const requestedStatus = text(args.status);
      if (
        [
          "pending",
          "processing",
          "processed",
          "failed",
          "needs_review",
        ].includes(requestedStatus)
      )
        filters.push(
          eq(
            assistantMessages.status,
            requestedStatus as
              | "pending"
              | "processing"
              | "processed"
              | "failed"
              | "needs_review",
          ),
        );
      const limit = Math.min(Math.max(Number(args.limit) || 100, 1), 500);
      const [assistant, messages] = await Promise.all([
        db
          .select()
          .from(groupAssistants)
          .where(eq(groupAssistants.groupId, groupId))
          .limit(1),
        db
          .select()
          .from(assistantMessages)
          .where(and(...filters))
          .orderBy(desc(assistantMessages.createdAt))
          .limit(limit),
      ]);
      return rpc(payload.id, {
        assistant: assistant[0] ?? null,
        messages,
        manager,
        filter: {
          memberEmail: memberEmail || null,
          status: requestedStatus || null,
        },
        count: messages.length,
      });
    }
    if (name === "reply_assistant_message") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (
        identity.tokenType === "assistant" &&
        !hasScope(identity, "assistant:reply")
      )
        return rpcError(
          payload.id,
          "Assistant token scope does not allow assistant replies.",
        );
      const self = await membership(db, groupId, identity.email);
      if (!self || !editorRoles.has(self.role))
        return rpcError(payload.id, "Editor membership required");
      const messageId = text(args.messageId);
      const replyBody = text(args.body).slice(0, 2000);
      if (!replyBody) return rpcError(payload.id, "body is required");
      const replyId = crypto.randomUUID();
      const [target] = await db
        .update(assistantMessages)
        .set({
          status: "processed",
          claimedAt: null,
          claimExpiresAt: null,
          claimId: null,
        })
        .where(
          and(
            eq(assistantMessages.id, messageId),
            eq(assistantMessages.groupId, groupId),
            inArray(assistantMessages.senderType, ["member", "manager"]),
            eq(assistantMessages.status, "processing"),
            eq(assistantMessages.claimId, text(args.claimId)),
          ),
        )
        .returning();
      if (!target)
        return rpcError(
          payload.id,
          "The message claim is no longer current. Claim the message again before replying.",
        );
      const createdAt = (await getDemoNow(groupId)).toISOString();
      await db.insert(assistantMessages).values({
        id: replyId,
        groupId,
        memberEmail: target.memberEmail,
        senderType: "assistant",
        senderEmail: identity.email,
        body: replyBody,
        status: "processed",
        createdAt,
      });
      await recordAudit({
        groupId,
        userEmail: identity.email,
        action: "assistant.reply",
        entityType: "assistantMessage",
        entityId: replyId,
        summary: `MCPでKINBANアシスタントとして返信: ${target.memberEmail}`,
        details: { source: "mcp", replyToMessageId: target.id },
      });
      await sendBusinessPush(db, {
        recipients: [target.memberEmail],
        eventId: `assistant-reply:${replyId}`,
        title: "KINBAN",
        body: "KINBANアシスタントから新しい連絡があります",
        url: `/?group=${encodeURIComponent(groupId)}&view=assistant`,
        urgency: "high",
      });
      return rpc(payload.id, {
        ok: true,
        replyId,
        replyToMessageId: target.id,
        memberEmail: target.memberEmail,
      });
    }
    if (
      [
        "release_assistant_message",
        "defer_assistant_message",
        "complete_assistant_message",
      ].includes(name)
    ) {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (
        identity.tokenType !== "assistant" ||
        !hasScope(identity, "assistant:read")
      )
        return rpcError(
          payload.id,
          "An assistant token with assistant:read scope is required.",
        );
      const self = await membership(db, groupId, identity.email);
      if (!self || self.status !== "active" || !editorRoles.has(self.role))
        return rpcError(payload.id, "Active editor membership required");
      const messageId = text(args.messageId);
      const reason = text(args.reason).slice(0, 500);
      if (name !== "release_assistant_message" && !reason)
        return rpcError(payload.id, "reason is required");
      const nextStatus =
        name === "release_assistant_message"
          ? "pending"
          : name === "defer_assistant_message"
            ? "needs_review"
            : "processed";
      const [target] = await db
        .update(assistantMessages)
        .set({
          status: nextStatus,
          claimedAt: null,
          claimExpiresAt: null,
          claimId: null,
        })
        .where(
          and(
            eq(assistantMessages.id, messageId),
            eq(assistantMessages.groupId, groupId),
            inArray(assistantMessages.senderType, ["member", "manager"]),
            eq(assistantMessages.status, "processing"),
            eq(assistantMessages.claimId, text(args.claimId)),
          ),
        )
        .returning();
      if (!target)
        return rpcError(
          payload.id,
          "The message claim is no longer current. Claim the message again before changing its status.",
        );
      if (name === "defer_assistant_message") {
        const recipients = await activeGroupEmails(db, groupId, true);
        await createSystemMessagesAndPush(db, {
          groupId,
          recipients,
          eventId: `assistant-review:${target.id}`,
          eventType: "assistant_needs_review",
          body: "管理者による確認が必要なアシスタント依頼があります。",
          pushTitle: "KINBAN",
          pushBody: "KINBANアシスタントから新しい連絡があります",
          url: `/?group=${encodeURIComponent(groupId)}&view=assistant`,
        });
      }
      const action =
        name === "release_assistant_message"
          ? "assistant.release"
          : name === "defer_assistant_message"
            ? "assistant.defer"
            : "assistant.complete";
      await recordAudit({
        groupId,
        userEmail: identity.email,
        action,
        entityType: "assistantMessage",
        entityId: target.id,
        summary: `MCPでアシスタントメッセージを${nextStatus}へ更新: ${target.memberEmail}`,
        details: { source: "mcp", reason: reason || null },
      });
      return rpc(payload.id, {
        ok: true,
        messageId: target.id,
        status: nextStatus,
        reason: reason || null,
      });
    }
    if (name === "list_announcements") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (
        identity.tokenType === "assistant" &&
        !hasScope(identity, "announcement:read")
      )
        return rpcError(
          payload.id,
          "Assistant token scope does not allow announcement reads.",
        );
      if (!(await membership(db, groupId, identity.email)))
        return rpcError(payload.id, "Group membership required");
      const announcements = await db
        .select()
        .from(groupAnnouncements)
        .where(eq(groupAnnouncements.groupId, groupId));
      const ids = announcements.map((a) => a.id);
      const replies = ids.length
        ? await db
            .select()
            .from(announcementReplies)
            .where(inArray(announcementReplies.announcementId, ids))
        : [];
      const reads = ids.length
        ? await db
            .select()
            .from(announcementReads)
            .where(inArray(announcementReads.announcementId, ids))
        : [];
      return rpc(payload.id, {
        announcements,
        replies:
          identity.tokenType === "personal"
            ? replies.filter((reply) => reply.userEmail === identity.email)
            : replies,
        reads:
          identity.tokenType === "personal"
            ? reads.filter((read) => read.userEmail === identity.email)
            : reads,
      });
    }
    if (name === "mark_announcement_read") {
      const id = text(args.announcementId);
      const [announcement] = await db
        .select()
        .from(groupAnnouncements)
        .where(eq(groupAnnouncements.id, id))
        .limit(1);
      if (
        !announcement ||
        !(await membership(db, announcement.groupId, identity.email))
      )
        return rpcError(payload.id, "Announcement not found");
      const restricted = assistantGroupError(identity, announcement.groupId);
      if (restricted) return rpcError(payload.id, restricted);
      const [read] = await db
        .select()
        .from(announcementReads)
        .where(
          and(
            eq(announcementReads.announcementId, id),
            eq(announcementReads.userEmail, identity.email),
          ),
        )
        .limit(1);
      if (!read) {
        await db.insert(announcementReads).values({
          id: crypto.randomUUID(),
          announcementId: id,
          userEmail: identity.email,
        });
        await recordAudit({
          groupId: announcement.groupId,
          userEmail: identity.email,
          action: "announcement.read",
          entityType: "announcement",
          entityId: id,
          summary: "MCPでお知らせを既読に変更",
          details: { source: "mcp" },
        });
      }
      return rpc(payload.id, { ok: true, announcementId: id });
    }
    if (name === "create_announcement") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const groupId = text(args.groupId);
      const member = await membership(db, groupId, identity.email);
      if (!member || !editorRoles.has(member.role))
        return rpcError(payload.id, "Editor membership required");
      const encodingIssue = firstTextEncodingIssue([
        ["announcement title", args.title],
        ["announcement body", args.body],
      ]);
      if (encodingIssue) return rpcError(payload.id, encodingIssue);
      const row = {
        id: crypto.randomUUID(),
        groupId,
        createdBy: identity.email,
        title: text(args.title).slice(0, 120),
        body: text(args.body).slice(0, 2000),
      };
      if (!row.title || !row.body)
        return rpcError(payload.id, "title and body are required");
      await db.insert(groupAnnouncements).values(row);
      await recordAudit({
        groupId,
        userEmail: identity.email,
        action: "announcement.create",
        entityType: "announcement",
        entityId: row.id,
        summary: `MCPでお知らせを作成: ${row.title}`,
        details: { source: "mcp" },
      });
      return completeManagedExecution(row);
    }
    if (name === "delete_announcement") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const groupId = text(args.groupId);
      const announcementId = text(args.announcementId);
      const member = await membership(db, groupId, identity.email);
      if (!member || !editorRoles.has(member.role))
        return rpcError(payload.id, "Editor membership required");
      const [announcement] = await db
        .select()
        .from(groupAnnouncements)
        .where(and(eq(groupAnnouncements.id, announcementId), eq(groupAnnouncements.groupId, groupId)))
        .limit(1);
      if (!announcement) return rpcError(payload.id, "Announcement not found");
      await db.delete(announcementReads).where(eq(announcementReads.announcementId, announcementId));
      await db.delete(announcementReplies).where(eq(announcementReplies.announcementId, announcementId));
      await db.delete(groupAnnouncements).where(eq(groupAnnouncements.id, announcementId));
      await recordAudit({
        groupId,
        userEmail: identity.email,
        action: "announcement.delete",
        entityType: "announcement",
        entityId: announcementId,
        summary: `MCPでお知らせを削除: ${announcement.title}`,
        details: { source: "mcp" },
      });
      return completeManagedExecution({ ok: true, announcementId });
    }
    if (name === "send_member_message") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const groupId = text(args.groupId);
      const recipientEmail = text(args.recipientEmail).toLowerCase();
      const body = text(args.body).slice(0, 2000);
      const encodingIssue = textEncodingIssue(body, "member message body");
      if (encodingIssue) return rpcError(payload.id, encodingIssue);
      if (!groupId || !recipientEmail || !body)
        return rpcError(payload.id, "groupId, recipientEmail, and body are required");
      const sender = await membership(db, groupId, identity.email);
      if (!sender || sender.status !== "active" || !editorRoles.has(sender.role))
        return rpcError(payload.id, "Editor membership required");
      const recipient = await membership(db, groupId, recipientEmail);
      if (!recipient || recipient.status !== "active")
        return rpcError(payload.id, "Recipient must be an active member of this group");
      const createdAt = (await getDemoNow(groupId)).toISOString();
      const message = {
        id: crypto.randomUUID(),
        groupId,
        memberEmail: recipientEmail,
        senderType: "assistant" as const,
        senderEmail: identity.email,
        body,
        status: "processed" as const,
        createdAt,
      };
      await db.insert(assistantMessages).values(message);
      await recordAudit({
        groupId,
        userEmail: identity.email,
        action: "assistant.member_message.send",
        entityType: "assistantMessage",
        entityId: message.id,
        summary: `MCP縺ｧ繝｡繝ｳ繝舌・縺ｸ蛹悶・騾｣邨｡: ${recipientEmail}`,
        details: { source: "mcp", recipientEmail },
      });
      await sendBusinessPush(db, {
        recipients: [recipientEmail],
        eventId: `assistant-member-message:${message.id}`,
        title: "KINBAN",
        body: "KINBANアシスタントから新しい連絡があります",
        url: `/?group=${encodeURIComponent(groupId)}&view=assistant`,
        urgency: "high",
      });
      return completeManagedExecution({
        ok: true,
        messageId: message.id,
        recipientEmail,
      });
    }
    if (name === "send_manager_message") {
      if (args.confirm !== true) return rpcError(payload.id, mutating);
      const groupId = text(args.groupId);
      const body = text(args.body).slice(0, 2000);
      const encodingIssue = textEncodingIssue(body, "manager message body");
      if (encodingIssue) return rpcError(payload.id, encodingIssue);
      if (!groupId || !body) return rpcError(payload.id, "groupId and body are required");
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      const member = await membership(db, groupId, identity.email);
      if (!member || member.status !== "active") return rpcError(payload.id, "Active group membership is required");
      const createdAt = (await getDemoNow(groupId)).toISOString();
      const row = {
        id: crypto.randomUUID(),
        groupId,
        memberEmail: identity.email,
        senderType: "member" as const,
        senderEmail: identity.email,
        body,
        status: "pending" as const,
        createdAt,
      };
      await db.insert(assistantMessages).values(row);
      await recordAudit({
        groupId,
        userEmail: identity.email,
        action: "assistant.manager_message.send",
        entityType: "assistantMessage",
        entityId: row.id,
        summary: "MCPで管理者への連絡を送信しました",
        details: { source: "mcp" },
      });
      const managers = await db
        .select({ userEmail: groupMembers.userEmail })
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.status, "active"),
            inArray(groupMembers.role, ["owner", "editor"]),
          ),
        );
      await sendBusinessPush(db, {
        recipients: managers.map((manager) => manager.userEmail),
        eventId: `member-manager-message:${row.id}`,
        title: "KINBAN",
        body: "メンバーから新しい連絡があります",
        url: `/?group=${encodeURIComponent(groupId)}&view=assistant`,
        urgency: "high",
      });
      return rpc(payload.id, { ok: true, messageId: row.id, status: row.status });
    }
    if (name === "reply_announcement") {
      const id = text(args.announcementId);
      const [announcement] = await db
        .select()
        .from(groupAnnouncements)
        .where(eq(groupAnnouncements.id, id))
        .limit(1);
      if (
        !announcement ||
        !(await membership(db, announcement.groupId, identity.email))
      )
        return rpcError(payload.id, "Announcement not found");
      const restricted = assistantGroupError(identity, announcement.groupId);
      if (restricted) return rpcError(payload.id, restricted);
      const row = {
        id: crypto.randomUUID(),
        announcementId: id,
        userEmail: identity.email,
        body: text(args.body).slice(0, 2000),
      };
      if (!row.body) return rpcError(payload.id, "body is required");
      await db.insert(announcementReplies).values(row);
      await recordAudit({
        groupId: announcement.groupId,
        userEmail: identity.email,
        action: "announcement.reply",
        entityType: "announcementReply",
        entityId: row.id,
        summary: "MCPでお知らせに返信",
        details: { source: "mcp", announcementId: id },
      });
      return rpc(payload.id, row);
    }
    if (name === "group_dashboard") {
      const groupId = text(args.groupId);
      const restricted = assistantGroupError(identity, groupId);
      if (restricted) return rpcError(payload.id, restricted);
      if (
        identity.tokenType === "assistant" &&
        !hasScope(identity, "assistant:read")
      )
        return rpcError(
          payload.id,
          "Assistant token scope does not allow dashboard reads.",
        );
      if (!(await membership(db, groupId, identity.email)))
        return rpcError(payload.id, "Group membership required");
      const [members, plans, announcements] = await Promise.all([
        db
          .select()
          .from(groupMembers)
          .where(
            and(
              eq(groupMembers.groupId, groupId),
              eq(groupMembers.status, "active"),
            ),
          ),
        db.select().from(shiftPlans).where(eq(shiftPlans.groupId, groupId)),
        db
          .select()
          .from(groupAnnouncements)
          .where(eq(groupAnnouncements.groupId, groupId)),
      ]);
      return rpc(payload.id, {
        memberCount: members.length,
        planCount: plans.length,
        publishedPlanCount: plans.filter((p) => p.status === "published")
          .length,
        announcementCount: announcements.length,
      });
    }
    return rpcError(payload.id, `Unknown tool: ${name}`);
  } catch (caught) {
    if (activeExecution)
      await db
        .update(assistantMessageExecutions)
        .set({
          status: "failed",
          errorCode:
            caught instanceof Error ? caught.name.slice(0, 80) : "mcp_error",
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(assistantMessageExecutions.id, activeExecution.id),
            eq(assistantMessageExecutions.status, "processing"),
            eq(assistantMessageExecutions.leaseId, activeExecution.leaseId),
          ),
        );
    return rpcError(
      payload.id,
      caught instanceof Error ? caught.message : "MCP tool failed",
    );
  } finally {
    if (activeExecution)
      await db
        .update(assistantMessageExecutions)
        .set({
          status: "failed",
          errorCode: "operation_not_completed",
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(assistantMessageExecutions.id, activeExecution.id),
            eq(assistantMessageExecutions.status, "processing"),
            eq(assistantMessageExecutions.leaseId, activeExecution.leaseId),
          ),
        );
  }
}
