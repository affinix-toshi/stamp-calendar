import {
  get,
  onValue,
  push,
  ref,
  update,
  type Database,
} from 'firebase/database';
import { DEFAULT_STAMP_TYPES } from '../shared/defaults';
import { checkDisplayName, checkLabel, checkMemo } from '../shared/validate';
import { endBefore } from '../shared/repeats';
import type { DateKey, DayEntry, Repeat, Stamp, StampType } from '../shared/types';

export { getFirebase } from './firebase';

export interface RoomMeta {
  name: string;
  createdBy: string;
  createdAt: number;
  inviteCode: string;
  feedToken: string;
}

export interface Member {
  name: string;
  joinedAt: number;
  invite?: string;
}

export interface RoomSnapshot {
  meta: RoomMeta;
  members: Record<string, Member>;
  stampTypes: Record<string, StampType>;
  stamps: Record<DateKey, Record<string, Stamp>>;
  repeats: Record<string, Repeat>;
}

export interface UserInfo {
  uid: string;
  name: string;
}

const ROOM_NAME_MAX = 20; // 規則の上限は40だが、画面では20文字までにする
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** 32文字の英数字（ブラウザでも Node でも使える crypto を利用） */
function randomToken(length = 32): string {
  let out = '';
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < 248 && out.length < length) out += ALNUM[b % 62]; // 248 = 62 * 4（偏りを避ける）
    }
  }
  return out;
}

function fail(message: string | null): void {
  if (message) throw new Error(message);
}

function newKey(db: Database, path: string): string {
  const key = push(ref(db, path)).key;
  if (!key) throw new Error('IDを作れませんでした');
  return key;
}

function roomPath(roomId: string, rest = ''): string {
  return `v2/rooms/${roomId}${rest ? `/${rest}` : ''}`;
}

function checkRoomName(name: string): string | null {
  if (name.trim() === '') return 'ルームの名前を入力してください';
  if (Array.from(name).length > ROOM_NAME_MAX) return `ルームの名前は${ROOM_NAME_MAX}文字までにしてください`;
  return null;
}

function checkEmoji(emoji: string): string | null {
  if (emoji.trim() === '') return '絵文字を入力してください';
  return null;
}

export async function createRoom(db: Database, user: UserInfo, roomName: string): Promise<string> {
  fail(checkDisplayName(user.name));
  fail(checkRoomName(roomName));
  const roomId = newKey(db, 'v2/rooms');
  const now = Date.now();
  const updates: Record<string, unknown> = {
    [roomPath(roomId, 'meta')]: {
      name: roomName,
      createdBy: user.uid,
      createdAt: now,
      inviteCode: randomToken(),
      feedToken: randomToken(),
    },
    [roomPath(roomId, `members/${user.uid}`)]: { name: user.name, joinedAt: now },
    [`v2/users/${user.uid}/rooms/${roomId}`]: true,
  };
  for (const t of DEFAULT_STAMP_TYPES) {
    updates[roomPath(roomId, `stampTypes/${newKey(db, roomPath(roomId, 'stampTypes'))}`)] = t;
  }
  await update(ref(db), updates);
  return roomId;
}

export async function joinRoom(
  db: Database,
  user: UserInfo,
  roomId: string,
  inviteCode: string,
): Promise<void> {
  fail(checkDisplayName(user.name));
  await update(ref(db), {
    [roomPath(roomId, `members/${user.uid}`)]: {
      name: user.name,
      joinedAt: Date.now(),
      invite: inviteCode,
    },
    [`v2/users/${user.uid}/rooms/${roomId}`]: true,
  });
}

export async function listMyRooms(db: Database, uid: string): Promise<string[]> {
  const snap = await get(ref(db, `v2/users/${uid}/rooms`));
  return snap.exists() ? Object.keys(snap.val() as Record<string, true>) : [];
}

/**
 * ルームを購読する。
 * - メンバーでない人・存在しないルームは、規則上どちらも読めない（permission-denied）ので onError が呼ばれる。
 * - 読めるのに meta がない（壊れたルーム）場合は cb(null)。
 */
export function subscribeRoom(
  db: Database,
  roomId: string,
  cb: (room: RoomSnapshot | null) => void,
  onError?: (e: Error) => void,
): () => void {
  return onValue(
    ref(db, roomPath(roomId)),
    (snap) => {
      const v = (snap.val() ?? {}) as Partial<RoomSnapshot>;
      if (!v.meta) {
        cb(null);
        return;
      }
      cb({
        meta: v.meta,
        members: v.members ?? {},
        stampTypes: v.stampTypes ?? {},
        stamps: v.stamps ?? {},
        repeats: normalizeRepeats(v.repeats),
      });
    },
    (e) => onError?.(e),
  );
}

/** Firebase は空の配列やスキップを落とすので、weekdays を配列として揃える */
function normalizeRepeats(repeats: Record<string, Repeat> | undefined): Record<string, Repeat> {
  const out: Record<string, Repeat> = {};
  for (const [id, r] of Object.entries(repeats ?? {})) {
    out[id] = { ...r, weekdays: Object.values(r.weekdays ?? []) };
  }
  return out;
}

export async function addStamps(
  db: Database,
  roomId: string,
  date: DateKey,
  types: StampType[],
  user: UserInfo,
): Promise<void> {
  const base = Date.now();
  const updates: Record<string, Stamp> = {};
  types.forEach((t, i) => {
    updates[roomPath(roomId, `stamps/${date}/${newKey(db, roomPath(roomId, `stamps/${date}`))}`)] = {
      emoji: t.emoji,
      label: t.label,
      uid: user.uid,
      userName: user.name,
      ts: base + i, // 追加した順に並ぶようにずらす
    };
  });
  await update(ref(db), updates);
}

export async function deleteStamp(
  db: Database,
  roomId: string,
  date: DateKey,
  stampId: string,
): Promise<void> {
  await update(ref(db), { [roomPath(roomId, `stamps/${date}/${stampId}`)]: null });
}

export async function setMemo(
  db: Database,
  roomId: string,
  target: DayEntry['source'] & { date: DateKey },
  memo: string,
): Promise<void> {
  fail(checkMemo(memo));
  const base =
    target.kind === 'stamp'
      ? roomPath(roomId, `stamps/${target.date}/${target.id}`)
      : roomPath(roomId, `repeats/${target.id}`);
  await update(ref(db), { [`${base}/memo`]: memo === '' ? null : memo });
}

export async function makeRepeat(
  db: Database,
  roomId: string,
  date: DateKey,
  stampId: string,
  weekdays: number[],
  end?: DateKey,
): Promise<string> {
  const days = [...new Set(weekdays)].sort((a, b) => a - b);
  if (days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new Error('くり返す曜日を選んでください');
  }
  const snap = await get(ref(db, roomPath(roomId, `stamps/${date}/${stampId}`)));
  if (!snap.exists()) throw new Error('もとのスタンプが見つかりません');
  const s = snap.val() as Stamp;
  const repeat: Repeat = {
    emoji: s.emoji,
    label: s.label,
    uid: s.uid,
    userName: s.userName,
    ts: s.ts,
    weekdays: days,
    start: date,
  };
  if (s.memo !== undefined) repeat.memo = s.memo;
  if (end !== undefined) repeat.end = end;
  const repeatId = newKey(db, roomPath(roomId, 'repeats'));
  await update(ref(db), {
    [roomPath(roomId, `repeats/${repeatId}`)]: repeat,
    [roomPath(roomId, `stamps/${date}/${stampId}`)]: null,
  });
  return repeatId;
}

export async function skipRepeatDate(
  db: Database,
  roomId: string,
  repeatId: string,
  date: DateKey,
): Promise<void> {
  await update(ref(db), { [roomPath(roomId, `repeats/${repeatId}/skips/${date}`)]: true });
}

export async function endRepeatFrom(
  db: Database,
  roomId: string,
  repeatId: string,
  date: DateKey,
): Promise<void> {
  const path = roomPath(roomId, `repeats/${repeatId}`);
  const snap = await get(ref(db, path));
  if (!snap.exists()) return;
  const raw = snap.val() as Repeat;
  const result = endBefore({ ...raw, weekdays: Object.values(raw.weekdays ?? []) }, date);
  await update(ref(db), {
    [result.action === 'delete' ? path : `${path}/end`]: result.action === 'delete' ? null : result.end,
  });
}

export async function saveStampType(
  db: Database,
  roomId: string,
  typeId: string | null,
  t: StampType,
): Promise<string> {
  fail(checkLabel(t.label));
  fail(checkEmoji(t.emoji));
  const id = typeId ?? newKey(db, roomPath(roomId, 'stampTypes'));
  await update(ref(db), {
    [roomPath(roomId, `stampTypes/${id}`)]: { emoji: t.emoji, label: t.label, order: t.order },
  });
  return id;
}

export async function deleteStampType(db: Database, roomId: string, typeId: string): Promise<void> {
  await update(ref(db), { [roomPath(roomId, `stampTypes/${typeId}`)]: null });
}

export async function reorderStampTypes(
  db: Database,
  roomId: string,
  orderedIds: string[],
): Promise<void> {
  const updates: Record<string, number> = {};
  orderedIds.forEach((id, i) => {
    updates[roomPath(roomId, `stampTypes/${id}/order`)] = i;
  });
  await update(ref(db), updates);
}

export async function updateDisplayName(
  db: Database,
  roomId: string,
  uid: string,
  name: string,
): Promise<void> {
  fail(checkDisplayName(name));
  await update(ref(db), { [roomPath(roomId, `members/${uid}/name`)]: name });
}

export async function regenerateInvite(db: Database, roomId: string): Promise<string> {
  const code = randomToken();
  await update(ref(db), { [roomPath(roomId, 'meta/inviteCode')]: code });
  return code;
}

export async function regenerateFeedToken(db: Database, roomId: string): Promise<string> {
  const token = randomToken();
  await update(ref(db), { [roomPath(roomId, 'meta/feedToken')]: token });
  return token;
}
