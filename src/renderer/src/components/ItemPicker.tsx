import { useEffect, useMemo, useState } from 'react';
import type { GameDb, GameItem, ItemCategory } from '../gamedata';
import { categorize } from '../gamedata';
import type { SaveModel } from '@shared/ipc';
import { ItemIcon, itemLabel } from './common';

export type PickerMode = 'vac' | 'liquid' | 'plort' | 'food' | 'storage' | 'refinery' | 'any';

const CATEGORY_LABELS: Array<{ id: ItemCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'slimes', label: 'Slimes' },
  { id: 'plorts', label: 'Plorts' },
  { id: 'food', label: 'Food' },
  { id: 'animals', label: 'Animals' },
  { id: 'resources', label: 'Resources' },
  { id: 'toys', label: 'Toys' },
  { id: 'gadgets', label: 'Gadgets' },
  { id: 'deco', label: 'Decorations' },
  { id: 'other', label: 'Other' },
];

const MODE_CATEGORIES: Record<PickerMode, ItemCategory[] | null> = {
  vac: ['slimes', 'plorts', 'food', 'animals', 'resources', 'toys', 'other'],
  liquid: ['other'],
  plort: ['plorts'],
  food: ['food', 'animals'],
  storage: ['plorts', 'food', 'animals', 'resources', 'other'],
  refinery: ['plorts', 'resources', 'gadgets', 'deco', 'toys', 'other'],
  any: null,
};

function usable(it: GameItem, mode: PickerMode): boolean {
  if (!it.name && !it.icon) return false;
  if (it.isPlayer || it.id === 'None' || /^Container/.test(it.id)) return false;
  if (it.cls === 'SlimeDefinition' && it.isLargo && mode !== 'any') return false;
  if (mode === 'liquid') return it.cls === 'LiquidDefinition';
  if (it.cls === 'LiquidDefinition' && mode !== 'any') return false;
  const cats = MODE_CATEGORIES[mode];
  if (!cats) return true;
  return cats.includes(categorize(it));
}

export function ItemPicker({
  db,
  model,
  mode,
  title,
  selected,
  onPick,
  onClose,
}: {
  db: GameDb;
  model: SaveModel;
  mode: PickerMode;
  title: string;
  selected: string | null;
  onPick: (key: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<ItemCategory | 'all'>('all');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const indexSet = useMemo(() => new Set(model.itemIndex), [model.itemIndex]);
  const list = useMemo(() => {
    const effMode: PickerMode = showAll ? 'any' : mode;
    const needle = q.trim().toLowerCase();
    return db.data.items
      .filter((it) => indexSet.has(it.key))
      .filter((it) => usable(it, effMode))
      .filter((it) => cat === 'all' || categorize(it) === cat)
      .filter((it) => !needle || itemLabel(db, it.key).toLowerCase().includes(needle) || it.id.toLowerCase().includes(needle))
      .sort((a, b) => itemLabel(db, a.key).localeCompare(itemLabel(db, b.key)));
  }, [db, indexSet, mode, showAll, q, cat]);

  const cats = CATEGORY_LABELS.filter((c) => {
    if (c.id === 'all') return true;
    const allowed = showAll ? null : MODE_CATEGORIES[mode];
    return !allowed || allowed.includes(c.id);
  });

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="head">
          <h2>{title}</h2>
          <div className="search">
            <input autoFocus placeholder="Search items… (name or internal id)" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <span className="toggle" style={{ marginRight: 4 }}>
            <label className={`toggle ${showAll ? 'on' : ''}`} onClick={() => setShowAll(!showAll)}>
              <span className="sw" /> Show everything
            </label>
          </span>
          <button className="icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="cats">
          {cats.map((c) => (
            <button key={c.id} className={`chip ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}>
              {c.label}
            </button>
          ))}
          <span className="hint" style={{ marginLeft: 'auto', alignSelf: 'center' }}>
            {list.length} items
          </span>
        </div>
        <div className="items">
          {list.map((it) => (
            <button key={it.key} className={`pick ${selected === it.key ? 'selected' : ''}`} onClick={() => onPick(it.key)} title={it.key}>
              <ItemIcon db={db} itemKey={it.key} size={64} />
              <span>{itemLabel(db, it.key)}</span>
            </button>
          ))}
          {!list.length && <div className="empty">Nothing matches.</div>}
        </div>
      </div>
    </div>
  );
}
