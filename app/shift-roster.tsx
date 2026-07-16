"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { localApiFetch } from "./local-api";
import { displayShiftTime } from "./shift-time";

type Group = { id: string; name: string };
type Plan = { id: string; groupId: string; name: string; startDate: string; endDate: string; openingTime: string; closingTime: string; status: "draft" | "published"; shortageSlotCount?: number; shortageMemberCount?: number };
type Slot = { id: string; date: string; startTime: string; endTime: string; requiredCount: number; role?: string };
type Detail = { currentEmail: string; plan: Plan; slots: Slot[]; assignments: Array<{ slotId: string; userEmail: string }>; members: Array<{ userEmail: string; displayName?: string | null }> };

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short" }).format(new Date(`${date}T00:00:00`));
}

export default function ShiftRoster({ initialGroupId }: { initialGroupId?: string }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  async function load() {
    setBusy(true);
    const groupResponse = await localApiFetch("/api/groups");
    if (!groupResponse.ok) { setNotice("グループ情報を取得できませんでした"); setBusy(false); return; }
    const groupData = await groupResponse.json() as { groups: Group[] };
    const userGroups = groupData.groups ?? [];
    setGroups(userGroups);
    const planLists = await Promise.all(userGroups.map(async (group) => {
      const response = await localApiFetch(`/api/shifts?groupId=${encodeURIComponent(group.id)}`);
      return response.ok ? (await response.json() as { plans: Plan[] }).plans : [];
    }));
    const allPlans = planLists.flat().filter((plan) => plan.status === "published");
    const visiblePlans = initialGroupId
      ? allPlans.filter((plan) => plan.groupId === initialGroupId)
      : allPlans;
    setPlans(visiblePlans);
    const nextId = visiblePlans.some((plan) => plan.id === selectedId) ? selectedId : visiblePlans[0]?.id ?? "";
    setSelectedId(nextId);
    if (nextId) await openPlan(nextId);
    else setDetail(null);
    setBusy(false);
  }

  async function openPlan(id: string) {
    const response = await localApiFetch(`/api/shifts/${id}`);
    if (response.ok) setDetail(await response.json() as Detail);
    else setNotice("シフトの詳細を取得できませんでした");
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { if (selectedId) void openPlan(selectedId); }, [selectedId]);

  const groupName = useMemo(() => new Map(groups.map((group) => [group.id, group.name])), [groups]);
  const times = useMemo(() => [...new Set(detail?.slots.map((slot) => slot.startTime) ?? [])].sort(), [detail]);
  const rows = useMemo(() => [...new Set(detail?.slots.map((slot) => slot.date) ?? [])].sort(), [detail]);
  const assignmentMap = useMemo(() => {
    const map = new Map<string, Array<{ name: string; isSelf: boolean }>>();
    const names = new Map((detail?.members ?? []).map((member) => [member.userEmail, member.displayName || member.userEmail.split("@")[0]]));
    for (const assignment of detail?.assignments ?? []) map.set(assignment.slotId, [...(map.get(assignment.slotId) ?? []), { name: names.get(assignment.userEmail) ?? assignment.userEmail.split("@")[0], isSelf: assignment.userEmail === detail?.currentEmail }]);
    return map;
  }, [detail]);
  const slotMap = useMemo(() => new Map((detail?.slots ?? []).map((slot) => [`${slot.date}|${slot.startTime}`, slot])), [detail]);
  const rosterWidth = 96 + times.length * 104;
  const selectedPlan = plans.find((plan) => plan.id === selectedId);

  function syncTopScroll() {
    if (topScrollRef.current && tableScrollRef.current) tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
  }

  function syncTableScroll() {
    if (topScrollRef.current && tableScrollRef.current) topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
  }

    return <section className="shift-roster-card">
    <div className="shift-builder-head"><div><p className="eyebrow">SHIFT LIST</p><h2>シフト一覧</h2></div></div>
    {plans.length > 0 && <div className="roster-toolbar"><select className="roster-plan-select" aria-label="表示するシフト" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{plans.map((plan) => <option value={plan.id} key={plan.id}>{groupName.get(plan.groupId) ?? "グループ"} ／ {plan.name} ／ {plan.startDate}〜{plan.endDate}</option>)}</select><div className="roster-legend"><span className="roster-legend-self">自分</span><span className="roster-legend-other">他の人</span>{(selectedPlan?.shortageSlotCount ?? 0) > 0 && <span className="roster-legend-shortage">未充足</span>}</div></div>}
    {busy && <p className="shift-help">読み込み中…</p>}
    {!busy && !detail && <div className="empty-state"><p>公開済みのシフトはまだありません。</p></div>}
    {detail && <><div className="roster-top-scroll" ref={topScrollRef} onScroll={syncTopScroll} aria-label="シフト表を左右にスクロール"><div style={{ width: `${rosterWidth}px` }} /></div><div className="roster-table-wrap" ref={tableScrollRef} onScroll={syncTableScroll}><table className="roster-table"><thead><tr><th>日付</th>{times.map((time) => <th key={time}>{displayShiftTime(time)}</th>)}</tr></thead><tbody>{rows.map((date) => <tr key={date}><th>{dateLabel(date)}</th>{times.map((time) => { const slot = slotMap.get(`${date}|${time}`); const names = slot ? assignmentMap.get(slot.id) ?? [] : []; const shortage = slot ? names.length < slot.requiredCount : false; return <td className={shortage ? "roster-shortage" : ""} key={time}>{names.length ? names.map((person) => <span className={`roster-person ${person.isSelf ? "is-self" : "is-other"}`} key={person.name}>{person.name}</span>) : <span className="roster-empty">未割当</span>}{slot && shortage && <small className="roster-shortage-count">{names.length}/{slot.requiredCount}人</small>}</td>; })}</tr>)}</tbody></table></div><p className="shift-help">カレンダーにはグループ予定として全員分が表示されます。担当者の確認はこの一覧を利用してください。</p></>}
    {notice && <p className="group-notice" role="status">{notice}</p>}
  </section>;
}
