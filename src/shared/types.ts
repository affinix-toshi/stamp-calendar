/** 日付キー（YYYY-MM-DD、日本時間） */
export type DateKey = string;

export interface StampType {
  emoji: string;
  label: string;
  order: number;
}

export interface Stamp {
  emoji: string;
  label: string;
  uid: string;
  userName: string;
  ts: number;
  memo?: string;
}

/** weekdays は 0=日〜6=土 */
export interface Repeat extends Stamp {
  weekdays: number[];
  start: DateKey;
  end?: DateKey;
  skips?: Record<DateKey, true>;
}

export interface DayEntry extends Stamp {
  date: DateKey;
  source: { kind: 'stamp'; id: string } | { kind: 'repeat'; id: string };
}
