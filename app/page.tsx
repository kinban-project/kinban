"use client";

import { useMemo, useState } from "react";

type EventItem = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  category: string;
  notes: string;
  completed: boolean;
  attachments?: { id: string; filename: string; size: number }[];
};

const today = new Date();
const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const weekNames = ["日", "月", "火", "水", "木", "金", "土"];

const demoEvents: EventItem[] = [
  { id: "demo-1", title: "請求書を確認", date: "2026-07-12", startTime: "09:30", endTime: "10:00", category: "仕事", notes: "", completed: false },
  { id: "demo-2", title: "買い物に行く", date: "2026-07-12", startTime: "18:00", endTime: "19:00", category: "生活", notes: "洗剤と牛乳", completed: false },
  { id: "demo-3", title: "企画の下書き", date: "2026-07-15", startTime: "13:00", endTime: "14:30", category: "仕事", notes: "", completed: false },
  { id: "demo-4", title: "歯医者", date: "2026-07-18", startTime: "11:00", endTime: "12:00", category: "予定", notes: "", completed: false },
];

function dateKey(date: Date) { return date.toISOString().slice(0, 10); }
function formatDate(key: string) { return new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(new Date(`${key}T00:00:00`)); }
function daysForMonth(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

export default function Home() {
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(dateKey(today));
  const [events, setEvents] = useState<EventItem[]>(demoEvents);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [form, setForm] = useState({ title: "", date: dateKey(today), startTime: "09:00", endTime: "10:00", category: "仕事", notes: "" });
  const [attachment, setAttachment] = useState<File | null>(null);
  const days = useMemo(() => daysForMonth(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const selectedEvents = events.filter((event) => event.date === selectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const openEvents = events.filter((event) => !event.completed).length;

  async function loadCalendar() {
    const response = await fetch("/api/calendar");
    if (!response.ok) return;
    const data = await response.json() as { email: string; events: EventItem[] };
    setUserEmail(data.email);
    setEvents(data.events);
  }

  async function saveEvent(event: EventItem) {
    const response = await fetch("/api/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) });
    if (response.ok) {
      const data = await response.json() as { event: EventItem };
      let saved = data.event;
      if (attachment) {
        const body = new FormData();
        body.append("file", attachment);
        body.append("eventId", saved.id);
        const upload = await fetch("/api/files", { method: "POST", body });
        if (upload.ok) {
          const uploaded = await upload.json() as { attachment: { id: string; filename: string; size: number } };
          saved = { ...saved, attachments: [uploaded.attachment] };
        }
      }
      setEvents((current) => [...current.filter((item) => item.id !== saved.id), saved]);
      setAttachment(null);
      setModalOpen(false);
    }
  }

  async function toggleEvent(event: EventItem) {
    const next = { ...event, completed: !event.completed };
    setEvents((current) => current.map((item) => item.id === event.id ? next : item));
    if (!event.id.startsWith("demo-")) await fetch(`/api/calendar/${event.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: next.completed }) });
  }

  function openNew(date = selectedDate) {
    setForm({ title: "", date, startTime: "09:00", endTime: "10:00", category: "仕事", notes: "" });
    setModalOpen(true);
  }

  function changeMonth(amount: number) { setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + amount, 1)); }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">◒</span><span>My Day</span><span className="brand-pill">PRIVATE CALENDAR</span></div>
        <div className="top-actions"><span className="sync-label">{userEmail ? "ChatGPTでログイン中" : "サンプル表示中"}</span>{userEmail ? <button className="ghost-button" onClick={() => setSettingsOpen(true)}>アカウント</button> : <a className="ghost-button" href="/signin-with-chatgpt?return_to=/">ChatGPTでログイン</a>}</div>
      </header>

      <section className="intro"><div><p className="eyebrow">YOUR SPACE, YOUR RHYTHM</p><h1>今日を、少しだけ<br /><em>軽くする。</em></h1><p className="subcopy">予定とタスクをひとつに。あなたのペースで使う、静かなカレンダー。</p></div><button className="primary-button" onClick={() => openNew()}>＋ 予定を追加</button></section>

      <section className="dashboard">
        <div className="calendar-card">
          <div className="calendar-head"><div><p className="eyebrow">CALENDAR</p><h2>{monthNames[cursor.getMonth()]} <span>{cursor.getFullYear()}</span></h2></div><div className="month-actions"><button onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>今日</button><button onClick={() => changeMonth(-1)}>‹</button><button onClick={() => changeMonth(1)}>›</button></div></div>
          <div className="week-row">{weekNames.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">{days.map((day) => { const key = dateKey(day); const isCurrentMonth = day.getMonth() === cursor.getMonth(); const isSelected = key === selectedDate; const isToday = key === dateKey(today); const dayEvents = events.filter((event) => event.date === key); return <button className={`day-cell ${!isCurrentMonth ? "muted" : ""} ${isSelected ? "selected" : ""} ${isToday ? "today" : ""}`} key={key} onClick={() => setSelectedDate(key)}><span className="day-number">{day.getDate()}</span>{dayEvents.slice(0, 2).map((event) => <span className={`event-dot ${event.category === "生活" ? "green" : event.category === "予定" ? "yellow" : ""}`} key={event.id}>{event.title}</span>)}</button>; })}</div>
        </div>

        <aside className="agenda-card"><div className="agenda-head"><div><p className="eyebrow">AGENDA</p><h2>{formatDate(selectedDate)}</h2></div><button className="icon-button" onClick={() => openNew()} aria-label="予定を追加">＋</button></div><div className="agenda-list">{selectedEvents.length ? selectedEvents.map((event) => <article className={`agenda-item ${event.completed ? "done" : ""}`} key={event.id}><div className="time">{event.startTime}<small>{event.endTime}</small></div><button className={`check ${event.completed ? "checked" : ""}`} onClick={() => toggleEvent(event)} aria-label="完了にする">{event.completed ? "✓" : ""}</button><div className="event-info"><h3>{event.title}</h3><p><span className={`category ${event.category === "生活" ? "life" : event.category === "予定" ? "plan" : "work"}`}>{event.category}</span>{event.notes && <span>{event.notes}</span>}</p>{event.attachments?.length ? <p className="attachment-chip">⌕ {event.attachments[0].filename}</p> : null}</div></article>) : <div className="empty-state"><span>○</span><p>この日の予定はありません。<br />余白も、予定のうち。</p><button onClick={() => openNew()}>予定を追加する</button></div>}</div><div className="agenda-footer"><span>{openEvents}件の未完了タスク</span><button onClick={() => setSettingsOpen(true)}>設定 →</button></div></aside>
      </section>

      <section className="bottom-row"><div className="tip-card"><span className="tip-icon">✦</span><div><p className="eyebrow">A LITTLE NOTE</p><h3>すべてを埋めなくていい。</h3><p>空白の時間も、あなたの予定です。</p></div></div><div className="storage-card"><div className="storage-top"><span>添付ファイル</span><strong>R2 STORAGE</strong></div><div className="storage-bar"><span /></div><p>タスクに資料・画像・メモを添付できます</p></div></section>

      {modalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}><form className="modal" onSubmit={(event) => { event.preventDefault(); saveEvent({ id: crypto.randomUUID(), ...form, completed: false }); }}><div className="modal-head"><div><p className="eyebrow">NEW ITEM</p><h2>予定を追加</h2></div><button type="button" className="close-button" onClick={() => setModalOpen(false)}>×</button></div><label>タイトル<input autoFocus required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例：資料を仕上げる" /></label><div className="form-row"><label>日付<input type="date" value={form.date} onChange={(event) => { setForm({ ...form, date: event.target.value }); setSelectedDate(event.target.value); }} /></label><label>カテゴリ<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>仕事</option><option>生活</option><option>予定</option></select></label></div><div className="form-row"><label>開始<input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label><label>終了<input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></label></div><label>メモ<textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="必要ならメモを残せます" /></label><label className="file-input">添付ファイル<input type="file" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} /><span>{attachment ? `⌕ ${attachment.name}` : "ファイルを選択（R2に保存）"}</span></label><div className="modal-footer"><span>{userEmail ? "この予定はあなたのアカウントに保存されます" : "ログイン後に個人用として保存できます"}</span><button className="primary-button" type="submit">保存する</button></div></form></div>}
      {settingsOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}><div className="modal small-modal"><div className="modal-head"><div><p className="eyebrow">ACCOUNT</p><h2>あなたのMy Day</h2></div><button className="close-button" onClick={() => setSettingsOpen(false)}>×</button></div><p className="settings-copy">予定と添付ファイルは、ChatGPTでログインしたアカウントごとに分けて保存されます。</p>{userEmail ? <><div className="account-chip">◉　{userEmail}</div><a className="signout" href="/signout-with-chatgpt?return_to=/">ログアウト</a></> : <><p className="settings-copy">今はサンプル表示です。ログインすると、自分専用のカレンダーとして使えます。</p><a className="primary-button link-button" href="/signin-with-chatgpt?return_to=/">ChatGPTでログインする</a></>}</div></div>}
    </main>
  );
}
