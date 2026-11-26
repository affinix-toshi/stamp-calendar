/** Google カレンダーが購読する ICS: GET /feed/{roomId}/{token}.ics */
import { addDays, todayKey } from '../shared/dates';
import { buildIcs } from '../shared/ics';
import { expandRepeats, mergeDay } from '../shared/repeats';
import type { DateKey, DayEntry, Repeat, Stamp } from '../shared/types';
import { rtdbGet, UpstreamError, type RtdbEnv } from './rtdb';

const FEED_PATH = /^\/feed\/([^/]+)\/([^/]+)\.ics$/;
const ROOM_ID = /^[A-Za-z0-9_-]{1,64}$/;
const TOKEN = /^[A-Za-z0-9]{32}$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** ルームがない・合言葉が違う・形がおかしい、どれも同じ返事にする */
function notFound(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function unavailable(): Response {
  return new Response('Service Unavailable', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** 途中で抜けずに全部の文字を比べる（長さは呼ぶ前に 32 に揃っている） */
function sameToken(expected: unknown, given: string): boolean {
  const exp = typeof expected === 'string' ? expected : '';
  let diff = exp.length === given.length ? 0 : 1;
  for (let i = 0; i < given.length; i++) {
    diff |= (exp.charCodeAt(i) || 0) ^ given.charCodeAt(i);
  }
  return diff === 0;
}

function collectEntries(
  stamps: Record<DateKey, Record<string, Stamp>> | null,
  repeats: Record<string, Repeat> | null,
  from: DateKey,
  to: DateKey,
): DayEntry[] {
  const repeatsByDay = new Map<DateKey, DayEntry[]>();
  for (const e of expandRepeats(repeats ?? {}, from, to)) {
    const list = repeatsByDay.get(e.date);
    if (list) list.push(e);
    else repeatsByDay.set(e.date, [e]);
  }
  const days = new Set<DateKey>(repeatsByDay.keys());
  for (const day of Object.keys(stamps ?? {})) {
    if (DATE_KEY.test(day) && day >= from && day <= to) days.add(day);
  }
  return [...days]
    .sort()
    .flatMap((day) => mergeDay(stamps?.[day], repeatsByDay.get(day) ?? [], day));
}

export async function handleFeed(
  request: Request,
  env: RtdbEnv,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return notFound();
  const match = FEED_PATH.exec(new URL(request.url).pathname);
  if (!match) return notFound();
  const [, roomId, token] = match;
  if (!ROOM_ID.test(roomId) || !TOKEN.test(token)) return notFound();

  try {
    const base = `v2/rooms/${roomId}`;
    const feedToken = await rtdbGet<unknown>(env, 'family', `${base}/meta/feedToken`, fetchFn);
    if (!sameToken(feedToken, token)) return notFound();

    const [name, stamps, repeats] = await Promise.all([
      rtdbGet<string>(env, 'family', `${base}/meta/name`, fetchFn),
      rtdbGet<Record<DateKey, Record<string, Stamp>>>(env, 'family', `${base}/stamps`, fetchFn),
      rtdbGet<Record<string, Repeat>>(env, 'family', `${base}/repeats`, fetchFn),
    ]);

    const now = new Date();
    const today = todayKey(now);
    const from = addDays(today, -90);
    const to = addDays(today, 365);
    const ics = buildIcs({
      calendarName: `スタンプカレンダー（${typeof name === 'string' ? name : ''}）`,
      entries: collectEntries(stamps, repeats, from, to),
      now,
    });
    return new Response(request.method === 'HEAD' ? null : ics, {
      status: 200,
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=900' },
    });
  } catch (e) {
    // 合言葉・ルームID・URL はログに出さない。理由の短い言葉だけ
    console.error('feed: upstream error', e instanceof UpstreamError ? e.reason : 'unexpected');
    return unavailable();
  }
}
