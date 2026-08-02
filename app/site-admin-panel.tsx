"use client";

import { useEffect, useState } from "react";
import { localApiFetch } from "./local-api";
import { isDemoModeClient } from "./client-demo-mode";

type SiteUser = { id: string; userEmail: string; displayName: string; status: "invited" | "active" | "suspended"; isSiteAdmin: boolean; canCreateGroups: boolean };
type Invitation = { id: string; email: string; invitedBy: string; status: "pending" | "accepted" | "revoked" | "expired"; expiresAt: string; acceptedAt?: string | null; createdAt: string };
type Delivery = "manual" | "resend";

const statusLabels: Record<SiteUser["status"], string> = { invited: "招待中", active: "有効", suspended: "停止" };
const invitationLabels: Record<Invitation["status"], string> = { pending: "招待中", accepted: "承認済み", revoked: "取消済み", expired: "期限切れ" };

export default function SiteAdminPanel() {
  const [users, setUsers] = useState<SiteUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [delivery, setDelivery] = useState<Delivery>("manual");
  const [lastUrl, setLastUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  async function load() {
    const response = await localApiFetch("/api/site/users");
    if (!response.ok) return;
    const data = await response.json() as { users: SiteUser[]; invitations: Invitation[] };
    setUsers(data.users); setInvitations(data.invitations);
  }
  useEffect(() => { void load(); }, []);

  async function createInvite(targetEmail = email) {
    setBusy(true); setNotice(null); setLastUrl("");
    try {
      const response = await localApiFetch("/api/site/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: targetEmail, delivery }) });
      const data = await response.json().catch(() => ({})) as { error?: string; invitationUrl?: string; emailSent?: boolean };
      if (!response.ok) { setNotice(data.error ?? "招待を作成できませんでした"); return; }
      setNotice(data.emailSent ? "招待メールを送信しました" : "招待URLを発行しました。コピーして本人へ送ってください");
      setLastUrl(data.invitationUrl ?? "");
      if (targetEmail === email) setEmail("");
      await load();
    } finally { setBusy(false); }
  }

  async function copyUrl() {
    if (!lastUrl) return;
    await navigator.clipboard.writeText(lastUrl);
    setNotice("招待URLをコピーしました");
  }

  async function revoke(invitation: Invitation) {
    if (!window.confirm(`${invitation.email}への招待を取り消しますか？`)) return;
    const response = await localApiFetch("/api/site/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invitationId: invitation.id }) });
    setNotice(response.ok ? "招待を取り消しました" : "招待を取り消せませんでした");
    if (response.ok) await load();
  }

  async function update(user: SiteUser, patch: Partial<Pick<SiteUser, "status" | "isSiteAdmin" | "canCreateGroups">>) {
    const response = await localApiFetch("/api/site/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.userEmail, ...patch }) });
    const data = await response.json().catch(() => ({})) as { error?: string };
    setNotice(response.ok ? "権限を更新しました" : (data.error ?? "権限を更新できませんでした"));
    if (response.ok) await load();
  }

  async function resetDemoData() {
    if (!window.confirm("公開デモの登録データを初期シードへ戻します。登録した勤怠、メッセージ、割当、業務メモなどは削除されます。続けますか？")) return;
    const confirmation = window.prompt("実行する場合は『デモデータを初期化』と入力してください");
    if (confirmation !== "デモデータを初期化") return;
    setResetBusy(true); setNotice(null);
    try {
      const response = await localApiFetch("/api/demo/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation }) });
      const data = await response.json().catch(() => ({})) as { error?: string };
      setNotice(response.ok ? "デモデータを初期シードへ戻しました。画面を再読み込みしてください。" : (data.error ?? "デモデータを初期化できませんでした"));
      if (response.ok) await load();
    } finally { setResetBusy(false); }
  }

  return <section className="site-admin-panel">
    <div className="modal-head"><div><p className="eyebrow">SITE ADMIN</p><h2>サイト利用者管理</h2><p>利用者、招待URL、サイト管理者、グループ作成権限を管理します。</p></div></div>
    <form className="group-invitation-form" onSubmit={(event) => { event.preventDefault(); void createInvite(); }}>
      <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="招待するメールアドレス" />
      <select value={delivery} onChange={(event) => setDelivery(event.target.value as Delivery)} aria-label="招待方法"><option value="manual">招待URLを発行</option><option value="resend">Resendでメール送信</option></select>
      <button className="primary-button" type="submit" disabled={busy}>{busy ? "処理中…" : "招待を作成"}</button>
    </form>
    {lastUrl && <div className="site-invite-url"><input readOnly value={lastUrl} aria-label="招待URL" /><button className="small-action" type="button" onClick={() => void copyUrl()}>コピー</button></div>}
    {notice && <p className="group-notice" role="status">{notice}</p>}

    <h3 className="site-admin-subheading">招待履歴</h3>
    <div className="site-invitation-list">{invitations.length === 0 ? <p className="settings-copy">招待履歴はありません。</p> : invitations.slice().reverse().map((invitation) => <article className="site-invitation-row" key={invitation.id}>
      <div><strong>{invitation.email}</strong><small>{invitationLabels[invitation.status]} ・ 有効期限 {invitation.expiresAt.slice(0, 10)}</small></div>
      {invitation.status === "pending" && <><button className="small-action" type="button" onClick={() => void createInvite(invitation.email)}>再発行</button><button className="small-action danger" type="button" onClick={() => void revoke(invitation)}>取消</button></>}
    </article>)}</div>

    {isDemoModeClient() && <div className="site-demo-reset-panel">
      <div><strong>デモ用データの初期化</strong><small>公開デモの登録データを初期シードへ戻します。サイト管理者だけが実行できます。</small></div>
      <button className="small-action danger" type="button" disabled={resetBusy} onClick={() => void resetDemoData()}>{resetBusy ? "初期化中…" : "デモデータを初期化"}</button>
    </div>}
    <h3 className="site-admin-subheading">サイト利用者</h3>
    <div className="site-user-list">{users.map((user) => <article className="site-user-row" key={user.id}>
      <div><strong>{user.displayName || user.userEmail}</strong><small>{user.userEmail}</small></div>
      <select value={user.status} onChange={(event) => void update(user, { status: event.target.value as SiteUser["status"] })} aria-label={`${user.userEmail}の状態`}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <label><input type="checkbox" checked={user.isSiteAdmin} onChange={(event) => void update(user, { isSiteAdmin: event.target.checked })} />サイト管理者</label>
      <label><input type="checkbox" checked={user.canCreateGroups} onChange={(event) => void update(user, { canCreateGroups: event.target.checked })} />グループ作成</label>
    </article>)}</div>
  </section>;
}
