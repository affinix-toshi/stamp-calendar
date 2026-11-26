// npm run migrate:verify -- --from ABCDE --to {新roomId}
// 旧ルームと新しいルームを日付ごとに比べて、すべて写せていれば OK を出す（読むだけ）。
// 対応表 .secrets/user-map.json を使って、押した人（uid）も比べる。
import { existsSync, readFileSync } from 'node:fs';
import { parseUserMap } from '../migrate';
import type { OldRoom } from '../transform';
import { compareRooms, formatVerify } from '../verify';
import { USER_MAP_PATH, die, readRoomArgs, readValue, runCli, withDatabase } from './admin';

await runCli(async () => {
  const { from, to } = readRoomArgs({ needTo: true });
  if (!existsSync(USER_MAP_PATH)) die(`対応表が見つかりません: ${USER_MAP_PATH}`);
  const map = parseUserMap(JSON.parse(readFileSync(USER_MAP_PATH, 'utf8')));

  return withDatabase(async (db) => {
    const [old, v2] = await Promise.all([
      readValue<OldRoom>(db, `rooms/${from}`),
      readValue<Record<string, Record<string, unknown>>>(db, `v2/rooms/${to}/stamps`),
    ]);
    console.log(`旧ルーム ${from} と 新しいルーム ${to} を比べます`);
    const r = compareRooms(old, v2, map);
    for (const line of formatVerify(r)) console.log(line);
    return r.ok ? 0 : 1;
  });
});
