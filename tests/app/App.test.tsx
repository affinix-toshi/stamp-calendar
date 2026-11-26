import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/firebase', () => ({ getFirebase: () => ({ auth: {}, db: {} }) }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(),
  onAuthStateChanged: vi.fn((_a: unknown, cb: (u: null) => void) => {
    cb(null);
    return () => {};
  }),
}));

import { getRedirectResult } from 'firebase/auth';
import { App } from '../../src/app/App';

afterEach(cleanup);

describe('App', () => {
  it('リダイレクト結果のエラーをログイン画面に出す', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getRedirectResult).mockRejectedValue(new Error('redirect failed'));
    render(<App />);
    expect(await screen.findByText('ログインできませんでした。もう一度お試しください。')).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
  });
});
