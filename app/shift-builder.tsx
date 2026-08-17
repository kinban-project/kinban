"use client";

import { useEffect, useMemo, useState } from "react";
import { localApiFetch } from "./local-api";
import { getShiftDisplayLabel, getShiftDisplayStatus } from "./shift-status";
import { displayShiftTime, minutesToShiftTime, shiftTimeToMinutes } from "./shift-time";
import { toDateTimeLocal } from "./shift-request-deadline";

type Group = { id: string; name: string; membership: { role: string } };
type Duty = { id: string; name: string; description?: string; status: "active" | "inactive" };
type Plan = {
  id: string;
  groupId: string;
  name: string;
  notes: string;
  startDate: string;
  endDate: string;
  openingTime: string;
  closingTime: string;
  slotMinutes: number;
  defaultRequiredCount: number;
  status: "draft" | "published";
  version: number;
  requestStatus?: "pending" | "open" | "closed" | null;
};
type Slot = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  requiredCount: number;
  role: string;
  dutyId?: string | null;
  dutyNameSnapshot?: string | null;
  dutyScopeIds?: string[] | string | null;
  coverageDutyIds?: string[] | string | null;
};
type Member = { userEmail: string; displayName?: string | null; role: string };
type RequestPeriod = {
  id: string;
  groupId: string;
  planId: string;
  name: string;
  opensOn: string;
  closesOn: string;
  status: "pending" | "open" | "closed";
};
type DemoTime = { currentAt: string; today: string; timezone: string };

function displayStatus(plan: Plan, requestPeriod?: RequestPeriod | null, today?: string) {
  return getShiftDisplayStatus({
    ...plan,
    requestStatus: requestPeriod?.status ?? plan.requestStatus,
  }, today);
}
type Detail = {
  plan: Plan;
  slots: Slot[];
  assignments: Array<{ slotId: string; userEmail: string }>;
  members: Member[];
  closedDates?: string[];
  requestPeriod?: RequestPeriod | null;
  demoTime?: DemoTime;
};
type SlotRule = { startTime: string; endTime: string; role: string; requiredCount: string; dutyId: string; dutyScopeIds: string[]; coverageDutyIds: string[] };
type TimeBand = { startTime: string; endTime: string; rules: SlotRule[] };
type InputMode = "simple" | "arbitrary" | "json";

function emptySlotRule(): SlotRule {
  return { startTime: "09:00", endTime: "10:00", role: "", requiredCount: "1", dutyId: "", dutyScopeIds: [], coverageDutyIds: [] };
}

function defaultRequestCloseDate(startDate: string) {
  const minimum = new Date();
  minimum.setDate(minimum.getDate() + 2);
  const minimumDate = `${minimum.getFullYear()}-${String(minimum.getMonth() + 1).padStart(2, "0")}-${String(minimum.getDate()).padStart(2, "0")}`;
  if (!startDate) return minimumDate;
  const candidate = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(candidate.getTime())) return minimumDate;
  candidate.setUTCDate(candidate.getUTCDate() - 15);
  const candidateDate = candidate.toISOString().slice(0, 10);
  return candidateDate > minimumDate ? candidateDate : minimumDate;
}

function nextMonthRange(base: Date) {
  const start = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 2, 0);
  const date = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const startDate = date(start);
  return {
    startDate,
    endDate: date(end),
    requestCloseDate: `${defaultRequestCloseDate(startDate)}T23:59`,
  };
}

const initial = {
  groupId: "",
  name: "",
  startDate: "",
  endDate: "",
  requestCloseDate: "",
  openingTime: "09:00",
  closingTime: "18:00",
  slotMinutes: "60",
};
const customSlotExample = `{
  "slots": [
    { "date": "2026-07-16", "startTime": "10:00", "endTime": "14:00", "role": "ホール", "requiredCount": 2 },
    { "date": "2026-07-16", "startTime": "10:00", "endTime": "14:00", "role": "厨房", "requiredCount": 2 },
    { "date": "2026-07-16", "startTime": "14:00", "endTime": "18:00", "role": "ホール", "requiredCount": 1 }
  ]
}`;
const shiftTimeOptions = Array.from(
  { length: 61 },
  (_, index) =>
    `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`,
);

function dateKeys(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function formatDateWithWeekday(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][
    new Date(year, month - 1, day).getDay()
  ];
  return `${date}（${weekday}）`;
}

export default function ShiftBuilder({
  initialGroupId,
}: {
  initialGroupId?: string;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState({
    ...initial,
    groupId: initialGroupId ?? "",
  });
  const [notes, setNotes] = useState("");
  const [slotRules, setSlotRules] = useState<SlotRule[]>([
    { startTime: "09:00", endTime: "18:00", role: "", requiredCount: "2", dutyId: "", dutyScopeIds: [], coverageDutyIds: [] },
  ]);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [inputMode, setInputMode] = useState<InputMode>("simple");
  const [arbitraryBands, setArbitraryBands] = useState<TimeBand[]>([
    { startTime: "09:00", endTime: "18:00", rules: [{ ...emptySlotRule() }] },
  ]);
  const [customSlots, setCustomSlots] = useState(customSlotExample);
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [demoToday, setDemoToday] = useState<string>();

  const editableGroups = useMemo(
    () =>
      groups.filter(
        (group) =>
          group.membership.role === "owner" ||
          group.membership.role === "editor",
      ),
    [groups],
  );
  const selectedGroupName = groups.find((group) => group.id === form.groupId)?.name;

  async function loadGroups() {
    const response = await localApiFetch("/api/groups");
    if (response.ok) {
      const data = (await response.json()) as { groups: Group[] };
      setGroups(data.groups);
      if (!form.groupId && data.groups[0])
        setForm((current) => ({ ...current, groupId: data.groups[0].id }));
    }
  }

  async function loadDuties(groupId: string) {
    if (!groupId) return;
    const response = await localApiFetch(`/api/groups/${encodeURIComponent(groupId)}`);
    if (response.ok) setDuties(((await response.json()) as { duties?: Duty[] }).duties ?? []);
  }

  async function loadPlans(groupId: string) {
    if (!groupId) return;
    const response = await localApiFetch(
      `/api/shifts?groupId=${encodeURIComponent(groupId)}`,
    );
    if (response.ok) {
      const data = (await response.json()) as { plans: Plan[]; demoTime?: DemoTime };
      const nextPlans = data.plans;
      setDemoToday(data.demoTime?.today);
      setPlans(nextPlans);
      if (!notes && nextPlans[0]?.notes) setNotes(nextPlans[0].notes);
    }
  }

  async function openPlan(id: string) {
    const response = await localApiFetch(`/api/shifts/${id}`);
    if (response.ok) {
      const next = (await response.json()) as Detail;
      setDetail(next);
      setDemoToday(next.demoTime?.today);
      setClosedDates(next.closedDates ?? []);
    }
  }

  async function deletePlan(plan: Plan) {
    if (
      plan.status !== "draft" ||
      !window.confirm(`「${plan.name}」の下書きを削除しますか？`)
    )
      return;
    setBusy(true);
    setNotice(null);
    const response = await localApiFetch(`/api/shifts/${plan.id}`, {
      method: "DELETE",
    });
    const data = (await response.json()) as { error?: string };
    setNotice(
      response.ok
        ? "下書きを削除しました"
        : (data.error ?? "下書きを削除できませんでした"),
    );
    if (response.ok) await loadPlans(form.groupId);
    setBusy(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadGroups(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const response = await localApiFetch("/api/demo-clock");
      const data = (await response.json().catch(() => ({}))) as {
        currentAt?: string;
      };
      const base = data.currentAt ? new Date(data.currentAt) : new Date();
      const range = nextMonthRange(Number.isNaN(base.getTime()) ? new Date() : base);
      if (!cancelled)
        setForm((current) =>
          current.startDate ? current : { ...current, ...range },
        );
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (initialGroupId)
      setForm((current) => ({ ...current, groupId: initialGroupId }));
  }, [initialGroupId]);
  useEffect(() => {
    const timer = form.groupId
      ? window.setTimeout(() => void loadPlans(form.groupId), 0)
      : undefined;
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [form.groupId]);

  useEffect(() => {
    void loadDuties(form.groupId);
  }, [form.groupId]);

  function dutyPayload(rule: SlotRule) {
    return {
      role: rule.dutyId
        ? duties.find((duty) => duty.id === rule.dutyId)?.name ?? rule.role
        : rule.role,
      requiredCount: Number(rule.requiredCount),
      ...(rule.dutyId ? { dutyId: rule.dutyId } : {}),
      ...(rule.dutyId || rule.dutyScopeIds.length
        ? { dutyScopeIds: [...new Set([rule.dutyId, ...rule.dutyScopeIds].filter(Boolean))] }
        : {}),
    };
  }

  function arbitrarySlots() {
    return {
      slots: dateKeys(form.startDate, form.endDate).flatMap((date) =>
        arbitraryBands.flatMap((band) =>
          band.rules.map((rule) => ({
            date,
            startTime: band.startTime,
            endTime: band.endTime,
            ...dutyPayload(rule),
          })),
        ),
      ),
    };
  }

  function addNextBand() {
    setArbitraryBands((current) => {
      const previous = current[current.length - 1];
      const start = previous ? shiftTimeToMinutes(previous.endTime) : shiftTimeToMinutes("09:00");
      const duration = previous
        ? Math.max(30, shiftTimeToMinutes(previous.endTime) - shiftTimeToMinutes(previous.startTime))
        : 60;
      const end = Math.min(30 * 60, start + duration);
      return [...current, {
        startTime: minutesToShiftTime(start),
        endTime: minutesToShiftTime(end),
        rules: previous
          ? previous.rules.map((rule) => ({ ...rule, dutyScopeIds: [...rule.dutyScopeIds], coverageDutyIds: [...rule.coverageDutyIds] }))
          : [{ ...emptySlotRule() }],
      }];
    });
  }

  function updateBand(index: number, patch: Partial<TimeBand>) {
    setArbitraryBands((current) => current.map((band, bandIndex) => bandIndex === index ? { ...band, ...patch } : band));
  }

  function updateBandRule(bandIndex: number, ruleIndex: number, patch: Partial<SlotRule>) {
    setArbitraryBands((current) => current.map((band, index) => index === bandIndex
      ? { ...band, rules: band.rules.map((rule, currentRuleIndex) => currentRuleIndex === ruleIndex ? { ...rule, ...patch } : rule) }
      : band));
  }

  function addBandRule(bandIndex: number) {
    setArbitraryBands((current) => current.map((band, index) => index === bandIndex
      ? { ...band, rules: [...band.rules, { ...emptySlotRule(), startTime: band.startTime, endTime: band.endTime }] }
      : band));
  }

  function removeBand(index: number) {
    if (!window.confirm("この時間帯と担当枠を削除しますか？")) return;
    setArbitraryBands((current) => current.length <= 1
      ? current
      : current.filter((_, bandIndex) => bandIndex !== index));
  }

  async function createPlan(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      setNotice("シフト名を入力してください");
      return;
    }
    setBusy(true);
    setNotice(null);
    const response = await localApiFetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        notes,
        slotMinutes: Number(form.slotMinutes),
        slotRules: inputMode === "simple" ? slotRules.map(dutyPayload) : undefined,
        customSlots:
          inputMode === "json"
            ? customSlots
            : inputMode === "arbitrary"
              ? arbitrarySlots()
              : undefined,
      }),
    });
    const raw = await response.text();
    let data: { error?: string; plan?: Plan; slotCount?: number } = {};
    try {
      data = JSON.parse(raw) as {
        error?: string;
        plan?: Plan;
        slotCount?: number;
      };
    } catch {
      setNotice(`シフトの作成に失敗しました（HTTP ${response.status}）`);
      setBusy(false);
      return;
    }
    if (!response.ok || !data.plan)
      setNotice(data.error ?? "シフトを作成できませんでした");
    else {
      setNotice(`${data.slotCount}個の勤務枠を作成しました`);
      await loadPlans(form.groupId);
      await openPlan(data.plan.id);
    }
    setBusy(false);
  }

  function updateSlotRule(index: number, next: Partial<SlotRule>) {
    setSlotRules((current) =>
      current.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...next } : rule,
      ),
    );
  }
  function updateSlot(id: string, next: Partial<Slot>) {
    if (!detail) return;
    setDetail({
      ...detail,
      slots: detail.slots.map((slot) =>
        slot.id === id ? { ...slot, ...next } : slot,
      ),
    });
  }
  function closeDate(date: string) {
    setClosedDates((current) =>
      current.includes(date) ? current : [...current, date],
    );
  }
  function reopenDate(date: string) {
    setClosedDates((current) => current.filter((item) => item !== date));
  }
  async function saveLayout(action?: "start-requests") {
    if (!detail) return;
    if (!detail.plan.name.trim()) {
      setNotice("シフト名を入力してください");
      return;
    }
    setBusy(true);
    const response = await localApiFetch(`/api/shifts/${detail.plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        name: detail.plan.name.trim(),
        expectedVersion: detail.plan.version,
        requestCloseDate: detail.requestPeriod?.closesOn,
        layout: { notes: detail.plan.notes, slots: detail.slots, closedDates },
      }),
    });
    const responseText = await response.text();
    let data: { error?: string; slotCount?: number } = {};
    if (responseText.trim()) {
      try {
        data = JSON.parse(responseText) as { error?: string; slotCount?: number };
      } catch {
        data = { error: `保存APIがJSONではない応答を返しました（HTTP ${response.status}）` };
      }
    }
    setNotice(
      response.ok
        ? action === "start-requests"
          ? "シフト希望の受付を開始しました"
          : `勤務枠を保存しました（${data.slotCount ?? detail.slots.length}枠）`
        : (data.error ?? "勤務枠を保存できませんでした"),
    );
    if (response.ok) await openPlan(detail.plan.id);
    setBusy(false);
  }
  function assignmentMap() {
    const map: Record<string, string[]> = {};
    for (const assignment of detail?.assignments ?? [])
      (map[assignment.slotId] ??= []).push(assignment.userEmail);
    return map;
  }
  function toggle(slotId: string, userEmail: string) {
    setDetail((currentDetail) => {
      if (!currentDetail) return currentDetail;
      const current = currentDetail.assignments
        .filter((assignment) => assignment.slotId === slotId)
        .map((assignment) => assignment.userEmail);
      const next = current.includes(userEmail)
        ? current.filter((email) => email !== userEmail)
        : [...current, userEmail];
      return {
        ...currentDetail,
        assignments: currentDetail.assignments
          .filter((assignment) => assignment.slotId !== slotId)
          .concat(next.map((email) => ({ slotId, userEmail: email }))),
      };
    });
  }
  async function save(status: "draft" | "published") {
    if (!detail) return;
    setBusy(true);
    const response = await localApiFetch(`/api/shifts/${detail.plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments: assignmentMap(), status }),
    });
    const data = (await response.json()) as {
      error?: string;
      warnings?: string[];
    };
    setWarnings(data.warnings ?? []);
    setNotice(
      response.ok
        ? status === "published"
          ? "シフトを公開しました"
          : "下書きを保存しました"
        : (data.error ?? "保存できませんでした"),
    );
    if (response.ok) await openPlan(detail.plan.id);
    setBusy(false);
  }

  return (
    <section className="shift-builder-card">
      <div className="shift-builder-head">
        <div>
          <p className="eyebrow">SHIFT PLANNER</p>
          <h2>シフト作成{selectedGroupName ? `（${selectedGroupName}）` : ""}</h2>
          <p>シフトの期間と勤務枠を作成し、表で調整します。</p>
        </div>
        {detail && (
          <button className="ghost-button" onClick={() => setDetail(null)}>
            新しいシフト
          </button>
        )}
      </div>
      {!detail ? (
        <>
          <form className="shift-condition-form" onSubmit={createPlan}>
            {!initialGroupId && <label>
              グループ
              <select
                required
                value={form.groupId}
                onChange={(event) => {
                  const groupId = event.target.value;
                  setForm((current) => ({ ...current, groupId }));
                  void loadDuties(groupId);
                }}
              >
                <option value="">選択してください</option>
                {editableGroups.map((group) => (
                  <option value={group.id} key={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>}
            <label>
              シフト名
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <div className="form-row">
              <label>
                開始日
                <input
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((current) => ({
                      ...current,
                      startDate: value,
                      requestCloseDate: defaultRequestCloseDate(value),
                    }));
                  }}
                  onInput={(event) => {
                    const value = event.currentTarget.value;
                    setForm((current) => ({
                      ...current,
                      startDate: value,
                      requestCloseDate: defaultRequestCloseDate(value),
                    }));
                  }}
                />
              </label>
              <label>
                終了日
                <input
                  type="date"
                  required
                  value={form.endDate}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((current) => ({ ...current, endDate: value }));
                  }}
                  onInput={(event) => {
                    const value = event.currentTarget.value;
                    setForm((current) => ({ ...current, endDate: value }));
                  }}
                />
              </label>
            </div>
            <label>
              シフト希望受付期限
              <input
                type="datetime-local"
                required
                value={form.requestCloseDate}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setForm((current) => ({ ...current, requestCloseDate: value }));
                }}
                onInput={(event) => {
                  const value = event.currentTarget.value;
                  setForm((current) => ({ ...current, requestCloseDate: value }));
                }}
              />
              <small className="field-help">
                開始日の15日前を初期値にし、現在日時から2日以内にならないようにしています。必要に応じて変更できます。
              </small>
            </label>
            <label className="plan-notes">
              勤務枠の方針・メモ
              <textarea
                rows={3}
                maxLength={2000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="例：金土は混雑するため厚めに配置。祝日前は土曜扱い。"
              />
            </label>
            <fieldset className="slot-input-mode">
              <legend>勤務枠の作り方</legend>
              <label>
                <input
                  type="radio"
                  checked={inputMode === "simple"}
                  onChange={() => setInputMode("simple")}
                />
                簡易設定
              </label>
              <label>
                <input
                  type="radio"
                  checked={inputMode === "arbitrary"}
                  onChange={() => setInputMode("arbitrary")}
                />
                任意設定
              </label>
              <label>
                <input
                  type="radio"
                  checked={inputMode === "json"}
                  onChange={() => setInputMode("json")}
                />
                JSON設定
              </label>
            </fieldset>
            {inputMode === "simple" && (
              <div className="form-row">
                <label>
                  開店／開始
                  <select
                    value={form.openingTime}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, openingTime: event.target.value }))
                    }
                  >
                    {shiftTimeOptions.slice(0, -1).map((time) => (
                      <option key={time} value={time}>
                        {displayShiftTime(time)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  閉店／終了
                  <select
                    value={form.closingTime}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, closingTime: event.target.value }))
                    }
                  >
                    {shiftTimeOptions.slice(1).map((time) => (
                      <option key={time} value={time}>
                        {displayShiftTime(time)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {inputMode === "simple" ? (
              <>
                <label>
                  区切り時間
                  <select
                    value={form.slotMinutes}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, slotMinutes: event.target.value }))
                    }
                  >
                    <option value="30">30分</option>
                    <option value="60">1時間</option>
                    <option value="120">2時間</option>
                  </select>
                </label>
                <div className="slot-rules">
                  <div className="slot-rules-head">
                    <strong>担当・ポジションごとの必要人数</strong>
                    <small>例：厨房 3名、ホール 2名</small>
                  </div>
                  {slotRules.map((rule, index) => (
                    <div className="slot-rule-row" key={index}>
                      <label className="slot-duty-field">
                        <span>担当（主担当）</span>
                        <select value={rule.dutyId} onChange={(event) => { const nextDutyId = event.target.value; updateSlotRule(index, { dutyId: nextDutyId, role: event.target.selectedOptions[0]?.textContent ?? rule.role, dutyScopeIds: nextDutyId ? [nextDutyId, ...rule.dutyScopeIds.filter((dutyId) => dutyId !== rule.dutyId && dutyId !== nextDutyId)] : [] }); }} aria-label="担当（主担当）">
                        <option value="">担当なし（既存運用）</option>
                        {duties.filter((duty) => duty.status === "active").map((duty) => <option key={duty.id} value={duty.id}>{duty.name}</option>)}
                        </select>
                      </label>
                      <label className="slot-duty-field slot-count-field">
                        <span>必要人数</span>
                        <span className="slot-count-inline"><input type="number" min="1" max="50" value={rule.requiredCount} onChange={(event) => updateSlotRule(index, { requiredCount: event.target.value })} aria-label="必要人数" />名</span>
                      </label>
                      <label className="slot-duty-field">
                        <span>兼任担当（任意）</span>
                        <select
                          multiple
                          size={Math.min(3, Math.max(1, duties.filter((duty) => duty.status === "active").length))}
                          value={rule.dutyScopeIds.filter((dutyId) => dutyId !== rule.dutyId)}
                          onChange={(event) => updateSlotRule(index, { dutyScopeIds: [rule.dutyId, ...[...event.target.selectedOptions].map((option) => option.value)].filter(Boolean) })}
                          aria-label="兼任担当（任意）"
                        >
                          {duties.filter((duty) => duty.status === "active").map((duty) => <option key={duty.id} value={duty.id}>{duty.name}</option>)}
                        </select>
                      </label>
                      {slotRules.length > 1 && (
                        <button
                          type="button"
                          className="small-action danger"
                          onClick={() =>
                            setSlotRules((current) =>
                              current.filter(
                                (_, ruleIndex) => ruleIndex !== index,
                              ),
                            )
                          }
                        >
                          削除
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="small-action"
                    onClick={() =>
                      setSlotRules((current) => [
                        ...current,
                        { startTime: "09:00", endTime: "10:00", role: "", requiredCount: "1", dutyId: "", dutyScopeIds: [], coverageDutyIds: [] },
                      ])
                    }
                  >
                    ＋担当を追加
                  </button>
                </div>
              </>
            ) : inputMode === "arbitrary" ? (
              <div className="slot-rules">
                <div className="slot-rules-head">
                  <strong>時間枠を順番に設定</strong>
                  <small>期間全体へ同じ枠を作成します。日別調整は作成後に行えます。</small>
                </div>
                {arbitraryBands.map((band, bandIndex) => (
                  <div className="slot-band" key={bandIndex}>
                    <div className="slot-band-head">
                      <label className="slot-duty-field">
                        <span>開始</span>
                        <select value={band.startTime} onChange={(event) => updateBand(bandIndex, { startTime: event.target.value })}>
                          {shiftTimeOptions.slice(0, -1).map((time) => <option key={time} value={time}>{displayShiftTime(time)}</option>)}
                        </select>
                      </label>
                      <span>〜</span>
                      <label className="slot-duty-field">
                        <span>終了</span>
                        <select value={band.endTime} onChange={(event) => updateBand(bandIndex, { endTime: event.target.value })}>
                          {shiftTimeOptions.slice(1).map((time) => <option key={time} value={time}>{displayShiftTime(time)}</option>)}
                        </select>
                      </label>
                      <button type="button" className="small-action danger" disabled={arbitraryBands.length <= 1} onClick={() => removeBand(bandIndex)}>この時間帯を削除</button>
                    </div>
                    {band.rules.map((rule, ruleIndex) => (
                      <div className="slot-rule-row" key={ruleIndex}>
                        <label className="slot-duty-field">
                          <span>担当（主担当）</span>
                          <select value={rule.dutyId} onChange={(event) => { const nextDutyId = event.target.value; updateBandRule(bandIndex, ruleIndex, { dutyId: nextDutyId, role: event.target.selectedOptions[0]?.textContent ?? rule.role, dutyScopeIds: nextDutyId ? [nextDutyId, ...rule.dutyScopeIds.filter((dutyId) => dutyId !== rule.dutyId && dutyId !== nextDutyId)] : [] }); }}>
                            <option value="">担当なし</option>
                            {duties.filter((duty) => duty.status === "active").map((duty) => <option key={duty.id} value={duty.id}>{duty.name}</option>)}
                          </select>
                        </label>
                        <label className="slot-duty-field slot-count-field">
                          <span>必要人数</span>
                          <span className="slot-count-inline"><input type="number" min="1" max="50" value={rule.requiredCount} onChange={(event) => updateBandRule(bandIndex, ruleIndex, { requiredCount: event.target.value })} />名</span>
                        </label>
                        <label className="slot-duty-field">
                          <span>兼任担当（任意）</span>
                          <select multiple size={Math.min(3, Math.max(1, duties.filter((duty) => duty.status === "active").length))} value={rule.dutyScopeIds.filter((dutyId) => dutyId !== rule.dutyId)} onChange={(event) => updateBandRule(bandIndex, ruleIndex, { dutyScopeIds: [rule.dutyId, ...[...event.target.selectedOptions].map((option) => option.value)].filter(Boolean) })}>
                            {duties.filter((duty) => duty.status === "active").map((duty) => <option key={duty.id} value={duty.id}>{duty.name}</option>)}
                          </select>
                        </label>
                        {band.rules.length > 1 && <button type="button" className="small-action danger" onClick={() => setArbitraryBands((current) => current.map((currentBand, index) => index === bandIndex ? { ...currentBand, rules: currentBand.rules.filter((_, currentRuleIndex) => currentRuleIndex !== ruleIndex) } : currentBand))}>削除</button>}
                      </div>
                    ))}
                    <button type="button" className="small-action" onClick={() => addBandRule(bandIndex)}>＋この時間帯に担当枠を追加</button>
                  </div>
                ))}
                <button type="button" className="small-action" onClick={addNextBand}>＋次の時間帯を追加</button>
              </div>
            ) : (
              <label className="plan-notes custom-slots-input">
                高度な勤務枠（JSON）
                <textarea
                  rows={12}
                  value={customSlots}
                  onChange={(event) => setCustomSlots(event.target.value)}
                  spellCheck={false}
                />
                <small className="field-help">
                  slots配列に日付・開始時刻・終了時刻・担当・必要人数を指定します。時刻は30分単位で、24:00〜30:00は翌日の時刻として扱います。
                </small>
              </label>
            )}
            <button
              className="primary-button"
              disabled={busy || editableGroups.length === 0}
            >
              {busy ? "作成中…" : "勤務枠を作成"}
            </button>
          </form>
          <div className="existing-plans">
            <h3>作成済みのシフト</h3>
            {plans.length ? (
              plans.map((plan) => (
                <div
                  key={plan.id}
                  className="plan-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => void openPlan(plan.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ")
                      void openPlan(plan.id);
                  }}
                >
                  <span>
                    <strong>{plan.name}</strong>
                    <small>
                      {plan.startDate}〜{plan.endDate} ・{" "}
                      {displayShiftTime(plan.openingTime)}〜
                      {displayShiftTime(plan.closingTime)}
                    </small>
                  </span>
                  <span className="plan-open">
                    <em className={displayStatus(plan, null, demoToday)}>
                      {getShiftDisplayLabel(displayStatus(plan, null, demoToday))}
                    </em>
                    {plan.status === "draft" ? (
                      <button
                        type="button"
                        className="plan-delete"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deletePlan(plan);
                        }}
                      >
                        削除
                      </button>
                    ) : (
                      <b>割り当てを編集 →</b>
                    )}
                  </span>
                </div>
              ))
            ) : (
              <p>まだシフトはありません。</p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="shift-summary">
            <div>
              <strong>{detail.plan.name}</strong>
              <span>
                {detail.plan.startDate}〜{detail.plan.endDate} ／{" "}
                {displayShiftTime(detail.plan.openingTime)}〜
                {displayShiftTime(detail.plan.closingTime)}
              </span>
            </div>
            <span className={displayStatus(detail.plan, detail.requestPeriod, detail.demoTime?.today ?? demoToday)}>
              {getShiftDisplayLabel(
                displayStatus(detail.plan, detail.requestPeriod, detail.demoTime?.today ?? demoToday),
              )}
            </span>
          </div>
          <div className="shift-actions shift-actions-top">
            <button
              className="ghost-button"
              onClick={() => void saveLayout()}
              disabled={busy}
            >
              保存
            </button>
          </div>
          {detail.requestPeriod && (
            <div
              className={`shift-request-state ${detail.requestPeriod.status}`}
            >
              <strong>シフト希望受付</strong>
              {detail.requestPeriod.status === "pending" ? (
                <label>
                  受付期限
                  <input
                    type="datetime-local"
                  value={toDateTimeLocal(detail.requestPeriod.closesOn)}
                    onChange={(event) =>
                      setDetail({
                        ...detail,
                        requestPeriod: {
                          ...detail.requestPeriod!,
                          closesOn: event.target.value,
                        },
                      })
                    }
                  />
                </label>
              ) : (
                <span>
                  {detail.requestPeriod.opensOn}〜
                  {detail.requestPeriod.closesOn} ／{" "}
                  {detail.requestPeriod.status === "open" ? "受付中" : "締切"}
                </span>
              )}
            </div>
          )}
          <label>
            シフト名
            <input
              required
              value={detail.plan.name}
              onChange={(event) =>
                setDetail({
                  ...detail,
                  plan: { ...detail.plan, name: event.target.value },
                })
              }
            />
          </label>
          <label className="plan-notes plan-notes-edit">
            勤務枠の方針・メモ
            <textarea
              rows={3}
              maxLength={2000}
              value={detail.plan.notes ?? ""}
              onChange={(event) =>
                setDetail({
                  ...detail,
                  plan: { ...detail.plan, notes: event.target.value },
                })
              }
            />
          </label>
          <div className="shift-grid-wrap">
            <table className="shift-grid">
              <thead>
                <tr>
                  <th>日付</th>
                  {[...new Set(detail.slots.map((slot) => slot.startTime))]
                    .sort()
                    .map((time) => (
                      <th key={time}>{time}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {dateKeys(detail.plan.startDate, detail.plan.endDate).map(
                  (date) =>
                    closedDates.includes(date) ? (
                      <tr key={date} className="shift-grid-closed">
                        <th>
                          <strong>{formatDateWithWeekday(date)}</strong>
                          <button
                            className="small-action"
                            type="button"
                            onClick={() => reopenDate(date)}
                          >
                            営業日に戻す
                          </button>
                        </th>
                        <td
                          colSpan={
                            [
                              ...new Set(
                                detail.slots.map((slot) => slot.startTime),
                              ),
                            ].length
                          }
                        >
                          <strong>休業中</strong>
                        </td>
                      </tr>
                    ) : (
                      <tr key={date}>
                        <th>
                          <strong>{formatDateWithWeekday(date)}</strong>
                          <button
                            className="small-action danger"
                            type="button"
                            onClick={() => closeDate(date)}
                          >
                            この日を休業
                          </button>
                        </th>
                        {[
                          ...new Set(
                            detail.slots.map((slot) => slot.startTime),
                          ),
                        ]
                          .sort()
                          .map((time) => {
                            const cells = detail.slots.filter(
                              (slot) =>
                                slot.date === date && slot.startTime === time,
                            );
                            return (
                              <td key={`${date}|${time}`}>
                                {cells.length ? (
                                  cells.map((slot) => (
                                    <details
                                      className="shift-grid-slot"
                                      key={slot.id}
                                    >
                                      <summary className="shift-grid-slot-summary">
                                        <strong>{slot.role || duties.find((duty) => duty.id === slot.dutyId)?.name || "共通"}</strong>
                                        <span>{(() => { const scopeIds = Array.isArray(slot.dutyScopeIds) ? slot.dutyScopeIds : (() => { try { return slot.dutyScopeIds ? JSON.parse(slot.dutyScopeIds) as string[] : []; } catch { return []; } })(); return scopeIds.length > 1 ? `＋${scopeIds.length - 1}業務` : ""; })()}</span>
                                        <span>{slot.requiredCount}名</span>
                                      </summary>
                                      <label className="slot-duty-field">
                                        <span>担当（主担当）</span>
                                        <select
                                        className="slot-duty-select"
                                        value={slot.dutyId ?? ""}
                                        onChange={(event) => {
                                          const nextDutyId = event.target.value || null;
                                          const currentScopeIds = Array.isArray(slot.dutyScopeIds) ? slot.dutyScopeIds : (() => { try { return slot.dutyScopeIds ? JSON.parse(slot.dutyScopeIds) as string[] : []; } catch { return []; } })();
                                          updateSlot(slot.id, {
                                            dutyId: nextDutyId,
                                            role: event.target.selectedOptions[0]?.textContent ?? slot.role,
                                            dutyScopeIds: nextDutyId ? [nextDutyId, ...currentScopeIds.filter((dutyId) => dutyId !== slot.dutyId && dutyId !== nextDutyId)] : [],
                                          });
                                        }}
                                        aria-label="担当（主担当）"
                                      >
                                        <option value="">担当なし</option>
                                        {duties
                                          .filter((duty) => duty.status === "active")
                                          .map((duty) => (
                                            <option key={duty.id} value={duty.id}>
                                              {duty.name}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <label className="slot-duty-field">
                                        <span>兼任担当（任意）</span>
                                        <select
                                          className="slot-duty-scope-select"
                                          multiple
                                          size={Math.min(3, Math.max(1, duties.filter((duty) => duty.status === "active").length))}
                                          value={(Array.isArray(slot.dutyScopeIds) ? slot.dutyScopeIds : (() => { try { return slot.dutyScopeIds ? JSON.parse(slot.dutyScopeIds) as string[] : []; } catch { return []; } })()).filter((dutyId) => dutyId !== slot.dutyId)}
                                          onChange={(event) => updateSlot(slot.id, { dutyScopeIds: [slot.dutyId, ...[...event.target.selectedOptions].map((option) => option.value)].filter(Boolean) })}
                                          aria-label="兼任担当（任意）"
                                        >
                                          {duties.filter((duty) => duty.status === "active").map((duty) => <option key={duty.id} value={duty.id}>{duty.name}</option>)}
                                        </select>
                                      </label>
                                      <label className="slot-duty-field slot-count-field">
                                        <span>必要人数</span>
                                        <input
                                          className="slot-count-input"
                                          type="number"
                                          min="1"
                                          max="50"
                                          value={slot.requiredCount}
                                          onChange={(event) => updateSlot(slot.id, { requiredCount: Number(event.target.value) })}
                                          aria-label="必要人数"
                                        />
                                      </label>
                                    </details>
                                  ))
                                ) : (
                                  <span className="shift-grid-empty">—</span>
                                )}
                              </td>
                            );
                          })}
                      </tr>
                    ),
                )}
              </tbody>
            </table>
          </div>
          <div className="shift-actions">
            <button
              className="ghost-button"
              onClick={() => void saveLayout()}
              disabled={busy}
            >
              保存
            </button>
            {detail.requestPeriod?.status === "pending" && (
              <button
                className="primary-button"
                onClick={() => void saveLayout("start-requests")}
                disabled={busy}
              >
                希望受付開始
              </button>
            )}
          </div>
          <p className="shift-help">
            人数・時間・担当を調整できます。休業にした日は、勤務枠を削除して保存します。受付開始後は受付期限を変更できません。
          </p>
        </>
      )}
      {notice && (
        <p className="group-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
