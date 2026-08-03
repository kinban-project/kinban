"use client";

import { useEffect, useState } from "react";
import { localApiFetch } from "./local-api";

type AssistantKey = { id: string; name: string; tokenPrefix: string; lastUsedAt?: string | null };
type BusinessSet = { packageVersion: string; releasedAt: string; summary: string };

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AssistantAccessPanel({ groupId }: { groupId: string }) {
  const [keys, setKeys] = useState<AssistantKey[]>([]);
  const [businessSet, setBusinessSet] = useState<BusinessSet | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    const response = await localApiFetch(`/api/groups/${groupId}/assistant/access`);
    if (!response.ok) return;
    const result = await response.json() as { keys: AssistantKey[]; businessSet?: BusinessSet };
    setKeys(result.keys);
    setBusinessSet(result.businessSet ?? null);
  }

  useEffect(() => { void load(); }, [groupId]);

  async function issue() {
    setBusy(true); setNewKey(null); setNotice("");
    const response = await localApiFetch(`/api/groups/${groupId}/assistant/access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const result = await response.json().catch(() => ({})) as { key?: string; error?: string };
    if (response.ok && result.key) {
      setNewKey(result.key);
      setNotice("キーを発行しました。この画面を離れると再表示できません。");
      await load();
    } else setNotice(result.error ?? "運営支援AIキーを発行できませんでした。");
    setBusy(false);
  }

  async function downloadConnectionPack() {
    setBusy(true); setNotice("");
    const response = await localApiFetch(`/api/groups/${groupId}/assistant/access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "downloadPack" }) });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      setNotice(result.error ?? "接続パックを作成できませんでした。");
      setBusy(false);
      return;
    }
    downloadBlob(await response.blob(), "kinban-operations-assistant.zip");
    setNotice("接続パックをダウンロードしました。キーは秘密情報として扱ってください。");
    await load();
    setBusy(false);
  }

  async function downloadBusinessSet() {
    setBusy(true); setNotice("");
    const response = await localApiFetch(`/api/groups/${groupId}/assistant/access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "downloadBusinessSet" }) });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      setNotice(result.error ?? "業務関連セットを作成できませんでした。");
      setBusy(false);
      return;
    }
    downloadBlob(await response.blob(), "kinban-operations-business-set.zip");
    setNotice(`業務関連セット ${businessSet?.packageVersion ?? ""} をダウンロードしました。`);
    setBusy(false);
  }

  async function revoke(id: string) {
    if (!window.confirm("この運営支援AIキーを無効化しますか？")) return;
    await localApiFetch(`/api/groups/${groupId}/assistant/access`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await load(); setNotice("キーを無効化しました。");
  }

  return <div className="assistant-access-panel">
    <p>管理者からの指示と、確認済みのメンバーからの問い合わせを運営支援AIへ連携できます。</p>
    <div className="assistant-access-head"><strong>運営支援AIキー</strong><div>
      <button className="small-action" type="button" onClick={() => void issue()} disabled={busy}>{busy ? "発行中…" : "キーを発行"}</button>
      <button className="small-action" type="button" onClick={() => void downloadConnectionPack()} disabled={busy}>接続パック</button>
    </div></div>
    <p>接続パックには、このグループ専用のMCP URL・キー・権限一覧・初期設定READMEだけが含まれます。業務手順は別の業務関連セットで管理します。</p>
    <div className="assistant-business-set">
      <div><strong>運営支援AI 業務関連セット</strong><small>{businessSet ? `現在版 ${businessSet.packageVersion}（${businessSet.releasedAt}）` : "最新版を確認中…"}</small></div>
      <button className="small-action" type="button" onClick={() => void downloadBusinessSet()} disabled={busy}>業務関連セットをダウンロード</button>
    </div>
    <p className="muted">キーを含まない共通セットです。更新時は再ダウンロードして差し替え、新しいAIタスクで利用してください。</p>
    {newKey && <div className="assistant-new-key" role="alert"><code>{newKey}</code><button type="button" onClick={() => void navigator.clipboard?.writeText(newKey)}>コピー</button></div>}
    {notice && <small>{notice}</small>}
    {keys.map((key) => <div className="assistant-key-row" key={key.id}><span>{key.name}（{key.tokenPrefix}…）</span><button className="small-action danger" type="button" onClick={() => void revoke(key.id)}>無効化</button></div>)}
  </div>;
}
