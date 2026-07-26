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
import SiteAdminPanel from "./site-admin-panel";
import MemosPanel from "./memos-panel";
import KnowledgePanel from "./knowledge-panel";
import { localApiFetch } from "./local-api";
import { isDemoModeClient } from "./client-demo-mode";
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
  assistantDisplayName?: string;
  unreadAnnouncements?: number;
  unreadAssistant?: boolean;
  managerAssistantUnread?: boolean;
};
type SiteAccess = { isSiteAdmin: boolean; canCreateGroups: boolean };

function ModalClose({ onClose }: { onClose: () => void }) {
  return <button type="button" className="modal-global-close" onClick={onClose} aria-label="閉じる">×</button>;
}

// Keep the server and first browser render identical. The real clock is loaded
// after mount (and the demo clock is loaded from the API), avoiding hydration
// errors when the hosting runtime clock differs from the browser clock.
const today = new Date("2000-01-01T00:00:00.000Z");
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
function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.MAX_SAFE_INTEGER;
  return hours * 60 + minutes;
}
function compareEvents(a: EventItem, b: EventItem) {
  return (
    a.date.localeCompare(b.date) ||
    timeToMinutes(a.startTime) - timeToMinutes(b.startTime) ||
    timeToMinutes(a.endTime) - timeToMinutes(b.endTime) ||
    a.title.localeCompare(b.title, "ja") ||
    a.id.localeCompare(b.id)
  );
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
  const [todayDate, setTodayDate] = useState(today);
  const [todayKeyState, setTodayKeyState] = useState(todayKey);
  const [cursor, setCursor] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [events, setEvents] = useState<EventItem[]>(
    [],
  );
  const [groups, setGroups] = useState<GroupMembership[]>([]);
  const [siteAccess, setSiteAccess] = useState<SiteAccess>({ isSiteAdmin: false, canCreateGroups: false });
  const [userEmail, setUserEmail] = useState<string | null>(
    null,
  );
  const [accountNickname, setAccountNickname] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<EventItem | null>(null);
  const [dayAgendaOpen, setDayAgendaOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groupJoinOpen, setGroupJoinOpen] = useState(false);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [siteAdminOpen, setSiteAdminOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftAdjustmentOpen, setShiftAdjustmentOpen] = useState(false);
  const [shiftRosterOpen, setShiftRosterOpen] = useState(false);
  const [shiftRequestsOpen, setShiftRequestsOpen] = useState(false);
  const [menuGroupId, setMenuGroupId] = useState<string | undefined>();
  const [groupPreferencesOpen, setGroupPreferencesOpen] = useState(false);
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [announcementsManager, setAnnouncementsManager] = useState(false);
  const [announcementsTab, setAnnouncementsTab] = useState<"announcements" | "assistant">("announcements");
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [auditLogsOpen, setAuditLogsOpen] = useState(false);
  const [workRecordsOpen, setWorkRecordsOpen] = useState(false);
  const [workRecordsManager, setWorkRecordsManager] = useState(false);
  const [monthlyWorkOpen, setMonthlyWorkOpen] = useState(false);
  const [monthlyWorkManager, setMonthlyWorkManager] = useState(false);
  const [memosOpen, setMemosOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm(todayKey));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const notificationTargetRef = useRef<string | null>(null);
  const days = useMemo(
    () => daysForMonth(cursor.getFullYear(), cursor.getMonth()),
    [cursor],
  );
  const selectedEvents = events
    .filter((event) => event.date === selectedDate)
    .sort(compareEvents);
  const editableGroups = groups.filter(
    (group) => group.role === "owner" || group.role === "editor",
  );

  useEffect(() => {
    setHydrated(true);
    const browserToday = new Date();
    setTodayDate(browserToday);
    setTodayKeyState(keyForDate(browserToday));
    setSelectedDate(keyForDate(browserToday));
    setCursor(new Date(browserToday.getFullYear(), browserToday.getMonth(), 1));
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
      siteAccess?: SiteAccess;
    };
    setUserEmail(data.email);
    const profileResponse = await localApiFetch("/api/profile");
    if (profileResponse.ok) {
      const profile = (await profileResponse.json()) as { nickname?: string };
      setAccountNickname(profile.nickname?.trim() ?? "");
    }
    setEvents(data.events);
    setSiteAccess(data.siteAccess ?? { isSiteAdmin: false, canCreateGroups: false });
    const memberships = data.groups ?? [];
    if (isDemoModeClient()) {
      const clockResponse = await fetch("/api/demo-clock", { cache: "no-store" });
      if (clockResponse.ok) {
        const clock = (await clockResponse.json()) as { currentAt?: string };
        if (clock.currentAt) {
          const nextToday = new Date(clock.currentAt);
          setTodayDate(nextToday);
          setTodayKeyState(keyForDate(nextToday));
          setSelectedDate(keyForDate(nextToday));
          setCursor(new Date(nextToday.getFullYear(), nextToday.getMonth(), 1));
        }
      }
    }
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
    setSelectedDate(todayKeyState);
    setCursor(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
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
          {hydrated && isDemoModeClient() && (
            <a className="ghost-button demo-entry-button" href="/demo">
              体験版（ユーザー切替）
            </a>
          )}
          {userEmail ? (
            <button
              className="ghost-button"
              onClick={() => setSettingsOpen(true)}
            >
              {accountNickname || "アカウント"}
            </button>
          ) : (
            <>
            <a className="ghost-button" href="/signin-with-chatgpt?return_to=/">
              ChatGPTでログイン
            </a>
            <a className="ghost-button" href="/signin-with-google?return_to=/">
              Googleでログイン
            </a>
            </>
          )}
        </div>
      </header>
      <GroupMenu
        groups={groups}
        canCreateGroups={siteAccess.canCreateGroups}
        onSiteAdmin={siteAccess.isSiteAdmin ? () => { setSiteAdminOpen(true); setMenuGroupId(undefined); } : undefined}
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
          setAnnouncementsManager(false);
          setAnnouncementsTab("announcements");
          setAnnouncementsOpen(true);
        }}
        onAssistant={(groupId) => {
          setMenuGroupId(groupId);
          setAnnouncementsManager(false);
          setAnnouncementsTab("assistant");
          setAnnouncementsOpen(true);
        }}
        onMemos={(groupId) => {
          setMenuGroupId(groupId);
          setMemosOpen(true);
        }}
        onKnowledge={(groupId) => {
          setMenuGroupId(groupId);
          setKnowledgeOpen(true);
        }}
        onAnnouncementManage={(groupId) => {
          setMenuGroupId(groupId);
          setAnnouncementsManager(true);
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
                  setCursor(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1))
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
              const dayEvents = events
                .filter((item) => item.date === key)
                .sort(compareEvents);
              return (
                <button
                  className={`day-cell ${day.getMonth() !== cursor.getMonth() ? "muted" : ""} ${key === selectedDate ? "selected" : ""} ${key === todayKeyState ? "today" : ""}`}
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
                {isDemoModeClient()
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
      {siteAdminOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSiteAdminOpen(false); }}>
          <div className="modal groups-modal"><ModalClose onClose={() => setSiteAdminOpen(false)} /><SiteAdminPanel /></div>
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
              assistantName={groups.find((group) => group.groupId === menuGroupId)?.assistantDisplayName}
              assistantUnread={announcementsManager ? groups.find((group) => group.groupId === menuGroupId)?.managerAssistantUnread ?? false : groups.find((group) => group.groupId === menuGroupId)?.unreadAssistant ?? false}
              onAssistantRead={() => { if (!announcementsManager) setGroups((current) => current.map((group) => group.groupId === menuGroupId ? { ...group, unreadAssistant: false } : group)); }}
              manager={announcementsManager}
            />
          </div>
        </div>
      )}
      {memosOpen && menuGroupId && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMemosOpen(false); }}>
          <div className="modal groups-modal memos-modal"><ModalClose onClose={() => setMemosOpen(false)} /><MemosPanel groupId={menuGroupId} /></div>
        </div>
      )}
      {knowledgeOpen && menuGroupId && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setKnowledgeOpen(false); }}>
          <div className="modal groups-modal memos-modal"><ModalClose onClose={() => setKnowledgeOpen(false)} /><KnowledgePanel groupId={menuGroupId} /></div>
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
              <>
              <a
                className="primary-button link-button"
                href="/signin-with-chatgpt?return_to=/"
              >
                ChatGPTでログインする
              </a>
              <a
                className="primary-button link-button"
                href="/signin-with-google?return_to=/"
              >
                Googleでログインする
              </a>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
