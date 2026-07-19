"use client";

import { useEffect, useState } from "react";
import { localApiFetch } from "./local-api";

type PushState = { configured: boolean; publicKey: string | null; subscriptions: Array<{ id: string; active: boolean }>; currentSubscriptionActive: boolean; deliveries: Array<{ status: string; createdAt: string }> };

function decodePublicKey(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export default function PushNotificationControl() {
  const [state, setState] = useState<PushState | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const isIos = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

  async function load() {
    const registration = supported
      ? await navigator.serviceWorker.getRegistration()
      : undefined;
    const subscription = await registration?.pushManager.getSubscription();
    const endpoint = subscription?.endpoint ?? "";
    const response = await localApiFetch(`/api/push${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ""}`);
    if (response.ok) setState(await response.json() as PushState);
  }

  useEffect(() => { void load(); }, []);

  async function enable() {
    if (!supported || !state?.publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setNotice("ブラウザの通知許可が必要です。"); return; }
      const registration = await navigator.serviceWorker.register("/kinban-sw.js");
      const current = await registration.pushManager.getSubscription();
      const subscription = current ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodePublicKey(state.publicKey) });
      const response = await localApiFetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "subscribe", subscription: subscription.toJSON() }) });
      const data = await response.json().catch(() => ({})) as { error?: string };
      setNotice(response.ok ? "この端末で通知を有効にしました。" : data.error ?? "通知の登録に失敗しました。");
      await load();
    } catch {
      setNotice("通知を有効にできませんでした。ブラウザ設定とホーム画面アプリの状態を確認してください。");
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await localApiFetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unsubscribe", endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setNotice("この端末の通知を解除しました。");
      await load();
    } finally { setBusy(false); }
  }

  async function test() {
    setBusy(true);
    const response = await localApiFetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test" }) });
    const data = await response.json().catch(() => ({})) as { error?: string; result?: { sent?: number; failed?: number } };
    setNotice(response.ok ? `テスト通知を送信しました（成功 ${data.result?.sent ?? 0}件、失敗 ${data.result?.failed ?? 0}件）。` : data.error ?? "テスト通知を送信できませんでした。");
    setBusy(false);
  }

  const enabled = Boolean(state?.currentSubscriptionActive);
  return <section className="push-notification-control">
    <div><strong>通知</strong><p>この端末で、緊急連絡や確認が必要な更新を受け取ります。</p></div>
    {!supported ? <p className="push-notification-note">このブラウザはWeb Pushに対応していません。</p> : !state?.configured ? <p className="push-notification-note">通知サーバーはまだ設定されていません。</p> : <div className="push-notification-actions">
      <span className={`push-notification-state ${enabled ? "enabled" : "disabled"}`}>{enabled ? "この端末で有効" : "この端末では無効"}</span>
      {enabled ? <><button className="small-action" type="button" disabled={busy} onClick={() => void test()}>テスト通知</button><button className="small-action danger" type="button" disabled={busy} onClick={() => void disable()}>通知を解除</button></> : <button className="small-action" type="button" disabled={busy} onClick={() => void enable()}>通知を有効にする</button>}
    </div>}
    {isIos && <p className="push-notification-note">iPhoneでは、Safariの共有メニューからKINBANをホーム画面に追加した後、この操作を行ってください。</p>}
    {notice && <small className="push-notification-note">{notice}</small>}
  </section>;
}
