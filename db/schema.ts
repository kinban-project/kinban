import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const assistantMessages = sqliteTable("assistant_messages", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  memberEmail: text("member_email").notNull(),
  senderType: text("sender_type", { enum: ["member", "assistant"] })
    .notNull()
    .default("member"),
  senderEmail: text("sender_email"),
  body: text("body").notNull(),
  status: text("status", { enum: ["pending", "processing", "processed", "failed"] })
    .notNull()
    .default("pending"),
  claimedAt: text("claimed_at"),
  claimExpiresAt: text("claim_expires_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

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

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  eventId: text("event_id").notNull(),
  objectKey: text("object_key").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
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
