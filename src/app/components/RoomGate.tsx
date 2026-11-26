import { useEffect, useState } from 'react';
import type { Database } from 'firebase/database';
import { createRoom, joinRoom, listMyRooms, subscribeRoom } from '../data';
import type { RoomSnapshot, UserInfo } from '../data';
import type { Route } from '../router';
import { RoomScreen } from './RoomScreen';
import { Toast } from './Toast';

interface Props {
  db: Database;
  user: UserInfo;
  route: Route;
}

const MSG_JOIN_FAILED = '招待URLが古いか、まちがっています。もう一度もらってください。';
const MSG_CANNOT_OPEN = 'このルームを開けません。招待URLをもらってください。';
const MSG_CANNOT_CREATE = 'このアカウントではルームを作れません。家族から招待URLをもらってください。';
const DEFAULT_ROOM_NAME = 'わが家';

type Phase =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | { kind: 'open'; roomId: string };

export function RoomGate({ db, user, route }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [roomError, setRoomError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [roomName, setRoomName] = useState(DEFAULT_ROOM_NAME);
  const [createError, setCreateError] = useState('');

  const routeKey = route.name === 'join' ? `join/${route.roomId}/${route.code}` : route.name;

  // 入るルームを決める
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mine = await listMyRooms(db, user.uid);
        if (route.name === 'join') {
          if (!mine.includes(route.roomId)) {
            try {
              await joinRoom(db, user, route.roomId, route.code);
            } catch {
              if (!cancelled) setPhase({ kind: 'error', message: MSG_JOIN_FAILED });
              return;
            }
          }
          window.history.replaceState(null, '', '/');
          if (!cancelled) setPhase({ kind: 'open', roomId: route.roomId });
          return;
        }
        if (!cancelled) setPhase(mine.length > 0 ? { kind: 'open', roomId: mine[0] } : { kind: 'none' });
      } catch {
        if (!cancelled) setPhase({ kind: 'error', message: MSG_CANNOT_OPEN });
      }
    })();
    return () => {
      cancelled = true;
    };
    // user は uid と name が同じなら実質同じ。再読み込みを避けるため uid だけを見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, user.uid, routeKey]);

  const openRoomId = phase.kind === 'open' ? phase.roomId : null;

  // 開いたルームを購読する
  useEffect(() => {
    if (!openRoomId) return;
    setRoom(null);
    setRoomError(false);
    return subscribeRoom(
      db,
      openRoomId,
      (r) => {
        setRoom(r);
        setRoomError(r === null);
      },
      () => setRoomError(true),
    );
  }, [db, openRoomId]);

  async function create() {
    setCreateError('');
    try {
      const roomId = await createRoom(db, user, roomName);
      setPhase({ kind: 'open', roomId });
    } catch (e) {
      const text = e instanceof Error ? e.message : '';
      if (/permission[_ ]denied/i.test(text)) setCreateError(MSG_CANNOT_CREATE);
      else setCreateError(text || 'ルームを作れませんでした。もう一度ためしてください。');
    }
  }

  if (phase.kind === 'loading') return <p className="loading">読み込み中…</p>;
  if (phase.kind === 'error') return <Toast message={phase.message} />;

  if (phase.kind === 'open') {
    if (roomError) return <Toast message={MSG_CANNOT_OPEN} />;
    if (!room) return <p className="loading">読み込み中…</p>;
    return <RoomScreen db={db} roomId={phase.roomId} room={room} user={user} />;
  }

  return (
    <section className="room-gate">
      <p>招待URLをもらってください</p>
      {creating ? (
        <div>
          <label>
            ルームの名前
            <input value={roomName} onChange={(e) => setRoomName(e.target.value)} />
          </label>
          <button type="button" onClick={create}>
            作る
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setCreating(true)}>
          家族のルームを作る
        </button>
      )}
      {createError && <Toast message={createError} />}
    </section>
  );
}
