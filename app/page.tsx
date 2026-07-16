"use client";

import { useEffect, useMemo, useState } from "react";
import GroupsPanel from "./groups-panel";
import ShiftBuilder from "./shift-builder";
import ShiftRoster from "./shift-roster";
import ProfilePanel from "./profile-panel";
import ShiftRequests from "./shift-requests";
import ShiftAdjustment from "./shift-adjustment";
import GroupMenu from "./group-menu";
import GroupPreferencesPanel from "./group-preferences-panel";
import AnnouncementsPanel from "./announcements-panel";
import DashboardPanel from "./dashboard-panel";
import { localApiFetch } from "./local-api";

type Attachment = { id: string; filename: string; size: number; contentType: string };
type EventItem = { id: string; title: string; date: string; startTime: string; endTime: string; category: string; notes: string; completed: boolean; groupId?: string | null; groupName?: string | null; readOnly?: boolean; attachments?: Attachment[] };
type FormState = { title: string; date: string; startTime: string; endTime: string; category: string; notes: string };
type GroupMembership = { groupId: string; name?: string; role: string; showInPersonal: boolean; unreadAnnouncements?: number };

const today = new Date();
const todayKey = keyForDate(today);
const MAX_FILE_BYTES = 1024 * 1024;
const SAFE_IMAGE_BYTES = 900 * 1024;
const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const weekNames = ["日", "月", "火", "水", "木", "金", "土"];
const demoEvents: EventItem[] = [
  { id: "demo-1", title: "AIエージェント操作の練習", date: todayKey, startTime: "09:30", endTime: "10:00", category: "仕事", notes: "", completed: false },
  { id: "demo-2", title: "買い物", date: todayKey, startTime: "18:00", endTime: "19:00", category: "生活", notes: "", completed: false },
];

function keyForDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function formatDate(key: string) { return new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(new Date(`${key}T00:00:00`)); }
function daysForMonth(year: number, month: number) { const first = new Date(year, month, 1); const start = new Date(year, month, 1 - first.getDay()); return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)); }
function emptyForm(date: string): FormState { return { title: "", date, startTime: "09:00", endTime: "10:00", category: "仕事", notes: "" }; }

async function prepareAttachment(file: File) {
  if (!file.type.startsWith("image/") || file.size <= MAX_FILE_BYTES) return { file, optimized: false };
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / bitmap.width, 1600 / bitmap.height);
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    let quality = 0.82;
    let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    while (blob && blob.size > SAFE_IMAGE_BYTES && quality > 0.45) { quality -= 0.1; blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality)); }
    if (!blob || blob.size >= file.size) return { file, optimized: false };
    return { file: new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }), optimized: true };
  } catch { return { file, optimized: false }; }
}

export default function Home() {
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [events, setEvents] = useState<EventItem[]>(demoEvents);
  const [groups, setGroups] = useState<GroupMembership[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<EventItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftAdjustmentOpen, setShiftAdjustmentOpen] = useState(false);
  const [shiftRosterOpen, setShiftRosterOpen] = useState(false);
  const [shiftRequestsOpen, setShiftRequestsOpen] = useState(false);
  const [menuGroupId, setMenuGroupId] = useState<string | undefined>();
  const [groupPreferencesOpen, setGroupPreferencesOpen] = useState(false);
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm(todayKey));
  const [attachment, setAttachment] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [usedBytes, setUsedBytes] = useState(0);
  const days = useMemo(() => daysForMonth(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const selectedEvents = events.filter((event) => event.date === selectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const openEvents = events.filter((event) => !event.completed).length;
  const editableGroups = groups.filter((group) => group.role === "owner" || group.role === "editor");

  useEffect(() => { void loadCalendar(); }, []);

  async function loadCalendar() {
    const response = await localApiFetch("/api/calendar");
    if (!response.ok) return;
    const data = await response.json() as { email: string; usedBytes: number; events: EventItem[]; groups?: GroupMembership[] };
    setUserEmail(data.email); setUsedBytes(data.usedBytes ?? 0); setEvents(data.events);
    const memberships = data.groups ?? [];
    const withUnread = await Promise.all(memberships.map(async (group) => {
      const announcementResponse = await localApiFetch(`/api/groups/${group.groupId}/announcements`);
      if (!announcementResponse.ok) return group;
      const announcementData = await announcementResponse.json() as { announcements?: Array<{ id: string }>; reads?: Array<{ announcementId: string }> };
      const readIds = new Set((announcementData.reads ?? []).map((read) => read.announcementId));
      return { ...group, unreadAnnouncements: (announcementData.announcements ?? []).filter((item) => !readIds.has(item.id)).length };
    }));
    setGroups(withUnread);
  }

  function openNew(date = selectedDate) { setEditingId(null); setGroupId(""); setForm(emptyForm(date)); setAttachment(null); setEditorOpen(true); }
  function openEdit(event: EventItem) { setDetailEvent(null); setEditingId(event.id); setGroupId(event.groupId ?? ""); setForm({ title: event.title, date: event.date, startTime: event.startTime, endTime: event.endTime, category: event.category, notes: event.notes }); setAttachment(null); setEditorOpen(true); }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || saving) return;
    setSaving(true);
    const isDemo = editingId?.startsWith("demo-");
    let saved: EventItem | null = null;
    const payload = { ...form, groupId: groupId || undefined };
    if (isDemo) saved = { id: editingId!, ...form, groupId: groupId || null, completed: events.find((item) => item.id === editingId)?.completed ?? false, attachments: events.find((item) => item.id === editingId)?.attachments };
    else if (editingId) { const response = await localApiFetch(`/api/calendar/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (response.ok) saved = (await response.json() as { event: EventItem }).event; }
    else { const response = await localApiFetch("/api/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (response.ok) saved = (await response.json() as { event: EventItem }).event; else setNotice(((await response.json().catch(() => ({})) as { error?: string }).error) ?? "予定を保存できませんでした"); }
    if (saved && attachment && !saved.id.startsWith("demo-")) {
      const prepared = await prepareAttachment(attachment);
      if (prepared.file.size > MAX_FILE_BYTES) setNotice("添付ファイルの保存に失敗しました。1MB以下にしてください。");
      else { const body = new FormData(); body.append("file", prepared.file); body.append("eventId", saved.id); const upload = await localApiFetch("/api/files", { method: "POST", body }); if (!upload.ok) setNotice(`添付ファイルの保存に失敗しました（HTTP ${upload.status}）。`); else await loadCalendar(); }
    } else if (saved) setEvents((current) => [...current.filter((item) => item.id !== saved!.id), saved!]);
    if (saved) { setSelectedDate(saved.date); setEditorOpen(false); setAttachment(null); }
    setSaving(false);
  }

  async function toggleEvent(event: EventItem) { if (event.readOnly) return; const next = { ...event, completed: !event.completed }; setEvents((current) => current.map((item) => item.id === event.id ? next : item)); if (!event.id.startsWith("demo-")) await localApiFetch(`/api/calendar/${event.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: next.completed }) }); }
  async function deleteEvent(event: EventItem) { if (!window.confirm(`「${event.title}」を削除しますか？`)) return; setDetailEvent(null); setEvents((current) => current.filter((item) => item.id !== event.id)); if (!event.id.startsWith("demo-")) await localApiFetch(`/api/calendar/${event.id}`, { method: "DELETE" }); }
  const storagePercent = Math.min(100, (usedBytes / (10 * 1024 * 1024)) * 100);
  const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)}KB` : `${(bytes / 1024 / 1024).toFixed(2)}MB`;

  function openGroupTarget(groupId: string, target: "basic" | "requests" | "shift" | "members" | "adjustment") { setMenuGroupId(groupId); if (target === "basic") setGroupPreferencesOpen(true); if (target === "members") setGroupsOpen(true); if (target === "requests") setShiftRequestsOpen(true); if (target === "shift") setShiftOpen(true); if (target === "adjustment") setShiftAdjustmentOpen(true); }

  return <main className="shell">
    {notice && <div className="upload-notice" role="alert">{notice}<button onClick={() => setNotice(null)} aria-label="閉じる">×</button></div>}
    <header className="topbar"><div className="brand"><span className="brand-mark">◒</span><span>My Day</span><span className="brand-pill">PRIVATE CALENDAR</span></div><div className="top-actions"><details className="demo-notice"><summary>⚠ デモ用</summary><div><strong>デモ用サイトです</strong><p>予告なく終了する可能性があります。登録した予定や添付ファイルが漏洩する可能性もあります。</p><p>重要な情報は登録しないでください。</p></div></details><a className="ghost-button" href="/api-guide">APIガイド</a><span className="sync-label">{process.env.NEXT_PUBLIC_LOCAL_MODE === "true" ? "ローカル開発モード" : userEmail ? "ChatGPTでログイン中" : "サンプル表示中"}</span>{userEmail ? <button className="ghost-button" onClick={() => setSettingsOpen(true)}>アカウント</button> : <a className="ghost-button" href="/signin-with-chatgpt?return_to=/">ChatGPTでログイン</a>}</div></header>
    <GroupMenu groups={groups} onApplications={() => { setMenuGroupId(undefined); setGroupsOpen(true); }} onBasic={(groupId) => openGroupTarget(groupId, "basic")} onRequests={(groupId) => openGroupTarget(groupId, "requests")} onRoster={() => setShiftRosterOpen(true)} onShiftBuilder={(groupId) => openGroupTarget(groupId, "shift")} onShiftAdjustment={(groupId) => openGroupTarget(groupId, "adjustment")} onMembers={(groupId) => openGroupTarget(groupId, "members")} onAnnouncements={(groupId) => { setMenuGroupId(groupId); setAnnouncementsOpen(true); }} onDashboard={(groupId) => { setMenuGroupId(groupId); setDashboardOpen(true); }} />
    <section className="intro compact-intro"><div><p className="eyebrow">YOUR SPACE, YOUR RHYTHM</p><h1>今日を、少しずつ<br /><em>軽くする。</em></h1><p className="subcopy">予定とタスクをひとつに。あなたのペースで使える、静かなカレンダー。</p></div><button className="primary-button" onClick={() => openNew()}>＋ 予定を追加</button></section>
    <section className="dashboard"><div className="calendar-card"><div className="calendar-head"><div><p className="eyebrow">CALENDAR</p><h2>{monthNames[cursor.getMonth()]} <span>{cursor.getFullYear()}</span></h2></div><div className="month-actions"><button onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>今日</button><button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>‹</button><button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>›</button></div></div><div className="week-row">{weekNames.map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{days.map((day) => { const key = keyForDate(day); return <button className={`day-cell ${day.getMonth() !== cursor.getMonth() ? "muted" : ""} ${key === selectedDate ? "selected" : ""} ${key === todayKey ? "today" : ""}`} key={key} onClick={() => setSelectedDate(key)}><span className="day-number">{day.getDate()}</span>{events.filter((item) => item.date === key).slice(0, 2).map((item) => <span className={`event-dot ${item.category === "生活" ? "green" : item.category === "予定" ? "yellow" : ""}`} key={item.id}>{item.title}</span>)}</button>; })}</div></div>
      <aside className="agenda-card"><div className="agenda-head"><div><p className="eyebrow">AGENDA</p><h2>{formatDate(selectedDate)}</h2></div><button className="icon-button" onClick={() => openNew()} aria-label="予定を追加">＋</button></div><div className="agenda-list">{selectedEvents.length ? selectedEvents.map((item) => <article className={`agenda-item ${item.completed ? "done" : ""}`} key={item.id} onClick={() => setDetailEvent(item)}><div className="time">{item.startTime}<small>{item.endTime}</small></div><button className={`check ${item.completed ? "checked" : ""}`} disabled={item.readOnly} onClick={(event) => { event.stopPropagation(); void toggleEvent(item); }} aria-label="完了にする">{item.completed ? "✓" : ""}</button><div className="event-info"><h3>{item.title}</h3><p><span className={`category ${item.category === "生活" ? "life" : item.category === "予定" ? "plan" : "work"}`}>{item.category}</span>{item.groupId && <span>グループ</span>}{item.notes && <span>{item.notes}</span>}</p>{item.attachments?.length ? <p className="attachment-chip">⌕ {item.attachments.length}件の添付</p> : null}</div><span className="open-detail">›</span></article>) : <div className="empty-state"><span>○</span><p>この日の予定はありません。<br />余白も、予定のうち。</p><button onClick={() => openNew()}>予定を追加する</button></div>}</div><div className="agenda-footer"><span>{openEvents}件の未完了タスク</span><button onClick={() => setSettingsOpen(true)}>設定 →</button></div></aside></section>
    <section className="bottom-row"><div className="tip-card"><span className="tip-icon">✦</span><div><p className="eyebrow">A LITTLE NOTE</p><h3>すべてを埋めなくていい。</h3><p>空白の時間も、あなたの予定です。</p></div></div><div className="storage-card"><div className="storage-top"><span>添付ファイル</span><strong>{process.env.NEXT_PUBLIC_LOCAL_MODE === "true" ? "LOCAL STORAGE" : "R2 STORAGE"}</strong></div><div className="storage-bar"><span style={{ width: `${storagePercent}%` }} /></div><p>{formatSize(usedBytes)} / 10MB　※アプリ側では上限を設定していません</p></div></section>
    {editorOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditorOpen(false); }}><form className="modal" onSubmit={handleSave}><div className="modal-head"><div><p className="eyebrow">{editingId ? "EDIT ITEM" : "NEW ITEM"}</p><h2>{editingId ? "予定を編集" : "予定を追加"}</h2></div><button type="button" className="close-button" onClick={() => setEditorOpen(false)}>×</button></div><label>タイトル<input autoFocus required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><div className="form-row"><label>日付<input type="date" value={form.date} onChange={(event) => { setForm({ ...form, date: event.target.value }); setSelectedDate(event.target.value); }} /></label><label>カテゴリ<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>仕事</option><option>生活</option><option>予定</option></select></label></div>{editableGroups.length > 0 && <label>保存先<select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">個人カレンダー</option>{editableGroups.map((group) => <option key={group.groupId} value={group.groupId}>グループ：{group.name ?? group.groupId.slice(0, 8)}</option>)}</select></label>}<div className="form-row"><label>開始<input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label><label>終了<input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></label></div><label>メモ<textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><label className="file-input">添付ファイル<input type="file" accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} /><span>{attachment ? `⌕ ${attachment.name}` : "ファイルを選択（1MBまで）"}</span></label><div className="modal-footer"><span>{process.env.NEXT_PUBLIC_LOCAL_MODE === "true" ? "ローカル開発モード：認証なし" : "ログイン中のアカウントに保存されます"}</span><button className="primary-button" type="submit" disabled={saving}>{saving ? "保存中…" : "保存する"}</button></div></form></div>}
    {detailEvent && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailEvent(null); }}><div className="modal detail-modal"><div className="modal-head"><div><p className="eyebrow">DETAIL</p><h2>{detailEvent.title}</h2></div><button className="close-button" onClick={() => setDetailEvent(null)}>×</button></div><div className="detail-meta"><span className="category">{detailEvent.category}</span><span>{formatDate(detailEvent.date)}</span><span>{detailEvent.startTime} — {detailEvent.endTime}</span>{detailEvent.groupId && <span className="category">グループ予定</span>}</div>{detailEvent.notes && <div className="detail-notes">{detailEvent.notes}</div>}{detailEvent.attachments?.length ? <div className="detail-files"><p className="eyebrow">ATTACHMENTS</p>{detailEvent.attachments.map((file) => <div className="file-preview" key={file.id}>{file.contentType.startsWith("image/") ? <img src={`/api/files/${file.id}`} alt={file.filename} /> : <span className="file-icon">⌕</span>}<div><strong>{file.filename}</strong><small>{Math.round(file.size / 1024)}KB</small></div><a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer">開く</a></div>)}</div> : <div className="no-files">添付ファイルはありません</div>}{detailEvent.readOnly ? <p className="settings-copy">この予定はグループから共有されています。編集権限が必要です。</p> : <div className="detail-actions"><button className="danger-button" onClick={() => void deleteEvent(detailEvent)}>削除</button><button className="primary-button" onClick={() => openEdit(detailEvent)}>編集する</button></div>}</div></div>}
    {groupsOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setGroupsOpen(false); }}><div className="modal groups-modal"><GroupsPanel initialGroupId={menuGroupId} onChanged={() => { void loadCalendar(); }} /></div></div>}
    {shiftOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShiftOpen(false); }}><div className="modal shift-modal"><ShiftBuilder initialGroupId={menuGroupId} /></div></div>}
    {shiftAdjustmentOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShiftAdjustmentOpen(false); }}><div className="modal shift-modal"><ShiftAdjustment initialGroupId={menuGroupId} /></div></div>}
    {shiftRosterOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShiftRosterOpen(false); }}><div className="modal shift-modal"><ShiftRoster /></div></div>}
    {shiftRequestsOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShiftRequestsOpen(false); }}><div className="modal shift-modal request-modal"><ShiftRequests initialGroupId={menuGroupId} /></div></div>}
    {announcementsOpen && menuGroupId && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAnnouncementsOpen(false); }}><div className="modal groups-modal"><AnnouncementsPanel groupId={menuGroupId} manager={editableGroups.some((group) => group.groupId === menuGroupId)} /></div></div>}
    {dashboardOpen && menuGroupId && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDashboardOpen(false); }}><div className="modal groups-modal"><DashboardPanel groupId={menuGroupId} /></div></div>}
    {groupPreferencesOpen && menuGroupId && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setGroupPreferencesOpen(false); }}><div className="modal groups-modal"><div className="modal-head"><div><p className="eyebrow">GROUP SETTINGS</p><h2>基本設定</h2></div><button className="close-button" onClick={() => setGroupPreferencesOpen(false)}>×</button></div><GroupPreferencesPanel groupId={menuGroupId} /></div></div>}
    {settingsOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}><div className="modal small-modal"><div className="modal-head"><div><p className="eyebrow">ACCOUNT</p><h2>あなたのMy Day</h2></div><button className="close-button" onClick={() => setSettingsOpen(false)}>×</button></div><p className="settings-copy">予定と添付ファイルは、アカウントごとに分けて保存されます。</p>{userEmail ? <ProfilePanel email={userEmail} /> : <a className="primary-button link-button" href="/signin-with-chatgpt?return_to=/">ChatGPTでログインする</a>}</div></div>}
  </main>;
}
