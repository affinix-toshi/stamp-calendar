import type { OldRoom } from '../../scripts/migrate/transform';

/** 旧アプリ（v1）の家族ルームの形をまねた見本データ。本物のデータではない */
export function oldRoomFixture(): OldRoom {
  return {
    users: {
      oldA1: { name: 'トシ', ts: 1745000000000 },
      oldA2: { name: 'とし(iPad)', ts: 1746000000000 },
      oldB1: { name: 'ママ', ts: 1745500000000 },
    },
    stamps: {
      '2026-04-01': {
        '-Np001': { emoji: '🍳', label: 'ごはん', userId: 'oldA1', userName: 'トシ', ts: 1775000000001 },
        '-Np002': { emoji: '🛁', label: 'おふろ', userId: 'oldB1', userName: 'ママ', ts: 1775000000002 },
      },
      '2026-04-15': {
        '-Np003': { emoji: '🧹', label: 'そうじ', userId: 'oldA2', userName: 'とし(iPad)', ts: 1776000000003 },
      },
      '2026-05-02': {
        '-Np004': { emoji: '🛒', label: '買い物', userId: 'oldB1', userName: 'ママ', ts: 1777000000004 },
      },
    },
  };
}

export const MAP = { oldA1: 'uidToshi', oldA2: 'uidToshi', oldB1: 'uidMama' };
export const NAMES = { uidToshi: 'としひこ', uidMama: 'ゆかり' };
export const MEMBERS = {
  uidToshi: { name: 'としひこ', joinedAt: 1790000000000 },
  uidMama: { name: 'ゆかり', joinedAt: 1790000000001 },
};
