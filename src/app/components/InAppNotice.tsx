import { useState } from 'react';

export function InAppNotice() {
  const [message, setMessage] = useState('');

  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href);
      setMessage('コピーしました。SafariかChromeに貼りつけて開いてください。');
    } catch {
      setMessage('コピーできませんでした。画面上のURLを長押ししてコピーしてください。');
    }
  }

  return (
    <section className="in-app-notice">
      <h1>スタンプカレンダー</h1>
      <p>LINEなどのアプリの中のブラウザでは、Googleでのログインができません。</p>
      <p>iPhoneの方は「Safari」、Androidの方は「Chrome」でこのページを開き直してください。</p>
      <button type="button" onClick={copy}>
        URLをコピー
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
