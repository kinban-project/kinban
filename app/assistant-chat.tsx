"use client";

import { useCallback, useEffect, useState } from "react";
import { localApiFetch } from "./local-api";

type Assistant = { displayName: string; role: "editor"; status: "active" | "inactive" };
type Member = { userEmail: string; displayName?: string | null };
type Message = { id: string; memberEmail: string; senderType: "member" | "assistant"; body: string; status: "pending" | "processed" | "failed"; createdAt: string };
type ChatData = { assistant: Assistant | null; messages: Message[]; members: Member[]; currentEmail: string; selectedMember: string; manager: boolean };

function memberName(member: Member) {
  return member.displayName?.trim() || member.userEmail.split("@")[0];
}

export default function AssistantChat({ groupId, manager = false }: { groupId: string; manager?: boolean }) {
  const [data, setData] = useState<ChatData | null>(null);
  const [selectedMember, setSelectedMember] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async (member?: string) => {
    const query = member ? `?member=${encodeURIComponent(member)}` : "";
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
    const response = await localApiFetch(`/api/groups/${groupId}/assistant`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: message }) });
    const result = await response.json().catch(() => ({})) as { error?: string };
    setNotice(response.ok ? "KINBANアシスタントへ送りました。AI接続後に順次確認します。" : result.error ?? "送信できませんでした");
    if (response.ok) { setMessage(""); await load(); }
    setSending(false);
  }

  if (!data) return <p className="empty-state">KINBANアシスタントを読み込んでいます…</p>;
  const active = data.assistant?.status === "active";
  const viewingOwnChat = selectedMember === data.currentEmail;

  return <section className="assistant-chat">
    <div className="assistant-profile">
      <div className="assistant-avatar" aria-hidden="true">AI</div>
      <div><strong>KINBANアシスタント</strong><p>シフトや勤怠について相談できるAIです。必要に応じて管理者へ引き継ぎます。</p></div>
      <span className={`assistant-state ${active ? "active" : "inactive"}`}>{active ? "受付中" : "停止中"}</span>
    </div>
    {manager && data.members.length > 0 && <label className="assistant-member-select">確認するメンバー
      <select value={selectedMember} onChange={(event) => { setSelectedMember(event.target.value); void load(event.target.value); }}>
        {data.members.map((member) => <option key={member.userEmail} value={member.userEmail}>{memberName(member)}{member.userEmail === data.currentEmail ? "（自分）" : ""}</option>)}
      </select>
    </label>}
    {manager && !viewingOwnChat && <p className="assistant-manager-note">管理者として会話履歴を確認しています。メンバー本人の会話には送信できません。</p>}
    <div className="assistant-messages" aria-live="polite">
      {data.messages.length ? data.messages.map((item) => <div className={`assistant-message ${item.senderType}`} key={item.id}>
        <strong>{item.senderType === "assistant" ? "KINBANアシスタント" : item.memberEmail === data.currentEmail ? "あなた" : item.memberEmail.split("@")[0]}</strong>
        <p>{item.body}</p>
        <small>{item.createdAt}{item.senderType === "member" && item.status === "pending" ? "・AI確認待ち" : ""}</small>
      </div>) : <p className="empty-state">まだ会話はありません。シフトや勤怠についてメッセージを送れます。</p>}
    </div>
    {active && viewingOwnChat ? <form className="assistant-composer" onSubmit={send}>
      <textarea rows={3} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} placeholder="例：今日のシフトに行けなくなりました" />
      <button className="primary-button" disabled={!message.trim() || sending}>{sending ? "送信中…" : "送信"}</button>
    </form> : !active ? <p className="assistant-disabled">KINBANアシスタントは管理者により停止されています。過去の会話は引き続き確認できます。</p> : null}
    {notice && <p className="group-notice" role="status">{notice}</p>}
  </section>;
}
