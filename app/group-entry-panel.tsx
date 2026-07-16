"use client";

import { useState } from "react";
import { localApiFetch } from "./local-api";

export default function GroupEntryPanel({ mode }: { mode: "join" | "create" }) {
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const join = mode === "join";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim() || saving) return;
    setSaving(true);
    const response = await localApiFetch(
      join ? `/api/groups/${encodeURIComponent(value.trim())}/join` : "/api/groups",
      {
        method: "POST",
        ...(join ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: value.trim() }) }),
      },
    );
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setNotice(response.ok ? (join ? "参加申請を送りました" : "グループを作成しました") : (data.error ?? (join ? "参加申請に失敗しました" : "グループを作成できませんでした")));
    if (response.ok) setValue("");
    setSaving(false);
  }

  return (
    <section className="group-entry-panel">
      <form onSubmit={submit}>
        <label>
          {join ? "グループID" : "グループ名"}
          <input
            required
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={join ? "グループIDを入力" : "グループ名を入力"}
          />
        </label>
        <button className="primary-button" type="submit" disabled={saving}>
          {saving ? "処理中…" : join ? "参加申請" : "グループを作成"}
        </button>
      </form>
      {notice && <p className="group-notice" role="status">{notice}</p>}
    </section>
  );
}
