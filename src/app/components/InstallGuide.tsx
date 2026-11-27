import { useState } from 'react';
import { Sheet } from './Sheet';

const KEY = 'sc2_install_guide_dismissed';

function isStandalone(): boolean {
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  } catch {
    // 調べられないときは「ホーム画面から開いていない」として扱う
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

type Platform = 'ios' | 'android' | 'other';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPad は Mac のふりをするので、タッチできる Mac は iPad とみなす
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

/** ホーム画面から開いていないときに、1回だけ「ホーム画面に追加」のやり方を出す */
export function InstallGuide() {
  const [platform] = useState(detectPlatform);
  const [open, setOpen] = useState(() => !isStandalone() && !wasDismissed());
  // パソコンなどでは案内しない
  if (!open || platform === 'other') return null;

  function close() {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // 覚えられなくても、今回は閉じる
    }
    setOpen(false);
  }

  return (
    <Sheet label="ホーム画面に追加" title="ホーム画面に追加しよう" onClose={close}>
      <div className="sheet-body">
        <p className="settings-note">ホーム画面に置くと、アプリのようにすぐ開けます。</p>
        {platform === 'ios' ? (
          <ol className="settings-steps">
            <li>画面の下にある「共有」ボタン（四角から矢印が出ているマーク）を押す</li>
            <li>「ホーム画面に追加」を選ぶ</li>
            <li>右上の「追加」を押す</li>
          </ol>
        ) : (
          <ol className="settings-steps">
            <li>画面の右上にある「メニュー」（点が3つのマーク）を押す</li>
            <li>「ホーム画面に追加」を選ぶ</li>
            <li>「追加」を押す</li>
          </ol>
        )}
        <button type="button" className="btn btn-primary" onClick={close}>
          わかった
        </button>
      </div>
    </Sheet>
  );
}
