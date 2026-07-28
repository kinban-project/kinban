"use client";

import { useEffect, useState } from "react";
import { getLocalUserId, localApiFetch, setLocalUserId } from "./local-api";
import AssistantAccessPanel from "./assistant-access-panel";

type Group = {
  id: string;
  name: string;
  description: string;
  ownerEmail: string;
  autoBreakSuggestion?: boolean;
  laborPlannedBreakWarning?: boolean;
  laborDailyHoursWarning?: boolean;
  laborWeeklyHoursWarning?: boolean;
  laborRestIntervalWarning?: boolean;
  laborConsecutiveDaysWarning?: boolean;
  laborWeeklyRestWarning?: boolean;
  laborDailyHoursLimitMinutes?: number;
  laborWeeklyHoursLimitMinutes?: number;
  laborRestIntervalMinutes?: number;
  laborConsecutiveDaysLimit?: number;
  laborWeeklyRestDaysRequired?: number;
  laborFourWeekRestDaysRequired?: number;
  membership: { role: string; showInPersonal: boolean };
  pendingJoin?: boolean;
};
type MemberPreference = { minDays: number; maxDays: number; minHours: number; maxHours: number; freeComment?: string | null };
type Availability = { dayOfWeek: number; status: string; startTime: string; endTime: string };
type Member = { userEmail: string; displayName?: string | null; adminNote?: string | null; role: string; status: "active" | "inactive"; showInPersonal: boolean; preference?: MemberPreference | null; availability?: Availability[] };
type Assistant = {
  displayName: string;
  role: "editor";
  status: "active" | "inactive";
  canCreateShifts: boolean;
  canPublishShifts: boolean;
  canReviewDailyWork: boolean;
  canReviewMonthlyWork: boolean;
  canCreateAnnouncements: boolean;
};
type GroupInvitation = { id: string; inviteeEmail: string; status: string; expiresAt: string };
type PendingInvitation = GroupInvitation & { groupId: string; group: Group | null };
type GroupDetail = { currentEmail: string; group: Group; membership: { role: string; showInPersonal: boolean }; members: Member[]; requests: Array<{ id: string; userEmail: string; status: string }>; invitations?: GroupInvitation[]; assistant: Assistant | null };

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
  const [inviteEmail, setInviteEmail] = useState("");
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);

  async function loadGroups() {
    const response = await localApiFetch("/api/groups");
    if (response.ok) {
      const data = await response.json() as { groups: Group[]; pendingInvitations?: PendingInvitation[] };
      setGroups(data.groups);
      setPendingInvitations(data.pendingInvitations ?? []);
    }
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
  async function acceptInvitation(invitation: PendingInvitation) {
    const response = await localApiFetch(`/api/groups/${invitation.groupId}/invitations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept" }) });
    setNotice(response.ok ? "グループ招待を承認しました" : ((await response.json().catch(() => ({})) as { error?: string }).error ?? "グループ招待を承認できませんでした"));
    if (response.ok) { await loadGroups(); onChanged(); }
  }
  async function inviteMember(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !inviteEmail.trim()) return;
    const response = await localApiFetch(`/api/groups/${selected.group.id}/invitations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail.trim() }) });
    const data = await response.json().catch(() => ({})) as { error?: string };
    setNotice(response.ok ? "グループ招待を作成しました" : (data.error ?? "グループ招待を作成できませんでした"));
    if (response.ok) { setInviteEmail(""); await openGroup(selected.group); }
  }
  async function revokeInvitation(invitationId: string) {
    if (!selected || !window.confirm("この招待を取り消しますか？")) return;
    const response = await localApiFetch(`/api/groups/${selected.group.id}/invitations`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invitationId }) });
    if (response.ok) await openGroup(selected.group);
  }
  async function updateMember(body: { userEmail: string; role?: string; status?: "active" | "inactive"; adminNote?: string }) {
    if (!selected) return;
    const response = await localApiFetch(`/api/groups/${selected.group.id}/members`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) return setNotice(((await response.json().catch(() => ({})) as { error?: string }).error) ?? "メンバー情報を保存できませんでした");
    setNotice("保存しました"); await openGroup(selected.group); await loadGroups(); onChanged();
  }
  async function updateGroupRules(patch: Record<string, boolean | number>) {
    if (!selected) return;
    const response = await localApiFetch(`/api/groups/${selected.group.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await response.json().catch(() => ({})) as { error?: string; group?: Group };
    if (!response.ok) {
      setNotice(data.error ?? "シフト・勤怠ルールを保存できませんでした");
      return;
    }
    setSelected((current) => current ? {
      ...current,
      group: { ...current.group, ...(data.group ?? patch) },
    } : current);
    setNotice("シフト・勤怠ルールを保存しました");
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
  async function updateAssistantPermissions(patch: Partial<Pick<Assistant, "canCreateShifts" | "canPublishShifts" | "canReviewDailyWork" | "canReviewMonthlyWork" | "canCreateAnnouncements">>) {
    if (!selected?.assistant) return;
    const response = await localApiFetch(`/api/groups/${selected.group.id}/assistant`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions: patch }) });
    const data = await response.json().catch(() => ({})) as { assistant?: Assistant; error?: string };
    if (!response.ok || !data.assistant) { setNotice(data.error ?? "AIアシスタントの権限を変更できませんでした"); return; }
    setSelected((current) => current ? { ...current, assistant: data.assistant } : current);
    setNotice("AIアシスタントの実行権限を更新しました");
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
      {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && <div className="local-user-switch"><label>デモユーザー<input value={userId} onChange={(event) => { setUserId(event.target.value); setLocalUserId(event.target.value); }} onBlur={() => { void loadGroups(); onChanged(); }} /></label><small>体験版のユーザー切替です。</small></div>}
      {pendingInvitations.length > 0 && <section className="group-invitation-panel pending-group-invitations"><h4>グループ招待</h4>{pendingInvitations.map((invitation) => <div className="group-invitation-row" key={invitation.id}><span>{invitation.group?.name ?? invitation.groupId}</span><small>招待の有効期限: {invitation.expiresAt.slice(0, 10)}</small><button className="small-action" type="button" onClick={() => void acceptInvitation(invitation)}>承認</button></div>)}</section>}
      <div className="group-actions"><form onSubmit={createGroup}><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="新しいグループ名" /><button className="primary-button">グループを作成</button></form><form onSubmit={joinGroup}><input required value={joinId} onChange={(event) => setJoinId(event.target.value)} placeholder="グループIDで参加申請" /><button className="ghost-button">参加申請</button></form></div>
      {notice && <p className="group-notice" role="status">{notice}</p>}
      <div className="group-list">{groups.length ? groups.map((group) => <article className="group-item" key={group.id}><div><strong>{group.name}</strong><small>ID: {group.id}</small><span>{roleLabels[group.membership.role] ?? group.membership.role}</span></div>{group.pendingJoin ? <em>承認待ち</em> : <button className="ghost-button" onClick={() => void openGroup(group)}>詳細</button>}</article>) : <p className="group-empty">参加しているグループはありません。</p>}</div>
    </>}
    {selected && <div className="group-detail">
      <div className="modal-head"><div><p className="eyebrow">GROUP MANAGEMENT</p><h3>グループ管理（{selected.group.name}）</h3><small>メンバー・シフト／勤怠ルール・運営支援AIを管理します。　{selected.group.id}</small></div></div>
      <div className="member-search"><input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="氏名・メールで検索" aria-label="メンバー検索" /><small>{filteredMembers.length}/{selected.members.length}人</small></div>
      <h4>メンバー</h4><div className="member-cards">{filteredMembers.map((member) => <article className={`member-card ${member.status === "inactive" ? "is-inactive" : ""}`} key={member.userEmail}>
        <div className="member-card-head"><div><strong>{member.displayName?.trim() || member.userEmail.split("@")[0]}</strong><small>{member.userEmail}</small></div><div className="member-card-badges">{member.status === "inactive" && <span className="member-status-badge inactive">利用停止</span>}{isAdmin && member.userEmail !== selected.group.ownerEmail && member.userEmail !== selected.currentEmail && <select className="member-role-select" value={member.role} onChange={(event) => void updateMember({ userEmail: member.userEmail, role: event.target.value })} aria-label={`${member.displayName?.trim() || member.userEmail}の権限`}><option value="member">メンバー</option><option value="editor">管理者</option></select>}</div></div>
        <div className="member-preference"><div><b>希望日数</b><span>{member.preference ? `${member.preference.minDays}〜${member.preference.maxDays}日／週` : "未設定"}</span></div><div><b>希望時間</b><span>{member.preference ? `${member.preference.minHours}〜${member.preference.maxHours}時間／週` : "未設定"}</span></div></div>
        <div className="member-availability"><b>曜日別の希望</b><p>{formatAvailability(member)}</p></div>{member.preference?.freeComment && <div className="member-free-comment"><b>本人のフリーコメント</b><p>{member.preference.freeComment}</p></div>}
        {isAdmin && <label className="member-admin-note-field">管理者メモ<textarea defaultValue={member.adminNote ?? ""} placeholder="気を付けることなど" rows={2} onBlur={(event) => { const value = event.currentTarget.value.trim(); if (value !== (member.adminNote ?? "")) void updateMember({ userEmail: member.userEmail, adminNote: value }); }} /></label>}
        {isAdmin && member.role !== "owner" && member.userEmail !== selected.currentEmail && <div className="member-admin-actions"><button className="small-action" onClick={() => void changeStatus(member)}>{member.status === "inactive" ? "有効化" : "利用停止"}</button><button className="small-action danger" onClick={() => void removeMember(member)}>メンバーを削除</button></div>}
      </article>)}</div>
      {isAdmin && <section className="group-invitation-panel">
        <h4>メンバーを招待</h4>
        <form className="group-invitation-form" onSubmit={inviteMember}>
          <input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="サイト利用者のメールアドレス" />
          <button className="small-action" type="submit">招待</button>
        </form>
        {(selected.invitations ?? []).filter((invitation) => invitation.status === "pending").map((invitation) => <div className="group-invitation-row" key={invitation.id}><span>{invitation.inviteeEmail}</span><button className="small-action danger" type="button" onClick={() => void revokeInvitation(invitation.id)}>取消</button></div>)}
      </section>}
      {selected.membership.role === "owner" && selected.requests.filter((request) => request.status === "pending").length > 0 && <><h4>参加申請</h4>{selected.requests.filter((request) => request.status === "pending").map((request) => <div className="member-row" key={request.id}><span>{request.userEmail}</span><span><button className="small-action" onClick={() => void handleRequest(request.id, "approve")}>承認</button><button className="small-action danger" onClick={() => void handleRequest(request.id, "reject")}>却下</button></span></div>)}</>}
      {selected.assistant && <><h4>運営支援AI</h4><article className={`member-card assistant-member-card ${selected.assistant.status === "inactive" ? "is-inactive" : ""}`}>
        <div className="member-card-head"><div><strong>{selected.assistant.displayName}</strong><small>システムメンバー・シフト割当対象外</small></div><div className="member-card-badges"><span className="member-role-badge">管理者</span>{selected.assistant.status === "inactive" && <span className="member-status-badge inactive">利用停止</span>}</div></div>
        <p className="assistant-member-description">メンバーからのシフト・勤怠相談を受け付けます。管理者の直接指示、またはclaimした管理者メッセージに対して、下で有効にした操作を実行できます。</p>
        {isAdmin && <fieldset className="assistant-permissions"><legend>管理者の指示から実行できる操作</legend>{([
          ["canCreateShifts", "シフト作成（割当下書きを含む）"],
          ["canPublishShifts", "シフト公開"],
          ["canReviewDailyWork", "勤怠承認／差戻し（日次）"],
          ["canReviewMonthlyWork", "勤怠承認／差戻し（月次）"],
          ["canCreateAnnouncements", "お知らせ配信"],
        ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={selected.assistant[key]} onChange={(event) => void updateAssistantPermissions({ [key]: event.target.checked })} />{label}</label>)}</fieldset>}
        {isAdmin && <div className="member-admin-actions"><button className="small-action" onClick={() => void changeAssistantStatus()}>{selected.assistant.status === "inactive" ? "再開" : "利用停止"}</button></div>}
      </article></>}
      {selected.assistant && isAdmin && <AssistantAccessPanel groupId={selected.group.id} />}
      {isAdmin && <section className="group-rules-panel">
        <h4>シフト・勤怠ルール</h4>
        <label className="group-setting-toggle">
          <input type="checkbox" checked={selected.group.autoBreakSuggestion !== false} onChange={(event) => void updateGroupRules({ autoBreakSuggestion: event.target.checked })} />
          <span><strong>予定休憩を自動設定する</strong><small>同じ日の連続した勤務枠を勤務ブロックとして集計し、6時間を超える場合は45分、8時間を超える場合は60分の予定休憩を自動設定します。</small></span>
        </label>
        <div className="labor-rule-settings">
          <p className="labor-rule-caption">労務注意（個別に有効化できます。注意表示のみで、保存・公開は止めません）</p>
          {([
            ["laborPlannedBreakWarning", "予定休憩の確認", selected.group.laborPlannedBreakWarning !== false],
            ["laborDailyHoursWarning", "1日の実働上限", selected.group.laborDailyHoursWarning !== false],
            ["laborWeeklyHoursWarning", "週の実働上限", selected.group.laborWeeklyHoursWarning !== false],
            ["laborRestIntervalWarning", "勤務間インターバル", selected.group.laborRestIntervalWarning !== false],
            ["laborConsecutiveDaysWarning", "連続勤務日数", selected.group.laborConsecutiveDaysWarning !== false],
            ["laborWeeklyRestWarning", "休日数", selected.group.laborWeeklyRestWarning !== false],
          ] as const).map(([key, label, checked]) => <label className="labor-rule-toggle" key={key}>
            <input type="checkbox" checked={checked} onChange={(event) => void updateGroupRules({ [key]: event.target.checked })} />
            <span>{label}</span>
          </label>)}
          <div className="labor-rule-values">
            <label>1日上限<input type="number" min="1" value={Math.round((selected.group.laborDailyHoursLimitMinutes ?? 480) / 60)} onChange={(event) => setSelected((current) => current ? { ...current, group: { ...current.group, laborDailyHoursLimitMinutes: Number(event.target.value) * 60 } } : current)} onBlur={(event) => void updateGroupRules({ laborDailyHoursLimitMinutes: Number(event.currentTarget.value) * 60 })} /><span>時間</span></label>
            <label>週上限<input type="number" min="1" value={Math.round((selected.group.laborWeeklyHoursLimitMinutes ?? 2400) / 60)} onChange={(event) => setSelected((current) => current ? { ...current, group: { ...current.group, laborWeeklyHoursLimitMinutes: Number(event.target.value) * 60 } } : current)} onBlur={(event) => void updateGroupRules({ laborWeeklyHoursLimitMinutes: Number(event.currentTarget.value) * 60 })} /><span>時間</span></label>
            <label>インターバル<input type="number" min="0" value={Math.round((selected.group.laborRestIntervalMinutes ?? 660) / 60)} onChange={(event) => setSelected((current) => current ? { ...current, group: { ...current.group, laborRestIntervalMinutes: Number(event.target.value) * 60 } } : current)} onBlur={(event) => void updateGroupRules({ laborRestIntervalMinutes: Number(event.currentTarget.value) * 60 })} /><span>時間</span></label>
            <label>連続勤務<input type="number" min="1" value={selected.group.laborConsecutiveDaysLimit ?? 6} onChange={(event) => setSelected((current) => current ? { ...current, group: { ...current.group, laborConsecutiveDaysLimit: Number(event.target.value) } } : current)} onBlur={(event) => void updateGroupRules({ laborConsecutiveDaysLimit: Number(event.currentTarget.value) })} /><span>日</span></label>
            <label>7日間の休日<input type="number" min="0" value={selected.group.laborWeeklyRestDaysRequired ?? 1} onChange={(event) => setSelected((current) => current ? { ...current, group: { ...current.group, laborWeeklyRestDaysRequired: Number(event.target.value) } } : current)} onBlur={(event) => void updateGroupRules({ laborWeeklyRestDaysRequired: Number(event.currentTarget.value) })} /><span>日以上</span></label>
            <label>28日間の休日<input type="number" min="0" value={selected.group.laborFourWeekRestDaysRequired ?? 4} onChange={(event) => setSelected((current) => current ? { ...current, group: { ...current.group, laborFourWeekRestDaysRequired: Number(event.target.value) } } : current)} onBlur={(event) => void updateGroupRules({ laborFourWeekRestDaysRequired: Number(event.target.value) })} /><span>日以上</span></label>
          </div>
        </div>
      </section>}
      {!isAdmin && <p className="member-privacy-note">他のメンバーの勤務希望は表示せず、本人の情報だけ確認できます。</p>}
      <div className="group-detail-actions">{selected.membership.role === "owner" && <button className="small-action danger" onClick={() => void deleteGroup()}>グループを削除</button>}</div>
    </div>}
  </section>;
}
