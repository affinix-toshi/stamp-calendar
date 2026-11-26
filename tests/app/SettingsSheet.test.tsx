import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/data', () => ({
  updateDisplayName: vi.fn(),
  regenerateInvite: vi.fn(),
  regenerateFeedToken: vi.fn(),
}));

import * as data from '../../src/app/data';
import type { RoomSnapshot } from '../../src/app/data';
import { SettingsSheet } from '../../src/app/components/SettingsSheet';

const db = {} as never;
const room: RoomSnapshot = {
  meta: { name: 'わが家', createdBy: 'u1', createdAt: 1, inviteCode: 'INV123', feedToken: 'TOK456' },
  members: { u1: { name: 'トシ', joinedAt: 1 } },
  stampTypes: {},
  stamps: {},
  repeats: {},
};
const FEED = `${location.origin}/feed/r1/TOK456.ics`;
const INVITE = `${location.origin}/join/r1/INV123`;
const CONFIRM = '今のURLは使えなくなります。作り直しますか？';

function renderSheet(online = true) {
  const p = { onClose: vi.fn(), onMessage: vi.fn(), onEditStamps: vi.fn(), onSignOut: vi.fn() };
  render(<SettingsSheet db={db} roomId="r1" room={room} uid="u1" online={online} {...p} />);
  return p;
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe('設定シート', () => {
  it('購読URLのコピーで、決まった形のURLがクリップボードに入る', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { onMessage } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '購読URLをコピー' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(FEED));
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('コピーしました'));
  });

  it('招待URLのコピーで、決まった形のURLがクリップボードに入る', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '招待URLをコピー' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(INVITE));
  });

  it('コピーできないときは、URLを選べる欄に出す', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) } });
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '購読URLをコピー' }));
    expect(await screen.findByDisplayValue(FEED)).toBeInTheDocument();
  });

  it('作り直す前に確認が出て、やめれば作り直さない（招待URL）', async () => {
    vi.mocked(data.regenerateInvite).mockResolvedValue('x');
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '招待URLを作り直す' }));
    expect(screen.getByText(CONFIRM)).toBeInTheDocument();
    expect(data.regenerateInvite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    expect(screen.queryByText(CONFIRM)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '招待URLを作り直す' }));
    fireEvent.click(screen.getByRole('button', { name: '作り直す' }));
    await waitFor(() => expect(data.regenerateInvite).toHaveBeenCalledWith(db, 'r1'));
  });

  it('作り直す前に確認が出る（購読URL）', async () => {
    vi.mocked(data.regenerateFeedToken).mockResolvedValue('x');
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '購読URLを作り直す' }));
    expect(screen.getByText(CONFIRM)).toBeInTheDocument();
    expect(data.regenerateFeedToken).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '作り直す' }));
    await waitFor(() => expect(data.regenerateFeedToken).toHaveBeenCalledWith(db, 'r1'));
  });

  it('Googleカレンダーへの登録のしかたを書いてある', () => {
    renderSheet();
    expect(screen.getByText(/パソコンでGoogleカレンダーを開く/)).toBeInTheDocument();
    expect(screen.getByText(/スマホのアプリからは追加できません/)).toBeInTheDocument();
    expect(screen.getByText(/反映されるまで数時間から1日/)).toBeInTheDocument();
  });

  it('表示名を変えて保存する', async () => {
    vi.mocked(data.updateDisplayName).mockResolvedValue();
    renderSheet();
    fireEvent.change(screen.getByLabelText('表示名'), { target: { value: 'とし' } });
    fireEvent.click(screen.getByRole('button', { name: '名前を保存' }));
    await waitFor(() => expect(data.updateDisplayName).toHaveBeenCalledWith(db, 'r1', 'u1', 'とし'));
  });

  it('表示名が空・長すぎるときは保存せず知らせる', () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText('表示名'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '名前を保存' }));
    expect(screen.getByText('表示名を入力してください')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('表示名'), { target: { value: '12345678901' } });
    fireEvent.click(screen.getByRole('button', { name: '名前を保存' }));
    expect(screen.getByText('表示名は10文字までにしてください')).toBeInTheDocument();
    expect(data.updateDisplayName).not.toHaveBeenCalled();
  });

  it('スタンプの編集とログアウトのボタンがある', () => {
    const p = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'スタンプの編集' }));
    expect(p.onEditStamps).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }));
    expect(p.onSignOut).toHaveBeenCalled();
  });

  it('オフラインでは作り直せない（理由を書く）', () => {
    renderSheet(false);
    expect(screen.getByRole('button', { name: '招待URLを作り直す' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '購読URLを作り直す' })).toBeDisabled();
    expect(screen.getAllByText('インターネットにつながっているときに作り直せます').length).toBe(2);
    expect(screen.getByRole('button', { name: '招待URLをコピー' })).toBeEnabled();
  });

  it('オフラインでも表示名は返事を待たずに保存を進める', async () => {
    vi.mocked(data.updateDisplayName).mockReturnValue(new Promise(() => {})); // 返事が来ない
    const { onMessage } = renderSheet(false);
    fireEvent.change(screen.getByLabelText('表示名'), { target: { value: 'とし' } });
    fireEvent.click(screen.getByRole('button', { name: '名前を保存' }));
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('つながったときに反映されます')));
    expect(screen.getByRole('button', { name: '名前を保存' })).toBeEnabled();
  });
});
