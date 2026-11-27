import { describe, expect, it } from 'vitest';
import { endBefore, expandRepeats, mergeDay } from '../../src/shared/repeats';
import type { DayEntry, Repeat, Stamp } from '../../src/shared/types';

const base: Repeat = {
  emoji: '🧹',
  label: 'そうじ',
  uid: 'u1',
  userName: 'たろう',
  ts: 100,
  weekdays: [2, 4],
  start: '2026-12-01',
};

const dates = (list: DayEntry[]) => list.map((e) => e.date);

describe('expandRepeats', () => {
  it('毎週火・木を範囲内で展開する', () => {
    const r = expandRepeats({ r1: base }, '2026-12-01', '2026-12-14');
    expect(dates(r)).toEqual(['2026-12-01', '2026-12-03', '2026-12-08', '2026-12-10']);
    expect(r[0].source).toEqual({ kind: 'repeat', id: 'r1' });
    expect(r[0]).not.toHaveProperty('weekdays');
    expect(r[0].label).toBe('そうじ');
  });

  it('end の日を含めて止める', () => {
    const r = expandRepeats({ r1: { ...base, end: '2026-12-08' } }, '2026-12-01', '2026-12-14');
    expect(dates(r)).toEqual(['2026-12-01', '2026-12-03', '2026-12-08']);
  });

  it('skips の日は出ない', () => {
    const r = expandRepeats(
      { r1: { ...base, skips: { '2026-12-03': true } } },
      '2026-12-01',
      '2026-12-14',
    );
    expect(dates(r)).not.toContain('2026-12-03');
    expect(r).toHaveLength(3);
  });

  it('範囲が start より前なら空', () => {
    expect(expandRepeats({ r1: base }, '2026-11-01', '2026-11-30')).toEqual([]);
  });

  it('from > to なら空', () => {
    expect(expandRepeats({ r1: base }, '2026-12-14', '2026-12-01')).toEqual([]);
  });

  it('年またぎ', () => {
    const r = expandRepeats(
      { r1: { ...base, weekdays: [1], start: '2026-12-01' } },
      '2026-12-28',
      '2027-01-05',
    );
    expect(dates(r)).toEqual(['2026-12-28', '2027-01-04']);
  });

  it('日付順→ts順に並ぶ', () => {
    const r = expandRepeats(
      { a: { ...base, ts: 200, weekdays: [2] }, b: { ...base, ts: 100, weekdays: [2, 3] } },
      '2026-12-01',
      '2026-12-02',
    );
    expect(r.map((e) => [e.date, e.ts])).toEqual([
      ['2026-12-01', 100],
      ['2026-12-01', 200],
      ['2026-12-02', 100],
    ]);
  });
});

describe('endBefore', () => {
  it('start 以前なら delete', () => {
    expect(endBefore(base, base.start)).toEqual({ action: 'delete' });
  });
  it('それ以外は前日で end を更新', () => {
    expect(endBefore(base, '2026-12-10')).toEqual({ action: 'update', end: '2026-12-09' });
  });
});

describe('mergeDay', () => {
  it('個別スタンプとくり返しを ts 順に混ぜる', () => {
    const stamps: Record<string, Stamp> = {
      s1: { emoji: 'a', label: 'A', uid: 'u', userName: 'n', ts: 300 },
      s2: { emoji: 'b', label: 'B', uid: 'u', userName: 'n', ts: 100 },
    };
    const rep: DayEntry[] = [
      {
        emoji: 'c',
        label: 'C',
        uid: 'u',
        userName: 'n',
        ts: 200,
        date: '2026-12-01',
        source: { kind: 'repeat', id: 'r1' },
      },
    ];
    const r = mergeDay(stamps, rep, '2026-12-01');
    expect(r.map((e) => e.label)).toEqual(['B', 'C', 'A']);
    expect(r[0].source).toEqual({ kind: 'stamp', id: 's2' });
    expect(r[0].date).toBe('2026-12-01');
  });

  it('stamps が undefined でも動く', () => {
    expect(mergeDay(undefined, [], '2026-12-01')).toEqual([]);
  });
});
