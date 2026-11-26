import { describe, it, expect } from 'vitest';
import { buildReport, formatReport } from '../../scripts/migrate/report';
import { backupFileName, countStamps } from '../../scripts/migrate/backup';
import { oldRoomFixture } from './fixtures';

describe('buildReport', () => {
  it('旧ユーザーIDごとに名前・押した数・最後に押した日を出す（多い順）', () => {
    const r = buildReport(oldRoomFixture());
    expect(r.rows).toEqual([
      { oldUid: 'oldB1', name: 'ママ', count: 2, lastDate: '2026-05-02' },
      { oldUid: 'oldA1', name: 'トシ', count: 1, lastDate: '2026-04-01' },
      { oldUid: 'oldA2', name: 'とし(iPad)', count: 1, lastDate: '2026-04-15' },
    ]);
  });

  it('users にいない旧ユーザーIDはスタンプの名前を使い、スタンプが0件の人も出す', () => {
    const old = oldRoomFixture();
    old.users!.oldZero = { name: 'だれか', ts: 1 };
    old.stamps!['2026-06-01'] = { '-Q': { emoji: '🍳', label: 'ごはん', userId: 'oldGhost', userName: 'おばけ', ts: 1 } };
    const r = buildReport(old);
    expect(r.rows.find((x) => x.oldUid === 'oldGhost')).toEqual({
      oldUid: 'oldGhost', name: 'おばけ', count: 1, lastDate: '2026-06-01',
    });
    expect(r.rows.find((x) => x.oldUid === 'oldZero')).toEqual({
      oldUid: 'oldZero', name: 'だれか', count: 0, lastDate: null,
    });
  });

  it('表と、対応表のひな形を文字で出す', () => {
    const out = formatReport(buildReport(oldRoomFixture())).join('\n');
    expect(out).toContain('oldB1');
    expect(out).toContain('ママ');
    expect(out).toContain('2026-05-02');
    expect(out).toContain('"oldA2": ""');
  });
});

describe('backup', () => {
  it('ファイル名は日本時間の backup-YYYYMMDD-HHmm.json', () => {
    expect(backupFileName(new Date('2026-11-30T15:05:00Z'))).toBe('backup-20261201-0005.json');
    expect(backupFileName(new Date('2026-04-01T02:30:00Z'))).toBe('backup-20260401-1130.json');
  });

  it('rooms 全体のスタンプ数を数える', () => {
    expect(countStamps({ ABCDE: oldRoomFixture(), XYZ23: { stamps: { '2026-01-01': { a: {}, b: {} } } } })).toBe(6);
    expect(countStamps(null)).toBe(0);
    expect(countStamps({ R: { users: {} } })).toBe(0);
  });
});
