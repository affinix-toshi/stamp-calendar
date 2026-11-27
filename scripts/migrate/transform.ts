// 旧アプリ（v1）のスタンプを、新しいアプリ（v2）の形に置きかえる。
// データベースには触らない（読み書きは cli/ の中だけ）。
import type { DateKey, Stamp } from '../../src/shared/types';

export interface OldUser {
  name?: unknown;
  ts?: unknown;
}

/** 旧ルーム rooms/{CODE} の中身。旧データは形が崩れている可能性があるので unknown で受ける */
export interface OldRoom {
  users?: Record<string, OldUser> | null;
  stamps?: Record<string, Record<string, unknown> | unknown> | null;
}

export interface OldStamp {
  emoji: string;
  label: string;
  userId: string;
  userName: string;
  ts: number;
}

/** 写さずに飛ばしたもの。id がないときは、その日付キーごと飛ばした */
export interface Skipped {
  date: string;
  id?: string;
  reason: string;
}

export const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/**
 * 旧ルームのスタンプを、写せるものと飛ばすものに分ける。
 * 並び順は日付・ID の順にそろえる（毎回同じ結果にするため）。
 */
export function readOldStamps(old: OldRoom): {
  valid: { date: DateKey; id: string; stamp: OldStamp }[];
  skipped: Skipped[];
} {
  const valid: { date: DateKey; id: string; stamp: OldStamp }[] = [];
  const skipped: Skipped[] = [];
  const days = old.stamps && typeof old.stamps === 'object' ? old.stamps : {};
  for (const date of Object.keys(days).sort()) {
    const day = days[date];
    if (!DATE_KEY.test(date)) {
      const n = day && typeof day === 'object' ? Object.keys(day).length : 0;
      skipped.push({ date, reason: `日付の形がおかしいので、この日の ${n} 件は写しません` });
      continue;
    }
    if (!day || typeof day !== 'object') {
      skipped.push({ date, reason: 'この日の中身がスタンプの形ではありません' });
      continue;
    }
    const entries = day as Record<string, unknown>;
    for (const id of Object.keys(entries).sort()) {
      const s = entries[id] as Record<string, unknown> | null;
      if (!s || typeof s !== 'object') {
        skipped.push({ date, id, reason: 'スタンプの形ではありません' });
        continue;
      }
      const missing: string[] = [];
      if (!nonEmptyString(s.emoji)) missing.push('絵文字');
      if (!nonEmptyString(s.label)) missing.push('名前');
      if (!nonEmptyString(s.userId)) missing.push('押した人');
      if (typeof s.ts !== 'number' || !Number.isFinite(s.ts)) missing.push('押した日時');
      if (missing.length > 0) {
        skipped.push({ date, id, reason: `${missing.join('・')}がありません` });
        continue;
      }
      valid.push({
        date,
        id,
        stamp: {
          emoji: s.emoji as string,
          label: s.label as string,
          userId: s.userId as string,
          userName: typeof s.userName === 'string' ? s.userName : '',
          ts: s.ts as number,
        },
      });
    }
  }
  return { valid, skipped };
}

export type TransformResult =
  | { stamps: Record<DateKey, Record<string, Stamp>>; skipped: Skipped[] }
  | { error: string; unmapped: string[]; notMembers: string[]; skipped: Skipped[] };

/**
 * 旧ルームのスタンプを新しい形にする。
 * - スタンプID は旧 pushId をそのまま使う（何度写しても同じ場所に入るので、件数は増えない）
 * - map: 旧ユーザーID → 新しい uid
 * - names: 新しい uid → 新しいルームでの表示名（userName はこれに置きかえる）
 * 対応表にない旧ユーザーIDや、新しいルームの参加者でない uid が1つでもあれば、何も返さず error を返す。
 */
export function transform(
  old: OldRoom,
  map: Record<string, string>,
  names: Record<string, string>,
): TransformResult {
  const { valid, skipped } = readOldStamps(old);

  const unmapped = new Set<string>();
  const notMembers = new Set<string>();
  for (const { stamp } of valid) {
    const uid = Object.prototype.hasOwnProperty.call(map, stamp.userId) ? map[stamp.userId] : undefined;
    if (!nonEmptyString(uid)) {
      unmapped.add(stamp.userId);
    } else if (!Object.prototype.hasOwnProperty.call(names, uid) || typeof names[uid] !== 'string') {
      notMembers.add(uid);
    }
  }
  if (unmapped.size > 0 || notMembers.size > 0) {
    const parts: string[] = [];
    if (unmapped.size > 0) parts.push(`対応表にない旧ユーザーIDがあります: ${[...unmapped].sort().join(', ')}`);
    if (notMembers.size > 0)
      parts.push(`新しいルームの参加者ではない uid があります: ${[...notMembers].sort().join(', ')}`);
    return {
      error: parts.join(' / '),
      unmapped: [...unmapped].sort(),
      notMembers: [...notMembers].sort(),
      skipped,
    };
  }

  const stamps: Record<DateKey, Record<string, Stamp>> = {};
  for (const { date, id, stamp } of valid) {
    const uid = map[stamp.userId];
    (stamps[date] ??= {})[id] = {
      emoji: stamp.emoji,
      label: stamp.label,
      uid,
      userName: names[uid],
      ts: stamp.ts,
    };
  }
  return { stamps, skipped };
}
