import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
} from 'firebase/auth';
import type { UserInfo } from './data';

const REDIRECT_FALLBACK_CODES = [
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
];

export async function signInWithGoogle(auth: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (REDIRECT_FALLBACK_CODES.includes(code)) {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}

/** 表示名は10文字まで。なければ「わたし」 */
export function toUserInfo(user: { uid: string; displayName: string | null }): UserInfo {
  const name = Array.from((user.displayName ?? '').trim()).slice(0, 10).join('');
  return { uid: user.uid, name: name === '' ? 'わたし' : name };
}
