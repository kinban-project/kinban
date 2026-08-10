"use client";

import { useState } from "react";
import { localApiFetch } from "./local-api";

type Handoff = {
  token: string;
  runtimeUrl?: string;
  groupId: string;
  mode: string;
  expiresAt: string;
  memberName?: string;
};

export default function MemberAgentAssist({ groupId, groupName }: { groupId: string; groupName?: string }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function openAssist() {
    setBusy(true);
    setNotice(null);
    // Open synchronously from the click handler so popup blockers do not reject a later navigation.
    const popup = window.open("about:blank", "kinban-member-assist");
    if (!popup) {
      setBusy(false);
      setNotice("新しい画面を開けませんでした。ポップアップを許可してください。");
      return;
    }

    try {
      const response = await localApiFetch(`/api/groups/${groupId}/assistant/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "member", expiresInSeconds: 600 }),
      });
      const data = await response.json().catch(() => ({})) as Handoff & { error?: string };
      if (!response.ok || !data.token) throw new Error(data.error ?? "本人用AIアシストを開始できませんでした。");

      const runtimeUrl = data.runtimeUrl?.replace(/\/$/, "");
      if (!runtimeUrl) throw new Error("本人用AIアシストの接続先が設定されていません。");

      // AppRun may be scaled to zero. Wait for a healthy runtime before creating the handoff.
      let runtimeHealthy = false;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          const health = await fetch(`${runtimeUrl}/health`, { signal: AbortSignal.timeout(2500) });
          if (health.ok) {
            runtimeHealthy = true;
            break;
          }
        } catch {
          // Cold start or a transient network failure; retry below.
        }
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
      }
      if (!runtimeHealthy) throw new Error("AIアシストの起動に時間がかかっています。しばらくしてから再度お試しください。");

      const handoff = await fetch(`${runtimeUrl}/api/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: data.token,
          groupId: data.groupId,
          memberName: data.memberName ?? groupName ?? "メンバー",
          expiresAt: data.expiresAt,
          audience: "agent-runtime",
        }),
      });
      const handoffData = await handoff.json().catch(() => ({})) as { handoff?: string; error?: string };
      if (!handoff.ok || !handoffData.handoff) throw new Error(handoffData.error ?? "AIアシストへの接続に失敗しました。");

      // Pass only the opaque one-time code in the URL; the KINBAN token never leaves the handoff request.
      popup.location.href = `${runtimeUrl}/?handoff=${encodeURIComponent(handoffData.handoff)}`;
    } catch (error) {
      popup.close();
      setNotice(error instanceof Error ? error.message : "本人用AIアシストを開始できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return <div className="member-agent-assist">
    <button className="group-menu-button member-agent-button" type="button" disabled={busy} onClick={() => void openAssist()}>
      {busy ? "接続中…" : "本人用AIアシスト"}
    </button>
    {notice && <span className="member-agent-notice" role="status">{notice}</span>}
  </div>;
}
