"use client";

import { useEffect, useState } from "react";
import { getLocalUserId, localApiFetch, setLocalUserId } from "./local-api";

type Group = {
  id: string;
  name: string;
  description: string;
  ownerEmail: string;
  membership: { role: string; showInPersonal: boolean };
  pendingJoin?: boolean;
};
type MemberPreference = { minDays: number; maxDays: number; minHours: number; maxHours: number; freeComment?: string | null };
type Availability = { dayOfWeek: number; status: string; startTime: string; endTime: string };
type Member = { userEmail: string; displayName?: string | null; adminNote?: string | null; role: string; status: "active" | "inactive"; showInPersonal: boolean; preference?: MemberPreference | null; availability?: Availability[] };
type Assistant = { displayName: string; role: "editor"; status: "active" | "inactive" };
type GroupDetail = { currentEmail: string; group: Group; membership: { role: string; showInPersonal: boolean }; members: Member[]; requests: Array<{ id: string; userEmail: string; status: string }>; assistant: Assistant | null };

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];
const preferenceStatusLabels: Record<string, string> = { want: "出勤希望", possible: "可能", off: "休み希望", unavailable: "勤務不可" };
const roleLabels: Record<string, string> = { owner: "代表管理者", editor: "管理者", member: "メンバー" };

function formatAvailability(member: Member) {
  if (!member.availability?.length) return "曜日別の希望設定なし（基本設定を適用）";
  return member.availability.map((entry) => {
    const time = entry.startTime && entry.endTime ? `${entry.startTime}〜${entry.endTime}` : "終日";
    return `${weekdayLabels[entry.dayOfWeek]}: ${time} ${preferenceStatusLabels[entry.status] ?? entry.status}`;
  }).join("　");
}

export default function GroupsPanel({ onChanged, initialGroupId }: { onChanged: () => void; initialGroupId?: string }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<GroupDetail | null>(null);
  const [name, setName] = useState("");
  const [joinId, setJoinId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [userId, setUserId] = useState(getLocalUserId());
  const [memberQuery, setMemberQuery] = useState("");

  async function loadGroups() {
    const response = await localApiFetch("/api/groups");
    if (response.ok) setGroups((await response.json() as { groups: Group[] }).groups);
  }
  useEffect(() => { const timer = window.setTimeout(() => void loadGroups(), 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { const group = groups.find((item) => item.id === initialGroupId); if (group) void openGroup(group); }, [groups, initialGroupId]);
  async function openGroup(group: Group) {
    const response = await localApiFetch(`/api/groups/${group.id}`);
    if (response.ok) setSelected(await response.json() as GroupDetail);
  }
  async function createGroup(event: React.FormEvent) {
    event.preventDefault();
    const response = await localApiFetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (!response.ok) return setNotice("グループを作成できませんでした");
    setName(""); setNotice("グループを作成しました"); await loadGroups(); onChanged();
  }
  async function joinGroup(event: React.FormEvent) {
    event.preventDefault();
    const response = await localApiFetch(`/api/groups/${joinId}/join`, { method: "POST" });
    setNotice(response.ok ? "参加申請を送りました" : ((await response.json().catch(() => ({})) as { error?: string }).error ?? "参加申請に失敗しました"));
    setJoinId(""); await loadGroups();
  }
  async function updateMember(body: { userEmail: string; role?: string; status?: "active" | "inactive"; adminNote?: string }) {
    if (!selected) return;
    const response = await localApiFetch(`/api/groups/${selected.group.id}/members`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) return setNotice(((await response.json().catch(() => ({})) as { error?: string }).error) ?? "メンバー情報を保存できませんでした");
    setNotice("保存しました"); await openGroup(selected.group); await loadGroups(); onChanged();
  }
  async function changeStatus(member: Member) {
    const inactive = member.status !== "inactive";
    const message = inactive
      ? `「${member.displayName?.trim() || member.userEmail}」を利用停止にしますか？\n基本設定は残りますが、割り当て済みシフトから外れ、勤務希望・お知らせの対象外になります。`
      : `「${member.displayName?.trim() || member.userEmail}」を有効化しますか？`;
    if (!window.confirm(message)) return;
    await updateMember({ userEmail: member.userEmail, status: inactive ? "inactive" : "active" });
  }
  async function changeAssistantStatus() {
    if (!selected?.assistant) return;
    const inactive = selected.assistant.status === "active";
    if (!window.confirm(`KINBANアシスタントを${inactive ? "停止" : "再開"}しますか？${inactive ? "\n過去の会話は残りますが、メンバーは新しいメッセージを送れなくなります。" : ""}`)) return;
    const response = await localApiFetch(`/api/groups/${selected.group.id}/assistant`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: inactive ? "inactive" : "active" }) });
    setNotice(response.ok ? `KINBANアシスタントを${inactive ? "停止" : "再開"}しました` : "KINBANアシスタントの状態を変更できませんでした");
    if (response.ok) await openGroup(selected.group);
  }
  async function removeMember(member: Member) {
    if (!window.confirm(`「${member.displayName?.trim() || member.userEmail}」をメンバーから完全に削除しますか？\n基本設定・勤務希望も削除され、元に戻せません。`)) return;
    if (!selected) return;
    const response = await localApiFetch(`/api/groups/${selected.group.id}/members`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userEmail: member.userEmail }) });
    if (!response.ok) return setNotice(((await response.json().catch(() => ({})) as { error?: string }).error) ?? "メンバーを削除できませんでした");
    setNotice("メンバーを削除しました"); await openGroup(selected.group); await loadGroups(); onChanged();
  }
  async function handleRequest(requestId: string, action: "approve" | "reject") {
    if (!selected) return;
    await localApiFetch(`/api/groups/${selected.group.id}/requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, action }) });
    await openGroup(selected.group); await loadGroups(); onChanged();
  }
  async function deleteGroup() {
    if (!selected || selected.membership.role !== "owner" || !window.confirm("グループを削除しますか？予定やメンバー情報も削除されます。")) return;
    const response = await localApiFetch(`/api/groups/${selected.group.id}`, { method: "DELETE" });
    setNotice(response.ok ? "グループを削除しました" : "グループを削除できませんでした"); setSelected(null); await loadGroups(); onChanged();
  }
  const isAdmin = selected?.membership.role === "owner" || selected?.membership.role === "editor";
  const filteredMembers = selected?.members.filter((member) => {
    const query = memberQuery.trim().toLocaleLowerCase();
    if (!query) return true;
    return [member.displayName ?? "", member.userEmail].some((value) => value.toLocaleLowerCase().includes(query));
  }) ?? [];

  return <section className="groups-card">
    {!initialGroupId && <>
      <div className="groups-head"><div><p className="eyebrow">GROUP CALENDARS</p><h2>グループ管理</h2><p>グループの予定とメンバーを管理します。</p></div><span className="group-user">{userId}</span></div>
      {process.env.NEXT_PUBLIC_LOCAL_MODE === "true" && <div className="local-user-switch"><label>開発ユーザー<input value={userId} onChange={(event) => { setUserId(event.target.value); setLocalUserId(event.target.value); }} onBlur={() => { void loadGroups(); onChanged(); }} /></label><small>認証なしのローカルテスト用です。</small></div>}
      <div className="group-actions"><form onSubmit={createGroup}><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="新しいグループ名" /><button className="primary-button">グループを作成</button></form><form onSubmit={joinGroup}><input required value={joinId} onChange={(event) => setJoinId(event.target.value)} placeholder="グループIDで参加申請" /><button className="ghost-button">参加申請</button></form></div>
      {notice && <p className="group-notice" role="status">{notice}</p>}
      <div className="group-list">{groups.length ? groups.map((group) => <article className="group-item" key={group.id}><div><strong>{group.name}</strong><small>ID: {group.id}</small><span>{roleLabels[group.membership.role] ?? group.membership.role}</span></div>{group.pendingJoin ? <em>承認待ち</em> : <button className="ghost-button" onClick={() => void openGroup(group)}>詳細</button>}</article>) : <p className="group-empty">参加しているグループはありません。</p>}</div>
    </>}
    {selected && <div className="group-detail">
      <div className="modal-head"><div><p className="eyebrow">GROUP</p><h3>メンバー管理（{selected.group.name}）</h3><small>{selected.group.id}</small></div></div>
      {selected.membership.role === "owner" && selected.requests.filter((request) => request.status === "pending").length > 0 && <><h4>参加申請</h4>{selected.requests.filter((request) => request.status === "pending").map((request) => <div className="member-row" key={request.id}><span>{request.userEmail}</span><span><button className="small-action" onClick={() => void handleRequest(request.id, "approve")}>承認</button><button className="small-action danger" onClick={() => void handleRequest(request.id, "reject")}>却下</button></span></div>)}</>}
      <div className="member-search"><input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="氏名・メールで検索" aria-label="メンバー検索" /><small>{filteredMembers.length}/{selected.members.length}人</small></div>
      <h4>メンバー</h4><div className="member-cards">{filteredMembers.map((member) => <article className={`member-card ${member.status === "inactive" ? "is-inactive" : ""}`} key={member.userEmail}>
        <div className="member-card-head"><div><strong>{member.displayName?.trim() || member.userEmail.split("@")[0]}</strong><small>{member.userEmail}</small></div><div className="member-card-badges">{member.status === "inactive" && <span className="member-status-badge inactive">利用停止</span>}{isAdmin && member.userEmail !== selected.group.ownerEmail && member.userEmail !== selected.currentEmail && <select className="member-role-select" value={member.role} onChange={(event) => void updateMember({ userEmail: member.userEmail, role: event.target.value })} aria-label={`${member.displayName?.trim() || member.userEmail}の権限`}><option value="member">メンバー</option><option value="editor">管理者</option></select>}</div></div>
        <div className="member-preference"><div><b>希望日数</b><span>{member.preference ? `${member.preference.minDays}〜${member.preference.maxDays}日／週` : "未設定"}</span></div><div><b>希望時間</b><span>{member.preference ? `${member.preference.minHours}〜${member.preference.maxHours}時間／週` : "未設定"}</span></div></div>
        <div className="member-availability"><b>曜日別の希望</b><p>{formatAvailability(member)}</p></div>{member.preference?.freeComment && <div className="member-free-comment"><b>本人のフリーコメント</b><p>{member.preference.freeComment}</p></div>}
        {isAdmin && <label className="member-admin-note-field">管理者メモ<textarea defaultValue={member.adminNote ?? ""} placeholder="気を付けることなど" rows={2} onBlur={(event) => { const value = event.currentTarget.value.trim(); if (value !== (member.adminNote ?? "")) void updateMember({ userEmail: member.userEmail, adminNote: value }); }} /></label>}
        {isAdmin && member.role !== "owner" && member.userEmail !== selected.currentEmail && <div className="member-admin-actions"><button className="small-action" onClick={() => void changeStatus(member)}>{member.status === "inactive" ? "有効化" : "利用停止"}</button><button className="small-action danger" onClick={() => void removeMember(member)}>メンバーを削除</button></div>}
      </article>)}</div>
      {selected.assistant && <><h4>運営支援AI</h4><article className={`member-card assistant-member-card ${selected.assistant.status === "inactive" ? "is-inactive" : ""}`}>
        <div className="member-card-head"><div><strong>{selected.assistant.displayName}</strong><small>システムメンバー・シフト割当対象外</small></div><div className="member-card-badges"><span className="member-role-badge">管理者</span>{selected.assistant.status === "inactive" && <span className="member-status-badge inactive">利用停止</span>}</div></div>
        <p className="assistant-member-description">メンバーからのシフト・勤怠相談を受け付けます。AIが接続されていない間もメッセージは保持されます。</p>
        {isAdmin && <div className="member-admin-actions"><button className="small-action" onClick={() => void changeAssistantStatus()}>{selected.assistant.status === "inactive" ? "再開" : "利用停止"}</button></div>}
      </article></>}
      {!isAdmin && <p className="member-privacy-note">他のメンバーの勤務希望は表示せず、本人の情報だけ確認できます。</p>}
      <div className="group-detail-actions">{selected.membership.role === "owner" && <button className="small-action danger" onClick={() => void deleteGroup()}>グループを削除</button>}</div>
    </div>}
  </section>;
}
