import { useEffect, useState } from 'react';
import type { Database } from 'firebase/database';
import { DEMO_ROOM_ID, DEMO_VISITOR_NAME } from '../../shared/demoSeed';
import { ensureDemoMember, subscribeRoom } from '../data';
import type { RoomSnapshot } from '../data';
import { RoomScreen } from './RoomScreen';
import { Toast } from './Toast';

interface Props {
  db: Database;
  uid: string;
}

const MSG_CANNOT_OPEN = '見本を開けませんでした。しばらくしてからもう一度ためしてください。';

/** 見本ルーム（DEMO）。匿名ログインした人を「見学の方」として加え、そのまま開く */
export function DemoRoom({ db, uid }: Props) {
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const isMember = room ? uid in room.members : false;

  useEffect(() => {
    setRoom(null);
    setFailed(false);
    return subscribeRoom(
      db,
      DEMO_ROOM_ID,
      (r) => {
        setRoom(r);
        setFailed(r === null);
      },
      () => setFailed(true),
    );
  }, [db]);

  // 初めて開いたときと、毎朝のリセットで消えたあとに、メンバーとして加わる
  useEffect(() => {
    if (room && !isMember) {
      ensureDemoMember(db, uid).catch((e) => console.error(e));
    }
  }, [db, uid, room !== null, isMember]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return <Toast message={MSG_CANNOT_OPEN} />;
  if (!room) return <p className="loading">読み込み中…</p>;
  return (
    <RoomScreen
      db={db}
      roomId={DEMO_ROOM_ID}
      room={room}
      user={{ uid, name: DEMO_VISITOR_NAME }}
      demo
      // 見本では「ログアウト」は出さない
      onSignOut={() => {}}
    />
  );
}
