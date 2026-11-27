import { addDays, weekdayOf } from './dates';
import type { DateKey, DayEntry, Repeat, Stamp } from './types';

/** from〜to（両端を含む）で、くり返しが当たる日の分を作る。日付順→ts順 */
export function expandRepeats(
  repeats: Record<string, Repeat>,
  from: DateKey,
  to: DateKey,
): DayEntry[] {
  const out: DayEntry[] = [];
  if (from > to) return out;
  const entries = Object.entries(repeats);
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const weekday = weekdayOf(day);
    const found: DayEntry[] = [];
    for (const [id, r] of entries) {
      if (day < r.start) continue;
      if (r.end !== undefined && day > r.end) continue;
      if (!r.weekdays.includes(weekday)) continue;
      if (r.skips?.[day]) continue;
      const entry: DayEntry = {
        emoji: r.emoji,
        label: r.label,
        uid: r.uid,
        userName: r.userName,
        ts: r.ts,
        date: day,
        source: { kind: 'repeat', id },
      };
      if (r.memo !== undefined) entry.memo = r.memo;
      found.push(entry);
    }
    found.sort((a, b) => a.ts - b.ts);
    out.push(...found);
  }
  return out;
}

/** その日の表示用一覧（ts順。同じ ts なら個別スタンプが先） */
export function mergeDay(
  stamps: Record<string, Stamp> | undefined,
  repeatsOfDay: DayEntry[],
  date: DateKey,
): DayEntry[] {
  const fromStamps: DayEntry[] = Object.entries(stamps ?? {}).map(([id, s]) => ({
    ...s,
    date,
    source: { kind: 'stamp', id },
  }));
  return [...fromStamps, ...repeatsOfDay].sort((a, b) => a.ts - b.ts);
}

/** 「この日以降すべて削除」 */
export function endBefore(
  repeat: Repeat,
  date: DateKey,
): { action: 'delete' } | { action: 'update'; end: DateKey } {
  if (date <= repeat.start) return { action: 'delete' };
  return { action: 'update', end: addDays(date, -1) };
}
