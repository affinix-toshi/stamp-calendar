// npm run migrate:run -- --from ABCDE --to {新roomId} [--dry-run]
// 対応表 .secrets/user-map.json を使って、旧ルームのスタンプを v2/rooms/{新roomId}/stamps に写す。
// 書きこみは update() 1回だけ（stamps/{日付}/{ID} ごと）。stamps 全体を置きかえることはしない。
import { existsSync, readFileSync } from 'node:fs';
import { parseUserMap, runMigration, type MigrationIO } from '../migrate';
import { USER_MAP_PATH, die, readRoomArgs, readValue, withDatabase } from './admin';

const { from, to, flags } = readRoomArgs({ needTo: true, extra: { 'dry-run': { type: 'boolean' } } });

if (!existsSync(USER_MAP_PATH)) die(`対応表が見つかりません: ${USER_MAP_PATH}`);
let map: Record<string, string>;
try {
  map = parseUserMap(JSON.parse(readFileSync(USER_MAP_PATH, 'utf8')));
} catch (e) {
  die(e instanceof SyntaxError ? `対応表が JSON の形ではありません: ${USER_MAP_PATH}` : (e as Error).message);
}

const code = await withDatabase(async (db) => {
  const io: MigrationIO = {
    readOld: (c) => readValue(db, `rooms/${c}`),
    readMembers: (r) => readValue(db, `v2/rooms/${r}/members`),
    readExisting: (r) => readValue(db, `v2/rooms/${r}/stamps`),
    update: (r, writes) => db.ref(`v2/rooms/${r}`).update(writes),
  };
  return runMigration(io, { from, to, map, dryRun: flags['dry-run'] }, (l) => console.log(l));
});
process.exitCode = code;
