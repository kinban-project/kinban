"use client";

import { useEffect, useMemo, useState } from "react";
import { localApiFetch } from "./local-api";

type Group = { id: string; name: string; membership: { role: string } };
type Plan = { id: string; groupId: string; name: string; startDate: string; endDate: string; status: "draft" | "published" };
type Slot = { id: string; date: string; startTime: string; endTime: string; requiredCount: number; role: string };
type Member = { userEmail: string; displayName?: string | null };
type Detail = { plan: Plan; slots: Slot[]; assignments: Array<{ slotId: string; userEmail: string }>; members: Member[] };
type Preference = { minDays: number; maxDays: number; minHours: number; maxHours: number };

function hours(start: string, end: string) { const [sh, sm] = start.split(":").map(Number); const [eh, em] = end.split(":").map(Number); return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60); }

export default function ShiftAdjustment({ initialGroupId }: { initialGroupId?: string }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [groupId, setGroupId] = useState(initialGroupId ?? "");
  const [planId, setPlanId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [preferences, setPreferences] = useState<Record<string, Preference>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function loadGroups() { const response = await localApiFetch("/api/groups"); if (!response.ok) return; const data = await response.json() as { groups: Group[] }; setGroups(data.groups); if (!groupId && data.groups[0]) setGroupId(data.groups[0].id); }
  async function loadPlans(id: string) { if (!id) return; const response = await localApiFetch(`/api/shifts?groupId=${encodeURIComponent(id)}`); if (!response.ok) return; const next = (await response.json() as { plans: Plan[] }).plans; setPlans(next); if (!planId && next[0]) setPlanId(next[0].id); }
  async function openPlan(id: string) { if (!id) return; const response = await localApiFetch(`/api/shifts/${id}`); if (response.ok) setDetail(await response.json() as Detail); }
  async function loadPreferences(id: string) { const response = await localApiFetch(`/api/groups/${id}/preferences`); if (!response.ok) return; const data = await response.json() as { preferences: Preference }; setPreferences((current) => ({ ...current, [id]: data.preferences })); }
  useEffect(() => { void loadGroups(); }, []);
  useEffect(() => { if (initialGroupId) setGroupId(initialGroupId); }, [initialGroupId]);
  useEffect(() => { void loadPlans(groupId); if (groupId) void loadPreferences(groupId); }, [groupId]);
  useEffect(() => { void openPlan(planId); }, [planId]);

  const assignments = useMemo(() => { const map: Record<string, string[]> = {}; for (const row of detail?.assignments ?? []) (map[row.slotId] ??= []).push(row.userEmail); return map; }, [detail]);
  const memberSummary = useMemo(() => { if (!detail) return []; return detail.members.map((member) => { const slots = detail.slots.filter((slot) => (assignments[slot.id] ?? []).includes(member.userEmail)); const days = new Set(slots.map((slot) => slot.date)).size; const totalHours = slots.reduce((sum, slot) => sum + hours(slot.startTime, slot.endTime), 0); const pref = preferences[detail.plan.groupId]; const warnings = pref && (days < pref.minDays || days > pref.maxDays || totalHours < pref.minHours || totalHours > pref.maxHours); return { member, days, totalHours, warnings }; }); }, [detail, assignments, preferences]);
  function toggle(slotId: string, userEmail: string) { if (!detail) return; const current = assignments[slotId] ?? []; const next = current.includes(userEmail) ? current.filter((email) => email !== userEmail) : [...current, userEmail]; const rows = detail.assignments.filter((row) => row.slotId !== slotId).concat(next.map((email) => ({ slotId, userEmail: email }))); setDetail({ ...detail, assignments: rows }); }
  async function save(status: "draft" | "published") { if (!detail) return; setBusy(true); const response = await localApiFetch(`/api/shifts/${detail.plan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignments, status }) }); const data = await response.json() as { error?: string; warnings?: string[] }; setNotice(response.ok ? (status === "published" ? "シフトを公開しました" : "割り当てを保存しました") : (data.error ?? "保存できませんでした")); setBusy(false); if (response.ok) await openPlan(detail.plan.id); }

  return <section className="shift-adjustment-card"><div className="shift-builder-head"><div><p className="eyebrow">SHIFT ADJUSTMENT</p><h2>シフト調整</h2><p>勤務希望を確認しながら担当者を割り当てます。</p></div></div><div className="shift-adjustment-toolbar"><select value={groupId} onChange={(event) => setGroupId(event.target.value)}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><select value={planId} onChange={(event) => setPlanId(event.target.value)}><option value="">勤務枠を選択</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} ／ {plan.startDate}〜{plan.endDate} ／ {plan.status === "published" ? "公開済み" : "下書き"}</option>)}</select></div>{detail && <><div className="assignment-summary"><strong>{detail.plan.name}</strong><span>{detail.slots.length}枠</span><span>緑：希望あり　灰：その他</span></div><div className="assignment-table-wrap"><table className="assignment-table"><thead><tr><th>日付</th><th>時間</th><th>担当</th><th>必要</th><th>メンバー</th></tr></thead><tbody>{detail.slots.map((slot) => <tr key={slot.id}><td>{slot.date}</td><td>{slot.startTime}〜{slot.endTime}</td><td>{slot.role || "共通"}</td><td>{slot.requiredCount}人</td><td><div className="assignment-members">{detail.members.map((member) => { const assigned = (assignments[slot.id] ?? []).includes(member.userEmail); return <label className={assigned ? "assigned" : ""} key={member.userEmail}><input type="checkbox" checked={assigned} onChange={() => toggle(slot.id, member.userEmail)} />{member.displayName || member.userEmail.split("@")[0]}</label>; })}</div></td></tr>)}</tbody></table></div><div className="member-summary"><h3>勤務状況サマリ</h3>{memberSummary.map((row) => <div className={`member-summary-row ${row.warnings ? "has-warning" : ""}`} key={row.member.userEmail}><strong>{row.member.displayName || row.member.userEmail.split("@")[0]}</strong><span>{row.days}日</span><span>{row.totalHours.toFixed(1)}時間</span>{row.warnings && <em>基本設定の範囲外</em>}</div>)}</div><div className="shift-actions"><button className="ghost-button" onClick={() => void save("draft")} disabled={busy}>下書きを保存</button><button className="primary-button" onClick={() => void save("published")} disabled={busy}>チェックして公開</button></div></>}{notice && <p className="group-notice" role="status">{notice}</p>}</section>;
}
