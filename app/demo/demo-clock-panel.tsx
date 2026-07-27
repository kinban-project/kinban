"use client";

import { useCallback, useEffect, useState } from "react";

function format(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function DemoClockPanel() {
  const [currentAt, setCurrentAt] = useState("");
  const [targetAt, setTargetAt] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/demo-clock", { cache: "no-store" });
    if (response.ok) {
      setCurrentAt(((await response.json()) as { currentAt: string }).currentAt);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function advance(step: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/demo-clock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step }),
      });
      if (response.ok) {
        setCurrentAt(((await response.json()) as { currentAt: string }).currentAt);
      }
    } finally {
      setBusy(false);
    }
  }

  async function setTarget() {
    if (!targetAt) return;
    setBusy(true);
    try {
      const response = await fetch("/api/demo-clock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetAt: `${targetAt}:00+09:00` }),
      });
      if (response.ok) {
        setCurrentAt(((await response.json()) as { currentAt: string }).currentAt);
        setTargetAt("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="demo-clock-panel">
      <div>
        <p className="eyebrow">DEMO CLOCK</p>
        <strong>{currentAt ? format(currentAt) : "読み込み中…"}</strong>
        <small>デモ用の日時です。未来方向へ進める操作だけできます。</small>
      </div>
      <div className="demo-clock-actions">
        <button disabled={busy} onClick={() => void advance("fiveMinutes")}>＋5分</button>
        <button disabled={busy} onClick={() => void advance("fifteenMinutes")}>＋15分</button>
        <button disabled={busy} onClick={() => void advance("hour")}>＋1時間</button>
        <button disabled={busy} onClick={() => void advance("sixHours")}>＋6時間</button>
        <button disabled={busy} onClick={() => void advance("day")}>＋1日</button>
        <button disabled={busy} onClick={() => void advance("nextDayNine")}>翌日9:00</button>
      </div>
      <div className="demo-clock-target">
        <label>指定時刻へ<input type="datetime-local" value={targetAt} onChange={(event) => setTargetAt(event.target.value)} /></label>
        <button disabled={busy || !targetAt} onClick={() => void setTarget()}>進める</button>
      </div>
    </section>
  );
}
