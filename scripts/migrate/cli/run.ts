// npm run migrate:run -- --from ABCDE --to {新roomId}          … お試し（何も書かない）
// npm run migrate:run -- --from ABCDE --to {新roomId} --write  … 本当に書く
// 対応表 .secrets/user-map.json を使って、旧ルームのスタンプを v2/rooms/{新roomId}/stamps に写す。
// 書きこみは update() 1回だけ（stamps/{日付}/{ID} ごと）。stamps 全体を置きかえることはしない。
import { existsSync, readFileSync } from 'node:fs';
import { parseUserMap, resolveDryRun, runMigration, type MigrationIO } from '../migrate';
import { USER_MAP_PATH, die, readRoomArgs, readValue, runCli, withDatabase } from './admin';

await runCli(async () => {
  const { from, to, flags } = readRoomArgs({
    needTo: true,
    extra: { write: { type: 'boolean' }, 'dry-run': { type: 'boolean' } },
  });
  const dryRun = resolveDryRun({ write: flags.write, dryRun: flags['dry-run'] }, process.env);

  if (!existsSync(USER_MAP_PATH)) die(`対応表が見つかりません: ${USER_MAP_PATH}`);
  let map: Record<string, string>;
  try {
    map = parseUserMap(JSON.parse(readFileSync(USER_MAP_PATH, 'utf8')));
  } catch (e) {
    die(e instanceof SyntaxError ? `対応表が JSON の形ではありません: ${USER_MAP_PATH}` : (e as Error).message);
  }

  return withDatabase(async (db) => {
    const io: MigrationIO = {
      readOld: (c) => readValue(db, `rooms/${c}`),
      readMembers: (r) => readValue(db, `v2/rooms/${r}/members`),
      readExisting: (r) => readValue(db, `v2/rooms/${r}/stamps`),
      update: (r, writes) => db.ref(`v2/rooms/${r}`).update(writes),
    };
    return runMigration(io, { from, to, map, dryRun }, (l) => console.log(l));
  });
});
