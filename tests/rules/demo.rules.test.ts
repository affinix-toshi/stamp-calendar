import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

// 家族用のテストとは別のプロジェクトID（本番に届かないよう demo- で始める）
const PROJECT_ID = 'demo-stamp-calendar-demo';

let env: RulesTestEnvironment;

type Db = ReturnType<ReturnType<RulesTestEnvironment['unauthenticatedContext']>['database']>;

/** 匿名ログイン（見学の方）。firebase.sign_in_provider は anonymous */
function visitor(uid = 'visitor1'): Db {
  return env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).database();
}

function loggedOut(): Db {
  return env.unauthenticatedContext().database();
}

const stampTypes = { t1: { emoji: '🏠', label: '在宅', order: 0 } };

function stamp(uid: string, extra: Record<string, unknown> = {}) {
  return { emoji: '🏠', label: '在宅', uid, userName: '見学の方', ts: 1700000000000, ...extra };
}

function repeat(uid: string, extra: Record<string, unknown> = {}) {
  return { ...stamp(uid), weekdays: [2], start: '2026-12-01', ...extra };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { rules: readFileSync(resolve(__dirname, '../../database.rules.demo.json'), 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref().update({
      'v2/rooms/DEMO/meta': {
        name: '見本の家族',
        createdBy: 'demo-papa',
        createdAt: 1,
        inviteCode: 'D'.repeat(32),
        feedToken: 'd'.repeat(32),
      },
      'v2/rooms/DEMO/members/demo-papa': { name: 'パパ', joinedAt: 1 },
      'v2/rooms/DEMO/stampTypes': stampTypes,
      'v2/rooms/DEMO/stamps/2026-12-01/seed1': stamp('demo-papa'),
      'v2/rooms/DEMO/repeats/rseed': repeat('demo-papa'),
      'v2/rooms/OTHER/meta/name': 'よその家',
      'v2/users/demo-papa/rooms/DEMO': true,
      'v2/config/creators/x': true,
      'rooms/ABCDE/stamps/2026-12-01/x1': { emoji: '🏠', label: '在宅', user: 'ママ' },
    });
  });
});

describe('見本用ルール: 読み取り', () => {
  it('匿名ログインで DEMO を読める', async () => {
    await assertSucceeds(visitor().ref('v2/rooms/DEMO').once('value'));
  });
  it('ログインしていなければ読めない', async () => {
    await assertFails(loggedOut().ref('v2/rooms/DEMO').once('value'));
  });
});

describe('見本用ルール: DEMO の外は全部だめ', () => {
  const cases: [string, (d: Db) => Promise<unknown>][] = [
    ['別のルームの読み取り', (d) => d.ref('v2/rooms/OTHER').once('value')],
    ['別のルームへの書き込み', (d) => d.ref('v2/rooms/OTHER/stamps/2026-12-01/a').set(stamp('visitor1'))],
    ['別のルームに自分をメンバー追加', (d) => d.ref('v2/rooms/OTHER/members/visitor1').set({ name: 'x', joinedAt: 1 })],
    ['v2/users の読み取り', (d) => d.ref('v2/users/demo-papa').once('value')],
    ['v2/users への書き込み', (d) => d.ref('v2/users/visitor1/rooms/DEMO').set(true)],
    ['v2/config の読み取り', (d) => d.ref('v2/config').once('value')],
    ['v2/config への書き込み', (d) => d.ref('v2/config/creators/visitor1').set(true)],
    ['旧 rooms/ の読み取り', (d) => d.ref('rooms/ABCDE').once('value')],
    [
      '旧 rooms/ への書き込み',
      (d) => d.ref('rooms/ABCDE/stamps/2026-12-01/y').set({ emoji: '🏠', label: '在宅', user: 'x' }),
    ],
    ['ルートの読み取り', (d) => d.ref().once('value')],
    ['ルートへの書き込み', (d) => d.ref().set({ hello: 1 })],
    ['v2/rooms 全体の書き込み', (d) => d.ref('v2/rooms').set(null)],
    ['DEMO 丸ごとの置き換え', (d) => d.ref('v2/rooms/DEMO').set(null)],
    ['小文字の demo ルーム', (d) => d.ref('v2/rooms/demo/stamps/2026-12-01/a').set(stamp('visitor1'))],
  ];
  it.each(cases)('匿名ログインでは %s ができない', async (_name, run) => {
    await assertFails(run(visitor()));
  });
});

describe('見本用ルール: メンバー', () => {
  it('自分を「見学の方」として加えられる', async () => {
    await assertSucceeds(
      visitor().ref('v2/rooms/DEMO/members/visitor1').set({ name: '見学の方', joinedAt: 1700000000000 }),
    );
  });
  it('他人のメンバー欄は書けない', async () => {
    await assertFails(
      visitor().ref('v2/rooms/DEMO/members/demo-papa').set({ name: 'のっとり', joinedAt: 1 }),
    );
  });
  it('名前が21文字以上・空はだめ', async () => {
    await assertFails(visitor().ref('v2/rooms/DEMO/members/visitor1').set({ name: 'あ'.repeat(21), joinedAt: 1 }));
    await assertFails(visitor().ref('v2/rooms/DEMO/members/visitor1').set({ name: '', joinedAt: 1 }));
  });
});

describe('見本用ルール: スタンプ', () => {
  it('メンバーでなくても、匿名ログインで DEMO のスタンプに書ける', async () => {
    await assertSucceeds(visitor().ref('v2/rooms/DEMO/stamps/2026-12-02/a1').set(stamp('visitor1')));
  });
  it('他人の uid では作れない', async () => {
    await assertFails(visitor().ref('v2/rooms/DEMO/stamps/2026-12-02/a1').set(stamp('demo-papa')));
  });
  it('他人のスタンプは消せない・書き換えられない', async () => {
    await assertFails(visitor().ref('v2/rooms/DEMO/stamps/2026-12-01/seed1').remove());
    await assertFails(visitor().ref('v2/rooms/DEMO/stamps/2026-12-01/seed1/memo').set('のっとり'));
  });
  it('自分のスタンプは消せる', async () => {
    await visitor().ref('v2/rooms/DEMO/stamps/2026-12-02/a1').set(stamp('visitor1'));
    await assertSucceeds(visitor().ref('v2/rooms/DEMO/stamps/2026-12-02/a1').remove());
  });
  it('メモは40文字まで（21文字は通る、41文字ははじく）', async () => {
    await assertSucceeds(
      visitor().ref('v2/rooms/DEMO/stamps/2026-12-02/a1').set(stamp('visitor1', { memo: 'あ'.repeat(21) })),
    );
    await assertSucceeds(
      visitor().ref('v2/rooms/DEMO/stamps/2026-12-02/a2').set(stamp('visitor1', { memo: 'あ'.repeat(40) })),
    );
    await assertFails(
      visitor().ref('v2/rooms/DEMO/stamps/2026-12-02/a3').set(stamp('visitor1', { memo: 'あ'.repeat(41) })),
    );
  });
  it('ラベルは1〜12文字、絵文字は1〜16', async () => {
    await assertFails(visitor().ref('v2/rooms/DEMO/stamps/2026-12-02/b1').set(stamp('visitor1', { label: '' })));
    await assertFails(
      visitor().ref('v2/rooms/DEMO/stamps/2026-12-02/b2').set(stamp('visitor1', { label: 'あ'.repeat(13) })),
    );
    await assertFails(
      visitor().ref('v2/rooms/DEMO/stamps/2026-12-02/b3').set(stamp('visitor1', { emoji: 'a'.repeat(17) })),
    );
  });
  it('日付キーの形がおかしいとだめ', async () => {
    await assertFails(visitor().ref('v2/rooms/DEMO/stamps/2026-12-2/a1').set(stamp('visitor1')));
    await assertFails(visitor().ref('v2/rooms/DEMO/stamps/garbage/a1').set(stamp('visitor1')));
  });
  it('ログインしていなければ書けない', async () => {
    await assertFails(loggedOut().ref('v2/rooms/DEMO/stamps/2026-12-02/a1').set(stamp('visitor1')));
  });
});

describe('見本用ルール: くり返し・スタンプの種類', () => {
  it('くり返しを自分の uid で作れる。曜日は0〜6', async () => {
    await assertSucceeds(visitor().ref('v2/rooms/DEMO/repeats/r1').set(repeat('visitor1')));
    await assertFails(visitor().ref('v2/rooms/DEMO/repeats/r2').set(repeat('visitor1', { weekdays: [7] })));
  });
  it('他人のくり返しは消せない', async () => {
    await assertFails(visitor().ref('v2/rooms/DEMO/repeats/rseed').remove());
  });
  it('スタンプの種類を追加できる。ラベル13文字はだめ', async () => {
    await assertSucceeds(
      visitor().ref('v2/rooms/DEMO/stampTypes/t9').set({ emoji: '🍙', label: 'おにぎり', order: 9 }),
    );
    await assertFails(
      visitor().ref('v2/rooms/DEMO/stampTypes/t8').set({ emoji: '🍙', label: 'あ'.repeat(13), order: 9 }),
    );
  });
});

describe('見本用ルール: ルームの情報（meta）', () => {
  it('匿名ログインでは書き換えられない（URLを作り直せない）', async () => {
    await assertFails(visitor().ref('v2/rooms/DEMO/meta/inviteCode').set('X'.repeat(32)));
  });
});
