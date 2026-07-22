"use client";

import { useEffect, useState } from "react";
import { localApiFetch } from "./local-api";

type SiteUser = {
  id: string;
  userEmail: string;
  displayName: string;
  status: "invited" | "active" | "suspended";
  isSiteAdmin: boolean;
  canCreateGroups: boolean;
};

export default function SiteAdminPanel() {
  const [users, setUsers] = useState<SiteUser[]>([]);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const response = await localApiFetch("/api/site/users");
    if (response.ok) setUsers((await response.json() as { users: SiteUser[] }).users);
  }
  useEffect(() => { void load(); }, []);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    const response = await localApiFetch("/api/site/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const data = await response.json().catch(() => ({})) as { error?: string };
    setNotice(response.ok ? "招待を作成しました" : (data.error ?? "招待を作成できませんでした"));
    if (response.ok) { setEmail(""); await load(); }
  }

  async function update(user: SiteUser, patch: Partial<Pick<SiteUser, "status" | "isSiteAdmin" | "canCreateGroups">>) {
    const response = await localApiFetch("/api/site/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.userEmail, ...patch }) });
    const data = await response.json().catch(() => ({})) as { error?: string };
    setNotice(response.ok ? "権限を更新しました" : (data.error ?? "権限を更新できませんでした"));
    if (response.ok) await load();
  }

  return <section className="site-admin-panel">
    <div className="modal-head"><div><p className="eyebrow">SITE ADMIN</p><h2>サイト利用者管理</h2><p>招待、利用停止、サイト管理者、グループ作成権限を管理します。</p></div></div>
    <form className="group-invitation-form" onSubmit={invite}><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="招待するメールアドレス" /><button className="primary-button" type="submit">サイトへ招待</button></form>
    {notice && <p className="group-notice" role="status">{notice}</p>}
    <div className="site-user-list">{users.map((user) => <article className="site-user-row" key={user.id}>
      <div><strong>{user.displayName || user.userEmail}</strong><small>{user.userEmail}</small></div>
      <select value={user.status} onChange={(event) => void update(user, { status: event.target.value as SiteUser["status"] })} aria-label={`${user.userEmail}の状態`}><option value="invited">招待中</option><option value="active">有効</option><option value="suspended">停止</option></select>
      <label><input type="checkbox" checked={user.isSiteAdmin} onChange={(event) => void update(user, { isSiteAdmin: event.target.checked })} />サイト管理者</label>
      <label><input type="checkbox" checked={user.canCreateGroups} onChange={(event) => void update(user, { canCreateGroups: event.target.checked })} />グループ作成可</label>
    </article>)}</div>
  </section>;
}
