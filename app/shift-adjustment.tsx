"use client";

import { useEffect, useMemo, useState } from "react";
import { localApiFetch } from "./local-api";
import { getShiftDisplayLabel, getShiftDisplayStatus } from "./shift-status";
import { displayShiftTime, shiftTimeToMinutes } from "./shift-time";

type Group = { id: string; name: string; membership: { role: string } };
type Plan = {
  id: string;
  groupId: string;
  name: string;
  startDate: string;
  endDate: string;
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
type Member = { userEmail: string; displayName?: string | null };
type MemberAvailability = {
  userEmail: string;
  dayOfWeek: number;
  status: string;
  startTime: string;
  endTime: string;
};
type RequestRow = {
  userEmail: string;
  date: string;
  startTime: string;
  endTime: string;
  preference: string;
};
type RequestSubmission = {
  periodId: string;
  userEmail: string;
  savedAt: string;
  requestComment?: string;
};
type Detail = {
  plan: Plan;
  slots: Slot[];
  assignments: Array<{ slotId: string; userEmail: string }>;
  members: Member[];
  memberAvailability?: MemberAvailability[];
  requests?: RequestRow[];
  requestSubmissions?: RequestSubmission[];
};
type Preference = {
  minDays: number;
  maxDays: number;
  minHours: number;
  maxHours: number;
};
type AssignmentIssue = {
  id: string;
  kind: "shortage" | "excess" | "overlap";
  slotIds: string[];
  message: string;
};

function hours(start: string, end: string) {
  return Math.max(
    0,
    (shiftTimeToMinutes(end) - shiftTimeToMinutes(start)) / 60,
  );
}
function preferenceClass(value: string) {
  return ["want", "possible", "off", "unavailable"].includes(value)
    ? value
    : "possible";
}
function overlaps(left: Slot, right: Slot) {
  return (
    left.date === right.date &&
    shiftTimeToMinutes(left.startTime) < shiftTimeToMinutes(right.endTime) &&
    shiftTimeToMinutes(right.startTime) < shiftTimeToMinutes(left.endTime)
  );
}
function formatSubmissionTime(value: string | null) {
  if (!value) return "未登録";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function ShiftAdjustment({
  initialGroupId,
}: {
  initialGroupId?: string;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [groupId, setGroupId] = useState(initialGroupId ?? "");
  const [planId, setPlanId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [preferences, setPreferences] = useState<Record<string, Preference>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [showAllWarnings, setShowAllWarnings] = useState(false);
  const [warningFilter, setWarningFilter] = useState<"all" | "warnings">("all");
  const [viewMode, setViewMode] = useState<"preview" | "list" | "calendar">("preview");
  const selectedGroupName = groups.find((group) => group.id === groupId)?.name;
  async function loadGroups() {
    const response = await localApiFetch("/api/groups");
    if (!response.ok) return;
    const data = (await response.json()) as { groups: Group[] };
    setGroups(data.groups);
    if (!groupId && data.groups[0]) setGroupId(data.groups[0].id);
  }
  async function loadPlans(id: string) {
    if (!id) return;
    const response = await localApiFetch(
      `/api/shifts?groupId=${encodeURIComponent(id)}`,
    );
    if (!response.ok) return;
    const next = ((await response.json()) as { plans: Plan[] }).plans;
    setPlans(next);
    if (!planId && next[0]) setPlanId(next[0].id);
  }
  async function openPlan(id: string) {
    if (!id) return;
    const response = await localApiFetch(`/api/shifts/${id}`);
    if (response.ok) setDetail((await response.json()) as Detail);
  }
  async function loadPreferences(id: string) {
    const response = await localApiFetch(`/api/groups/${id}/preferences`);
    if (!response.ok) return;
    const data = (await response.json()) as { preferences: Preference };
    setPreferences((current) => ({ ...current, [id]: data.preferences }));
  }
  useEffect(() => {
    void loadGroups();
  }, []);
  useEffect(() => {
    if (initialGroupId) setGroupId(initialGroupId);
  }, [initialGroupId]);
  useEffect(() => {
    void loadPlans(groupId);
    if (groupId) void loadPreferences(groupId);
  }, [groupId]);
  useEffect(() => {
    void openPlan(planId);
  }, [planId]);
  const assignments = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const row of detail?.assignments ?? [])
      (map[row.slotId] ??= []).push(row.userEmail);
    return map;
  }, [detail]);
  const timeColumns = useMemo(
    () =>
      [
        ...new Map(
          (detail?.slots ?? []).map((slot) => [
            `${slot.startTime}|${slot.endTime}`,
            { startTime: slot.startTime, endTime: slot.endTime },
          ]),
        ).values(),
      ].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [detail],
  );
  const assignmentIssues = useMemo<AssignmentIssue[]>(() => {
    if (!detail) return [];
    const issues = new Map<string, AssignmentIssue>();
    for (const slot of detail.slots) {
      const assignedCount = new Set(assignments[slot.id] ?? []).size;
      if (assignedCount < slot.requiredCount) {
        issues.set(`shortage:${slot.id}`, {
          id: `shortage:${slot.id}`,
          kind: "shortage",
          slotIds: [slot.id],
          message: `${slot.date} ${displayShiftTime(slot.startTime)} ${slot.role || "共通"}：必要人数${slot.requiredCount}人に対して${assignedCount}人です`,
        });
      }
      if (assignedCount > slot.requiredCount) {
        issues.set(`excess:${slot.id}`, {
          id: `excess:${slot.id}`,
          kind: "excess",
          slotIds: [slot.id],
          message: `${slot.date} ${displayShiftTime(slot.startTime)} ${slot.role || "共通"}：${assignedCount - slot.requiredCount}人超過しています`,
        });
      }
    }
    const assignedSlots = detail.slots.flatMap((slot) =>
      [...new Set(assignments[slot.id] ?? [])].map((userEmail) => ({ slot, userEmail })),
    );
    for (let index = 0; index < assignedSlots.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < assignedSlots.length; nextIndex += 1) {
        const left = assignedSlots[index];
        const right = assignedSlots[nextIndex];
        if (left.userEmail !== right.userEmail || !overlaps(left.slot, right.slot)) continue;
        const [firstId, secondId] = [left.slot.id, right.slot.id].sort();
        const member = detail.members.find((row) => row.userEmail === left.userEmail);
        const memberName = member?.displayName || left.userEmail.split("@")[0];
        issues.set(`overlap:${left.userEmail}:${firstId}:${secondId}`, {
          id: `overlap:${left.userEmail}:${firstId}:${secondId}`,
          kind: "overlap",
          slotIds: [left.slot.id, right.slot.id],
          message: `${left.slot.date} ${memberName}：${left.slot.role || "共通"}と${right.slot.role || "共通"}の時間帯が重複しています`,
        });
      }
    }
    return [...issues.values()];
  }, [detail, assignments]);
  const warningSlotIds = useMemo(
    () => new Set(assignmentIssues.flatMap((issue) => issue.slotIds)),
    [assignmentIssues],
  );
  const visibleSlots = useMemo(
    () => (warningFilter === "warnings" ? (detail?.slots ?? []).filter((slot) => warningSlotIds.has(slot.id)) : (detail?.slots ?? [])),
    [detail, warningFilter, warningSlotIds],
  );
  const dates = useMemo(
    () => [...new Set(visibleSlots.map((slot) => slot.date))].sort(),
    [visibleSlots],
  );
  const warningSummary = useMemo(
    () => ({
      shortage: assignmentIssues.filter((issue) => issue.kind === "shortage").length,
      excess: assignmentIssues.filter((issue) => issue.kind === "excess").length,
      overlap: assignmentIssues.filter((issue) => issue.kind === "overlap").length,
    }),
    [assignmentIssues],
  );
  const memberSummary = useMemo(() => {
    if (!detail) return [];
    return detail.members.map((member) => {
      const slots = detail.slots.filter((slot) =>
        (assignments[slot.id] ?? []).includes(member.userEmail),
      );
      const days = new Set(slots.map((slot) => slot.date)).size;
      const totalHours = slots.reduce(
        (sum, slot) => sum + hours(slot.startTime, slot.endTime),
        0,
      );
      const pref = preferences[detail.plan.groupId];
      const warnings =
        pref &&
        (days < pref.minDays ||
          days > pref.maxDays ||
          totalHours < pref.minHours ||
          totalHours > pref.maxHours);
      const updatedAt =
        detail.requestSubmissions?.find(
          (submission) => submission.userEmail === member.userEmail,
        )?.savedAt ?? null;
      const requestComment = detail.requestSubmissions?.find(
        (submission) => submission.userEmail === member.userEmail,
      )?.requestComment?.trim() ?? "";
      return { member, days, totalHours, warnings, updatedAt, requestComment };
    });
  }, [detail, assignments, preferences]);
  function preferenceFor(slot: Slot, userEmail: string) {
    const request = detail?.requests?.find(
      (row) =>
        row.userEmail === userEmail &&
        row.date === slot.date &&
        row.startTime === slot.startTime &&
        row.endTime === slot.endTime,
    );
    if (request) return preferenceClass(request.preference);
    const weekday = new Date(`${slot.date}T00:00:00`).getDay();
    const rows =
      detail?.memberAvailability?.filter(
        (row) => row.userEmail === userEmail && row.dayOfWeek === weekday,
      ) ?? [];
    if (!rows.length) return "possible";
    const match = rows.find(
      (row) =>
        (!row.startTime && !row.endTime) ||
        (shiftTimeToMinutes(row.startTime) <=
          shiftTimeToMinutes(slot.startTime) &&
          shiftTimeToMinutes(row.endTime) >= shiftTimeToMinutes(slot.endTime)),
    );
    return match ? preferenceClass(match.status) : "unavailable";
  }
  function toggle(slotId: string, userEmail: string) {
    setDetail((currentDetail) => {
      if (!currentDetail) return currentDetail;
      const current = currentDetail.assignments
        .filter((row) => row.slotId === slotId)
        .map((row) => row.userEmail);
      const next = current.includes(userEmail)
        ? current.filter((email) => email !== userEmail)
        : [...current, userEmail];
      return {
        ...currentDetail,
        assignments: currentDetail.assignments
          .filter((row) => row.slotId !== slotId)
          .concat(next.map((email) => ({ slotId, userEmail: email }))),
      };
    });
  }
  function renderMember(slot: Slot, member: Member) {
    const assigned = (assignments[slot.id] ?? []).includes(member.userEmail);
    const preference = preferenceFor(slot, member.userEmail);
    return (
      <label
        className={`${assigned ? "assigned " : ""}pref-${preference}`}
        key={member.userEmail}
      >
        <input
          type="checkbox"
          checked={assigned}
          onChange={() => toggle(slot.id, member.userEmail)}
        />
        {member.displayName || member.userEmail.split("@")[0]}
      </label>
    );
  }
  function renderSlot(slot: Slot) {
    const assignedCount = new Set(assignments[slot.id] ?? []).size;
    const isShortage = assignedCount < slot.requiredCount;
    const isExcess = assignedCount > slot.requiredCount;
    const hasOverlap = assignmentIssues.some(
      (issue) => issue.kind === "overlap" && issue.slotIds.includes(slot.id),
    );
    return (
      <div className={`assignment-calendar-slot ${isShortage ? "is-shortage" : ""} ${isExcess ? "is-excess" : ""} ${hasOverlap ? "has-overlap" : ""}`} key={slot.id}>
        <strong>
          {slot.role || "共通"}
          <small>{assignedCount}/{slot.requiredCount}人</small>
        </strong>
        <div className="assignment-members">
          {detail?.members.map((member) => renderMember(slot, member))}
        </div>
      </div>
    );
  }
  async function save(status: "draft" | "published") {
    if (!detail) return;
    const nextStatus = detail.plan.status === "published" ? "published" : status;
    const publishedUpdate = detail.plan.status === "published";
    const reason = publishedUpdate ? window.prompt("公開済みシフトの変更理由（任意）") ?? "" : "";
    const warningText = assignmentIssues.length
      ? `\n\n未解消の警告が${assignmentIssues.length}件あります。`
      : "";
    if (
      nextStatus === "published" &&
      !window.confirm(
        `「${detail.plan.name}」を公開します。担当割り当てを確定し、メンバーのカレンダーに反映します。${warningText}\n\n公開してよいですか？`,
      )
    )
      return;
    setBusy(true);
    const response = await localApiFetch(`/api/shifts/${detail.plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments, status: nextStatus, reason, expectedVersion: detail.plan.version }),
    });
    const data = (await response.json()) as { error?: string };
    setNotice(
      response.ok
        ? nextStatus === "published"
          ? "シフトを公開しました"
          : "割り当てを保存しました"
        : (data.error ?? "保存できませんでした"),
    );
    setBusy(false);
    if (response.ok) await openPlan(detail.plan.id);
  }
  const renderedWarnings = showAllWarnings
    ? assignmentIssues
    : assignmentIssues.slice(0, 5);
  return (
    <section className="shift-adjustment-card">
      <div className="shift-builder-head">
        <div>
          <p className="eyebrow">SHIFT ADJUSTMENT</p>
          <h2>シフト割当{selectedGroupName ? `（${selectedGroupName}）` : ""}</h2>
          <p>勤務希望を確認しながら担当者を割り当てます。</p>
        </div>
      </div>
      <div className="shift-adjustment-toolbar">
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
        <select
          value={planId}
          onChange={(event) => setPlanId(event.target.value)}
        >
          <option value="">勤務枠を選択</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} ／ {plan.startDate}〜{plan.endDate} ／{" "}
              {getShiftDisplayLabel(getShiftDisplayStatus(plan))}
            </option>
          ))}
        </select>
        {detail && (
          <div className="view-toggle">
            <button
              type="button"
              className={viewMode === "preview" ? "active" : ""}
              onClick={() => setViewMode("preview")}
            >
              プレビュー
            </button>
            <button
              type="button"
              className={viewMode === "list" ? "active" : ""}
              onClick={() => setViewMode("list")}
            >
              一覧
            </button>
            <button
              type="button"
              className={viewMode === "calendar" ? "active" : ""}
              onClick={() => setViewMode("calendar")}
            >
              時刻を列で表示
            </button>
          </div>
        )}
      </div>
      {detail && (
        <>
          <div className="shift-actions shift-actions-top">
            <button
              className="ghost-button"
              onClick={() => void save("draft")}
              disabled={busy}
            >
              保存
            </button>
          </div>
          <div className="assignment-summary">
            <strong>{detail.plan.name}</strong>
            <span>{detail.slots.length}枠</span>
            <span className="assignment-legend">
              <i className="pref-want">出勤希望</i>
              <i className="pref-possible">可能</i>
              <i className="pref-off">休み希望</i>
              <i className="pref-unavailable">勤務不可</i>
            </span>
          </div>
          <div className="assignment-warning-filter" aria-label="割り当て警告の表示">
            <div className="assignment-warning-filter-buttons">
              <button type="button" className={warningFilter === "all" ? "active" : ""} onClick={() => setWarningFilter("all")}>すべて {detail.slots.length}枠</button>
              <button type="button" className={warningFilter === "warnings" ? "active" : ""} onClick={() => setWarningFilter("warnings")}>警告あり {assignmentIssues.length}件</button>
            </div>
            <span>未充足 {warningSummary.shortage}・過剰配置 {warningSummary.excess}・時間重複 {warningSummary.overlap}</span>
          </div>
          {assignmentIssues.length > 0 && (
            <div className="assignment-warnings" role="alert">
              <strong>
                割り当てを確認してください（{assignmentIssues.length}件）
              </strong>
              <ul>
                {renderedWarnings.map((warning) => (
                  <li key={warning.id}>{warning.message}</li>
                ))}
              </ul>
              {assignmentIssues.length > 5 && (
                <button
                  type="button"
                  className="warning-toggle"
                  onClick={() => setShowAllWarnings((current) => !current)}
                >
                  {showAllWarnings
                    ? "一部を隠す"
                    : `すべて表示（残り${assignmentIssues.length - 5}件）`}
                </button>
              )}
            </div>
          )}
          {warningFilter === "warnings" && visibleSlots.length === 0 ? (
            <p className="assignment-warning-empty">割り当て警告はありません。</p>
          ) : <>
          {viewMode === "preview" && (
            <div className="assignment-preview-wrap">
              <table className="assignment-preview-table">
                <thead><tr><th>日付</th>{timeColumns.map((time) => <th key={`${time.startTime}|${time.endTime}`}>{displayShiftTime(time.startTime)}<small>{displayShiftTime(time.endTime)}</small></th>)}</tr></thead>
                <tbody>{dates.map((date) => <tr key={date}><th>{date}</th>{timeColumns.map((time) => <td key={`${date}|${time.startTime}|${time.endTime}`}>{visibleSlots.filter((slot) => slot.date === date && slot.startTime === time.startTime && slot.endTime === time.endTime).map((slot) => {
                  const names = [...new Set(assignments[slot.id] ?? [])].map((email) => detail.members.find((member) => member.userEmail === email)?.displayName || email.split("@")[0]);
                  const assignedCount = names.length;
                  const hasOverlap = assignmentIssues.some((issue) => issue.kind === "overlap" && issue.slotIds.includes(slot.id));
                  return <div className={`assignment-preview-slot ${assignedCount < slot.requiredCount ? "is-shortage" : ""} ${assignedCount > slot.requiredCount ? "is-excess" : ""} ${hasOverlap ? "has-overlap" : ""}`} key={slot.id}><div><strong>{slot.role || "共通"}</strong><span>{assignedCount}/{slot.requiredCount}人</span></div><p>{names.length ? names.join("、") : "未割当"}</p></div>;
                })}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
          {viewMode === "list" ? (
            <div className="assignment-table-wrap">
              <table className="assignment-table">
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>時間</th>
                    <th>担当</th>
                    <th>必要</th>
                    <th>メンバー</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSlots.map((slot) => {
                    const assignedCount = new Set(assignments[slot.id] ?? []).size;
                    const hasOverlap = assignmentIssues.some((issue) => issue.kind === "overlap" && issue.slotIds.includes(slot.id));
                    return <tr className={`${assignedCount < slot.requiredCount ? "assignment-row-shortage" : ""} ${assignedCount > slot.requiredCount ? "assignment-row-excess" : ""} ${hasOverlap ? "assignment-row-overlap" : ""}`} key={slot.id}>
                      <td>{slot.date}</td>
                      <td>
                        {displayShiftTime(slot.startTime)}〜
                        {displayShiftTime(slot.endTime)}
                      </td>
                      <td>{slot.role || "共通"}</td>
                      <td><span className={assignedCount < slot.requiredCount ? "assignment-count shortage" : assignedCount > slot.requiredCount ? "assignment-count excess" : "assignment-count"}>{assignedCount}/{slot.requiredCount}人</span></td>
                      <td className={`${assignedCount < slot.requiredCount ? "assignment-members-cell shortage" : "assignment-members-cell"} ${hasOverlap ? "overlap" : ""}`}>
                        <div className="assignment-members">
                          {detail.members.map((member) =>
                            renderMember(slot, member),
                          )}
                        </div>
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          ) : viewMode === "calendar" ? (
            <div className="assignment-calendar-wrap">
              <table className="assignment-calendar">
                <thead>
                  <tr>
                    <th>日付</th>
                    {timeColumns.map((time) => (
                      <th key={`${time.startTime}|${time.endTime}`}>
                        {displayShiftTime(time.startTime)}
                        <small>{displayShiftTime(time.endTime)}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dates.map((date) => (
                    <tr key={date}>
                      <th>{date}</th>
                      {timeColumns.map((time) => (
                        <td key={`${date}|${time.startTime}|${time.endTime}`}>
                          {visibleSlots
                            .filter(
                              (slot) =>
                                slot.date === date &&
                                slot.startTime === time.startTime &&
                                slot.endTime === time.endTime,
                            )
                            .map(renderSlot)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}</>}
          <div className="member-summary">
            <h3>勤務状況サマリ</h3>
            {memberSummary.map((row) => (
              <div
                className={`member-summary-row ${row.warnings ? "has-warning" : ""}`}
                key={row.member.userEmail}
              >
                <strong>
                  {row.member.displayName || row.member.userEmail.split("@")[0]}
                </strong>
                <span>{row.days}日</span>
                <span>{row.totalHours.toFixed(1)}時間</span>
                <span className={row.updatedAt ? "" : "not-registered"}>
                  希望更新：{formatSubmissionTime(row.updatedAt)}
                </span>
                {row.requestComment && (
                  <span className="member-request-comment">今回の希望: {row.requestComment}</span>
                )}
                {row.warnings && <em>基本設定の範囲外</em>}
              </div>
            ))}
          </div>
          <div className="shift-actions">
            <button
              className="ghost-button"
              onClick={() => void save("draft")}
              disabled={busy}
            >
              保存
            </button>
            <button
              className="primary-button"
              onClick={() => void save("published")}
              disabled={busy}
            >
              チェックして公開
            </button>
          </div>
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
