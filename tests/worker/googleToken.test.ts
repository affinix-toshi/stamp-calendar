import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { getAccessToken, resetTokenCacheForTest } from '../../src/worker/googleToken';
import { makeTestKeyPair, makeSa, TOKEN_URL } from './helpers';

let pem: string;
let publicKey: CryptoKey;

beforeAll(async () => {
  ({ pem, publicKey } = await makeTestKeyPair());
});

beforeEach(() => {
  resetTokenCacheForTest();
});

afterEach(() => {
  vi.useRealTimers();
});

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function decodePart(s: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

/** トークン交換の窓口をまねて、JWT の署名を公開鍵で本当に確かめる */
function verifyingTokenEndpoint(expiresIn = 3600) {
  const seen: { header: Record<string, unknown>; claims: Record<string, unknown>; valid: boolean }[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe(TOKEN_URL);
    expect(init?.method).toBe('POST');
    const form = new URLSearchParams(String(init?.body));
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const jwt = form.get('assertion')!;
    const [h, c, sig] = jwt.split('.');
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      b64urlToBytes(sig),
      new TextEncoder().encode(`${h}.${c}`),
    );
    seen.push({ header: decodePart(h), claims: decodePart(c), valid });
    if (!valid) return new Response('{"error":"invalid_grant"}', { status: 400 });
    return Response.json({ access_token: `at-${seen.length}`, expires_in: expiresIn });
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, mock: fetchFn, seen };
}

describe('getAccessToken', () => {
  it('RS256 で署名した JWT を交換して、アクセストークンを返す', async () => {
    const ep = verifyingTokenEndpoint();
    const token = await getAccessToken(makeSa(pem), ep.fetchFn);
    expect(token).toBe('at-1');
    expect(ep.seen).toHaveLength(1);
    const { header, claims, valid } = ep.seen[0];
    expect(valid).toBe(true);
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(claims.iss).toBe('feed@test.iam.gserviceaccount.com');
    expect(claims.aud).toBe(TOKEN_URL);
    expect(claims.scope).toBe(
      'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    );
    expect(typeof claims.iat).toBe('number');
    expect(claims.exp).toBe((claims.iat as number) + 3600);
  });

  it('秘密の JSON の \\n エスケープ（文字どおりの「\\」「n」）の鍵でも署名できる', async () => {
    const ep = verifyingTokenEndpoint();
    const escaped = pem.replace(/\n/g, '\\n');
    await expect(getAccessToken(makeSa(escaped), ep.fetchFn)).resolves.toBe('at-1');
    expect(ep.seen[0].valid).toBe(true);
  });

  it('2回呼んでも、トークンの交換は1回だけ', async () => {
    const ep = verifyingTokenEndpoint();
    const sa = makeSa(pem);
    const a = await getAccessToken(sa, ep.fetchFn);
    const b = await getAccessToken(sa, ep.fetchFn);
    expect(a).toBe('at-1');
    expect(b).toBe('at-1');
    expect(ep.mock).toHaveBeenCalledTimes(1);
  });

  it('期限の5分前を過ぎたら取り直す', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-26T00:00:00Z'));
    const ep = verifyingTokenEndpoint(3600);
    const sa = makeSa(pem);
    expect(await getAccessToken(sa, ep.fetchFn)).toBe('at-1');
    vi.setSystemTime(new Date('2026-11-26T00:54:00Z')); // 残り6分 → まだ使う
    expect(await getAccessToken(sa, ep.fetchFn)).toBe('at-1');
    vi.setSystemTime(new Date('2026-11-26T00:55:01Z')); // 残り5分を切った → 取り直す
    expect(await getAccessToken(sa, ep.fetchFn)).toBe('at-2');
    expect(ep.mock).toHaveBeenCalledTimes(2);
  });

  it('client_email ごとに別々に覚える', async () => {
    const ep = verifyingTokenEndpoint();
    await getAccessToken(makeSa(pem, 'a@test'), ep.fetchFn);
    await getAccessToken(makeSa(pem, 'b@test'), ep.fetchFn);
    expect(ep.mock).toHaveBeenCalledTimes(2);
  });

  it('交換に失敗したらエラーになり、覚えない', async () => {
    const bad = vi.fn(async () => new Response('{"error":"invalid_grant"}', { status: 400 }));
    await expect(getAccessToken(makeSa(pem), bad as unknown as typeof fetch)).rejects.toThrow();
    const ep = verifyingTokenEndpoint();
    await expect(getAccessToken(makeSa(pem), ep.fetchFn)).resolves.toBe('at-1');
  });
});
