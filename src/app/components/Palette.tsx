import type { StampType } from '../../shared/types';

interface Props {
  stampTypes: Record<string, StampType>;
  /** 選んだ順のID */
  selected: string[];
  onToggle: (typeId: string) => void;
  onAdd: () => void;
}

export function sortedTypes(stampTypes: Record<string, StampType>): [string, StampType][] {
  return Object.entries(stampTypes).sort(([, a], [, b]) => a.order - b.order);
}

export function Palette({ stampTypes, selected, onToggle, onAdd }: Props) {
  const chosen = selected.map((id) => stampTypes[id]).filter(Boolean);
  const hint =
    chosen.length === 0
      ? 'スタンプを選んで、日付をタップ'
      : `${chosen.map((t) => t.emoji).join(' ')} を選択中。日付をタップで押せます`;

  return (
    <nav className="palette" aria-label="スタンプ">
      <p className={`palette-hint${chosen.length > 0 ? ' is-active' : ''}`} aria-live="polite">
        {hint}
      </p>
      <div className="palette-tray">
        {sortedTypes(stampTypes).map(([id, t]) => {
          const on = selected.includes(id);
          return (
            <button
              key={id}
              type="button"
              className={`palette-stamp${on ? ' is-selected' : ''}`}
              aria-pressed={on}
              aria-label={`${t.emoji} ${t.label}`}
              onClick={() => onToggle(id)}
            >
              <span className="palette-emoji" aria-hidden="true">
                {t.emoji}
              </span>
              <span className="palette-label" aria-hidden="true">
                {t.label}
              </span>
            </button>
          );
        })}
        <button type="button" className="palette-stamp palette-add" aria-label="スタンプを追加" onClick={onAdd}>
          <span className="palette-emoji" aria-hidden="true">
            ＋
          </span>
          <span className="palette-label" aria-hidden="true">
            追加
          </span>
        </button>
      </div>
    </nav>
  );
}
