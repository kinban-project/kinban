"use client";

import { useEffect, useMemo, useState } from "react";
import { localApiFetch } from "./local-api";
import { displayShiftTime, shiftTimeToMinutes } from "./shift-time";

type Group = { id: string; name: string; membership: { role: string } };
type Plan = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
};
type Period = {
  id: string;
  groupId: string;
  planId: string;
  name: string;
  opensOn: string;
  closesOn: string;
  status: string;
};
type Availability = {
  dayOfWeek: number;
  status: string;
  startTime: string;
  endTime: string;
  note: string;
};
type Preference = {
  minDays: number;
  maxDays: number;
  minHours: number;
  maxHours: number;
  freeComment: string;
};
type Slot = {
  date: string;
  startTime: string;
  endTime: string;
  requiredCount: number;
  role: string;
};
type RequestRow = {
  userEmail: string;
  date: string;
  startTime: string;
  endTime: string;
  preference: string;
  note: string;
};
type Data = {
  groups: Group[];
  plans: Plan[];
  periods: Period[];
  availability: Availability[];
  preferences?: Preference;
  period: Period | null;
  plan: Plan | null;
  slots: Slot[];
  requests: RequestRow[];
  canManage: boolean;
};

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const labels: Record<string, string> = {
  want: "出勤希望",
  possible: "可能",
  off: "休み希望",
  unavailable: "勤務不可",
};

function dateDay(date: string) {
  return new Date(`${date}T00:00:00`).getDay();
}
function dayKey(slot: Slot) {
  return `${slot.date}|${slot.startTime}|${slot.endTime}`;
}

export default function ShiftRequests({
  initialGroupId,
}: {
  initialGroupId?: string;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [periodId, setPeriodId] = useState("");
  const [availability, setAvailability] = useState<
    Record<number, Availability[]>
  >({});
  const [requestMap, setRequestMap] = useState<Record<string, RequestRow>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activePeriod =
    data?.periods.find((period) => period.id === periodId) ??
    data?.period ??
    null;
  const selectedGroupName = groups.find((group) => group.id === groupId)?.name;
  const slotsByDate = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const slot of data?.slots ?? [])
      map.set(slot.date, [...(map.get(slot.date) ?? []), slot]);
    return map;
  }, [data?.slots]);
  const dates = [...slotsByDate.keys()];
  const times = [
    ...new Map(
      (data?.slots ?? []).map((slot) => [
        `${slot.startTime}|${slot.endTime}`,
        slot,
      ]),
    ).values(),
  ];
  function basePreference(slot: Slot) {
    const rows = availability[dateDay(slot.date)] ?? [];
    if (!rows.length) return "possible";
    const match = rows.find(
      (row) =>
        (!row.startTime && !row.endTime) ||
        (shiftTimeToMinutes(row.startTime) <=
          shiftTimeToMinutes(slot.startTime) &&
          shiftTimeToMinutes(row.endTime) >= shiftTimeToMinutes(slot.endTime)),
    );
    if (!match) return "unavailable";
    return ["want", "off", "unavailable"].includes(match.status)
      ? match.status
      : "possible";
  }

  async function loadGroups() {
    const response = await localApiFetch("/api/groups");
    if (!response.ok) return;
    const next = ((await response.json()) as { groups: Group[] }).groups;
    setGroups(next);
    if (initialGroupId) setGroupId(initialGroupId);
    else if (!groupId && next[0]) setGroupId(next[0].id);
  }
  async function loadData(nextPeriodId = periodId) {
    if (!groupId) return;
    const query = new URLSearchParams({ groupId });
    if (nextPeriodId) query.set("periodId", nextPeriodId);
    const response = await localApiFetch(`/api/shift-requests?${query}`);
    if (!response.ok) return;
    const next = (await response.json()) as Data;
    setData(next);
    setPeriodId(next.period?.id ?? next.periods[0]?.id ?? "");
    const grouped: Record<number, Availability[]> = {};
    for (const entry of next.availability)
      (grouped[entry.dayOfWeek] ??= []).push(entry);
    setAvailability(grouped);
    setRequestMap(
      Object.fromEntries(
        next.requests.map((entry) => [dayKey(entry as Slot), entry]),
      ),
    );
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void loadGroups(), 0);
    return () => window.clearTimeout(timer);
  }, [initialGroupId]);
  useEffect(() => {
    const timer = groupId
      ? window.setTimeout(() => void loadData(), 0)
      : undefined;
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [groupId]);
  useEffect(() => {
    if (periodId && groupId) void loadData(periodId);
  }, [periodId]);

  function setPreference(slot: Slot, preference: string) {
    const key = dayKey(slot);
    setRequestMap((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? {
          userEmail: "",
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          note: "",
        }),
        preference,
      },
    }));
  }
  function setDatePreference(date: string, preference: string) {
    const next = { ...requestMap };
    for (const slot of slotsByDate.get(date) ?? []) {
      const key = dayKey(slot);
      if (preference === "base") delete next[key];
      else
        next[key] = {
          ...(next[key] ?? {
            userEmail: "",
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            note: "",
          }),
          preference,
        };
    }
    setRequestMap(next);
  }
  async function saveRequests() {
    if (!activePeriod) return;
    setBusy(true);
    const response = await localApiFetch("/api/shift-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-requests",
        groupId,
        periodId: activePeriod.id,
        requests: Object.values(requestMap),
      }),
    });
    setNotice(
      response.ok
        ? "勤務希望を保存しました"
        : (((await response.json().catch(() => ({}))) as { error?: string })
            .error ?? "勤務希望を保存できませんでした"),
    );
    setBusy(false);
    if (response.ok) await loadData(activePeriod.id);
  }

  return (
    <section className="shift-requests-card">
      <div className="shift-builder-head">
        <div>
          <p className="eyebrow">SHIFT REQUESTS</p>
          <h2>勤務希望の受付{selectedGroupName ? `（${selectedGroupName}）` : ""}</h2>
        </div>
        <div className="request-header-right">
          {data?.preferences && (
            <div className="request-baseline">
              <strong>基本設定</strong>
              <span>
                週 {data.preferences.minDays}〜{data.preferences.maxDays}日
              </span>
              <span>
                {data.preferences.minHours}〜{data.preferences.maxHours}時間
              </span>
            </div>
          )}
          {!initialGroupId && <select
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>}
        </div>
      </div>
      <div className="request-toolbar">
        <div className="request-period-inline">
          <select
            className="period-select"
            value={periodId}
            onChange={(event) => setPeriodId(event.target.value)}
            disabled={!data?.periods.length}
          >
            <option value="" disabled>
              受付期間を選択
            </option>
            {data?.periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name} ／ {period.opensOn}〜{period.closesOn} ／{" "}
                {period.status === "open" ? "受付中" : "終了"}
              </option>
            ))}
          </select>
        </div>
        <div className="request-legend">
          <span className="legend-base">基本</span>
          <span className="legend-want">出勤希望</span>
          <span className="legend-possible">可能</span>
          <span className="legend-off">休み希望</span>
          <span className="legend-unavailable">勤務不可</span>
        </div>
        {activePeriod && (
          <button
            className="primary-button toolbar-save"
            onClick={() => void saveRequests()}
            disabled={busy || activePeriod.status !== "open"}
          >
            希望を保存
          </button>
        )}
      </div>
      {activePeriod && (
        <div id="request-slots" className="request-section">
          <div className="request-grid-wrap">
            <table className="request-grid">
              <thead>
                <tr>
                  <th>日付</th>
                  {times.map((slot) => (
                    <th key={`${slot.startTime}|${slot.endTime}`}>
                      {displayShiftTime(slot.startTime)}
                      <small>{displayShiftTime(slot.endTime)}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dates.map((date) => (
                  <tr key={date}>
                    <th>
                      <span>{date}</span>
                      <small>（{weekdays[dateDay(date)]}）</small>
                      <select
                        value=""
                        onChange={(event) =>
                          setDatePreference(date, event.target.value)
                        }
                      >
                        <option value="">日付一括</option>
                        <option value="base">基本に戻す</option>
                        <option value="want">出勤希望</option>
                        <option value="possible">可能</option>
                        <option value="off">休み希望</option>
                        <option value="unavailable">勤務不可</option>
                      </select>
                    </th>
                    {times.map((time) => {
                      const slot = (slotsByDate.get(date) ?? []).find(
                        (item) =>
                          item.startTime === time.startTime &&
                          item.endTime === time.endTime,
                      );
                      if (!slot)
                        return <td key={`${date}|${time.startTime}`}>-</td>;
                      const key = dayKey(slot);
                      const override = requestMap[key];
                      const value =
                        override?.preference ?? basePreference(slot);
                      return (
                        <td key={key}>
                          <select
                            className={`request-cell ${override ? "is-override" : "is-base"} preference-${value}`}
                            value={value}
                            onChange={(event) =>
                              setPreference(slot, event.target.value)
                            }
                            aria-label={`${date} ${slot.startTime}`}
                          >
                            {Object.entries(labels).map(([option, label]) => (
                              <option key={option} value={option}>
                                {override ? label : `基本：${label}`}
                              </option>
                            ))}
                          </select>
                          {override && (
                            <small className="override-mark">変更</small>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="request-help">
            通常は基本設定が適用されます。変更したセルだけ「変更」と表示されます。日付左側のメニューから一括変更できます。
          </p>
        </div>
      )}
      {notice && (
        <p className="group-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
