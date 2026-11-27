import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { handleHealth } from '../../src/worker/health';
import { resetTokenCacheForTest } from '../../src/worker/googleToken';
import { rtdbGet, rtdbPut } from '../../src/worker/rtdb';
import worker, { type Env } from '../../src/worker/index';
import { DB_URL, fakeBackend, makeSa, makeTestKeyPair, saJson } from './helpers';

let env: Env;
let pem: string;

beforeAll(async () => {
  ({ pem } = await makeTestKeyPair());
  env = { FAMILY_SA_JSON: saJson(makeSa(pem)), FAMILY_DB_URL: DB_URL };
});

beforeEach(() => {
  resetTokenCacheForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/health', () => {
  it('v2/health が読める → 200 {ok:true}', async () => {
    const be = fakeBackend({ 'v2/health': { ok: true } });
    const res = await handleHealth(env, be.fetchFn);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(be.calls).toContain(`${DB_URL}/v2/health.json`);
  });

  it('Firebase が 500 → 503 {ok:false, reason}', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const be = fakeBackend({ 'v2/health': { ok: true } });
    be.dbStatus = 500;
    const res = await handleHealth(env, be.fetchFn);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; reason: string };
    expect(body.ok).toBe(false);
    expect(typeof body.reason).toBe('string');
    expect(body.reason.length).toBeGreaterThan(0);
    expect(body.reason.length).toBeLessThan(40);
  });

  it('v2/health が空 → 503', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const be = fakeBackend({});
    const res = await handleHealth(env, be.fetchFn);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(false);
  });

  it('サービスアカウントが未設定 → 503（秘密の中身は返さない）', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const be = fakeBackend({ 'v2/health': { ok: true } });
    const res = await handleHealth({ FAMILY_DB_URL: DB_URL }, be.fetchFn);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, reason: 'not_configured' });
  });

  it('Worker の入口から /api/health に届く', async () => {
    const be = fakeBackend({ 'v2/health': { ok: true } });
    vi.stubGlobal('fetch', be.fetchFn);
    try {
      const res = await worker.fetch(new Request('https://stamp.example/api/health'), env);
      expect(res.status).toBe(200);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('rtdb', () => {
  it('rtdbGet は {databaseURL}/{path}.json を Bearer 付きで読む', async () => {
    const be = fakeBackend({ 'v2/x': { a: 1 } });
    expect(await rtdbGet(env, 'family', 'v2/x', be.fetchFn)).toEqual({ a: 1 });
    expect(await rtdbGet(env, 'family', 'v2/none', be.fetchFn)).toBeNull();
  });

  it('rtdbPut は PUT で JSON を送る', async () => {
    const sent: { url: string; method?: string; body?: unknown }[] = [];
    const be = fakeBackend({});
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith(DB_URL)) {
        sent.push({ url, method: init?.method, body: init?.body });
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-access-token');
        return Response.json({ ok: true });
      }
      return be.fetchFn(input, init);
    }) as typeof fetch;
    await rtdbPut(env, 'family', 'v2/health', { ok: true }, fetchFn);
    expect(sent).toEqual([{ url: `${DB_URL}/v2/health.json`, method: 'PUT', body: '{"ok":true}' }]);
  });

  it('demo の設定が空なら使えない（エラー）', async () => {
    const be = fakeBackend({});
    await expect(rtdbGet(env, 'demo', 'v2/health', be.fetchFn)).rejects.toThrow();
  });
});
