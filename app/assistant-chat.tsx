"use client";

import { useCallback, useEffect, useState } from "react";
import { localApiFetch } from "./local-api";

type Assistant = { displayName: string; role: "editor"; status: "active" | "inactive" };
type Member = { userEmail: string; displayName?: string | null };
type AnnouncementDraft = { id: string; sourceMessageId: string; requesterEmail: string; date: string; startTime: string; endTime: string; role: string; title: string; body: string; status: "needs_review" | "published" | "rejected"; managerNote: string; announcementId?: string | null; createdAt: string };
type SwapCandidate = { id: string; memberEmail: string; status: "available" | "unavailable"; note: string };
type SwapRequest = { id: string; requesterEmail: string; date: string; startTime: string; endTime: string; role: string; status: string; replacementEmail?: string | null; candidates: SwapCandidate[] };
type Message = { id: string; memberEmail: string; senderType: "member" | "manager" | "assistant" | "system"; body: string; status: "pending" | "processing" | "processed" | "failed" | "needs_review"; createdAt: string };
type ChatData = { assistant: Assistant | null; messages: Message[]; members: Member[]; drafts?: AnnouncementDraft[]; swapRequests?: SwapRequest[]; currentEmail: string; selectedMember: string; manager: boolean };

function memberName(member: Member) {
  return member.displayName?.trim() || member.userEmail.split("@")[0];
}

export default function AssistantChat({ groupId, manager = false }: { groupId: string; manager?: boolean }) {
  const [data, setData] = useState<ChatData | null>(null);
  const [selectedMember, setSelectedMember] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [draftEdits, setDraftEdits] = useState<Record<string, { title: string; body: string; managerNote: string }>>({});

  const load = useCallback(async (member?: string) => {
    const params = new URLSearchParams({ view: manager ? "manager" : "member" });
    if (member) params.set("member", member);
    const query = `?${params.toString()}`;
    const response = await localApiFetch(`/api/groups/${groupId}/assistant${query}`);
    if (!response.ok) return;
    const next = await response.json() as ChatData;
    setData(next);
    setSelectedMember(next.selectedMember);
  }, [groupId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim() || sending) return;
    setSending(true);
    const response = await localApiFetch(`/api/groups/${groupId}/assistant`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: message, view: manager ? "manager" : "member", ...(manager && selectedMember ? { memberEmail: selectedMember } : {}) }) });
    const result = await response.json().catch(() => ({})) as { error?: string };
    setNotice(response.ok ? "KINBANアシスタントへ送りました。AI接続後に順次確認します。" : result.error ?? "送信できませんでした");
    if (response.ok) { setMessage(""); await load(); }
    setSending(false);
  }

  function draftValues(draft: AnnouncementDraft) {
    return draftEdits[draft.id] ?? { title: draft.title, body: draft.body, managerNote: draft.managerNote };
  }

  async function updateDraft(draft: AnnouncementDraft, action: "updateAnnouncementDraft" | "publishAnnouncementDraft" | "rejectAnnouncementDraft") {
    if (action === "publishAnnouncementDraft" && !window.confirm("このお知らせ案を承認してグループ全体へ配信しますか？")) return;
    const values = draftValues(draft);
    const response = await localApiFetch(`/api/groups/${groupId}/assistant`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, draftId: draft.id, title: values.title, announcementBody: values.body, managerNote: values.managerNote }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    setNotice(response.ok ? action === "publishAnnouncementDraft" ? "お知らせを配信し、依頼者へ結果を返信しました。" : action === "rejectAnnouncementDraft" ? "お知らせ案を差戻しにしました。" : "お知らせ案を保存しました。" : result.error ?? "お知らせ案を更新できませんでした。");
    if (response.ok) await load(selectedMember);
  }

  async function acknowledgeMessage(message: Message) {
    if (!window.confirm("このメッセージを対応済みにしますか？")) return;
    const response = await localApiFetch(`/api/groups/${groupId}/assistant`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "acknowledgeAssistantMessage", messageId: message.id }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    setNotice(response.ok ? "対応済みにしました。" : result.error ?? "対応済みにできませんでした。");
    if (response.ok) await load(selectedMember);
  }

  if (!data) return <p className="empty-state">KINBANアシスタントを読み込んでいます…</p>;
  const active = data.assistant?.status === "active";
  const viewingOwnChat = selectedMember === data.currentEmail;
  const canCompose = active && (manager ? Boolean(selectedMember) : viewingOwnChat);
  const assistantLabel = "連絡";

  return <section className="assistant-chat">
    <div className="assistant-profile">
      <div className="assistant-avatar" aria-hidden="true">AI</div>
      <div><strong>{assistantLabel}</strong><p>シフトや勤怠について相談できるAIです。必要に応じて管理者へ引き継ぎます。</p></div>
      <span className={`assistant-state ${active ? "active" : "inactive"}`}>{active ? "受付中" : "停止中"}</span>
    </div>
    {manager && data.members.length > 0 && <label className="assistant-member-select">確認するメンバー
      <select value={selectedMember} onChange={(event) => { setSelectedMember(event.target.value); void load(event.target.value); }}>
        {data.members.map((member) => <option key={member.userEmail} value={member.userEmail}>{memberName(member)}{member.userEmail === data.currentEmail ? "（自分）" : ""}</option>)}
      </select>
    </label>}
    {manager && !viewingOwnChat && <p className="assistant-manager-note">管理者として会話履歴を確認しています。選択中のメンバーへ返信できます。</p>}
    {manager && (data.drafts?.length ?? 0) > 0 && <section className="assistant-drafts">
      <div className="assistant-drafts-head"><strong>交代募集のお知らせ案</strong><small>メンバーの依頼だけでは配信されません。内容を確認してから承認してください。</small></div>
      {data.drafts?.map((draft) => {
        const values = draftValues(draft);
        const editable = draft.status !== "published";
        return <article className={`assistant-draft ${draft.status}`} key={draft.id}>
          <div className="assistant-draft-meta"><strong>{draft.date} {draft.startTime}〜{draft.endTime} {draft.role || "勤務"}</strong><span className={`assistant-draft-status ${draft.status}`}>{draft.status === "needs_review" ? "承認待ち" : draft.status === "published" ? "配信済み" : "差戻し"}</span></div>
          <small>依頼者: {memberName(data.members.find((member) => member.userEmail === draft.requesterEmail) ?? { userEmail: draft.requesterEmail })} ・ 元メッセージ: {draft.sourceMessageId.slice(0, 8)}</small>
          {editable ? <>
            <input value={values.title} onChange={(event) => setDraftEdits((current) => ({ ...current, [draft.id]: { ...values, title: event.target.value } }))} aria-label="お知らせタイトル" />
            <textarea rows={3} value={values.body} onChange={(event) => setDraftEdits((current) => ({ ...current, [draft.id]: { ...values, body: event.target.value } }))} aria-label="お知らせ本文" />
            <input value={values.managerNote} onChange={(event) => setDraftEdits((current) => ({ ...current, [draft.id]: { ...values, managerNote: event.target.value } }))} placeholder="差戻し・管理メモ（任意）" aria-label="管理メモ" />
            <div className="assistant-draft-actions"><button className="small-action" type="button" onClick={() => void updateDraft(draft, "updateAnnouncementDraft")}>修正を保存</button><button className="primary-button" type="button" onClick={() => void updateDraft(draft, "publishAnnouncementDraft")}>承認して配信</button><button className="small-action danger" type="button" onClick={() => void updateDraft(draft, "rejectAnnouncementDraft")}>差戻し</button></div>
          </> : <><p>{draft.body}</p>{draft.managerNote && <small>管理メモ: {draft.managerNote}</small>}</>}
        </article>;
      })}
    </section>}
    {manager && (data.swapRequests?.length ?? 0) > 0 && <section className="assistant-drafts assistant-swap-requests">
      <div className="assistant-drafts-head"><strong>Shift replacement requests</strong><small>Manager approval and final assignment are performed by the assistant only after explicit manager instruction.</small></div>
      {data.swapRequests?.map((request) => <article className={`assistant-draft ${request.status}`} key={request.id}>
        <div className="assistant-draft-meta"><strong>{request.date} {request.startTime}-{request.endTime} {request.role || "shift"}</strong><span className={`assistant-draft-status ${request.status}`}>{request.status}</span></div>
        <small>Requester: {memberName(data.members.find((member) => member.userEmail === request.requesterEmail) ?? { userEmail: request.requesterEmail })}</small>
        {request.candidates.length ? <ul>{request.candidates.map((candidate) => <li key={candidate.id}>{memberName(data.members.find((member) => member.userEmail === candidate.memberEmail) ?? { userEmail: candidate.memberEmail })}: {candidate.status}</li>)}</ul> : <p>No candidate responses yet.</p>}
      </article>)}
    </section>}
    <div className="assistant-messages" aria-live="polite">
      {data.messages.length ? data.messages.map((item) => <div className={`assistant-message ${item.senderType}`} key={item.id}>
        <strong>{item.senderType === "assistant" || item.senderType === "system" ? assistantLabel : item.senderType === "manager" ? "管理者" : item.memberEmail === data.currentEmail ? "あなた" : item.memberEmail.split("@")[0]}</strong>
        <p>{item.body}</p>
        {manager && item.senderType === "member" && ["pending", "processing", "needs_review"].includes(item.status) && <button type="button" className="small-action" onClick={() => void acknowledgeMessage(item)}>対応済みにする</button>}
        <small>{item.createdAt}{item.senderType === "member" && item.status === "pending" ? "・AI確認待ち" : item.senderType === "member" && item.status === "processing" ? "・AI対応中" : item.senderType === "member" && item.status === "needs_review" ? "・管理者確認待ち" : ""}</small>
      </div>) : <p className="empty-state">まだ会話はありません。シフトや勤怠についてメッセージを送れます。</p>}
    </div>
    {canCompose ? <form className="assistant-composer" onSubmit={send}>
      <textarea rows={3} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} placeholder="例：今日のシフトに行けなくなりました" />
      <button className="primary-button" disabled={!message.trim() || sending}>{sending ? "送信中…" : "送信"}</button>
    </form> : !active ? <p className="assistant-disabled">{assistantLabel}は管理者により停止されています。過去の会話は引き続き確認できます。</p> : null}
    {notice && <p className="group-notice" role="status">{notice}</p>}
  </section>;
}
