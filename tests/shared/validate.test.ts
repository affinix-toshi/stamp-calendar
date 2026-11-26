import { describe, it, expect } from 'vitest';
import { checkLabel, checkMemo, checkDisplayName } from '../../src/shared/validate';

describe('validate', () => {
  it('checkLabel', () => {
    expect(checkLabel('仕事朝')).toBeNull();
    expect(checkLabel('ろくもじです')).toBeNull();
    expect(checkLabel('ながいなまえです')).toBe('スタンプの名前は6文字までにしてください');
    expect(checkLabel('')).toBe('スタンプの名前を入力してください');
    expect(checkLabel('  ')).toBe('スタンプの名前を入力してください');
  });
  it('checkMemo', () => {
    expect(checkMemo('')).toBeNull();
    expect(checkMemo('あ'.repeat(20))).toBeNull();
    expect(checkMemo('あ'.repeat(21))).toBe('メモは20文字までにしてください');
    // Array.from で数える（絵文字の組み合わせは複数文字として数える）
    expect(checkMemo('👨‍👩‍👧'.repeat(20))).not.toBeNull();
    expect(checkMemo('😀'.repeat(20))).toBeNull();
  });
  it('checkDisplayName', () => {
    expect(checkDisplayName('トシ')).toBeNull();
    expect(checkDisplayName('あ'.repeat(10))).toBeNull();
    expect(checkDisplayName('あ'.repeat(11))).toBe('表示名は10文字までにしてください');
    expect(checkDisplayName('')).toBe('表示名を入力してください');
    expect(checkDisplayName(' ')).toBe('表示名を入力してください');
  });
});
