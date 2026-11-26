import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/data', () => ({
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
  listMyRooms: vi.fn(),
  subscribeRoom: vi.fn(),
  subscribeConnected: vi.fn(() => () => {}),
}));

import * as data from '../../src/app/data';
import { RoomGate } from '../../src/app/components/RoomGate';

const db = {} as never;
const user = { uid: 'u1', name: 'トシ' };
const room = {
  meta: { name: 'わが家', createdBy: 'u1', createdAt: 1, inviteCode: 'c', feedToken: 't' },
  members: {},
  stampTypes: {},
  stamps: {},
  repeats: {},
};
const home = { name: 'home' } as const;

beforeEach(() => {
  vi.mocked(data.subscribeRoom).mockImplementation((_db, _id, cb) => {
    cb(room);
    return () => {};
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe('RoomGate hardening', () => {
  it('StrictMode でも join は1回で、エラーは出ない', async () => {
    vi.mocked(data.listMyRooms).mockResolvedValue([]);
    vi.mocked(data.joinRoom).mockResolvedValue();
    render(
      <StrictMode>
        <RoomGate db={db} user={user} route={{ name: 'join', roomId: 'r5', code: 'C' }} onSignOut={() => {}} />
      </StrictMode>,
    );
    expect(await screen.findByText('わが家')).toBeInTheDocument();
    expect(data.joinRoom).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/招待URLが古い/)).toBeNull();
  });

  it('join が失敗でも、実はルームに入れていれば成功として開く', async () => {
    vi.mocked(data.listMyRooms).mockResolvedValueOnce([]).mockResolvedValue(['r6']);
    vi.mocked(data.joinRoom).mockRejectedValue(new Error('x'));
    render(<RoomGate db={db} user={user} route={{ name: 'join', roomId: 'r6', code: 'C' }} onSignOut={() => {}} />);
    expect(await screen.findByText('わが家')).toBeInTheDocument();
  });

  it('join 失敗後「はじめの画面にもどる」で URL が / になり通常の画面に戻る', async () => {
    vi.mocked(data.listMyRooms).mockResolvedValue([]);
    vi.mocked(data.joinRoom).mockRejectedValue(new Error('x'));
    window.history.pushState({}, '', '/join/r7/BAD');
    render(<RoomGate db={db} user={user} route={{ name: 'join', roomId: 'r7', code: 'BAD' }} onSignOut={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'はじめの画面にもどる' }));
    expect(await screen.findByText('招待URLをもらってください')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(data.joinRoom).toHaveBeenCalledTimes(1);
  });

  it('ルームを開けないとき「はじめの画面にもどる」で通常の画面に戻る', async () => {
    vi.mocked(data.listMyRooms).mockResolvedValue(['r1']);
    vi.mocked(data.subscribeRoom).mockImplementation((_db, _id, _cb, onError) => {
      onError?.(new Error('permission_denied'));
      return () => {};
    });
    render(<RoomGate db={db} user={user} route={home} onSignOut={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'はじめの画面にもどる' }));
    expect(await screen.findByText('招待URLをもらってください')).toBeInTheDocument();
  });

  it('作成中はボタンを押せず、createRoom は1回だけ', async () => {
    vi.mocked(data.listMyRooms).mockResolvedValue([]);
    let resolve!: (id: string) => void;
    vi.mocked(data.createRoom).mockReturnValue(new Promise<string>((r) => (resolve = r)));
    render(<RoomGate db={db} user={user} route={home} onSignOut={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: '家族のルームを作る' }));
    const btn = screen.getByRole('button', { name: '作る' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(btn).toBeDisabled();
    expect(data.createRoom).toHaveBeenCalledTimes(1);
    resolve('n1');
    expect(await screen.findByText('わが家')).toBeInTheDocument();
  });

  it('空の名前は「わが家」にする', async () => {
    vi.mocked(data.listMyRooms).mockResolvedValue([]);
    vi.mocked(data.createRoom).mockResolvedValue('n2');
    render(<RoomGate db={db} user={user} route={home} onSignOut={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: '家族のルームを作る' }));
    fireEvent.change(screen.getByLabelText('ルームの名前'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '作る' }));
    await screen.findByText('わが家');
    expect(data.createRoom).toHaveBeenCalledWith(db, user, 'わが家');
  });

  it('想定外のエラーは生のメッセージを出さない', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(data.listMyRooms).mockResolvedValue([]);
    vi.mocked(data.createRoom).mockRejectedValue(new Error('boom internal'));
    render(<RoomGate db={db} user={user} route={home} onSignOut={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: '家族のルームを作る' }));
    fireEvent.click(screen.getByRole('button', { name: '作る' }));
    expect(await screen.findByText('ルームを作れませんでした。もう一度ためしてください。')).toBeInTheDocument();
    expect(screen.queryByText(/boom/)).toBeNull();
    expect(spy).toHaveBeenCalled();
  });
});
