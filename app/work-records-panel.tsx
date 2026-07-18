"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { localApiFetch } from "./local-api";
import { shiftDateTime } from "./shift-time";

type RecordRow = {
  id: string;
  userEmail: string;
  scheduledDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  startedAt?: string | null;
  endedAt?: string | null;
  claimedStartAt?: string | null;
  claimedEndAt?: string | null;
  claimedBreakMinutes?: number | null;
  status: string;
  attendanceExpired?: boolean;
  employeeNote?: string;
  managerNote?: string;
  monthlyClosedAt?: string | null;
  monthlyClosedBy?: string | null;
};
type ScheduleRow = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  role?: string;
  planName: string;
  userEmail: string;
  record: RecordRow | null;
};
type Member = { userEmail: string; displayName?: string | null };
type BreakRow = {
  id: string;
  workRecordId: string;
  startedAt: string;
  endedAt?: string | null;
};
type Draft = {
  start: string;
  end: string;
  breakMinutes: number;
  note?: string;
};

function statusLabel(value: string, ended = false) {
  if (value === "working") return ended ? "未申告" : "勤務中";
  return (
    (
      {
        unsubmitted: "未申告",
        submitted: "承認待ち",
        approved: "承認済み",
        rejected: "差戻し",
      } as Record<string, string>
    )[value] ?? value
  );
}
function formatTime(value?: string | null) {
  if (value && Number.isNaN(new Date(value).getTime())) return "";
  if (!value) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
function formatClock(value?: string | null) {
  if (value && Number.isNaN(new Date(value).getTime())) return "";
  if (!value) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
function timeOnly(value: string, date: string) {
  if (!value) return "";
  const base = new Date(`${date}T00:00:00+09:00`).getTime();
  const minutes = Math.round((new Date(value).getTime() - base) / 60000);
  if (!Number.isFinite(minutes)) return "";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
function withDate(date: string, value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 30 || minutes > 59) return "";
  const base = new Date(`${date}T00:00:00+09:00`);
  base.setMinutes(hours * 60 + minutes);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(base);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
}
const timeOptions = Array.from({ length: 61 }, (_, index) => {
  const total = index * 30;
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  const value =
    String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
  const next =
    hour >= 24
      ? "（翌" +
        String(hour - 24).padStart(2, "0") +
        ":" +
        String(minute).padStart(2, "0") +
        "）"
      : "";
  return { value, label: value + next };
});
function TimeSelect({
  value,
  date,
  label,
  onChange,
  disabled = false,
}: {
  value: string;
  date: string;
  label: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="claim-time-select"
      aria-label={label}
      value={timeOnly(value, date)}
      disabled={disabled}
      onChange={(event) => onChange(withDate(date, event.target.value))}
    >
      <option value="">--:--</option>
      {timeOptions.map((option) => (
        <option value={option.value} key={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
function localDateTime(value?: string | null) {
  if (!value) return "";
  if (Number.isNaN(new Date(value).getTime())) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function daysForMonth(key: string) {
  const [year, month] = key.split("-").map(Number);
  const count = new Date(year, month, 0).getDate();
  return Array.from(
    { length: count },
    (_, index) => `${key}-${String(index + 1).padStart(2, "0")}`,
  );
}
function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return `${year}年${month}月`;
}
function dayLabel(date: string) {
  const day = new Date(`${date}T00:00:00+09:00`);
  return `${Number(date.slice(8, 10))}日（${"日月火水木金土"[day.getDay()]}）`;
}
function breakMinutes(rows: BreakRow[]) {
  return rows.reduce(
    (total, item) =>
      item.endedAt
        ? total +
          Math.max(
            0,
            Math.round(
              (new Date(item.endedAt).getTime() -
                new Date(item.startedAt).getTime()) /
                60000,
            ),
          )
        : total,
    0,
  );
}
function workedMinutes(row: RecordRow, breaks: BreakRow[]) {
  if (!row.startedAt || !row.endedAt) return null;
  return Math.max(
    0,
    Math.round(
      (new Date(row.endedAt).getTime() - new Date(row.startedAt).getTime()) /
        60000,
    ) - breakMinutes(breaks),
  );
}
function claimedMinutes(draft?: Draft | null) {
  if (!draft?.start || !draft.end) return null;
  const start = new Date(draft.start).getTime();
  const end = new Date(draft.end).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return null;
  return Math.max(
    0,
    Math.round((end - start) / 60000) - Math.max(0, draft.breakMinutes),
  );
}
function formatMinutes(value: number | null) {
  if (value === null) return "—";
  return `${Math.floor(value / 60)}時間${String(value % 60).padStart(2, "0")}分`;
}
function rangeMinutes(
  date: string,
  start?: string | null,
  end?: string | null,
) {
  if (!start || !end) return null;
  const from = shiftDateTime(date, start);
  const to = shiftDateTime(date, end);
  const startAt = new Date(`${from.date}T${from.time}:00+09:00`).getTime();
  const endAt = new Date(`${to.date}T${to.time}:00+09:00`).getTime();
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt)
    return null;
  return Math.round((endAt - startAt) / 60000);
}
function claimedRangeMinutes(record: RecordRow, breaks: BreakRow[]) {
  if (!record.claimedStartAt || !record.claimedEndAt) return null;
  const value = Math.round(
    (new Date(record.claimedEndAt).getTime() -
      new Date(record.claimedStartAt).getTime()) /
      60000,
  );
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.max(
    0,
    value - Math.max(0, record.claimedBreakMinutes ?? breakMinutes(breaks)),
  );
}
function claimClock(value: string | null | undefined, date: string) {
  return value ? timeOnly(value, date) : "—";
}

export default function WorkRecordsPanel({
  groupId,
  manager = false,
}: {
  groupId: string;
  manager?: boolean;
}) {
  const [groupName, setGroupName] = useState("");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [breaks, setBreaks] = useState<BreakRow[]>([]);
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [claimDrafts, setClaimDrafts] = useState<Record<string, Draft>>({});
  const [manualDrafts, setManualDrafts] = useState<Record<string, Draft>>({});
  const [month, setMonth] = useState(monthKey(new Date()));
  const [monthlyStatus, setMonthlyStatus] = useState("unsubmitted");
  const [monthlyBusy, setMonthlyBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  async function load() {
    setBusy(true);
    const response = await localApiFetch(`/api/groups/${groupId}/work-records`);
    if (response.ok) {
      const data = (await response.json()) as {
        group?: { name?: string };
        records?: RecordRow[];
        breaks?: BreakRow[];
        schedule?: ScheduleRow[];
        members?: Member[];
      };
      const nextRecords = data.records ?? [];
      const nextBreaks = data.breaks ?? [];
      setGroupName(data.group?.name ?? "");
      setRecords(nextRecords);
      setBreaks(nextBreaks);
      setSchedule(data.schedule ?? []);
      setMembers(data.members ?? []);
      setClaimDrafts(
        Object.fromEntries(
          nextRecords.map((record) => [
            record.id,
            {
              start: localDateTime(record.claimedStartAt ?? record.startedAt),
              end: localDateTime(record.claimedEndAt ?? record.endedAt),
              breakMinutes:
                record.claimedBreakMinutes ??
                breakMinutes(
                  nextBreaks.filter((item) => item.workRecordId === record.id),
                ),
              note: record.employeeNote ?? "",
            },
          ]),
        ),
      );
      setNotice("");
    } else setNotice("勤務状況を読み込めませんでした。");
    setBusy(false);
  }
  useEffect(() => {
    void load();
    return () => Object.values(saveTimers.current).forEach(clearTimeout);
  }, [groupId]);
  async function loadMonthlyStatus() {
    const response = await localApiFetch(
      `/api/groups/${groupId}/monthly-work?month=${month}`,
    );
    if (!response.ok) return;
    const data = (await response.json()) as {
      claims?: Array<{ userEmail: string; status: string }>;
      currentUserEmail?: string;
    };
    const claim = data.claims?.find(
      (item) => item.userEmail === data.currentUserEmail,
    );
    setMonthlyStatus(claim?.status ?? "unsubmitted");
  }
  useEffect(() => {
    void loadMonthlyStatus();
  }, [groupId, month]);
  async function submitMonthly() {
    setMonthlyBusy(true);
    const response = await localApiFetch(`/api/groups/${groupId}/monthly-work`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", month }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setNotice(
      response.ok
        ? "月次申告を提出しました。"
        : (data.error ?? "月次申告を提出できませんでした。"),
    );
    if (response.ok) setMonthlyStatus("submitted");
    setMonthlyBusy(false);
  }
  async function monthAction(
    action: "close-month" | "reopen-month",
    monthKeyValue: string,
  ) {
    const response = await patch({ action, monthKey: monthKeyValue });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setNotice(
      response.ok
        ? action === "close-month"
          ? `${monthKeyValue}を締めました。`
          : `${monthKeyValue}の締めを取り消しました。`
        : (data.error ?? "月次締めを更新できませんでした。"),
    );
    if (response.ok) await load();
  }
  async function patch(body: Record<string, unknown>) {
    return localApiFetch(`/api/groups/${groupId}/work-records`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  async function review(recordId: string, status: "approved" | "rejected", managerNote = "") {
    const response = await patch({ recordId, status, ...(status === "rejected" ? { managerNote } : {}) });
    setNotice(
      response.ok
        ? status === "approved"
          ? "勤務記録を承認しました。"
          : "勤務記録を差し戻しました。"
        : "勤務記録を更新できませんでした。",
    );
    if (response.ok) await load();
    return response.ok;
  }
  async function reviewMany(recordIds: string[]) {
    if (!recordIds.length) return;
    setBusy(true);
    let succeeded = 0;
    for (const recordId of recordIds) {
      const response = await patch({ recordId, status: "approved" });
      if (response.ok) succeeded += 1;
    }
    setNotice(`${succeeded}件を承認しました。`);
    await load();
    setBusy(false);
  }
  async function saveClaim(record: RecordRow, draft = claimDrafts[record.id]) {
    if (!draft?.start) return;
    const response = await patch({
      action: "save-claim",
      recordId: record.id,
      claimedStartAt: draft.start,
      claimedEndAt: draft.end,
      claimedBreakMinutes: draft.breakMinutes,
      employeeNote: draft.note ?? "",
    });
    if (!response.ok)
      setNotice(
        ((await response.json().catch(() => ({}))) as { error?: string })
          .error ?? "申告内容を保存できませんでした。",
      );
  }
  function updateDraft(record: RecordRow, next: Partial<Draft>) {
    const merged = {
      ...(claimDrafts[record.id] ?? { start: "", end: "", breakMinutes: 0 }),
      ...next,
    };
    setClaimDrafts((current) => ({ ...current, [record.id]: merged }));
    clearTimeout(saveTimers.current[record.id]);
    saveTimers.current[record.id] = setTimeout(
      () => void saveClaim(record, merged),
      500,
    );
  }
  async function applySchedule(record: RecordRow) {
    const response = await patch({
      action: "apply-schedule",
      recordId: record.id,
    });
    setNotice(
      response.ok
        ? "シフトの予定時刻を申告時間に反映しました。内容を確認して申請してください。"
        : "シフト時刻を反映できませんでした。",
    );
    if (response.ok) await load();
  }
  async function createClaim(slot: ScheduleRow) {
    const start = shiftDateTime(slot.date, slot.startTime);
    const end = shiftDateTime(slot.date, slot.endTime);
    const response = await localApiFetch(
      `/api/groups/${groupId}/work-records`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-claim",
          slotId: slot.id,
          claimedStartAt: `${start.date}T${start.time}`,
          claimedEndAt: `${end.date}T${end.time}`,
        }),
      },
    );
    setNotice(
      response.ok
        ? "過去の勤務申告を作成しました。内容を確認して申請してください。"
        : "勤務申告を作成できませんでした。",
    );
    if (response.ok) await load();
  }
  async function createManualClaim(date: string, draft: Draft) {
    if (!draft.start || !draft.end) return;
    const response = await localApiFetch(
      `/api/groups/${groupId}/work-records`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-manual-claim",
          scheduledDate: date,
          claimedStartAt: draft.start,
          claimedEndAt: draft.end,
        }),
      },
    );
    setNotice(
      response.ok
        ? "勤務申告を作成しました。内容を確認して申請してください。"
        : "勤務申告を作成できませんでした。",
    );
    if (response.ok) await load();
  }
  function updateManualDraft(date: string, next: Draft) {
    setManualDrafts((current) => ({ ...current, [date]: next }));
    if (next.start && next.end) void createManualClaim(date, next);
  }
  async function submit(record: RecordRow) {
    const draft = claimDrafts[record.id];
    if (!draft?.start || !draft.end) {
      setNotice("開始・終了の申告時間を入力してください。");
      return;
    }
    const response = await patch({
      action: "submit-claim",
      recordId: record.id,
      claimedStartAt: draft.start,
      claimedEndAt: draft.end,
    });
    if (response.status === 409) {
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (
        !window.confirm(
          `${data.error ?? "シフト予定と大きく異なります。"}\nこの内容で申請しますか？`,
        )
      )
        return;
      const confirmed = await patch({
        action: "submit-claim",
        recordId: record.id,
        claimedStartAt: draft.start,
        claimedEndAt: draft.end,
        confirm: true,
      });
      setNotice(
        confirmed.ok
          ? "勤務記録を申請しました。"
          : "勤務記録を申請できませんでした。",
      );
      if (confirmed.ok) await load();
      return;
    }
    setNotice(
      response.ok
        ? "勤務記録を申請しました。"
        : (((await response.json().catch(() => ({}))) as { error?: string })
            .error ?? "勤務記録を申請できませんでした。"),
    );
    if (response.ok) await load();
  }

  const names = useMemo(
    () =>
      new Map(
        members.map((member) => [
          member.userEmail,
          member.displayName?.trim() || member.userEmail.split("@")[0],
        ]),
      ),
    [members],
  );
  const breaksFor = (id: string) =>
    breaks.filter((item) => item.workRecordId === id);
  const activeRecords = records.filter(
    (record) =>
      record.status === "working" &&
      !record.endedAt &&
      !record.attendanceExpired,
  );
  const pendingRecords = records.filter(
    (record) => record.status === "submitted",
  );
  const days = daysForMonth(month);
  const recordsByDate = useMemo(
    () => new Map(records.map((record) => [record.scheduledDate, record])),
    [records],
  );
  const schedulesByDate = useMemo(
    () => new Map(schedule.map((item) => [item.date, item])),
    [schedule],
  );
  function moveMonth(offset: number) {
    const [year, current] = month.split("-").map(Number);
    const date = new Date(year, current - 1 + offset, 1);
    setMonth(monthKey(date));
  }
  const today = todayKey();
  const monthSummary = useMemo(
    () =>
      days.reduce(
        (summary, date) => {
          const record = recordsByDate.get(date);
          if (!record) return summary;
          const draft = claimDrafts[record.id];
          const work = claimedMinutes(draft);
          if (work === null) return summary;
          return {
            days: summary.days + 1,
            work: summary.work + work,
            breaks: summary.breaks + Math.max(0, draft.breakMinutes),
          };
        },
        { days: 0, work: 0, breaks: 0 },
      ),
    [days, recordsByDate, claimDrafts],
  );
  const monthlyIncomplete = records.some(
    (record) =>
      record.scheduledDate.startsWith(month) &&
      (!record.claimedStartAt ||
        !record.claimedEndAt ||
        record.status === "working"),
  );
  const monthlyStatusLabel =
    monthlyStatus === "approved"
      ? "月次承認済み"
      : monthlyStatus === "submitted"
        ? "月次承認待ち"
        : monthlyStatus === "rejected"
          ? "差戻し"
          : "月次申告待ち";
  return (
    <section className="work-records-panel">
      <div className="modal-head">
        <div>
          <p className="eyebrow">WORK RECORDS</p>
          <h2>
            {manager ? "日次承認" : "勤務申告"}
            {groupName ? `（${groupName}）` : ""}
          </h2>
        </div>
      </div>
      {manager ? (
        <ManagerView
          records={records}
          members={members}
          breaksFor={breaksFor}
          activeRecords={activeRecords}
          pendingRecords={pendingRecords}
          review={review}
          reviewMany={reviewMany}
          monthAction={monthAction}
        />
      ) : (
        <>
          <div className="work-month-toolbar">
            <button className="small-action" onClick={() => moveMonth(-1)}>
              前月
            </button>
            <select
              aria-label="表示月"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            >
              {Array.from({ length: 13 }, (_, index) => {
                const date = new Date();
                date.setMonth(date.getMonth() - 6 + index, 1);
                const key = monthKey(date);
                return (
                  <option value={key} key={key}>
                    {monthLabel(key)}
                  </option>
                );
              })}
            </select>
            <button className="small-action" onClick={() => moveMonth(1)}>
              次月
            </button>
          </div>
          <p className="work-month-help">
            日付に関係なく当月の勤務記録を表示します。入力内容は変更時に自動保存されます。
          </p>
          <div className="work-records-summary monthly-work-summary">
            <strong>勤務日数 {monthSummary.days}日</strong>
            <span>実働 {formatMinutes(monthSummary.work)}</span>
            <span>休憩 {formatMinutes(monthSummary.breaks)}</span>
            <span className={`work-status work-status-${monthlyStatus}`}>
              {monthlyStatusLabel}
            </span>
            <button
              className="primary-button"
              disabled={
                monthlyBusy || monthlyIncomplete || monthlyStatus === "approved"
              }
              onClick={() => void submitMonthly()}
            >
              {monthlyStatus === "submitted" ? "月次申告済み" : "月次申告"}
            </button>
          </div>
          <div className="monthly-work-wrap work-records-table-wrap">
            <table className="work-records-table monthly-work-table">
              <thead>
                <tr>
                  <th>日付</th>
                  <th>シフト予定</th>
                  <th>打刻</th>
                  <th>打刻休憩</th>
                  <th>申告時間</th>
                  <th>申告休憩</th>
                  <th>実働時間</th>
                  <th>備考</th>
                  <th>状態</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {days.map((date) => {
                  const record = recordsByDate.get(date);
                  const planned = schedulesByDate.get(date);
                  const draft = record
                    ? (claimDrafts[record.id] ?? {
                        start: localDateTime(
                          record.claimedStartAt ?? record.startedAt,
                        ),
                        end: localDateTime(
                          record.claimedEndAt ?? record.endedAt,
                        ),
                        breakMinutes:
                          record.claimedBreakMinutes ??
                          breakMinutes(breaksFor(record.id)),
                      })
                    : null;
                  const manual = manualDrafts[date] ?? {
                    start: "",
                    end: "",
                    breakMinutes: 0,
                  };
                  const past = date <= today;
                  return (
                    <tr key={date}>
                      <th>{dayLabel(date)}</th>
                      <td>
                        {planned ? (
                          <>
                            <span className="monthly-shift-ref">
                              {planned.startTime}〜{planned.endTime}
                            </span>
                            {record ? (
                              !record.monthlyClosedAt && (
                                <button
                                  className="small-action"
                                  disabled={busy}
                                  onClick={() => void applySchedule(record)}
                                >
                                  シフト通り
                                </button>
                              )
                            ) : past ? (
                              <button
                                className="small-action"
                                disabled={busy}
                                onClick={() => void createClaim(planned)}
                              >
                                シフト通り
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <span className="monthly-record-value">対象なし</span>
                        )}
                      </td>
                      <td>
                        {record ? (
                          <span className="monthly-record-value">
                            {formatClock(record.startedAt)}〜
                            {formatClock(record.endedAt)}
                          </span>
                        ) : (
                          <span className="monthly-record-value">—</span>
                        )}
                      </td>
                      <td>
                        {record
                          ? `${breakMinutes(breaksFor(record.id))}分`
                          : "—"}
                      </td>
                      <td>
                        {record ? (
                          <>
                            <div className="claim-time-fields monthly-claim">
                            <TimeSelect
                              value={draft?.start ?? ""}
                              date={date}
                              label={`${date} 申告開始`}
                              disabled={Boolean(record.monthlyClosedAt)}
                              onChange={(value) =>
                                updateDraft(record, {
                                  start: value,
                                  end: draft?.end ?? "",
                                })
                              }
                            />
                            <span>〜</span>
                            <TimeSelect
                              value={draft?.end ?? ""}
                              date={date}
                              label={`${date} 申告終了`}
                              disabled={Boolean(record.monthlyClosedAt)}
                              onChange={(value) =>
                                updateDraft(record, {
                                  start: draft?.start ?? "",
                                  end: value,
                                })
                              }
                            />
                            </div>
                            {record.status === "rejected" && record.managerNote && <div className="work-rejection-note">差戻し理由：{record.managerNote}</div>}
                          </>
                        ) : past ? (
                          <div className="claim-time-fields monthly-claim">
                            <TimeSelect
                              value={manual.start}
                              date={date}
                              label={`${date} 申告開始`}
                              onChange={(value) =>
                                updateManualDraft(date, {
                                  start: value,
                                  end: manual.end,
                                })
                              }
                            />
                            <span>〜</span>
                            <TimeSelect
                              value={manual.end}
                              date={date}
                              label={`${date} 申告終了`}
                              onChange={(value) =>
                                updateManualDraft(date, {
                                  start: manual.start,
                                  end: value,
                                })
                              }
                            />
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {record ? (
                          <div className="claim-break-field">
                            <input
                              type="number"
                              min={0}
                              max={1440}
                              step={1}
                              value={draft?.breakMinutes ?? 0}
                              disabled={Boolean(record.monthlyClosedAt)}
                              aria-label={`${date} 申告休憩`}
                              onChange={(event) =>
                                updateDraft(record, {
                                  breakMinutes: Math.max(
                                    0,
                                    Math.min(
                                      1440,
                                      Number(event.target.value) || 0,
                                    ),
                                  ),
                                })
                              }
                            />
                            <span>分</span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {record ? formatMinutes(claimedMinutes(draft)) : "—"}
                      </td>
                      <td>
                        {record ? (
                          <input
                            className="monthly-note"
                            value={draft?.note ?? ""}
                            placeholder="理由・備考"
                            disabled={Boolean(record.monthlyClosedAt)}
                            maxLength={500}
                            aria-label={`${date} 備考`}
                            onChange={(event) =>
                              updateDraft(record, { note: event.target.value })
                            }
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {record ? (
                          <span
                            className={
                              "work-status work-status-" + record.status
                            }
                          >
                            {record.attendanceExpired
                              ? "—"
                              : statusLabel(
                                  record.status,
                                  Boolean(record.endedAt),
                                )}
                          </span>
                        ) : planned ? (
                          <span className="work-status work-status-unsubmitted">
                            未申告
                          </span>
                        ) : (
                          <span className="work-status work-status-none">
                            —
                          </span>
                        )}
                      </td>
                      <td>
                        {record &&
                        ["working", "unsubmitted", "rejected"].includes(record.status) &&
                        (record.endedAt || draft?.end) ? (
                          <button
                            className="small-action"
                            disabled={busy}
                            onClick={() => void submit(record)}
                          >
                            申請
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function ManagerView({
  records,
  members,
  breaksFor,
  activeRecords,
  pendingRecords,
  review,
  reviewMany,
  monthAction,
}: {
  records: RecordRow[];
  members: Member[];
  breaksFor: (id: string) => BreakRow[];
  activeRecords: RecordRow[];
  pendingRecords: RecordRow[];
  review: (id: string, status: "approved" | "rejected", managerNote?: string) => Promise<boolean>;
  reviewMany: (ids: string[]) => Promise<void>;
  monthAction: (
    action: "close-month" | "reopen-month",
    monthKey: string,
  ) => Promise<void>;
}) {
  const names = new Map(
    members.map((member) => [
      member.userEmail,
      member.displayName?.trim() || member.userEmail.split("@")[0],
    ]),
  );
  const [month, setMonth] = useState(monthKey(new Date()));
  const [day, setDay] = useState("all");
  const [member, setMember] = useState("all");
  const [status, setStatus] = useState("submitted");
  const [differenceFilter, setDifferenceFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<RecordRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RecordRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
  async function confirmReject() {
    if (!rejectTarget || !rejectReason.trim()) return;
    setRejectBusy(true);
    const succeeded = await review(rejectTarget.id, "rejected", rejectReason.trim());
    if (succeeded) {
      setRejectTarget(null);
      setRejectReason("");
    }
    setRejectBusy(false);
  }
  const monthRecords = records.filter((record) =>
    record.scheduledDate.startsWith(month),
  );
  const monthLocked =
    monthRecords.length > 0 &&
    monthRecords.every((record) => Boolean(record.monthlyClosedAt));
  const monthReadyToClose =
    monthRecords.length > 0 &&
    monthRecords.every((record) => record.status === "approved");
  const days = Array.from(
    new Set(monthRecords.map((record) => record.scheduledDate)),
  ).sort();
  const hasIssue = (record: RecordRow) => {
    const planned = rangeMinutes(
      record.scheduledDate,
      record.scheduledStartTime,
      record.scheduledEndTime,
    );
    const claimed = claimedRangeMinutes(record, breaksFor(record.id));
    return (
      !record.claimedStartAt ||
      !record.claimedEndAt ||
      planned === null ||
      claimed === null ||
      Math.abs(claimed - planned) >= 15
    );
  };
  const severity = (record: RecordRow) => {
    const planned = rangeMinutes(
      record.scheduledDate,
      record.scheduledStartTime,
      record.scheduledEndTime,
    );
    const claimed = claimedRangeMinutes(record, breaksFor(record.id));
    if (!record.claimedStartAt || !record.claimedEndAt || claimed === null)
      return "danger";
    if (planned !== null && Math.abs(claimed - planned) >= 120) return "danger";
    if (planned !== null && Math.abs(claimed - planned) >= 15) return "warn";
    return "";
  };
  const filtered = monthRecords.filter((record) => {
    const issue = hasIssue(record);
    return (
      (day === "all" || record.scheduledDate === day) &&
      (member === "all" || record.userEmail === member) &&
      (status === "all" || record.status === status) &&
      (differenceFilter === "all" ||
        (differenceFilter === "issue" ? issue : !issue))
    );
  });
  const pendingFiltered = filtered.filter(
    (record) => record.status === "submitted",
  );
  const selectedPending = selected.filter((id) =>
    pendingFiltered.some((record) => record.id === id),
  );
  useEffect(() => {
    setSelected(pendingFiltered.map((record) => record.id));
  }, [month, day, member, status, differenceFilter, records]);
  function toggleSelected(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  function bulkApprove() {
    if (!selectedPending.length) return;
    if (!window.confirm(`${selectedPending.length}件を一括承認しますか？`))
      return;
    void reviewMany(selectedPending).then(() => setSelected([]));
  }
  function monthLabelFor(key: string) {
    const [year, value] = key.split("-").map(Number);
    return `${year}年${value}月`;
  }
  return (
    <>
      <div className="approval-month-controls">
        {monthLocked ? (
          <>
            <span className="approval-month-locked">月次締め済み</span>
            <button
              className="small-action"
              onClick={() => {
                if (window.confirm(`${month}の締めを取り消しますか？`))
                  void monthAction("reopen-month", month);
              }}
            >
              締めを取り消す
            </button>
          </>
        ) : (
          <button
            className="primary-button"
            disabled={!monthReadyToClose}
            title={
              !monthReadyToClose
                ? "すべて承認済みになると締められます。"
                : undefined
            }
            onClick={() => {
              if (
                window.confirm(
                  `${month}を締めますか？締め後は管理者が取り消すまで変更できません。`,
                )
              )
                void monthAction("close-month", month);
            }}
          >
            月次締め
          </button>
        )}
      </div>
      <div className="approval-toolbar">
        <select
          aria-label="承認対象月"
          value={month}
          onChange={(event) => {
            setMonth(event.target.value);
            setDay("all");
          }}
        >
          <option value={month}>{monthLabelFor(month)}</option>
          {Array.from(
            new Set(records.map((record) => record.scheduledDate.slice(0, 7))),
          )
            .filter((value) => value !== month)
            .sort()
            .reverse()
            .map((value) => (
              <option value={value} key={value}>
                {monthLabelFor(value)}
              </option>
            ))}
        </select>
        <select
          aria-label="承認対象日"
          value={day}
          onChange={(event) => setDay(event.target.value)}
        >
          <option value="all">日付：すべて</option>
          {days.map((value) => (
            <option value={value} key={value}>
              {value.slice(5)}
            </option>
          ))}
        </select>
        <select
          aria-label="承認対象メンバー"
          value={member}
          onChange={(event) => setMember(event.target.value)}
        >
          <option value="all">メンバー：すべて</option>
          {members.map((item) => (
            <option value={item.userEmail} key={item.userEmail}>
              {names.get(item.userEmail)}
            </option>
          ))}
        </select>
        <select
          aria-label="承認対象状態"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="submitted">承認待ち</option>
          <option value="all">状態：すべて</option>
          <option value="approved">承認済み</option>
          <option value="rejected">差戻し</option>
          <option value="unsubmitted">未申告</option>
        </select>
        <select
          aria-label="差分フィルタ"
          value={differenceFilter}
          onChange={(event) => setDifferenceFilter(event.target.value)}
        >
          <option value="all">差分：すべて</option>
          <option value="none">差分なし</option>
          <option value="issue">要確認</option>
        </select>
      </div>
      <div className="work-records-summary approval-summary">
        <strong>承認待ち {pendingFiltered.length}件</strong>
        <span>表示 {filtered.length}件</span>
        <span>
          未申告{" "}
          {filtered.filter((record) => record.status === "unsubmitted").length}
          件
        </span>
        <span className="approval-summary-issue">
          要確認 {filtered.filter(hasIssue).length}件
        </span>
        {selectedPending.length > 0 && (
          <button className="primary-button" onClick={bulkApprove}>
            選択中を一括承認（{selectedPending.length}件）
          </button>
        )}
      </div>
      <div className="approval-table-wrap work-records-table-wrap">
        <table className="work-records-table approval-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="表示中の承認待ちをすべて選択"
                  checked={
                    pendingFiltered.length > 0 &&
                    selectedPending.length === pendingFiltered.length
                  }
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? pendingFiltered.map((record) => record.id)
                        : [],
                    )
                  }
                />
              </th>
              <th>日付</th>
              <th>メンバー</th>
              <th>シフト予定</th>
              <th>申告時間</th>
              <th>差分</th>
              <th>休憩</th>
              <th>備考</th>
              <th>状態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? (
              filtered.map((record) => {
                const breaks = breaksFor(record.id);
                const planned = rangeMinutes(
                  record.scheduledDate,
                  record.scheduledStartTime,
                  record.scheduledEndTime,
                );
                const claimed = claimedRangeMinutes(record, breaks);
                const diff =
                  planned !== null && claimed !== null
                    ? claimed - planned
                    : null;
                const tone = severity(record);
                return (
                  <tr
                    key={record.id}
                    className={tone ? `approval-row-${tone}` : ""}
                  >
                    <td>
                      {record.status === "submitted" ? (
                        <input
                          type="checkbox"
                          aria-label={`${record.scheduledDate} ${names.get(record.userEmail)}を選択`}
                          checked={selected.includes(record.id)}
                          onChange={() => toggleSelected(record.id)}
                        />
                      ) : null}
                    </td>
                    <td>{record.scheduledDate}</td>
                    <td>
                      {names.get(record.userEmail) ??
                        record.userEmail.split("@")[0]}
                    </td>
                    <td>
                      {record.scheduledStartTime || "—"}〜
                      {record.scheduledEndTime || "—"}
                      <small>
                        {planned !== null ? formatMinutes(planned) : "時間不明"}
                      </small>
                    </td>
                    <td>
                      {claimClock(record.claimedStartAt, record.scheduledDate)}
                      〜{claimClock(record.claimedEndAt, record.scheduledDate)}
                      <small>
                        {claimed !== null
                          ? `実働 ${formatMinutes(claimed)}`
                          : "開始・終了未入力"}
                      </small>
                    </td>
                    <td
                      className={diff === null ? "approval-diff-missing" : ""}
                    >
                      {diff === null
                        ? "要確認"
                        : `${diff >= 0 ? "+" : "−"}${formatMinutes(Math.abs(diff))}`}
                    </td>
                    <td>
                      {record.claimedBreakMinutes ?? breakMinutes(breaks)}分
                    </td>
                    <td className="approval-note-cell">
                      {record.employeeNote || "—"}
                    </td>
                    <td>
                      <span
                        className={`work-status work-status-${record.status}${record.status === "submitted" ? " work-status-manager-pending" : ""}`}
                      >
                        {record.attendanceExpired
                          ? "打刻漏れ"
                          : statusLabel(record.status, Boolean(record.endedAt))}
                      </span>
                    </td>
                    <td>
                      <button
                        className="small-action"
                        onClick={() => setDetail(record)}
                      >
                        詳細
                      </button>
                      {record.status === "submitted" && (
                        <>
                          <button
                            className="small-action"
                            onClick={() => void review(record.id, "approved")}
                          >
                            承認
                          </button>
                          <button
                            className="small-action danger"
                            onClick={() => { setRejectTarget(record); setRejectReason(record.managerNote ?? ""); }}
                          >
                            差戻し
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10}>条件に一致する勤務記録はありません。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {detail && (
        <div
          className="approval-detail-overlay"
          role="dialog"
          aria-modal="true"
        >
          <div className="approval-detail-panel">
            <div className="modal-head">
              <div>
                <p className="eyebrow">WORK REVIEW</p>
                <h3>
                  {names.get(detail.userEmail) ?? detail.userEmail} ／{" "}
                  {detail.scheduledDate}
                </h3>
              </div>
              <button className="small-action" onClick={() => setDetail(null)}>
                閉じる
              </button>
            </div>
            <div className="approval-detail-grid">
              <div>
                <span>シフト予定</span>
                <strong>
                  {detail.scheduledStartTime || "—"}〜
                  {detail.scheduledEndTime || "—"}
                </strong>
              </div>
              <div>
                <span>打刻</span>
                <strong>
                  {formatTime(detail.startedAt)}〜{formatTime(detail.endedAt)}
                </strong>
              </div>
              <div>
                <span>申告時間</span>
                <strong>
                  {claimClock(detail.claimedStartAt, detail.scheduledDate)}〜
                  {claimClock(detail.claimedEndAt, detail.scheduledDate)}
                </strong>
              </div>
              <div>
                <span>申告休憩</span>
                <strong>
                  {detail.claimedBreakMinutes ??
                    breakMinutes(breaksFor(detail.id))}
                  分
                </strong>
              </div>
              <div>
                <span>実働</span>
                <strong>
                  {claimedRangeMinutes(detail, breaksFor(detail.id)) === null
                    ? "要確認"
                    : formatMinutes(
                        claimedRangeMinutes(detail, breaksFor(detail.id)),
                      )}
                </strong>
              </div>
              <div>
                <span>状態</span>
                <strong>
                  {statusLabel(detail.status, Boolean(detail.endedAt))}
                </strong>
              </div>
            </div>
            <div className="approval-detail-note">
              <span>本人の備考</span>
              <p>{detail.employeeNote || "記載なし"}</p>
            </div>
            <div className="approval-detail-actions">
              {detail.status === "submitted" && (
                <>
                  <button
                    className="primary-button"
                    onClick={() => {
                      void review(detail.id, "approved");
                      setDetail(null);
                    }}
                  >
                    承認
                  </button>
                  <button
                    className="small-action danger"
                    onClick={() => {
                      setRejectTarget(detail);
                      setRejectReason(detail.managerNote ?? "");
                      setDetail(null);
                    }}
                  >
                    差戻し
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {rejectTarget && (
        <div className="approval-detail-overlay" role="dialog" aria-modal="true">
          <div className="approval-detail-panel rejection-dialog">
            <div className="modal-head">
              <div>
                <p className="eyebrow">REJECTION REASON</p>
                <h3>差戻し理由</h3>
                <p className="rejection-target">
                  {names.get(rejectTarget.userEmail) ?? rejectTarget.userEmail} ・ {rejectTarget.scheduledDate}
                </p>
              </div>
              <button className="small-action" type="button" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>
                閉じる
              </button>
            </div>
            <div className="rejection-presets" aria-label="差戻し理由の定型文">
              {[
                "シフト時間と申告時間が異なります",
                "休憩時間を確認してください",
                "備考に理由を入力してください",
                "打刻漏れの可能性があります",
                "申告内容を確認してください",
              ].map((preset) => (
                <button
                  key={preset}
                  className="small-action"
                  type="button"
                  onClick={() => setRejectReason((current) => current ? `${current} ${preset}` : preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
            <label className="rejection-reason-label">
              差戻し理由
              <textarea
                value={rejectReason}
                maxLength={500}
                autoFocus
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="理由を入力してください"
              />
            </label>
            <div className="approval-detail-actions">
              <button className="small-action" type="button" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>
                キャンセル
              </button>
              <button className="small-action danger" type="button" disabled={!rejectReason.trim() || rejectBusy} onClick={() => void confirmReject()}>
                差戻しを確定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
