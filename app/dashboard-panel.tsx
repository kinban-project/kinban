"use client";

import { useEffect, useState } from "react";
import { localApiFetch } from "./local-api";
import { getShiftDisplayLabel, getShiftDisplayStatus } from "./shift-status";

type Props = {
  groupId: string;
  onNavigate?: (view: DashboardView) => void;
};
type DashboardView = "contact" | "daily-approval" | "monthly-approval" | "shift-adjustment" | "shift-requests";

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
  members: number;
  todaySchedule: Array<{
    userEmail: string;
    displayName: string;
    startTime: string;
    endTime: string;
    role: string;
    planName: string;
    status: "予定" | "未打刻" | "勤務中" | "休憩中" | "勤務終了";
    exception?: "未打刻" | "勤務中" | null;
  }>;
  requestActionItems: Array<{
    planId: string;
    planName: string;
    closesOn: string;
    savedCount: number;
    memberCount: number;
    daysUntilClose: number;
  }>;
  closedBeforePublish: Array<{ planId: string; planName: string; startDate: string; endDate: string }>;
  coverage: Array<{ planId: string; planName: string; shortageSlotCount: number; shortageMemberCount: number }>;
  approvals: { dailyPending: number; previousMonthPending: number; dailyIssue: number };
  contacts: { unprocessed: number };
  announcements: { total: number; unread: number };
};

function shortDate(value: string) {
  return value.length >= 10 ? `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}` : value;
}

export default function DashboardPanel({ groupId, onNavigate }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [manualRefresh, setManualRefresh] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (active) setRefreshing(true);
      try {
        const [p, g, d] = await Promise.all([
          localApiFetch(`/api/shifts?groupId=${groupId}`),
          localApiFetch(`/api/groups/${groupId}`),
          localApiFetch(`/api/groups/${groupId}/dashboard`),
        ]);
        if (!active) return;
        if (!p.ok || !g.ok || !d.ok) throw new Error("ダッシュボード情報を取得できませんでした。");
        const planData = (await p.json()) as { plans: Plan[] };
        const groupData = (await g.json()) as { group?: { name?: string }; members?: Array<{ status?: string }> };
        setPlans(planData.plans ?? []);
        setGroupName(groupData.group?.name ?? "");
        setDashboard((await d.json()) as DashboardData);
        setError(null);
        setLastUpdated(new Date());
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "更新に失敗しました。");
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [groupId, manualRefresh]);

  const shortagePlans = plans.filter((plan) => plan.status === "published" && (plan.shortageSlotCount ?? 0) > 0);
  const todayExceptions = dashboard?.todaySchedule.filter((item) => item.exception) ?? [];
  const navigate = (view: DashboardView) => onNavigate?.(view);

  return (
    <section className="dashboard-panel">
      <div className="modal-head">
        <div>
          <p className="eyebrow">DASHBOARD</p>
          <h2>ダッシュボード{groupName ? `（${groupName}）` : ""}</h2>
        </div>
        <div className="dashboard-refresh">
          <small>{lastUpdated ? `更新 ${lastUpdated.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}</small>
          <button className="small-action" type="button" disabled={refreshing} onClick={() => setManualRefresh((value) => value + 1)}>{refreshing ? "更新中…" : "更新"}</button>
        </div>
      </div>
      {error && <p className="dashboard-error">{error}（直前の表示を維持しています）</p>}
      {loading ? <p>ダッシュボードを読み込んでいます…</p> : (
        <>
          <div className="dashboard-action-grid">
            <article className="dashboard-action-card">
              <div className="dashboard-section-head"><h3>要対応</h3><small>優先度の高い順</small></div>
              <div className="dashboard-todo-list">
                <button type="button" className={dashboard?.contacts.unprocessed ? "dashboard-todo urgent" : "dashboard-todo"} onClick={() => navigate("contact")}><strong>{dashboard?.contacts.unprocessed ?? 0}</strong><span>未処理の連絡</span></button>
                <button type="button" className={todayExceptions.length ? "dashboard-todo urgent" : "dashboard-todo"} onClick={() => navigate("daily-approval")}><strong>{todayExceptions.length}</strong><span>今日の勤怠例外</span></button>
                <button type="button" className={dashboard?.approvals.dailyIssue ? "dashboard-todo warning" : "dashboard-todo"} onClick={() => navigate("daily-approval")}><strong>{dashboard?.approvals.dailyIssue ?? 0}</strong><span>日次承認の要確認</span></button>
                <button type="button" className={shortagePlans.length ? "dashboard-todo warning" : "dashboard-todo"} onClick={() => navigate("shift-adjustment")}><strong>{shortagePlans.length}</strong><span>不足のある公開シフト</span></button>
              </div>
            </article>
            <article className="dashboard-action-card">
              <div className="dashboard-section-head"><h3>今日の勤務状況</h3><small>{dashboard?.today ?? ""}</small></div>
              {dashboard?.todaySchedule.length ? <div className="dashboard-today-list">{dashboard.todaySchedule.map((item, index) => <div key={`${item.userEmail}|${item.startTime}|${index}`}><strong>{item.displayName}</strong><span>{item.startTime}〜{item.endTime} {item.role || "共通"}</span><em className={`dashboard-attendance-status status-${item.status}`}>{item.status}</em></div>)}</div> : <p className="dashboard-empty">今日の公開済みシフトはありません。</p>}
            </article>
          </div>

          {(dashboard?.announcements.unread ?? 0) > 0 && <p className="dashboard-notice-summary">未読のお知らせ {dashboard?.announcements.unread}件</p>}

          <div className="dashboard-request-list">
            <div className="dashboard-section-head"><h3>次にやること</h3><small>期限・締め処理</small></div>
            {dashboard?.requestActionItems.length ? dashboard.requestActionItems.map((item) => <button type="button" key={item.planId} className={`dashboard-request-row ${item.daysUntilClose <= 2 ? "is-deadline-near" : ""}`} onClick={() => navigate("shift-requests")}><strong>{item.planName}</strong><span>締切 {shortDate(item.closesOn)}</span><span>提出 {item.savedCount}/{item.memberCount}人</span><em>{item.daysUntilClose < 0 ? "締切超過" : `あと${item.daysUntilClose}日`}</em></button>) : <p className="dashboard-empty">現在、受付中の希望はありません。</p>}
            {dashboard?.closedBeforePublish.map((item) => <button type="button" className="dashboard-request-row is-deadline-near" key={`closed|${item.planId}`} onClick={() => navigate("shift-adjustment")}><strong>{item.planName}</strong><span>{shortDate(item.startDate)}〜{shortDate(item.endDate)}</span><span>希望締切後・未公開</span><em>対応</em></button>)}
            {(dashboard?.approvals.previousMonthPending ?? 0) > 0 && <button type="button" className="dashboard-request-row" onClick={() => navigate("monthly-approval")}><strong>月次承認</strong><span>前月分</span><span>未承認 {dashboard?.approvals.previousMonthPending}人</span><em>確認</em></button>}
          </div>

          <h3>直近のシフト</h3>
          <div className="dashboard-plans">{plans.slice(0, 5).map((plan) => <div key={plan.id}><strong>{plan.name}</strong><span>{shortDate(plan.startDate)}〜{shortDate(plan.endDate)}</span>{getShiftDisplayStatus(plan) === "request-open" && <small>提出 {plan.requestSavedCount ?? 0}/{plan.requestMemberCount ?? dashboard?.members ?? 0}人</small>}{plan.status === "published" && (plan.shortageSlotCount ?? 0) > 0 && <small className="dashboard-plan-shortage">不足 {plan.shortageSlotCount}枠（{plan.shortageMemberCount}人）</small>}<em className={getShiftDisplayStatus(plan)}>{getShiftDisplayLabel(getShiftDisplayStatus(plan))}</em></div>)}</div>
        </>
      )}
    </section>
  );
}
