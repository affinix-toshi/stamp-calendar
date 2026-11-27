import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallGuide } from '../../src/app/components/InstallGuide';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';
const originalUa = navigator.userAgent;

function setUa(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}
function setTouch(n: number) {
  Object.defineProperty(navigator, 'maxTouchPoints', { value: n, configurable: true });
}
function setStandalone(on: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: on }) as never;
}

beforeEach(() => {
  localStorage.clear();
  setStandalone(false);
});
afterEach(() => {
  setUa(originalUa);
  setTouch(0);
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

  it('パソコン（デスクトップ）では何も出さない', () => {
    setUa(DESKTOP);
    render(<InstallGuide />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Mac のふりをした iPad（タッチあり）は iPhone と同じ手順を出す', () => {
    setUa(IPAD_AS_MAC);
    setTouch(5);
    render(<InstallGuide />);
    expect(screen.getByText(/共有/)).toBeInTheDocument();
  });

  it('タッチのない本物の Mac では出さない', () => {
    setUa(IPAD_AS_MAC);
    setTouch(0);
    render(<InstallGuide />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
