"use client";
import { useEffect, useState } from "react";
import { localApiFetch } from "./local-api";

type Group = {
  groupId: string;
  name?: string;
  role: string;
  assistantDisplayName?: string;
  unreadAnnouncements?: number;
  unreadAssistant?: boolean;
  managerAssistantUnread?: boolean;
  pendingMemberRequests?: number;
  nextRequestCloseDate?: string | null;
};
type Props = {
  groups: Group[];
  canCreateGroups: boolean;
  onSiteAdmin?: () => void;
  onApplications: () => void;
  onCreateGroup: () => void;
  onBasic: (id: string) => void;
  onRequests: (id: string) => void;
  onRoster: (id: string) => void;
  onShiftBuilder: (id: string) => void;
  onShiftAdjustment: (id: string) => void;
  onMembers: (id: string) => void;
  onAnnouncements: (id: string) => void;
  onAssistant: (id: string) => void;
  onMemos: (id: string) => void;
  onKnowledge: (id: string) => void;
  onAnnouncementManage: (id: string) => void;
  onDashboard: (id: string) => void;
  onAuditLogs: (id: string) => void;
  onWorkDeclare: (id: string) => void;
  onWorkApprove: (id: string) => void;
  onMonthlyDeclare: (id: string) => void;
  onMonthlyApprove: (id: string) => void;
};

function requestLabel(date?: string | null) {
  if (!date) return "シフト希望";
  return `シフト希望（${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}まで）`;
}

type ClockRecord = { id: string; userEmail: string; status: string; endedAt?: string | null; attendanceExpired?: boolean };
type ClockBreak = { workRecordId: string; endedAt?: string | null };

function ClockControls({ groupId }: { groupId: string }) {
  const [state, setState] = useState<"loading" | "idle" | "working" | "break">("loading");
  const [recordId, setRecordId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await localApiFetch(`/api/groups/${groupId}/work-records`);
    if (!response.ok) { setState("idle"); setRecordId(null); return; }
    const data = await response.json() as { currentUserEmail?: string; currentUserActive?: ClockRecord | null; records?: ClockRecord[]; breaks?: ClockBreak[] };
    const active = [data.currentUserActive, ...(data.records ?? [])].find((item): item is ClockRecord => Boolean(item) && item.userEmail === data.currentUserEmail && item.status === "working" && !item.endedAt && !item.attendanceExpired);
    if (!active) { setState("idle"); setRecordId(null); return; }
    setRecordId(active.id);
    setState((data.breaks ?? []).some((item) => item.workRecordId === active.id && !item.endedAt) ? "break" : "working");
  }

  useEffect(() => { void load(); }, [groupId]);

  async function record(action: "start" | "break-start" | "break-end" | "end") {
    setBusy(true);
    const response = await localApiFetch(`/api/groups/${groupId}/work-records`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(recordId ? { recordId } : {}) }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})) as { error?: string }; window.alert(data.error ?? "打刻を記録できませんでした。"); }
    await load();
    setBusy(false);
  }

  if (state === "loading") return <button className="group-menu-button clock-button" type="button" disabled>確認中…</button>;
  if (state === "break") return <button className="group-menu-button clock-button clock-break" type="button" disabled={busy} onClick={() => void record("break-end")}>休憩終了</button>;
  if (state === "working") return <><button className="group-menu-button clock-button clock-break" type="button" disabled={busy} onClick={() => void record("break-start")}>休憩開始</button><button className="group-menu-button clock-button clock-end" type="button" disabled={busy} onClick={() => void record("end")}>勤務終了</button></>;
  return <button className="group-menu-button clock-button clock-start" type="button" disabled={busy} onClick={() => void record("start")}>勤務開始</button>;
}

function WorkDeclareButton({ groupId, onClick }: { groupId: string; onClick: () => void }) {
  const [rejectedCount, setRejectedCount] = useState(0);

  async function loadRejectedCount() {
    const response = await localApiFetch(`/api/groups/${groupId}/work-records`);
    if (!response.ok) return;
    const data = await response.json() as { currentUserEmail?: string; records?: ClockRecord[] };
    setRejectedCount((data.records ?? []).filter((record) =>
      record.userEmail === data.currentUserEmail && record.status === "rejected"
    ).length);
  }

  useEffect(() => { void loadRejectedCount(); }, [groupId]);

  return (
    <button className={`group-menu-button${rejectedCount > 0 ? " has-rejected" : ""}`} type="button" onClick={onClick}>
      勤務申告
      {rejectedCount > 0 && <span className="unread-badge rejection-badge">{rejectedCount}</span>}
    </button>
  );
}

export default function GroupMenu({
  groups,
  canCreateGroups,
  onSiteAdmin,
  onApplications,
  onCreateGroup,
  onBasic,
  onRequests,
  onRoster,
  onShiftBuilder,
  onShiftAdjustment,
  onMembers,
  onAnnouncements,
  onAssistant,
  onMemos,
  onKnowledge,
  onAnnouncementManage,
  onDashboard,
  onAuditLogs,
  onWorkDeclare,
  onWorkApprove,
  onMonthlyDeclare,
  onMonthlyApprove,
}: Props) {
  const [openManagement, setOpenManagement] = useState<string | null>(null);
  return (
    <nav className="group-menu" aria-label="グループメニュー">
      <div className="group-menu-global">
        {canCreateGroups && <button
          className="group-menu-application"
          type="button"
          onClick={onApplications}
        >
          グループ申請
        </button>}
        {onSiteAdmin && <button className="group-menu-application" type="button" onClick={onSiteAdmin}>サイト管理</button>}
        {canCreateGroups && <button
          className="group-menu-application"
          type="button"
          onClick={onCreateGroup}
        >
          グループ作成
        </button>}
      </div>
      {groups.map((group) => {
        const manager = group.role === "owner" || group.role === "editor";
        const unread = group.unreadAnnouncements ?? 0;
        const assistantUnread = Boolean(group.unreadAssistant);
        const managerAssistantUnread = Boolean(group.managerAssistantUnread);
        const pendingMembers = group.pendingMemberRequests ?? 0;
        return (
          <div className="group-menu-row" key={group.groupId}>
            <strong className="group-menu-name">
              {group.name ?? group.groupId}
            </strong>
            <div className="group-menu-actions">
              <ClockControls groupId={group.groupId} />
              <button
                className="group-menu-button"
                type="button"
                onClick={() => onBasic(group.groupId)}
              >
                基本設定
              </button>
              <button
                className="group-menu-button emphasis"
                type="button"
                onClick={() => onRequests(group.groupId)}
              >
                {requestLabel(group.nextRequestCloseDate)}
              </button>
              <button
                className="group-menu-button"
                type="button"
                onClick={() => onRoster(group.groupId)}
              >
                シフト一覧
              </button>
              <button
                className={`group-menu-button${unread > 0 ? " has-unread" : ""}`}
                type="button"
                onClick={() => onAnnouncements(group.groupId)}
              >
                お知らせ・連絡
                {unread > 0 && <span className="unread-badge">{unread}</span>}
              </button>
              <button
                className={`group-menu-button${assistantUnread ? " has-unread" : ""}`}
                type="button"
                onClick={() => onAssistant(group.groupId)}
                title={group.assistantDisplayName ?? "KINBANアシスタント"}
              >
                {group.assistantDisplayName ?? "KINBANアシスタント"}
                {assistantUnread && <span className="assistant-unread-dot" title="未読があります" aria-label="未読があります" />}
              </button>
              <button className="group-menu-button" type="button" onClick={() => onMemos(group.groupId)}>
                業務メモ
              </button>
              <button className="group-menu-button" type="button" onClick={() => onKnowledge(group.groupId)}>業務ガイド</button>
              <WorkDeclareButton groupId={group.groupId} onClick={() => onWorkDeclare(group.groupId)} />
              {manager && (
                <>
                  <div className="admin-inline">
                    <button
                      className="group-menu-button admin"
                      type="button"
                      onClick={() => onShiftBuilder(group.groupId)}
                    >
                      シフト作成
                    </button>
                    <button
                      className="group-menu-button admin"
                      type="button"
                      onClick={() => onShiftAdjustment(group.groupId)}
                    >
                      シフト割当
                    </button>
                    <button
                      className={`group-menu-button admin${pendingMembers > 0 ? " has-unread" : ""}`}
                      type="button"
                      onClick={() => onMembers(group.groupId)}
                    >
                      メンバー管理
                      {pendingMembers > 0 && <span className="unread-badge">{pendingMembers}</span>}
                    </button>
                    <button
                      className={`group-menu-button admin${managerAssistantUnread ? " has-unread" : ""}`}
                      type="button"
                      onClick={() => onAnnouncementManage(group.groupId)}
                    >
                      お知らせ・連絡管理
                      {managerAssistantUnread && <span className="assistant-unread-dot" title="KINBAN未処理があります" aria-label="KINBAN未処理があります" />}
                    </button>
                    <button
                      className="group-menu-button admin"
                      type="button"
                      onClick={() => onDashboard(group.groupId)}
                    >
                      ダッシュボード
                    </button>
                    <button className="group-menu-button admin" type="button" onClick={() => onWorkApprove(group.groupId)}>日次承認</button>
                    <button className="group-menu-button admin" type="button" onClick={() => onMonthlyApprove(group.groupId)}>月次承認</button>
                    <button className="group-menu-button admin" type="button" onClick={() => onAuditLogs(group.groupId)}>
                      操作ログ
                    </button>
                  </div>
                  <div className="admin-compact">
                    <button
                      className="group-menu-button admin"
                      type="button"
                      onClick={() =>
                        setOpenManagement(
                          openManagement === group.groupId
                            ? null
                            : group.groupId,
                        )
                      }
                    >
                      管理 ▾
                    </button>
                    {openManagement === group.groupId && (
                      <div className="admin-popover">
                        <button onClick={() => onShiftBuilder(group.groupId)}>
                          シフト作成
                        </button>
                        <button
                          onClick={() => onShiftAdjustment(group.groupId)}
                        >
                          シフト割当
                        </button>
                        <button onClick={() => onMembers(group.groupId)}>
                          メンバー管理
                          {pendingMembers > 0 && <span className="unread-badge">{pendingMembers}</span>}
                        </button>
                        <button className={managerAssistantUnread ? "has-unread" : ""} onClick={() => onAnnouncementManage(group.groupId)}>
                          お知らせ・連絡管理
                          {managerAssistantUnread && <span className="assistant-unread-dot" title="KINBAN未処理があります" aria-label="KINBAN未処理があります" />}
                        </button>
                        <button onClick={() => onDashboard(group.groupId)}>
                          ダッシュボード
                        </button>
                        <button onClick={() => onWorkApprove(group.groupId)}>日次承認</button>
                        <button onClick={() => onMonthlyApprove(group.groupId)}>月次承認</button>
                        <button onClick={() => onAuditLogs(group.groupId)}>操作ログ</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
