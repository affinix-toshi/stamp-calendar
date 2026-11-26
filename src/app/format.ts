import { weekdayOf } from '../shared/dates';
import type { DateKey } from '../shared/types';

export const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** 2026-12-03 → 12/3 */
export function shortDate(key: DateKey): string {
  const [, m, d] = key.split('-').map(Number);
  return `${m}/${d}`;
}

/** 2026-12-03 → 12月3日 */
export function dayLabel(key: DateKey): string {
  const [, m, d] = key.split('-').map(Number);
  return `${m}月${d}日`;
}

/** 2026-12-03 → 12月3日（木） */
export function longDate(key: DateKey): string {
  return `${dayLabel(key)}（${WEEKDAY_NAMES[weekdayOf(key)]}）`;
}

/** 書き込み失敗の共通処理。元のエラーは console にだけ出し、画面には日本語の案内だけ出す */
export function writeFailed(lead: string, e: unknown): string {
  console.error(e);
  return `${lead}。通信の状態を確かめて、もう一度ためしてください。`;
}
