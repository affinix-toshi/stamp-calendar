/** 見本ルーム（v2/rooms/DEMO）を、その日を基準にした初期データで丸ごと置き換える */
import { todayKey } from '../shared/dates';
import { buildDemoSeed, DEMO_ROOM_ID } from '../shared/demoSeed';
import { rtdbPut, type RtdbEnv } from './rtdb';

export async function resetDemo(env: RtdbEnv, now: Date, fetchFn: typeof fetch = fetch): Promise<void> {
  await rtdbPut(env, 'demo', `v2/rooms/${DEMO_ROOM_ID}`, buildDemoSeed(todayKey(now)), fetchFn);
}
