import { useEffect, useState } from 'react';
import type { Database } from 'firebase/database';
import { weekdayOf } from '../../shared/dates';
import type { DayEntry } from '../../shared/types';
import { checkMemo } from '../../shared/validate';
import { deleteStamp, endRepeatFrom, makeRepeat, setMemo, skipRepeatDate } from '../data';
import { WEEKDAY_NAMES, longDate, writeFailed } from '../format';

interface Props {
  db: Database;
  roomId: string;
  entry: DayEntry;
  /** 押した人の表示名 */
  name: string;
  isMine: boolean;
  /** くり返しのスタンプなら、その曜日 */
  repeatWeekdays?: number[];
  onClose: () => void;
  /** 終わったとき・失敗したときの短いお知らせ */
  onMessage: (message: string) => void;
}

type Mode = 'main' | 'repeat' | 'delete';

function weekdayList(days: number[]): string {
  return [...days].sort((a, b) => a - b).map((d) => WEEKDAY_NAMES[d]).join('・');
}

export function StampSheet({ db, roomId, entry, name, isMine, repeatWeekdays, onClose, onMessage }: Props) {
  const [mode, setMode] = useState<Mode>('main');
  const [memo, setMemoText] = useState(entry.memo ?? '');
  const [weekdays, setWeekdays] = useState<number[]>([weekdayOf(entry.date)]);
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const isRepeat = entry.source.kind === 'repeat';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function run(work: () => Promise<unknown>, done: string, failLead: string) {
    setBusy(true);
    try {
      await work();
      onMessage(done);
      onClose();
    } catch (e) {
      onMessage(writeFailed(failLead, e));
      setBusy(false);
    }
  }

  const memoError = checkMemo(memo);
  const memoChanged = memo !== (entry.memo ?? '');
  const memoCount = Array.from(memo).length;
  const endError = end !== '' && end < entry.date ? '終わりの日は、この日より後にしてください' : null;
  const repeatError = weekdays.length === 0 ? 'くり返す曜日を選んでください' : endError;

  const saveMemo = () =>
    run(
      () => setMemo(db, roomId, { ...entry.source, date: entry.date }, memo),
      'メモを保存しました',
      'メモを保存できませんでした',
    );

  const startRepeat = () => {
    if (entry.source.kind !== 'stamp') return;
    const id = entry.source.id;
    run(
      () => makeRepeat(db, roomId, entry.date, id, [...weekdays].sort((a, b) => a - b), end === '' ? undefined : end),
      `毎週 ${weekdayList(weekdays)} にくり返します`,
      'くり返しを設定できませんでした',
    );
  };

  const removeStamp = () => {
    if (entry.source.kind !== 'stamp') return;
    const id = entry.source.id;
    run(() => deleteStamp(db, roomId, entry.date, id), '削除しました', '削除できませんでした');
  };

  const removeRepeat = (scope: 'day' | 'after') => {
    const id = entry.source.id;
    run(
      () =>
        scope === 'day'
          ? skipRepeatDate(db, roomId, id, entry.date)
          : endRepeatFrom(db, roomId, id, entry.date),
      '削除しました',
      '削除できませんでした',
    );
  };

  const toggleDay = (d: number) =>
    setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${entry.emoji} ${entry.label}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <header className="sheet-head">
          <span className={`sheet-emoji${isMine ? ' is-mine' : ''}`} aria-hidden="true">
            {entry.emoji}
          </span>
          <div className="sheet-title">
            <p className="sheet-label">{entry.label}</p>
            <p className="sheet-meta">
              <span>{longDate(entry.date)}</span>
              <span className="sheet-person">{name}</span>
            </p>
            {isRepeat && (
              <p className="sheet-repeat-note">
                {repeatWeekdays && repeatWeekdays.length > 0
                  ? `毎週 ${weekdayList(repeatWeekdays)} にくり返し中`
                  : 'くり返し中'}
              </p>
            )}
          </div>
          <button type="button" className="sheet-close" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </header>

        {!isMine && (
          <div className="sheet-body">
            {entry.memo ? <p className="sheet-memo">{entry.memo}</p> : <p className="sheet-empty">メモはありません</p>}
          </div>
        )}

        {isMine && mode === 'main' && (
          <div className="sheet-body">
            <div className="field">
              <div className="field-row">
                <label htmlFor="stamp-memo" className="field-label">
                  メモ
                </label>
                <span className={`field-count${memoError ? ' is-over' : ''}`}>{memoCount}/20</span>
              </div>
              <input
                id="stamp-memo"
                className="field-input"
                type="text"
                value={memo}
                placeholder={isRepeat ? '例：18時から（くり返しの全部の日に付きます）' : '例：18時から'}
                onChange={(e) => setMemoText(e.target.value)}
              />
              {memoError && (
                <p className="field-error" role="alert">
                  {memoError}
                </p>
              )}
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || memoError !== null || !memoChanged}
                onClick={saveMemo}
              >
                メモを保存
              </button>
            </div>
            <div className="sheet-actions">
              {!isRepeat && (
                <button type="button" className="btn btn-soft" disabled={busy} onClick={() => setMode('repeat')}>
                  くり返し
                </button>
              )}
              <button type="button" className="btn btn-danger-soft" disabled={busy} onClick={() => setMode('delete')}>
                削除
              </button>
            </div>
          </div>
        )}

        {isMine && mode === 'repeat' && (
          <div className="sheet-body">
            <fieldset className="field">
              <legend className="field-label">くり返す曜日</legend>
              <div className="weekday-picks">
                {WEEKDAY_NAMES.map((w, d) => (
                  <label key={w} className={`weekday-pick wd-${d}`}>
                    <input type="checkbox" checked={weekdays.includes(d)} onChange={() => toggleDay(d)} />
                    <span>{w}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="repeat-end" className="field-label">
                終わりの日（なくてもOK）
              </label>
              <input
                id="repeat-end"
                className="field-input"
                type="date"
                min={entry.date}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
            {repeatError && (
              <p className="field-error" role="alert">
                {repeatError}
              </p>
            )}
            <div className="sheet-actions">
              <button type="button" className="btn btn-soft" disabled={busy} onClick={() => setMode('main')}>
                もどる
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || repeatError !== null}
                onClick={startRepeat}
              >
                くり返しを始める
              </button>
            </div>
          </div>
        )}

        {isMine && mode === 'delete' && (
          <div className="sheet-body">
            <p className="sheet-question">
              {isRepeat ? 'どの日を削除しますか？' : `${entry.emoji} ${entry.label} を削除しますか？`}
            </p>
            {isRepeat ? (
              <div className="sheet-actions is-stacked">
                <button type="button" className="btn btn-danger" disabled={busy} onClick={() => removeRepeat('day')}>
                  この日だけ
                </button>
                <button type="button" className="btn btn-danger" disabled={busy} onClick={() => removeRepeat('after')}>
                  この日以降すべて
                </button>
                <button type="button" className="btn btn-soft" disabled={busy} onClick={() => setMode('main')}>
                  やめる
                </button>
              </div>
            ) : (
              <div className="sheet-actions">
                <button type="button" className="btn btn-soft" disabled={busy} onClick={() => setMode('main')}>
                  やめる
                </button>
                <button type="button" className="btn btn-danger" disabled={busy} onClick={removeStamp}>
                  削除する
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
