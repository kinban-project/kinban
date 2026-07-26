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

  async function downloadPack() {
    setBusy(true); setNotice("");
    const response = await fetch(`/api/groups/${groupId}/assistant/access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "downloadPack" }) });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      setNotice(result.error ?? "接続パックを作成できませんでした。");
      setBusy(false);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "kinban-operations-assistant.zip";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("接続パックをダウンロードしました。キーは秘密情報として扱ってください。");
    await load();
    setBusy(false);
  }

  async function revoke(id: string) {
    if (!window.confirm("この運営支援AIキーを無効化しますか？")) return;
    await fetch(`/api/groups/${groupId}/assistant/access`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await load(); setNotice("キーを無効化しました。");
  }

  return <div className="assistant-access-panel">
    <p>管理者からの直接指示や、確認済みのメンバー問い合わせを運営支援AIへ連携できます。</p>
    <div className="assistant-access-head"><strong>運営支援AIキー</strong><div><button className="small-action" type="button" onClick={() => void issue()} disabled={busy}>{busy ? "発行中…" : "キーを発行"}</button><button className="small-action" type="button" onClick={() => void downloadPack()} disabled={busy}>接続パックをダウンロード</button></div></div>
    <p>接続パックには、このグループ専用のMCP URL・キー・権限一覧・README・運営支援AI向け手順が含まれます。キーを共有したAIは、このグループの運営操作を実行できます。</p>
    {newKey && <div className="assistant-new-key" role="alert"><code>{newKey}</code><button type="button" onClick={() => void navigator.clipboard?.writeText(newKey)}>コピー</button></div>}
    {notice && <small>{notice}</small>}
    {keys.map((key) => <div className="assistant-key-row" key={key.id}><span>{key.name}（{key.tokenPrefix}…）</span><button className="small-action danger" type="button" onClick={() => void revoke(key.id)}>無効化</button></div>)}
  </div>;
}
