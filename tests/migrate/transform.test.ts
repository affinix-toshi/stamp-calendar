import { describe, it, expect } from 'vitest';
import { transform } from '../../scripts/migrate/transform';
import { oldRoomFixture, MAP, NAMES } from './fixtures';

function ok<T extends object>(r: T) {
  if ('error' in r) throw new Error(`transform failed: ${String((r as { error: unknown }).error)}`);
  return r as Exclude<T, { error: string }>;
}

describe('transform', () => {
  it('旧ユーザー2つが同じ新 uid に対応 → どちらのスタンプも同じ uid と名前になる', () => {
    const r = ok(transform(oldRoomFixture(), MAP, NAMES));
    const a = r.stamps['2026-04-01']['-Np001'];
    const b = r.stamps['2026-04-15']['-Np003'];
    expect(a.uid).toBe('uidToshi');
    expect(b.uid).toBe('uidToshi');
    expect(a.userName).toBe('としひこ');
    expect(b.userName).toBe('としひこ');
    expect(r.stamps['2026-04-01']['-Np002'].uid).toBe('uidMama');
    expect(r.stamps['2026-04-01']['-Np002'].userName).toBe('ゆかり');
  });

  it('対応表にない旧ユーザーIDが1件ある → error と、その ID の一覧が返る', () => {
    const map = { oldA1: 'uidToshi', oldB1: 'uidMama' }; // oldA2 がない
    const r = transform(oldRoomFixture(), map, NAMES);
    expect('error' in r).toBe(true);
    if (!('error' in r)) return;
    expect(r.error).toContain('対応表');
    expect(r.unmapped).toEqual(['oldA2']);
    expect('stamps' in r).toBe(false);
  });

  it('対応表の値が空文字なら、対応していないものとして扱う', () => {
    const r = transform(oldRoomFixture(), { ...MAP, oldB1: '' }, NAMES);
    expect('error' in r && r.unmapped).toEqual(['oldB1']);
  });

  it('対応先の uid が新しいルームの参加者でない → error と、その uid の一覧が返る', () => {
    const r = transform(oldRoomFixture(), { ...MAP, oldB1: 'uidStranger' }, NAMES);
    expect('error' in r).toBe(true);
    if (!('error' in r)) return;
    expect(r.unmapped).toEqual([]);
    expect(r.notMembers).toEqual(['uidStranger']);
  });

  it('同じ入力で2回 transform → 同じ結果（ID が同じ）', () => {
    const r1 = ok(transform(oldRoomFixture(), MAP, NAMES));
    const r2 = ok(transform(oldRoomFixture(), MAP, NAMES));
    expect(r2).toEqual(r1);
    expect(Object.keys(r1.stamps['2026-04-01']).sort()).toEqual(['-Np001', '-Np002']);
    expect(Object.keys(r1.stamps['2026-04-15'])).toEqual(['-Np003']);
    expect(Object.keys(r1.stamps['2026-05-02'])).toEqual(['-Np004']);
  });

  it('旧データの絵文字・名前・ts がそのまま残る（memo はつけない）', () => {
    const r = ok(transform(oldRoomFixture(), MAP, NAMES));
    expect(r.stamps['2026-04-01']['-Np001']).toEqual({
      emoji: '🍳',
      label: 'ごはん',
      uid: 'uidToshi',
      userName: 'としひこ',
      ts: 1775000000001,
    });
    expect(r.stamps['2026-05-02']['-Np004']).toEqual({
      emoji: '🛒',
      label: '買い物',
      uid: 'uidMama',
      userName: 'ゆかり',
      ts: 1777000000004,
    });
  });

  it('日付の形がおかしいキーや、絵文字・名前・押した人がないスタンプは飛ばして一覧に出す', () => {
    const old = oldRoomFixture();
    old.stamps!['2026-4-3'] = {
      '-Bad1': { emoji: '🍳', label: 'ごはん', userId: 'oldA1', userName: 'トシ', ts: 1 },
    };
    old.stamps!['undefined'] = {
      '-Bad2': { emoji: '🍳', label: 'ごはん', userId: 'oldA1', userName: 'トシ', ts: 2 },
    };
    old.stamps!['2026-04-20'] = {
      '-NoEmoji': { label: 'ごはん', userId: 'oldA1', userName: 'トシ', ts: 3 },
      '-NoLabel': { emoji: '🍳', userId: 'oldA1', userName: 'トシ', ts: 4 },
      '-NoUser': { emoji: '🍳', label: 'ごはん', userName: '??', ts: 5 },
      '-NoTs': { emoji: '🍳', label: 'ごはん', userId: 'oldA1', userName: 'トシ' },
      '-Good': { emoji: '🍳', label: 'ごはん', userId: 'oldA1', userName: 'トシ', ts: 6 },
    };
    const r = ok(transform(old, MAP, NAMES));
    expect(r.stamps['2026-4-3']).toBeUndefined();
    expect(r.stamps['undefined']).toBeUndefined();
    expect(Object.keys(r.stamps['2026-04-20'])).toEqual(['-Good']);
    const ids = r.skipped.map((s) => `${s.date}/${s.id ?? ''}`).sort();
    expect(ids).toEqual(
      ['2026-04-20/-NoEmoji', '2026-04-20/-NoLabel', '2026-04-20/-NoTs', '2026-04-20/-NoUser', '2026-4-3/', 'undefined/'].sort(),
    );
    expect(r.skipped.every((s) => s.reason.length > 0)).toBe(true);
  });

  it('飛ばしたスタンプの旧ユーザーIDは、対応表がなくても止まらない', () => {
    const old = oldRoomFixture();
    old.stamps!['bad-key'] = {
      '-X': { emoji: '🍳', label: 'ごはん', userId: 'oldGhost', userName: '?', ts: 1 },
    };
    const r = transform(old, MAP, NAMES);
    expect('error' in r).toBe(false);
  });

  it('スタンプが1つもない旧ルームは、空の結果になる', () => {
    const r = ok(transform({ users: {} }, {}, {}));
    expect(r.stamps).toEqual({});
  });
});
