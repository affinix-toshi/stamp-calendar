import { describe, expect, it } from 'vitest';
import { buildDemoSeed } from '../../src/shared/demoSeed';
import { DEFAULT_STAMP_TYPES } from '../../src/shared/defaults';
import { checkLabel, checkMemo } from '../../src/shared/validate';
import { weekdayOf } from '../../src/shared/dates';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('buildDemoSeed', () => {
  it('2026-12-15 なら、全スタンプの日付が 2026-12-01〜2027-01-31 に入る', () => {
    const seed = buildDemoSeed('2026-12-15');
    const days = Object.keys(seed.stamps);
    expect(days.length).toBeGreaterThan(10);
    for (const d of days) {
      expect(d).toMatch(DATE);
      expect(d >= '2026-12-01' && d <= '2027-01-31').toBe(true);
    }
  });

  it('月末でも月初でも、今月と来月に収まる', () => {
    for (const today of ['2026-01-01', '2026-01-31', '2026-12-31', '2028-02-29']) {
      const [y, m] = today.split('-').map(Number);
      const first = `${y}-${String(m).padStart(2, '0')}-01`;
      const ny = m === 12 ? y + 1 : y;
      const nm = m === 12 ? 1 : m + 1;
      const last = `${ny}-${String(nm).padStart(2, '0')}-31`;
      const days = Object.keys(buildDemoSeed(today).stamps);
      expect(days.length).toBeGreaterThan(10);
      for (const d of days) expect(d >= first && d <= last).toBe(true);
    }
  });

  it('3人分のメンバー（固定のにせuid）がいて、スタンプも3人とも押している', () => {
    const seed = buildDemoSeed('2026-12-15');
    expect(seed.members).toEqual({
      'demo-papa': { name: 'パパ', joinedAt: expect.any(Number) },
      'demo-mama': { name: 'ママ', joinedAt: expect.any(Number) },
      'demo-yui': { name: 'ゆい', joinedAt: expect.any(Number) },
    });
    const stampUids = new Set(
      Object.values(seed.stamps).flatMap((day) => Object.values(day).map((s) => s.uid)),
    );
    expect([...stampUids].sort()).toEqual(['demo-mama', 'demo-papa', 'demo-yui']);
  });

  it('スタンプの種類は初期の10個', () => {
    const seed = buildDemoSeed('2026-12-15');
    expect(Object.values(seed.stampTypes).sort((a, b) => a.order - b.order)).toEqual(DEFAULT_STAMP_TYPES);
  });

  it('ルームの情報は見本用の固定値', () => {
    const { meta } = buildDemoSeed('2026-12-15');
    expect(meta.name).toBe('見本の家族');
    expect(meta.createdBy).toBe('demo-papa');
    expect(meta.inviteCode).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(meta.feedToken).toMatch(/^[A-Za-z0-9]{32}$/);
  });

  it('メモが付いたスタンプがあり、規則の文字数に収まる', () => {
    const stamps = Object.values(buildDemoSeed('2026-12-15').stamps).flatMap((d) => Object.values(d));
    expect(stamps.filter((s) => s.memo).length).toBeGreaterThanOrEqual(3);
    for (const s of stamps) {
      if (s.memo !== undefined) expect(checkMemo(s.memo)).toBeNull();
      expect(checkLabel(s.label)).toBeNull();
      expect(s.emoji.length).toBeLessThanOrEqual(16);
    }
  });

  it('毎週火曜🎹ピアノ（ゆい）のくり返しがあり、今月の初めから始まる', () => {
    const seed = buildDemoSeed('2026-12-15');
    const piano = Object.values(seed.repeats).find((r) => r.label === 'ピアノ');
    expect(piano).toBeDefined();
    expect(piano!.emoji).toBe('🎹');
    expect(piano!.uid).toBe('demo-yui');
    expect(piano!.userName).toBe('ゆい');
    expect(piano!.weekdays).toEqual([2]);
    expect(piano!.start).toBe('2026-12-01');
    expect(weekdayOf('2026-12-01')).toBe(2);
  });

  it('同じ日を渡せば同じ中身（リセットのたびに違わない）', () => {
    expect(buildDemoSeed('2026-12-15')).toEqual(buildDemoSeed('2026-12-15'));
  });

  it('すべての参照が実在のメンバーを指す', () => {
    const seed = buildDemoSeed('2026-12-15');
    for (const r of Object.values(seed.repeats)) {
      expect(seed.members[r.uid]?.name).toBe(r.userName);
    }
    for (const day of Object.values(seed.stamps)) {
      for (const s of Object.values(day)) expect(seed.members[s.uid]?.name).toBe(s.userName);
    }
  });
});
