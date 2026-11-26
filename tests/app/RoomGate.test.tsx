import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/data', () => ({
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
  listMyRooms: vi.fn(),
  subscribeRoom: vi.fn(),
}));

import * as data from '../../src/app/data';
import { RoomGate } from '../../src/app/components/RoomGate';
import { InAppNotice } from '../../src/app/components/InAppNotice';

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
});

describe('RoomGate', () => {
  it('ルームが1つならそのルームの画面を出す', async () => {
    vi.mocked(data.listMyRooms).mockResolvedValue(['r1']);
    render(<RoomGate db={db} user={user} route={home} />);
    expect(await screen.findByText('わが家')).toBeInTheDocument();
    expect(vi.mocked(data.subscribeRoom).mock.calls[0][1]).toBe('r1');
  });

  it('0件なら招待URLの案内と「家族のルームを作る」を出す', async () => {
    vi.mocked(data.listMyRooms).mockResolvedValue([]);
    render(<RoomGate db={db} user={user} route={home} />);
    expect(await screen.findByText('招待URLをもらってください')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '家族のルームを作る' })).toBeInTheDocument();
  });

  it('ルームを作れたら、そのルームを開く', async () => {
    vi.mocked(data.listMyRooms).mockResolvedValue([]);
    vi.mocked(data.createRoom).mockResolvedValue('new1');
    render(<RoomGate db={db} user={user} route={home} />);
    fireEvent.click(await screen.findByRole('button', { name: '家族のルームを作る' }));
    fireEvent.click(screen.getByRole('button', { name: '作る' }));
    expect(await screen.findByText('わが家')).toBeInTheDocument();
    expect(data.createRoom).toHaveBeenCalledWith(db, user, 'わが家');
    expect(vi.mocked(data.subscribeRoom).mock.calls[0][1]).toBe('new1');
  });

  it('作る権限がなければ案内を出す', async () => {
    vi.mocked(data.listMyRooms).mockResolvedValue([]);
    vi.mocked(data.createRoom).mockRejectedValue(new Error('PERMISSION_DENIED: Permission denied'));
    render(<RoomGate db={db} user={user} route={home} />);
    fireEvent.click(await screen.findByRole('button', { name: '家族のルームを作る' }));
    fireEvent.click(screen.getByRole('button', { name: '作る' }));
    expect(
      await screen.findByText('このアカウントではルームを作れません。家族から招待URLをもらってください。'),
    ).toBeInTheDocument();
  });

  it('join: 参加してからルームを開き、URLを / に戻す', async () => {
    vi.mocked(data.listMyRooms).mockResolvedValue([]);
    vi.mocked(data.joinRoom).mockResolvedValue();
    window.history.pushState({}, '', '/join/r9/CODE');
    render(<RoomGate db={db} user={user} route={{ name: 'join', roomId: 'r9', code: 'CODE' }} />);
    expect(await screen.findByText('わが家')).toBeInTheDocument();
    expect(data.joinRoom).toHaveBeenCalledWith(db, user, 'r9', 'CODE');
    expect(vi.mocked(data.subscribeRoom).mock.calls[0][1]).toBe('r9');
    expect(window.location.pathname).toBe('/');
  });

  it('join: すでにメンバーなら参加処理をせず開く', async () => {
    vi.mocked(data.listMyRooms).mockResolvedValue(['r9']);
    render(<RoomGate db={db} user={user} route={{ name: 'join', roomId: 'r9', code: 'CODE' }} />);
    expect(await screen.findByText('わが家')).toBeInTheDocument();
    expect(data.joinRoom).not.toHaveBeenCalled();
  });

  it('join が失敗したら案内を出す', async () => {
    vi.mocked(data.listMyRooms).mockResolvedValue([]);
    vi.mocked(data.joinRoom).mockRejectedValue(new Error('PERMISSION_DENIED'));
    render(<RoomGate db={db} user={user} route={{ name: 'join', roomId: 'r9', code: 'BAD' }} />);
    expect(
      await screen.findByText('招待URLが古いか、まちがっています。もう一度もらってください。'),
    ).toBeInTheDocument();
  });

  it('ルームを読めないとき（onError）は案内を出す', async () => {
    vi.mocked(data.listMyRooms).mockResolvedValue(['r1']);
    vi.mocked(data.subscribeRoom).mockImplementation((_db, _id, _cb, onError) => {
      onError?.(new Error('permission_denied'));
      return () => {};
    });
    render(<RoomGate db={db} user={user} route={home} />);
    await waitFor(() =>
      expect(screen.getByText('このルームを開けません。招待URLをもらってください。')).toBeInTheDocument(),
    );
  });
});

describe('InAppNotice', () => {
  it('Safari / Chrome の案内とコピーボタンがあり、Googleログインのボタンはない', () => {
    render(<InAppNotice />);
    expect(screen.getByText(/Safari/)).toBeInTheDocument();
    expect(screen.getByText(/Chrome/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'URLをコピー' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Google/ })).toBeNull();
  });
});
