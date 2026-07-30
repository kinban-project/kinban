"use client";

import { useEffect, useState } from "react";
import { getLocalUserId, localApiFetch } from "./local-api";

type Subscription = { status: "unconfigured" | "active" | "revoked"; tokenPrefix?: string | null; createdAt?: string | null };

export default function CalendarSubscriptionPanel({ groupId }: { groupId: string }) {
  const [subscription, setSubscription] = useState<Subscription>({ status: "unconfigured" });
  const [feedUrl, setFeedUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const storageKey = `kinban-calendar-feed:${groupId}:${getLocalUserId()}`;

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) setFeedUrl(saved);
    void localApiFetch(`/api/groups/${groupId}/calendar-subscription`).then(async (response) => {
      if (response.ok) setSubscription(await response.json() as Subscription);
    });
  }, [groupId, storageKey]);

  async function act(action: "issue" | "reissue" | "revoke") {
    if (action === "reissue" && !window.confirm("現在の購読URLを無効にして、新しいURLを発行しますか？")) return;
    if (action === "revoke" && !window.confirm("カレンダー連携を停止しますか？現在の購読URLは使えなくなります。")) return;
    setBusy(true); setNotice("");
    const response = await localApiFetch(`/api/groups/${groupId}/calendar-subscription`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await response.json().catch(() => ({})) as { status?: Subscription["status"]; tokenPrefix?: string; feedUrl?: string; error?: string };
    if (response.ok) {
      setSubscription({ status: data.status ?? (action === "revoke" ? "revoked" : "active"), tokenPrefix: data.tokenPrefix });
      if (data.feedUrl) { setFeedUrl(data.feedUrl); window.localStorage.setItem(storageKey, data.feedUrl); }
      if (action === "revoke") { setFeedUrl(""); window.localStorage.removeItem(storageKey); }
      setNotice(action === "revoke" ? "カレンダー連携を停止しました。" : "購読URLを発行しました。URLは外部に公開しないでください。");
    } else setNotice(data.error ?? "カレンダー連携を更新できませんでした。");
    setBusy(false);
  }

  async function copy() {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setNotice("購読URLをコピーしました。");
  }

  return <section className="calendar-subscription-panel">
    <div className="section-title"><div><h4>カレンダー連携</h4><p>公開済みの自分のシフトだけを、GoogleカレンダーやiPhoneのカレンダーで購読できます。</p></div><span className={`subscription-status ${subscription.status}`}>{subscription.status === "active" ? "連携中" : subscription.status === "revoked" ? "停止中" : "未設定"}</span></div>
    {subscription.status === "active" && feedUrl ? <div className="subscription-url"><code>{feedUrl}</code><button type="button" className="secondary-button" onClick={() => void copy()}>URLをコピー</button></div> : subscription.status === "active" ? <p className="subscription-muted">この画面では購読URLを再表示しません。必要な場合は新しいURLを発行してください。</p> : null}
    <div className="subscription-actions"><button type="button" className="primary-button" onClick={() => void act(subscription.status === "active" ? "reissue" : "issue")} disabled={busy}>{subscription.status === "active" ? "購読URLを再発行" : "購読URLを発行"}</button>{subscription.status === "active" && <button type="button" className="danger-button" onClick={() => void act("revoke")} disabled={busy}>連携を停止</button>}</div>
    <details className="subscription-help"><summary>登録方法</summary><p><strong>Googleカレンダー</strong>の「他のカレンダー」から「URLで追加」を選び、購読URLを貼り付けます。この操作はGoogleカレンダーのPC版から行ってください。スマートフォンのGoogleカレンダーアプリからは登録できません。</p><p><strong>iPhone</strong>は「設定」→「カレンダー」→「アカウント」→「アカウントを追加」→「その他」→「照会するカレンダーを追加」から登録します。</p><p>カレンダー側の更新間隔やキャッシュにより、シフト変更がすぐ反映されない場合があります。</p></details>
    {notice && <p className="group-notice" role="status">{notice}</p>}
  </section>;
}
