import { useCallback, useEffect, useRef, useState } from 'react';
import type { Database } from 'firebase/database';
import type { DateKey, DayEntry } from '../../shared/types';
import { addStamps, subscribeConnected } from '../data';
import type { RoomSnapshot, UserInfo } from '../data';
import { OFFLINE_NOTE, shortDate, writeFailed } from '../format';
import { Calendar, dayEntries, personName } from './Calendar';
import { DaySheet } from './DaySheet';
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
/** 開いた直後はまだつながっていないことが多いので、少し待ってから案内する */
const FIRST_CONNECT_GRACE_MS = 3000;

/**
 * サーバーとつながっているか。
 * 一度つながったあとに切れたらすぐ、最初からつながらないときは少し待ってから false にする。
 */
function useOnline(db: Database): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let everConnected = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeConnected(db, (connected) => {
      clearTimeout(timer);
      if (connected) {
        everConnected = true;
        setOnline(true);
      } else if (everConnected) {
        setOnline(false);
      } else {
        timer = setTimeout(() => setOnline(false), FIRST_CONNECT_GRACE_MS);
      }
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [db]);
  return online;
}

export function RoomScreen({ db, roomId, room, user }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [openEntry, setOpenEntry] = useState<DayEntry | null>(null);
  const [openDay, setOpenDay] = useState<DateKey | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastSeq = useRef(0);
  const online = useOnline(db);

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
      // 何も選んでいないとき：スタンプがある日はその日の一覧を大きく出す
      if (dayEntries(room, date).length > 0) setOpenDay(date);
      else showToast('下のスタンプを選んでください');
      return;
    }
    const types = live.map((id) => room.stampTypes[id]);
    const done = `${types.map((t) => t.emoji).join('')}を${shortDate(date)}に押しました`;
    const write = addStamps(db, roomId, date, types, {
      uid: user.uid,
      name: room.members[user.uid]?.name ?? user.name,
    });
    if (!online) {
      // つながっていないと返事が来ないので待たない（画面には先に反映される）
      showToast(done + OFFLINE_NOTE);
      write.catch((e) => showToast(writeFailed('スタンプを押せませんでした', e)));
      return;
    }
    try {
      await write;
      showToast(done);
    } catch (e) {
      showToast(writeFailed('スタンプを押せませんでした', e));
    }
  };

  const closeSheet = useCallback(() => setOpenEntry(null), []);
  const closeDay = useCallback(() => setOpenDay(null), []);
  const openDayEntries = openDay ? dayEntries(room, openDay) : [];

  return (
    <main className="room-screen">
      <header className="room-header">
        <h1 className="room-name">{room.meta.name}</h1>
      </header>

      {!online && (
        <p className="offline-banner" role="status">
          ⚠️ オフライン中 — 変更はつながったときに反映されます
        </p>
      )}

      <Calendar room={room} uid={user.uid} onTapDay={tapDay} onTapEntry={setOpenEntry} />

      <Palette
        stampTypes={room.stampTypes}
        selected={live}
        onToggle={toggle}
        onAdd={() => showToast('スタンプの追加は次の更新で使えます')}
      />

      {openDay && openDayEntries.length > 0 && (
        <DaySheet
          date={openDay}
          entries={openDayEntries}
          nameOf={(e) => personName(room, e)}
          uid={user.uid}
          onPick={(e) => {
            setOpenDay(null);
            setOpenEntry(e);
          }}
          onClose={closeDay}
        />
      )}

      {openEntry && (
        <StampSheet
          key={`${openEntry.source.kind}-${openEntry.source.id}-${openEntry.date}`}
          db={db}
          roomId={roomId}
          entry={openEntry}
          name={personName(room, openEntry)}
          isMine={openEntry.uid === user.uid}
          online={online}
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
