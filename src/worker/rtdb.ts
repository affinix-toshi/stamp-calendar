/** Firebase Realtime Database を REST で読み書きする（firebase-admin は Workers で動きにくいため） */
import { getAccessToken, type ServiceAccount } from './googleToken';

export interface RtdbEnv {
  FAMILY_SA_JSON?: string;
  DEMO_SA_JSON?: string;
  FAMILY_DB_URL?: string;
  DEMO_DB_URL?: string;
}

export type RtdbTarget = 'family' | 'demo';

/** 外への通信が止まったままにならないよう、10秒で打ち切る */
export const UPSTREAM_TIMEOUT_MS = 10_000;

/** 外へ出してよい短い理由だけを持つエラー（鍵・URL・パスは入れない） */
export class UpstreamError extends Error {
  constructor(readonly reason: 'not_configured' | 'token_failed' | 'db_error') {
    super(reason);
    this.name = 'UpstreamError';
  }
}

function config(env: RtdbEnv, target: RtdbTarget): { sa: ServiceAccount; dbUrl: string } {
  const json = target === 'family' ? env.FAMILY_SA_JSON : env.DEMO_SA_JSON;
  const dbUrl = (target === 'family' ? env.FAMILY_DB_URL : env.DEMO_DB_URL)?.replace(/\/+$/, '');
  if (!json || !dbUrl) throw new UpstreamError('not_configured');
  let sa: ServiceAccount;
  try {
    const parsed = JSON.parse(json) as Partial<ServiceAccount>;
    if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') {
      throw new Error('bad');
    }
    sa = { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    throw new UpstreamError('not_configured');
  }
  return { sa, dbUrl };
}

async function request(
  env: RtdbEnv,
  target: RtdbTarget,
  path: string,
  init: RequestInit,
  fetchFn: typeof fetch,
): Promise<Response> {
  const { sa, dbUrl } = config(env, target);
  let token: string;
  try {
    token = await getAccessToken(sa, fetchFn);
  } catch {
    throw new UpstreamError('token_failed');
  }
  let res: Response;
  try {
    res = await fetchFn(`${dbUrl}/${path}.json`, {
      ...init,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new UpstreamError('db_error');
  }
  if (!res.ok) throw new UpstreamError('db_error');
  return res;
}

export async function rtdbGet<T>(
  env: RtdbEnv,
  target: RtdbTarget,
  path: string,
  fetchFn: typeof fetch = fetch,
): Promise<T | null> {
  const res = await request(env, target, path, { method: 'GET' }, fetchFn);
  try {
    return (await res.json()) as T | null;
  } catch {
    throw new UpstreamError('db_error');
  }
}

export async function rtdbPut(
  env: RtdbEnv,
  target: RtdbTarget,
  path: string,
  value: unknown,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const res = await request(
    env,
    target,
    path,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) },
    fetchFn,
  );
  await res.body?.cancel();
}
