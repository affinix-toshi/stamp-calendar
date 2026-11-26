// 旧ユーザーIDごとの一覧を作る（対応表づくりのため）。データベースには触らない。
import { readOldStamps, type OldRoom, type Skipped } from './transform';
import { formatSkipped } from './migrate';

export interface ReportRow {
  oldUid: string;
  name: string;
  count: number;
  lastDate: string | null;
}

export function buildReport(old: OldRoom): { rows: ReportRow[]; skipped: Skipped[] } {
  const { valid, skipped } = readOldStamps(old);
  const rows = new Map<string, ReportRow & { lastTs: number }>();
  const users = old.users && typeof old.users === 'object' ? old.users : {};

  for (const [id, u] of Object.entries(users)) {
    const name = u && typeof u === 'object' && typeof u.name === 'string' ? u.name : '';
    rows.set(id, { oldUid: id, name, count: 0, lastDate: null, lastTs: -Infinity });
  }
  for (const { date, stamp } of valid) {
    let row = rows.get(stamp.userId);
    if (!row) {
      row = { oldUid: stamp.userId, name: '', count: 0, lastDate: null, lastTs: -Infinity };
      rows.set(stamp.userId, row);
    }
    row.count++;
    if (row.lastDate === null || date > row.lastDate) row.lastDate = date;
    // users に名前がないときは、いちばん新しいスタンプの名前を使う
    if (!(stamp.userId in users) && stamp.ts >= row.lastTs) {
      row.lastTs = stamp.ts;
      row.name = stamp.userName;
    }
  }

  const out = [...rows.values()]
    .map(({ lastTs: _lastTs, ...r }) => r)
    .sort((a, b) => b.count - a.count || (a.oldUid < b.oldUid ? -1 : a.oldUid > b.oldUid ? 1 : 0));
  return { rows: out, skipped };
}

export function formatReport(r: { rows: ReportRow[]; skipped: Skipped[] }): string[] {
  const lines: string[] = [];
  lines.push('旧ユーザーID\t名前\t押した数\t最後に押した日');
  for (const row of r.rows) {
    lines.push(`${row.oldUid}\t${row.name || '（名前なし）'}\t${row.count}\t${row.lastDate ?? '（なし）'}`);
  }
  lines.push(...formatSkipped(r.skipped));
  lines.push('');
  lines.push('対応表（.secrets/user-map.json）のひな形。"" の中に新しいuid を書く:');
  const template: Record<string, string> = {};
  for (const row of r.rows) if (row.count > 0) template[row.oldUid] = '';
  lines.push(JSON.stringify(template, null, 2));
  return lines;
}
