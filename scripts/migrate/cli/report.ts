// npm run migrate:report -- --room ABCDE — 旧ユーザーIDごとの一覧を出す（読むだけ）。
import { buildReport, formatReport } from '../report';
import type { OldRoom } from '../transform';
import { die, readRoomArgs, readValue, withDatabase } from './admin';

const { from } = readRoomArgs({ needTo: false });

await withDatabase(async (db) => {
  const old = await readValue<OldRoom>(db, `rooms/${from}`);
  if (!old) die(`旧ルーム ${from} が見つかりません。ルームコードを確かめてください`);
  console.log(`旧ルーム ${from} の旧ユーザーID一覧`);
  for (const line of formatReport(buildReport(old))) console.log(line);
});
