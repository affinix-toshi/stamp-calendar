import { describe, expect, it } from 'vitest';
import { isInAppBrowser } from '../../src/app/inAppBrowser';

describe('isInAppBrowser', () => {
  it('LINE のアプリ内ブラウザは true', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.0.0';
    expect(isInAppBrowser(ua)).toBe(true);
  });
  it('Facebook / Instagram / WebView は true', () => {
    expect(isInAppBrowser('Mozilla/5.0 [FBAN/FBIOS;FBAV/400.0]')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 Instagram 300.0')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 13; Pixel; wv) Chrome/120')).toBe(true);
  });
  it('iPhone Safari と Android Chrome は false', () => {
    expect(
      isInAppBrowser(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(false);
    expect(
      isInAppBrowser(
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe(false);
  });
});
