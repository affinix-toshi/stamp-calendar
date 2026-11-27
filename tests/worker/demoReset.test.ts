import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDemoSeed } from '../../src/shared/demoSeed';
import { resetDemo } from '../../src/worker/demoReset';
import { resetTokenCacheForTest } from '../../src/worker/googleToken';
import worker, { type Env } from '../../src/worker/index';
import { makeSa, makeTestKeyPair, saJson, TOKEN_URL } from './helpers';

const DEMO_URL = 'https://demo-test.example.firebasedatabase.app';
// 日本時間 2026-11-26 3:00（UTC 11-25 18:00）。cron が動く時刻
const NOW = new Date('2026-11-25T18:00:00Z');

let env: Env;

beforeAll(async () => {
  const { pem } = await makeTestKeyPair();
  env = { DEMO_SA_JSON: saJson(makeSa(pem, 'demo@test.iam.gserviceaccount.com')), DEMO_DB_URL: DEMO_URL };
});

beforeEach(() => {
  resetTokenCacheForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

interface Recorded {
  url: string;
  method: string;
  body?: string;
}

/** 見本用データベースへの呼び出しを記録するにせ物 */
function demoBackend(dbStatus = 200) {
  const calls: Recorded[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
    if (url === TOKEN_URL) return Response.json({ access_token: 'test-access-token', expires_in: 3600 });
    if (url.startsWith(DEMO_URL + '/')) {
      return dbStatus === 200 ? Response.json({}) : new Response('{"error":"boom"}', { status: dbStatus });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  return { calls, fetchFn, dbCalls: () => calls.filter((c) => c.url.startsWith(DEMO_URL)) };
}

describe('resetDemo', () => {
  it('v2/rooms/DEMO へ PUT を1回だけ行い、中身は今日基準の見本', async () => {
    const be = demoBackend();
    await resetDemo(env, NOW, be.fetchFn);
    const db = be.dbCalls();
    expect(db).toHaveLength(1);
    expect(db[0].method).toBe('PUT');
    expect(db[0].url).toBe(`${DEMO_URL}/v2/rooms/DEMO.json`);
    expect(JSON.parse(db[0].body!)).toEqual(JSON.parse(JSON.stringify(buildDemoSeed('2026-11-26'))));
  });

  it('設定がなければ not_configured で止まる', async () => {
    const be = demoBackend();
    await expect(resetDemo({}, NOW, be.fetchFn)).rejects.toMatchObject({ reason: 'not_configured' });
    expect(be.calls).toHaveLength(0);
  });
});

describe('POST /api/demo/reset', () => {
  function post(method = 'POST') {
    return new Request('https://stamp.example/api/demo/reset', { method });
  }

  it('POST で見本を作り直し、200 {ok:true}', async () => {
    const be = demoBackend();
    vi.stubGlobal('fetch', be.fetchFn);
    const res = await worker.fetch(post(), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(be.dbCalls()).toHaveLength(1);
  });

  it.each(['GET', 'PUT', 'DELETE', 'HEAD'])('%s は 404 で、何も書かない', async (method) => {
    const be = demoBackend();
    vi.stubGlobal('fetch', be.fetchFn);
    const res = await worker.fetch(post(method), env);
    expect(res.status).toBe(404);
    expect(be.calls).toHaveLength(0);
  });

  it('設定がない → 503 not_configured。秘密をログに出さない', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await worker.fetch(post(), { DEMO_DB_URL: DEMO_URL });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'not_configured' });
    const noUrl = await worker.fetch(post(), { DEMO_SA_JSON: env.DEMO_SA_JSON });
    expect(noUrl.status).toBe(503);
    expect(JSON.stringify(err.mock.calls)).not.toContain('PRIVATE KEY');
    expect(JSON.stringify(err.mock.calls)).not.toContain(DEMO_URL);
  });

  it('データベースの失敗 → 503（中身を返さない）', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const be = demoBackend(500);
    vi.stubGlobal('fetch', be.fetchFn);
    const res = await worker.fetch(post(), env);
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toContain('boom');
    expect(text).not.toContain(DEMO_URL);
  });
});

describe('scheduled（毎日 日本時間 3:00）', () => {
  function controller() {
    return { scheduledTime: NOW.getTime(), cron: '0 18 * * *' } as ScheduledController;
  }
  function context(pending: Promise<unknown>[]) {
    return { waitUntil: (p: Promise<unknown>) => pending.push(p) } as unknown as ExecutionContext;
  }

  it('見本を作り直す', async () => {
    const be = demoBackend();
    vi.stubGlobal('fetch', be.fetchFn);
    const pending: Promise<unknown>[] = [];
    await worker.scheduled!(controller(), env, context(pending));
    await Promise.all(pending);
    const db = be.dbCalls();
    expect(db).toHaveLength(1);
    expect(db[0].url).toBe(`${DEMO_URL}/v2/rooms/DEMO.json`);
    expect(JSON.parse(db[0].body!).stamps).toBeDefined();
  });

  it('失敗してもログだけ（理由の短い言葉のみ）で落ちない', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pending: Promise<unknown>[] = [];
    await worker.scheduled!(controller(), {}, context(pending));
    await expect(Promise.all(pending)).resolves.toBeDefined();
    expect(err).toHaveBeenCalled();
  });
});

describe('wrangler.jsonc', () => {
  it('cron は 0 18 * * *（日本時間 3:00）', () => {
    const text = readFileSync('wrangler.jsonc', 'utf8');
    expect(text).toMatch(/"crons"\s*:\s*\[\s*"0 18 \* \* \*"\s*\]/);
  });
});
