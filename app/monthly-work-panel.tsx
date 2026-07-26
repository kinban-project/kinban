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
  records: Array<{ status: string; endedAt?: string | null; claimedStartAt?: string | null; claimedEndAt?: string | null; workedMinutes: number; breakMinutes: number; employeeNote?: string; managerNote?: string }>;
};
type Data = { month: string; summaries: Summary[]; claims: Array<{ userEmail: string; status: string; managerNote?: string }>; days: Day[]; viewedUserEmail: string; canManage: boolean };

const statusLabels: Record<string, string> = { unsubmitted: "未申告", submitted: "月次承認待ち", approved: "月次承認済み", rejected: "差戻し" };
const week = ["日", "月", "火", "水", "木", "金", "土"];

function dailyStatusLabel(value: string, ended = false) {
  if (value === "working") return ended ? "未申告" : "勤務中";
  return ({ unsubmitted: "未申告", submitted: "承認待ち", approved: "承認済み", rejected: "差戻し" } as Record<string, string>)[value] ?? value;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function monthOptions(referenceDate = new Date()) {
  const now = referenceDate;
  return Array.from({ length: 13 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 6 + index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}
function legacyFormatMinutes(value: number) {
  return `${Math.floor(value / 60)}時間${value % 60}分`;
}
function formatMinutes(value: number) {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  return `${sign}${Math.floor(absolute / 60)}時間${absolute % 60}分`;
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
  const [demoNow, setDemoNow] = useState<Date | null>(null);
  const [month, setMonth] = useState(monthKey(new Date()));
  const [data, setData] = useState<Data | null>(null);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const options = useMemo(() => monthOptions(demoNow ?? new Date()), [demoNow]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
      setDemoNow(null);
      return;
    }
    let cancelled = false;
    void fetch("/api/demo-clock", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() as Promise<{ currentAt?: string }> : null))
      .then((data) => {
        if (cancelled || !data?.currentAt) return;
        const next = new Date(data.currentAt);
        if (Number.isNaN(next.getTime())) return;
        setDemoNow(next);
        setMonth(monthKey(next));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [groupId]);

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
  const filteredSummaries = (data?.summaries ?? []).filter((item) => {
    if (statusFilter === "unsubmitted-scheduled") return item.status === "unsubmitted" && item.plannedMinutes > 0;
    return statusFilter === "all" || item.status === statusFilter;
  });
  const totals = filteredSummaries.reduce((result, item) => ({
    plannedMinutes: result.plannedMinutes + item.plannedMinutes,
    declaredMinutes: result.declaredMinutes + item.declaredMinutes,
    missingCount: result.missingCount + item.missingCount,
    unresolvedCount: result.unresolvedCount + item.unresolvedCount,
    offScheduleCount: result.offScheduleCount + item.offScheduleCount,
  }), { plannedMinutes: 0, declaredMinutes: 0, missingCount: 0, unresolvedCount: 0, offScheduleCount: 0 });

  async function submit() {
    setBusy(true);
    const response = await localApiFetch(`/api/groups/${groupId}/monthly-work`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit", month }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    setNotice(response.ok ? "月次申告を提出しました。" : body.error ?? "月次申告を提出できませんでした。");
    if (response.ok) await load();
    setBusy(false);
  }
  async function review(email: string, action: "approve" | "reject" | "reopen", managerNote = "") {
    if (action === "reopen" && !window.confirm("月次承認を解除して、本人が再編集できる状態に戻します。よろしいですか？")) return;
    setBusy(true);
    const response = await localApiFetch(`/api/groups/${groupId}/monthly-work`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, month, userEmail: email, ...(action === "reject" ? { managerNote } : {}) }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    setNotice(response.ok ? (action === "approve" ? "月次申告を承認しました。" : action === "reject" ? "月次申告を差し戻しました。" : "月次承認を解除しました。") : body.error ?? "月次処理に失敗しました。");
    if (response.ok) await load();
    setBusy(false);
  }
  async function confirmReject() {
    if (!rejectTarget || !rejectReason.trim()) return;
    const email = rejectTarget;
    setRejectTarget(null);
    setRejectReason("");
    await review(email, "reject", rejectReason.trim());
  }

  return <section className="monthly-work-panel">
    <div className="modal-head">
      <div><p className="eyebrow">MONTHLY WORK</p><h2>{manager ? "月次承認" : "月次申告"}</h2><p>シフト予定と実際の勤務を月単位で確認します。シフトがない日も表示されます。</p></div>
    </div>
    {selfClaim?.status === "rejected" && selfClaim.managerNote && <p className="work-rejection-note monthly-rejection-note">月次差戻し理由：{selfClaim.managerNote}</p>}
    <div className="monthly-toolbar">
      <label>対象月<select aria-label="月次対象月" value={month} onChange={(event) => { setMonth(event.target.value); setSelectedEmail(""); }}>
        {options.map((value) => <option value={value} key={value}>{value.slice(0, 4)}年{Number(value.slice(5))}月</option>)}
      </select></label>
      {manager && <label>確認するメンバー<select aria-label="月次確認メンバー" value={selectedEmail} onChange={(event) => setSelectedEmail(event.target.value)}><option value="">全体サマリ</option>{data?.summaries.map((item) => <option value={item.userEmail} key={item.userEmail}>{item.displayName}</option>)}</select></label>}
      {manager && <label>状態<select aria-label="月次承認状態" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">すべて</option><option value="unsubmitted-scheduled">未申告（予定あり）</option><option value="unsubmitted">未申告</option><option value="submitted">月次承認待ち</option><option value="approved">月次承認済み</option><option value="rejected">差戻し</option></select></label>}
    </div>
    {notice && <p className="panel-notice">{notice}</p>}
    {manager && !selectedEmail ? <>
      <div className="monthly-summary-table-wrap"><table className="monthly-summary-table"><thead><tr><th>メンバー</th><th>状態</th><th>予定</th><th>申告</th><th>差分</th><th>未入力</th><th>未処理</th><th>シフト外</th><th>操作</th></tr></thead><tbody>{filteredSummaries.map((item) => <tr key={item.userEmail}><th><button className="monthly-member-link" onClick={() => setSelectedEmail(item.userEmail)}>{item.displayName}</button></th><td><span className={`monthly-status monthly-status-${item.status}`}>{statusLabels[item.status] ?? item.status}</span></td><td>{formatMinutes(item.plannedMinutes)}</td><td>{formatMinutes(item.declaredMinutes)}</td><td className={item.declaredMinutes !== item.plannedMinutes ? "monthly-diff-warning" : ""}>{formatMinutes(item.declaredMinutes - item.plannedMinutes)}</td><td>{item.missingCount}日</td><td>{item.unresolvedCount}件</td><td>{item.offScheduleCount}日</td><td><div className="monthly-summary-actions">{item.status === "submitted" && <button className="small-action" disabled={busy} onClick={() => void review(item.userEmail, "approve")}>月次承認</button>}{item.status === "submitted" && <button className="small-action danger monthly-reject-action" disabled={busy} onClick={() => { setRejectTarget(item.userEmail); setRejectReason(""); }}>差戻し</button>}{item.status === "approved" && <button className="small-action danger" disabled={busy} onClick={() => void review(item.userEmail, "reopen")}>月次承認を解除</button>}</div></td></tr>)}<tr className="monthly-summary-total"><th>表示中の合計</th><td>{filteredSummaries.length}人</td><td>{formatMinutes(totals.plannedMinutes)}</td><td>{formatMinutes(totals.declaredMinutes)}</td><td className={totals.declaredMinutes !== totals.plannedMinutes ? "monthly-diff-warning" : ""}>{formatMinutes(totals.declaredMinutes - totals.plannedMinutes)}</td><td>{totals.missingCount}日</td><td>{totals.unresolvedCount}件</td><td>{totals.offScheduleCount}日</td><td>—</td></tr></tbody></table></div>
    </> : <>
      <div className="monthly-self-summary"><div><strong>{selfSummary?.displayName ?? "自分"}</strong><span className={`monthly-status monthly-status-${selfClaim?.status ?? "unsubmitted"}`}>{statusLabels[selfClaim?.status ?? "unsubmitted"]}</span></div><span>シフト予定 <b>{formatMinutes(selfSummary?.plannedMinutes ?? 0)}</b></span><span>申告実績 <b>{formatMinutes(selfSummary?.declaredMinutes ?? 0)}</b></span><span>シフト外 {selfSummary?.offScheduleCount ?? 0}日</span>{!manager && <button className="primary-button" disabled={busy || selfClaim?.status === "approved"} onClick={() => void submit()}>{selfClaim?.status === "submitted" ? "月次申告済み" : "月次申告"}</button>}</div>
      {manager && selectedEmail && <button className="small-action" onClick={() => setSelectedEmail("")}>サマリへ戻る</button>}
      <div className="monthly-days-wrap"><table className="monthly-days-table"><thead><tr><th>日付</th><th>シフト予定</th><th>打刻・申告</th><th>実働</th><th>備考</th><th>状態</th></tr></thead><tbody>{(data?.days ?? []).map((day) => <tr key={day.date} className={day.records.some((record) => !record.claimedStartAt || !record.claimedEndAt) ? "monthly-day-warning" : ""}><th>{formatDate(day.date)}</th><td>{day.planned.length ? day.planned.map((slot, index) => <div key={`${slot.startTime}-${index}`}>{slot.startTime}〜{slot.endTime} {slot.role || "共通"}</div>) : <span className="muted">シフトなし</span>}</td><td>{day.records.length ? day.records.map((record, index) => <div key={`${record.status}-${index}`}>{formatDateTime(record.claimedStartAt)}〜{formatDateTime(record.claimedEndAt)} ／ 休憩{record.breakMinutes}分</div>) : <span className="muted">未入力</span>}</td><td>{day.records.length ? formatMinutes(day.records.reduce((total, record) => total + record.workedMinutes, 0)) : "—"}</td><td>{day.records.length ? day.records.map((record, index) => <div key={`${record.employeeNote ?? ""}-${record.managerNote ?? ""}-${index}`}>{record.employeeNote || record.managerNote || <span className="muted">—</span>}{record.managerNote && record.employeeNote && <small className="monthly-manager-note">差戻し理由：{record.managerNote}</small>}</div>) : <span className="muted">—</span>}</td><td>{day.records.length ? day.records.map((record, index) => <span className={`monthly-status monthly-status-${record.status}`} key={`${record.status}-${index}`}>{dailyStatusLabel(record.status, Boolean(record.endedAt))}</span>) : day.planned.length ? <span className="monthly-status monthly-status-unsubmitted">未申告</span> : <span className="muted">—</span>}</td></tr>)}</tbody></table></div>
      {hasUnresolved && !manager && <p className="monthly-help">未入力または未処理の勤務記録があります。必要に応じて「勤務申告」で内容を確認してください。</p>}
    </>}
    {rejectTarget && <div className="approval-detail-overlay" role="dialog" aria-modal="true"><div className="approval-detail-panel rejection-dialog"><div className="modal-head"><div><p className="eyebrow">MONTHLY REJECTION</p><h3>月次差戻し理由</h3><p className="rejection-target">{data?.summaries.find((item) => item.userEmail === rejectTarget)?.displayName ?? rejectTarget} ・ {month}</p></div><button className="small-action" type="button" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>閉じる</button></div><div className="rejection-presets" aria-label="月次差戻し理由の定型文">{["未申告の日があります。", "申告時間とシフトに大きな差があります。", "備考・理由の追記が必要です。", "日付や時間に誤りがあります。"].map((preset) => <button key={preset} className="small-action" type="button" onClick={() => setRejectReason((current) => current ? `${current} ${preset}` : preset)}>{preset}</button>)}</div><label className="rejection-reason-label">差戻し理由<textarea value={rejectReason} maxLength={500} autoFocus onChange={(event) => setRejectReason(event.target.value)} placeholder="理由を入力してください" /></label><div className="approval-detail-actions"><button className="small-action" type="button" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>キャンセル</button><button className="small-action danger" type="button" disabled={!rejectReason.trim() || busy} onClick={() => void confirmReject()}>差戻しを確定</button></div></div></div>}
  </section>;
}
