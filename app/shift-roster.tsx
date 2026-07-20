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
  const [rosterView, setRosterView] = useState<"self" | "all" | "shortage">("all");
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
    const map = new Map<string, Array<{ email: string; name: string; isSelf: boolean }>>();
    const names = new Map((detail?.members ?? []).map((member) => [member.userEmail, member.displayName || member.userEmail.split("@")[0]]));
    for (const assignment of detail?.assignments ?? []) map.set(assignment.slotId, [...(map.get(assignment.slotId) ?? []), { email: assignment.userEmail, name: names.get(assignment.userEmail) ?? assignment.userEmail.split("@")[0], isSelf: assignment.userEmail === detail?.currentEmail }]);
    return map;
  }, [detail]);
  const slotsByCell = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const slot of detail?.slots ?? []) {
      const key = `${slot.date}|${slot.startTime}`;
      map.set(key, [...(map.get(key) ?? []), slot]);
    }
    return map;
  }, [detail]);
  const rosterWidth = 96 + times.length * 104;
  const selectedPlan = plans.find((plan) => plan.id === selectedId);
  const selectedGroupName = groupName.get(detail?.plan.groupId ?? selectedPlan?.groupId ?? "");
  const slotEntries = useMemo(() =>
    [...(detail?.slots ?? [])]
      .sort((a, b) => `${a.date}|${a.startTime}`.localeCompare(`${b.date}|${b.startTime}`))
      .map((slot) => {
        const members = assignmentMap.get(slot.id) ?? [];
        return { slot, members, isSelf: members.some((member) => member.isSelf), shortage: members.length < slot.requiredCount };
      }),
    [detail, assignmentMap],
  );
  const filteredSlots = useMemo(
    () => slotEntries.filter((entry) => rosterView === "self" ? entry.isSelf : rosterView === "shortage" ? entry.shortage : true),
    [slotEntries, rosterView],
  );
  const visibleSlotIds = useMemo(() => new Set(filteredSlots.map((entry) => entry.slot.id)), [filteredSlots]);
  const visibleRows = useMemo(
    () => rows.filter((date) => (detail?.slots ?? []).some((slot) => slot.date === date && visibleSlotIds.has(slot.id))),
    [rows, detail, visibleSlotIds],
  );
  const viewCounts = useMemo(
    () => ({ self: slotEntries.filter((entry) => entry.isSelf).length, all: slotEntries.length, shortage: slotEntries.filter((entry) => entry.shortage).length }),
    [slotEntries],
  );

  function syncTopScroll() {
    if (topScrollRef.current && tableScrollRef.current) tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
  }

  function syncTableScroll() {
    if (topScrollRef.current && tableScrollRef.current) topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
  }

    return <section className="shift-roster-card">
    <div className="shift-builder-head"><div><p className="eyebrow">SHIFT LIST</p><h2>シフト一覧{selectedGroupName ? `（${selectedGroupName}）` : ""}</h2></div></div>
    {plans.length > 0 && <div className="roster-toolbar"><select className="roster-plan-select" aria-label="表示するシフト" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{plans.map((plan) => <option value={plan.id} key={plan.id}>{plan.name} ／ {plan.startDate}〜{plan.endDate}</option>)}</select><div className="roster-legend"><span className="roster-legend-self">自分</span><span className="roster-legend-other">他の人</span>{(selectedPlan?.shortageSlotCount ?? 0) > 0 && <span className="roster-legend-shortage">未充足</span>}</div></div>}
    {busy && <p className="shift-help">読み込み中…</p>}
    {!busy && !detail && <div className="empty-state"><p>公開済みのシフトはまだありません。</p></div>}
    {detail && <>
      <div className="roster-view-tabs" aria-label="シフト一覧の表示方法">
        <button type="button" className={rosterView === "self" ? "active" : ""} onClick={() => setRosterView("self")}>自分 {viewCounts.self}件</button>
        <button type="button" className={rosterView === "all" ? "active" : ""} onClick={() => setRosterView("all")}>全体配置 {viewCounts.all}件</button>
        <button type="button" className={rosterView === "shortage" ? "active" : ""} onClick={() => setRosterView("shortage")}>未充足 {viewCounts.shortage}件</button>
      </div>
      <div className="mobile-roster-list">
        {filteredSlots.length ? filteredSlots.map(({ slot, members, shortage }) => <article className={`mobile-roster-card${shortage ? " shortage" : ""}`} key={slot.id}><div><strong>{dateLabel(slot.date)}</strong><span>{displayShiftTime(slot.startTime)}〜{displayShiftTime(slot.endTime)}</span></div><div className="mobile-roster-card-body"><b>{slot.role || "担当未設定"}</b><small>{members.length}/{slot.requiredCount}名</small></div><p>{members.length ? members.map((member) => member.name).join("・") : "未割当"}</p></article>) : <p className="mobile-roster-empty">該当するシフトはありません。</p>}
      </div>
      <div className="roster-desktop-grid">{visibleRows.length ? <><div className="roster-top-scroll" ref={topScrollRef} onScroll={syncTopScroll} aria-label="シフト表を左右にスクロール"><div style={{ width: `${rosterWidth}px` }} /></div><div className="roster-table-wrap" ref={tableScrollRef} onScroll={syncTableScroll}><table className="roster-table"><thead><tr><th>日付</th>{times.map((time) => <th key={time}>{displayShiftTime(time)}</th>)}</tr></thead><tbody>{visibleRows.map((date) => <tr key={date}><th>{dateLabel(date)}</th>{times.map((time) => { const cellSlots = (slotsByCell.get(`${date}|${time}`) ?? []).filter((slot) => visibleSlotIds.has(slot.id)); const shortage = cellSlots.some((slot) => (assignmentMap.get(slot.id)?.length ?? 0) < slot.requiredCount); return <td className={shortage ? "roster-shortage" : ""} key={time}>{cellSlots.map((slot) => { const assigned = assignmentMap.get(slot.id) ?? []; return <div className="roster-role-box" key={slot.id}><div className="roster-role-head"><strong>{slot.role || "担当"}</strong><small>{assigned.length}/{slot.requiredCount}</small></div>{assigned.length ? assigned.map((person) => <span className={`roster-person ${person.isSelf ? "is-self" : "is-other"}`} key={`${slot.id}-${person.email}`}>{person.name}</span>) : <span className="roster-empty">未割当</span>}</div>; })}</td>; })}</tr>)}</tbody></table></div><p className="shift-help">カレンダーにはグループ予定として全員分が表示されます。担当者の確認にはこの一覧を利用してください。</p></> : <p className="mobile-roster-empty">該当するシフトはありません。</p>}</div></>}
    {notice && <p className="group-notice" role="status">{notice}</p>}
  </section>;
}
