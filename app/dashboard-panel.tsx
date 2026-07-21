"use client";
import { useEffect, useState } from "react";
import { localApiFetch } from "./local-api";
import { getShiftDisplayLabel, getShiftDisplayStatus } from "./shift-status";
type Props = { groupId: string };
type Plan = {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  requestStatus?: "pending" | "open" | "closed" | null;
  requestSavedCount?: number;
  requestMemberCount?: number;
  shortageSlotCount?: number;
  shortageMemberCount?: number;
};
type DashboardData = {
  today: string;
  todaySchedule: Array<{ userEmail: string; displayName: string; startTime: string; endTime: string; role: string; planName: string; status: string }>;
  requestActionItems: Array<{ planId: string; planName: string; closesOn: string; savedCount: number; memberCount: number; daysUntilClose: number }>;
  closedBeforePublish: Array<{ planId: string; planName: string; startDate: string; endDate: string }>;
  coverage: Array<{ planId: string; planName: string; shortageSlotCount: number; shortageMemberCount: number }>;
  approvals: { dailyPending: number; previousMonthPending: number };
  announcements: { total: number; unread: number };
};
export default function DashboardPanel({ groupId }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [members, setMembers] = useState(0);
  const [announcements, setAnnouncements] = useState(0);
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  useEffect(() => {
    void (async () => {
      const [p, g, a, d] = await Promise.all([
        localApiFetch(`/api/shifts?groupId=${groupId}`),
        localApiFetch(`/api/groups/${groupId}`),
        localApiFetch(`/api/groups/${groupId}/announcements`),
        localApiFetch(`/api/groups/${groupId}/dashboard`),
      ]);
      if (p.ok) setPlans(((await p.json()) as { plans: Plan[] }).plans);
      if (g.ok) {
        const groupData = (await g.json()) as { group?: { name?: string }; members?: Array<{ status?: string }> };
        setGroupName(groupData.group?.name ?? "");
        const rows = groupData.members ?? [];
        setMembers(rows.filter((member) => member.status !== "inactive").length);
      }
      if (a.ok)
        setAnnouncements(
          ((await a.json()) as { announcements?: unknown[] }).announcements
            ?.length ?? 0,
        );
      if (d.ok) setDashboard((await d.json()) as DashboardData);
      setLoading(false);
    })();
  }, [groupId]);
  return (
    <section className="dashboard-panel">
      <div className="modal-head">
        <div>
          <p className="eyebrow">DASHBOARD</p>
          <h2>グループ状況{groupName ? `（${groupName}）` : ""}</h2>
        </div>
      </div>
      {loading ? (
        <p>読み込み中…</p>
      ) : (
        <>
          <div className="dashboard-metrics">
            <div>
              <strong>{members}</strong>
              <span>メンバー</span>
            </div>
            <div>
              <strong>
                {plans.filter((plan) => plan.status === "published").length}
              </strong>
              <span>公開済みシフト</span>
            </div>
            <div>
              <strong>
                {
                  plans.filter(
                    (plan) => getShiftDisplayStatus(plan) === "request-open",
                  ).length
                }
              </strong>
              <span>希望受付中</span>
            </div>
            <div>
              <strong>{announcements}</strong>
              <small className="dashboard-shortage-metric">公開済み不足 {plans.filter((plan) => plan.status === "published" && (plan.shortageSlotCount ?? 0) > 0).length}件／不足枠 {plans.filter((plan) => plan.status === "published").reduce((sum, plan) => sum + (plan.shortageSlotCount ?? 0), 0)}</small>
              <span>お知らせ</span>
            </div>
          </div>
          <h3>最近のシフト</h3>
          <div className="dashboard-plans">
            {plans.slice(0, 5).map((plan) => (
              <div key={plan.id}>
                <strong>{plan.name}</strong>
                <span>
                  {plan.startDate}〜{plan.endDate}
                </span>
                {getShiftDisplayStatus(plan) === "request-open" && (
                  <small>
                    希望保存 {plan.requestSavedCount ?? 0}/
                    {plan.requestMemberCount ?? members}
                  </small>
                )}
                {plan.status === "published" && (plan.shortageSlotCount ?? 0) > 0 && (
                  <small className="dashboard-plan-shortage">不足 {plan.shortageSlotCount}枠（{plan.shortageMemberCount}人）</small>
                )}
                <em className={getShiftDisplayStatus(plan)}>
                  {getShiftDisplayLabel(getShiftDisplayStatus(plan))}
                </em>
              </div>
            ))}
          </div>
          {dashboard && (
            <>
              <div className="dashboard-action-grid">
                <article className="dashboard-action-card">
                  <div className="dashboard-section-head"><h3>今日の勤務状況</h3><small>{dashboard.today}</small></div>
                  {dashboard.todaySchedule.length ? (
                    <div className="dashboard-today-list">
                      {dashboard.todaySchedule.map((item, index) => (
                        <div key={`${item.userEmail}|${item.startTime}|${index}`}>
                          <strong>{item.displayName}</strong>
                          <span>{item.startTime}〜{item.endTime} {item.role || "共通"}</span>
                          <em className={`dashboard-attendance-status status-${item.status}`}>{item.status}</em>
                        </div>
                      ))}
                    </div>
                  ) : <p className="dashboard-empty">今日の公開済みシフトはありません。</p>}
                </article>
                <article className="dashboard-action-card">
                  <div className="dashboard-section-head"><h3>要対応</h3><small>管理者向け</small></div>
                  <div className="dashboard-todo-list">
                    <div><strong>{dashboard.approvals.dailyPending}</strong><span>日次承認待ち</span></div>
                    <div><strong>{dashboard.approvals.previousMonthPending}</strong><span>先月の月次承認待ち</span></div>
                    <div><strong>{dashboard.closedBeforePublish.length}</strong><span>希望締切後・未公開</span></div>
                    <div><strong>{dashboard.coverage.filter((item) => item.shortageSlotCount > 0).length}</strong><span>不足ありシフト</span></div>
                  </div>
                </article>
              </div>
              <div className="dashboard-request-list">
                <div className="dashboard-section-head"><h3>希望受付</h3><small>締切と提出状況</small></div>
                {dashboard.requestActionItems.length ? dashboard.requestActionItems.map((item) => (
                  <div key={item.planId} className={item.daysUntilClose <= 2 ? "is-deadline-near" : ""}>
                    <strong>{item.planName}</strong>
                    <span>締切 {item.closesOn}</span>
                    <span>希望保存 {item.savedCount}/{item.memberCount}</span>
                    <em>{item.daysUntilClose < 0 ? "締切超過" : `あと${item.daysUntilClose}日`}</em>
                  </div>
                )) : <p className="dashboard-empty">現在、受付中の希望はありません。</p>}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
