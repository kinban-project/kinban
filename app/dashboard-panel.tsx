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
export default function DashboardPanel({ groupId }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [members, setMembers] = useState(0);
  const [announcements, setAnnouncements] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void (async () => {
      const [p, g, a] = await Promise.all([
        localApiFetch(`/api/shifts?groupId=${groupId}`),
        localApiFetch(`/api/groups/${groupId}`),
        localApiFetch(`/api/groups/${groupId}/announcements`),
      ]);
      if (p.ok) setPlans(((await p.json()) as { plans: Plan[] }).plans);
      if (g.ok) {
        const rows = ((await g.json()) as { members?: Array<{ status?: string }> }).members ?? [];
        setMembers(rows.filter((member) => member.status !== "inactive").length);
      }
      if (a.ok)
        setAnnouncements(
          ((await a.json()) as { announcements?: unknown[] }).announcements
            ?.length ?? 0,
        );
      setLoading(false);
    })();
  }, [groupId]);
  return (
    <section className="dashboard-panel">
      <div className="modal-head">
        <div>
          <p className="eyebrow">DASHBOARD</p>
          <h2>グループ状況</h2>
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
        </>
      )}
    </section>
  );
}
