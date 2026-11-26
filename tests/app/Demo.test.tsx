import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const familyGet = vi.fn();
const demoAuth = { name: 'demo-auth' };
const demoDb = { name: 'demo-db' };

vi.mock('../../src/app/firebase', () => ({
  getFirebase: (target: string) => {
    if (target === 'family') familyGet();
    return target === 'demo' ? { auth: demoAuth, db: demoDb } : { auth: {}, db: {} };
  },
}));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(),
  signInAnonymously: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));
vi.mock('../../src/app/data', () => ({
  subscribeRoom: vi.fn(),
  subscribeConnected: vi.fn(() => () => {}),
  ensureDemoMember: vi.fn(),
  addStamps: vi.fn(),
  updateDisplayName: vi.fn(),
  regenerateInvite: vi.fn(),
  regenerateFeedToken: vi.fn(),
}));

import { getRedirectResult, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import * as data from '../../src/app/data';
import { App } from '../../src/app/App';

const room = {
  meta: { name: '見本の家族', createdBy: 'demo-papa', createdAt: 1, inviteCode: 'c', feedToken: 't' },
  members: { 'demo-papa': { name: 'パパ', joinedAt: 1 } },
  stampTypes: {},
  stamps: {},
  repeats: {},
};

beforeEach(() => {
  window.history.pushState(null, '', '/demo');
  vi.mocked(onAuthStateChanged).mockImplementation(((_a: unknown, cb: (u: unknown) => void) => {
    cb(null); // 最初はだれもログインしていない
    return () => {};
  }) as never);
  vi.mocked(signInAnonymously).mockResolvedValue({} as never);
  vi.mocked(getRedirectResult).mockResolvedValue(null);
  vi.mocked(data.ensureDemoMember).mockResolvedValue(undefined);
  vi.mocked(data.subscribeRoom).mockImplementation(((_db: unknown, _id: string, cb: (r: unknown) => void) => {
    cb(room);
    return () => {};
  }) as never);
});

afterEach(() => {
  cleanup();
  window.history.pushState(null, '', '/');
  vi.resetAllMocks();
  familyGet.mockReset();
});

function loginAs(uid: string) {
  vi.mocked(onAuthStateChanged).mockImplementation(((_a: unknown, cb: (u: unknown) => void) => {
    cb({ uid, displayName: null });
    return () => {};
  }) as never);
}

describe('/demo', () => {
  it('ログインしていなければ匿名でログインする（Google ログインの画面は出さない）', async () => {
    render(<App />);
    await waitFor(() => expect(signInAnonymously).toHaveBeenCalledWith(demoAuth));
    expect(screen.queryByText(/Google/)).toBeNull();
  });

  it('家族用の Firebase には触れない', async () => {
    loginAs('anon1');
    render(<App />);
    await screen.findByText('見本です。毎日朝3時に元に戻ります');
    expect(familyGet).not.toHaveBeenCalled();
  });

  it('「見学の方」としてメンバーに加わり、DEMO ルームを開く', async () => {
    loginAs('anon1');
    render(<App />);
    await screen.findByText('見本の家族');
    await waitFor(() => expect(data.ensureDemoMember).toHaveBeenCalledWith(demoDb, 'anon1'));
    expect(vi.mocked(data.subscribeRoom).mock.calls[0][0]).toBe(demoDb);
    expect(vi.mocked(data.subscribeRoom).mock.calls[0][1]).toBe('DEMO');
  });

  it('画面の上に決まった文言のバナーが出る', async () => {
    loginAs('anon1');
    render(<App />);
    expect(await screen.findByText('見本です。毎日朝3時に元に戻ります')).toBeInTheDocument();
  });

  it('設定では招待URLのボタンが「見本では使えません」になる', async () => {
    loginAs('anon1');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /設定/ }));
    fireEvent.click(await screen.findByRole('button', { name: '招待URLをコピー' }));
    expect(await screen.findByText('見本では使えません')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ログアウト' })).toBeNull();
    expect(screen.getByRole('button', { name: '最初の状態に戻す' })).toBeInTheDocument();
  });

  it('ふだんの画面（/）にはバナーが出ない', async () => {
    window.history.pushState(null, '', '/');
    vi.mocked(onAuthStateChanged).mockImplementation(((_a: unknown, cb: (u: unknown) => void) => {
      cb(null);
      return () => {};
    }) as never);
    render(<App />);
    expect(screen.queryByText('見本です。毎日朝3時に元に戻ります')).toBeNull();
    expect(signInAnonymously).not.toHaveBeenCalled();
  });
});
