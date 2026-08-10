"use client";

import { useState } from "react";
import { localApiFetch } from "./local-api";

type Handoff = { token: string; runtimeUrl?: string; groupId: string; mode: string; expiresAt: string; memberName?: string };

export default function MemberAgentAssist({ groupId, groupName }: { groupId: string; groupName?: string }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function openAssist() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await localApiFetch(`/api/groups/${groupId}/assistant/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "member", expiresInSeconds: 600 }),
      });
      const data = await response.json().catch(() => ({})) as Handoff & { error?: string };
      if (!response.ok || !data.token) throw new Error(data.error ?? "本人用AIアシストを開始できませんでした。");
      const runtimeUrl = data.runtimeUrl?.replace(/\/$/, "");
      if (!runtimeUrl) throw new Error("本人用AIアシストはこの環境では設定されていません。");
      try {
        const health = await fetch(`${runtimeUrl}/health`, { signal: AbortSignal.timeout(2500) });
        if (!health.ok) throw new Error();
      } catch {
        throw new Error("本人用AIアシストを起動できません。エージェント基盤が起動しているか確認してください。");
      }
      const popup = window.open(runtimeUrl, "kinban-member-assist");
      if (!popup) throw new Error("新しい画面を開けませんでした。ポップアップを許可してください。");
      const targetOrigin = new URL(runtimeUrl).origin;
      let sent = false;
      let handoffToken = data.token;
      const finish = () => {
        if (sent) return;
        sent = true;
        handoffToken = "";
        window.clearInterval(timer);
        window.removeEventListener("message", onMessage);
        setBusy(false);
      };
      const send = () => {
        if (sent || popup.closed) return;
        popup.postMessage({ type: "kinban-agent-handoff", token: handoffToken, groupId: data.groupId, memberName: data.memberName ?? groupName ?? "メンバー", expiresAt: data.expiresAt, audience: "agent-runtime" }, targetOrigin);
      };
      const onMessage = (event: MessageEvent) => {
        if (event.source !== popup || event.origin !== targetOrigin) return;
        if (event.data?.type === "kinban-agent-ready") send();
        if (event.data?.type === "kinban-agent-session-ready") finish();
      };
      window.addEventListener("message", onMessage);
      const timer = window.setInterval(send, 300);
      window.setTimeout(() => {
        if (sent) return;
        window.clearInterval(timer);
        window.removeEventListener("message", onMessage);
        handoffToken = "";
        setBusy(false);
        setNotice("AIアシストへの接続に時間がかかっています。新しい画面を閉じずにお待ちください。");
      }, 10000);
    } catch (error) {
      setBusy(false);
      setNotice(error instanceof Error ? error.message : "本人用AIアシストを開始できませんでした。");
    }
  }

  return <div className="member-agent-assist">
    <button className="group-menu-button member-agent-button" type="button" disabled={busy} onClick={() => void openAssist()}>{busy ? "接続中…" : "AIアシスト"}</button>
    {notice && <span className="member-agent-notice" role="status">{notice}</span>}
  </div>;
}
