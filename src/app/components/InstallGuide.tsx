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

function isIPhone(ua: string): boolean {
  return /iPhone|iPad|iPod/i.test(ua);
}

/** ホーム画面から開いていないときに、1回だけ「ホーム画面に追加」のやり方を出す */
export function InstallGuide() {
  const [open, setOpen] = useState(() => !isStandalone() && !wasDismissed());
  if (!open) return null;

  const iphone = isIPhone(navigator.userAgent);

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
        {iphone ? (
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
