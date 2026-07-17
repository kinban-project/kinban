"use client";

import { useEffect, useMemo, useState } from "react";
import { localApiFetch } from "./local-api";

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
  startNetworkStatus: string;
  endNetworkStatus: string;
  startLatitude?: string | null;
  startLongitude?: string | null;
  status: string;
  employeeNote?: string;
  managerNote?: string;
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
type BreakRow = { id: string; workRecordId: string; startedAt: string; endedAt?: string | null };

function statusLabel(value: string) {
  return ({ working: "勤務中", submitted: "承認待ち", approved: "承認済み", rejected: "差戻し" } as Record<string, string>)[value] ?? value;
}
function networkLabel(value: string) {
  return ({ store: "店舗ネットワーク", external: "外部ネットワーク", unknown: "判定不可" } as Record<string, string>)[value] ?? value;
}
function formatTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function localDateTime(value?: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
function breakMinutes(rows: BreakRow[]) {
  return rows.reduce((total, item) => item.endedAt ? total + Math.max(0, Math.round((new Date(item.endedAt).getTime() - new Date(item.startedAt).getTime()) / 60000)) : total, 0);
}
function workedMinutes(row: RecordRow, breaks: BreakRow[] = []) {
  if (!row.startedAt || !row.endedAt) return null;
  return Math.max(0, Math.round((new Date(row.endedAt).getTime() - new Date(row.startedAt).getTime()) / 60000) - breakMinutes(breaks));
}
function requestLocationIfNeeded(network: string) {
  if (network !== "external" || typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(undefined);
  return new Promise<{ latitude: number; longitude: number; accuracy: number } | undefined>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }),
      () => resolve(undefined),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  });
}

export default function WorkRecordsPanel({ groupId, manager = false }: { groupId: string; manager?: boolean }) {
  const [groupName, setGroupName] = useState("");
  const [network, setNetwork] = useState("unknown");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [breaks, setBreaks] = useState<BreakRow[]>([]);
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [claimDrafts, setClaimDrafts] = useState<Record<string, { start: string; end: string }>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    setBusy(true);
    const response = await localApiFetch(`/api/groups/${groupId}/work-records`);
    if (response.ok) {
      const data = await response.json() as { group?: { name?: string }; currentNetworkStatus?: string; records?: RecordRow[]; breaks?: BreakRow[]; schedule?: ScheduleRow[]; members?: Member[] };
      setGroupName(data.group?.name ?? "");
      setNetwork(data.currentNetworkStatus ?? "unknown");
      setRecords(data.records ?? []);
      setBreaks(data.breaks ?? []);
      setSchedule(data.schedule ?? []);
      setMembers(data.members ?? []);
      setClaimDrafts(Object.fromEntries((data.records ?? []).map((record) => [record.id, { start: localDateTime(record.claimedStartAt ?? record.startedAt), end: localDateTime(record.claimedEndAt ?? record.endedAt) }] )));
      setNotice("");
    } else setNotice("勤務状況を読み込めませんでした。");
    setBusy(false);
  }
  useEffect(() => { void load(); }, [groupId]);

  async function start(slotId?: string) {
    setBusy(true);
    const location = await requestLocationIfNeeded(network);
    const response = await localApiFetch(`/api/groups/${groupId}/work-records`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", slotId, location }) });
    setNotice(response.ok ? "勤務開始を記録しました。" : ((await response.json().catch(() => ({}))) as { error?: string }).error ?? "勤務開始を記録できませんでした。");
    if (response.ok) await load(); else setBusy(false);
  }
  async function end(record: RecordRow) {
    if (!window.confirm("勤務終了を記録しますか？")) return;
    setBusy(true);
    const location = await requestLocationIfNeeded(network);
    const response = await localApiFetch(`/api/groups/${groupId}/work-records`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "end", recordId: record.id, location }) });
    setNotice(response.ok ? "勤務終了を記録しました。管理者の確認待ちです。" : "勤務終了を記録できませんでした。");
    if (response.ok) await load(); else setBusy(false);
  }
  async function toggleBreak(record: RecordRow, action: "break-start" | "break-end") {
    const response = await localApiFetch(`/api/groups/${groupId}/work-records`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, recordId: record.id }) });
    setNotice(response.ok ? (action === "break-start" ? "休憩開始を記録しました。" : "休憩終了を記録しました。") : "休憩記録を更新できませんでした。");
    if (response.ok) await load();
  }
  async function review(recordId: string, status: "approved" | "rejected") {
    const response = await localApiFetch(`/api/groups/${groupId}/work-records`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordId, status }) });
    setNotice(response.ok ? (status === "approved" ? "勤務記録を承認しました。" : "勤務記録を差し戻しました。") : "勤務記録を更新できませんでした。");
    if (response.ok) await load();
  }
  async function applySchedule(record: RecordRow) {
    setBusy(true);
    const response = await localApiFetch(`/api/groups/${groupId}/work-records`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply-schedule", recordId: record.id }) });
    setNotice(response.ok ? "シフトの予定時刻を申告時間に反映しました。内容を確認して申請してください。" : ((await response.json().catch(() => ({}))) as { error?: string }).error ?? "シフト時刻を反映できませんでした。");
    if (response.ok) await load(); else setBusy(false);
  }
  async function saveClaim(record: RecordRow) {
    const draft = claimDrafts[record.id];
    if (!draft?.start) return;
    setBusy(true);
    const response = await localApiFetch(`/api/groups/${groupId}/work-records`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-claim", recordId: record.id, claimedStartAt: draft.start, claimedEndAt: draft.end }) });
    setNotice(response.ok ? "申告時間を保存しました。" : ((await response.json().catch(() => ({}))) as { error?: string }).error ?? "申告時間を保存できませんでした。");
    if (response.ok) await load(); else setBusy(false);
  }

  const names = useMemo(() => new Map(members.map((member) => [member.userEmail, member.displayName?.trim() || member.userEmail.split("@")[0]])), [members]);
  const activeRecords = records.filter((record) => record.status === "working");
  const pendingRecords = records.filter((record) => record.status === "submitted");
  const breaksFor = (recordId: string) => breaks.filter((item) => item.workRecordId === recordId);

  return <section className="work-records-panel">
    <div className="modal-head"><div><p className="eyebrow">WORK RECORDS</p><h2>{manager ? "勤務状況確認" : "勤務状況"}{groupName ? `（${groupName}）` : ""}</h2></div></div>
    <div className="work-records-status"><span>通信判定：{networkLabel(network)}</span>{network === "external" && <span>外部ネットワークのため、開始・終了時に位置情報を任意で取得します。</span>}{network === "unknown" && <span>店舗ネットワークの登録がないため、通信判定は参考情報です。</span>}</div>
    {manager ? <>
      <div className="work-records-summary"><strong>承認待ち {pendingRecords.length}件</strong><span>勤務中 {activeRecords.length}件</span></div>
      <div className="work-records-table-wrap"><table className="work-records-table"><thead><tr><th>日付</th><th>メンバー</th><th>予定</th><th>実績</th><th>休憩</th><th>通信</th><th>状態</th><th>操作</th></tr></thead><tbody>{records.length ? records.map((record) => <tr key={record.id}><td>{record.scheduledDate}</td><td>{names.get(record.userEmail) ?? record.userEmail.split("@")[0]}</td><td>{record.scheduledStartTime || "—"}〜{record.scheduledEndTime || "—"}</td><td>{formatTime(record.startedAt)}〜{formatTime(record.endedAt)}{workedMinutes(record, breaksFor(record.id)) !== null && <small>実働 {workedMinutes(record, breaksFor(record.id))}分</small>}</td><td>{breakMinutes(breaksFor(record.id))}分</td><td>{networkLabel(record.startNetworkStatus)} / {networkLabel(record.endNetworkStatus)}</td><td><span className={`work-status work-status-${record.status}`}>{statusLabel(record.status)}</span></td><td>{record.status === "submitted" ? <span className="work-review-actions"><button className="small-action" onClick={() => void review(record.id, "approved")}>承認</button><button className="small-action" onClick={() => void review(record.id, "rejected")}>差戻し</button></span> : "—"}</td></tr>) : <tr><td colSpan={8}>勤務記録はまだありません。</td></tr>}</tbody></table></div>
    </> : <>
      <div className="work-records-summary"><strong>今日・今後の担当シフト</strong><button className="primary-button" disabled={busy} onClick={() => void start()}>予定外の勤務開始</button></div>
      <div className="work-schedule-list">{schedule.length ? schedule.slice(0, 30).map((slot) => { const slotBreaks = slot.record ? breaksFor(slot.record.id) : []; const onBreak = slotBreaks.some((item) => !item.endedAt); return <article className="work-schedule-item" key={`${slot.id}-${slot.userEmail}`}><div><strong>{slot.date} {slot.startTime}〜{slot.endTime}</strong><span>{slot.planName}{slot.role ? ` ／ ${slot.role}` : ""}</span></div>{slot.record?.status === "working" ? <span className="work-review-actions"><button className="small-action" disabled={busy} onClick={() => void (onBreak ? toggleBreak(slot.record!, "break-end") : toggleBreak(slot.record!, "break-start"))}>{onBreak ? "休憩終了" : "休憩開始"}</button><button className="primary-button" disabled={busy || onBreak} onClick={() => void end(slot.record!)}>勤務終了</button></span> : slot.record ? <span className={`work-status work-status-${slot.record.status}`}>{statusLabel(slot.record.status)}</span> : <button className="small-action" disabled={busy} onClick={() => void start(slot.id)}>勤務開始</button>}</article>; }) : <p className="empty-state">割り当て済みの公開シフトはありません。予定外の勤務開始も記録できます。</p>}</div>
      <h3>自分の勤務記録</h3><div className="work-records-table-wrap"><table className="work-records-table"><thead><tr><th>日付</th><th>シフト予定</th><th>打刻</th><th>申告時間</th><th>休憩</th><th>状態</th><th>操作</th></tr></thead><tbody>{records.length ? records.slice().reverse().map((record) => { const draft = claimDrafts[record.id] ?? { start: localDateTime(record.claimedStartAt ?? record.startedAt), end: localDateTime(record.claimedEndAt ?? record.endedAt) }; return <tr key={record.id}><td>{record.scheduledDate}</td><td>{record.scheduledStartTime && record.scheduledEndTime ? `${record.scheduledStartTime}〜${record.scheduledEndTime}` : "シフトなし"}</td><td>{formatTime(record.startedAt)}〜{formatTime(record.endedAt)}</td><td><div className="claim-time-fields"><input type="datetime-local" aria-label="申告開始" value={draft.start} disabled={record.status === "approved"} onChange={(event) => setClaimDrafts((current) => ({ ...current, [record.id]: { ...draft, start: event.target.value } }))} /><span>〜</span><input type="datetime-local" aria-label="申告終了" value={draft.end} disabled={record.status === "approved"} onChange={(event) => setClaimDrafts((current) => ({ ...current, [record.id]: { ...draft, end: event.target.value } }))} /></div></td><td>{breakMinutes(breaksFor(record.id))}分</td><td>{record.endedAt ? <span className={`work-status work-status-${record.status}`}>{statusLabel(record.status)}</span> : <span className="work-status work-status-working">勤務中</span>}</td><td><span className="work-review-actions">{record.scheduledStartTime && record.scheduledEndTime && record.status !== "approved" && <button className="small-action" disabled={busy} onClick={() => void applySchedule(record)}>シフト通り</button>} {record.status !== "approved" && <button className="small-action" disabled={busy} onClick={() => void saveClaim(record)}>保存</button>}</span></td></tr>; }) : <tr><td colSpan={7}>勤務記録はまだありません。</td></tr>}</tbody></table></div>
    </>}
    {busy && <p className="shift-help">処理中…</p>}{notice && <p className="group-notice">{notice}</p>}
  </section>;
}
