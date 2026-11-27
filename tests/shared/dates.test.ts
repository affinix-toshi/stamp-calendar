import { describe, it, expect } from 'vitest';
import { todayKey, addDays, weekdayOf, monthGrid } from '../../src/shared/dates';
import { DEFAULT_STAMP_TYPES } from '../../src/shared/defaults';

describe('dates', () => {
  it('todayKey は日本時間の日付を返す', () => {
    expect(todayKey(new Date('2026-11-30T15:30:00Z'))).toBe('2026-12-01');
    expect(todayKey(new Date('2026-11-30T14:59:00Z'))).toBe('2026-11-30');
  });
  it('addDays は月・年・うるう年をまたぐ', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('weekdayOf は 0=日〜6=土', () => {
    expect(weekdayOf('2026-11-29')).toBe(0);
    expect(weekdayOf('2026-12-05')).toBe(6);
  });
  it('monthGrid は日曜始まりで前に null を入れる', () => {
    const feb = monthGrid(2026, 1);
    expect(feb.filter((d) => d === null)).toHaveLength(0);
    expect(feb).toHaveLength(28);
    expect(feb[27]).toBe('2026-02-28');
    const dec = monthGrid(2026, 11); // 12/1 は火曜
    expect(dec.slice(0, 3)).toEqual([null, null, '2026-12-01']);
    expect(dec).toHaveLength(33);
  });
});

describe('defaults', () => {
  it('初期スタンプは10種類で order 0〜9', () => {
    expect(DEFAULT_STAMP_TYPES).toHaveLength(10);
    expect(DEFAULT_STAMP_TYPES.map((s) => s.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(DEFAULT_STAMP_TYPES[0]).toEqual({ emoji: '🏠', label: '在宅', order: 0 });
    expect(DEFAULT_STAMP_TYPES[9]).toEqual({ emoji: '🍷', label: 'ワイン', order: 9 });
  });
});
