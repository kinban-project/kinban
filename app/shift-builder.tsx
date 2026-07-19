"use client";

import { useEffect, useMemo, useState } from "react";
import { localApiFetch } from "./local-api";
import { getShiftDisplayLabel, getShiftDisplayStatus } from "./shift-status";
import { displayShiftTime } from "./shift-time";
import { toDateTimeLocal } from "./shift-request-deadline";

type Group = { id: string; name: string; membership: { role: string } };
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

function displayStatus(plan: Plan, requestPeriod?: RequestPeriod | null) {
  return getShiftDisplayStatus({
    ...plan,
    requestStatus: requestPeriod?.status ?? plan.requestStatus,
  });
}
type Detail = {
  plan: Plan;
  slots: Slot[];
  assignments: Array<{ slotId: string; userEmail: string }>;
  members: Member[];
  closedDates?: string[];
  requestPeriod?: RequestPeriod | null;
};
type SlotRule = { role: string; requiredCount: string };
type InputMode = "standard" | "custom";

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

const initial = {
  groupId: "",
  name: "7月後半シフト",
  startDate: "2026-07-16",
  endDate: "2026-07-31",
  requestCloseDate: `${defaultRequestCloseDate("2026-07-16")}T23:59`,
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
    { role: "", requiredCount: "2" },
  ]);
  const [inputMode, setInputMode] = useState<InputMode>("standard");
  const [customSlots, setCustomSlots] = useState(customSlotExample);
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

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

  async function loadPlans(groupId: string) {
    if (!groupId) return;
    const response = await localApiFetch(
      `/api/shifts?groupId=${encodeURIComponent(groupId)}`,
    );
    if (response.ok) {
      const nextPlans = ((await response.json()) as { plans: Plan[] }).plans;
      setPlans(nextPlans);
      if (!notes && nextPlans[0]?.notes) setNotes(nextPlans[0].notes);
    }
  }

  async function openPlan(id: string) {
    const response = await localApiFetch(`/api/shifts/${id}`);
    if (response.ok) {
      const next = (await response.json()) as Detail;
      setDetail(next);
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

  async function createPlan(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const response = await localApiFetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        notes,
        slotMinutes: Number(form.slotMinutes),
        slotRules:
          inputMode === "standard"
            ? slotRules.map((rule) => ({
                role: rule.role,
                requiredCount: Number(rule.requiredCount),
              }))
            : undefined,
        customSlots: inputMode === "custom" ? customSlots : undefined,
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
    setBusy(true);
    const response = await localApiFetch(`/api/shifts/${detail.plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        expectedVersion: detail.plan.version,
        requestCloseDate: detail.requestPeriod?.closesOn,
        layout: { notes: detail.plan.notes, slots: detail.slots, closedDates },
      }),
    });
    const data = (await response.json()) as {
      error?: string;
      slotCount?: number;
    };
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
                onChange={(event) =>
                  setForm({ ...form, groupId: event.target.value })
                }
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
                  setForm({ ...form, name: event.target.value })
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
                  onChange={(event) =>
                    setForm({
                      ...form,
                      startDate: event.target.value,
                      requestCloseDate: defaultRequestCloseDate(
                        event.target.value,
                      ),
                    })
                  }
                />
              </label>
              <label>
                終了日
                <input
                  type="date"
                  required
                  value={form.endDate}
                  onChange={(event) =>
                    setForm({ ...form, endDate: event.target.value })
                  }
                />
              </label>
            </div>
            <label>
              シフト希望受付期限
              <input
                type="datetime-local"
                required
                value={form.requestCloseDate}
                onChange={(event) =>
                  setForm({ ...form, requestCloseDate: event.target.value })
                }
              />
              <small className="field-help">
                開始日の15日前を初期値にし、現在日時から2日以内にならないようにしています。必要に応じて変更できます。
              </small>
            </label>
            <fieldset className="slot-input-mode">
              <legend>勤務枠の作り方</legend>
              <label>
                <input
                  type="radio"
                  checked={inputMode === "standard"}
                  onChange={() => setInputMode("standard")}
                />
                通常設定
              </label>
              <label>
                <input
                  type="radio"
                  checked={inputMode === "custom"}
                  onChange={() => setInputMode("custom")}
                />
                カスタム入力
              </label>
            </fieldset>
            {inputMode === "standard" && (
              <div className="form-row">
                <label>
                  開店／開始
                  <select
                    value={form.openingTime}
                    onChange={(event) =>
                      setForm({ ...form, openingTime: event.target.value })
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
                      setForm({ ...form, closingTime: event.target.value })
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
            {inputMode === "standard" ? (
              <>
                <label>
                  区切り時間
                  <select
                    value={form.slotMinutes}
                    onChange={(event) =>
                      setForm({ ...form, slotMinutes: event.target.value })
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
                      <input
                        value={rule.role}
                        onChange={(event) =>
                          updateSlotRule(index, { role: event.target.value })
                        }
                        placeholder="担当・ポジション（例：厨房）"
                      />
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={rule.requiredCount}
                        onChange={(event) =>
                          updateSlotRule(index, {
                            requiredCount: event.target.value,
                          })
                        }
                        aria-label="必要人数"
                      />
                      <span>名</span>
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
                        { role: "", requiredCount: "1" },
                      ])
                    }
                  >
                    ＋担当を追加
                  </button>
                </div>
              </>
            ) : (
              <label className="plan-notes custom-slots-input">
                カスタム勤務枠（JSON）
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
                    <em className={displayStatus(plan)}>
                      {getShiftDisplayLabel(displayStatus(plan))}
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
            <span className={displayStatus(detail.plan, detail.requestPeriod)}>
              {getShiftDisplayLabel(
                displayStatus(detail.plan, detail.requestPeriod),
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
                                    <div
                                      className="shift-grid-slot"
                                      key={slot.id}
                                    >
                                      <strong className="shift-grid-role">
                                        {slot.role || "共通"}
                                      </strong>
                                      <input
                                        className="slot-count-input"
                                        type="number"
                                        min="1"
                                        max="50"
                                        value={slot.requiredCount}
                                        onChange={(event) =>
                                          updateSlot(slot.id, {
                                            requiredCount: Number(
                                              event.target.value,
                                            ),
                                          })
                                        }
                                      />
                                    </div>
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
