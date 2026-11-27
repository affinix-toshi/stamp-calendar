export type Route =
  | { name: 'home' }
  | { name: 'join'; roomId: string; code: string }
  | { name: 'demo' };

export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter((p) => p !== '');
  if (parts.length === 1 && parts[0] === 'demo') return { name: 'demo' };
  if (parts.length === 3 && parts[0] === 'join') {
    return { name: 'join', roomId: decodeURIComponent(parts[1]), code: decodeURIComponent(parts[2]) };
  }
  return { name: 'home' };
}
