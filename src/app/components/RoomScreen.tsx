import type { Database } from 'firebase/database';
import type { RoomSnapshot, UserInfo } from '../data';

interface Props {
  db: Database;
  roomId: string;
  room: RoomSnapshot;
  user: UserInfo;
}

/** いまは仮の画面。Task 8 でカレンダーに置き換える */
export function RoomScreen({ room }: Props) {
  return (
    <main className="room-screen">
      <h1>{room.meta.name}</h1>
    </main>
  );
}
