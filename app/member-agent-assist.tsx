"use client";

import { useEffect, useState } from "react";
import { localApiFetch } from "./local-api";

type RuntimeConfig = { groupId: string; memberName?: string; runtimeUrl?: string };
type Handoff = RuntimeConfig & { token: string; expiresAt: string; error?: string };

function showStartupMessage(popup: Window) {
  popup.document.title = "KINBANアシストを起動しています";
  popup.document.body.innerHTML = `
    <main style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 18vh auto; padding: 2rem; color: #17302d; text-align: center">
      <div style="font-size: 2rem; margin-bottom: 1rem">KINBAN</div>
      <h1 style="font-size: 1.25rem">AIアシストを起動しています…</h1>
      <p>起動に最大1分ほどかかることがあります。この画面を閉じずにお待ちください。</p>
    </main>`;
}

export default function MemberAgentAssist({ groupId }: { groupId: string; groupName?: string }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [runtimeConfigured, setRuntimeConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    void localApiFetch(`/api/groups/${groupId}/assistant/context`)
      .then(async (response) => {
        const config = await response.json().catch(() => ({})) as RuntimeConfig;
        if (active) setRuntimeConfigured(response.ok && Boolean(config.runtimeUrl?.trim()));
      })
      .catch(() => {
        if (active) setRuntimeConfigured(false);
      });

    return () => {
      active = false;
    };
  }, [groupId]);

  async function openAssist() {
    setBusy(true);
    setNotice(null);
    const popup = window.open("about:blank", "kinban-member-assist");
    if (!popup) {
      setBusy(false);
      setNotice("新しい画面を開けませんでした。ポップアップを許可してください。");
      return;
    }
    showStartupMessage(popup);

    try {
      // Read only the runtime URL first. No short-lived KINBAN token is issued before health is confirmed.
      const configResponse = await localApiFetch(`/api/groups/${groupId}/assistant/context`);
      const config = await configResponse.json().catch(() => ({})) as RuntimeConfig & { error?: string };
      if (!configResponse.ok) throw new Error(config.error ?? "本人用AIアシストを開始できませんでした。");
      const runtimeUrl = config.runtimeUrl?.replace(/\/$/, "");
      if (!runtimeUrl) throw new Error("本人用AIアシストの接続先が設定されていません。");

      // AppRun may be scaled to zero. Use a fixed approximately-one-minute budget.
      let runtimeHealthy = false;
      for (let attempt = 0; attempt < 15; attempt += 1) {
        try {
          const health = await fetch(`${runtimeUrl}/health`, { signal: AbortSignal.timeout(2000) });
          if (health.ok) {
            runtimeHealthy = true;
            break;
          }
        } catch {
          // Cold start or transient network failure; retry until the one-minute budget expires.
        }
        if (attempt < 14) await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
      if (!runtimeHealthy) throw new Error("AIアシストの起動に時間がかかっています。しばらくしてから再度お試しください。");

      // Issue the short-lived token only after the runtime is healthy.
      const response = await localApiFetch(`/api/groups/${groupId}/assistant/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "member", expiresInSeconds: 600 }),
      });
      const data = await response.json().catch(() => ({})) as Handoff;
      if (!response.ok || !data.token) throw new Error(data.error ?? "本人用AIアシストを開始できませんでした。");

      const handoff = await fetch(`${runtimeUrl}/api/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: data.token, groupId: data.groupId, memberName: data.memberName, expiresAt: data.expiresAt, audience: "agent-runtime" }),
      });
      const handoffData = await handoff.json().catch(() => ({})) as { handoff?: string; error?: string };
      if (!handoff.ok || !handoffData.handoff) throw new Error(handoffData.error ?? "AIアシストへの接続に失敗しました。");
      // Only the opaque, one-time code is placed in the URL.
      popup.location.href = `${runtimeUrl}/?handoff=${encodeURIComponent(handoffData.handoff)}`;
    } catch (error) {
      popup.close();
      setNotice(error instanceof Error ? error.message : "本人用AIアシストを開始できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  if (runtimeConfigured !== true) return null;

  return <div className="member-agent-assist">
    <button className="group-menu-button member-agent-button" type="button" disabled={busy} onClick={() => void openAssist()}>
      {busy ? "接続中…" : "本人用AIアシスト"}
    </button>
    {notice && <span className="member-agent-notice" role="status">{notice}</span>}
  </div>;
}
