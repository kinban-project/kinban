import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  groupId: text("group_id"),
  shiftPlanId: text("shift_plan_id"),
  title: text("title").notNull(),
  date: text("date").notNull(),
  endDate: text("end_date").notNull().default(""),
  startTime: text("start_time").notNull().default(""),
  endTime: text("end_time").notNull().default(""),
  category: text("category").notNull().default("仕事"),
  notes: text("notes").notNull().default(""),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  ownerEmail: text("owner_email").notNull(),
  visibility: text("visibility", { enum: ["private", "discoverable"] })
    .notNull()
    .default("private"),
  participationMode: text("participation_mode", { enum: ["invite_only", "request_to_join"] })
    .notNull()
    .default("invite_only"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const accountProfiles = sqliteTable("account_profiles", {
  userEmail: text("user_email").primaryKey(),
  nickname: text("nickname").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const pushDeliveries = sqliteTable("push_deliveries", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  userEmail: text("user_email").notNull(),
  subscriptionId: text("subscription_id").notNull(),
  status: text("status", { enum: ["sent", "failed", "disabled"] }).notNull(),
  httpStatus: integer("http_status"),
  errorCode: text("error_code").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("push_delivery_event_subscription_unique_idx").on(table.eventId, table.subscriptionId),
  index("push_delivery_user_created_idx").on(table.userEmail, table.createdAt),
]);

export const groupMembers = sqliteTable("group_members", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  userEmail: text("user_email").notNull(),
  displayName: text("display_name"),
  adminNote: text("admin_note").notNull().default(""),
  role: text("role", { enum: ["owner", "editor", "member"] })
    .notNull()
    .default("member"),
  status: text("status", { enum: ["active", "inactive"] })
    .notNull()
    .default("active"),
  showInPersonal: integer("show_in_personal", { mode: "boolean" })
    .notNull()
    .default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const groupAssistants = sqliteTable("group_assistants", {
  groupId: text("group_id").primaryKey(),
  displayName: text("display_name").notNull().default("KINBANアシスタント"),
  role: text("role", { enum: ["editor"] }).notNull().default("editor"),
  status: text("status", { enum: ["active", "inactive"] })
    .notNull()
    .default("active"),
  canCreateShifts: integer("can_create_shifts", { mode: "boolean" })
    .notNull()
    .default(true),
  canPublishShifts: integer("can_publish_shifts", { mode: "boolean" })
    .notNull()
    .default(true),
  canReviewDailyWork: integer("can_review_daily_work", { mode: "boolean" })
    .notNull()
    .default(true),
  canReviewMonthlyWork: integer("can_review_monthly_work", { mode: "boolean" })
    .notNull()
    .default(false),
  canCreateAnnouncements: integer("can_create_announcements", { mode: "boolean" })
    .notNull()
    .default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const assistantMessages = sqliteTable("assistant_messages", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  memberEmail: text("member_email").notNull(),
  senderType: text("sender_type", { enum: ["member", "manager", "assistant", "system"] })
    .notNull()
    .default("member"),
  senderEmail: text("sender_email"),
  body: text("body").notNull(),
  status: text("status", { enum: ["pending", "processing", "processed", "failed", "needs_review"] })
    .notNull()
    .default("pending"),
  claimedAt: text("claimed_at"),
  claimExpiresAt: text("claim_expires_at"),
  claimId: text("claim_id"),
  eventType: text("event_type").notNull().default(""),
  eventId: text("event_id").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("assistant_message_event_recipient_unique_idx")
    .on(table.groupId, table.memberEmail, table.eventId)
    .where(sql`event_id <> ''`),
]);

export const assistantMessageExecutions = sqliteTable(
  "assistant_message_executions",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id").notNull(),
    messageId: text("message_id").notNull(),
    operation: text("operation").notNull(),
    target: text("target").notNull(),
    status: text("status", { enum: ["processing", "succeeded", "failed"] })
      .notNull()
      .default("processing"),
    errorCode: text("error_code").notNull().default(""),
    attemptCount: integer("attempt_count").notNull().default(1),
    leaseId: text("lease_id").notNull().default(""),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("assistant_message_execution_unique_idx").on(
      table.messageId,
      table.operation,
      table.target,
    ),
  ],
);

export const assistantContexts = sqliteTable("assistant_contexts", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  groupId: text("group_id").notNull(),
  mode: text("mode", { enum: ["member", "operations"] }).notNull(),
  memberEmail: text("member_email"),
  messageId: text("message_id"),
  issuedBy: text("issued_by").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const memoFolders = sqliteTable("memo_folders", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  name: text("name").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("memo_folder_group_name_idx").on(table.groupId, table.name),
]);

export const memos = sqliteTable("memos", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  folderId: text("folder_id").notNull(),
  authorEmail: text("author_email").notNull(),
  targetDate: text("target_date").notNull().default(""),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  visibility: text("visibility", { enum: ["group", "managers", "private"] })
    .notNull()
    .default("group"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("memo_group_folder_date_idx").on(table.groupId, table.folderId, table.targetDate),
  index("memo_group_updated_idx").on(table.groupId, table.updatedAt),
]);

export const siteUsers = sqliteTable("site_users", {
  id: text("id").primaryKey(),
  userEmail: text("user_email").notNull().unique(),
  displayName: text("display_name").notNull().default(""),
  status: text("status", { enum: ["invited", "active", "suspended"] })
    .notNull()
    .default("invited"),
  isSiteAdmin: integer("is_site_admin", { mode: "boolean" })
    .notNull()
    .default(false),
  canCreateGroups: integer("can_create_groups", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const siteInvitations = sqliteTable("site_invitations", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  invitedBy: text("invited_by").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  status: text("status", { enum: ["pending", "accepted", "revoked", "expired"] })
    .notNull()
    .default("pending"),
  expiresAt: text("expires_at").notNull(),
  acceptedAt: text("accepted_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const authIdentities = sqliteTable("auth_identities", {
  id: text("id").primaryKey(),
  siteUserId: text("site_user_id").notNull(),
  provider: text("provider", { enum: ["google", "microsoft", "email_link", "chatgpt"] }).notNull(),
  providerSubject: text("provider_subject").notNull(),
  verifiedEmail: text("verified_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("auth_identity_provider_subject_idx").on(table.provider, table.providerSubject),
]);

export const siteSessions = sqliteTable("site_sessions", {
  id: text("id").primaryKey(),
  siteUserId: text("site_user_id").notNull(),
  sessionHash: text("session_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const siteSetupState = sqliteTable("site_setup_state", {
  id: text("id").primaryKey(),
  completedAt: text("completed_at"),
  completedBy: text("completed_by"),
});

export const groupInvitations = sqliteTable("group_invitations", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  inviteeEmail: text("invitee_email").notNull(),
  invitedBy: text("invited_by").notNull(),
  status: text("status", { enum: ["pending", "accepted", "revoked", "expired"] })
    .notNull()
    .default("pending"),
  expiresAt: text("expires_at").notNull(),
  acceptedAt: text("accepted_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("group_invitation_pending_unique_idx")
    .on(table.groupId, table.inviteeEmail, table.status),
  index("group_invitation_email_status_idx").on(table.inviteeEmail, table.status),
]);

export const demoClocks = sqliteTable("demo_clocks", {
  scope: text("scope").primaryKey(),
  currentAt: text("current_at").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const assistantReadStates = sqliteTable("assistant_read_states", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  readerEmail: text("reader_email").notNull(),
  memberEmail: text("member_email").notNull(),
  lastReadAt: text("last_read_at").notNull().default(""),
}, (table) => [
  uniqueIndex("assistant_read_state_reader_conversation_idx")
    .on(table.groupId, table.readerEmail, table.memberEmail),
]);

export const assistantAnnouncementDrafts = sqliteTable("assistant_announcement_drafts", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  sourceMessageId: text("source_message_id").notNull().unique(),
  requesterEmail: text("requester_email").notNull(),
  slotId: text("slot_id").notNull(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  role: text("role").notNull().default(""),
  title: text("title").notNull(),
  body: text("body").notNull(),
  status: text("status", { enum: ["needs_review", "published", "rejected"] }).notNull().default("needs_review"),
  managerNote: text("manager_note").notNull().default(""),
  announcementId: text("announcement_id"),
  swapRequestId: text("swap_request_id"),
  createdBy: text("created_by").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: text("reviewed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("assistant_announcement_draft_group_status_idx").on(table.groupId, table.status, table.createdAt),
]);

export const shiftSwapRequests = sqliteTable("shift_swap_requests", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  sourceMessageId: text("source_message_id").notNull().unique(),
  requesterEmail: text("requester_email").notNull(),
  planId: text("plan_id").notNull(),
  slotId: text("slot_id").notNull(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  role: text("role").notNull().default(""),
  reason: text("reason").notNull().default(""),
  status: text("status", {
    enum: ["needs_review", "open", "candidate_review", "confirmed", "failed", "cancelled"],
  }).notNull().default("needs_review"),
  announcementId: text("announcement_id"),
  replacementEmail: text("replacement_email"),
  managerNote: text("manager_note").notNull().default(""),
  createdBy: text("created_by").notNull(),
  reviewedBy: text("reviewed_by"),
  confirmedAt: text("confirmed_at"),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("shift_swap_request_group_status_idx").on(table.groupId, table.status, table.createdAt),
]);

export const shiftSwapCandidates = sqliteTable("shift_swap_candidates", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  groupId: text("group_id").notNull(),
  memberEmail: text("member_email").notNull(),
  status: text("status", { enum: ["available", "unavailable"] }).notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("shift_swap_candidate_request_member_idx").on(table.requestId, table.memberEmail),
  index("shift_swap_candidate_request_idx").on(table.requestId, table.status),
]);

export const groupPreferences = sqliteTable("group_preferences", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  userEmail: text("user_email").notNull(),
  minDays: integer("min_days").notNull().default(0),
  maxDays: integer("max_days").notNull().default(7),
  minHours: integer("min_hours").notNull().default(0),
  maxHours: integer("max_hours").notNull().default(40),
  weekendPolicy: text("weekend_policy").notNull().default("any"),
  freeComment: text("free_comment").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const groupJoinRequests = sqliteTable("group_join_requests", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  userEmail: text("user_email").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const shiftPlans = sqliteTable("shift_plans", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  openingTime: text("opening_time").notNull(),
  closingTime: text("closing_time").notNull(),
  slotMinutes: integer("slot_minutes").notNull().default(60),
  defaultRequiredCount: integer("default_required_count").notNull().default(1),
  notes: text("notes").notNull().default(""),
  status: text("status", { enum: ["draft", "published"] })
    .notNull()
    .default("draft"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const shiftSlots = sqliteTable("shift_slots", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  requiredCount: integer("required_count").notNull().default(1),
  role: text("role").notNull().default(""),
});

export const shiftAssignments = sqliteTable("shift_assignments", {
  id: text("id").primaryKey(),
  slotId: text("slot_id").notNull(),
  userEmail: text("user_email").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const groupAnnouncements = sqliteTable("group_announcements", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  createdBy: text("created_by").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  notificationLevel: text("notification_level", { enum: ["normal", "important", "urgent"] }).notNull().default("normal"),
  category: text("category").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const announcementReads = sqliteTable("announcement_reads", {
  id: text("id").primaryKey(),
  announcementId: text("announcement_id").notNull(),
  userEmail: text("user_email").notNull(),
  readAt: text("read_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const announcementReplies = sqliteTable("announcement_replies", {
  id: text("id").primaryKey(),
  announcementId: text("announcement_id").notNull(),
  userEmail: text("user_email").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  groupId: text("group_id"),
  userEmail: text("user_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull().default(""),
  summary: text("summary").notNull(),
  details: text("details").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const shiftAvailability = sqliteTable("shift_availability", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  userEmail: text("user_email").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  status: text("status").notNull().default("available"),
  startTime: text("start_time").notNull().default(""),
  endTime: text("end_time").notNull().default(""),
  note: text("note").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const shiftRequestPeriods = sqliteTable("shift_request_periods", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  planId: text("plan_id").notNull(),
  name: text("name").notNull(),
  opensOn: text("opens_on").notNull(),
  closesOn: text("closes_on").notNull(),
  status: text("status").notNull().default("open"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const shiftRequests = sqliteTable("shift_requests", {
  id: text("id").primaryKey(),
  periodId: text("period_id").notNull(),
  userEmail: text("user_email").notNull(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  preference: text("preference").notNull().default("possible"),
  note: text("note").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const shiftRequestSubmissions = sqliteTable(
  "shift_request_submissions",
  {
    id: text("id").primaryKey(),
    periodId: text("period_id").notNull(),
    userEmail: text("user_email").notNull(),
    savedAt: text("saved_at").notNull(),
    requestComment: text("request_comment").notNull().default(""),
  },
);

export const workRecords = sqliteTable("work_records", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  planId: text("plan_id"),
  slotId: text("slot_id"),
  userEmail: text("user_email").notNull(),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledStartTime: text("scheduled_start_time").notNull().default(""),
  scheduledEndTime: text("scheduled_end_time").notNull().default(""),
  startedAt: text("started_at"),
  endedAt: text("ended_at"),
  claimedStartAt: text("claimed_start_at"),
  claimedEndAt: text("claimed_end_at"),
  claimedBreakMinutes: integer("claimed_break_minutes"),
  activeKey: text("active_key"),
  status: text("status").notNull().default("working"),
  employeeNote: text("employee_note").notNull().default(""),
  managerNote: text("manager_note").notNull().default(""),
  approvedBy: text("approved_by"),
  approvedAt: text("approved_at"),
  monthlyClosedAt: text("monthly_closed_at"),
  monthlyClosedBy: text("monthly_closed_by"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const monthlyWorkClaims = sqliteTable("monthly_work_claims", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  userEmail: text("user_email").notNull(),
  monthKey: text("month_key").notNull(),
  status: text("status").notNull().default("unsubmitted"),
  submittedAt: text("submitted_at"),
  approvedAt: text("approved_at"),
  approvedBy: text("approved_by"),
  managerNote: text("manager_note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const workBreaks = sqliteTable("work_breaks", {
  id: text("id").primaryKey(),
  workRecordId: text("work_record_id").notNull(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const apiTokens = sqliteTable("api_tokens", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  name: text("name").notNull().default("My Day API key"),
  tokenType: text("token_type", { enum: ["personal", "assistant"] })
    .notNull()
    .default("personal"),
  groupId: text("group_id"),
  scopes: text("scopes").notNull().default("[]"),
  tokenHash: text("token_hash").notNull().unique(),
  tokenPrefix: text("token_prefix").notNull(),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const mcpConfirmations = sqliteTable("mcp_confirmations", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  groupId: text("group_id").notNull(),
  action: text("action").notNull(),
  entityId: text("entity_id").notNull().default(""),
  issuedBy: text("issued_by").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
