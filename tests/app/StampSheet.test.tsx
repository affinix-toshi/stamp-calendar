import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
import { StampSheet } from '../../src/app/components/StampSheet';
import type { DayEntry } from '../../src/shared/types';

const db = {} as never;
// 2026-12-02 は水曜日
const stampEntry: DayEntry = {
  emoji: '🏠', label: '家', uid: 'u1', userName: 'トシ', ts: 1,
  date: '2026-12-02', source: { kind: 'stamp', id: 's1' },
};
const repeatEntry: DayEntry = {
  emoji: '🏃', label: '運動', uid: 'u1', userName: 'トシ', ts: 1,
  date: '2026-12-02', source: { kind: 'repeat', id: 'rp1' },
};

function renderSheet(entry: DayEntry, isMine: boolean) {
  const onClose = vi.fn();
  const onMessage = vi.fn();
  render(
    <StampSheet
      db={db}
      roomId="r1"
      entry={entry}
      name="トシ"
      isMine={isMine}
      onClose={onClose}
      onMessage={onMessage}
    />,
  );
  return { onClose, onMessage };
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe('StampSheet', () => {
  it('他人のスタンプは名前とメモだけで、削除・メモ・くり返しがない', () => {
    renderSheet({ ...stampEntry, uid: 'u2', memo: '夜おそい' }, false);
    expect(screen.getByText('トシ')).toBeInTheDocument();
    expect(screen.getByText('夜おそい')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'くり返し' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('メモ')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /メモ/ })).not.toBeInTheDocument();
  });

  it('自分のくり返しを削除:「この日だけ」で skipRepeatDate', async () => {
    vi.mocked(data.skipRepeatDate).mockResolvedValue();
    const { onClose, onMessage } = renderSheet(repeatEntry, true);
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(screen.getByRole('button', { name: 'この日以降すべて' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'この日だけ' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(data.skipRepeatDate).toHaveBeenCalledWith(db, 'r1', 'rp1', '2026-12-02');
    expect(data.endRepeatFrom).not.toHaveBeenCalled();
    expect(onMessage).toHaveBeenCalledWith('削除しました');
  });

  it('自分のくり返しを削除:「この日以降すべて」で endRepeatFrom', async () => {
    vi.mocked(data.endRepeatFrom).mockResolvedValue();
    const { onClose } = renderSheet(repeatEntry, true);
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(screen.getByRole('button', { name: 'この日だけ' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'この日以降すべて' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(data.endRepeatFrom).toHaveBeenCalledWith(db, 'r1', 'rp1', '2026-12-02');
    expect(data.skipRepeatDate).not.toHaveBeenCalled();
  });

  it('自分のスタンプの削除は確認してから deleteStamp', async () => {
    vi.mocked(data.deleteStamp).mockResolvedValue();
    const { onClose } = renderSheet(stampEntry, true);
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(data.deleteStamp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '削除する' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(data.deleteStamp).toHaveBeenCalledWith(db, 'r1', '2026-12-02', 's1');
  });

  it('メモに21文字を入れると保存ボタンが押せず、理由が出る', () => {
    renderSheet(stampEntry, true);
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: 'あ'.repeat(21) } });
    expect(screen.getByRole('button', { name: 'メモを保存' })).toBeDisabled();
    expect(screen.getByText('メモは20文字までにしてください')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: 'あ'.repeat(20) } });
    expect(screen.getByRole('button', { name: 'メモを保存' })).toBeEnabled();
  });

  it('メモを保存すると setMemo を呼ぶ', async () => {
    vi.mocked(data.setMemo).mockResolvedValue();
    const { onMessage } = renderSheet(stampEntry, true);
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '18時から' } });
    fireEvent.click(screen.getByRole('button', { name: 'メモを保存' }));
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('メモを保存しました'));
    expect(data.setMemo).toHaveBeenCalledWith(db, 'r1', { kind: 'stamp', id: 's1', date: '2026-12-02' }, '18時から');
  });

  it('くり返し: その日の曜日が最初から選ばれていて、makeRepeat を呼ぶ', async () => {
    vi.mocked(data.makeRepeat).mockResolvedValue('rp9');
    const { onMessage } = renderSheet(stampEntry, true);
    fireEvent.click(screen.getByRole('button', { name: 'くり返し' }));
    expect(screen.getByRole('checkbox', { name: '水' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '月' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: '月' }));
    fireEvent.change(screen.getByLabelText('終わりの日（なくてもOK）'), { target: { value: '2027-03-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'くり返しを始める' }));
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('毎週 月・水 にくり返します'));
    expect(data.makeRepeat).toHaveBeenCalledWith(db, 'r1', '2026-12-02', 's1', [1, 3], '2027-03-31');
  });

  it('くり返し中のスタンプには「くり返し」ボタンを出さない', () => {
    renderSheet(repeatEntry, true);
    expect(screen.queryByRole('button', { name: 'くり返し' })).not.toBeInTheDocument();
  });

  it('書き込みに失敗したら、元のエラー文は出さず日本語で知らせる', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(data.deleteStamp).mockRejectedValue(new Error('PERMISSION_DENIED'));
    const { onMessage, onClose } = renderSheet(stampEntry, true);
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    fireEvent.click(screen.getByRole('button', { name: '削除する' }));
    await waitFor(() =>
      expect(onMessage).toHaveBeenCalledWith('削除できませんでした。通信の状態を確かめて、もう一度ためしてください。'),
    );
    expect(err).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('終わりの日がその日より前なら「この日以降」と理由を出す', () => {
    renderSheet(stampEntry, true);
    fireEvent.click(screen.getByRole('button', { name: 'くり返し' }));
    fireEvent.change(screen.getByLabelText('終わりの日（なくてもOK）'), { target: { value: '2026-12-01' } });
    expect(screen.getByText('終わりの日は、この日以降にしてください')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'くり返しを始める' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('終わりの日（なくてもOK）'), { target: { value: '2026-12-02' } });
    expect(screen.getByRole('button', { name: 'くり返しを始める' })).toBeEnabled();
  });

  it('くり返しのメモは全部の日に付くことを案内する', () => {
    renderSheet(repeatEntry, true);
    expect(screen.getByText('くり返しのメモは、全部の日に付きます')).toBeInTheDocument();
  });
});
