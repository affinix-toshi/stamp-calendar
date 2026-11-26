import { useState } from 'react';
import type { Database } from 'firebase/database';
import { checkDisplayName } from '../../shared/validate';
import { regenerateFeedToken, regenerateInvite, updateDisplayName } from '../data';
import type { RoomSnapshot } from '../data';
import { OFFLINE_NOTE, writeFailed } from '../format';
import { Sheet } from './Sheet';

interface Props {
  db: Database;
  roomId: string;
  room: RoomSnapshot;
  uid: string;
  /** サーバーとつながっているか */
  online?: boolean;
  onClose: () => void;
  onMessage: (message: string) => void;
  onEditStamps: () => void;
  onSignOut: () => void;
}

const CONFIRM_TEXT = '今のURLは使えなくなります。作り直しますか？';

type UrlKind = 'invite' | 'feed';

export function SettingsSheet({ db, roomId, room, uid, online = true, onClose, onMessage, onEditStamps, onSignOut }: Props) {
  const savedName = room.members[uid]?.name ?? '';
  const [name, setName] = useState(savedName);
  const [nameError, setNameError] = useState('');
  const [confirming, setConfirming] = useState<UrlKind | null>(null);
  // コピーできなかったとき、URLを選べる欄に出す
  const [showUrl, setShowUrl] = useState<UrlKind | null>(null);
  const [busy, setBusy] = useState(false);

  const urls: Record<UrlKind, string> = {
    invite: `${location.origin}/join/${roomId}/${room.meta.inviteCode}`,
    feed: `${location.origin}/feed/${roomId}/${room.meta.feedToken}.ics`,
  };

  async function saveName() {
    const problem = checkDisplayName(name);
    if (problem) {
      setNameError(problem);
      return;
    }
    setNameError('');
    if (!online) {
      // つながっていないと返事が来ないので待たない（画面には先に反映される）
      updateDisplayName(db, roomId, uid, name.trim()).catch((e) =>
        onMessage(writeFailed('表示名を変えられませんでした', e)),
      );
      onMessage('表示名を変えました' + OFFLINE_NOTE);
      return;
    }
    setBusy(true);
    try {
      await updateDisplayName(db, roomId, uid, name.trim());
      onMessage('表示名を変えました');
    } catch (e) {
      onMessage(writeFailed('表示名を変えられませんでした', e));
    } finally {
      setBusy(false);
    }
  }

  async function copy(kind: UrlKind) {
    try {
      await navigator.clipboard.writeText(urls[kind]);
      setShowUrl(null);
      onMessage('コピーしました');
    } catch {
      setShowUrl(kind);
    }
  }

  async function regenerate(kind: UrlKind) {
    setBusy(true);
    try {
      await (kind === 'invite' ? regenerateInvite(db, roomId) : regenerateFeedToken(db, roomId));
      setConfirming(null);
      setShowUrl(null);
      onMessage('URLを作り直しました');
    } catch (e) {
      onMessage(writeFailed('URLを作り直せませんでした', e));
    } finally {
      setBusy(false);
    }
  }

  /** 招待URL・購読URLに共通の「コピー・作り直し」の並び */
  function urlControls(kind: UrlKind, noun: string) {
    return (
      <>
        {confirming === kind ? (
          <>
            <p className="sheet-question">{CONFIRM_TEXT}</p>
            <div className="sheet-actions">
              <button type="button" className="btn btn-soft" onClick={() => setConfirming(null)}>
                やめる
              </button>
              <button type="button" className="btn btn-danger" disabled={busy || !online} onClick={() => void regenerate(kind)}>
                作り直す
              </button>
            </div>
          </>
        ) : (
          <div className="sheet-actions">
            <button type="button" className="btn btn-primary" onClick={() => void copy(kind)}>
              {noun}をコピー
            </button>
            <button
              type="button"
              className="btn btn-soft"
              disabled={!online}
              onClick={() => setConfirming(kind)}
            >
              {noun}を作り直す
            </button>
          </div>
        )}
        {!online && <p className="settings-note">インターネットにつながっているときに作り直せます</p>}
        {showUrl === kind && (
          <input
            className="field-input url-box"
            readOnly
            value={urls[kind]}
            aria-label={`${noun}（長押しでコピーできます）`}
            onFocus={(e) => e.currentTarget.select()}
          />
        )}
      </>
    );
  }

  return (
    <Sheet label="設定" title="設定" onClose={onClose}>
      <div className="sheet-body settings-body">
        <section className="settings-section">
          <h2 className="settings-title">表示名</h2>
          <label className="field">
            <span className="field-label">表示名</span>
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {nameError && (
            <p className="field-error" role="alert">
              {nameError}
            </p>
          )}
          <button
            type="button"
            className="btn btn-soft"
            disabled={busy || name === savedName}
            onClick={() => void saveName()}
          >
            名前を保存
          </button>
        </section>

        <section className="settings-section">
          <h2 className="settings-title">家族を招待する</h2>
          <p className="settings-note">このURLを家族に送ると、同じカレンダーに入れます。</p>
          {urlControls('invite', '招待URL')}
        </section>

        <section className="settings-section">
          <h2 className="settings-title">Googleカレンダーに表示</h2>
          <p className="settings-note">
            スタンプをGoogleカレンダーでも見られます。下のURLをコピーして、次のように登録してください。
          </p>
          <ol className="settings-steps">
            <li>パソコンでGoogleカレンダーを開く</li>
            <li>左の「他のカレンダー」の＋を押す</li>
            <li>「URLで追加」を選ぶ</li>
            <li>コピーしたURLを貼り付けて、「カレンダーを追加」を押す</li>
          </ol>
          <p className="settings-note">
            スマホのアプリからは追加できません。パソコンで登録すると、スマホのGoogleカレンダーにも出ます。
            反映されるまで数時間から1日ほどかかることがあります。
          </p>
          {urlControls('feed', '購読URL')}
        </section>

        <section className="settings-section">
          <h2 className="settings-title">スタンプ</h2>
          <button type="button" className="btn btn-soft" onClick={onEditStamps}>
            スタンプの編集
          </button>
        </section>

        <button type="button" className="btn btn-danger-soft" onClick={onSignOut}>
          ログアウト
        </button>
      </div>
    </Sheet>
  );
}
