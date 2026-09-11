import { useCallback, useEffect, useState } from 'react';
import type { SaveModel } from '@shared/ipc';
import { loadGameData } from './gamedata';
import type { GameDb } from './gamedata';
import { TitleBar } from './components/TitleBar';
import { Welcome } from './screens/Welcome';
import { Overview } from './screens/Overview';
import { Upgrades } from './screens/Upgrades';
import { VacPack } from './screens/VacPack';
import { Refinery } from './screens/Refinery';
import { RanchMap } from './screens/RanchMap';
import { formatNumber } from './lib/model';

type Screen = 'overview' | 'upgrades' | 'vac' | 'refinery' | 'ranch';

interface Toast {
  id: number;
  msg: string;
  detail?: string;
  kind: 'ok' | 'err' | 'info';
}

export interface EditorProps {
  db: GameDb;
  model: SaveModel;
  /** Mutate the model in place and re-render. */
  mutate: (fn: (m: SaveModel) => void) => void;
  notify: (msg: string, kind?: 'ok' | 'err' | 'info', detail?: string) => void;
}

const NAV: Array<{ id: Screen; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: 'misc_newbuck.png' },
  { id: 'upgrades', label: 'Upgrades', icon: 'upgrade_Jetpack.png' },
  { id: 'vac', label: 'Vac Pack', icon: 'upgrade_AmmoSlots.png' },
  { id: 'refinery', label: 'Refinery', icon: 'misc_plot_silo.png' },
  { id: 'ranch', label: 'Ranch Map', icon: 'misc_zone_conservatory.png' },
];

export default function App(): JSX.Element {
  const [db, setDb] = useState<GameDb | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [model, setModel] = useState<SaveModel | null>(null);
  const [, setTick] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [screen, setScreen] = useState<Screen>('overview');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadGameData()
      .then(setDb)
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  const notify = useCallback((msg: string, kind: 'ok' | 'err' | 'info' = 'info', detail?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, detail, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 9000 : 4500);
  }, []);

  const mutate = useCallback((fn: (m: SaveModel) => void) => {
    setModel((m) => {
      if (!m) return m;
      fn(m);
      return m;
    });
    setDirty(true);
    setTick((t) => t + 1);
  }, []);

  const open = useCallback(
    async (path: string) => {
      try {
        const m = await window.api.openSave(path);
        setModel(m);
        setDirty(false);
        setScreen('overview');
        if (m.actorParseError) notify('Ranch contents could not be fully read', 'info', m.actorParseError);
      } catch (e) {
        notify('Could not open save', 'err', e instanceof Error ? e.message : String(e));
      }
    },
    [notify],
  );

  useEffect(() => {
    // Development hook so automation can open files without the native dialog.
    if (import.meta.env.DEV) (window as unknown as { __sr2se: unknown }).__sr2se = { open };
  }, [open]);

  const save = useCallback(async () => {
    if (!model) return;
    setSaving(true);
    try {
      const res = await window.api.writeSave({ path: model.path, player: model.player, summaryCurrencies: model.summaryCurrencies, plots: model.plots });
      if (res.ok) {
        setDirty(false);
        notify('Save written', 'ok', `Backup: ${res.backupPath}`);
      } else {
        notify('Save failed — file left untouched', 'err', res.error);
      }
    } finally {
      setSaving(false);
    }
  }, [model, notify]);

  const close = useCallback(() => {
    if (dirty && !window.confirm('You have unsaved changes. Close this save anyway?')) return;
    setModel(null);
    setDirty(false);
  }, [dirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !saving) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, saving, save]);

  // Not memoized: the model is mutated in place, so identity never changes.
  const money = model?.player.currencies.find((c) => c.id === 1)?.amount ?? model?.player.currencies[0]?.amount ?? 0;

  if (loadError) {
    return (
      <div className="app">
        <TitleBar />
        <div className="loading">Game data could not be loaded: {loadError}</div>
      </div>
    );
  }
  if (!db) {
    return (
      <div className="app">
        <TitleBar />
        <div className="loading">Loading game data…</div>
      </div>
    );
  }

  const props: EditorProps | null = model ? { db, model, mutate, notify } : null;

  return (
    <div className="app">
      <TitleBar fileName={model?.info.fileName} dirty={dirty} />
      {!model || !props ? (
        <div className="content">
          <Welcome db={db} onOpen={open} notify={(m, k) => notify(m, k ?? 'info')} />
        </div>
      ) : (
        <div className="workspace">
          <aside className="sidebar">
            <div className="save-card">
              <div className="title">
                <img src={db.misc('zone_conservatory') ?? ''} alt="" width={22} height={22} />
                {model.info.gameName}
              </div>
              <div className="sub" title={model.path}>
                {model.info.fileName}
              </div>
              <div className="stats">
                <span className="pill">
                  <img src={db.misc('newbuck') ?? ''} alt="" />
                  {formatNumber(money)}
                </span>
                <span className="pill">
                  {model.plots.filter((p) => p.typeId !== 1).length}/{model.plots.length} plots
                </span>
                <span className="pill">v{model.info.gameVersion}</span>
              </div>
            </div>
            <nav className="nav">
              {NAV.map((n) => (
                <button key={n.id} className={screen === n.id ? 'active' : ''} onClick={() => setScreen(n.id)}>
                  <span className="ico">
                    <img src={db.iconUrl(n.icon) ?? ''} alt="" />
                  </span>
                  {n.label}
                  {n.id === 'vac' && <span className="badge">{model.player.ammo.length} slots</span>}
                  {n.id === 'refinery' && <span className="badge">{model.player.itemCounts.length}</span>}
                </button>
              ))}
            </nav>
            <div className="bottom">
              <button className="btn primary block" onClick={save} disabled={!dirty || saving}>
                {saving ? 'Saving…' : dirty ? 'Save changes' : 'No changes'}
              </button>
              <button className="btn ghost block" onClick={close}>
                Close save
              </button>
              <div className="hint">
                Ctrl+S saves. A backup of the original file is stored in <b>SR2SE-backups</b> next to the save before every write. Make sure the game is closed.
              </div>
            </div>
          </aside>
          {screen === 'ranch' ? (
            <div className="content no-pad">
              <RanchMap {...props} />
            </div>
          ) : (
            <div className="content">
              {screen === 'overview' && <Overview {...props} />}
              {screen === 'upgrades' && <Upgrades {...props} />}
              {screen === 'vac' && <VacPack {...props} />}
              {screen === 'refinery' && <Refinery {...props} />}
            </div>
          )}
        </div>
      )}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <b>{t.msg}</b>
            {t.detail && <small>{t.detail}</small>}
          </div>
        ))}
      </div>
    </div>
  );
}
