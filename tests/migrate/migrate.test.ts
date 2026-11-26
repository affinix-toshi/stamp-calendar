import { describe, it, expect, vi } from 'vitest';
import { planMigration, runMigration, parseUserMap, type MigrationIO } from '../../scripts/migrate/migrate';
import type { OldRoom } from '../../scripts/migrate/transform';
import { oldRoomFixture, MAP, MEMBERS } from './fixtures';

function fakeIO(over: Partial<{ old: OldRoom | null; members: unknown; existing: unknown }> = {}) {
  const update = vi.fn(async (_roomId: string, _writes: Record<string, unknown>) => {});
  const io: MigrationIO = {
    readOld: async () => ('old' in over ? over.old! : oldRoomFixture()),
    readMembers: async () => ('members' in over ? (over.members as never) : MEMBERS),
    readExisting: async () => ('existing' in over ? (over.existing as never) : null),
    update,
  };
  return { io, update };
}

describe('planMigration', () => {
  it('成功すると stamps/{日付}/{旧pushId} の書き込みと、月ごとの件数を返す', () => {
    const p = planMigration({ old: oldRoomFixture(), map: MAP, members: MEMBERS, existing: null });
    expect(p.ok).toBe(true);
    expect(Object.keys(p.writes).sort()).toEqual([
      'stamps/2026-04-01/-Np001',
      'stamps/2026-04-01/-Np002',
      'stamps/2026-04-15/-Np003',
      'stamps/2026-05-02/-Np004',
    ]);
    if (!p.ok) return;
    expect(p.perMonth).toEqual({ '2026-04': 3, '2026-05': 1 });
    expect(p.total).toBe(4);
    expect(p.alreadyThere).toBe(0);
  });

  it('対応表にない旧ユーザーIDがある → error と一覧、書き込みは0件', () => {
    const p = planMigration({
      old: oldRoomFixture(),
      map: { oldA1: 'uidToshi', oldB1: 'uidMama' },
      members: MEMBERS,
      existing: null,
    });
    expect(p.ok).toBe(false);
    expect(p.writes).toEqual({});
    if (p.ok) return;
    expect(p.unmapped).toEqual(['oldA2']);
  });

  it('対応先の uid が新しいルームの参加者でない → error、書き込みは0件', () => {
    const p = planMigration({
      old: oldRoomFixture(),
      map: { ...MAP, oldB1: 'uidStranger' },
      members: MEMBERS,
      existing: null,
    });
    expect(p.ok).toBe(false);
    expect(p.writes).toEqual({});
    if (p.ok) return;
    expect(p.notMembers).toEqual(['uidStranger']);
    expect(p.error).toContain('参加者');
  });

  it('旧ルームが見つからない・新しいルームに参加者がいない → error、書き込みは0件', () => {
    const a = planMigration({ old: null, map: MAP, members: MEMBERS, existing: null });
    expect(a.ok).toBe(false);
    expect(a.writes).toEqual({});
    const b = planMigration({ old: oldRoomFixture(), map: MAP, members: null, existing: null });
    expect(b.ok).toBe(false);
    expect(b.writes).toEqual({});
  });

  it('新しい側にすでに同じIDのスタンプがあれば書かない（新しい側で付けたメモなどを消さない）', () => {
    const existing = {
      '2026-04-01': {
        '-Np001': { emoji: '🍳', label: 'ごはん', uid: 'uidToshi', userName: 'としひこ', ts: 1775000000001, memo: 'あとで書いたメモ' },
        v2only: { emoji: '🌙', label: 'ねる', uid: 'uidMama', userName: 'ゆかり', ts: 1790000000000 },
      },
    };
    const p = planMigration({ old: oldRoomFixture(), map: MAP, members: MEMBERS, existing });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(Object.keys(p.writes)).not.toContain('stamps/2026-04-01/-Np001');
    expect(Object.keys(p.writes)).not.toContain('stamps/2026-04-01/v2only');
    expect(Object.keys(p.writes)).toHaveLength(3);
    expect(p.alreadyThere).toBe(1);
    expect(p.total).toBe(4);
  });

  it('書き込みはすべて stamps/ の下の1件ずつのパス（stamps 全体を置きかえない）', () => {
    const p = planMigration({ old: oldRoomFixture(), map: MAP, members: MEMBERS, existing: null });
    for (const path of Object.keys(p.writes)) {
      expect(path).toMatch(/^stamps\/\d{4}-\d{2}-\d{2}\/[^/]+$/);
    }
  });
});

describe('runMigration', () => {
  const quiet = () => {};

  it('成功すると update を1回だけ呼び、書いたパスを表示する', async () => {
    const { io, update } = fakeIO();
    const lines: string[] = [];
    const code = await runMigration(io, { from: 'ABCDE', to: 'room1', map: MAP, dryRun: false }, (l) => lines.push(l));
    expect(code).toBe(0);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toBe('room1');
    expect(Object.keys(update.mock.calls[0][1])).toHaveLength(4);
    const out = lines.join('\n');
    expect(out).toContain('2026-04');
    expect(out).toContain('v2/rooms/room1/stamps/2026-04-01/-Np001');
  });

  it('--dry-run では件数を出すだけで、何も書かない', async () => {
    const { io, update } = fakeIO();
    const lines: string[] = [];
    const code = await runMigration(io, { from: 'ABCDE', to: 'room1', map: MAP, dryRun: true }, (l) => lines.push(l));
    expect(code).toBe(0);
    expect(update).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('4');
  });

  it('対応表にもれがあると、何も書かずに 0 以外で終わり、もれた ID を表示する', async () => {
    const { io, update } = fakeIO();
    const lines: string[] = [];
    const code = await runMigration(
      io,
      { from: 'ABCDE', to: 'room1', map: { oldA1: 'uidToshi' }, dryRun: false },
      (l) => lines.push(l),
    );
    expect(code).not.toBe(0);
    expect(update).not.toHaveBeenCalled();
    const out = lines.join('\n');
    expect(out).toContain('oldA2');
    expect(out).toContain('oldB1');
  });

  it('参加者でない uid があると、何も書かずに 0 以外で終わる', async () => {
    const { io, update } = fakeIO({ members: { uidToshi: { name: 'としひこ', joinedAt: 1 } } });
    const code = await runMigration(io, { from: 'ABCDE', to: 'room1', map: MAP, dryRun: false }, quiet);
    expect(code).not.toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('2回目（すべて写し済み）は何も書かない', async () => {
    const first = planMigration({ old: oldRoomFixture(), map: MAP, members: MEMBERS, existing: null });
    const existing: Record<string, Record<string, unknown>> = {};
    for (const [path, v] of Object.entries(first.writes)) {
      const [, date, id] = path.split('/');
      (existing[date] ??= {})[id] = v;
    }
    const { io, update } = fakeIO({ existing });
    const code = await runMigration(io, { from: 'ABCDE', to: 'room1', map: MAP, dryRun: false }, quiet);
    expect(code).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('parseUserMap', () => {
  it('{ 旧ID: 新uid } の形を読める', () => {
    expect(parseUserMap({ a: 'x', b: 'y' })).toEqual({ a: 'x', b: 'y' });
  });
  it('形がおかしいと日本語のエラーを投げる', () => {
    expect(() => parseUserMap(['a'])).toThrow(/対応表/);
    expect(() => parseUserMap({ a: 1 })).toThrow(/対応表/);
    expect(() => parseUserMap(null)).toThrow(/対応表/);
  });
});
