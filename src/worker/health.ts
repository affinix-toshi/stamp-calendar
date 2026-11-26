/** 「元気かどうか」の確認: GET /api/health */
import { rtdbGet, UpstreamError, type RtdbEnv } from './rtdb';

function fail(reason: string): Response {
  return Response.json({ ok: false, reason }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}

export async function handleHealth(env: RtdbEnv, fetchFn: typeof fetch = fetch): Promise<Response> {
  try {
    const value = await rtdbGet<{ ok?: unknown }>(env, 'family', 'v2/health', fetchFn);
    if (value?.ok !== true) {
      console.error('health: unexpected value');
      return fail('unexpected_value');
    }
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const reason = e instanceof UpstreamError ? e.reason : 'unexpected';
    console.error('health:', reason);
    return fail(reason);
  }
}
