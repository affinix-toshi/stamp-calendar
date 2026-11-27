import type { ServiceAccount } from '../../src/worker/googleToken';

export const DB_URL = 'https://family-test.example.firebasedatabase.app';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function toBase64(buf: ArrayBuffer): string {
  let bin = '';
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** テスト専用の使い捨て RSA 鍵を作り、PKCS8 の PEM にする */
export async function makeTestKeyPair(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const pkcs8 = (await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer;
  const b64 = toBase64(pkcs8).replace(/(.{64})/g, '$1\n');
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`;
  return { pem, publicKey: pair.publicKey };
}

export function makeSa(pem: string, email = 'feed@test.iam.gserviceaccount.com'): ServiceAccount {
  return { client_email: email, private_key: pem };
}

/** サービスアカウント JSON（秘密の中身と同じ形）。改行は \n でエスケープされた文字列になる */
export function saJson(sa: ServiceAccount): string {
  return JSON.stringify({ type: 'service_account', ...sa });
}

export interface FakeBackend {
  fetchFn: typeof fetch;
  calls: string[];
  /** DB のパスごとのデータ（`v2/rooms/r1/meta/feedToken` など） */
  data: Record<string, unknown>;
  dbStatus: number;
}

/** Google のトークン交換と Firebase の REST をまねる */
export function fakeBackend(data: Record<string, unknown> = {}): FakeBackend {
  const backend: FakeBackend = {
    calls: [],
    data,
    dbStatus: 200,
    fetchFn: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      backend.calls.push(url);
      if (url === TOKEN_URL) {
        return Response.json({ access_token: 'test-access-token', expires_in: 3600, token_type: 'Bearer' });
      }
      if (url.startsWith(DB_URL + '/')) {
        const headers = new Headers(init?.headers);
        if (headers.get('Authorization') !== 'Bearer test-access-token') {
          return new Response('{"error":"Permission denied"}', { status: 401 });
        }
        if (backend.dbStatus !== 200) {
          return new Response('{"error":"boom"}', { status: backend.dbStatus });
        }
        const path = url.slice(DB_URL.length + 1).replace(/\.json$/, '');
        const value = path in backend.data ? backend.data[path] : null;
        return Response.json(value);
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch,
  };
  return backend;
}
