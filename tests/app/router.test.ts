import { describe, expect, it } from 'vitest';
import { parseRoute } from '../../src/app/router';

describe('parseRoute', () => {
  it('/join/{roomId}/{code}', () => {
    expect(parseRoute('/join/abc/XYZ')).toEqual({ name: 'join', roomId: 'abc', code: 'XYZ' });
  });
  it('/demo', () => {
    expect(parseRoute('/demo')).toEqual({ name: 'demo' });
  });
  it('それ以外は home', () => {
    expect(parseRoute('/')).toEqual({ name: 'home' });
    expect(parseRoute('/join/abc')).toEqual({ name: 'home' });
    expect(parseRoute('/other')).toEqual({ name: 'home' });
  });
});
