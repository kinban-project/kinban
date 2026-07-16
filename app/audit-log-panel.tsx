"use client";

import { useEffect, useMemo, useState } from "react";
import { localApiFetch } from "./local-api";

type Log = { id: string; userEmail: string; action: string; entityType: string; summary: string; createdAt: string };
type Member = { userEmail: string; displayName?: string | null };

const actionLabels: Record<string, string> = {
  "announcement.create": "お知らせ作成", "announcement.read": "お知らせ既読", "announcement.reply": "お知らせ返信", "announcement.contact": "管理者への連絡",
  "group.create": "グループ作成", "group.join": "参加申請", "group.member": "メンバー変更", "group.request": "参加申請処理",
  "shift.create": "シフト作成", "shift.update": "シフト変更", "shift.delete": "シフト削除", "shift.assign": "担当割当", "shift.publish": "シフト公開",
  "shift.request": "勤務希望更新", "profile.update": "アカウント設定",
};

export default function AuditLogPanel({ groupId }: { groupId: string }) {
  const [logs, setLogs] = useState<Log[]>([]); const [members, setMembers] = useState<Member[]>([]); const [action, setAction] = useState(""); const [userEmail, setUserEmail] = useState(""); const [search, setSearch] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const nameMap = useMemo(() => new Map(members.map((member) => [member.userEmail, member.displayName?.trim() || member.userEmail.split("@")[0]])), [members]);
  async function load() { setBusy(true); const params = new URLSearchParams(); if (action) params.set("action", action); if (userEmail) params.set("userEmail", userEmail); if (search) params.set("search", search); if (from) params.set("from", from); if (to) params.set("to", to); const response = await localApiFetch(`/api/groups/${groupId}/audit-logs?${params}`); if (response.ok) { const data = await response.json() as { logs: Log[]; members: Member[] }; setLogs(data.logs); setMembers(data.members); setNotice(""); } else setNotice("操作ログを取得できませんでした"); setBusy(false); }
  useEffect(() => { void load(); }, [groupId]);
  const actionOptions = [...new Set(logs.map((log) => log.action))].sort();
  return <section className="audit-panel"><div className="modal-head"><div><p className="eyebrow">AUDIT LOG</p><h2>操作ログ・変更履歴</h2></div></div><form className="audit-filters" onSubmit={(event) => { event.preventDefault(); void load(); }}><label>期間（開始）<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>期間（終了）<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><label>実行者<select value={userEmail} onChange={(event) => setUserEmail(event.target.value)}><option value="">すべて</option>{members.map((member) => <option key={member.userEmail} value={member.userEmail}>{nameMap.get(member.userEmail)}</option>)}</select></label><label>操作<select value={action} onChange={(event) => setAction(event.target.value)}><option value="">すべて</option>{actionOptions.map((value) => <option key={value} value={value}>{actionLabels[value] ?? value}</option>)}</select></label><label className="audit-search">内容検索<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="概要で検索" /></label><button className="primary-button" disabled={busy}>{busy ? "検索中…" : "絞り込む"}</button></form>{notice && <p className="group-notice">{notice}</p>}<div className="audit-table-wrap"><table className="audit-table"><thead><tr><th>日時</th><th>実行者</th><th>操作</th><th>内容</th></tr></thead><tbody>{logs.length ? logs.map((log) => <tr key={log.id}><td>{new Date(log.createdAt).toLocaleString("ja-JP")}</td><td>{nameMap.get(log.userEmail) ?? log.userEmail.split("@")[0]}</td><td>{actionLabels[log.action] ?? log.action}</td><td>{log.summary}</td></tr>) : <tr><td colSpan={4}>該当する操作ログはありません。</td></tr>}</tbody></table></div><p className="shift-help">表示上限は最新300件です。</p></section>;
}
