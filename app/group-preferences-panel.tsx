"use client";

import { useEffect, useState } from "react";
import { localApiFetch } from "./local-api";
import { displayShiftTime } from "./shift-time";

type PreferenceStatus = "want" | "possible" | "off" | "unavailable";
type Day = {
  dayOfWeek: number;
  status: PreferenceStatus;
  startTime: string;
  endTime: string;
  note: string;
};
type Preference = {
  minDays: number;
  maxDays: number;
  minHours: number;
  maxHours: number;
  freeComment: string;
};

const labels = ["日", "月", "火", "水", "木", "金", "土"];
const statusLabels: Record<PreferenceStatus, string> = {
  want: "出勤希望",
  possible: "可能",
  off: "休み希望",
  unavailable: "勤務不可",
};
const shiftTimeOptions = Array.from(
  { length: 61 },
  (_, index) =>
    `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`,
);

function emptyDay(dayOfWeek: number): Day {
  return {
    dayOfWeek,
    status: "possible",
    startTime: "",
    endTime: "",
    note: "",
  };
}
function normalizeStatus(status: string): PreferenceStatus {
  return status === "want" || status === "off" || status === "unavailable"
    ? status
    : "possible";
}

export default function GroupPreferencesPanel({
  groupId,
}: {
  groupId: string;
}) {
  const [days, setDays] = useState<Record<number, Day[]>>({});
  const [preference, setPreference] = useState<Preference>({
    minDays: 0,
    maxDays: 7,
    minHours: 0,
    maxHours: 40,
    freeComment: "",
  });
  const [groupNickname, setGroupNickname] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void localApiFetch(`/api/groups/${groupId}/preferences`).then(
        async (response) => {
          if (!response.ok) return;
          const data = (await response.json()) as {
            groupMember?: { displayName?: string | null };
            preferences: Preference;
            availability: Array<Day & { status: string }>;
          };
          const next: Record<number, Day[]> = {};
          for (const day of data.availability)
            (next[day.dayOfWeek] ??= []).push({
              ...day,
              status: normalizeStatus(day.status),
            });
          setPreference({
            minDays: data.preferences.minDays,
            maxDays: data.preferences.maxDays,
            minHours: data.preferences.minHours,
            maxHours: data.preferences.maxHours,
            freeComment: data.preferences.freeComment ?? "",
          });
          setGroupNickname(data.groupMember?.displayName ?? "");
          setDays(next);
        },
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [groupId]);

  function rowsForState(current: Record<number, Day[]>, day: number) {
    return current[day]?.length ? current[day] : [emptyDay(day)];
  }
  function rowsFor(day: number) {
    return rowsForState(days, day);
  }
  function updateDay(day: number, index: number, values: Partial<Day>) {
    setDays((current) => ({
      ...current,
      [day]: rowsForState(current, day).map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...values } : row,
      ),
    }));
  }
  function addDay(day: number) {
    setDays((current) => ({
      ...current,
      [day]: [...rowsForState(current, day), emptyDay(day)],
    }));
  }
  function removeDay(day: number, index: number) {
    setDays((current) => ({
      ...current,
      [day]: rowsForState(current, day).filter(
        (_, rowIndex) => rowIndex !== index,
      ),
    }));
  }
  async function save() {
    setSaving(true);
    const availability = labels.flatMap((_, day) => rowsFor(day));
    const response = await localApiFetch(`/api/groups/${groupId}/preferences`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...preference, availability, displayName: groupNickname }),
    });
    setNotice(
      response.ok
        ? "基本設定を保存しました"
        : (((await response.json().catch(() => ({}))) as { error?: string })
            .error ?? "基本設定を保存できませんでした"),
    );
    setSaving(false);
  }

  return (
    <div className="group-preferences">
      <div className="group-nickname-setting">
        <div>
          <strong>このグループでのニックネーム</strong>
          <p>グループ内だけで使う表示名です。空欄にするとアカウント共通のニックネームを使います。</p>
        </div>
        <input
          value={groupNickname}
          maxLength={40}
          onChange={(event) => setGroupNickname(event.target.value)}
          placeholder="例：店長、学生1"
          aria-label="このグループでのニックネーム"
        />
      </div>
      <div className="section-title">
        <div>
          <h4>勤務の基本希望</h4>
          <p>
            曜日ごとに時間帯と希望を登録します。時間を空欄にすると終日扱いです。
          </p>
        </div>
        <button
          className="small-action"
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
      <div className="preference-fields">
        <label>
          週の希望勤務日数（下限）
          <input
            type="number"
            min="0"
            max="7"
            value={preference.minDays}
            onChange={(event) =>
              setPreference({
                ...preference,
                minDays: Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          週の希望勤務日数（上限）
          <input
            type="number"
            min="0"
            max="7"
            value={preference.maxDays}
            onChange={(event) =>
              setPreference({
                ...preference,
                maxDays: Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          週の希望勤務時間（下限）
          <input
            type="number"
            min="0"
            max="168"
            value={preference.minHours}
            onChange={(event) =>
              setPreference({
                ...preference,
                minHours: Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          週の希望勤務時間（上限）
          <input
            type="number"
            min="0"
            max="168"
            value={preference.maxHours}
            onChange={(event) =>
              setPreference({
                ...preference,
                maxHours: Number(event.target.value),
              })
            }
          />
        </label>
      </div>
      <label className="preference-comment">
        固定休・授業・本業などのフリーコメント
        <textarea
          rows={3}
          maxLength={500}
          value={preference.freeComment}
          onChange={(event) =>
            setPreference({ ...preference, freeComment: event.target.value })
          }
          placeholder="例：水曜は授業のため18時以降のみ可能"
        />
      </label>
      <div className="preference-days">
        {labels.map((label, day) => (
          <div className="preference-day" key={day}>
            <strong>{label}曜日</strong>
            <div className="preference-ranges">
              {rowsFor(day).map((row, index) => (
                <div className="preference-range" key={`${day}-${index}`}>
                  <div className="time-pair">
                    <select
                      value={row.startTime}
                      onChange={(event) =>
                        updateDay(day, index, { startTime: event.target.value })
                      }
                      aria-label={`${label}開始時刻`}
                    >
                      <option value="">開始</option>
                      {shiftTimeOptions.slice(0, -1).map((time) => (
                        <option key={time} value={time}>
                          {displayShiftTime(time)}
                        </option>
                      ))}
                    </select>
                    <span>〜</span>
                    <select
                      value={row.endTime}
                      onChange={(event) =>
                        updateDay(day, index, { endTime: event.target.value })
                      }
                      aria-label={`${label}終了時刻`}
                    >
                      <option value="">終了</option>
                      {shiftTimeOptions.slice(1).map((time) => (
                        <option key={time} value={time}>
                          {displayShiftTime(time)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <select
                    value={row.status}
                    onChange={(event) =>
                      updateDay(day, index, {
                        status: event.target.value as PreferenceStatus,
                      })
                    }
                  >
                    {Object.entries(statusLabels).map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                  </select>
                  {rowsFor(day).length > 1 && (
                    <button
                      type="button"
                      className="range-remove"
                      onClick={() => removeDay(day, index)}
                      aria-label={`${label}の時間帯を削除`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="small-action range-add"
                onClick={() => addDay(day)}
              >
                ＋時間帯を追加
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="preference-help">
        時間帯を登録した曜日は、登録範囲外を「勤務不可」として扱います。
      </p>
      {notice && (
        <p className="group-notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
