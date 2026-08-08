"use client";

import { useEffect, useState } from "react";
import { localApiFetch } from "./local-api";
import { formatDateTime } from "./format-date";

type Announcement = { id: string; title: string; body: string; createdBy: string; createdAt: string; notificationLevel?: "normal" | "important" | "urgent"; category?: string };
type Reply = { id: string; announcementId: string; userEmail: string; body: string; createdAt: string };
type Member = { userEmail: string; displayName?: string | null };
type ReadDetail = { announcementId: string; userEmail: string; readAt: string };
type Props = { groupId: string; manager?: boolean };

export default function AnnouncementsPanel({ groupId, manager = false }: Props) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [reads, setReads] = useState<string[]>([]);
  const [readDetails, setReadDetails] = useState<ReadDetail[]>([]);
  const [selectedGroupName, setSelectedGroupName] = useState("");
  const [expandedReads, setExpandedReads] = useState<Record<string, boolean>>({});
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [notificationLevel, setNotificationLevel] = useState<"normal" | "important" | "urgent">("normal");
  const [reply, setReply] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");

  async function load() {
    const [response, groupResponse] = await Promise.all([
      localApiFetch(`/api/groups/${groupId}/announcements`),
      localApiFetch(`/api/groups/${groupId}`),
    ]);
    if (groupResponse.ok) {
      const groupData = await groupResponse.json() as { group?: { name?: string } };
      setSelectedGroupName(groupData.group?.name ?? "");
    }
    if (!response.ok) return;
    const data = await response.json() as { announcements: Announcement[]; replies: Reply[]; reads: Array<{ announcementId: string }>; readDetails?: ReadDetail[]; members?: Member[] };
    const nextMembers = data.members ?? [];
    setItems(data.announcements);
    setReplies(data.replies);
    setMembers(nextMembers);
    setMemberNames(Object.fromEntries(nextMembers.map((member) => [member.userEmail, member.displayName?.trim() || member.userEmail.split("@")[0]])));
    setReads(data.reads.map((row) => row.announcementId));
    setReadDetails(data.readDetails ?? []);
  }

  async function removeAnnouncement(item: Announcement) {
    if (!window.confirm(`「${item.title}」を削除しますか？\n返信と既読情報も削除されます。`)) return;
    const response = await localApiFetch(`/api/groups/${groupId}/announcements?announcementId=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    setNotice(response.ok ? "お知らせを削除しました。" : "お知らせを削除できませんでした。");
    if (response.ok) await load();
  }

  useEffect(() => { void load(); }, [groupId]);
  async function post(action: string, announcementId?: string, text?: string) {
    const response = await localApiFetch(`/api/groups/${groupId}/announcements`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, announcementId, title, body: text ?? body, notificationLevel }) });
    setNotice(response.ok ? "保存しました" : "保存できませんでした");
    if (response.ok) { setTitle(""); setBody(""); if (announcementId) setReply((current) => ({ ...current, [announcementId]: "" })); await load(); }
  }

  return <div className="announcements-panel">
    <div className="modal-head"><div><p className="eyebrow">MESSAGES</p><h2>お知らせ{selectedGroupName ? `（${selectedGroupName}）` : ""}</h2></div></div>
    <>
    {manager && <form className="announcement-create" onSubmit={(event) => { event.preventDefault(); void post("create"); }}><input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="タイトル" /><textarea required rows={3} value={body} onChange={(event) => setBody(event.target.value)} placeholder="メンバーへのお知らせ" /><label>通知レベル<select value={notificationLevel} onChange={(event) => setNotificationLevel(event.target.value as "normal" | "important" | "urgent")}><option value="normal">通常（アプリ内のみ）</option><option value="important">重要（アプリ内のみ）</option><option value="urgent">緊急（Web Push）</option></select></label><button className="primary-button">お知らせを作成</button></form>}
    <div className="announcement-list">
      {items.length ? items.map((item) => {
        const readCount = new Set(readDetails.filter((row) => row.announcementId === item.id).map((row) => row.userEmail)).size;
        const unreadMembers = members.filter((member) => !readDetails.some((row) => row.announcementId === item.id && row.userEmail === member.userEmail));
        return <article className="announcement-item" key={item.id}>
          <div className="announcement-head"><strong>{item.title}</strong>{item.notificationLevel === "urgent" && <span className="announcement-read-summary">緊急</span>}<small>{formatDateTime(item.createdAt)}</small>{manager && <><span className="announcement-read-summary">既読 {readCount}/{members.length}</span><button className="small-action" onClick={() => setExpandedReads((current) => ({ ...current, [item.id]: !current[item.id] }))}>{expandedReads[item.id] ? "詳細を隠す" : "未読者を表示"}</button><button className="small-action danger" onClick={() => void removeAnnouncement(item)}>削除</button></>}{!manager && !reads.includes(item.id) && <button className="small-action" onClick={() => void post("read", item.id)}>既読にする</button>}</div>
          <p>{item.body}</p>
          {manager && expandedReads[item.id] && <div className="announcement-read-detail"><strong>未読者（{unreadMembers.length}人）</strong>{unreadMembers.length ? <div>{unreadMembers.map((member) => <span key={member.userEmail}>{memberNames[member.userEmail] ?? member.userEmail.split("@")[0]}</span>)}</div> : <p>全員が既読です。</p>}</div>}
          <div className="announcement-replies">{replies.filter((row) => row.announcementId === item.id).map((row) => <div key={row.id}><strong>{memberNames[row.userEmail] ?? row.userEmail.split("@")[0]}</strong><span>{row.body}</span></div>)}</div>
          <div className="announcement-reply"><input value={reply[item.id] ?? ""} onChange={(event) => setReply((current) => ({ ...current, [item.id]: event.target.value }))} placeholder={manager ? "返信・補足" : "返信・連絡"} /><button className="small-action" disabled={!reply[item.id]?.trim()} onClick={() => void post(manager ? "reply" : "contact", item.id, reply[item.id])}>{manager ? "返信" : "送信"}</button></div>
        </article>;
      }) : <p className="empty-state">お知らせはありません。</p>}
    </div>
    {notice && <p className="group-notice">{notice}</p>}
    </>
  </div>;
}
