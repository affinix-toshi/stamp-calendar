import { useMemo, useState } from 'react';
import { monthGrid, todayKey, weekdayOf } from '../../shared/dates';
import { expandRepeats, mergeDay } from '../../shared/repeats';
import type { DateKey, DayEntry } from '../../shared/types';
import type { RoomSnapshot } from '../data';
import { WEEKDAY_NAMES, dayLabel } from '../format';

interface Props {
  room: RoomSnapshot;
  uid: string;
  onTapDay: (date: DateKey) => void;
  onTapEntry: (entry: DayEntry) => void;
}

/** 押した人の名前（メンバー一覧が正。いなければ押したときの名前） */
export function personName(room: RoomSnapshot, entry: { uid: string; userName: string }): string {
  return room.members[entry.uid]?.name ?? entry.userName;
}

export function Calendar({ room, uid, onTapDay, onTapEntry }: Props) {
  const today = todayKey();
  const [ty, tm] = today.split('-').map(Number);
  const [view, setView] = useState({ year: ty, month0: tm - 1 });

  const cells = useMemo(() => {
    const grid = monthGrid(view.year, view.month0);
    while (grid.length % 7 !== 0) grid.push(null);
    return grid;
  }, [view]);

  const entriesByDay = useMemo(() => {
    const days = cells.filter((c): c is DateKey => c !== null);
    const repeats = expandRepeats(room.repeats, days[0], days[days.length - 1]);
    const out = new Map<DateKey, DayEntry[]>();
    for (const day of days) {
      out.set(
        day,
        mergeDay(
          room.stamps[day],
          repeats.filter((r) => r.date === day),
          day,
        ),
      );
    }
    return out;
  }, [cells, room.stamps, room.repeats]);

  const move = (n: number) =>
    setView(({ year, month0 }) => {
      const m = month0 + n;
      return { year: year + Math.floor(m / 12), month0: ((m % 12) + 12) % 12 };
    });
  const isThisMonth = view.year === ty && view.month0 === tm - 1;

  return (
    <section className="calendar" aria-label="カレンダー">
      <div className="month-nav">
        <h2 className="month-title">
          <span className="month-year">{view.year}年</span>
          <span className="month-num">{view.month0 + 1}</span>
          <span className="month-unit">月</span>
        </h2>
        <button type="button" className="month-step month-prev" aria-label="前の月" onClick={() => move(-1)}>
          ‹
        </button>
        <button type="button" className="month-step" aria-label="次の月" onClick={() => move(1)}>
          ›
        </button>
        {!isThisMonth && (
          <button
            type="button"
            className="month-today"
            onClick={() => setView({ year: ty, month0: tm - 1 })}
          >
            今日
          </button>
        )}
      </div>

      <div className="calendar-sheet">
        <div className="weekdays" aria-hidden="true">
          {WEEKDAY_NAMES.map((w, i) => (
            <span key={w} className={`weekday wd-${i}`}>
              {w}
            </span>
          ))}
        </div>

        <div className="days-grid">
          {cells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} className="day-cell is-empty" />;
            const wd = weekdayOf(day);
            const entries = entriesByDay.get(day) ?? [];
            const classes = ['day-cell', `wd-${wd}`];
            if (day === today) classes.push('is-today');
            if (day < today) classes.push('is-past');
            return (
              <div key={day} className={classes.join(' ')}>
                <button
                  type="button"
                  className="day-hit"
                  aria-label={dayLabel(day)}
                  aria-current={day === today ? 'date' : undefined}
                  onClick={() => onTapDay(day)}
                />
                <span className="day-num" aria-hidden="true">
                  {Number(day.slice(8))}
                </span>
                {entries.length > 0 && (
                  <ul className="day-stamps">
                    {entries.map((e) => {
                      const name = personName(room, e);
                      const mine = e.uid === uid;
                      return (
                        <li key={`${e.source.kind}-${e.source.id}`}>
                          <button
                            type="button"
                            className={`stamp-chip${mine ? ' is-mine' : ''}`}
                            aria-label={`${e.emoji} ${e.label}（${name}）`}
                            onClick={() => onTapEntry(e)}
                          >
                            <span className="stamp-chip-emoji" aria-hidden="true">
                              {e.emoji}
                            </span>
                            <span className="stamp-chip-name" aria-hidden="true">
                              {name}
                            </span>
                            {e.memo && <span className="stamp-chip-memo" aria-hidden="true" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
