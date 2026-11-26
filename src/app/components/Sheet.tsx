import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface Props {
  /** 画面読み上げ用の名前（ダイアログの名前にもなる） */
  label: string;
  /** 見出しとして見せる文字 */
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** 下から出るシートの共通の枠（背景タップ・Escape・×で閉じる） */
export function Sheet({ label, title, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <header className="sheet-head">
          <div className="sheet-title">
            <p className="sheet-label">{title}</p>
          </div>
          <button type="button" className="sheet-close" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
