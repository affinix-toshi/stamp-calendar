import { describe, it, expect } from 'vitest';
import { buildIcs } from '../../src/shared/ics';
import type { DayEntry } from '../../src/shared/types';

const now = new Date('2026-11-26T03:04:05Z');

function entry(over: Partial<DayEntry> = {}): DayEntry {
  return {
    emoji: '🏠',
    label: '在宅',
    uid: 'u1',
    userName: 'トシ',
    ts: 1,
    date: '2026-12-01',
    source: { kind: 'stamp', id: 's1' },
    ...over,
  };
}

function unfold(s: string): string {
  return s.replace(/\r\n /g, '');
}

describe('buildIcs', () => {
  it('1件の予定は終日の1日分', () => {
    const out = buildIcs({ calendarName: '家族', entries: [entry()], now });
    expect(out).toContain('DTSTART;VALUE=DATE:20261201\r\n');
    expect(out).toContain('DTEND;VALUE=DATE:20261202\r\n');
    expect(out).toContain('SUMMARY:🏠在宅（トシ）\r\n');
    expect(out).toContain('UID:2026-12-01-stamp-s1@stamp-calendar\r\n');
    expect(out).toContain('DTSTAMP:20261126T030405Z\r\n');
    expect(out).toContain('X-WR-CALNAME:家族\r\n');
    expect(out).toContain('X-WR-TIMEZONE:Asia/Tokyo\r\n');
    expect(out).toContain('METHOD:PUBLISH\r\n');
    expect(out).toContain('PRODID:-//AFFINIX//stamp-calendar//JA\r\n');
    expect(out).toContain('VERSION:2.0\r\n');
    expect(out).toContain('CALSCALE:GREGORIAN\r\n');
  });

  it('メモ付きは半角スペースのあとにメモ', () => {
    const out = buildIcs({
      calendarName: '家族',
      entries: [entry({ emoji: '💼', label: '仕事朝', userName: '妻', memo: '19時帰宅' })],
      now,
    });
    expect(out).toContain('SUMMARY:💼仕事朝（妻） 19時帰宅\r\n');
  });

  it('メモの , ; と改行をエスケープする', () => {
    const out = buildIcs({
      calendarName: '家族',
      entries: [entry({ memo: 'a,b;c\\d\ne' })],
      now,
    });
    expect(out).toContain('a\\,b\\;c\\\\d\\ne');
  });

  it('カレンダー名もエスケープする', () => {
    const out = buildIcs({ calendarName: 'a,b;c', entries: [], now });
    expect(out).toContain('X-WR-CALNAME:a\\,b\\;c\r\n');
  });

  it('長い行は75バイト以下に折り返され、つなげると元に戻る', () => {
    const memo = 'あいうえお😀'.repeat(20);
    const out = buildIcs({ calendarName: '家族', entries: [entry({ memo })], now });
    const enc = new TextEncoder();
    const lines = out.split('\r\n');
    for (const l of lines) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
    expect(lines.some((l) => l.startsWith(' '))).toBe(true);
    expect(unfold(out)).toContain(`SUMMARY:🏠在宅（トシ） ${memo}\r\n`);
    // 文字化け(分割によるU+FFFD)がない
    expect(out).not.toContain('�');
  });

  it('CRLF区切りで VCALENDAR で始まり終わる', () => {
    const out = buildIcs({ calendarName: '家族', entries: [entry()], now });
    expect(out.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(out.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(out.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('entries が空でも正しい VCALENDAR', () => {
    const out = buildIcs({ calendarName: '家族', entries: [], now });
    expect(out.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(out.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(out).not.toContain('BEGIN:VEVENT');
  });
});
