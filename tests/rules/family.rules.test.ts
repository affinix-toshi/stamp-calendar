import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

// 本番には絶対に届かないよう、demo- で始まるプロジェクトIDを使う
const PROJECT_ID = 'demo-stamp-calendar';

const ROOM = 'room1';
const CODE_A = 'A'.repeat(32);
const CODE_B = 'B'.repeat(32);
const FEED = 'f'.repeat(32);

const ALICE = { uid: 'alice', email: 'alice.mama@example.com' }; // 許可リストにいる
const BOB = { uid: 'bob', email: 'bob@example.com' }; // 許可リストにいない（招待で参加する）
const CAROL = { uid: 'carol', email: 'carol@example.com' }; // 部外者
const DAVE = { uid: 'dave', email: 'dave@example.com' }; // 許可リストにいるが、ALICE のルームとは無関係

let env: RulesTestEnvironment;

function db(user: { uid: string; email: string }, emailVerified = true) {
  return env
    .authenticatedContext(user.uid, { email: user.email, email_verified: emailVerified })
    .database();
}

function anonDb() {
  return env.unauthenticatedContext().database();
}

function creatorKey(email: string) {
  return email.split('.').join(',');
}

const stampTypes = {
  t1: { emoji: '🏠', label: '在宅', order: 0 },
  t2: { emoji: '😴', label: '休み', order: 1 },
};

/** createRoom と同じ、1回のまとめ書き */
function createRoomUpdate(uid: string, roomId = ROOM, extra: Record<string, unknown> = {}) {
  return {
    [`v2/rooms/${roomId}/meta`]: {
      name: 'わが家',
      createdBy: uid,
      createdAt: 1700000000000,
      inviteCode: CODE_A,
      feedToken: FEED,
    },
    [`v2/rooms/${roomId}/members/${uid}`]: { name: 'ママ', joinedAt: 1700000000000 },
    [`v2/rooms/${roomId}/stampTypes`]: stampTypes,
    [`v2/users/${uid}/rooms/${roomId}`]: true,
    ...extra,
  };
}

/** joinRoom と同じ、1回のまとめ書き */
function joinUpdate(uid: string, invite: unknown, name = 'パパ') {
  return {
    [`v2/rooms/${ROOM}/members/${uid}`]: { name, joinedAt: 1700000001000, invite },
    [`v2/users/${uid}/rooms/${ROOM}`]: true,
  };
}

function stamp(uid: string, extra: Record<string, unknown> = {}) {
  return { emoji: '🏠', label: '在宅', uid, userName: 'ママ', ts: 1700000002000, ...extra };
}

function repeat(uid: string, extra: Record<string, unknown> = {}) {
  return {
    ...stamp(uid),
    weekdays: [1, 3, 5],
    start: '2026-12-01',
    ...extra,
  };
}

/** ルール無しで、ALICE が作ったルームに BOB が参加済みの状態を作る */
async function seedRoomWithBob() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref().update({
      ...createRoomUpdate(ALICE.uid),
      [`v2/rooms/${ROOM}/members/${BOB.uid}`]: {
        name: 'パパ',
        joinedAt: 1700000001000,
        invite: CODE_A,
      },
      [`v2/users/${BOB.uid}/rooms/${ROOM}`]: true,
      [`v2/rooms/${ROOM}/stamps/2026-12-01/s1`]: stamp(ALICE.uid),
      [`v2/rooms/${ROOM}/repeats/r1`]: repeat(ALICE.uid),
    });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { rules: readFileSync(resolve(__dirname, '../../database.rules.json'), 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx
      .database()
      .ref(`v2/config/creators/${creatorKey(ALICE.email)}`)
      .set(true);
    await ctx.database().ref('v2/health').set({ ok: true });
  });
});

describe('旧データ rooms/（Task 15 までは今までどおり）', () => {
  it('ログインしていなくても rooms/ABCDE/stamps に書ける', async () => {
    await assertSucceeds(
      anonDb().ref('rooms/ABCDE/stamps/2026-12-01/x1').set({ emoji: '🏠', label: '在宅', user: 'ママ' }),
    );
  });

  it('ログインしていなくても rooms/ABCDE を読める', async () => {
    await assertSucceeds(anonDb().ref('rooms/ABCDE').once('value'));
  });

  it('ログインしていなくても rooms/ABCDE/stamps の中を読める', async () => {
    await assertSucceeds(anonDb().ref('rooms/ABCDE/stamps/2026-12-01').once('value'));
  });

  it('rooms 全体（ルームの一覧）は読めない（本番と同じ、ルームごとの許可）', async () => {
    await assertFails(anonDb().ref('rooms').once('value'));
  });

  it('rooms 全体をまとめて消すことはできない', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('rooms/ABCDE/stamps/2026-12-01/x1').set({ emoji: '🏠', label: '在宅', user: 'ママ' });
    });
    await assertFails(anonDb().ref('rooms').set(null));
  });
});

describe('v2/health と v2/config', () => {
  it('v2/health は誰も読めない', async () => {
    await assertFails(anonDb().ref('v2/health').once('value'));
    await assertFails(db(ALICE).ref('v2/health').once('value'));
  });

  it('v2/config は誰も読めない', async () => {
    await assertFails(anonDb().ref('v2/config').once('value'));
    await assertFails(db(ALICE).ref('v2/config').once('value'));
    await assertFails(db(ALICE).ref(`v2/config/creators/${creatorKey(ALICE.email)}`).once('value'));
  });

  it('v2/config と v2/health には誰も書けない', async () => {
    await assertFails(db(BOB).ref(`v2/config/creators/${creatorKey(BOB.email)}`).set(true));
    await assertFails(db(ALICE).ref('v2/health').set({ ok: false }));
  });
});

describe('ルームの作成', () => {
  it('許可リストの人は1回のまとめ書きでルームを作れる', async () => {
    await assertSucceeds(db(ALICE).ref().update(createRoomUpdate(ALICE.uid)));
    await assertSucceeds(db(ALICE).ref(`v2/rooms/${ROOM}`).once('value'));
  });

  it('許可リストにない人は作れない', async () => {
    await assertFails(db(BOB).ref().update(createRoomUpdate(BOB.uid)));
  });

  it('メール未確認の人は作れない', async () => {
    await assertFails(db(ALICE, false).ref().update(createRoomUpdate(ALICE.uid)));
  });

  it('ログインしていない人は作れない', async () => {
    await assertFails(anonDb().ref().update(createRoomUpdate(ALICE.uid)));
  });

  it('createdBy が自分以外なら作れない', async () => {
    const u = createRoomUpdate(ALICE.uid);
    (u[`v2/rooms/${ROOM}/meta`] as Record<string, unknown>).createdBy = BOB.uid;
    await assertFails(db(ALICE).ref().update(u));
  });

  it('許可リストの人でも、他人のルームを作り直して乗っ取ることはできない', async () => {
    await seedRoomWithBob();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref(`v2/config/creators/${creatorKey(DAVE.email)}`).set(true);
    });
    await assertFails(db(DAVE).ref().update(createRoomUpdate(DAVE.uid)));
  });

  it('作成者でも、作り直しで名前を変えることはできない', async () => {
    await seedRoomWithBob();
    const u = createRoomUpdate(ALICE.uid);
    (u[`v2/rooms/${ROOM}/meta`] as Record<string, unknown>).name = 'べつの家';
    await assertFails(db(ALICE).ref().update(u));
  });

  it('許可リストにない人は、meta を書かずに stampTypes だけ書くこともできない', async () => {
    await assertFails(db(BOB).ref(`v2/rooms/room9/stampTypes`).set(stampTypes));
  });

  it('招待コードが32文字の英数字でないと作れない', async () => {
    const u = createRoomUpdate(ALICE.uid);
    (u[`v2/rooms/${ROOM}/meta`] as Record<string, unknown>).inviteCode = 'short';
    await assertFails(db(ALICE).ref().update(u));
  });
});

describe('読み取り', () => {
  beforeEach(seedRoomWithBob);

  it('メンバーでない人は stamps を読めない', async () => {
    await assertFails(db(CAROL).ref(`v2/rooms/${ROOM}/stamps`).once('value'));
    await assertFails(anonDb().ref(`v2/rooms/${ROOM}/stamps`).once('value'));
  });

  it('メンバーでない人は meta（招待コード）を読めない', async () => {
    await assertFails(db(CAROL).ref(`v2/rooms/${ROOM}/meta`).once('value'));
    await assertFails(db(CAROL).ref(`v2/rooms/${ROOM}/meta/inviteCode`).once('value'));
  });

  it('メンバーでない人は stampTypes・repeats・members も読めない', async () => {
    await assertFails(db(CAROL).ref(`v2/rooms/${ROOM}/stampTypes`).once('value'));
    await assertFails(db(CAROL).ref(`v2/rooms/${ROOM}/repeats`).once('value'));
    await assertFails(db(CAROL).ref(`v2/rooms/${ROOM}/members`).once('value'));
  });

  it('メンバーは meta・stampTypes・stamps・repeats を読める', async () => {
    for (const part of ['meta', 'stampTypes', 'stamps', 'repeats', 'members']) {
      await assertSucceeds(db(BOB).ref(`v2/rooms/${ROOM}/${part}`).once('value'));
    }
  });

  it('ルームの一覧（v2/rooms 全体）は誰も読めない', async () => {
    await assertFails(db(ALICE).ref('v2/rooms').once('value'));
  });
});

describe('参加（招待コード）', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref().update(createRoomUpdate(ALICE.uid));
    });
  });

  it('正しい招待コードを付ければ1回のまとめ書きでメンバーになれる', async () => {
    await assertSucceeds(db(BOB).ref().update(joinUpdate(BOB.uid, CODE_A)));
    await assertSucceeds(db(BOB).ref(`v2/rooms/${ROOM}/stamps`).once('value'));
  });

  it('間違った招待コードでは参加できない', async () => {
    await assertFails(db(BOB).ref().update(joinUpdate(BOB.uid, CODE_B)));
  });

  it('招待コード無しでは参加できない', async () => {
    await assertFails(
      db(BOB)
        .ref()
        .update({
          [`v2/rooms/${ROOM}/members/${BOB.uid}`]: { name: 'パパ', joinedAt: 1700000001000 },
        }),
    );
  });

  it('古い招待コードでは参加できない（作り直したあと）', async () => {
    await assertSucceeds(db(ALICE).ref(`v2/rooms/${ROOM}/meta/inviteCode`).set(CODE_B));
    await assertFails(db(BOB).ref().update(joinUpdate(BOB.uid, CODE_A)));
    await assertSucceeds(db(BOB).ref().update(joinUpdate(BOB.uid, CODE_B)));
  });

  it('他の人の分のメンバー登録はできない', async () => {
    await assertFails(
      db(BOB)
        .ref(`v2/rooms/${ROOM}/members/${CAROL.uid}`)
        .set({ name: 'だれか', joinedAt: 1700000001000, invite: CODE_A }),
    );
  });

  it('存在しないルームには招待コード無しで入れない', async () => {
    await assertFails(
      db(BOB)
        .ref(`v2/rooms/nope/members/${BOB.uid}`)
        .set({ name: 'パパ', joinedAt: 1700000001000 }),
    );
  });

  // ルールは最後の砦。正確な文字数（Array.from）はアプリが見るので、ルールは UTF-16 で2倍まで許す
  it('表示名が21文字なら参加できない', async () => {
    await assertFails(db(BOB).ref().update(joinUpdate(BOB.uid, CODE_A, 'a'.repeat(21))));
  });
});

describe('メンバー情報の変更', () => {
  beforeEach(seedRoomWithBob);

  it('自分の表示名は変えられる', async () => {
    await assertSucceeds(db(BOB).ref(`v2/rooms/${ROOM}/members/${BOB.uid}/name`).set('おとうさん'));
  });

  it('他の人の表示名は変えられない', async () => {
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/members/${ALICE.uid}/name`).set('へんな名前'));
  });

  it('自分の invite と joinedAt は変えられない', async () => {
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/members/${BOB.uid}/invite`).set(CODE_B));
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/members/${BOB.uid}/invite`).remove());
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/members/${BOB.uid}/joinedAt`).set(1));
  });

  it('作成者も自分のメンバー情報に invite をあとから足せない', async () => {
    await assertFails(db(ALICE).ref(`v2/rooms/${ROOM}/members/${ALICE.uid}/invite`).set(CODE_A));
  });

  it('メンバー情報に余計な項目は足せない', async () => {
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/members/${BOB.uid}/admin`).set(true));
  });

  it('表示名を空や21文字にはできない', async () => {
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/members/${BOB.uid}/name`).set(''));
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/members/${BOB.uid}/name`).set('a'.repeat(21)));
  });
});

describe('meta の変更', () => {
  beforeEach(seedRoomWithBob);

  it('メンバーは招待コードとフィード用の合言葉を作り直せる', async () => {
    await assertSucceeds(db(BOB).ref(`v2/rooms/${ROOM}/meta/inviteCode`).set(CODE_B));
    await assertSucceeds(db(BOB).ref(`v2/rooms/${ROOM}/meta/feedToken`).set('g'.repeat(32)));
  });

  it('メンバーでない人は招待コードを書き換えられない', async () => {
    await assertFails(db(CAROL).ref(`v2/rooms/${ROOM}/meta/inviteCode`).set(CODE_B));
  });

  it('招待コードは32文字の英数字でないとだめ', async () => {
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/meta/inviteCode`).set('A'.repeat(31)));
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/meta/feedToken`).set('-'.repeat(32)));
  });

  it('name・createdBy・createdAt はあとから変えられない', async () => {
    await assertFails(db(ALICE).ref(`v2/rooms/${ROOM}/meta/name`).set('べつの家'));
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/meta/createdBy`).set(BOB.uid));
    await assertFails(db(ALICE).ref(`v2/rooms/${ROOM}/meta/createdAt`).set(1));
  });

  it('meta は消せない', async () => {
    await assertFails(db(ALICE).ref(`v2/rooms/${ROOM}/meta`).remove());
    await assertFails(db(ALICE).ref(`v2/rooms/${ROOM}/meta/inviteCode`).remove());
  });
});

describe('stampTypes', () => {
  beforeEach(seedRoomWithBob);

  it('メンバーは追加・変更・削除できる', async () => {
    const ref = db(BOB).ref(`v2/rooms/${ROOM}/stampTypes`);
    await assertSucceeds(ref.child('t3').set({ emoji: '🎹', label: 'ピアノ', order: 2 }));
    await assertSucceeds(ref.child('t1/label').set('おうち'));
    await assertSucceeds(ref.child('t2').remove());
  });

  it('メンバーでない人は追加できない', async () => {
    await assertFails(
      db(CAROL).ref(`v2/rooms/${ROOM}/stampTypes/t3`).set({ emoji: '🎹', label: 'ピアノ', order: 2 }),
    );
  });

  it('13文字のスタンプ名ははじかれる', async () => {
    await assertFails(
      db(BOB).ref(`v2/rooms/${ROOM}/stampTypes/t3`).set({ emoji: '🎹', label: 'a'.repeat(13), order: 2 }),
    );
  });

  it('4バイトの絵文字6つのスタンプ名は通る', async () => {
    await assertSucceeds(
      db(BOB).ref(`v2/rooms/${ROOM}/stampTypes/t3`).set({ emoji: '🍷', label: '🍷'.repeat(6), order: 2 }),
    );
  });

  it('空のスタンプ名ははじかれる', async () => {
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/stampTypes/t3`).set({ emoji: '🎹', label: '', order: 2 }));
  });
});

describe('stamps', () => {
  beforeEach(seedRoomWithBob);

  it('自分のスタンプは押せる', async () => {
    await assertSucceeds(db(BOB).ref(`v2/rooms/${ROOM}/stamps/2026-12-02/s2`).set(stamp(BOB.uid)));
  });

  it('他人の名前（uid）ではスタンプを押せない', async () => {
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/stamps/2026-12-02/s2`).set(stamp(ALICE.uid)));
  });

  it('メンバーでない人はスタンプを押せない', async () => {
    await assertFails(db(CAROL).ref(`v2/rooms/${ROOM}/stamps/2026-12-02/s2`).set(stamp(CAROL.uid)));
  });

  it('他人のスタンプは消せない', async () => {
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/stamps/2026-12-01/s1`).remove());
  });

  it('他人のスタンプは書き換えられない', async () => {
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/stamps/2026-12-01/s1/memo`).set('いたずら'));
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/stamps/2026-12-01/s1`).set(stamp(BOB.uid)));
  });

  it('自分のスタンプは消せる', async () => {
    await assertSucceeds(db(ALICE).ref(`v2/rooms/${ROOM}/stamps/2026-12-01/s1`).remove());
  });

  it('自分のスタンプのメモは変えられる', async () => {
    await assertSucceeds(db(ALICE).ref(`v2/rooms/${ROOM}/stamps/2026-12-01/s1/memo`).set('17時まで'));
  });

  it('自分のスタンプの uid を他人に変えることはできない', async () => {
    await assertFails(db(ALICE).ref(`v2/rooms/${ROOM}/stamps/2026-12-01/s1/uid`).set(BOB.uid));
  });

  it('41文字のメモははじかれる、20文字は通る', async () => {
    const ref = db(BOB).ref(`v2/rooms/${ROOM}/stamps/2026-12-02`);
    await assertFails(ref.child('s2').set(stamp(BOB.uid, { memo: 'a'.repeat(41) })));
    await assertSucceeds(ref.child('s3').set(stamp(BOB.uid, { memo: 'あ'.repeat(20) })));
  });

  it('4バイトの絵文字20個のメモは通る', async () => {
    await assertSucceeds(
      db(BOB).ref(`v2/rooms/${ROOM}/stamps/2026-12-02/s2`).set(stamp(BOB.uid, { memo: '🍷'.repeat(20) })),
    );
  });

  it('13文字のスタンプ名ははじかれる、4バイトの絵文字6つは通る', async () => {
    const ref = db(BOB).ref(`v2/rooms/${ROOM}/stamps/2026-12-02`);
    await assertFails(ref.child('s2').set(stamp(BOB.uid, { label: 'a'.repeat(13) })));
    await assertSucceeds(ref.child('s3').set(stamp(BOB.uid, { label: '🍷'.repeat(6) })));
  });

  it('日付が YYYY-MM-DD の形でないとはじかれる', async () => {
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/stamps/2026-1-2/s2`).set(stamp(BOB.uid)));
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/stamps/hello/s2`).set(stamp(BOB.uid)));
  });

  it('足りない項目や余計な項目があるとはじかれる', async () => {
    const { ts: _ts, ...noTs } = stamp(BOB.uid);
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/stamps/2026-12-02/s2`).set(noTs));
    await assertFails(
      db(BOB).ref(`v2/rooms/${ROOM}/stamps/2026-12-02/s2`).set(stamp(BOB.uid, { color: 'red' })),
    );
  });
});

describe('repeats', () => {
  beforeEach(seedRoomWithBob);

  it('自分のくり返しは作れる', async () => {
    await assertSucceeds(db(BOB).ref(`v2/rooms/${ROOM}/repeats/r2`).set(repeat(BOB.uid, { end: '2027-03-31' })));
  });

  it('他人の uid ではくり返しを作れない', async () => {
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/repeats/r2`).set(repeat(ALICE.uid)));
  });

  it('他人のくり返しは消せない・変えられない', async () => {
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/repeats/r1`).remove());
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/repeats/r1/skips/2026-12-02`).set(true));
  });

  it('自分のくり返しは休みの日を足せるし、消せる', async () => {
    await assertSucceeds(db(ALICE).ref(`v2/rooms/${ROOM}/repeats/r1/skips/2026-12-02`).set(true));
    await assertSucceeds(db(ALICE).ref(`v2/rooms/${ROOM}/repeats/r1`).remove());
  });

  it('41文字のメモははじかれる', async () => {
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/repeats/r2`).set(repeat(BOB.uid, { memo: 'a'.repeat(41) })));
  });

  it('曜日は 0〜6 の数字だけ', async () => {
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/repeats/r2`).set(repeat(BOB.uid, { weekdays: [7] })));
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/repeats/r2`).set(repeat(BOB.uid, { weekdays: ['1'] })));
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/repeats/r2`).set(repeat(BOB.uid, { weekdays: [1.5] })));
  });

  it('開始日・終了日・休みの日は YYYY-MM-DD の形', async () => {
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/repeats/r2`).set(repeat(BOB.uid, { start: '12/1' })));
    await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/repeats/r2`).set(repeat(BOB.uid, { end: 'someday' })));
    await assertFails(
      db(BOB).ref(`v2/rooms/${ROOM}/repeats/r2`).set(repeat(BOB.uid, { skips: { tomorrow: true } })),
    );
  });

  it('メンバーでない人はくり返しを作れない', async () => {
    await assertFails(db(CAROL).ref(`v2/rooms/${ROOM}/repeats/r2`).set(repeat(CAROL.uid)));
  });
});

describe('v2/users/{uid}', () => {
  beforeEach(seedRoomWithBob);

  it('本人は読める、他人は読めない', async () => {
    await assertSucceeds(db(BOB).ref(`v2/users/${BOB.uid}`).once('value'));
    await assertFails(db(ALICE).ref(`v2/users/${BOB.uid}`).once('value'));
    await assertFails(anonDb().ref(`v2/users/${BOB.uid}`).once('value'));
  });

  it('本人は書ける、他人は書けない', async () => {
    await assertSucceeds(db(BOB).ref(`v2/users/${BOB.uid}/rooms/room2`).set(true));
    await assertFails(db(ALICE).ref(`v2/users/${BOB.uid}/rooms/room2`).set(true));
  });

  it('v2/users 全体は読めない', async () => {
    await assertFails(db(ALICE).ref('v2/users').once('value'));
  });
});

describe('まとめて上書き・すき間をふさぐ（Fix 2）', () => {
  it('作成者のメンバー登録に invite を付けてルームを作ることはできない', async () => {
    const u = createRoomUpdate(ALICE.uid);
    (u[`v2/rooms/${ROOM}/members/${ALICE.uid}`] as Record<string, unknown>).invite = CODE_A;
    await assertFails(db(ALICE).ref().update(u));
  });

  it('作成者でない人が空のルームに meta/name だけ書くことはできない', async () => {
    await assertFails(db(BOB).ref('v2/rooms/empty/meta/name').set('のっとり'));
  });

  it('meta のないルームでは、どんな文字列を invite にしてもメンバーになれない', async () => {
    await assertFails(
      db(CAROL).ref(`v2/rooms/empty/members/${CAROL.uid}`).set({ name: 'だれか', joinedAt: 1, invite: 'anything' }),
    );
  });

  describe('既存のルームで', () => {
    beforeEach(seedRoomWithBob);

    it('ログインしていない人は meta を読めない', async () => {
      await assertFails(anonDb().ref(`v2/rooms/${ROOM}/meta`).once('value'));
    });

    it('メンバーでも日付ごと stamps/2026-12-01 を消すことはできない', async () => {
      await assertFails(db(ALICE).ref(`v2/rooms/${ROOM}/stamps/2026-12-01`).remove());
      await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/stamps/2026-12-01`).remove());
    });

    it('stampTypes を文字列で上書きすることはできない', async () => {
      await assertFails(db(BOB).ref(`v2/rooms/${ROOM}/stampTypes`).set('x'));
    });

    it('stampTypes をまるごと消すことは今までどおりできる', async () => {
      await assertSucceeds(db(BOB).ref(`v2/rooms/${ROOM}/stampTypes`).set(null));
    });

    it('くり返しの skips を文字列などで上書きすることはできない', async () => {
      await assertFails(db(ALICE).ref(`v2/rooms/${ROOM}/repeats/r1/skips`).set(true));
    });

    it('v2/users/{uid} とその rooms を文字列で上書きすることはできない', async () => {
      await assertFails(db(BOB).ref(`v2/users/${BOB.uid}`).set('x'));
      await assertFails(db(BOB).ref(`v2/users/${BOB.uid}/rooms`).set('x'));
    });

    it('【認めている動き】メンバーは自分の uid のまま、表示名と違う userName でスタンプを押せる', async () => {
      await assertSucceeds(
        db(BOB).ref(`v2/rooms/${ROOM}/stamps/2026-12-03/s9`).set(stamp(BOB.uid, { userName: 'べつの名前' })),
      );
    });
  });
});
