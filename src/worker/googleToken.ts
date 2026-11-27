/** Google サービスアカウントの鍵で、Firebase を読むためのアクセストークンを取る */

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE =
  'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email';
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

/** 同じ Worker の中では使い回す（client_email ごと） */
const cache = new Map<string, { token: string; expiresAt: number }>();

export function resetTokenCacheForTest(): void {
  cache.clear();
}

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlJson(value: unknown): string {
  return base64url(encoder.encode(JSON.stringify(value)));
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function signJwt(sa: ServiceAccount, nowSec: number): Promise<string> {
  const header = base64urlJson({ alg: 'RS256', typ: 'JWT' });
  const claims = base64urlJson({
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  });
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const input = `${header}.${claims}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(input));
  return `${input}.${base64url(new Uint8Array(sig))}`;
}

export async function getAccessToken(sa: ServiceAccount, fetchFn: typeof fetch = fetch): Promise<string> {
  const now = Date.now();
  const hit = cache.get(sa.client_email);
  if (hit && now < hit.expiresAt - REFRESH_MARGIN_MS) return hit.token;

  const assertion = await signJwt(sa, Math.floor(now / 1000));
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const data = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number') {
    throw new Error('token exchange returned an unexpected body');
  }
  cache.set(sa.client_email, { token: data.access_token, expiresAt: now + data.expires_in * 1000 });
  return data.access_token;
}
