/** 見本ルーム（DEMO）の初期データ。毎日リセットするたびに、その日を基準に作り直す */
import { addDays, weekdayOf } from './dates';
import { DEFAULT_STAMP_TYPES } from './defaults';
import type { DateKey, Repeat, Stamp, StampType } from './types';

export const DEMO_ROOM_ID = 'DEMO';
export const DEMO_VISITOR_NAME = '見学の方';

export interface DemoRoom {
  meta: { name: string; createdBy: string; createdAt: number; inviteCode: string; feedToken: string };
  members: Record<string, { name: string; joinedAt: number }>;
  stampTypes: Record<string, StampType>;
  stamps: Record<DateKey, Record<string, Stamp>>;
  repeats: Record<string, Repeat>;
}

const PAPA = 'demo-papa';
const MAMA = 'demo-mama';
const YUI = 'demo-yui';
const NAMES: Record<string, string> = { [PAPA]: 'パパ', [MAMA]: 'ママ', [YUI]: 'ゆい' };

/** 32文字の見本用の固定値（本物の招待・購読には使えない。見本では押しても使えない画面にしてある） */
const INVITE_CODE = 'DEMO'.repeat(8);
const FEED_TOKEN = 'demo'.repeat(8);

/** 今月の1日から来月の末日までの日付を順に並べる */
function monthSpan(today: DateKey): DateKey[] {
  const first = `${today.slice(0, 7)}-01`;
  const [y, m] = today.split('-').map(Number);
  const nextMonth = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  const days: DateKey[] = [];
  for (let d = first; d.slice(0, 7) <= nextMonth; d = addDays(d, 1)) days.push(d);
  return days;
}

export function buildDemoSeed(today: DateKey): DemoRoom {
  const base = Date.parse(`${today}T00:00:00+09:00`);
  const days = monthSpan(today);
  const firstDay = days[0];

  const stampTypes: Record<string, StampType> = {};
  const typeByLabel = new Map<string, StampType>();
  DEFAULT_STAMP_TYPES.forEach((t, i) => {
    stampTypes[`t${i}`] = { ...t };
    typeByLabel.set(t.label, t);
  });

  const stamps: Record<DateKey, Record<string, Stamp>> = {};
  let seq = 0;
  const put = (date: DateKey, uid: string, label: string, memo?: string) => {
    const type = typeByLabel.get(label);
    if (!type) throw new Error(`unknown stamp type: ${label}`);
    seq += 1;
    const stamp: Stamp = { emoji: type.emoji, label: type.label, uid, userName: NAMES[uid], ts: base + seq };
    if (memo !== undefined) stamp.memo = memo;
    (stamps[date] ??= {})[`s${seq}`] = stamp;
  };

  days.forEach((date, i) => {
    const w = weekdayOf(date); // 0=日〜6=土
    const week = Math.floor(i / 7) % 2;
    // パパ: 平日は仕事、金曜は隔週で飲み会、土曜は休み（日曜は下のくり返し）
    if (w === 1 || w === 3) put(date, PAPA, '仕事朝');
    if (w === 2 || w === 4) put(date, PAPA, '仕事昼');
    if (w === 5) put(date, PAPA, week === 0 ? '仕事昼' : '飲み会');
    if (w === 6) put(date, PAPA, '休み');
    // ママ: 月・水・金は在宅、木曜は隔週で夜勤、土曜は隔週でワイン
    if (w === 1 || w === 3 || w === 5) put(date, MAMA, '在宅');
    if (w === 4 && week === 1) put(date, MAMA, '仕事夜');
    if (w === 6 && week === 0) put(date, MAMA, 'ワイン');
    // ゆい: 土曜は休み（火曜のピアノは下のくり返し）
    if (w === 6) put(date, YUI, '休み');
  });

  // メモつき（日付は月初からの日数。月の長さに関わらず必ず範囲内）
  const memos: [number, string, string, string][] = [
    [3, PAPA, '飲み会', '駅前の居酒屋 19時から'],
    [9, MAMA, 'ワイン', '実家でホームパーティ'],
    [16, YUI, '在宅', '学校の発表会の練習'],
    [24, MAMA, '赤ちゃん', '検診 10時に病院'],
  ];
  for (const [offset, uid, label, memo] of memos) put(days[offset], uid, label, memo);

  const piano = typeByLabel.get('ピアノ')!;
  const home = typeByLabel.get('在宅')!;
  const repeats: Record<string, Repeat> = {
    r1: {
      emoji: piano.emoji,
      label: piano.label,
      uid: YUI,
      userName: NAMES[YUI],
      ts: base,
      weekdays: [2],
      start: firstDay,
      memo: '17時から',
    },
    r2: {
      emoji: home.emoji,
      label: home.label,
      uid: PAPA,
      userName: NAMES[PAPA],
      ts: base,
      weekdays: [0],
      start: firstDay,
    },
  };

  return {
    meta: { name: '見本の家族', createdBy: PAPA, createdAt: base, inviteCode: INVITE_CODE, feedToken: FEED_TOKEN },
    members: {
      [PAPA]: { name: NAMES[PAPA], joinedAt: base },
      [MAMA]: { name: NAMES[MAMA], joinedAt: base },
      [YUI]: { name: NAMES[YUI], joinedAt: base },
    },
    stampTypes,
    stamps,
    repeats,
  };
}
