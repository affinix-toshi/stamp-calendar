import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { handleFeed } from '../../src/worker/feed';
import { resetTokenCacheForTest } from '../../src/worker/googleToken';
import worker, { type Env } from '../../src/worker/index';
import { DB_URL, fakeBackend, makeSa, makeTestKeyPair, saJson } from './helpers';

const ROOM = 'room_A-1';
const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345'; // 32文字
const WRONG = 'abcdefghijklmnopqrstuvwxyz012346';

let env: Env;

beforeAll(async () => {
  const { pem } = await makeTestKeyPair();
  env = { FAMILY_SA_JSON: saJson(makeSa(pem)), FAMILY_DB_URL: DB_URL };
});

beforeEach(() => {
  resetTokenCacheForTest();
  vi.useFakeTimers({ toFake: ['Date'] });
  // 日本時間 2026-11-26 0:30（UTC ではまだ 11-25）
  vi.setSystemTime(new Date('2026-11-25T15:30:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function stamp(label: string, ts: number) {
  return { emoji: '🏠', label, uid: 'u1', userName: 'トシ', ts };
}

function roomData(room = ROOM) {
  return {
    [`v2/rooms/${room}/meta/feedToken`]: TOKEN,
    [`v2/rooms/${room}/meta/name`]: '山田家',
    [`v2/rooms/${room}/stamps`]: {
      '2026-11-26': { s1: stamp('今日の在宅', 10) },
      '2026-11-25': { s2: stamp('昨日の外出', 20) },
      '2026-08-27': { s3: stamp('91日前の古い', 30) }, // 期間外（-90日より前）
      '2026-08-28': { s4: stamp('ちょうど90日前', 40) }, // 期間内
      '2027-11-27': { s5: stamp('366日後', 50) }, // 期間外
    },
    [`v2/rooms/${room}/repeats`]: {
      r1: {
        ...stamp('毎週水曜の習い事', 5),
        weekdays: [3],
        start: '2026-11-01',
        end: '2026-12-31',
      },
    },
  };
}

function req(path: string, method = 'GET') {
  return new Request(`https://stamp.example${path}`, { method });
}

function unfold(s: string) {
  return s.replace(/\r\n /g, '');
}

describe('GET /feed/{roomId}/{token}.ics', () => {
  it('正しい合言葉 → 200。日本時間の今日のスタンプが入る', async () => {
    const be = fakeBackend(roomData());
    const res = await handleFeed(req(`/feed/${ROOM}/${TOKEN}.ics`), env, be.fetchFn);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('max-age=900');
    const body = unfold(await res.text());
    expect(body).toContain('X-WR-CALNAME:スタンプカレンダー（山田家）');
    expect(body).toContain('SUMMARY:🏠今日の在宅（トシ）');
    expect(body).toMatch(/UID:2026-11-26-stamp-s1@stamp-calendar\r\nDTSTAMP:[0-9TZ]+\r\nDTSTART;VALUE=DATE:20261126/);
    expect(body).toContain('SUMMARY:🏠昨日の外出（トシ）');
  });

  it('くり返しは期間内で展開される。期間外の古い・遠いスタンプは入らない', async () => {
    const be = fakeBackend(roomData());
    const res = await handleFeed(req(`/feed/${ROOM}/${TOKEN}.ics`), env, be.fetchFn);
    const body = unfold(await res.text());
    // 2026-11 の水曜: 4, 11, 18, 25 / 12月: 2, 9, 16, 23, 30
    for (const d of ['20261104', '20261125', '20261202', '20261230']) {
      expect(body).toContain(`DTSTART;VALUE=DATE:${d}`);
    }
    expect(body).not.toContain('20270106'); // end の後
    expect(body.match(/毎週水曜の習い事/g)).toHaveLength(9);
    expect(body).toContain('ちょうど90日前');
    expect(body).not.toContain('91日前の古い');
    expect(body).not.toContain('366日後');
  });

  it('合言葉の確認が先。一致してからでないと名前・スタンプは読まない', async () => {
    const be = fakeBackend(roomData());
    await handleFeed(req(`/feed/${ROOM}/${WRONG}.ics`), env, be.fetchFn);
    const dbCalls = be.calls.filter((u) => u.startsWith(DB_URL));
    expect(dbCalls).toEqual([`${DB_URL}/v2/rooms/${ROOM}/meta/feedToken.json`]);
  });

  it('間違った合言葉と、存在しないルームは、まったく同じ 404', async () => {
    const be = fakeBackend(roomData());
    const wrong = await handleFeed(req(`/feed/${ROOM}/${WRONG}.ics`), env, be.fetchFn);
    const missing = await handleFeed(req(`/feed/nope/${TOKEN}.ics`), env, be.fetchFn);
    expect(wrong.status).toBe(404);
    expect(missing.status).toBe(404);
    const [a, b] = [await wrong.text(), await missing.text()];
    expect(a).toBe('Not Found');
    expect(b).toBe(a);
    expect([...wrong.headers]).toEqual([...missing.headers]);
  });

  it.each([
    ['ルームIDに使えない文字', `/feed/ro.om/${TOKEN}.ics`],
    ['ルームIDが長すぎる', `/feed/${'a'.repeat(65)}/${TOKEN}.ics`],
    ['合言葉が短い', `/feed/${ROOM}/abc.ics`],
    ['合言葉が長い', `/feed/${ROOM}/${TOKEN}x.ics`],
    ['合言葉に記号', `/feed/${ROOM}/${TOKEN.slice(0, 31)}-.ics`],
    ['.ics がない', `/feed/${ROOM}/${TOKEN}`],
    ['余分な階層', `/feed/${ROOM}/x/${TOKEN}.ics`],
    ['エンコードされたスラッシュ', `/feed/a%2Fb/${TOKEN}.ics`],
  ])('形がおかしい（%s）→ 同じ 404、通信は一切しない', async (_name, path) => {
    const be = fakeBackend(roomData());
    const spy = vi.fn(be.fetchFn);
    const res = await handleFeed(req(path), env, spy as unknown as typeof fetch);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Not Found');
    expect(spy).not.toHaveBeenCalled();
  });

  it('GET 以外は 404（通信しない）', async () => {
    const be = fakeBackend(roomData());
    const spy = vi.fn(be.fetchFn);
    const res = await handleFeed(req(`/feed/${ROOM}/${TOKEN}.ics`, 'POST'), env, spy as unknown as typeof fetch);
    expect(res.status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
  });

  it('Firebase が 500 → 503。ログに合言葉もパスも出さない', async () => {
    const be = fakeBackend(roomData());
    be.dbStatus = 500;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await handleFeed(req(`/feed/${ROOM}/${TOKEN}.ics`), env, be.fetchFn);
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).not.toContain(TOKEN);
    expect(err).toHaveBeenCalled();
    const logged = JSON.stringify([...err.mock.calls, ...log.mock.calls, ...warn.mock.calls]);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(ROOM);
    expect(logged).not.toContain('/feed/');
    expect(logged).not.toContain(DB_URL);
  });

  it('サービスアカウントが未設定 → 503（合言葉はログに出さない）', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const be = fakeBackend(roomData());
    const res = await handleFeed(req(`/feed/${ROOM}/${TOKEN}.ics`), { FAMILY_DB_URL: DB_URL }, be.fetchFn);
    expect(res.status).toBe(503);
    expect(JSON.stringify(err.mock.calls)).not.toContain(TOKEN);
  });

  it('Worker の入口から /feed/ に届く', async () => {
    const be = fakeBackend(roomData());
    vi.stubGlobal('fetch', be.fetchFn);
    try {
      const res = await worker.fetch(req(`/feed/${ROOM}/${TOKEN}.ics`), env);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('BEGIN:VCALENDAR');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
