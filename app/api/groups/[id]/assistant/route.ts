import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import {
  assistantAnnouncementDrafts,
  assistantMessages,
  assistantReadStates,
  groupAnnouncements,
  groupAssistants,
  groupMembers,
  shiftSwapRequests,
  shiftSwapCandidates,
} from "../../../../../db/schema";
import { recordAudit } from "../../../../audit-log";
import { getMembership } from "../../group-access";
import { getDemoNow } from "../../../../demo-clock";
import {
  activeGroupEmails,
  sendBusinessPush,
} from "../../../../notification-events";

export const dynamic = "force-dynamic";

function isManager(role: string) {
  return role === "owner" || role === "editor";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const membership = await getMembership(id, user.email);
  if (!membership)
    return Response.json(
      { error: "このグループのメンバーではありません" },
      { status: 403 },
    );
  const searchParams = new URL(request.url).searchParams;
  const memberView = searchParams.get("view") === "member";
  const managerView = isManager(membership.role) && !memberView;
  const requestedMember = searchParams.get("member")?.trim();
  const memberEmail =
    managerView && requestedMember
      ? requestedMember
      : user.email;
  const db = getDb();
  const [target, assistant, drafts, swapRequests] = await Promise.all([
    db
      .select({ userEmail: groupMembers.userEmail })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, id),
          eq(groupMembers.userEmail, memberEmail),
          eq(groupMembers.status, "active"),
        ),
      )
      .limit(1),
    db
      .select()
      .from(groupAssistants)
      .where(eq(groupAssistants.groupId, id))
      .limit(1),
    managerView
      ? db
          .select()
          .from(assistantAnnouncementDrafts)
          .where(eq(assistantAnnouncementDrafts.groupId, id))
          .orderBy(asc(assistantAnnouncementDrafts.createdAt))
      : Promise.resolve([]),
    managerView
      ? db
          .select()
          .from(shiftSwapRequests)
          .where(eq(shiftSwapRequests.groupId, id))
          .orderBy(asc(shiftSwapRequests.createdAt))
      : Promise.resolve([]),
  ]);
  if (!target[0])
    return Response.json(
      { error: "メンバーが見つかりません" },
      { status: 404 },
    );
  const messages = await db
    .select()
    .from(assistantMessages)
    .where(
      and(
        eq(assistantMessages.groupId, id),
        eq(assistantMessages.memberEmail, memberEmail),
      ),
    )
    .orderBy(asc(assistantMessages.createdAt));
  const readerConversation = managerView ? "*" : user.email;
  const now = (await getDemoNow(id)).toISOString();
  await db.insert(assistantReadStates).values({ id: crypto.randomUUID(), groupId: id, readerEmail: user.email, memberEmail: readerConversation, lastReadAt: now }).onConflictDoUpdate({ target: [assistantReadStates.groupId, assistantReadStates.readerEmail, assistantReadStates.memberEmail], set: { lastReadAt: now } });
  const members = managerView
    ? await db
        .select({
          userEmail: groupMembers.userEmail,
          displayName: groupMembers.displayName,
        })
        .from(groupMembers)
        .where(
          and(eq(groupMembers.groupId, id), eq(groupMembers.status, "active")),
        )
    : [];
  const swapCandidates = isManager(membership.role) && swapRequests.length
    ? await db
        .select()
        .from(shiftSwapCandidates)
        .where(inArray(shiftSwapCandidates.requestId, swapRequests.map((request) => request.id)))
    : [];
  return Response.json({
    assistant: assistant[0] ?? null,
    messages,
    members,
    drafts,
    swapRequests: swapRequests.map((request) => ({
      ...request,
      candidates: swapCandidates.filter((candidate) => candidate.requestId === request.id),
    })),
    currentEmail: user.email,
    selectedMember: memberEmail,
    manager: managerView,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const membership = await getMembership(id, user.email);
  if (!membership)
    return Response.json(
      { error: "このグループのメンバーではありません" },
      { status: 403 },
    );
  const body = (await request.json()) as { body?: string; memberEmail?: string; view?: "member" | "manager" };
  const text = body.body?.trim().slice(0, 2000) ?? "";
  if (!text)
    return Response.json(
      { error: "メッセージを入力してください" },
      { status: 400 },
    );
  const db = getDb();
  const manager = isManager(membership.role) && body.view !== "member";
  const targetEmail = manager && body.memberEmail?.trim() ? body.memberEmail.trim().toLowerCase() : user.email;
  if (manager && targetEmail !== user.email) {
    const targetMembership = await getMembership(id, targetEmail);
    if (!targetMembership || targetMembership.status !== "active") {
      return Response.json({ error: "指定されたメンバーはこのグループに所属していません" }, { status: 404 });
    }
  }
  const [assistant] = await db
    .select()
    .from(groupAssistants)
    .where(eq(groupAssistants.groupId, id))
    .limit(1);
  if (!assistant || assistant.status !== "active")
    return Response.json(
      { error: "KINBANアシスタントは現在停止中です" },
      { status: 409 },
    );
  const messageId = crypto.randomUUID();
  const createdAt = (await getDemoNow(id)).toISOString();
  await db.insert(assistantMessages).values({
    id: messageId,
    groupId: id,
    memberEmail: targetEmail,
    // 管理者からの画面メッセージは、MCPのキュー処理でも管理者指示として
    // 扱えるように発信者のグループ権限を保存する。
    senderType: manager ? "manager" : "member",
    senderEmail: user.email,
    body: text,
    status: manager ? "processed" : "pending",
    createdAt,
  });
  await recordAudit({
    groupId: id,
    userEmail: user.email,
    action: "assistant.message",
    entityType: "assistantMessage",
    entityId: messageId,
    summary: "KINBANアシスタントへメッセージを送信",
  });
  return Response.json({ ok: true, messageId }, { status: 201 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const membership = await getMembership(id, user.email);
  if (!membership)
    return Response.json(
      { error: "このグループのメンバーではありません" },
      { status: 403 },
    );
  if (!isManager(membership.role))
    return Response.json({ error: "管理者権限が必要です" }, { status: 403 });
  const body = (await request.json()) as {
    action?:
      | "updateAnnouncementDraft"
      | "publishAnnouncementDraft"
      | "rejectAnnouncementDraft"
      | "acknowledgeAssistantMessage";
    messageId?: string;
    draftId?: string;
    title?: string;
    announcementBody?: string;
    managerNote?: string;
    status?: "active" | "inactive";
    displayName?: string;
    permissions?: {
      canCreateShifts?: boolean;
      canPublishShifts?: boolean;
      canReviewDailyWork?: boolean;
      canReviewMonthlyWork?: boolean;
      canCreateAnnouncements?: boolean;
    };
  };
  const db = getDb();

  if (body.action) {
    const now = (await getDemoNow(id)).toISOString();
    if (body.action === "acknowledgeAssistantMessage") {
      const messageId = body.messageId?.trim() ?? "";
      if (!messageId)
        return Response.json({ error: "メッセージが指定されていません" }, { status: 400 });
      const [updatedMessage] = await db
        .update(assistantMessages)
        .set({ status: "processed", claimedAt: null, claimExpiresAt: null, claimId: null })
        .where(and(
          eq(assistantMessages.id, messageId),
          eq(assistantMessages.groupId, id),
          eq(assistantMessages.senderType, "member"),
          inArray(assistantMessages.status, ["pending", "processing", "needs_review"]),
        ))
        .returning();
      if (!updatedMessage)
        return Response.json({ error: "未処理のメッセージが見つかりません" }, { status: 404 });
      await recordAudit({
        groupId: id,
        userEmail: user.email,
        action: "assistant.message.acknowledge",
        entityType: "assistantMessage",
        entityId: messageId,
        summary: "管理者がKINBANアシスタントのメッセージを対応済みにしました",
        details: { processedAt: now, memberEmail: updatedMessage.memberEmail },
      });
      return Response.json({ ok: true, message: updatedMessage });
    }
    const draftId = body.draftId?.trim() ?? "";
    const [draft] = await db
      .select()
      .from(assistantAnnouncementDrafts)
      .where(
        and(
          eq(assistantAnnouncementDrafts.id, draftId),
          eq(assistantAnnouncementDrafts.groupId, id),
        ),
      )
      .limit(1);
    if (!draft)
      return Response.json(
        { error: "お知らせ案が見つかりません" },
        { status: 404 },
      );
    if (body.action === "updateAnnouncementDraft") {
      if (draft.status === "published")
        return Response.json(
          { error: "配信済みのお知らせ案は編集できません" },
          { status: 409 },
        );
      const title = body.title?.trim().slice(0, 120) ?? "";
      const announcementBody =
        body.announcementBody?.trim().slice(0, 2000) ?? "";
      if (!title || !announcementBody)
        return Response.json(
          { error: "タイトルと本文を入力してください" },
          { status: 400 },
        );
      const [updatedDraft] = await db
        .update(assistantAnnouncementDrafts)
        .set({
          title,
          body: announcementBody,
          managerNote:
            body.managerNote?.trim().slice(0, 500) ?? draft.managerNote,
          status: "needs_review",
          reviewedBy: null,
          reviewedAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(assistantAnnouncementDrafts.id, draft.id),
            eq(assistantAnnouncementDrafts.groupId, id),
            isNull(assistantAnnouncementDrafts.announcementId),
            inArray(assistantAnnouncementDrafts.status, [
              "needs_review",
              "rejected",
            ]),
          ),
        )
        .returning();
      if (!updatedDraft)
        return Response.json(
          {
            error:
              "This draft was already published or changed. Reload the assistant view.",
          },
          { status: 409 },
        );
      await recordAudit({
        groupId: id,
        userEmail: user.email,
        action: "assistant.announcement_draft.update",
        entityType: "assistantAnnouncementDraft",
        entityId: draft.id,
        summary: "交代募集のお知らせ案を編集",
        details: {
          sourceMessageId: draft.sourceMessageId,
          slotId: draft.slotId,
        },
      });
      return Response.json({ ok: true, status: "needs_review" });
    }

    if (body.action === "rejectAnnouncementDraft") {
      if (draft.status === "published")
        return Response.json(
          { error: "配信済みのお知らせ案は差戻しできません" },
          { status: 409 },
        );
      const managerNote = body.managerNote?.trim().slice(0, 500) ?? "";
      const [rejectedDraft] = await db
        .update(assistantAnnouncementDrafts)
        .set({
          status: "rejected",
          managerNote,
          reviewedBy: user.email,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(assistantAnnouncementDrafts.id, draft.id),
            eq(assistantAnnouncementDrafts.groupId, id),
            eq(assistantAnnouncementDrafts.status, "needs_review"),
            isNull(assistantAnnouncementDrafts.announcementId),
          ),
        )
        .returning();
      if (!rejectedDraft)
        return Response.json(
          {
            error:
              "This draft was already published or changed. Reload the assistant view.",
          },
          { status: 409 },
        );
      await db
        .update(assistantMessages)
        .set({
          status: "needs_review",
          claimedAt: null,
          claimExpiresAt: null,
          claimId: null,
        })
        .where(eq(assistantMessages.id, draft.sourceMessageId));
      if (draft.swapRequestId)
        await db
          .update(shiftSwapRequests)
          .set({ status: "cancelled", managerNote, reviewedBy: user.email, updatedAt: now })
          .where(and(eq(shiftSwapRequests.id, draft.swapRequestId), inArray(shiftSwapRequests.status, ["needs_review", "open", "candidate_review"])));
      await recordAudit({
        groupId: id,
        userEmail: user.email,
        action: "assistant.announcement_draft.reject",
        entityType: "assistantAnnouncementDraft",
        entityId: draft.id,
        summary: "交代募集のお知らせ案を差戻し",
        details: {
          sourceMessageId: draft.sourceMessageId,
          slotId: draft.slotId,
          managerNote: managerNote || null,
        },
      });
      return Response.json({ ok: true, status: "rejected" });
    }

    const resumingPublish =
      draft.status === "published" && Boolean(draft.announcementId);
    if (
      !resumingPublish &&
      (draft.status !== "needs_review" || draft.announcementId)
    )
      return Response.json(
        { error: "このお知らせ案は配信済み、または差戻し済みです" },
        { status: 409 },
      );
    const announcementId = draft.announcementId ?? crypto.randomUUID();
    const replyId = crypto.randomUUID();
    const replyEventId = `assistant-reply:${announcementId}`;
    if (!resumingPublish) {
      const [claimedDraft] = await db
        .update(assistantAnnouncementDrafts)
        .set({
          status: "published",
          announcementId,
          managerNote:
            body.managerNote?.trim().slice(0, 500) ?? draft.managerNote,
          reviewedBy: user.email,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(assistantAnnouncementDrafts.id, draft.id),
            eq(assistantAnnouncementDrafts.groupId, id),
            eq(assistantAnnouncementDrafts.status, "needs_review"),
            isNull(assistantAnnouncementDrafts.announcementId),
          ),
        )
        .returning();
      if (!claimedDraft)
        return Response.json(
          {
            error:
              "This draft was already processed. Reload the assistant view.",
          },
          { status: 409 },
        );
    }
    await db.batch([
      db
        .insert(groupAnnouncements)
        .values({
          id: announcementId,
          groupId: id,
          createdBy: user.email,
          title: draft.title,
          body: draft.body,
          notificationLevel: "urgent",
          category: "shift_replacement",
        })
        .onConflictDoNothing(),
      ...(draft.swapRequestId
        ? [
            db
              .update(shiftSwapRequests)
              .set({
                status: "open",
                announcementId,
                reviewedBy: user.email,
                updatedAt: now,
              })
              .where(eq(shiftSwapRequests.id, draft.swapRequestId)),
          ]
        : []),
      db
        .update(assistantMessages)
        .set({
          status: "processed",
          claimedAt: null,
          claimExpiresAt: null,
          claimId: null,
        })
        .where(eq(assistantMessages.id, draft.sourceMessageId)),
      db
        .insert(assistantMessages)
        .values({
          id: replyId,
          groupId: id,
          memberEmail: draft.requesterEmail,
          senderType: "assistant",
          senderEmail: user.email,
          body: "交代募集のお知らせを配信しました。対応可能な方からの連絡をお待ちください。",
          status: "processed",
          eventType: "shift_swap_announcement_published",
          eventId: replyEventId,
        })
        .onConflictDoNothing(),
    ]);
    if (!resumingPublish) await recordAudit({
      groupId: id,
      userEmail: user.email,
      action: "assistant.announcement_draft.publish",
      entityType: "assistantAnnouncementDraft",
      entityId: draft.id,
      summary: "交代募集のお知らせ案を承認して配信",
      details: {
        sourceMessageId: draft.sourceMessageId,
        slotId: draft.slotId,
        announcementId,
        requesterEmail: draft.requesterEmail,
      },
    });
    const recipients = await activeGroupEmails(db, id);
    await Promise.all([
      sendBusinessPush(db, {
        recipients,
        eventId: `announcement:${announcementId}`,
        title: "KINBAN",
        body: "緊急のお知らせがあります",
        url: `/?group=${encodeURIComponent(id)}&view=announcements`,
        urgency: "high",
      }),
      sendBusinessPush(db, {
        recipients: [draft.requesterEmail],
        eventId: replyEventId,
        title: "KINBAN",
        body: "KINBANアシスタントから新しい連絡があります",
        url: `/?group=${encodeURIComponent(id)}&view=assistant`,
        urgency: "high",
      }),
    ]);
    return Response.json({ ok: true, status: "published", announcementId });
  }

  const statusChanged = body.status === "active" || body.status === "inactive";
  const displayNameChanged = typeof body.displayName === "string";
  const permissions =
    body.permissions && typeof body.permissions === "object"
      ? body.permissions
      : null;
  if (!statusChanged && !displayNameChanged && !permissions)
    return Response.json({ error: "変更内容がありません" }, { status: 400 });
  const values = {
    ...(statusChanged ? { status: body.status } : {}),
    ...(displayNameChanged ? { displayName: body.displayName?.trim().slice(0, 80) || "KINBANアシスタント" } : {}),
    ...(permissions && typeof permissions.canCreateShifts === "boolean"
      ? { canCreateShifts: permissions.canCreateShifts }
      : {}),
    ...(permissions && typeof permissions.canPublishShifts === "boolean"
      ? { canPublishShifts: permissions.canPublishShifts }
      : {}),
    ...(permissions && typeof permissions.canReviewDailyWork === "boolean"
      ? { canReviewDailyWork: permissions.canReviewDailyWork }
      : {}),
    ...(permissions && typeof permissions.canReviewMonthlyWork === "boolean"
      ? { canReviewMonthlyWork: permissions.canReviewMonthlyWork }
      : {}),
    ...(permissions && typeof permissions.canCreateAnnouncements === "boolean"
      ? { canCreateAnnouncements: permissions.canCreateAnnouncements }
      : {}),
  };
  const [assistant] = await db
    .update(groupAssistants)
    .set(values)
    .where(eq(groupAssistants.groupId, id))
    .returning();
  await recordAudit({
    groupId: id,
    userEmail: user.email,
    action: statusChanged ? "assistant.status" : displayNameChanged ? "assistant.display_name" : "assistant.permissions",
    entityType: "groupAssistant",
    entityId: id,
    summary: statusChanged
      ? `KINBANアシスタントを${body.status === "active" ? "再開" : "停止"}しました`
      : "KINBANアシスタントの実行権限を変更しました",
    details: { ...(permissions ?? {}), ...(displayNameChanged ? { displayName: body.displayName?.trim().slice(0, 80) || "KINBANアシスタント" } : {}) },
  });
  return Response.json({ ok: true, assistant });
}
