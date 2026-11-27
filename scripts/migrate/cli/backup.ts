// npm run migrate:backup — 旧データ rooms/ 全体を .secrets/backup-YYYYMMDD-HHmm.json に書き出す。
// データベースには書きこまない（読むだけ）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { backupFileName, countStamps } from '../backup';
import { SECRETS, die, readValue, runCli, withDatabase } from './admin';

await runCli(() =>
  withDatabase(async (db) => {
    const rooms = await readValue<unknown>(db, 'rooms');
    if (rooms === null) die('rooms/ が空でした。つなぎ先のデータベースを確かめてください');
    mkdirSync(SECRETS, { recursive: true });
    const path = join(SECRETS, backupFileName(new Date()));
    // 同じ名前のファイルがあれば上書きしない（flag: 'wx'。あれば EEXIST）
    writeFileSync(path, JSON.stringify(rooms, null, 2), { encoding: 'utf8', flag: 'wx' });
    console.log(`バックアップを保存しました: ${path}`);
    console.log(`ルームの数: ${Object.keys(rooms as object).length}`);
    console.log(`スタンプの数（全ルームの合計）: ${countStamps(rooms)}`);
  }),
);
