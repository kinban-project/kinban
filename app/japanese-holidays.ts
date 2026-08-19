export type JapaneseHolidayKind = "national" | "substitute" | "citizen";

export type JapaneseHoliday = {
  date: string;
  name: string;
  kind: JapaneseHolidayKind;
};

const pad = (value: number) => String(value).padStart(2, "0");
const key = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

function vernalEquinoxDay(year: number) {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function autumnalEquinoxDay(year: number) {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function nthMonday(year: number, month: number, nth: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  return 1 + ((8 - first.getUTCDay()) % 7) + (nth - 1) * 7;
}

function nationalHolidays(year: number): Map<string, JapaneseHoliday> {
  const holidays: JapaneseHoliday[] = [
    { date: key(year, 1, 1), name: "元日", kind: "national" },
    { date: key(year, 2, 11), name: "建国記念の日", kind: "national" },
    { date: key(year, 2, 23), name: "天皇誕生日", kind: "national" },
    { date: key(year, 3, vernalEquinoxDay(year)), name: "春分の日", kind: "national" },
    { date: key(year, 4, 29), name: "昭和の日", kind: "national" },
    { date: key(year, 5, 3), name: "憲法記念日", kind: "national" },
    { date: key(year, 5, 4), name: "みどりの日", kind: "national" },
    { date: key(year, 5, 5), name: "こどもの日", kind: "national" },
    { date: key(year, 7, nthMonday(year, 7, 3)), name: "海の日", kind: "national" },
    { date: key(year, 8, 11), name: "山の日", kind: "national" },
    { date: key(year, 9, nthMonday(year, 9, 3)), name: "敬老の日", kind: "national" },
    { date: key(year, 9, autumnalEquinoxDay(year)), name: "秋分の日", kind: "national" },
    { date: key(year, 10, nthMonday(year, 10, 2)), name: "スポーツの日", kind: "national" },
    { date: key(year, 11, 3), name: "文化の日", kind: "national" },
    { date: key(year, 11, 23), name: "勤労感謝の日", kind: "national" },
  ];

  // One-off and temporarily moved holidays defined by special laws.
  if (year === 2019) {
    holidays.push(
      { date: key(year, 4, 30), name: "国民の休日", kind: "citizen" },
      { date: key(year, 5, 1), name: "天皇の即位の日", kind: "national" },
      { date: key(year, 5, 2), name: "国民の休日", kind: "citizen" },
      { date: key(year, 10, 22), name: "即位礼正殿の儀", kind: "national" },
    );
  }
  if (year === 2020) {
    holidays.push({ date: key(year, 7, 23), name: "海の日", kind: "national" }, { date: key(year, 7, 24), name: "スポーツの日", kind: "national" }, { date: key(year, 8, 10), name: "山の日", kind: "national" });
    holidays.splice(holidays.findIndex((item) => item.date === key(year, 7, nthMonday(year, 7, 3))), 1);
    holidays.splice(holidays.findIndex((item) => item.date === key(year, 8, 11)), 1);
    holidays.splice(holidays.findIndex((item) => item.date === key(year, 10, nthMonday(year, 10, 2))), 1);
  }
  if (year === 2021) {
    holidays.push({ date: key(year, 7, 22), name: "海の日", kind: "national" }, { date: key(year, 7, 23), name: "スポーツの日", kind: "national" }, { date: key(year, 8, 8), name: "山の日", kind: "national" });
    for (const date of [key(year, 7, nthMonday(year, 7, 3)), key(year, 8, 11), key(year, 10, nthMonday(year, 10, 2))]) {
      const index = holidays.findIndex((item) => item.date === date);
      if (index >= 0) holidays.splice(index, 1);
    }
  }

  const result = new Map(holidays.map((holiday) => [holiday.date, holiday]));
  // A Sunday holiday is observed on the next non-holiday weekday.
  for (const holiday of [...result.values()]) {
    const date = new Date(`${holiday.date}T00:00:00Z`);
    if (date.getUTCDay() !== 0) continue;
    do {
      date.setUTCDate(date.getUTCDate() + 1);
    } while (result.has(date.toISOString().slice(0, 10)));
    const observed = date.toISOString().slice(0, 10);
    result.set(observed, { date: observed, name: "振替休日", kind: "substitute" });
  }
  // A weekday between two national holidays is a citizen's holiday.
  for (let month = 1; month <= 12; month += 1) {
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let day = 2; day < days; day += 1) {
      const date = key(year, month, day);
      if (result.has(date)) continue;
      const previous = key(year, month, day - 1);
      const next = key(year, month, day + 1);
      if (result.get(previous)?.kind === "national" && result.get(next)?.kind === "national") result.set(date, { date, name: "国民の休日", kind: "citizen" });
    }
  }
  return result;
}

export function getJapaneseHoliday(value: string): JapaneseHoliday | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return nationalHolidays(Number(match[1])).get(`${match[1]}-${match[2]}-${match[3]}`) ?? null;
}

export function formatJapaneseDate(value: string, includeYear = true) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  const weekday = "日月火水木金土"[date.getUTCDay()];
  const base = includeYear ? `${match[1]}-${match[2]}-${match[3]}` : `${Number(match[2])}月${Number(match[3])}日`;
  const holiday = getJapaneseHoliday(value);
  return `${base}（${weekday}${holiday ? `・${holiday.name}` : ""}）`;
}
