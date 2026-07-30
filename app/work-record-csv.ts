export type WorkCsvRow = {
  month: string;
  displayName: string;
  email: string;
  date: string;
  role: string;
  plannedStart: string;
  plannedEnd: string;
  plannedBreakMinutes: number;
  declaredStart: string;
  declaredEnd: string;
  declaredBreakMinutes: number;
  actualMinutes: number;
  dailyStatus: string;
  monthlyStatus: string;
  outOfShift: string;
  unentered: string;
};

function safeCell(value: unknown) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
}

function csvCell(value: unknown) {
  return `"${safeCell(value).replaceAll('"', '""')}"`;
}

export function workRecordsCsv(rows: WorkCsvRow[]) {
  const headers = [
    "対象月", "氏名", "メールアドレス", "日付", "担当",
    "予定開始", "予定終了", "予定休憩(分)", "申告開始", "申告終了",
    "申告休憩(分)", "実働(分)", "日次状態", "月次状態", "シフト外", "未入力",
  ];
  return `\uFEFF${[headers, ...rows.map((row) => [
    row.month, row.displayName, row.email, row.date, row.role,
    row.plannedStart, row.plannedEnd, row.plannedBreakMinutes,
    row.declaredStart, row.declaredEnd, row.declaredBreakMinutes,
    row.actualMinutes, row.dailyStatus, row.monthlyStatus, row.outOfShift, row.unentered,
  ])].map((line) => line.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function downloadWorkRecordsCsv(filename: string, rows: WorkCsvRow[]) {
  const blob = new Blob([workRecordsCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
