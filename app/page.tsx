"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import GroupsPanel from "./groups-panel";
import GroupEntryPanel from "./group-entry-panel";
import ShiftBuilder from "./shift-builder";
import ShiftRoster from "./shift-roster";
import AuditLogPanel from "./audit-log-panel";
import ProfilePanel from "./profile-panel";
import ShiftRequests from "./shift-requests";
import ShiftAdjustment from "./shift-adjustment";
import GroupMenu from "./group-menu";
import GroupPreferencesPanel from "./group-preferences-panel";
import AnnouncementsPanel from "./announcements-panel";
import DashboardPanel from "./dashboard-panel";
import WorkRecordsPanel from "./work-records-panel";
import MonthlyWorkPanel from "./monthly-work-panel";
import { localApiFetch } from "./local-api";
import { displayShiftTime } from "./shift-time";

type EventItem = {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  startTime: string;
  endTime: string;
  category: string;
  notes: string;
  completed: boolean;
  groupId?: string | null;
  groupName?: string | null;
  readOnly?: boolean;
};
type FormState = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  category: string;
  notes: string;
};
type GroupMembership = {
  groupId: string;
  name?: string;
  role: string;
  showInPersonal: boolean;
  unreadAnnouncements?: number;
  unreadAssistant?: boolean;
};

function ModalClose({ onClose }: { onClose: () => void }) {
  return <button type="button" className="modal-global-close" onClick={onClose} aria-label="閉じる">×</button>;
}

const today = new Date();
const todayKey = keyForDate(today);
const monthNames = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
];
const weekNames = ["日", "月", "火", "水", "木", "金", "土"];
const demoEvents: EventItem[] = [
  {
    id: "demo-1",
    title: "AIエージェント操作の練習",
    date: todayKey,
    startTime: "09:30",
    endTime: "10:00",
    category: "仕事",
    notes: "",
    completed: false,
  },
  {
    id: "demo-2",
    title: "買い物",
    date: todayKey,
    startTime: "18:00",
    endTime: "19:00",
    category: "生活",
    notes: "",
    completed: false,
  },
];

function keyForDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function formatDate(key: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${key}T00:00:00`));
}
function daysForMonth(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from(
    { length: 42 },
    (_, index) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
  );
}
function emptyForm(date: string): FormState {
  return {
    title: "",
    date,
    startTime: "09:00",
    endTime: "10:00",
    category: "仕事",
    notes: "",
  };
}

export default function Home() {
  const [cursor, setCursor] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [events, setEvents] = useState<EventItem[]>(
    process.env.NEXT_PUBLIC_LOCAL_MODE === "true" ? [] : demoEvents,
  );
  const [groups, setGroups] = useState<GroupMembership[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(
    process.env.NEXT_PUBLIC_LOCAL_MODE === "true"
      ? `${process.env.NEXT_PUBLIC_LOCAL_USER_ID || "tanaka"}@local.test`
      : null,
  );
  const [accountNickname, setAccountNickname] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<EventItem | null>(null);
  const [dayAgendaOpen, setDayAgendaOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groupJoinOpen, setGroupJoinOpen] = useState(false);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftAdjustmentOpen, setShiftAdjustmentOpen] = useState(false);
  const [shiftRosterOpen, setShiftRosterOpen] = useState(false);
  const [shiftRequestsOpen, setShiftRequestsOpen] = useState(false);
  const [menuGroupId, setMenuGroupId] = useState<string | undefined>();
  const [groupPreferencesOpen, setGroupPreferencesOpen] = useState(false);
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [announcementsTab, setAnnouncementsTab] = useState<"announcements" | "assistant">("announcements");
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [auditLogsOpen, setAuditLogsOpen] = useState(false);
  const [workRecordsOpen, setWorkRecordsOpen] = useState(false);
  const [workRecordsManager, setWorkRecordsManager] = useState(false);
  const [monthlyWorkOpen, setMonthlyWorkOpen] = useState(false);
  const [monthlyWorkManager, setMonthlyWorkManager] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm(todayKey));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const notificationTargetRef = useRef<string | null>(null);
  const days = useMemo(
    () => daysForMonth(cursor.getFullYear(), cursor.getMonth()),
    [cursor],
  );
  const selectedEvents = events
    .filter((event) => event.date === selectedDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const editableGroups = groups.filter(
    (group) => group.role === "owner" || group.role === "editor",
  );

  useEffect(() => {
    void loadCalendar();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetGroupId = params.get("group")?.trim() ?? "";
    const targetView = params.get("view")?.trim() ?? "";
    const targetKey = `${targetGroupId}:${targetView}`;
    if (!targetGroupId || !targetView || notificationTargetRef.current === targetKey)
      return;
    if (!groups.some((group) => group.groupId === targetGroupId)) return;
    notificationTargetRef.current = targetKey;
    setMenuGroupId(targetGroupId);
    if (targetView === "roster") setShiftRosterOpen(true);
    if (targetView === "announcements" || targetView === "assistant") {
      setAnnouncementsTab(targetView === "assistant" ? "assistant" : "announcements");
      setAnnouncementsOpen(true);
    }
    if (targetView === "work-records") {
      setWorkRecordsManager(false);
      setWorkRecordsOpen(true);
    }
    if (targetView === "monthly-work") {
      setMonthlyWorkManager(false);
      setMonthlyWorkOpen(true);
    }
  }, [groups]);

  async function loadCalendar() {
    const response = await localApiFetch("/api/calendar");
    if (!response.ok) return;
    const data = (await response.json()) as {
      email: string;
      events: EventItem[];
      groups?: GroupMembership[];
    };
    setUserEmail(data.email);
    const profileResponse = await localApiFetch("/api/profile");
    if (profileResponse.ok) {
      const profile = (await profileResponse.json()) as { nickname?: string };
      setAccountNickname(profile.nickname?.trim() ?? "");
    }
    setEvents(data.events);
    const memberships = data.groups ?? [];
    const withUnread = await Promise.all(
      memberships.map(async (group) => {
        const announcementResponse = await localApiFetch(
          `/api/groups/${group.groupId}/announcements`,
        );
        if (!announcementResponse.ok) return group;
        const announcementData = (await announcementResponse.json()) as {
          announcements?: Array<{ id: string }>;
          reads?: Array<{ announcementId: string }>;
        };
        const readIds = new Set(
          (announcementData.reads ?? []).map((read) => read.announcementId),
        );
        return {
          ...group,
          unreadAnnouncements: (announcementData.announcements ?? []).filter(
            (item) => !readIds.has(item.id),
          ).length,
        };
      }),
    );
    setGroups(withUnread);
  }

  function openNew(date = selectedDate) {
    setEditingId(null);
    setGroupId("");
    setForm(emptyForm(date));
    setEditorOpen(true);
  }
  function openDayAgenda(date: string) {
    setSelectedDate(date);
    setDayAgendaOpen(true);
  }
  function moveDayAgenda(offset: number) {
    const current = new Date(`${selectedDate}T00:00:00`);
    current.setDate(current.getDate() + offset);
    const nextDate = keyForDate(current);
    setSelectedDate(nextDate);
    setCursor(new Date(current.getFullYear(), current.getMonth(), 1));
  }
  function showTodayAgenda() {
    setSelectedDate(todayKey);
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
  }
  function openEdit(event: EventItem) {
    setDetailEvent(null);
    setEditingId(event.id);
    setGroupId(event.groupId ?? "");
    setForm({
      title: event.title,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      category: event.category,
      notes: event.notes,
    });
    setEditorOpen(true);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || saving) return;
    setSaving(true);
    const isDemo = editingId?.startsWith("demo-");
    let saved: EventItem | null = null;
    const payload = { ...form, groupId: groupId || undefined };
    if (isDemo)
      saved = {
        id: editingId!,
        ...form,
        groupId: groupId || null,
        completed:
          events.find((item) => item.id === editingId)?.completed ?? false,
      };
    else if (editingId) {
      const response = await localApiFetch(`/api/calendar/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok)
        saved = ((await response.json()) as { event: EventItem }).event;
    } else {
      const response = await localApiFetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok)
        saved = ((await response.json()) as { event: EventItem }).event;
      else
        setNotice(
          ((await response.json().catch(() => ({}))) as { error?: string })
            .error ?? "予定を保存できませんでした",
        );
    }
    if (saved)
      setEvents((current) => [
        ...current.filter((item) => item.id !== saved!.id),
        saved!,
      ]);
    if (saved) {
      setSelectedDate(saved.date);
      setEditorOpen(false);
    }
    setSaving(false);
  }

  async function toggleEvent(event: EventItem) {
    if (event.readOnly) return;
    const next = { ...event, completed: !event.completed };
    setEvents((current) =>
      current.map((item) => (item.id === event.id ? next : item)),
    );
    if (!event.id.startsWith("demo-"))
      await localApiFetch(`/api/calendar/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: next.completed }),
      });
  }
  async function deleteEvent(event: EventItem) {
    if (!window.confirm(`「${event.title}」を削除しますか？`)) return;
    setDetailEvent(null);
    setEvents((current) => current.filter((item) => item.id !== event.id));
    if (!event.id.startsWith("demo-"))
      await localApiFetch(`/api/calendar/${event.id}`, { method: "DELETE" });
  }
  function openGroupTarget(
    groupId: string,
    target: "basic" | "requests" | "shift" | "members" | "adjustment",
  ) {
    setMenuGroupId(groupId);
    if (target === "basic") setGroupPreferencesOpen(true);
    if (target === "members") setGroupsOpen(true);
    if (target === "requests") setShiftRequestsOpen(true);
    if (target === "shift") setShiftOpen(true);
    if (target === "adjustment") setShiftAdjustmentOpen(true);
  }

  return (
    <main className="shell">
      {notice && (
        <div className="upload-notice" role="alert">
          {notice}
          <button onClick={() => setNotice(null)} aria-label="閉じる">
            ×
          </button>
        </div>
      )}
      <header className="topbar">
        <button
          type="button"
          className="brand"
          onClick={() => window.location.assign("/")}
          aria-label="ホームを再読み込み"
          title="ホームを再読み込み"
        >
          <img className="brand-mark" src="/kinban-mark.png" alt="" />
          <span>勤番 <small className="brand-latin">KINBAN</small></span>
          <span className="brand-pill">シフト、勤怠管理をひとつに。</span>
        </button>
        <div className="top-actions">
          <details className="demo-notice">
            <summary>⚠ デモ用</summary>
            <div>
              <strong>デモ用サイトです</strong>
              <p>
                予告なく終了する可能性があります。登録した情報が漏洩する可能性もあります。
              </p>
              <p>重要な情報は登録しないでください。</p>
            </div>
          </details>
          <a className="ghost-button" href="/demo">
            デモを試す
          </a>
          <span className="sync-label">
            {process.env.NEXT_PUBLIC_LOCAL_MODE === "true"
              ? "ローカル開発モード"
              : userEmail
                ? "ChatGPTでログイン中"
                : "サンプル表示中"}
          </span>
          {userEmail ? (
            <button
              className="ghost-button"
              onClick={() => setSettingsOpen(true)}
            >
              {accountNickname || "アカウント"}
            </button>
          ) : (
            <a className="ghost-button" href="/signin-with-chatgpt?return_to=/">
              ChatGPTでログイン
            </a>
          )}
        </div>
      </header>
      <GroupMenu
        groups={groups}
        onApplications={() => {
          setMenuGroupId(undefined);
          setGroupJoinOpen(true);
        }}
        onCreateGroup={() => {
          setMenuGroupId(undefined);
          setGroupCreateOpen(true);
        }}
        onBasic={(groupId) => openGroupTarget(groupId, "basic")}
        onRequests={(groupId) => openGroupTarget(groupId, "requests")}
        onRoster={(groupId) => {
          setMenuGroupId(groupId);
          setShiftRosterOpen(true);
        }}
        onShiftBuilder={(groupId) => openGroupTarget(groupId, "shift")}
        onShiftAdjustment={(groupId) => openGroupTarget(groupId, "adjustment")}
        onMembers={(groupId) => openGroupTarget(groupId, "members")}
        onAnnouncements={(groupId) => {
          setMenuGroupId(groupId);
          setAnnouncementsTab("announcements");
          setAnnouncementsOpen(true);
        }}
        onDashboard={(groupId) => {
          setMenuGroupId(groupId);
          setDashboardOpen(true);
        }}
        onAuditLogs={(groupId) => {
          setMenuGroupId(groupId);
          setAuditLogsOpen(true);
        }}
        onWorkDeclare={(groupId) => {
          setMenuGroupId(groupId);
          setWorkRecordsManager(false);
          setWorkRecordsOpen(true);
        }}
        onWorkApprove={(groupId) => {
          setMenuGroupId(groupId);
          setWorkRecordsManager(true);
          setWorkRecordsOpen(true);
        }}
        onMonthlyDeclare={(groupId) => {
          setMenuGroupId(groupId);
          setMonthlyWorkManager(false);
          setMonthlyWorkOpen(true);
        }}
        onMonthlyApprove={(groupId) => {
          setMenuGroupId(groupId);
          setMonthlyWorkManager(true);
          setMonthlyWorkOpen(true);
        }}
      />
      <section className="intro compact-intro">
        <div>
          <p className="eyebrow">YOUR SPACE, YOUR RHYTHM</p>
          <h1>
            今日を、少しずつ
            <br />
            <em>軽くする。</em>
          </h1>
          <p className="subcopy">
            予定とタスクをひとつに。あなたのペースで使える、静かなカレンダー。
          </p>
        </div>
        <button className="primary-button" onClick={() => openNew()}>
          ＋ 予定を追加
        </button>
      </section>
      <section className="dashboard">
        <div className="calendar-card">
          <div className="calendar-head">
            <div>
              <p className="eyebrow">CALENDAR</p>
              <h2>
                {monthNames[cursor.getMonth()]}{" "}
                <span>{cursor.getFullYear()}</span>
              </h2>
            </div>
            <div className="month-actions">
              <button
                onClick={() =>
                  setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
                }
              >
                今日
              </button>
              <button
                onClick={() =>
                  setCursor(
                    new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1),
                  )
                }
              >
                ‹
              </button>
              <button
                onClick={() =>
                  setCursor(
                    new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1),
                  )
                }
              >
                ›
              </button>
            </div>
          </div>
          <div className="week-row">
            {weekNames.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {days.map((day) => {
              const key = keyForDate(day);
              const dayEvents = events.filter((item) => item.date === key);
              return (
                <button
                  className={`day-cell ${day.getMonth() !== cursor.getMonth() ? "muted" : ""} ${key === selectedDate ? "selected" : ""} ${key === todayKey ? "today" : ""}`}
                  key={key}
                  onClick={() => openDayAgenda(key)}
                >
                  <span className="day-number">{day.getDate()}</span>
                  {dayEvents
                    .slice(0, 2)
                    .map((item) => (
                      <span
                        className={`event-dot ${item.category === "生活" ? "green" : item.category === "予定" ? "yellow" : ""}`}
                        key={item.id}
                      >
                        {displayShiftTime(item.startTime)} {item.title.length > 3 ? `${item.title.slice(0, 3)}…` : item.title}
                      </span>
                    ))}
                  {dayEvents.length > 2 && (
                    <span className="event-more">+{dayEvents.length - 2}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>
      {editorOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditorOpen(false);
          }}
        >
          <form className="modal" onSubmit={handleSave}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">
                  {editingId ? "EDIT ITEM" : "NEW ITEM"}
                </p>
                <h2>{editingId ? "予定を編集" : "予定を追加"}</h2>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => setEditorOpen(false)}
              >
                ×
              </button>
            </div>
            <label>
              タイトル
              <input
                autoFocus
                required
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
              />
            </label>
            <div className="form-row">
              <label>
                日付
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => {
                    setForm({ ...form, date: event.target.value });
                    setSelectedDate(event.target.value);
                  }}
                />
              </label>
              <label>
                カテゴリ
                <select
                  value={form.category}
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value })
                  }
                >
                  <option>仕事</option>
                  <option>生活</option>
                  <option>予定</option>
                </select>
              </label>
            </div>
            {editableGroups.length > 0 && (
              <label>
                保存先
                <select
                  value={groupId}
                  onChange={(event) => setGroupId(event.target.value)}
                >
                  <option value="">個人カレンダー</option>
                  {editableGroups.map((group) => (
                    <option key={group.groupId} value={group.groupId}>
                      グループ：{group.name ?? group.groupId.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="form-row">
              <label>
                開始
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(event) =>
                    setForm({ ...form, startTime: event.target.value })
                  }
                />
              </label>
              <label>
                終了
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(event) =>
                    setForm({ ...form, endTime: event.target.value })
                  }
                />
              </label>
            </div>
            <label>
              メモ
              <textarea
                rows={3}
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
              />
            </label>
            <div className="modal-footer">
              <span>
                {process.env.NEXT_PUBLIC_LOCAL_MODE === "true"
                  ? "ローカル開発モード：認証なし"
                  : "ログイン中のアカウントに保存されます"}
              </span>
              <button
                className="primary-button"
                type="submit"
                disabled={saving}
              >
                {saving ? "保存中…" : "保存する"}
              </button>
            </div>
          </form>
        </div>
      )}
      {dayAgendaOpen && (
        <div
          className="modal-backdrop day-agenda-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDayAgendaOpen(false);
          }}
        >
          <div className="modal day-agenda-modal">
            <div className="modal-head">
              <div>
                <p className="eyebrow">DAY SCHEDULE</p>
                <h2>{formatDate(selectedDate)}</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setDayAgendaOpen(false)}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <div className="day-agenda-nav" aria-label="日付移動">
              <button type="button" onClick={() => moveDayAgenda(-1)}>前日</button>
              <button type="button" onClick={showTodayAgenda}>今日</button>
              <button type="button" onClick={() => moveDayAgenda(1)}>翌日</button>
            </div>
            <div className="day-agenda-list">
              {selectedEvents.length ? (
                selectedEvents.map((item) => (
                  <button
                    type="button"
                    className={`day-agenda-item ${item.completed ? "done" : ""}`}
                    key={item.id}
                    onClick={() => {
                      setDayAgendaOpen(false);
                      setDetailEvent(item);
                    }}
                  >
                    <span className="day-agenda-time">
                      {displayShiftTime(item.startTime)}〜{displayShiftTime(item.endTime)}
                    </span>
                    <span className="day-agenda-content">
                      <strong>{item.title}</strong>
                      <small>
                        <span
                          className={`category ${item.category === "生活" ? "life" : item.category === "予定" ? "plan" : "work"}`}
                        >
                          {item.category}
                        </span>
                        {item.groupName ? ` ${item.groupName}` : item.groupId ? " グループ予定" : ""}
                      </small>
                    </span>
                    <span className="open-detail">›</span>
                  </button>
                ))
              ) : (
                <p className="day-agenda-empty">この日の予定はありません。</p>
              )}
            </div>
            <div className="modal-footer">
              <span>{selectedEvents.length}件の予定</span>
              <button
                className="primary-button"
                onClick={() => {
                  setDayAgendaOpen(false);
                  openNew(selectedDate);
                }}
              >
                予定を追加
              </button>
            </div>
          </div>
        </div>
      )}
      {detailEvent && (
        <div
          className="modal-backdrop detail-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailEvent(null);
          }}
        >
          <div className="modal detail-modal">
            <div className="modal-head">
              <div>
                <p className="eyebrow">DETAIL</p>
                <h2>{detailEvent.title}</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setDetailEvent(null)}
              >
                ×
              </button>
            </div>
            <div className="detail-meta">
              <span className="category">{detailEvent.category}</span>
              <span>{formatDate(detailEvent.date)}</span>
              <span>
                {detailEvent.startTime} — {detailEvent.endDate && detailEvent.endDate !== detailEvent.date ? `${formatDate(detailEvent.endDate)} ` : ""}{displayShiftTime(detailEvent.endTime)}
              </span>
              {detailEvent.groupId && (
                <span className="category">グループ予定</span>
              )}
            </div>
            {detailEvent.notes && (
              <div className="detail-notes">{detailEvent.notes}</div>
            )}
            {detailEvent.readOnly ? (
              <p className="settings-copy">
                この予定はグループから共有されています。編集権限が必要です。
              </p>
            ) : (
              <div className="detail-actions">
                <button
                  className="danger-button"
                  onClick={() => void deleteEvent(detailEvent)}
                >
                  削除
                </button>
                <button
                  className="primary-button"
                  onClick={() => openEdit(detailEvent)}
                >
                  編集する
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {groupsOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setGroupsOpen(false);
          }}
        >
          <div className="modal groups-modal">
            <ModalClose onClose={() => setGroupsOpen(false)} />
            <GroupsPanel
              initialGroupId={menuGroupId}
              onChanged={() => {
                void loadCalendar();
              }}
            />
          </div>
        </div>
      )}
      {groupJoinOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setGroupJoinOpen(false); }}>
          <div className="modal small-modal">
            <div className="modal-head"><div><p className="eyebrow">GROUP</p><h2>グループ申請</h2></div><button className="close-button" onClick={() => setGroupJoinOpen(false)}>×</button></div>
            <GroupEntryPanel mode="join" />
          </div>
        </div>
      )}
      {groupCreateOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setGroupCreateOpen(false); }}>
          <div className="modal small-modal">
            <div className="modal-head"><div><p className="eyebrow">GROUP</p><h2>グループ作成</h2></div><button className="close-button" onClick={() => setGroupCreateOpen(false)}>×</button></div>
            <GroupEntryPanel mode="create" />
          </div>
        </div>
      )}
      {shiftOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShiftOpen(false);
          }}
        >
          <div className="modal shift-modal">
            <ModalClose onClose={() => setShiftOpen(false)} />
            <ShiftBuilder initialGroupId={menuGroupId} />
          </div>
        </div>
      )}
      {shiftAdjustmentOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setShiftAdjustmentOpen(false);
          }}
        >
          <div className="modal shift-modal">
            <ModalClose onClose={() => setShiftAdjustmentOpen(false)} />
            <ShiftAdjustment initialGroupId={menuGroupId} />
          </div>
        </div>
      )}
      {shiftRosterOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShiftRosterOpen(false);
          }}
        >
          <div className="modal shift-modal">
            <ModalClose onClose={() => setShiftRosterOpen(false)} />
            <ShiftRoster initialGroupId={menuGroupId} />
          </div>
        </div>
      )}
      {shiftRequestsOpen && (
        <div
          className="modal-backdrop request-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setShiftRequestsOpen(false);
          }}
        >
          <div className="modal shift-modal request-modal">
            <ModalClose onClose={() => setShiftRequestsOpen(false)} />
            <ShiftRequests initialGroupId={menuGroupId} />
          </div>
        </div>
      )}
      {announcementsOpen && menuGroupId && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setAnnouncementsOpen(false);
          }}
        >
          <div className="modal groups-modal">
            <ModalClose onClose={() => setAnnouncementsOpen(false)} />
            <AnnouncementsPanel
              groupId={menuGroupId}
              initialTab={announcementsTab}
              assistantUnread={groups.find((group) => group.groupId === menuGroupId)?.unreadAssistant ?? false}
              onAssistantRead={() => setGroups((current) => current.map((group) => group.groupId === menuGroupId ? { ...group, unreadAssistant: false } : group))}
              manager={editableGroups.some(
                (group) => group.groupId === menuGroupId,
              )}
            />
          </div>
        </div>
      )}
      {dashboardOpen && menuGroupId && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDashboardOpen(false);
          }}
        >
          <div className="modal groups-modal">
            <ModalClose onClose={() => setDashboardOpen(false)} />
            <DashboardPanel groupId={menuGroupId} />
          </div>
        </div>
      )}
      {auditLogsOpen && menuGroupId && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuditLogsOpen(false); }}>
          <div className="modal groups-modal"><ModalClose onClose={() => setAuditLogsOpen(false)} /><AuditLogPanel groupId={menuGroupId} /></div>
        </div>
      )}
      {workRecordsOpen && menuGroupId && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setWorkRecordsOpen(false); }}>
          <div className="modal groups-modal work-records-modal"><ModalClose onClose={() => setWorkRecordsOpen(false)} /><WorkRecordsPanel groupId={menuGroupId} manager={workRecordsManager} /></div>
        </div>
      )}
      {monthlyWorkOpen && menuGroupId && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMonthlyWorkOpen(false); }}>
          <div className="modal groups-modal work-records-modal monthly-work-modal"><ModalClose onClose={() => setMonthlyWorkOpen(false)} /><MonthlyWorkPanel groupId={menuGroupId} manager={monthlyWorkManager} /></div>
        </div>
      )}
      {groupPreferencesOpen && menuGroupId && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setGroupPreferencesOpen(false);
          }}
        >
          <div className="modal groups-modal">
            <div className="modal-head">
              <div>
                <p className="eyebrow">GROUP SETTINGS</p>
                <h2>基本設定（{groups.find((group) => group.groupId === menuGroupId)?.name ?? ""}）</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setGroupPreferencesOpen(false)}
              >
                ×
              </button>
            </div>
            <GroupPreferencesPanel groupId={menuGroupId} />
          </div>
        </div>
      )}
      {settingsOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false);
          }}
        >
          <div className="modal small-modal">
            <div className="modal-head">
              <div>
                <p className="eyebrow">ACCOUNT</p>
                <h2>あなたの勤番</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setSettingsOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="settings-copy">
              予定は、アカウントごとに分けて保存されます。
            </p>
            {userEmail ? (
              <ProfilePanel email={userEmail} />
            ) : (
              <a
                className="primary-button link-button"
                href="/signin-with-chatgpt?return_to=/"
              >
                ChatGPTでログインする
              </a>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
