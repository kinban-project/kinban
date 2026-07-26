"use client";

import { useEffect, useState } from "react";
import { localApiFetch } from "../local-api";

type KeyInfo = { id: string; name: string; tokenPrefix: string };

export default function ApiKeyPanel() {
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function load() { const response = await localApiFetch("/api/api-key"); if (response.ok) setKeys((await response.json() as { keys: KeyInfo[] }).keys); }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  async function createKey() { setBusy(true); setMessage(null); setNewKey(null); const response = await localApiFetch("/api/api-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); if (response.ok) { const data = await response.json() as { key: string }; setNewKey(data.key); await load(); } else setMessage("個人用AIキーを発行できませんでした。"); setBusy(false); }
  async function revokeKey(id: string) { if (!window.confirm("この個人用AIキーを無効にしますか？")) return; await localApiFetch("/api/api-key", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); await load(); setMessage("個人用AIキーを無効にしました。"); }
  return <div className="api-key-box"><div className="api-key-actions"><div><p className="eyebrow">PERSONAL AI ACCESS</p><h3>個人用AIキー</h3><p>基本設定・シフト希望・勤務申告など、あなた自身の操作だけに使えます。運営支援AIキーとは別のキーです。</p><p>発行したキーは画面には再表示されません。安全な場所に保存してください。</p></div><button className="primary-button" onClick={() => void createKey()} disabled={busy}>{busy ? "発行中…" : "個人用AIキーを発行"}</button></div>{newKey && <div className="new-key" role="alert"><strong>今だけ表示されます</strong><code>{newKey}</code><button onClick={() => void navigator.clipboard?.writeText(newKey)}>コピー</button></div>}{message && <p className="api-message">{message}</p>}{keys.length > 0 && <div className="key-list">{keys.map((key) => <div className="key-row" key={key.id}><span><strong>{key.name}</strong><small>{key.tokenPrefix}…</small></span><button onClick={() => void revokeKey(key.id)}>無効化</button></div>)}</div>}</div>;
}
