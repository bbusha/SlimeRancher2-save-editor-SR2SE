import type { EditorProps } from '../App';
import { PageHead } from '../components/common';
import { UPGRADE_ID, setUpgradeLevel, syncAmmoSlots, upgradeLevel } from '../lib/model';

export function Upgrades({ db, model, mutate, notify }: EditorProps): JSX.Element {
  const upgrades = [...db.data.upgrades].sort((a, b) => a.uniqueId - b.uniqueId);
  const owned = upgrades.filter((u) => upgradeLevel(model, u.uniqueId) >= 0).length;

  const setLevel = (uniqueId: number, level: number): void => {
    mutate((m) => {
      const before = m.player.ammo.length;
      setUpgradeLevel(m, uniqueId, level);
      if (uniqueId === UPGRADE_ID.AMMO_SLOTS || uniqueId === UPGRADE_ID.LIQUID_SLOT) {
        syncAmmoSlots(m, db);
        if (m.player.ammo.length !== before) notify(`Vac pack now has ${m.player.ammo.length} slots`, 'info');
      }
    });
  };

  const setAll = (max: boolean): void => {
    mutate((m) => {
      for (const u of upgrades) setUpgradeLevel(m, u.uniqueId, max ? u.levels.length - 1 : -1);
      syncAmmoSlots(m, db);
    });
    notify(max ? 'All upgrades maxed' : 'All upgrades removed', 'info');
  };

  return (
    <>
      <PageHead
        title="Upgrades"
        subtitle={`${owned} of ${upgrades.length} upgrade lines owned. Click a level to set it; "—" removes the upgrade.`}
        actions={
          <>
            <button className="btn" onClick={() => setAll(false)}>
              Remove all
            </button>
            <button className="btn mint" onClick={() => setAll(true)}>
              Max everything
            </button>
          </>
        }
      />
      <div className="grid auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
        {upgrades.map((u) => {
          const level = upgradeLevel(model, u.uniqueId);
          const current = level >= 0 ? u.levels[Math.min(level, u.levels.length - 1)] : null;
          const first = u.levels[0];
          return (
            <div key={u.uniqueId} className={`upgrade-card ${level >= 0 ? 'owned' : ''}`}>
              <div className="icon">
                <img src={db.iconUrl(u.icon) ?? ''} alt="" />
              </div>
              <div className="body">
                <h4>{current?.title ?? first?.title ?? u.id}</h4>
                <div className="desc" title={(current ?? first)?.description ?? ''}>
                  {(current ?? first)?.description ?? ''}
                </div>
                <div className="levels">
                  <button className={`level none ${level < 0 ? 'on' : ''}`} onClick={() => setLevel(u.uniqueId, -1)} title="Not owned">
                    —
                  </button>
                  {u.levels.map((lv, i) => (
                    <button key={i} className={`level ${level === i ? 'on' : ''}`} onClick={() => setLevel(u.uniqueId, i)} title={`${lv.title ?? ''}${lv.currency[0] ? ` · ${lv.currency[0].amount} newbucks` : ''}`}>
                      {u.levels.length === 1 ? 'Owned' : romanize(i + 1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function romanize(n: number): string {
  const map: Array<[number, string]> = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  for (const [v, s] of map) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}
