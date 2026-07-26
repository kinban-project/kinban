"use client";

import { useEffect, useState } from "react";
import { localApiFetch } from "./local-api";
import ApiKeyPanel from "./api-guide/api-key-panel";

export default function ProfilePanel({ email }: { email: string }) {
  const [nickname, setNickname] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void localApiFetch("/api/profile").then(async (response) => {
        if (response.ok) setNickname((await response.json() as { nickname?: string }).nickname ?? "");
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setNotice(null);
    const response = await localApiFetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname }) });
    const data = await response.json() as { error?: string };
    setNotice(response.ok ? "アカウントのニックネームを保存しました" : (data.error ?? "保存できませんでした"));
    setSaving(false);
  }

  return <div className="profile-panel"><form onSubmit={save}><label>アカウントのニックネーム<input value={nickname} maxLength={40} onChange={(event) => setNickname(event.target.value)} placeholder="例：あきら" /><small>グループ別の表示名を設定していない場合に使われます。</small></label><div className="account-chip">アカウント：{email}</div><button className="primary-button" type="submit" disabled={saving}>{saving ? "保存中…" : "ニックネームを保存"}</button></form>{notice && <p className="group-notice" role="status">{notice}</p>}<ApiKeyPanel /><a className="signout" href="/signout-with-chatgpt?return_to=/">ログアウト</a><a className="guide-link" href="/api-guide">APIガイドを見る →</a></div>;
}
