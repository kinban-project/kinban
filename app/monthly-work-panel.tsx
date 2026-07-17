"use client";

import { useEffect, useMemo, useState } from "react";
import { localApiFetch } from "./local-api";

type Summary = {
  userEmail: string;
  displayName: string;
  plannedMinutes: number;
  declaredMinutes: number;
  missingCount: number;
  unresolvedCount: number;
  offScheduleCount: number;
  status: string;
};
type Day = {
  date: string;
  planned: Array<{ startTime: string; endTime: string; role: string; planName: string }>;
  records: Array<{ status: string; claimedStartAt?: string | null; claimedEndAt?: string | null; workedMinutes: number; breakMinutes: number; employeeNote?: string }>;
};
type Data = { month: string; summaries: Summary[]; claims: Array<{ userEmail: string; status: string; managerNote?: string }>; days: Day[]; viewedUserEmail: string; canManage: boolean };

const statusLabels: Record<string, string> = { unsubmitted: "未申告", submitted: "月次申告済み", approved: "月次承認済み", rejected: "差戻し" };
const week = ["日", "月", "火", "水", "木", "金", "土"];

function monthOptions() {
  const now = new Date();
  return Array.from({ length: 13 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 6 + index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}
function formatMinutes(value: number) {
  return `${Math.floor(value / 60)}時間${value % 60}分`;
}
function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00+09:00`);
  return `${Number(value.slice(8, 10))}日（${week[date.getDay()]}）`;
}
function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export default function MonthlyWorkPanel({ groupId, manager }: { groupId: string; manager: boolean }) {
  const [month, setMonth] = useState("2026-07");
  const [data, setData] = useState<Data | null>(null);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const options = useMemo(monthOptions, []);

  async function load(email = selectedEmail) {
    const query = email && manager ? `&userEmail=${encodeURIComponent(email)}` : "";
    const response = await localApiFetch(`/api/groups/${groupId}/monthly-work?month=${month}${query}`);
    if (!response.ok) { setNotice("月次情報を読み込めませんでした。"); return; }
    setData(await response.json() as Data);
  }
  useEffect(() => { void load(); }, [groupId, month, selectedEmail]);

  const selfSummary = data?.summaries.find((item) => item.userEmail === data.viewedUserEmail) ?? data?.summaries[0];
  const selfClaim = data?.claims.find((item) => item.userEmail === data.viewedUserEmail);
  const hasUnresolved = (selfSummary?.unresolvedCount ?? 0) > 0 || (selfSummary?.missingCount ?? 0) > 0;

  async function submit() {
    setBusy(true);
    const response = await localApiFetch(`/api/groups/${groupId}/monthly-work`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit", month }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    setNotice(response.ok ? "月次申告を提出しました。" : body.error ?? "月次申告を提出できませんでした。");
    if (response.ok) await load();
    setBusy(false);
  }
  async function review(email: string, action: "approve" | "reject") {
    setBusy(true);
    const response = await localApiFetch(`/api/groups/${groupId}/monthly-work`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, month, userEmail: email }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    setNotice(response.ok ? (action === "approve" ? "月次申告を承認しました。" : "月次申告を差し戻しました。") : body.error ?? "月次処理に失敗しました。");
    if (response.ok) await load();
    setBusy(false);
  }

  return <section className="monthly-work-panel">
    <div className="modal-head">
      <div><p className="eyebrow">MONTHLY WORK</p><h2>{manager ? "月次承認" : "月次申告"}</h2><p>シフト予定と実際の勤務を月単位で確認します。シフトがない日も表示されます。</p></div>
    </div>
    <div className="monthly-toolbar">
      <label>対象月<select aria-label="月次対象月" value={month} onChange={(event) => { setMonth(event.target.value); setSelectedEmail(""); }}>
        {options.map((value) => <option value={value} key={value}>{value.slice(0, 4)}年{Number(value.slice(5))}月</option>)}
      </select></label>
      {manager && <label>確認するメンバー<select aria-label="月次確認メンバー" value={selectedEmail} onChange={(event) => setSelectedEmail(event.target.value)}><option value="">全体サマリ</option>{data?.summaries.map((item) => <option value={item.userEmail} key={item.userEmail}>{item.displayName}</option>)}</select></label>}
    </div>
    {notice && <p className="panel-notice">{notice}</p>}
    {manager && !selectedEmail ? <>
      <div className="monthly-summary-grid">{(data?.summaries ?? []).map((item) => <article className="monthly-summary-card" key={item.userEmail}>
        <div className="monthly-summary-head"><strong>{item.displayName}</strong><span className={`monthly-status monthly-status-${item.status}`}>{statusLabels[item.status] ?? item.status}</span></div>
        <div className="monthly-summary-values"><span>予定 <b>{formatMinutes(item.plannedMinutes)}</b></span><span>申告 <b>{formatMinutes(item.declaredMinutes)}</b></span><span>差分 <b>{formatMinutes(item.declaredMinutes - item.plannedMinutes)}</b></span></div>
        <div className="monthly-summary-flags">未入力 {item.missingCount}日 ／ 未処理 {item.unresolvedCount}件 ／ シフト外 {item.offScheduleCount}日</div>
        <div className="monthly-summary-actions"><button className="small-action" onClick={() => setSelectedEmail(item.userEmail)}>日別確認</button>{item.status === "submitted" && <button className="small-action" disabled={busy} onClick={() => void review(item.userEmail, "approve")}>月次承認</button>}{item.status === "submitted" && <button className="small-action danger" disabled={busy} onClick={() => void review(item.userEmail, "reject")}>差戻し</button>}</div>
      </article>)}</div>
    </> : <>
      <div className="monthly-self-summary"><div><strong>{selfSummary?.displayName ?? "自分"}</strong><span className={`monthly-status monthly-status-${selfClaim?.status ?? "unsubmitted"}`}>{statusLabels[selfClaim?.status ?? "unsubmitted"]}</span></div><span>シフト予定 <b>{formatMinutes(selfSummary?.plannedMinutes ?? 0)}</b></span><span>申告実績 <b>{formatMinutes(selfSummary?.declaredMinutes ?? 0)}</b></span><span>シフト外 {selfSummary?.offScheduleCount ?? 0}日</span>{!manager && <button className="primary-button" disabled={busy || hasUnresolved || selfClaim?.status === "approved"} onClick={() => void submit()}>{selfClaim?.status === "submitted" ? "月次申告済み" : "月次申告"}</button>}</div>
      {manager && selectedEmail && <button className="small-action" onClick={() => setSelectedEmail("")}>サマリへ戻る</button>}
      <div className="monthly-days-wrap"><table className="monthly-days-table"><thead><tr><th>日付</th><th>シフト予定</th><th>打刻・申告</th><th>実働</th><th>状態</th></tr></thead><tbody>{(data?.days ?? []).map((day) => <tr key={day.date} className={day.records.some((record) => !record.claimedStartAt || !record.claimedEndAt) ? "monthly-day-warning" : ""}><th>{formatDate(day.date)}</th><td>{day.planned.length ? day.planned.map((slot, index) => <div key={`${slot.startTime}-${index}`}>{slot.startTime}〜{slot.endTime} {slot.role || "共通"}</div>) : <span className="muted">シフトなし</span>}</td><td>{day.records.length ? day.records.map((record, index) => <div key={`${record.status}-${index}`}>{formatDateTime(record.claimedStartAt)}〜{formatDateTime(record.claimedEndAt)} ／ 休憩{record.breakMinutes}分</div>) : <span className="muted">未入力</span>}</td><td>{day.records.length ? formatMinutes(day.records.reduce((total, record) => total + record.workedMinutes, 0)) : "—"}</td><td>{day.records.length ? day.records.map((record, index) => <span className={`monthly-status monthly-status-${record.status}`} key={`${record.status}-${index}`}>{statusLabels[record.status] ?? record.status}</span>) : day.planned.length ? <span className="monthly-status monthly-status-unsubmitted">未申告</span> : <span className="muted">—</span>}</td></tr>)}</tbody></table></div>
      {hasUnresolved && !manager && <p className="monthly-help">未入力または未処理の勤務記録があるため、月次申告できません。先に「勤務申告」で内容を確認してください。</p>}
    </>}
  </section>;
}
