"use client";
import { useState } from "react";

type Group = {
  groupId: string;
  name?: string;
  role: string;
  unreadAnnouncements?: number;
  pendingMemberRequests?: number;
  nextRequestCloseDate?: string | null;
};
type Props = {
  groups: Group[];
  onClock: (id: string) => void;
  onApplications: () => void;
  onCreateGroup: () => void;
  onBasic: (id: string) => void;
  onRequests: (id: string) => void;
  onRoster: (id: string) => void;
  onShiftBuilder: (id: string) => void;
  onShiftAdjustment: (id: string) => void;
  onMembers: (id: string) => void;
  onAnnouncements: (id: string) => void;
  onDashboard: (id: string) => void;
  onAuditLogs: (id: string) => void;
  onWorkRecords: (id: string) => void;
};

function requestLabel(date?: string | null) {
  if (!date) return "シフト希望";
  return `シフト希望（${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}まで）`;
}

export default function GroupMenu({
  groups,
  onClock,
  onApplications,
  onCreateGroup,
  onBasic,
  onRequests,
  onRoster,
  onShiftBuilder,
  onShiftAdjustment,
  onMembers,
  onAnnouncements,
  onDashboard,
  onAuditLogs,
  onWorkRecords,
}: Props) {
  const [openManagement, setOpenManagement] = useState<string | null>(null);
  return (
    <nav className="group-menu" aria-label="グループメニュー">
      <div className="group-menu-global">
        <button
          className="group-menu-application"
          type="button"
          onClick={onApplications}
        >
          グループ申請
        </button>
        <button
          className="group-menu-application"
          type="button"
          onClick={onCreateGroup}
        >
          グループ作成
        </button>
      </div>
      {groups.map((group) => {
        const manager = group.role === "owner" || group.role === "editor";
        const unread = group.unreadAnnouncements ?? 0;
        const pendingMembers = group.pendingMemberRequests ?? 0;
        return (
          <div className="group-menu-row" key={group.groupId}>
            <strong className="group-menu-name">
              {group.name ?? group.groupId}
            </strong>
            <div className="group-menu-actions">
              <button className="group-menu-button clock-button" type="button" onClick={() => onClock(group.groupId)}>打刻</button>
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
                お知らせ
                {unread > 0 && <span className="unread-badge">{unread}</span>}
              </button>
              <button className="group-menu-button" type="button" onClick={() => onWorkRecords(group.groupId)}>勤務状況</button>
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
                      className="group-menu-button admin"
                      type="button"
                      onClick={() => onAnnouncements(group.groupId)}
                    >
                      お知らせ管理
                    </button>
                    <button
                      className="group-menu-button admin"
                      type="button"
                      onClick={() => onDashboard(group.groupId)}
                    >
                      ダッシュボード
                    </button>
                    <button className="group-menu-button admin" type="button" onClick={() => onWorkRecords(group.groupId)}>勤務状況管理</button>
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
                        <button onClick={() => onAnnouncements(group.groupId)}>
                          お知らせ管理
                        </button>
                        <button onClick={() => onDashboard(group.groupId)}>
                          ダッシュボード
                        </button>
                        <button onClick={() => onWorkRecords(group.groupId)}>勤務状況管理</button>
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
