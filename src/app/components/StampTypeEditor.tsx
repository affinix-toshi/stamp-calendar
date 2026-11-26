import { useState } from 'react';
import type { Database } from 'firebase/database';
import type { StampType } from '../../shared/types';
import { checkLabel } from '../../shared/validate';
import { deleteStampType, reorderStampTypes, saveStampType } from '../data';
import { OFFLINE_NOTE, writeFailed } from '../format';
import { sortedTypes } from './Palette';
import { Sheet } from './Sheet';

interface Props {
  db: Database;
  roomId: string;
  stampTypes: Record<string, StampType>;
  /** サーバーとつながっているか（false なら返事を待たずに進む） */
  online?: boolean;
  onClose: () => void;
  onMessage: (message: string) => void;
}

/** タップして選べる絵文字の候補 */
export const SUGGESTED_EMOJI = [
  '🏠', '🍽️', '🏃', '🛒', '🧹', '🧺', '🍳', '🚗',
  '📚', '🎵', '🐶', '🐱', '💊', '🛁', '🌱', '🎂',
  '🎉', '⚽', '🚲', '☕', '💼', '🏥', '✈️', '❤️',
];

const EMOJI_MAX_UNITS = 16; // データベースの規則（文字数ではなく内部の長さ）に合わせる

type Mode = { kind: 'list' } | { kind: 'form'; typeId: string | null } | { kind: 'delete'; typeId: string };

function checkEmojiField(s: string): string | null {
  if (s.trim() === '') return '絵文字を入力してください';
  if (s.trim().length > EMOJI_MAX_UNITS) return '絵文字は1つだけ入れてください';
  return null;
}

export function StampTypeEditor({ db, roomId, stampTypes, online = true, onClose, onMessage }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [emoji, setEmoji] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const sorted = sortedTypes(stampTypes);

  async function run(work: () => Promise<unknown>, done: string, failLead: string, after?: () => void) {
    if (!online) {
      // つながっていないと返事が来ないので待たない（画面には先に反映される）
      work().catch((e) => onMessage(writeFailed(failLead, e)));
      onMessage(done + OFFLINE_NOTE);
      after?.();
      return;
    }
    setBusy(true);
    try {
      await work();
      onMessage(done);
      after?.();
    } catch (e) {
      onMessage(writeFailed(failLead, e));
    } finally {
      setBusy(false);
    }
  }

  function openForm(typeId: string | null) {
    const t = typeId ? stampTypes[typeId] : null;
    setEmoji(t?.emoji ?? '');
    setLabel(t?.label ?? '');
    setError('');
    setMode({ kind: 'form', typeId });
  }

  function save(typeId: string | null) {
    const problem = checkLabel(label) ?? checkEmojiField(emoji);
    if (problem) {
      setError(problem);
      return;
    }
    if (typeId && !stampTypes[typeId]) {
      // 開いている間に、ほかの人が消していた
      onMessage('このスタンプは削除されました');
      setMode({ kind: 'list' });
      return;
    }
    const order = typeId
      ? stampTypes[typeId].order
      : sorted.length === 0
        ? 0
        : Math.max(...sorted.map(([, t]) => t.order)) + 1;
    void run(
      () => saveStampType(db, roomId, typeId, { emoji: emoji.trim(), label: label.trim(), order }),
      typeId ? 'スタンプを直しました' : 'スタンプを追加しました',
      'スタンプを保存できませんでした',
      () => setMode({ kind: 'list' }),
    );
  }

  function move(index: number, delta: -1 | 1) {
    const ids = sorted.map(([id]) => id);
    const to = index + delta;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    void run(() => reorderStampTypes(db, roomId, ids), '並べかえました', '並べかえできませんでした');
  }

  if (mode.kind === 'delete') {
    const t = stampTypes[mode.typeId];
    return (
      <Sheet label="スタンプの編集" title="スタンプを削除" onClose={onClose}>
        <div className="sheet-body">
          <p className="sheet-question">
            {t ? `「${t.emoji} ${t.label}」を削除しますか？` : 'このスタンプを削除しますか？'}
          </p>
          <p className="sheet-empty">今まで押したスタンプはカレンダーに残ります。これから押せなくなるだけです。</p>
          <div className="sheet-actions is-stacked">
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() =>
                void run(
                  () => deleteStampType(db, roomId, mode.typeId),
                  'スタンプを削除しました',
                  'スタンプを削除できませんでした',
                  () => setMode({ kind: 'list' }),
                )
              }
            >
              削除する
            </button>
            <button type="button" className="btn btn-soft" onClick={() => setMode({ kind: 'list' })}>
              やめる
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  if (mode.kind === 'form') {
    const typeId = mode.typeId;
    return (
      <Sheet label="スタンプの編集" title={typeId ? 'スタンプを直す' : 'スタンプを追加'} onClose={onClose}>
        <div className="sheet-body">
          <label className="field">
            <span className="field-label">絵文字</span>
            <input
              className="field-input editor-emoji-input"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="下から選ぶか、絵文字を入力"
            />
          </label>
          <div className="emoji-picks" role="group" aria-label="絵文字の候補">
            {SUGGESTED_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                className={`emoji-pick${emoji.trim() === e ? ' is-selected' : ''}`}
                aria-label={e}
                onClick={() => setEmoji(e)}
              >
                {e}
              </button>
            ))}
          </div>
          <label className="field">
            <span className="field-row">
              <span className="field-label">名前</span>
              <span className={`field-count${Array.from(label).length > 6 ? ' is-over' : ''}`}>
                {Array.from(label).length}/6
              </span>
            </span>
            <input
              className="field-input"
              aria-label="名前"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例：散歩"
            />
          </label>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="sheet-actions">
            <button type="button" className="btn btn-soft" onClick={() => setMode({ kind: 'list' })}>
              やめる
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save(typeId)}>
              保存
            </button>
          </div>
          {typeId && (
            <button
              type="button"
              className="btn btn-danger-soft"
              onClick={() => setMode({ kind: 'delete', typeId })}
            >
              このスタンプを削除
            </button>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet label="スタンプの編集" title="スタンプの編集" onClose={onClose}>
      <div className="sheet-body">
        <ul className="editor-list">
          {sorted.map(([id, t], i) => (
            <li key={id} className="editor-row">
              <span className="editor-row-emoji" aria-hidden="true">
                {t.emoji}
              </span>
              <span className="editor-row-label">{t.label}</span>
              <button
                type="button"
                className="editor-icon-btn"
                aria-label={`上へ：${t.label}`}
                disabled={busy || i === 0}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="editor-icon-btn"
                aria-label={`下へ：${t.label}`}
                disabled={busy || i === sorted.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="editor-edit-btn"
                aria-label={`編集：${t.label}`}
                onClick={() => openForm(id)}
              >
                編集
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-primary" onClick={() => openForm(null)}>
          スタンプを追加
        </button>
      </div>
    </Sheet>
  );
}
