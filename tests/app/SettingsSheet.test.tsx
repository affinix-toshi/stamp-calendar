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

function renderSheet(online = true, demo = false) {
  const p = { onClose: vi.fn(), onMessage: vi.fn(), onEditStamps: vi.fn(), onSignOut: vi.fn() };
  render(<SettingsSheet db={db} roomId="r1" room={room} uid="u1" online={online} demo={demo} {...p} />);
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

  describe('見本ルーム（demo）', () => {
    it('招待URLと購読URLのボタンは押しても「見本では使えません」。コピーも作り直しもしない', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });
      const { onMessage } = renderSheet(true, true);
      fireEvent.click(screen.getByRole('button', { name: '招待URLをコピー' }));
      fireEvent.click(screen.getByRole('button', { name: '購読URLをコピー' }));
      expect(onMessage).toHaveBeenCalledTimes(2);
      expect(onMessage).toHaveBeenNthCalledWith(1, '見本では使えません');
      expect(onMessage).toHaveBeenNthCalledWith(2, '見本では使えません');
      expect(writeText).not.toHaveBeenCalled();
    });

    it('作り直すボタンは出ない。URLの入力欄も出ない', () => {
      renderSheet(true, true);
      expect(screen.queryByRole('button', { name: '招待URLを作り直す' })).toBeNull();
      expect(screen.queryByRole('button', { name: '購読URLを作り直す' })).toBeNull();
      expect(screen.queryByDisplayValue(INVITE)).toBeNull();
    });

    it('ログアウトは出ない', () => {
      renderSheet(true, true);
      expect(screen.queryByRole('button', { name: 'ログアウト' })).toBeNull();
    });

    it('「最初の状態に戻す」で POST /api/demo/reset を呼び、終わったらメッセージを出す', async () => {
      const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
      vi.stubGlobal('fetch', fetchMock);
      try {
        const { onMessage } = renderSheet(true, true);
        fireEvent.click(screen.getByRole('button', { name: '最初の状態に戻す' }));
        await waitFor(() => expect(onMessage).toHaveBeenCalledWith('最初の状態に戻しました'));
        expect(fetchMock).toHaveBeenCalledWith('/api/demo/reset', expect.objectContaining({ method: 'POST' }));
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('戻せなかったときは、その旨をメッセージに出す', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 503 })));
      try {
        const { onMessage } = renderSheet(true, true);
        fireEvent.click(screen.getByRole('button', { name: '最初の状態に戻す' }));
        await waitFor(() => expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('戻せませんでした')));
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('ふだんの画面には「最初の状態に戻す」は出ない', () => {
      renderSheet();
      expect(screen.queryByRole('button', { name: '最初の状態に戻す' })).toBeNull();
    });
  });
});
