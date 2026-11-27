const LABEL_MAX = 6;
const MEMO_MAX = 20;
const DISPLAY_NAME_MAX = 10;

function length(s: string): number {
  return Array.from(s).length;
}

export function checkLabel(s: string): string | null {
  if (s.trim() === '') return 'スタンプの名前を入力してください';
  if (length(s) > LABEL_MAX) return `スタンプの名前は${LABEL_MAX}文字までにしてください`;
  return null;
}

/** メモは任意なので空はOK */
export function checkMemo(s: string): string | null {
  if (length(s) > MEMO_MAX) return `メモは${MEMO_MAX}文字までにしてください`;
  return null;
}

export function checkDisplayName(s: string): string | null {
  if (s.trim() === '') return '表示名を入力してください';
  if (length(s) > DISPLAY_NAME_MAX) return `表示名は${DISPLAY_NAME_MAX}文字までにしてください`;
  return null;
}
