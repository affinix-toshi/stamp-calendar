const MARKERS = ['Line/', 'FBAN', 'FBAV', 'Instagram', '; wv)'];

/** LINE などのアプリ内ブラウザかどうか（Google ログインが使えない） */
export function isInAppBrowser(ua: string): boolean {
  return MARKERS.some((m) => ua.includes(m));
}
