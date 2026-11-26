import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/data', () => ({
  saveStampType: vi.fn(),
  deleteStampType: vi.fn(),
  reorderStampTypes: vi.fn(),
}));

import * as data from '../../src/app/data';
import { StampTypeEditor } from '../../src/app/components/StampTypeEditor';

const db = {} as never;
const types = {
  t2: { emoji: '🍽️', label: 'ごはん', order: 4 },
  t1: { emoji: '🏠', label: '家', order: 0 },
  t3: { emoji: '🏃', label: '運動', order: 7 },
};

function renderEditor() {
  const onClose = vi.fn();
  const onMessage = vi.fn();
  render(
    <StampTypeEditor db={db} roomId="r1" stampTypes={types} onClose={onClose} onMessage={onMessage} />,
  );
  return { onClose, onMessage };
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe('スタンプの編集', () => {
  it('追加すると、パレットの最後に並ぶ（order は最大 + 1）', async () => {
    vi.mocked(data.saveStampType).mockResolvedValue('new1');
    const { onMessage } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'スタンプを追加' }));
    fireEvent.click(screen.getByRole('button', { name: '🎵' })); // 候補から選ぶ
    fireEvent.change(screen.getByLabelText('名前'), { target: { value: '音楽' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(data.saveStampType).toHaveBeenCalledWith(db, 'r1', null, { emoji: '🎵', label: '音楽', order: 8 }),
    );
    await waitFor(() => expect(onMessage).toHaveBeenCalled());
  });

  it('絵文字は直接入力もできる', async () => {
    vi.mocked(data.saveStampType).mockResolvedValue('new1');
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'スタンプを追加' }));
    fireEvent.change(screen.getByLabelText('絵文字'), { target: { value: '🐶' } });
    fireEvent.change(screen.getByLabelText('名前'), { target: { value: '散歩' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(data.saveStampType).toHaveBeenCalledWith(db, 'r1', null, { emoji: '🐶', label: '散歩', order: 8 }),
    );
  });

  it('名前が長すぎる・絵文字が空のときは保存せず、日本語で知らせる', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'スタンプを追加' }));
    fireEvent.change(screen.getByLabelText('名前'), { target: { value: '1234567' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByText('スタンプの名前は6文字までにしてください')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('名前'), { target: { value: '音楽' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByText('絵文字を入力してください')).toBeInTheDocument();
    expect(data.saveStampType).not.toHaveBeenCalled();
  });

  it('編集では order を変えずに保存する', async () => {
    vi.mocked(data.saveStampType).mockResolvedValue('t2');
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: '編集：ごはん' }));
    fireEvent.change(screen.getByLabelText('名前'), { target: { value: '夕食' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(data.saveStampType).toHaveBeenCalledWith(db, 'r1', 't2', { emoji: '🍽️', label: '夕食', order: 4 }),
    );
  });

  it('↓で順番を入れかえる', async () => {
    vi.mocked(data.reorderStampTypes).mockResolvedValue();
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: '下へ：家' }));
    await waitFor(() => expect(data.reorderStampTypes).toHaveBeenCalledWith(db, 'r1', ['t2', 't1', 't3']));
  });

  it('一番上の↑と一番下の↓は押せない', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: '上へ：家' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下へ：運動' })).toBeDisabled();
  });

  it('削除は確認してから。過去のスタンプは残ることを伝える', async () => {
    vi.mocked(data.deleteStampType).mockResolvedValue();
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: '編集：ごはん' }));
    fireEvent.click(screen.getByRole('button', { name: 'このスタンプを削除' }));
    expect(screen.getByText(/今まで押したスタンプはカレンダーに残ります/)).toBeInTheDocument();
    expect(data.deleteStampType).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '削除する' }));
    await waitFor(() => expect(data.deleteStampType).toHaveBeenCalledWith(db, 'r1', 't2'));
  });

  it('書き込みに失敗したら日本語で知らせる', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(data.saveStampType).mockRejectedValue(new Error('PERMISSION_DENIED'));
    const { onMessage } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: '編集：ごはん' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('保存できませんでした')));
  });
});
