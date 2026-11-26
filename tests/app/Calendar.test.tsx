import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/data', () => ({
  addStamps: vi.fn(),
  deleteStamp: vi.fn(),
  setMemo: vi.fn(),
  makeRepeat: vi.fn(),
  skipRepeatDate: vi.fn(),
  endRepeatFrom: vi.fn(),
  subscribeConnected: vi.fn(),
}));

import * as data from '../../src/app/data';
import type { RoomSnapshot } from '../../src/app/data';
import { RoomScreen } from '../../src/app/components/RoomScreen';
import { todayKey } from '../../src/shared/dates';

const db = {} as never;
const user = { uid: 'u1', name: 'トシ（古い名前）' };
const today = todayKey();
const [, tm, td] = today.split('-').map(Number);
const todayLabel = `${tm}月${td}日`;

function makeRoom(over: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    meta: { name: 'わが家', createdBy: 'u1', createdAt: 1, inviteCode: 'c', feedToken: 't' },
    members: {
      u1: { name: 'トシ', joinedAt: 1 },
      u2: { name: 'ハナ', joinedAt: 2 },
    },
    stampTypes: {
      t2: { emoji: '🍽️', label: 'ごはん', order: 1 },
      t1: { emoji: '🏠', label: '家', order: 0 },
      t3: { emoji: '🏃', label: '運動', order: 2 },
    },
    stamps: {},
    repeats: {},
    ...over,
  };
}

// つながり状態をテストから変えられるようにする
let setConnected: (v: boolean) => void = () => {};

beforeEach(() => {
  vi.mocked(data.addStamps).mockResolvedValue();
  vi.mocked(data.subscribeConnected).mockImplementation((_db, cb) => {
    setConnected = (v) => act(() => cb(v));
    cb(true);
    return () => {};
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe('カレンダーとパレット', () => {
  it('パレットで2つ選んで日付をタップすると、その日付と2種類で addStamps を呼ぶ', async () => {
    render(<RoomScreen db={db} roomId="r1" room={makeRoom()} user={user} />);
    fireEvent.click(screen.getByRole('button', { name: '🏠 家' }));
    fireEvent.click(screen.getByRole('button', { name: '🍽️ ごはん' }));
    fireEvent.click(screen.getByRole('button', { name: todayLabel }));

    expect(data.addStamps).toHaveBeenCalledWith(
      db,
      'r1',
      today,
      [
        { emoji: '🏠', label: '家', order: 0 },
        { emoji: '🍽️', label: 'ごはん', order: 1 },
      ],
      { uid: 'u1', name: 'トシ' },
    );
    expect(await screen.findByText(`🏠🍽️を${tm}/${td}に押しました`)).toBeInTheDocument();
    // 選んだスタンプは押したあとも選ばれたまま
    expect(screen.getByRole('button', { name: '🏠 家' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('何も選ばずにスタンプのない日をタップすると「下のスタンプを選んでください」と出る', () => {
    render(<RoomScreen db={db} roomId="r1" room={makeRoom()} user={user} />);
    fireEvent.click(screen.getByRole('button', { name: todayLabel }));
    expect(screen.getByText('下のスタンプを選んでください')).toBeInTheDocument();
    expect(data.addStamps).not.toHaveBeenCalled();
  });

  it('もう一度タップすると選択が外れる', () => {
    render(<RoomScreen db={db} roomId="r1" room={makeRoom()} user={user} />);
    const home = screen.getByRole('button', { name: '🏠 家' });
    fireEvent.click(home);
    expect(home).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(home);
    expect(home).toHaveAttribute('aria-pressed', 'false');
  });

  it('押した人の名前はメンバー一覧の今の名前を出す', () => {
    const room = makeRoom({
      stamps: {
        [today]: {
          s1: { emoji: '🏠', label: '家', uid: 'u2', userName: '旧名', ts: 1 },
          s2: { emoji: '🍽️', label: 'ごはん', uid: 'gone', userName: '退出した人', ts: 2 },
        },
      },
    });
    render(<RoomScreen db={db} roomId="r1" room={room} user={user} />);
    const cell = screen.getByRole('button', { name: todayLabel }).parentElement!;
    expect(within(cell).getByText('ハナ')).toBeInTheDocument();
    expect(within(cell).queryByText('旧名')).not.toBeInTheDocument();
    // メンバーにいない人は、押したときの名前を出す
    expect(within(cell).getByText('退出した人')).toBeInTheDocument();
  });

  it('くり返しスタンプも表示する', () => {
    const room = makeRoom({
      repeats: {
        rp1: {
          emoji: '🏃', label: '運動', uid: 'u2', userName: 'ハナ', ts: 1,
          weekdays: [0, 1, 2, 3, 4, 5, 6], start: today,
        },
      },
    });
    render(<RoomScreen db={db} roomId="r1" room={room} user={user} />);
    const cell = screen.getByRole('button', { name: todayLabel }).parentElement!;
    expect(within(cell).getByRole('button', { name: '🏃 運動（ハナ）' })).toBeInTheDocument();
  });

  it('書き込みに失敗したら、元のエラー文は出さず日本語で知らせる', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(data.addStamps).mockRejectedValue(new Error('PERMISSION_DENIED: Permission denied'));
    render(<RoomScreen db={db} roomId="r1" room={makeRoom()} user={user} />);
    fireEvent.click(screen.getByRole('button', { name: '🏠 家' }));
    fireEvent.click(screen.getByRole('button', { name: todayLabel }));
    expect(
      await screen.findByText('スタンプを押せませんでした。通信の状態を確かめて、もう一度ためしてください。'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PERMISSION_DENIED/)).not.toBeInTheDocument();
    expect(err).toHaveBeenCalled();
  });

  it('月を切り替えられる', () => {
    render(<RoomScreen db={db} roomId="r1" room={makeRoom()} user={user} />);
    fireEvent.click(screen.getByRole('button', { name: '次の月' }));
    expect(screen.queryByRole('button', { name: todayLabel })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '今日' }));
    expect(screen.getByRole('button', { name: todayLabel })).toBeInTheDocument();
  });

  it('「＋」はまだ使えないことを知らせる', () => {
    render(<RoomScreen db={db} roomId="r1" room={makeRoom()} user={user} />);
    fireEvent.click(screen.getByRole('button', { name: 'スタンプを追加' }));
    expect(screen.getByText('スタンプの追加は次の更新で使えます')).toBeInTheDocument();
  });

  it('スタンプをタップするとシートが開く（日付には押さない）', () => {
    const room = makeRoom({
      stamps: { [today]: { s1: { emoji: '🏠', label: '家', uid: 'u2', userName: 'ハナ', ts: 1, memo: '夜おそい' } } },
    });
    render(<RoomScreen db={db} roomId="r1" room={room} user={user} />);
    fireEvent.click(screen.getByRole('button', { name: '🏠 家' }));
    fireEvent.click(screen.getByRole('button', { name: '🏠 家（ハナ）' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('夜おそい')).toBeInTheDocument();
    expect(data.addStamps).not.toHaveBeenCalled();
  });

  it('何も選ばずにスタンプのある日をタップすると、その日の一覧が大きく出る', () => {
    const room = makeRoom({
      stamps: {
        [today]: {
          s1: { emoji: '🏠', label: '家', uid: 'u2', userName: 'ハナ', ts: 1, memo: '夜おそい' },
          s2: { emoji: '🍽️', label: 'ごはん', uid: 'u1', userName: 'トシ', ts: 2 },
        },
      },
    });
    render(<RoomScreen db={db} roomId="r1" room={room} user={user} />);
    fireEvent.click(screen.getByRole('button', { name: todayLabel }));
    const list = screen.getByRole('dialog', { name: `${todayLabel}のスタンプ` });
    expect(within(list).getByRole('button', { name: /🏠 家 ハナ/ })).toBeInTheDocument();
    expect(within(list).getByText('夜おそい')).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: /🍽️ ごはん トシ/ })).toBeInTheDocument();
    expect(screen.queryByText('下のスタンプを選んでください')).not.toBeInTheDocument();
    expect(data.addStamps).not.toHaveBeenCalled();
  });

  it('一覧の行をタップすると、そのスタンプのシートが開く', () => {
    const room = makeRoom({
      stamps: { [today]: { s1: { emoji: '🏠', label: '家', uid: 'u1', userName: 'トシ', ts: 1 } } },
    });
    render(<RoomScreen db={db} roomId="r1" room={room} user={user} />);
    fireEvent.click(screen.getByRole('button', { name: todayLabel }));
    fireEvent.click(screen.getByRole('button', { name: /🏠 家 トシ/ }));
    expect(screen.queryByRole('dialog', { name: `${todayLabel}のスタンプ` })).not.toBeInTheDocument();
    const sheet = screen.getByRole('dialog', { name: '🏠 家' });
    expect(within(sheet).getByRole('button', { name: '削除' })).toBeInTheDocument();
  });

  it('つながっていないときは案内を出し、つながったら消す', () => {
    render(<RoomScreen db={db} roomId="r1" room={makeRoom()} user={user} />);
    expect(screen.queryByText(/オフライン中/)).not.toBeInTheDocument();
    setConnected(false);
    expect(screen.getByText('⚠️ オフライン中 — 変更はつながったときに反映されます')).toBeInTheDocument();
    setConnected(true);
    expect(screen.queryByText(/オフライン中/)).not.toBeInTheDocument();
  });

  it('つながっていないときに押すと、返事を待たずに案内する', async () => {
    vi.mocked(data.addStamps).mockReturnValue(new Promise(() => {})); // 返事が来ない
    render(<RoomScreen db={db} roomId="r1" room={makeRoom()} user={user} />);
    setConnected(false);
    fireEvent.click(screen.getByRole('button', { name: '🏠 家' }));
    fireEvent.click(screen.getByRole('button', { name: todayLabel }));
    expect(
      await screen.findByText(`🏠を${tm}/${td}に押しました（つながったときに反映されます）`),
    ).toBeInTheDocument();
  });

  it('つながっていないときのシートの削除は、返事を待たずに閉じる', async () => {
    vi.mocked(data.deleteStamp).mockReturnValue(new Promise(() => {}));
    const room = makeRoom({
      stamps: { [today]: { s1: { emoji: '🏠', label: '家', uid: 'u1', userName: 'トシ', ts: 1 } } },
    });
    render(<RoomScreen db={db} roomId="r1" room={room} user={user} />);
    setConnected(false);
    fireEvent.click(screen.getByRole('button', { name: '🏠 家（トシ）' }));
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    fireEvent.click(screen.getByRole('button', { name: '削除する' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('削除しました（つながったときに反映されます）')).toBeInTheDocument();
    expect(data.deleteStamp).toHaveBeenCalledWith(db, 'r1', today, 's1');
  });
});
