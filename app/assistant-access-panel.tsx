"use client";

import { useEffect, useState } from "react";

type AssistantKey = { id: string; name: string; tokenPrefix: string; lastUsedAt?: string | null };

export default function AssistantAccessPanel({ groupId }: { groupId: string }) {
  const [keys, setKeys] = useState<AssistantKey[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    const response = await fetch(`/api/groups/${groupId}/assistant/access`);
    if (response.ok) setKeys((await response.json() as { keys: AssistantKey[] }).keys);
  }
  useEffect(() => { void load(); }, [groupId]);

  async function issue() {
    setBusy(true); setNewKey(null); setNotice("");
    const response = await fetch(`/api/groups/${groupId}/assistant/access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const result = await response.json().catch(() => ({})) as { key?: string; error?: string };
    if (response.ok && result.key) { setNewKey(result.key); setNotice("キーを発行しました。この画面を離れると再表示できません。"); await load(); }
    else setNotice(result.error ?? "運営支援AIキーを発行できませんでした。");
    setBusy(false);
  }

  async function revoke(id: string) {
    if (!window.confirm("この運営支援AIキーを無効にしますか？")) return;
    await fetch(`/api/groups/${groupId}/assistant/access`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await load(); setNotice("キーを無効にしました。");
  }

  return <div className="assistant-access-panel">
    <div className="assistant-access-head"><strong>運営支援AIキー</strong><button className="small-action" type="button" onClick={() => void issue()} disabled={busy}>{busy ? "発行中…" : "キーを発行"}</button></div>
    <p>このキーはこのグループ専用です。運営情報を参照でき、変更操作は管理者メッセージと上の実行許可がそろう場合だけ実行されます。</p>
    {newKey && <div className="assistant-new-key" role="alert"><code>{newKey}</code><button type="button" onClick={() => void navigator.clipboard?.writeText(newKey)}>コピー</button></div>}
    {notice && <small>{notice}</small>}
    {keys.map((key) => <div className="assistant-key-row" key={key.id}><span>{key.name}（{key.tokenPrefix}…）</span><button className="small-action danger" type="button" onClick={() => void revoke(key.id)}>無効化</button></div>)}
  </div>;
}
