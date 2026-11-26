// npm run migrate:verify -- --from ABCDE --to {新roomId}
// 旧ルームと新しいルームを日付ごとに比べて、すべて写せていれば OK を出す（読むだけ）。
import type { OldRoom } from '../transform';
import { compareRooms, formatVerify } from '../verify';
import { readRoomArgs, readValue, withDatabase } from './admin';

const { from, to } = readRoomArgs({ needTo: true });

const ok = await withDatabase(async (db) => {
  const [old, v2] = await Promise.all([
    readValue<OldRoom>(db, `rooms/${from}`),
    readValue<Record<string, Record<string, unknown>>>(db, `v2/rooms/${to}/stamps`),
  ]);
  console.log(`旧ルーム ${from} と 新しいルーム ${to} を比べます`);
  const r = compareRooms(old, v2);
  for (const line of formatVerify(r)) console.log(line);
  return r.ok;
});
process.exitCode = ok ? 0 : 1;
