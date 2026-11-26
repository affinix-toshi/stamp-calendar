import { useCallback, useEffect, useRef, useState } from 'react';
import type { Database } from 'firebase/database';
import type { DateKey, DayEntry } from '../../shared/types';
import { addStamps } from '../data';
import type { RoomSnapshot, UserInfo } from '../data';
import { shortDate, writeFailed } from '../format';
import { Calendar, personName } from './Calendar';
import { Palette } from './Palette';
import { StampSheet } from './StampSheet';
import { Toast } from './Toast';

interface Props {
  db: Database;
  roomId: string;
  room: RoomSnapshot;
  user: UserInfo;
}

const TOAST_MS = 2800;

export function RoomScreen({ db, roomId, room, user }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [openEntry, setOpenEntry] = useState<DayEntry | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastSeq = useRef(0);

  const showToast = useCallback((text: string) => {
    clearTimeout(toastTimer.current);
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, text });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // 選んでいた種類が消されたら、選択からも外して扱う
  const live = selected.filter((id) => room.stampTypes[id]);

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const tapDay = async (date: DateKey) => {
    if (live.length === 0) {
      showToast('下のスタンプを選んでください');
      return;
    }
    const types = live.map((id) => room.stampTypes[id]);
    try {
      await addStamps(db, roomId, date, types, {
        uid: user.uid,
        name: room.members[user.uid]?.name ?? user.name,
      });
      showToast(`${types.map((t) => t.emoji).join('')}を${shortDate(date)}に押しました`);
    } catch (e) {
      showToast(writeFailed('スタンプを押せませんでした', e));
    }
  };

  const closeSheet = useCallback(() => setOpenEntry(null), []);

  return (
    <main className="room-screen">
      <header className="room-header">
        <h1 className="room-name">{room.meta.name}</h1>
      </header>

      <Calendar room={room} uid={user.uid} onTapDay={tapDay} onTapEntry={setOpenEntry} />

      <Palette
        stampTypes={room.stampTypes}
        selected={live}
        onToggle={toggle}
        onAdd={() => showToast('スタンプの追加は次の更新で使えます')}
      />

      {openEntry && (
        <StampSheet
          key={`${openEntry.source.kind}-${openEntry.source.id}-${openEntry.date}`}
          db={db}
          roomId={roomId}
          entry={openEntry}
          name={personName(room, openEntry)}
          isMine={openEntry.uid === user.uid}
          repeatWeekdays={
            openEntry.source.kind === 'repeat' ? room.repeats[openEntry.source.id]?.weekdays : undefined
          }
          onClose={closeSheet}
          onMessage={showToast}
        />
      )}

      {toast && (
        <div className="toast-layer" key={toast.id}>
          <Toast message={toast.text} />
        </div>
      )}
    </main>
  );
}
