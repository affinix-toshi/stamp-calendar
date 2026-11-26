import { useState } from 'react';
import type { Auth } from 'firebase/auth';
import { signInWithGoogle } from '../auth';
import { isInAppBrowser } from '../inAppBrowser';
import { InAppNotice } from './InAppNotice';
import { Toast } from './Toast';

export function LoginScreen({ auth }: { auth: Auth }) {
  const [error, setError] = useState('');

  if (isInAppBrowser(navigator.userAgent)) return <InAppNotice />;

  async function login() {
    setError('');
    try {
      await signInWithGoogle(auth);
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      // ログイン画面を自分で閉じたときは何も出さない
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      setError('ログインできませんでした。もう一度ためしてください。');
    }
  }

  return (
    <section className="login-screen">
      <h1>スタンプカレンダー</h1>
      <p>家族みんなで使う、スタンプのカレンダーです。</p>
      <button type="button" onClick={login}>
        Googleでログイン
      </button>
      {error && <Toast message={error} />}
    </section>
  );
}
