import { useMemo, useState } from 'react';
import type { EditorProps } from '../App';
import { ItemIcon, NumberField, PageHead, itemLabel } from '../components/common';
import { ItemPicker } from '../components/ItemPicker';
import { categorize } from '../gamedata';
import { itemIdFor, itemKey } from '../lib/model';

const GROUPS: Array<{ id: string; label: string; match: (cat: string) => boolean }> = [
  { id: 'plorts', label: 'Plorts', match: (c) => c === 'plorts' },
  { id: 'resources', label: 'Resources', match: (c) => c === 'resources' },
  { id: 'gadgets', label: 'Gadgets & decorations (built, in storage)', match: (c) => c === 'gadgets' || c === 'deco' || c === 'toys' },
  { id: 'other', label: 'Other', match: () => true },
];

export function Refinery({ db, model, mutate, notify }: EditorProps): JSX.Element {
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return model.player.itemCounts
      .map(([id, count], idx) => ({ idx, id, count, key: itemKey(model, id) }))
      .filter((r) => !needle || itemLabel(db, r.key).toLowerCase().includes(needle))
      .sort((a, b) => itemLabel(db, a.key).localeCompare(itemLabel(db, b.key)));
  }, [model.player.itemCounts, model, db, q]);

  const grouped = GROUPS.map((g) => ({ g, rows: [] as typeof rows }));
  for (const r of rows) {
    const it = db.item(r.key);
    const cat = it ? categorize(it) : 'other';
    (grouped.find((x) => x.g.match(cat)) ?? grouped[grouped.length - 1]).rows.push(r);
  }

  const add = (key: string): void => {
    mutate((m) => {
      const id = itemIdFor(m, key);
      if (id < 0) return;
      const e = m.player.itemCounts.find(([k]) => k === id);
      if (e) e[1] += 1;
      else m.player.itemCounts.push([id, 1]);
    });
    setPicking(false);
  };

  return (
    <>
      <PageHead
        title="Refinery & storage"
        subtitle="Everything stored in the refinery (plorts, crafting resources) plus gadgets sitting in your gadget inventory."
        actions={
          <>
            <div className="search" style={{ width: 240 }}>
              <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button
              className="btn"
              onClick={() => {
                mutate((m) => {
                  for (const e of m.player.itemCounts) e[1] = Math.max(e[1], 999);
                });
                notify('All stored items set to at least 999', 'info');
              }}
            >
              All to 999
            </button>
            <button className="btn primary" onClick={() => setPicking(true)}>
              + Add item
            </button>
          </>
        }
      />
      {model.player.itemCounts.length === 0 && <div className="empty">Nothing in storage yet. Use “Add item”.</div>}
      {grouped
        .filter((g) => g.rows.length)
        .map(({ g, rows: rs }) => (
          <div key={g.id}>
            <div className="section-title">
              {g.label} <span className="count">{rs.length}</span>
            </div>
            <div className="item-table">
              {rs.map((r) => (
                <div className="item-line" key={r.id}>
                  <ItemIcon db={db} itemKey={r.key} size={40} />
                  <div className="name">
                    {itemLabel(db, r.key)}
                    <small>{r.key ?? `#${r.id}`}</small>
                  </div>
                  <NumberField
                    value={r.count}
                    max={999999}
                    onChange={(v) =>
                      mutate((m) => {
                        const e = m.player.itemCounts.find(([k]) => k === r.id);
                        if (e) e[1] = v;
                      })
                    }
                  />
                  <button className="del" title="Remove entry" onClick={() => mutate((m) => (m.player.itemCounts = m.player.itemCounts.filter(([k]) => k !== r.id)))}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      {picking && <ItemPicker db={db} model={model} mode="refinery" title="Add to storage" selected={null} onPick={add} onClose={() => setPicking(false)} />}
    </>
  );
}
