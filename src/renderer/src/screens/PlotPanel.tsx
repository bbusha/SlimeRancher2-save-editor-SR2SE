import { useMemo, useState } from 'react';
import type { Plot } from '@shared/sr2save';
import type { EditorProps } from '../App';
import { ItemIcon, NumberField, itemLabel } from '../components/common';
import { ItemPicker } from '../components/ItemPicker';
import type { PickerMode } from '../components/ItemPicker';
import {
  AMMO_SET,
  AMMO_SET_INFO,
  PLOT_TYPES,
  PLOT_TYPE_INFO,
  UPGRADES_FOR_TYPE,
  growerBase,
  growerIndexFor,
  itemIdFor,
  itemKey,
  plotDisplayName,
  setPlotType,
  togglePlotUpgrade,
} from '../lib/model';

function pickerModeFor(key: string): PickerMode {
  if (key === AMMO_SET.CORRAL_FEEDER) return 'food';
  if (key === AMMO_SET.CORRAL_PLORT_COLLECTOR) return 'plort';
  if (key === AMMO_SET.COOP_ELDER_COLLECTOR) return 'food';
  return 'storage';
}

export function PlotPanel({ db, model, mutate, plot, onClose }: EditorProps & { plot: Plot; onClose: () => void }): JSX.Element {
  const [picking, setPicking] = useState<{ key: string; idx: number } | null>(null);
  const names = plotDisplayName(db, plot.id);
  const info = PLOT_TYPE_INFO[plot.typeId] ?? PLOT_TYPE_INFO[1];

  const edit = (fn: (p: Plot) => void): void =>
    mutate((m) => {
      const p = m.plots.find((x) => x.id === plot.id);
      if (p) fn(p);
    });

  // Crops available for gardens: unique base crops from the save's grower index.
  const crops = useMemo(() => {
    const seen = new Map<string, { crop: string; kind: string; itemKey: string | null }>();
    model.growerIndex.forEach((pid) => {
      const g = growerBase(pid);
      if (!g || seen.has(g.crop)) return;
      const def = db.growersByPersistenceId.get(pid);
      seen.set(g.crop, { crop: g.crop, kind: g.kind, itemKey: def?.primary ?? null });
    });
    return [...seen.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.crop.localeCompare(b.crop));
  }, [model.growerIndex, db]);
  const currentCrop = plot.resourceGrowerId >= 0 ? growerBase(model.growerIndex[plot.resourceGrowerId] ?? '')?.crop ?? null : null;

  // Upgrades valid for this plot type, with the matching definition (coop vs corral variants share enum ids).
  const upgradeDefs = (UPGRADES_FOR_TYPE[plot.typeId] ?? []).map((u) => {
    const defs = db.data.plotUpgrades.filter((d) => d.upgrade === u);
    const preferCoop = plot.typeId === PLOT_TYPES.COOP;
    const def = defs.find((d) => (preferCoop ? d.id.startsWith('Coop') : !d.id.startsWith('Coop'))) ?? defs[0];
    return { u, def };
  });

  // Inhabitants from actors.
  const inhabitants = useMemo(() => {
    if (!plot.trackedActorIds?.length) return [];
    const ids = new Set(plot.trackedActorIds);
    const counts = new Map<string, number>();
    for (const a of model.actors) {
      if (!ids.has(a.actorId)) continue;
      const k = itemKey(model, a.typeId) ?? `#${a.typeId}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [plot.trackedActorIds, model]);

  return (
    <>
      <div className="head">
        <div className="big">{plot.typeId === 1 ? <span style={{ fontSize: 28, color: 'var(--text-3)' }}>+</span> : <img src={db.misc(info.icon) ?? ''} alt="" />}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{info.name}</h2>
          <small>
            {names.area} · {names.label} · {plot.id}
          </small>
        </div>
        <button className="icon-btn" onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      <div>
        <div className="section-title" style={{ marginTop: 4 }}>
          Plot type
        </div>
        <div className="type-grid">
          {Object.entries(PLOT_TYPE_INFO).map(([id, t]) => {
            const n = Number(id);
            return (
              <button key={id} className={`type-btn ${plot.typeId === n ? 'on' : ''} ${n === 1 ? 'empty' : ''}`} onClick={() => edit((p) => setPlotType(model, p, n))}>
                {n === 1 ? <span style={{ fontSize: 26, lineHeight: '34px' }}>∅</span> : <img src={db.misc(t.icon) ?? ''} alt="" />}
                {t.name.replace(' plot', '')}
              </button>
            );
          })}
        </div>
      </div>

      {plot.typeId === PLOT_TYPES.GARDEN && (
        <div>
          <div className="section-title">
            Crop <span className="count">{currentCrop ? model.growerIndex[plot.resourceGrowerId] : 'nothing planted'}</span>
          </div>
          <div className="crop-grid">
            <button className={`crop-btn ${plot.resourceGrowerId < 0 ? 'on' : ''}`} onClick={() => edit((p) => (p.resourceGrowerId = -1))} title="Nothing planted">
              <span style={{ fontSize: 22, color: 'var(--text-3)', lineHeight: '40px' }}>∅</span>
            </button>
            {crops.map((c) => (
              <button
                key={c.crop}
                className={`crop-btn ${currentCrop === c.crop ? 'on' : ''}`}
                title={c.itemKey ? itemLabel(db, c.itemKey) : c.crop}
                onClick={() => edit((p) => (p.resourceGrowerId = growerIndexFor(model, c.crop, p.upgrades)))}
              >
                <ItemIcon db={db} itemKey={c.itemKey} size={40} />
              </button>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 6 }}>
            The planted variant follows the garden upgrades (Nutrient Soil / Growth Amplifier / Miracle Mix).
          </div>
        </div>
      )}

      {upgradeDefs.length > 0 && (
        <div>
          <div className="section-title">
            Upgrades <span className="count">{plot.upgrades.length} owned</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              <button className="chip" onClick={() => edit((p) => { for (const { u } of upgradeDefs) if (!p.upgrades.includes(u)) togglePlotUpgrade(model, p, u); })}>
                All
              </button>
              <button className="chip" onClick={() => edit((p) => { for (const { u } of upgradeDefs) if (p.upgrades.includes(u)) togglePlotUpgrade(model, p, u); })}>
                None
              </button>
            </span>
          </div>
          <div className="upg-list">
            {upgradeDefs.map(({ u, def }) => {
              const on = plot.upgrades.includes(u);
              return (
                <button key={u} className={`upg-row ${on ? 'on' : ''}`} onClick={() => edit((p) => togglePlotUpgrade(model, p, u))}>
                  <img src={db.iconUrl(def?.icon) ?? ''} alt="" />
                  <span className="t">
                    {def?.title ?? `Upgrade #${u}`}
                    <small>{def?.description ?? ''}</small>
                  </span>
                  <span className="chk">{on ? '✓' : ''}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {plot.siloAmmo.map((set) => {
        const meta = AMMO_SET_INFO[set.key] ?? { name: 'Storage', slots: set.slots.length, upgrade: null };
        return (
          <div key={set.key}>
            <div className="section-title">
              {plot.typeId === PLOT_TYPES.SILO ? 'Silo storage' : meta.name}
              <span className="count">{set.slots.filter((s) => s.id >= 0).length}/{set.slots.length} used</span>
              <span style={{ marginLeft: 'auto' }}>
                <button
                  className="chip"
                  onClick={() =>
                    edit((p) => {
                      const s = p.siloAmmo.find((x) => x.key === set.key);
                      if (s) for (const slot of s.slots) if (slot.id >= 0) slot.count = 100;
                    })
                  }
                >
                  Fill 100
                </button>
              </span>
            </div>
            <div className="mini-slots">
              {set.slots.map((slot, idx) => {
                const key = itemKey(model, slot.id);
                return (
                  <div className="mini-slot" key={idx}>
                    <button className="ib" onClick={() => setPicking({ key: set.key, idx })} title={key ?? 'Choose item'}>
                      {key ? <ItemIcon db={db} itemKey={key} size={48} /> : <span className="plus">+</span>}
                    </button>
                    <span className="nm" title={itemLabel(db, key)}>
                      {itemLabel(db, key)}
                    </span>
                    {key ? (
                      <NumberField
                        value={slot.count}
                        max={9999}
                        onChange={(v) =>
                          edit((p) => {
                            const s = p.siloAmmo.find((x) => x.key === set.key)?.slots[idx];
                            if (!s) return;
                            s.count = v;
                            if (v <= 0) {
                              s.id = -1;
                              s.count = 0;
                            }
                          })
                        }
                      />
                    ) : (
                      <span className="hint">empty</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {plot.typeId !== PLOT_TYPES.EMPTY && (
        <div>
          <div className="section-title">
            Inside <span className="count">{plot.trackedActorIds?.length ?? 0} tracked actors</span>
          </div>
          {inhabitants.length === 0 ? (
            <div className="hint">No slimes, animals or crops are tracked here.</div>
          ) : (
            <div className="slime-list">
              {inhabitants.map(([k, n]) => (
                <span className="slime-chip" key={k} title={k}>
                  <span className="ic">
                    <ItemIcon db={db} itemKey={k} size={26} />
                  </span>
                  {itemLabel(db, k)} <span className="n">×{n}</span>
                </span>
              ))}
            </div>
          )}
          <div className="hint" style={{ marginTop: 6 }}>
            Inhabitants are world actors and are shown for reference; to remove them, empty the plot (they are released, not deleted).
          </div>
        </div>
      )}

      {picking && (
        <ItemPicker
          db={db}
          model={model}
          mode={plot.typeId === PLOT_TYPES.SILO ? 'storage' : pickerModeFor(picking.key)}
          title={AMMO_SET_INFO[picking.key]?.name ?? 'Storage slot'}
          selected={itemKey(model, plot.siloAmmo.find((s) => s.key === picking.key)?.slots[picking.idx]?.id ?? -1)}
          onPick={(k) => {
            edit((p) => {
              const s = p.siloAmmo.find((x) => x.key === picking.key)?.slots[picking.idx];
              if (!s) return;
              const id = itemIdFor(model, k);
              if (id < 0) return;
              s.id = id;
              if (s.count <= 0) s.count = 1;
            });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  );
}
