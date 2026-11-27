// 旧ルームと新しいルームのスタンプを日付ごとに比べる。データベースには触らない。
import { readOldStamps, type OldRoom, type Skipped } from './transform';
import { formatSkipped } from './migrate';

type V2Stamps = Record<string, Record<string, unknown> | null | undefined>;

export interface VerifyResult {
  ok: boolean;
  error?: string;
  /** 旧データに日付があるものだけ。found = 同じIDで新しい側にあった数、extra = 新しい側だけにある数 */
  perDate: { date: string; old: number; found: number; extra: number }[];
  missing: { date: string; id: string }[];
  altered: { date: string; id: string; fields: string[] }[];
  /** 新しい側で押されたスタンプ（旧データにないID）の数。これは問題ない */
  extra: number;
  skipped: Skipped[];
}

const FIELDS = ['emoji', 'label', 'ts'] as const;

/**
 * map（旧ユーザーID → 新しいuid）を渡すと、押した人（uid）も比べる。
 * 旧ルームに写せるスタンプが1件もないときは、ルームコードの間違いとみなして NG にする。
 */
export function compareRooms(
  old: OldRoom | null,
  v2: V2Stamps | null,
  map?: Record<string, string>,
): VerifyResult {
  const empty = { perDate: [], missing: [], altered: [], extra: 0, skipped: [] };
  if (!old || typeof old !== 'object')
    return { ok: false, error: '旧ルームが見つかりません。ルームコードを確かめてください', ...empty };

  const { valid, skipped } = readOldStamps(old);
  if (valid.length === 0)
    return {
      ok: false,
      error: '旧ルームにスタンプが見つかりません。ルームコードを確かめてください',
      ...empty,
      skipped,
    };
  const v2Days: V2Stamps = v2 && typeof v2 === 'object' ? v2 : {};

  const byDate = new Map<string, string[]>();
  const oldById = new Map<string, (typeof valid)[number]>();
  for (const v of valid) {
    (byDate.get(v.date) ?? byDate.set(v.date, []).get(v.date)!).push(v.id);
    oldById.set(`${v.date}/${v.id}`, v);
  }

  const perDate: VerifyResult['perDate'] = [];
  const missing: VerifyResult['missing'] = [];
  const altered: VerifyResult['altered'] = [];
  let extra = 0;

  const allDates = new Set([...byDate.keys(), ...Object.keys(v2Days)]);
  for (const date of [...allDates].sort()) {
    const oldIds = byDate.get(date) ?? [];
    const day = v2Days[date];
    const newDay: Record<string, unknown> = day && typeof day === 'object' ? day : {};
    const oldSet = new Set(oldIds);
    const extraHere = Object.keys(newDay).filter((id) => !oldSet.has(id) && newDay[id] != null).length;
    extra += extraHere;
    if (oldIds.length === 0) continue;

    let found = 0;
    for (const id of oldIds) {
      const n = newDay[id] as Record<string, unknown> | null | undefined;
      if (!n || typeof n !== 'object') {
        missing.push({ date, id });
        continue;
      }
      found++;
      const o = oldById.get(`${date}/${id}`)!.stamp;
      const diff: string[] = FIELDS.filter((f) => n[f] !== o[f]);
      if (map && n.uid !== (Object.prototype.hasOwnProperty.call(map, o.userId) ? map[o.userId] : undefined))
        diff.push('uid');
      if (diff.length > 0) altered.push({ date, id, fields: [...diff] });
    }
    perDate.push({ date, old: oldIds.length, found, extra: extraHere });
  }

  return { ok: missing.length === 0 && altered.length === 0, perDate, missing, altered, extra, skipped };
}

export function formatVerify(r: VerifyResult): string[] {
  const lines: string[] = [];
  if (r.error) {
    lines.push('エラー: ' + r.error);
    lines.push(...formatSkipped(r.skipped));
    lines.push('NG');
    return lines;
  }
  lines.push('日付ごとの件数（旧 / 新しい側で見つかった数 / 新しい側だけにある数）:');
  for (const d of r.perDate) {
    const mark = d.old === d.found ? '' : '  ← 足りない';
    lines.push(`  ${d.date}: ${d.old} / ${d.found} / ${d.extra}${mark}`);
  }
  const totalOld = r.perDate.reduce((a, d) => a + d.old, 0);
  const totalFound = r.perDate.reduce((a, d) => a + d.found, 0);
  lines.push(`合計: 旧 ${totalOld} 件 / 新しい側で見つかった ${totalFound} 件`);
  lines.push(`新しいアプリで押されたスタンプ（比べる対象外）: ${r.extra} 件`);
  if (r.missing.length > 0) {
    lines.push(`新しい側にないもの: ${r.missing.length} 件`);
    for (const m of r.missing) lines.push(`  - ${m.date}/${m.id}`);
  }
  if (r.altered.length > 0) {
    lines.push(`中身がちがうもの: ${r.altered.length} 件`);
    for (const a of r.altered) lines.push(`  - ${a.date}/${a.id}（${a.fields.join(', ')}）`);
  }
  lines.push(...formatSkipped(r.skipped));
  lines.push(r.ok ? 'OK' : 'NG');
  return lines;
}
