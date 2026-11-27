import type { StampType } from './types';

/** 旧版から引き継ぐ初期スタンプ */
export const DEFAULT_STAMP_TYPES: StampType[] = [
  { emoji: '🏠', label: '在宅', order: 0 },
  { emoji: '😴', label: '休み', order: 1 },
  { emoji: '❌', label: '不在', order: 2 },
  { emoji: '💼', label: '仕事朝', order: 3 },
  { emoji: '☀️', label: '仕事昼', order: 4 },
  { emoji: '🌙', label: '仕事夜', order: 5 },
  { emoji: '🎹', label: 'ピアノ', order: 6 },
  { emoji: '👶', label: '赤ちゃん', order: 7 },
  { emoji: '🍺', label: '飲み会', order: 8 },
  { emoji: '🍷', label: 'ワイン', order: 9 },
];
