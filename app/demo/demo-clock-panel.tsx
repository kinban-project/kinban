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
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/demo-clock", { cache: "no-store" });
    if (response.ok) setCurrentAt(((await response.json()) as { currentAt: string }).currentAt);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  async function advance(step: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/demo-clock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step }),
      });
      if (response.ok) setCurrentAt(((await response.json()) as { currentAt: string }).currentAt);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="demo-clock-panel">
      <div>
        <p className="eyebrow">DEMO CLOCK</p>
        <strong>{currentAt ? format(currentAt) : "読み込み中…"}</strong>
        <small>デモ専用の日時です。進める操作だけできます。</small>
      </div>
      <div className="demo-clock-actions">
        <button disabled={busy} onClick={() => void advance("hour")}>＋1時間</button>
        <button disabled={busy} onClick={() => void advance("day")}>翌日へ</button>
        <button disabled={busy} onClick={() => void advance("threeDays")}>＋3日</button>
        <button disabled={busy} onClick={() => void advance("week")}>＋1週間</button>
      </div>
    </section>
  );
}
