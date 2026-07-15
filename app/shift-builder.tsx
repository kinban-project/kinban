"use client";

import { useEffect, useMemo, useState } from "react";
import { localApiFetch } from "./local-api";

type Group = { id: string; name: string; membership: { role: string } };
type Plan = { id: string; groupId: string; name: string; startDate: string; endDate: string; openingTime: string; closingTime: string; slotMinutes: number; defaultRequiredCount: number; status: "draft" | "published" };
type Slot = { id: string; date: string; startTime: string; endTime: string; requiredCount: number; role: string };
type Member = { userEmail: string; displayName?: string | null; role: string };
type Detail = { plan: Plan; slots: Slot[]; assignments: Array<{ slotId: string; userEmail: string }>; members: Member[] };

const initial = { groupId: "", name: "7月後半シフト", startDate: "2026-07-16", endDate: "2026-07-31", openingTime: "09:00", closingTime: "18:00", slotMinutes: "60", requiredCount: "2", role: "" };

export default function ShiftBuilder() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const editableGroups = useMemo(() => groups.filter((group) => group.membership.role === "owner" || group.membership.role === "editor"), [groups]);
  async function loadGroups() { const response = await localApiFetch("/api/groups"); if (response.ok) { const data = await response.json() as { groups: Group[] }; setGroups(data.groups); if (!form.groupId && data.groups[0]) setForm((current) => ({ ...current, groupId: data.groups[0].id })); } }
  async function loadPlans(groupId: string) { if (!groupId) return; const response = await localApiFetch(`/api/shifts?groupId=${encodeURIComponent(groupId)}`); if (response.ok) setPlans((await response.json() as { plans: Plan[] }).plans); }
  async function openPlan(id: string) { const response = await localApiFetch(`/api/shifts/${id}`); if (response.ok) setDetail(await response.json() as Detail); }
  async function deletePlan(plan: Plan) {
    if (plan.status !== "draft" || !window.confirm(`「${plan.name}」の下書きを削除しますか？`)) return;
    setBusy(true); setNotice(null);
    const response = await localApiFetch(`/api/shifts/${plan.id}`, { method: "DELETE" });
    const data = await response.json() as { error?: string };
    setNotice(response.ok ? "下書きを削除しました" : (data.error ?? "下書きを削除できませんでした"));
    if (response.ok) await loadPlans(form.groupId);
    setBusy(false);
  }
  useEffect(() => { const timer = window.setTimeout(() => void loadGroups(), 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { const timer = form.groupId ? window.setTimeout(() => void loadPlans(form.groupId), 0) : undefined; return () => { if (timer) window.clearTimeout(timer); }; }, [form.groupId]);

  async function createPlan(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null);
    const response = await localApiFetch("/api/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, slotMinutes: Number(form.slotMinutes), requiredCount: Number(form.requiredCount) }) });
    const raw = await response.text();
    let data: { error?: string; plan?: Plan; slotCount?: number } = {};
    try { data = JSON.parse(raw) as { error?: string; plan?: Plan; slotCount?: number }; } catch { setNotice(`シフト計画の作成に失敗しました（HTTP ${response.status}）`); setBusy(false); return; }
    if (!response.ok || !data.plan) setNotice(data.error ?? "シフト計画を作成できませんでした");
    else { setNotice(`${data.slotCount}個の勤務枠を作成しました`); await loadPlans(form.groupId); await openPlan(data.plan.id); }
    setBusy(false);
  }

  function assignmentMap() { const map: Record<string, string[]> = {}; for (const assignment of detail?.assignments ?? []) (map[assignment.slotId] ??= []).push(assignment.userEmail); return map; }
  function toggle(slotId: string, userEmail: string) { if (!detail) return; const map = assignmentMap(); const current = map[slotId] ?? []; const next = current.includes(userEmail) ? current.filter((email) => email !== userEmail) : [...current, userEmail]; const assignments = detail.assignments.filter((assignment) => assignment.slotId !== slotId).concat(next.map((email) => ({ slotId, userEmail: email }))); setDetail({ ...detail, assignments }); }
  async function save(status: "draft" | "published") { if (!detail) return; setBusy(true); const map = assignmentMap(); const response = await localApiFetch(`/api/shifts/${detail.plan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignments: map, status }) }); const data = await response.json() as { error?: string; warnings?: string[]; status?: string }; setWarnings(data.warnings ?? []); setNotice(response.ok ? (status === "published" ? "シフトを公開しました" : "下書きを保存しました") : (data.error ?? "保存できませんでした")); if (response.ok) await openPlan(detail.plan.id); setBusy(false); }

  return <section className="shift-builder-card"><div className="shift-builder-head"><div><p className="eyebrow">SHIFT PLANNER</p><h2>シフト作成</h2><p>条件から勤務枠を作り、表でメンバーを割り当てます。</p></div>{detail && <button className="ghost-button" onClick={() => setDetail(null)}>新しい計画</button>}</div>
    {!detail ? <><form className="shift-condition-form" onSubmit={createPlan}><label>グループ<select required value={form.groupId} onChange={(event) => setForm({ ...form, groupId: event.target.value })}><option value="">選択してください</option>{editableGroups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label><label>計画名<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><div className="form-row"><label>開始日<input type="date" required value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label><label>終了日<input type="date" required value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label></div><div className="form-row"><label>開店／開始<input type="time" value={form.openingTime} onChange={(event) => setForm({ ...form, openingTime: event.target.value })} /></label><label>閉店／終了<input type="time" value={form.closingTime} onChange={(event) => setForm({ ...form, closingTime: event.target.value })} /></label></div><div className="form-row"><label>区切り時間<select value={form.slotMinutes} onChange={(event) => setForm({ ...form, slotMinutes: event.target.value })}><option value="15">15分</option><option value="30">30分</option><option value="60">1時間</option><option value="120">2時間</option></select></label><label>必要人数<input type="number" min="1" max="20" value={form.requiredCount} onChange={(event) => setForm({ ...form, requiredCount: event.target.value })} /></label></div><label>担当・ポジション（任意）<input value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} placeholder="例：レジ" /></label><button className="primary-button" disabled={busy || editableGroups.length === 0}>{busy ? "作成中…" : "勤務枠を作成"}</button></form><div className="existing-plans"><h3>既存のシフト計画</h3>{plans.length ? plans.map((plan) => <div key={plan.id} className="plan-row" role="button" tabIndex={0} onClick={() => void openPlan(plan.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") void openPlan(plan.id); }}><span><strong>{plan.name}</strong><small>{plan.startDate}〜{plan.endDate} ・ {plan.openingTime}〜{plan.closingTime}</small></span><span className="plan-open"><em className={plan.status}>{plan.status === "published" ? "公開済み" : "下書き"}</em>{plan.status === "draft" ? <button type="button" className="plan-delete" onClick={(event) => { event.stopPropagation(); void deletePlan(plan); }}>削除</button> : <b>割り当てを編集 →</b>}</span></div>) : <p>まだシフト計画はありません。</p>}</div></> : <><div className="shift-summary"><div><strong>{detail.plan.name}</strong><span>{detail.plan.startDate}〜{detail.plan.endDate} ／ {detail.plan.openingTime}〜{detail.plan.closingTime}</span></div><span className={detail.plan.status}>{detail.plan.status === "published" ? "公開済み" : "下書き"}</span></div><div className="shift-table-wrap"><table className="shift-table"><thead><tr><th>日付</th><th>時間</th><th>必要</th><th>担当メンバー（クリックで追加／解除）</th></tr></thead><tbody>{detail.slots.map((slot) => { const assigned = assignmentMap()[slot.id] ?? []; return <tr key={slot.id}><td>{slot.date}</td><td>{slot.startTime}〜{slot.endTime}</td><td><strong>{slot.requiredCount}</strong>人</td><td><div className="member-checks">{detail.members.map((member) => <label key={member.userEmail} className={assigned.includes(member.userEmail) ? "assigned" : ""}><input type="checkbox" checked={assigned.includes(member.userEmail)} onChange={() => toggle(slot.id, member.userEmail)} />{member.displayName?.trim() || member.userEmail.split("@")[0]}</label>)}</div></td></tr>; })}</tbody></table></div><div className="shift-actions"><button className="ghost-button" onClick={() => void save("draft")} disabled={busy}>下書きを保存</button><button className="primary-button" onClick={() => void save("published")} disabled={busy}>チェックして公開</button></div>{warnings.length > 0 && <div className="shift-warnings"><strong>確認事項 {warnings.length}件</strong>{warnings.slice(0, 12).map((warning) => <p key={warning}>⚠ {warning}</p>)}{warnings.length > 12 && <small>ほか {warnings.length - 12}件</small>}</div>}<p className="shift-help">不足人数があっても公開できます。公開後はグループカレンダーに反映されます。</p></>}
    {notice && <p className="group-notice" role="status">{notice}</p>}
  </section>;
}
