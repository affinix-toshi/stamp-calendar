// 家族用 Firebase に、サービスアカウントの鍵でつなぐ。移行スクリプトの CLI からだけ使う。
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { initializeApp, cert, deleteApp, type App } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';
import { describeError } from '../migrate';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const SECRETS = join(ROOT, '.secrets');
export const KEY_PATH = join(SECRETS, 'family-sa.json');
export const USER_MAP_PATH = join(SECRETS, 'user-map.json');
const DATABASE_URL = 'https://stamp-calendar-3e7e0-default-rtdb.asia-southeast1.firebasedatabase.app';

/** エラーを日本語で出して終わる */
export function die(message: string): never {
  console.error('エラー: ' + message);
  process.exit(1);
}

/**
 * CLI の入口。捕まえなかったエラーは短い日本語＋元のエラー（調べる用）を出して、終了コード 1 で終わる。
 * fn が数を返したら、それを終了コードにする
 */
export async function runCli(fn: () => Promise<number | void>): Promise<void> {
  try {
    const code = await fn();
    process.exitCode = typeof code === 'number' ? code : 0;
  } catch (e) {
    for (const line of describeError(e)) console.error(line);
    process.exitCode = 1;
  }
}

export async function withDatabase<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  if (!existsSync(KEY_PATH)) {
    die(
      `鍵ファイルが見つかりません: ${KEY_PATH}\n` +
        'Firebase コンソール →（歯車）プロジェクトの設定 → サービス アカウント →「新しい秘密鍵を生成」で作ったファイルを、' +
        'この名前で置いてください。',
    );
  }
  let key: unknown;
  try {
    key = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
  } catch {
    die(`鍵ファイルを読めませんでした（JSON の形ではありません）: ${KEY_PATH}`);
  }
  const app: App = initializeApp({ credential: cert(key as object), databaseURL: DATABASE_URL }, 'migrate');
  try {
    return await fn(getDatabase(app));
  } finally {
    await deleteApp(app);
  }
}

export async function readValue<T>(db: Database, path: string): Promise<T | null> {
  const snap = await db.ref(path).once('value');
  return snap.exists() ? (snap.val() as T) : null;
}

const ROOM_CODE = /^[A-Z0-9]{5}$/;
const ROOM_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** --from（旧ルームコード）と --to（新しいルームID）を読む */
export function readRoomArgs(opts: { needTo: boolean; extra?: Record<string, { type: 'boolean' }> }): {
  from: string;
  to: string;
  flags: Record<string, boolean>;
} {
  const { values } = parseArgs({
    options: {
      from: { type: 'string' },
      room: { type: 'string' },
      to: { type: 'string' },
      ...(opts.extra ?? {}),
    },
    strict: true,
  });
  const from = String(values.from ?? values.room ?? '').trim().toUpperCase();
  if (!ROOM_CODE.test(from)) die('旧ルームコード（英数字5文字）を --from ABCDE（または --room ABCDE）の形で指定してください');
  const to = String(values.to ?? '').trim();
  if (opts.needTo && !ROOM_ID.test(to)) die('新しいルームID を --to {ルームID} の形で指定してください');
  const flags: Record<string, boolean> = {};
  for (const k of Object.keys(opts.extra ?? {})) flags[k] = (values as Record<string, unknown>)[k] === true;
  return { from, to, flags };
}
