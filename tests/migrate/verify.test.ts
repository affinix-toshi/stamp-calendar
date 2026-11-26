import { describe, it, expect } from 'vitest';
import { compareRooms, formatVerify } from '../../scripts/migrate/verify';
import { planMigration } from '../../scripts/migrate/migrate';
import { oldRoomFixture, MAP, MEMBERS } from './fixtures';

type V2Stamps = Record<string, Record<string, Record<string, unknown>>>;

function migrated(): V2Stamps {
  const p = planMigration({ old: oldRoomFixture(), map: MAP, members: MEMBERS, existing: null });
  const out: V2Stamps = {};
  for (const [path, v] of Object.entries(p.writes)) {
    const [, date, id] = path.split('/');
    (out[date] ??= {})[id] = { ...v };
  }
  return out;
}

describe('compareRooms', () => {
  it('すべて写せていれば OK', () => {
    const r = compareRooms(oldRoomFixture(), migrated());
    expect(r.ok).toBe(true);
    expect(formatVerify(r).join('\n')).toContain('OK');
  });

  it('新しい側で押したスタンプが増えていても OK（別に数えて出す）', () => {
    const v2 = migrated();
    v2['2026-04-01'].v2only = { emoji: '🌙', label: 'ねる', uid: 'uidMama', userName: 'ゆかり', ts: 1 };
    v2['2026-12-01'] = { v2new: { emoji: '🌙', label: 'ねる', uid: 'uidMama', userName: 'ゆかり', ts: 2 } };
    const r = compareRooms(oldRoomFixture(), v2);
    expect(r.ok).toBe(true);
    expect(r.extra).toBe(2);
  });

  it('メモが付いていても、絵文字・名前・ts が同じなら OK', () => {
    const v2 = migrated();
    v2['2026-04-01']['-Np001'].memo = 'あとで書いた';
    expect(compareRooms(oldRoomFixture(), v2).ok).toBe(true);
  });

  it('1件でも足りなければ NG', () => {
    const v2 = migrated();
    delete v2['2026-04-15'];
    const r = compareRooms(oldRoomFixture(), v2);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual([{ date: '2026-04-15', id: '-Np003' }]);
    expect(formatVerify(r).join('\n')).toContain('NG');
  });

  it('絵文字・名前・ts が変わっていれば NG', () => {
    for (const field of ['emoji', 'label', 'ts'] as const) {
      const v2 = migrated();
      v2['2026-05-02']['-Np004'][field] = field === 'ts' ? 999 : 'ちがう';
      const r = compareRooms(oldRoomFixture(), v2);
      expect(r.ok).toBe(false);
      expect(r.altered).toEqual([{ date: '2026-05-02', id: '-Np004', fields: [field] }]);
    }
  });

  it('新しい側が空なら NG、旧ルームがなければ NG', () => {
    expect(compareRooms(oldRoomFixture(), null).ok).toBe(false);
    expect(compareRooms(null, migrated()).ok).toBe(false);
  });

  it('対応表を渡すと uid も比べ、ちがえば NG', () => {
    expect(compareRooms(oldRoomFixture(), migrated(), MAP).ok).toBe(true);
    const v2 = migrated();
    v2['2026-04-15']['-Np003'].uid = 'uidMama';
    const r = compareRooms(oldRoomFixture(), v2, MAP);
    expect(r.ok).toBe(false);
    expect(r.altered).toEqual([{ date: '2026-04-15', id: '-Np003', fields: ['uid'] }]);
  });

  it('旧ルームに写せるスタンプが1件もなければ NG と案内を出す', () => {
    const r = compareRooms({ users: { a: { name: 'x' } } }, migrated(), MAP);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('旧ルームにスタンプが見つかりません。ルームコードを確かめてください');
    expect(formatVerify(r).join('\n')).toContain('NG');
  });

  it('日付ごとの件数を出す', () => {
    const r = compareRooms(oldRoomFixture(), migrated());
    expect(r.perDate).toEqual([
      { date: '2026-04-01', old: 2, found: 2, extra: 0 },
      { date: '2026-04-15', old: 1, found: 1, extra: 0 },
      { date: '2026-05-02', old: 1, found: 1, extra: 0 },
    ]);
  });

  it('旧データで飛ばしたもの（形がおかしいもの）は足りなくても NG にせず、一覧に出す', () => {
    const old = oldRoomFixture();
    old.stamps!['2026-04-20'] = { '-NoEmoji': { label: 'x', userId: 'oldA1', userName: 'トシ', ts: 1 } };
    const r = compareRooms(old, migrated());
    expect(r.ok).toBe(true);
    expect(r.skipped).toHaveLength(1);
  });
});
