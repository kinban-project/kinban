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
      if (g.ok)
        setMembers(
          ((await g.json()) as { members?: unknown[] }).members?.length ?? 0,
        );
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
