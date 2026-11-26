import { useEffect } from 'react';
import type { DateKey, DayEntry } from '../../shared/types';
import { dayLabel, longDate } from '../format';

interface Props {
  date: DateKey;
  entries: DayEntry[];
  /** 押した人の表示名 */
  nameOf: (entry: DayEntry) => string;
  uid: string;
  onPick: (entry: DayEntry) => void;
  onClose: () => void;
}

/** その日のスタンプを大きな行で並べる（カレンダーの小さなスタンプを押しにくい人向け） */
export function DaySheet({ date, entries, nameOf, uid, onPick, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${dayLabel(date)}のスタンプ`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <header className="sheet-head">
          <div className="sheet-title">
            <p className="sheet-label">{longDate(date)}</p>
          </div>
          <button type="button" className="sheet-close" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </header>
        <ul className="day-list">
          {entries.map((e) => {
            const name = nameOf(e);
            const mine = e.uid === uid;
            return (
              <li key={`${e.source.kind}-${e.source.id}`}>
                <button
                  type="button"
                  className={`day-row${mine ? ' is-mine' : ''}`}
                  aria-label={`${e.emoji} ${e.label} ${name}${e.memo ? ` ${e.memo}` : ''}`}
                  onClick={() => onPick(e)}
                >
                  <span className="day-row-emoji" aria-hidden="true">
                    {e.emoji}
                  </span>
                  <span className="day-row-text">
                    <span className="day-row-label">
                      {e.label}
                      {e.source.kind === 'repeat' && <span className="day-row-repeat">くり返し</span>}
                    </span>
                    {e.memo && <span className="day-row-memo">{e.memo}</span>}
                  </span>
                  <span className="day-row-person">{name}</span>
                  <span className="day-row-arrow" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
