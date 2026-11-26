import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallGuide } from '../../src/app/components/InstallGuide';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

function setUa(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}
function setStandalone(on: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: on }) as never;
}

beforeEach(() => {
  localStorage.clear();
  setStandalone(false);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('ホーム画面に追加の案内', () => {
  it('iPhone では共有ボタンの手順を出す', () => {
    setUa(IPHONE);
    render(<InstallGuide />);
    expect(screen.getByText(/共有/)).toBeInTheDocument();
    expect(screen.getAllByText(/ホーム画面に追加/).length).toBeGreaterThan(0);
  });

  it('Android ではメニューの手順を出す', () => {
    setUa(ANDROID);
    render(<InstallGuide />);
    expect(screen.getByText(/メニュー/)).toBeInTheDocument();
  });

  it('閉じたら覚えて、次からは出さない', () => {
    setUa(IPHONE);
    const { unmount } = render(<InstallGuide />);
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem('sc2_install_guide_dismissed')).toBe('1');
    unmount();
    render(<InstallGuide />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ホーム画面から開いているときは出さない', () => {
    setUa(IPHONE);
    setStandalone(true);
    render(<InstallGuide />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
