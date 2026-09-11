import { useState } from 'react';
import type { EditorProps } from '../App';
import { ItemIcon, NumberField, PageHead, Toggle, itemLabel } from '../components/common';
import { ItemPicker } from '../components/ItemPicker';
import { UPGRADE_ID, expectedAmmoSlots, itemIdFor, itemKey, newSlot, syncAmmoSlots, upgradeLevel } from '../lib/model';

/** Tank Booster levels: base 30 per slot, roughly +? each level. Used only as a hint. */
function capacityHint(model: EditorProps['model']): number {
  const lvl = upgradeLevel(model, UPGRADE_ID.AMMO_CAPACITY);
  return 30 + (lvl + 1) * 10;
}

export function VacPack({ db, model, mutate, notify }: EditorProps): JSX.Element {
  const [picking, setPicking] = useState<number | null>(null);
  const ammo = model.player.ammo;
  const expected = expectedAmmoSlots(model);
  const isLiquid = (id: number): boolean => db.item(itemKey(model, id))?.cls === 'LiquidDefinition';
  const cap = capacityHint(model);

  const setSlotItem = (idx: number, key: string): void => {
    mutate((m) => {
      const id = itemIdFor(m, key);
      if (id < 0) return;
      const s = m.player.ammo[idx];
      s.id = id;
      if (s.count <= 0) s.count = 1;
    });
    setPicking(null);
  };

  const fillAll = (): void => {
    mutate((m) => {
      for (const s of m.player.ammo) if (s.id >= 0) s.count = Math.max(s.count, cap);
    });
    notify(`All filled slots set to ${cap}`, 'info');
  };

  return (
    <>
      <PageHead
        title="Vac Pack"
        subtitle={`${ammo.length} slots · Tank Booster suggests ~${cap} per slot (higher values are allowed, the game may clamp them).`}
        actions={
          <>
            <button className="btn" onClick={fillAll}>
              Fill all to {cap}
            </button>
            <button
              className="btn"
              onClick={() =>
                mutate((m) => {
                  for (const s of m.player.ammo) {
                    s.id = -1;
                    s.count = 0;
                    s.radiant = false;
                  }
                })
              }
            >
              Empty all
            </button>
          </>
        }
      />
      {ammo.length !== expected.total && (
        <div className="notice" style={{ marginBottom: 14 }}>
          This save has {ammo.length} slots but the owned upgrades imply {expected.total} (4 base + Extra Tank levels{expected.hasWater ? ' + Water Tank' : ''}).{' '}
          <button className="btn small" style={{ marginLeft: 8 }} onClick={() => mutate((m) => syncAmmoSlots(m, db))}>
            Fix slot count
          </button>
        </div>
      )}
      <div className="slots">
        {ammo.map((s, idx) => {
          const key = itemKey(model, s.id);
          const water = isLiquid(s.id) || (expected.hasWater && idx === ammo.length - 1 && s.id < 0);
          const it = db.item(key);
          return (
            <div key={idx} className={`slot ${water ? 'water' : ''}`}>
              <span className="idx">{water ? 'WATER TANK' : `SLOT ${idx + 1}`}</span>
              {s.id >= 0 && (
                <button
                  className="clear"
                  title="Empty this slot"
                  onClick={() =>
                    mutate((m) => {
                      const x = m.player.ammo[idx];
                      x.id = -1;
                      x.count = 0;
                      x.radiant = false;
                    })
                  }
                >
                  ✕
                </button>
              )}
              {it?.cls === 'SlimeDefinition' && s.version >= 2 && (
                <span className="radiant" title="Radiant slime">
                  <Toggle on={s.radiant} onChange={(v) => mutate((m) => (m.player.ammo[idx].radiant = v))} label="✦" />
                </span>
              )}
              <button className="item-btn" onClick={() => setPicking(idx)} title="Choose item">
                {key ? <ItemIcon db={db} itemKey={key} size={90} /> : <span className="plus">+</span>}
              </button>
              <div className="name">
                {itemLabel(db, key)}
                <small>{key ?? 'click to choose an item'}</small>
              </div>
              <div className="row">
                <NumberField value={s.count} onChange={(v) => mutate((m) => (m.player.ammo[idx].count = v))} max={9999} />
              </div>
            </div>
          );
        })}
        <div className="slot" style={{ justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', minHeight: 230 }}>
          <button className="btn" onClick={() => mutate((m) => m.player.ammo.push(newSlot(m)))}>
            + Add slot
          </button>
          <button className="btn ghost small" disabled={ammo.length === 0 || ammo[ammo.length - 1].id >= 0} onClick={() => mutate((m) => m.player.ammo.pop())}>
            Remove last empty slot
          </button>
          <div className="hint" style={{ textAlign: 'center' }}>
            Slots beyond what your upgrades grant may be ignored or trimmed by the game.
          </div>
        </div>
      </div>
      {picking !== null && (
        <ItemPicker
          db={db}
          model={model}
          mode={isLiquid(ammo[picking].id) || (expected.hasWater && picking === ammo.length - 1) ? 'liquid' : 'vac'}
          title={`Slot ${picking + 1}`}
          selected={itemKey(model, ammo[picking].id)}
          onPick={(k) => setSlotItem(picking, k)}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  );
}
