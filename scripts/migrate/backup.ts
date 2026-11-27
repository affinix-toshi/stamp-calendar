// バックアップのファイル名とスタンプ数の数え方。データベースには触らない。

/** 日本時間で backup-YYYYMMDD-HHmm.json */
export function backupFileName(now: Date): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  const ymd = `${jst.getUTCFullYear()}${p(jst.getUTCMonth() + 1)}${p(jst.getUTCDate())}`;
  return `backup-${ymd}-${p(jst.getUTCHours())}${p(jst.getUTCMinutes())}.json`;
}

/** rooms/ 全体のスタンプの数（形を問わず、日付の下にあるものをすべて数える） */
export function countStamps(rooms: unknown): number {
  if (!rooms || typeof rooms !== 'object') return 0;
  let n = 0;
  for (const room of Object.values(rooms as Record<string, unknown>)) {
    const stamps = room && typeof room === 'object' ? (room as { stamps?: unknown }).stamps : null;
    if (!stamps || typeof stamps !== 'object') continue;
    for (const day of Object.values(stamps as Record<string, unknown>)) {
      if (day && typeof day === 'object') n += Object.keys(day).length;
    }
  }
  return n;
}
