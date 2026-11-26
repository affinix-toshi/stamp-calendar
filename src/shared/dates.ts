import type { DateKey } from './types';

const jstFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 日本時間の今日（YYYY-MM-DD） */
export function todayKey(now: Date = new Date()): DateKey {
  return jstFormat.format(now);
}

function toNoonUtc(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function fromUtc(date: Date): DateKey {
  return date.toISOString().slice(0, 10);
}

export function addDays(key: DateKey, n: number): DateKey {
  const date = toNoonUtc(key);
  date.setUTCDate(date.getUTCDate() + n);
  return fromUtc(date);
}

/** 0=日〜6=土 */
export function weekdayOf(key: DateKey): number {
  return toNoonUtc(key).getUTCDay();
}

/** 日曜始まりの月カレンダー。月初の前は null で埋める（後ろは埋めない） */
export function monthGrid(year: number, month0: number): (DateKey | null)[] {
  const first = new Date(Date.UTC(year, month0, 1, 12));
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0, 12)).getUTCDate();
  const cells: (DateKey | null)[] = Array.from({ length: first.getUTCDay() }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(fromUtc(new Date(Date.UTC(year, month0, d, 12))));
  }
  return cells;
}
