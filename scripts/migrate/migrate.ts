// 移行の計画（何をどこに書くか）と実行の手順。データベースの読み書きは MigrationIO 経由だけ。
import type { Stamp } from '../../src/shared/types';
import { transform, type OldRoom, type Skipped } from './transform';

type Members = Record<string, { name?: unknown } | null | undefined>;
type ExistingStamps = Record<string, Record<string, unknown> | null | undefined>;

export type Plan =
  | {
      ok: true;
      /** v2/rooms/{roomId} から見たパス（stamps/{日付}/{ID}）→ 書くスタンプ */
      writes: Record<string, Stamp>;
      /** YYYY-MM → 今回書く件数 */
      perMonth: Record<string, number>;
      /** 旧ルームの、写せるスタンプの数 */
      total: number;
      /** 新しい側に同じIDがすでにあるので書かないものの数 */
      alreadyThere: number;
      /**
       * すでにあるスタンプのうち、持ち主（uid か表示名）が今回の対応表とちがうものの場所。
       * 再実行では直らない（上書きしない）ので、件数と場所を知らせる
       */
      ownerMismatch: string[];
      skipped: Skipped[];
    }
  | {
      ok: false;
      error: string;
      writes: Record<string, never>;
      unmapped: string[];
      notMembers: string[];
      skipped: Skipped[];
    };

function fail(error: string, extra: Partial<{ unmapped: string[]; notMembers: string[]; skipped: Skipped[] }> = {}): Plan {
  return { ok: false, error, writes: {}, unmapped: [], notMembers: [], skipped: [], ...extra };
}

export function planMigration(input: {
  old: OldRoom | null;
  map: Record<string, string>;
  members: Members | null;
  existing: ExistingStamps | null;
}): Plan {
  const { old, map, members, existing } = input;
  if (!old || typeof old !== 'object') return fail('旧ルームが見つかりません。ルームコードを確かめてください');
  if (!members || typeof members !== 'object' || Object.keys(members).length === 0)
    return fail('新しいルームが見つからないか、参加者がいません。ルームIDを確かめてください');

  const names: Record<string, string> = {};
  for (const [uid, m] of Object.entries(members)) {
    if (m && typeof m === 'object' && typeof m.name === 'string') names[uid] = m.name;
  }

  const r = transform(old, map, names);
  if ('error' in r) return fail(r.error, { unmapped: r.unmapped, notMembers: r.notMembers, skipped: r.skipped });

  const writes: Record<string, Stamp> = {};
  const perMonth: Record<string, number> = {};
  let total = 0;
  let alreadyThere = 0;
  const ownerMismatch: string[] = [];
  for (const date of Object.keys(r.stamps).sort()) {
    for (const id of Object.keys(r.stamps[date]).sort()) {
      total++;
      const day = existing?.[date];
      if (day && typeof day === 'object' && Object.prototype.hasOwnProperty.call(day, id) && day[id] != null) {
        alreadyThere++;
        const cur = day[id] as Record<string, unknown>;
        const want = r.stamps[date][id];
        if (typeof cur !== 'object' || cur.uid !== want.uid || cur.userName !== want.userName)
          ownerMismatch.push(`stamps/${date}/${id}`);
        continue;
      }
      writes[`stamps/${date}/${id}`] = r.stamps[date][id];
      const month = date.slice(0, 7);
      perMonth[month] = (perMonth[month] ?? 0) + 1;
    }
  }
  return { ok: true, writes, perMonth, total, alreadyThere, ownerMismatch, skipped: r.skipped };
}

export interface MigrationIO {
  readOld(code: string): Promise<OldRoom | null>;
  readMembers(roomId: string): Promise<Members | null>;
  readExisting(roomId: string): Promise<ExistingStamps | null>;
  /** v2/rooms/{roomId} に対して update() を1回だけ呼ぶ */
  update(roomId: string, writes: Record<string, Stamp>): Promise<void>;
}

export function formatSkipped(skipped: Skipped[]): string[] {
  if (skipped.length === 0) return [];
  return [
    `写さなかったもの（旧データの形がおかしいもの）: ${skipped.length} 件`,
    ...skipped.map((s) => `  - ${s.date}${s.id ? `/${s.id}` : ''}: ${s.reason}`),
  ];
}

/** 移行を実行する。戻り値は終了コード（0 = 成功） */
export async function runMigration(
  io: MigrationIO,
  opts: { from: string; to: string; map: Record<string, string>; dryRun: boolean },
  log: (line: string) => void,
): Promise<number> {
  const [old, members, existing] = await Promise.all([
    io.readOld(opts.from),
    io.readMembers(opts.to),
    io.readExisting(opts.to),
  ]);
  const plan = planMigration({ old, map: opts.map, members, existing });

  if (!plan.ok) {
    log('エラー: ' + plan.error);
    if (plan.unmapped.length > 0) {
      log('対応表（.secrets/user-map.json）に足りない旧ユーザーID:');
      for (const id of plan.unmapped) log(`  - ${id}`);
    }
    if (plan.notMembers.length > 0) {
      log(`新しいルーム（${opts.to}）の参加者ではない uid:`);
      for (const uid of plan.notMembers) log(`  - ${uid}`);
    }
    for (const l of formatSkipped(plan.skipped)) log(l);
    log('何も書いていません。');
    return 1;
  }

  const count = Object.keys(plan.writes).length;
  log(`旧ルーム ${opts.from} → 新しいルーム ${opts.to}`);
  log(`旧ルームの写せるスタンプ: ${plan.total} 件`);
  log(`すでに新しい側にあるので書かないもの: ${plan.alreadyThere} 件`);
  log(`今回書くもの: ${count} 件`);
  for (const month of Object.keys(plan.perMonth).sort()) log(`  ${month}: ${plan.perMonth[month]} 件`);
  if (plan.ownerMismatch.length > 0) {
    log(`持ち主がちがうスタンプ: ${plan.ownerMismatch.length} 件（すでに新しい側にあり、uid か表示名が対応表とちがう。再実行では直りません）`);
    for (const path of plan.ownerMismatch) log(`  - v2/rooms/${opts.to}/${path}`);
  }
  for (const l of formatSkipped(plan.skipped)) log(l);

  if (opts.dryRun) {
    log('お試しなので、何も書いていません。--write を付けると本当に書き込みます');
    return 0;
  }
  if (count === 0) {
    log('書くものがないので、何も書いていません。');
    return 0;
  }

  await io.update(opts.to, plan.writes);
  log(`書きこみました（${count} 件）。書いた場所:`);
  for (const path of Object.keys(plan.writes)) log(`  v2/rooms/${opts.to}/${path}`);
  return 0;
}

/**
 * 本当に書くかどうか。--write があり、--dry-run がなく、
 * npm に --dry-run を渡していない（npm_config_dry_run が 'true' でない）ときだけ書く
 */
export function resolveDryRun(
  flags: { write: boolean; dryRun: boolean },
  env: Record<string, string | undefined>,
): boolean {
  return !flags.write || flags.dryRun || env.npm_config_dry_run === 'true';
}

/** CLI で捕まえなかったエラーを、短い日本語＋元のエラーの2行にする */
export function describeError(e: unknown): string[] {
  const code = e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined;
  const original = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  const message =
    code === 'EEXIST'
      ? '同じ名前のバックアップがあります。1分待ってからもう一度'
      : '途中で止まりました。データベースへの接続や鍵ファイル、入力を確かめてください';
  return ['エラー: ' + message, `（くわしい内容: ${original}）`];
}

/** .secrets/user-map.json の中身を確かめる */
export function parseUserMap(json: unknown): Record<string, string> {
  if (!json || typeof json !== 'object' || Array.isArray(json))
    throw new Error('対応表の形がおかしいです。{ "旧ユーザーID": "新しいuid", ... } の形にしてください');
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (typeof v !== 'string')
      throw new Error(`対応表の「${k}」の値が文字ではありません。新しいuid を "" で囲んで書いてください`);
    out[k] = v;
  }
  return out;
}
