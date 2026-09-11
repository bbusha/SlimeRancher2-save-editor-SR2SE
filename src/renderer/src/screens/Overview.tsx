import type { EditorProps } from '../App';
import { NumberField, PageHead } from '../components/common';
import { AREA_NAMES, AREA_ORDER, PLOT_TYPE_INFO, UPGRADE_ID, formatNumber, upgradeLevel } from '../lib/model';

const MONEY_PRESETS = [1_000, 10_000, 100_000, 1_000_000];

export function Overview({ db, model, mutate }: EditorProps): JSX.Element {
  const p = model.player;
  const newbucks = p.currencies.find((c) => c.id === 1) ?? p.currencies[0];
  const otherCurrencies = p.currencies.filter((c) => c !== newbucks);

  const setMoney = (v: number): void =>
    mutate((m) => {
      const c = m.player.currencies.find((x) => x.id === newbucks.id);
      if (c) c.amount = v;
      const s = m.summaryCurrencies.find((x) => x.id === newbucks.id);
      if (s) s.amount = v;
    });

  const healthLevel = upgradeLevel(model, UPGRADE_ID.HEALTH);
  const maxHealth = 100 + (healthLevel + 1) * 50; // Heart Module: +50 per level (approximate, for the bar only)
  const energyLevel = upgradeLevel(model, UPGRADE_ID.ENERGY);
  const maxEnergy = 100 + (energyLevel + 1) * 25;

  const areaProgress = AREA_ORDER.map((cell) => {
    const plots = model.plots.filter((pl) => db.plotsById.get(pl.id)?.cell === cell);
    return { cell, name: AREA_NAMES[cell] ?? cell, total: plots.length, built: plots.filter((pl) => pl.typeId !== 1).length };
  }).filter((a) => a.total > 0);

  const typeCounts = Object.entries(PLOT_TYPE_INFO)
    .map(([id, info]) => ({ id: Number(id), info, n: model.plots.filter((pl) => pl.typeId === Number(id)).length }))
    .filter((t) => t.id !== 1 && t.n > 0);

  return (
    <>
      <PageHead title="Overview" subtitle={`${model.info.gameName} · game build ${p.gameVersion}`} />
      <div className="grid cols-3">
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h3>
            <img src={db.misc('newbuck') ?? ''} alt="" /> Newbucks
          </h3>
          <NumberField big value={newbucks?.amount ?? 0} onChange={setMoney} prefixIcon={db.misc('newbuck')} step={100} />
          <div className="quick">
            {MONEY_PRESETS.map((v) => (
              <button key={v} className="chip" onClick={() => setMoney((newbucks?.amount ?? 0) + v)}>
                +{formatNumber(v)}
              </button>
            ))}
            <button className="chip" onClick={() => setMoney(9_999_999)}>
              Max (9,999,999)
            </button>
            <button className="chip" onClick={() => setMoney(0)}>
              Zero
            </button>
          </div>
          {otherCurrencies.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {otherCurrencies.map((c) => (
                <div className="field" key={c.id} style={{ marginTop: 8 }}>
                  <label>{c.id === 2 ? 'Rainbow coins' : c.id === 3 ? 'Sprinkles' : `Currency #${c.id}`}</label>
                  <NumberField
                    value={c.amount}
                    onChange={(v) =>
                      mutate((m) => {
                        const x = m.player.currencies.find((y) => y.id === c.id);
                        if (x) x.amount = v;
                        const s = m.summaryCurrencies.find((y) => y.id === c.id);
                        if (s) s.amount = v;
                      })
                    }
                  />
                </div>
              ))}
            </div>
          )}
          <div className="hint" style={{ marginTop: 12 }}>
            Lifetime earned: {formatNumber(newbucks?.everCollected ?? 0)} · The load-screen summary is updated too.
          </div>
        </div>

        <div className="card">
          <h3>Rancher</h3>
          <div className="field">
            <label>Health</label>
            <NumberField value={p.health} onChange={(v) => mutate((m) => (m.player.health = v))} max={100000} />
            <div className="bar">
              <i style={{ width: `${Math.min(100, (p.health / maxHealth) * 100)}%`, background: 'var(--pink)' }} />
            </div>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Energy</label>
            <NumberField value={p.energy} onChange={(v) => mutate((m) => (m.player.energy = v))} max={100000} />
            <div className="bar">
              <i style={{ width: `${Math.min(100, (p.energy / maxEnergy) * 100)}%`, background: 'var(--mint)' }} />
            </div>
          </div>
          <div className="grid cols-2" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Radiation</label>
              <NumberField value={p.radiation} onChange={(v) => mutate((m) => (m.player.radiation = v))} max={100000} />
            </div>
            <div className="field">
              <label>Keys</label>
              <NumberField value={p.keys} onChange={(v) => mutate((m) => (m.player.keys = v))} max={999} />
            </div>
          </div>
        </div>

        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h3>
            <img src={db.misc('pedia_risks') ?? ''} alt="" /> Upgrade components
          </h3>
          {model.componentIndex.length === 0 && <div className="hint">This save has no component index.</div>}
          {model.componentIndex.map((key, idx) => {
            const c = db.componentsByKey.get(key);
            const entry = p.components.find(([k]) => k === idx);
            return (
              <div className="component-row" key={key}>
                <img src={db.iconUrl(c?.icon) ?? ''} alt="" />
                <div className="name">
                  {c?.title ?? key.replace('UpgradeComponent.', '')}
                  <small>{c?.description ?? key}</small>
                </div>
                <NumberField
                  value={entry?.[1] ?? 0}
                  max={999}
                  onChange={(v) =>
                    mutate((m) => {
                      const e = m.player.components.find(([k]) => k === idx);
                      if (e) e[1] = v;
                      else if (v > 0) m.player.components.push([idx, v]);
                    })
                  }
                />
              </div>
            );
          })}
        </div>

        <div className="card">
          <h3>
            <img src={db.misc('zone_conservatory') ?? ''} alt="" /> Ranch progress
          </h3>
          {areaProgress.map((a) => (
            <div key={a.cell} className="stat-row">
              <span>{a.name}</span>
              <b>
                {a.built}/{a.total}
              </b>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {typeCounts.map((t) => (
              <span className="pill" key={t.id}>
                <img src={db.misc(t.info.icon) ?? ''} alt="" />
                {t.n} {t.info.name.toLowerCase()}
                {t.n > 1 ? 's' : ''}
              </span>
            ))}
          </div>
          <div className="stat-row" style={{ marginTop: 10 }}>
            <span>Gadget blueprints unlocked</span>
            <b>{p.blueprints.length}</b>
          </div>
          <div className="stat-row">
            <span>Actors in world</span>
            <b>{model.actors.length}</b>
          </div>
          <div className="stat-row">
            <span>Position</span>
            <b>
              {p.pos.x.toFixed(0)}, {p.pos.y.toFixed(0)}, {p.pos.z.toFixed(0)}
            </b>
          </div>
        </div>
      </div>
    </>
  );
}
