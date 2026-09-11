import { useEffect, useState } from 'react';
import type { SaveFolderScan, SaveInfo } from '@shared/ipc';
import type { GameDb } from '../gamedata';
import { formatDate, formatNumber } from '../lib/model';

const WINDOWS_CRUMBS = ['C:', 'Users', '‹you›', 'AppData', 'LocalLow', 'MonomiPark', 'SlimeRancher2', 'Steam', '‹Steam ID›'];
const LINUX_CRUMBS = ['~', '.steam', 'steam', 'steamapps', 'compatdata', '1657630', 'pfx', 'drive_c', 'users', 'steamuser', 'AppData', 'LocalLow', 'MonomiPark', 'SlimeRancher2', 'Steam', '‹Steam ID›'];

function slotLabel(info: SaveInfo): { slot: string; primary: boolean } {
  // File names look like 20260818231023_2_0.sav — the trailing number is 0
  // for the current save and 1..5 for the game's own rolling backups.
  const m = /_(\d+)_(\d+)\.sav$/i.exec(info.fileName);
  if (!m) return { slot: '?', primary: false };
  return { slot: m[2] === '0' ? '★' : `#${m[2]}`, primary: m[2] === '0' };
}

export function Welcome({ db, onOpen, notify }: { db: GameDb; onOpen: (path: string) => void; notify: (msg: string, kind?: 'ok' | 'err') => void }): JSX.Element {
  const [scan, setScan] = useState<SaveFolderScan | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBackups, setShowBackups] = useState(false);
  const linux = scan?.platform === 'linux';

  const refresh = async (): Promise<void> => {
    setLoading(true);
    try {
      setScan(await window.api.scanDefaultFolder());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const copyPath = async (): Promise<void> => {
    if (!scan) return;
    await navigator.clipboard.writeText(scan.root);
    notify('Folder path copied to clipboard');
  };

  const browse = async (): Promise<void> => {
    const m = await window.api.openDialog();
    if (m) onOpen(m.path);
  };

  const groups = new Map<string, SaveInfo[]>();
  for (const s of scan?.saves ?? []) {
    if (!showBackups && !slotLabel(s).primary) continue;
    const list = groups.get(s.folder) ?? [];
    list.push(s);
    groups.set(s.folder, list);
  }
  const backupCount = (scan?.saves ?? []).filter((s) => !slotLabel(s).primary).length;

  return (
    <div className="welcome">
      <div className="hero">
        <div className="logo">
          <img src={db.misc('zone_conservatory') ?? ''} alt="" />
        </div>
        <div>
          <h1>Slime Rancher 2 Save Editor</h1>
          <p>Edit money, upgrades, your vac pack, the refinery and every ranch plot — with the real game icons and map.</p>
        </div>
      </div>

      <div className="welcome-grid">
        <div className="card">
          <h3>
            <img src={db.misc('map_boat') ?? ''} alt="" /> Where is my save file?
          </h3>
          <div className="steps">
            <div className="step">
              <div className="n">1</div>
              <div className="body">
                {linux ? (
                  <>
                    <b>On SteamOS / Linux the saves live inside the game&apos;s Proton prefix</b>
                    <p>
                      Switch to Desktop Mode. The editor scans every Steam library (internal drive and SD card) automatically — see the list on the right. To browse manually, open Dolphin, press <kbd>Alt</kbd> + <kbd>.</kbd> to show hidden folders and follow the path below.
                    </p>
                  </>
                ) : (
                  <>
                    <b>Slime Rancher 2 keeps its saves in a hidden Windows folder</b>
                    <p>Press <kbd>Win</kbd> + <kbd>R</kbd>, paste the path below and hit Enter — or just use the list on the right, the editor already scanned it.</p>
                  </>
                )}
                <div className="path-box">
                  <span title={scan?.root}>{scan?.root ?? '…'}</span>
                  <button className="btn small" onClick={copyPath}>
                    Copy
                  </button>
                  <button className="btn small" onClick={() => scan && window.api.openPath(scan.root)} disabled={!scan?.exists}>
                    Open folder
                  </button>
                </div>
                {scan && scan.roots.length > 1 && (
                  <div className="hint" style={{ marginTop: 6 }}>
                    Also checked: {scan.roots.slice(1).join(' · ')}
                  </div>
                )}
                <div className="crumbs">
                  {(linux ? LINUX_CRUMBS : WINDOWS_CRUMBS).map((c, i, arr) => (
                    <span key={c} style={{ display: 'contents' }}>
                      <span className={`crumb ${c.startsWith('‹') || ['LocalLow', 'MonomiPark', 'SlimeRancher2', 'Steam', 'compatdata', '1657630'].includes(c) ? 'hl' : ''}`}>{c}</span>
                      {i < arr.length - 1 && <span className="crumb-sep">›</span>}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="step">
              <div className="n">2</div>
              <div className="body">
                <b>Pick the right file</b>
                <p>Each save game is a set of files named after the moment it was created. The one ending in <code>_0</code> is the current save; the others are the game&apos;s own rolling backups.</p>
                <div className="filename-demo">
                  <span className="a">20260818231023</span>
                  <span className="d">_</span>
                  <span className="b">2</span>
                  <span className="d">_</span>
                  <span className="c">0</span>
                  <span className="d">.sav</span>
                </div>
                <div className="legend">
                  <span>
                    <i style={{ background: 'var(--blue)' }} />
                    game created (date &amp; time)
                  </span>
                  <span>
                    <i style={{ background: 'var(--orange)' }} />
                    save slot
                  </span>
                  <span>
                    <i style={{ background: 'var(--mint)' }} />
                    0 = current, 1–5 = auto backups
                  </span>
                </div>
              </div>
            </div>
            <div className="step">
              <div className="n">3</div>
              <div className="body">
                <b>Close the game before saving changes</b>
                <p>
                  The game overwrites the file when it autosaves. Quit to the desktop first, edit, click <b>Save changes</b>, then launch the game. A backup copy of the original is written to an <code>SR2SE-backups</code> folder next to the save every time.
                </p>
                <p style={{ marginTop: 6 }}>
                  If Steam shows a <b>Cloud sync conflict</b> when you start the game, choose the <b>local</b> (newer) file — that is your edited save.
                </p>
                {linux && (
                  <p style={{ marginTop: 6 }}>
                    Steam Deck tip: add this AppImage as a non-Steam game to launch it from Game Mode; the trackpads work as a mouse and the on-screen keyboard opens with <kbd>Steam</kbd> + <kbd>X</kbd>.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>
            <img src={db.misc('pedia_slimeology') ?? ''} alt="" /> Detected saves
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button className="btn small" onClick={refresh} disabled={loading}>
                {loading ? 'Scanning…' : 'Rescan'}
              </button>
              <button className="btn small primary" onClick={browse}>
                Browse…
              </button>
            </span>
          </h3>
          {scan && !scan.exists && <div className="notice">The default save folder does not exist on this PC. Use Browse… to open a .sav file from elsewhere.</div>}
          {scan && scan.exists && scan.saves.length === 0 && <div className="empty">No .sav files found. Start a game once, then come back.</div>}
          {backupCount > 0 && (
            <label className={`toggle ${showBackups ? 'on' : ''}`} style={{ marginBottom: 12 }} onClick={() => setShowBackups(!showBackups)}>
              <span className="sw" /> Show the game&apos;s auto-backups ({backupCount})
            </label>
          )}
          {[...groups.entries()].map(([folder, saves]) => (
            <div key={folder} style={{ marginBottom: 14 }}>
              <div className="hint" style={{ margin: '4px 0 8px', userSelect: 'text' }} title={folder}>
                {folder}
              </div>
              <div className="saves-list">
                {saves.map((s) => {
                  const sl = slotLabel(s);
                  return (
                    <button key={s.path} className={`save-row ${s.error ? 'broken' : ''}`} onClick={() => !s.error && onOpen(s.path)} disabled={!!s.error}>
                      <div className={`slot ${sl.primary ? 'primary' : ''}`}>{sl.slot}</div>
                      <div className="info">
                        <div className="name">
                          {s.fileName}
                          {s.error ? <span className="tag warn">UNSUPPORTED</span> : sl.primary ? <span className="tag ok">CURRENT</span> : <span className="tag">BACKUP</span>}
                        </div>
                        <div className="meta">
                          <span>{formatDate(s.modifiedMs)}</span>
                          {s.error ? <span>{s.error}</span> : (
                            <>
                              <span>format v{s.gameVersion}</span>
                              <span>
                                {s.usedPlots}/{s.plotCount} plots built
                              </span>
                              <span>{s.actorCount} actors</span>
                            </>
                          )}
                        </div>
                      </div>
                      {s.money !== null && (
                        <div className="money">
                          <img src={db.misc('newbuck') ?? ''} alt="" />
                          {formatNumber(s.money)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
