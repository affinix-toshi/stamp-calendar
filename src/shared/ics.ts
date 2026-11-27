import type { DayEntry } from './types';
import { addDays } from './dates';

const encoder = new TextEncoder();

function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** 75バイトを超える行を、コードポイントの途中で切らずに折り返す（続き行は先頭に半角スペース） */
function fold(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75; // 先頭行は75、続き行は先頭の空白1バイト分を引く
  for (const ch of line) {
    const b = encoder.encode(ch).length;
    if (curBytes + b > limit) {
      parts.push(cur);
      cur = '';
      curBytes = 0;
      limit = 74;
    }
    cur += ch;
    curBytes += b;
  }
  if (cur) parts.push(cur);
  return parts.join('\r\n ');
}

function dateValue(key: string): string {
  return key.replace(/-/g, '');
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildIcs(input: { calendarName: string; entries: DayEntry[]; now: Date }): string {
  const stamp = utcStamp(input.now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AFFINIX//stamp-calendar//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(input.calendarName)}`,
    'X-WR-TIMEZONE:Asia/Tokyo',
  ];
  for (const e of input.entries) {
    const summary = `${e.emoji}${e.label}（${e.userName}）${e.memo ? ` ${e.memo}` : ''}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.date}-${e.source.kind}-${e.source.id}@stamp-calendar`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dateValue(e.date)}`,
      `DTEND;VALUE=DATE:${dateValue(addDays(e.date, 1))}`,
      `SUMMARY:${escapeText(summary)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
