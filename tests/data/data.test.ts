import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
} from 'firebase/auth';
import { connectDatabaseEmulator, get, getDatabase, ref, type Database } from 'firebase/database';
import { describe, expect, it } from 'vitest';
import {
  addStamps,
  createRoom,
  deleteStamp,
  deleteStampType,
  endRepeatFrom,
  joinRoom,
  listMyRooms,
  makeRepeat,
  regenerateFeedToken,
  regenerateInvite,
  reorderStampTypes,
  saveStampType,
  setMemo,
  skipRepeatDate,
  subscribeRoom,
  updateDisplayName,
  type RoomSnapshot,
} from '../../src/app/data';

// 本番には絶対に届かないよう、demo- で始まるプロジェクトIDを使う
const PROJECT_ID = 'demo-stamp-calendar';
const AUTH_URL = `http://127.0.0.1:${process.env.AUTH_EMULATOR_PORT ?? 9099}`;
const NAMESPACE = `${PROJECT_ID}-default-rtdb`; // emulators:exec が規則を読み込む名前空間
const DB_HOST = '127.0.0.1';
const DB_PORT = Number(process.env.DB_EMULATOR_PORT ?? 9000);

interface TestUser {
  uid: string;
  email: string;
  db: Database;
}

/** エミュレーター上にユーザーを作る。verified なら email_verified を true にしてトークンを更新 */
async function makeUser(verified: boolean): Promise<TestUser> {
  const id = randomUUID().slice(0, 8);
  const email = `u.${id}@example.com`;
  const app = initializeApp({ apiKey: 'fake', projectId: PROJECT_ID, databaseURL: `http://${DB_HOST}:${DB_PORT}?ns=${NAMESPACE}` }, `app-${id}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, AUTH_URL, { disableWarnings: true });
  const cred = await createUserWithEmailAndPassword(auth, email, 'password123');
  if (verified) {
    // エミュレーターの管理用 API（Bearer owner）でメール確認済みにする
    const res = await fetch(
      `${AUTH_URL}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ localId: cred.user.uid, emailVerified: true }),
      },
    );
    expect(res.ok).toBe(true);
    await cred.user.getIdToken(true);
  }
  const db = getDatabase(app);
  connectDatabaseEmulator(db, DB_HOST, DB_PORT);
  return { uid: cred.user.uid, email, db };
}

/** 管理者権限でクリエイター許可リストに登録 */
async function allowCreator(email: string) {
  const key = email.split('.').join(',');
  const res = await fetch(
    `http://${DB_HOST}:${DB_PORT}/v2/config/creators/${encodeURIComponent(key)}.json?ns=${NAMESPACE}`,
    { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: 'true' },
  );
  expect(res.ok).toBe(true);
}

async function newCreator(): Promise<TestUser> {
  const u = await makeUser(true);
  await allowCreator(u.email);
  return u;
}

/** 条件を満たす最初の RoomSnapshot を待つ */
function waitRoom(
  db: Database,
  roomId: string,
  pred: (r: RoomSnapshot) => boolean = () => true,
): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error('timeout waiting for room'));
    }, 8000);
    const unsub = subscribeRoom(db, roomId, (room) => {
      if (room && pred(room)) {
        clearTimeout(timer);
        queueMicrotask(() => unsub());
        resolve(room);
      }
    });
  });
}

const TODAY = '2026-05-10';

describe('client data layer', () => {
  it('createRoom の後 subscribeRoom で初期スタンプ10種類が届き、ルームが一覧に出る', async () => {
    const mama = await newCreator();
    const roomId = await createRoom(mama.db, { uid: mama.uid, name: 'ママ' }, 'わが家');
    const room = await waitRoom(mama.db, roomId, (r) => Object.keys(r.stampTypes).length > 0);
    expect(Object.keys(room.stampTypes)).toHaveLength(10);
    expect(room.meta.name).toBe('わが家');
    expect(room.meta.inviteCode).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(room.meta.feedToken).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(room.members[mama.uid].name).toBe('ママ');
    expect(room.members[mama.uid].invite).toBeUndefined();
    expect(await listMyRooms(mama.db, mama.uid)).toEqual([roomId]);
  });

  it('許可リストにいない人は createRoom できない', async () => {
    const stranger = await makeUser(true);
    await expect(createRoom(stranger.db, { uid: stranger.uid, name: 'だれか' }, 'ひみつ')).rejects.toThrow();
  });

  it('別の人が正しい招待コードで joinRoom すると members が2人になる', async () => {
    const mama = await newCreator();
    const roomId = await createRoom(mama.db, { uid: mama.uid, name: 'ママ' }, 'わが家');
    const room = await waitRoom(mama.db, roomId, (r) => !!r.meta);
    const papa = await makeUser(false);
    await joinRoom(papa.db, { uid: papa.uid, name: 'パパ' }, roomId, room.meta.inviteCode);
    const after = await waitRoom(mama.db, roomId, (r) => Object.keys(r.members).length === 2);
    expect(after.members[papa.uid].name).toBe('パパ');
    expect(await listMyRooms(papa.db, papa.uid)).toEqual([roomId]);
  });

  it('間違った招待コードでは joinRoom できない', async () => {
    const mama = await newCreator();
    const roomId = await createRoom(mama.db, { uid: mama.uid, name: 'ママ' }, 'わが家');
    const papa = await makeUser(false);
    await expect(
      joinRoom(papa.db, { uid: papa.uid, name: 'パパ' }, roomId, 'x'.repeat(32)),
    ).rejects.toThrow();
  });

  it('regenerateInvite の後、古いコードでの joinRoom は失敗し新しいコードは通る', async () => {
    const mama = await newCreator();
    const roomId = await createRoom(mama.db, { uid: mama.uid, name: 'ママ' }, 'わが家');
    const room = await waitRoom(mama.db, roomId, (r) => !!r.meta);
    const oldCode = room.meta.inviteCode;
    const newCode = await regenerateInvite(mama.db, roomId);
    expect(newCode).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(newCode).not.toBe(oldCode);
    const papa = await makeUser(false);
    await expect(
      joinRoom(papa.db, { uid: papa.uid, name: 'パパ' }, roomId, oldCode),
    ).rejects.toThrow();
    await joinRoom(papa.db, { uid: papa.uid, name: 'パパ' }, roomId, newCode);
  });

  it('regenerateFeedToken は新しいトークンを返して保存する', async () => {
    const mama = await newCreator();
    const roomId = await createRoom(mama.db, { uid: mama.uid, name: 'ママ' }, 'わが家');
    const room = await waitRoom(mama.db, roomId, (r) => !!r.meta);
    const t = await regenerateFeedToken(mama.db, roomId);
    expect(t).not.toBe(room.meta.feedToken);
    const snap = await get(ref(mama.db, `v2/rooms/${roomId}/meta/feedToken`));
    expect(snap.val()).toBe(t);
  });

  it('addStamps / setMemo / deleteStamp', async () => {
    const mama = await newCreator();
    const user = { uid: mama.uid, name: 'ママ' };
    const roomId = await createRoom(mama.db, user, 'わが家');
    const room = await waitRoom(mama.db, roomId, (r) => Object.keys(r.stampTypes).length === 10);
    const types = Object.values(room.stampTypes).sort((a, b) => a.order - b.order);
    await addStamps(mama.db, roomId, TODAY, [types[0], types[1]], user);
    const r1 = await waitRoom(mama.db, roomId, (r) => Object.keys(r.stamps[TODAY] ?? {}).length === 2);
    const [id] = Object.keys(r1.stamps[TODAY]);
    expect(r1.stamps[TODAY][id].userName).toBe('ママ');
    await setMemo(mama.db, roomId, { kind: 'stamp', id, date: TODAY }, '病院');
    const r2 = await waitRoom(mama.db, roomId, (r) => r.stamps[TODAY]?.[id]?.memo === '病院');
    expect(r2.stamps[TODAY][id].memo).toBe('病院');
    await setMemo(mama.db, roomId, { kind: 'stamp', id, date: TODAY }, '');
    const r3 = await waitRoom(mama.db, roomId, (r) => r.stamps[TODAY]?.[id]?.memo === undefined);
    expect('memo' in r3.stamps[TODAY][id]).toBe(false);
    await deleteStamp(mama.db, roomId, TODAY, id);
    const r4 = await waitRoom(mama.db, roomId, (r) => Object.keys(r.stamps[TODAY] ?? {}).length === 1);
    expect(r4.stamps[TODAY][id]).toBeUndefined();
  });

  it('makeRepeat の後、その日の個別スタンプは消え repeats に1件できる', async () => {
    const mama = await newCreator();
    const user = { uid: mama.uid, name: 'ママ' };
    const roomId = await createRoom(mama.db, user, 'わが家');
    const room = await waitRoom(mama.db, roomId, (r) => Object.keys(r.stampTypes).length === 10);
    await addStamps(mama.db, roomId, TODAY, [Object.values(room.stampTypes)[0]], user);
    const r1 = await waitRoom(mama.db, roomId, (r) => Object.keys(r.stamps[TODAY] ?? {}).length === 1);
    const stampId = Object.keys(r1.stamps[TODAY])[0];
    await setMemo(mama.db, roomId, { kind: 'stamp', id: stampId, date: TODAY }, 'ピアノ');
    const repeatId = await makeRepeat(mama.db, roomId, TODAY, stampId, [3, 1, 1], '2026-12-31');
    const r2 = await waitRoom(mama.db, roomId, (r) => Object.keys(r.repeats).length === 1);
    expect(r2.stamps[TODAY]).toBeUndefined();
    const rep = r2.repeats[repeatId];
    expect(rep.start).toBe(TODAY);
    expect(rep.end).toBe('2026-12-31');
    expect(rep.weekdays).toEqual([1, 3]);
    expect(rep.memo).toBe('ピアノ');
    expect(rep.userName).toBe('ママ');
    // くり返しのメモとスキップ
    await setMemo(mama.db, roomId, { kind: 'repeat', id: repeatId, date: TODAY }, '全部');
    await skipRepeatDate(mama.db, roomId, repeatId, '2026-05-13');
    const r3 = await waitRoom(mama.db, roomId, (r) => r.repeats[repeatId]?.skips?.['2026-05-13'] === true);
    expect(r3.repeats[repeatId].memo).toBe('全部');
  });

  it('endRepeatFrom を開始日で呼ぶと、くり返しが消える', async () => {
    const mama = await newCreator();
    const user = { uid: mama.uid, name: 'ママ' };
    const roomId = await createRoom(mama.db, user, 'わが家');
    const room = await waitRoom(mama.db, roomId, (r) => Object.keys(r.stampTypes).length === 10);
    await addStamps(mama.db, roomId, TODAY, [Object.values(room.stampTypes)[0]], user);
    const r1 = await waitRoom(mama.db, roomId, (r) => Object.keys(r.stamps[TODAY] ?? {}).length === 1);
    const repeatId = await makeRepeat(mama.db, roomId, TODAY, Object.keys(r1.stamps[TODAY])[0], [0, 6]);
    await waitRoom(mama.db, roomId, (r) => Object.keys(r.repeats).length === 1);
    await endRepeatFrom(mama.db, roomId, repeatId, TODAY);
    const r2 = await waitRoom(mama.db, roomId, (r) => Object.keys(r.repeats).length === 0);
    expect(r2.repeats).toEqual({});
  });

  it('endRepeatFrom を開始日より後で呼ぶと、前日までの end になる', async () => {
    const mama = await newCreator();
    const user = { uid: mama.uid, name: 'ママ' };
    const roomId = await createRoom(mama.db, user, 'わが家');
    const room = await waitRoom(mama.db, roomId, (r) => Object.keys(r.stampTypes).length === 10);
    await addStamps(mama.db, roomId, TODAY, [Object.values(room.stampTypes)[0]], user);
    const r1 = await waitRoom(mama.db, roomId, (r) => Object.keys(r.stamps[TODAY] ?? {}).length === 1);
    const repeatId = await makeRepeat(mama.db, roomId, TODAY, Object.keys(r1.stamps[TODAY])[0], [1]);
    await waitRoom(mama.db, roomId, (r) => Object.keys(r.repeats).length === 1);
    await endRepeatFrom(mama.db, roomId, repeatId, '2026-06-01');
    const r2 = await waitRoom(mama.db, roomId, (r) => r.repeats[repeatId]?.end === '2026-05-31');
    expect(r2.repeats[repeatId].end).toBe('2026-05-31');
  });

  it('スタンプの種類の保存・並べ替え・削除と表示名の変更', async () => {
    const mama = await newCreator();
    const user = { uid: mama.uid, name: 'ママ' };
    const roomId = await createRoom(mama.db, user, 'わが家');
    await waitRoom(mama.db, roomId, (r) => Object.keys(r.stampTypes).length === 10);
    const newId = await saveStampType(mama.db, roomId, null, { emoji: '🎵', label: 'うた', order: 10 });
    const r1 = await waitRoom(mama.db, roomId, (r) => r.stampTypes[newId] !== undefined);
    expect(r1.stampTypes[newId].label).toBe('うた');
    await saveStampType(mama.db, roomId, newId, { emoji: '🎶', label: 'おんがく', order: 10 });
    const r2 = await waitRoom(mama.db, roomId, (r) => r.stampTypes[newId]?.label === 'おんがく');
    const ids = Object.keys(r2.stampTypes).reverse();
    await reorderStampTypes(mama.db, roomId, ids);
    const r3 = await waitRoom(mama.db, roomId, (r) => r.stampTypes[ids[0]]?.order === 0);
    ids.forEach((id, i) => expect(r3.stampTypes[id].order).toBe(i));
    await deleteStampType(mama.db, roomId, newId);
    await waitRoom(mama.db, roomId, (r) => r.stampTypes[newId] === undefined);
    await updateDisplayName(mama.db, roomId, mama.uid, 'おかあさん');
    await waitRoom(mama.db, roomId, (r) => r.members[mama.uid]?.name === 'おかあさん');
  });

  it('不正な名前・メモ・表示名は書き込む前にクライアントで弾く', async () => {
    const mama = await newCreator();
    const user = { uid: mama.uid, name: 'ママ' };
    const roomId = await createRoom(mama.db, user, 'わが家');
    const room = await waitRoom(mama.db, roomId, (r) => Object.keys(r.stampTypes).length === 10);
    await expect(saveStampType(mama.db, roomId, null, { emoji: '🎵', label: '', order: 11 })).rejects.toThrow('スタンプの名前');
    await expect(saveStampType(mama.db, roomId, null, { emoji: '🎵', label: 'ななもじいじょう', order: 11 })).rejects.toThrow('6文字');
    await expect(updateDisplayName(mama.db, roomId, mama.uid, '')).rejects.toThrow('表示名');
    await expect(updateDisplayName(mama.db, roomId, mama.uid, 'あ'.repeat(11))).rejects.toThrow('10文字');
    await expect(createRoom(mama.db, { uid: mama.uid, name: '' }, 'わが家')).rejects.toThrow('表示名');
    await addStamps(mama.db, roomId, TODAY, [Object.values(room.stampTypes)[0]], user);
    const r1 = await waitRoom(mama.db, roomId, (r) => Object.keys(r.stamps[TODAY] ?? {}).length === 1);
    const id = Object.keys(r1.stamps[TODAY])[0];
    await expect(
      setMemo(mama.db, roomId, { kind: 'stamp', id, date: TODAY }, 'あ'.repeat(21)),
    ).rejects.toThrow('20文字');
    // 何も書き込まれていない
    const snap = await get(ref(mama.db, `v2/rooms/${roomId}`));
    const v = snap.val();
    expect(v.members[mama.uid].name).toBe('ママ');
    expect(Object.keys(v.stampTypes)).toHaveLength(10);
    expect(v.stamps[TODAY][id].memo).toBeUndefined();
  });

  it('メンバーでない人の購読と、存在しないルームの購読は onError が呼ばれる', async () => {
    const mama = await newCreator();
    const roomId = await createRoom(mama.db, { uid: mama.uid, name: 'ママ' }, 'わが家');
    await waitRoom(mama.db, roomId);
    const outsider = await makeUser(false);
    // 規則上、存在しないルームも非メンバーも同じ permission-denied になる
    for (const id of [roomId, 'no-such-room']) {
      const err = await new Promise<Error>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('onError not called')), 8000);
        subscribeRoom(
          outsider.db,
          id,
          () => reject(new Error('cb must not be called')),
          (e) => {
            clearTimeout(timer);
            resolve(e);
          },
        );
      });
      expect(err.message).toMatch(/permission/i);
    }
  });
});
