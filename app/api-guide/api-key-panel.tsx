"use client";

import { useEffect, useState } from "react";
import { localApiFetch } from "../local-api";

type KeyInfo = { id: string; name: string; tokenPrefix: string; groupId: string | null };

export default function ApiKeyPanel({ groupId }: { groupId?: string }) {
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    if (!groupId) return;
    const response = await localApiFetch(`/api/api-key?groupId=${encodeURIComponent(groupId)}`);
    if (response.ok) setKeys(((await response.json()) as { keys: KeyInfo[] }).keys);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [groupId]);

  async function createKey() {
    if (!groupId) return;
    setBusy(true);
    setMessage(null);
    setNewKey(null);
    const response = await localApiFetch("/api/api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId }),
    });
    if (response.ok) {
      const data = (await response.json()) as { key: string };
      setNewKey(data.key);
      await load();
    } else {
      setMessage("個人用AIキーを発行できませんでした。");
    }
    setBusy(false);
  }

  async function downloadPack() {
    if (!groupId) return;
    setBusy(true);
    setMessage(null);
    const response = await localApiFetch("/api/api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId, action: "downloadPack" }),
    });
    if (response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "kinban-personal-assistant.zip";
      anchor.click();
      URL.revokeObjectURL(url);
      await load();
      setMessage("個人用AI接続パックをダウンロードしました。キーは秘密情報として扱ってください。");
    } else {
      setMessage("個人用AI接続パックを作成できませんでした。");
    }
    setBusy(false);
  }

  async function revokeKey(id: string) {
    if (!groupId || !window.confirm("このグループの個人用AIキーを無効にしますか？")) return;
    await localApiFetch("/api/api-key", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, groupId }),
    });
    await load();
    setMessage("個人用AIキーを無効にしました。");
  }

  if (!groupId) {
    return (
      <div className="api-key-box">
        <p className="eyebrow">PERSONAL AI ACCESS</p>
        <h3>個人用AIキー</h3>
        <p>個人用AIキーは、対象グループの基本設定からグループごとに発行します。</p>
      </div>
    );
  }

  return (
    <div className="api-key-box">
      <div className="api-key-actions">
        <div>
          <p className="eyebrow">GROUP PERSONAL AI ACCESS</p>
          <h3>このグループの個人用AIキー</h3>
          <p>自分の基本設定・シフト希望・シフト一覧・勤務申告などをAIから扱えます。</p>
          <p>管理者向けのシフト作成・公開・承認などは実行できません。</p>
        </div>
        <div className="api-key-buttons">
          <button className="primary-button" onClick={() => void createKey()} disabled={busy}>
            {busy ? "処理中…" : "個人用AIキーを発行"}
          </button>
          <button className="secondary-button" onClick={() => void downloadPack()} disabled={busy}>
            接続パックをダウンロード
          </button>
        </div>
      </div>
      {newKey && (
        <div className="new-key" role="alert">
          <strong>このキーは一度だけ表示されます。</strong>
          <code>{newKey}</code>
          <button onClick={() => void navigator.clipboard?.writeText(newKey)}>コピー</button>
        </div>
      )}
      {message && <p className="api-message">{message}</p>}
      {keys.length > 0 && (
        <div className="key-list">
          {keys.map((key) => (
            <div className="key-row" key={key.id}>
              <span><strong>{key.name}</strong><small>{key.tokenPrefix}…</small></span>
              <button onClick={() => void revokeKey(key.id)}>無効化</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
