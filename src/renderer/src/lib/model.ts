import type { AmmoSlot, Plot } from '@shared/sr2save';
import { emptyAmmoSlot } from '@shared/sr2save';
import type { SaveModel } from '@shared/ipc';
import type { GameDb } from '../gamedata';

/** LandPlot.Id */
export const PLOT_TYPES = {
  NONE: 0,
  EMPTY: 1,
  CORRAL: 2,
  COOP: 3,
  GARDEN: 4,
  SILO: 5,
  POND: 6,
  INCINERATOR: 7,
} as const;

export const PLOT_TYPE_INFO: Record<number, { name: string; icon: string; color: string }> = {
  1: { name: 'Empty plot', icon: '', color: '#3b4b66' },
  2: { name: 'Corral', icon: 'plot_corral', color: '#ff5fa2' },
  3: { name: 'Coop', icon: 'plot_coop', color: '#ffb347' },
  4: { name: 'Garden', icon: 'plot_garden', color: '#5ee6c2' },
  5: { name: 'Silo', icon: 'plot_silo', color: '#5eb4ff' },
  6: { name: 'Pond', icon: 'plot_pond', color: '#4fd1ff' },
  7: { name: 'Incinerator', icon: 'plot_incinerator', color: '#ff7b5b' },
};

/** LandPlot.Upgrade */
export const PLOT_UPGRADE = {
  WALLS: 1,
  MUSIC_BOX: 2,
  STORAGE2: 3,
  STORAGE3: 4,
  STORAGE4: 5,
  SOIL: 6,
  SPRINKLER: 7,
  SCARESLIME: 8,
  FEEDER: 9,
  VITAMIZER: 10,
  AIR_NET: 11,
  PLORT_COLLECTOR: 12,
  SOLAR_SHIELD: 13,
  ASH_TROUGH: 14,
  MIRACLE_MIX: 15,
  DELUXE_GARDEN: 16,
  DELUXE_COOP: 17,
  PLORT_COLLECTOR_POND: 18,
  PLORT_COLLECTOR_INCINERATOR: 19,
  STORAGE_CAPACITY_INCREASE: 20,
} as const;

/** Which upgrades each plot type can have, in display order. */
export const UPGRADES_FOR_TYPE: Record<number, number[]> = {
  2: [1, 11, 13, 2, 9, 12],
  3: [1, 9, 10, 17],
  4: [6, 7, 8, 15, 16],
  5: [3, 4, 5, 20],
  6: [18],
  7: [14, 19],
};

/** PlotAmmoSetDefinition GUIDs used as keys in LandPlot.SiloAmmo */
export const AMMO_SET = {
  CORRAL_PLORT_COLLECTOR: '83f638af7ebb11944b6b55c915889459',
  CORRAL_FEEDER: '7e1edc80785d7894a928f24f5aebbccd',
  COOP_ELDER_COLLECTOR: 'e65dad0e2c627f8498d5a2b3b65f6215',
  SILO_STORAGE: '58d5bd4fc903e1c49aba61495aa74014',
} as const;

export const AMMO_SET_INFO: Record<string, { name: string; slots: number; upgrade: number | null }> = {
  [AMMO_SET.CORRAL_PLORT_COLLECTOR]: { name: 'Plort Collector', slots: 2, upgrade: 12 },
  [AMMO_SET.CORRAL_FEEDER]: { name: 'Auto-Feeder', slots: 1, upgrade: 9 },
  [AMMO_SET.COOP_ELDER_COLLECTOR]: { name: 'Elder Collector', slots: 2, upgrade: 17 },
  [AMMO_SET.SILO_STORAGE]: { name: 'Silo storage', slots: 12, upgrade: null },
};

/** Player upgrade unique ids that affect the vac pack layout. */
export const UPGRADE_ID = {
  AMMO_CAPACITY: 20,
  AMMO_SLOTS: 40,
  LIQUID_SLOT: 80,
  HEALTH: 60,
  ENERGY: 30,
} as const;

export const BASE_AMMO_SLOTS = 4;

export function itemKey(model: SaveModel, id: number): string | null {
  if (id < 0 || id >= model.itemIndex.length) return null;
  return model.itemIndex[id];
}

export function itemIdFor(model: SaveModel, key: string): number {
  return model.itemIndex.indexOf(key);
}

export function ammoVersionFor(model: SaveModel): number {
  const existing = model.player.ammo[0]?.version ?? model.plots.flatMap((p) => p.siloAmmo.flatMap((s) => s.slots))[0]?.version;
  return existing ?? (model.player.version >= 10 ? 2 : 1);
}

export function newSlot(model: SaveModel, id = -1, count = 0): AmmoSlot {
  const s = emptyAmmoSlot(ammoVersionFor(model));
  s.id = id;
  s.count = count;
  return s;
}

export function upgradeLevel(model: SaveModel, uniqueId: number): number {
  const e = model.player.upgrades.find(([k]) => k === uniqueId);
  return e ? e[1] : -1;
}

export function setUpgradeLevel(model: SaveModel, uniqueId: number, level: number): void {
  const e = model.player.upgrades.find(([k]) => k === uniqueId);
  if (e) e[1] = level;
  else model.player.upgrades.push([uniqueId, level]);
}

/** Number of vac slots implied by the owned upgrades (base + extra tanks + water tank). */
export function expectedAmmoSlots(model: SaveModel): { total: number; hasWater: boolean } {
  const extra = upgradeLevel(model, UPGRADE_ID.AMMO_SLOTS) + 1; // -1 -> 0, 0 -> 1, 1 -> 2
  const hasWater = upgradeLevel(model, UPGRADE_ID.LIQUID_SLOT) >= 0;
  return { total: BASE_AMMO_SLOTS + Math.max(0, extra) + (hasWater ? 1 : 0), hasWater };
}

/** Resize the ammo list to match the upgrade layout, keeping items where possible. */
export function syncAmmoSlots(model: SaveModel, db: GameDb): void {
  const { total, hasWater } = expectedAmmoSlots(model);
  const ammo = model.player.ammo;
  const isLiquid = (s: AmmoSlot): boolean => db.item(itemKey(model, s.id))?.cls === 'LiquidDefinition';
  const water = ammo.filter(isLiquid);
  const solids = ammo.filter((s) => !isLiquid(s));
  const solidCount = total - (hasWater ? 1 : 0);
  while (solids.length < solidCount) solids.push(newSlot(model));
  while (solids.length > solidCount) {
    const idx = solids.map((s, i) => (s.id === -1 ? i : -1)).filter((i) => i >= 0).pop();
    if (idx === undefined) break; // never drop a filled slot
    solids.splice(idx, 1);
  }
  const out = solids;
  if (hasWater) out.push(water[0] ?? newSlot(model));
  model.player.ammo = out;
}

export function plotDisplayName(db: GameDb, plotId: string): { area: string; label: string } {
  const gp = db.plotsById.get(plotId);
  if (!gp) return { area: 'Unknown area', label: plotId };
  const area = AREA_NAMES[gp.cell] ?? gp.cell.replace(/^cell(Expansion)?/, '');
  return { area, label: gp.go.replace('landPlot', 'Plot').replace('EmptyPlot_', 'Plot ') };
}

export const AREA_NAMES: Record<string, string> = {
  cellConservatory: 'The Conservatory',
  cellExpansionPools: 'The Tidepools',
  cellExpansionDigsite: 'The Digsite',
  cellExpansionDen: 'The Den',
  cellExpansionArchway: 'The Archway',
  cellExpansionGully: 'The Gully',
  cellExpansionCareTakerSanctuary: 'The Sanctuary',
  cellEmpty: 'Labyrinth',
};

export const AREA_ORDER = [
  'cellConservatory',
  'cellExpansionGully',
  'cellExpansionPools',
  'cellExpansionArchway',
  'cellExpansionDen',
  'cellExpansionDigsite',
  'cellExpansionCareTakerSanctuary',
  'cellEmpty',
];

/** Base crop name from a grower persistence id: "patchcarrot02onion" -> "carrot" */
export function growerBase(pid: string): { kind: 'patch' | 'tree'; crop: string; tier: number; onion: boolean } | null {
  const m = /^(patch|tree)([a-z]+?)(\d\d)(onion)?$/.exec(pid);
  if (!m) return null;
  return { kind: m[1] as 'patch' | 'tree', crop: m[2], tier: parseInt(m[3], 10), onion: !!m[4] };
}

/** Pick the grower index for a crop that matches the garden's upgrades. */
export function growerIndexFor(model: SaveModel, crop: string, upgrades: number[]): number {
  const deluxe = upgrades.includes(PLOT_UPGRADE.DELUXE_GARDEN);
  const soil = upgrades.includes(PLOT_UPGRADE.SOIL);
  const onion = upgrades.includes(PLOT_UPGRADE.MIRACLE_MIX);
  const wantTier = deluxe ? 4 : soil ? 2 : 1;
  const candidates = model.growerIndex
    .map((pid, idx) => ({ pid, idx, g: growerBase(pid) }))
    .filter((c) => c.g && c.g.crop === crop);
  if (!candidates.length) return -1;
  const score = (c: (typeof candidates)[number]): number => {
    const g = c.g!;
    let s = 0;
    s -= Math.abs(g.tier - wantTier) * 10;
    if (g.onion === onion) s += 5;
    return s;
  };
  candidates.sort((a, b) => score(b) - score(a));
  return candidates[0].idx;
}

/** Ensure a plot's storage keys/slots match its type & upgrades. */
export function normalizePlotStorage(model: SaveModel, plot: Plot): void {
  const want: Array<{ key: string; slots: number }> = [];
  switch (plot.typeId) {
    case PLOT_TYPES.CORRAL:
      if (plot.upgrades.includes(PLOT_UPGRADE.PLORT_COLLECTOR)) want.push({ key: AMMO_SET.CORRAL_PLORT_COLLECTOR, slots: 2 });
      if (plot.upgrades.includes(PLOT_UPGRADE.FEEDER)) want.push({ key: AMMO_SET.CORRAL_FEEDER, slots: 1 });
      break;
    case PLOT_TYPES.COOP:
      if (plot.upgrades.includes(PLOT_UPGRADE.DELUXE_COOP)) want.push({ key: AMMO_SET.COOP_ELDER_COLLECTOR, slots: 2 });
      break;
    case PLOT_TYPES.SILO:
      want.push({ key: AMMO_SET.SILO_STORAGE, slots: 12 });
      break;
    case PLOT_TYPES.POND:
      if (plot.upgrades.includes(PLOT_UPGRADE.PLORT_COLLECTOR_POND)) want.push({ key: AMMO_SET.CORRAL_PLORT_COLLECTOR, slots: 1 });
      break;
    case PLOT_TYPES.INCINERATOR:
      if (plot.upgrades.includes(PLOT_UPGRADE.PLORT_COLLECTOR_INCINERATOR)) want.push({ key: AMMO_SET.CORRAL_PLORT_COLLECTOR, slots: 1 });
      break;
    default:
      break;
  }
  const next: Plot['siloAmmo'] = [];
  for (const w of want) {
    const existing = plot.siloAmmo.find((s) => s.key === w.key);
    const slots = existing ? existing.slots.slice() : [];
    while (slots.length < w.slots) slots.push(newSlot(model));
    // keep extra filled slots the game may have created, only trim empties
    while (slots.length > w.slots && slots[slots.length - 1].id === -1) slots.pop();
    next.push({ key: w.key, slots });
  }
  plot.siloAmmo = next;
  if (plot.typeId === PLOT_TYPES.SILO) {
    if (plot.siloActivatorIndices.length !== 4) plot.siloActivatorIndices = [0, 0, 0, 0];
  } else {
    plot.siloActivatorIndices = plot.siloActivatorIndices.length === 4 ? plot.siloActivatorIndices : [0, 0, 0, 0];
  }
}

/** Change the plot type, resetting fields that do not apply. */
export function setPlotType(model: SaveModel, plot: Plot, typeId: number): void {
  if (plot.typeId === typeId) return;
  plot.typeId = typeId;
  const allowed = UPGRADES_FOR_TYPE[typeId] ?? [];
  plot.upgrades = plot.upgrades.filter((u) => allowed.includes(u));
  if (typeId !== PLOT_TYPES.GARDEN) plot.resourceGrowerId = -1;
  plot.ashUnits = 0;
  plot.feederNextTime = 0;
  plot.feederPendingCount = 0;
  plot.collectorNextTime = 0;
  plot.attachedDeathTime = 0;
  if (typeId === PLOT_TYPES.EMPTY) {
    plot.siloAmmo = [];
    plot.siloActivatorIndices = [0, 0, 0, 0];
    plot.trackedActorIds = plot.trackedActorIds ? [] : null;
    return;
  }
  if (plot.trackedActorIds === null) plot.trackedActorIds = [];
  normalizePlotStorage(model, plot);
}

export function togglePlotUpgrade(model: SaveModel, plot: Plot, upgrade: number): void {
  if (plot.upgrades.includes(upgrade)) plot.upgrades = plot.upgrades.filter((u) => u !== upgrade);
  else plot.upgrades = [...plot.upgrades, upgrade];
  if (plot.typeId === PLOT_TYPES.GARDEN && plot.resourceGrowerId >= 0) {
    const g = growerBase(model.growerIndex[plot.resourceGrowerId] ?? '');
    if (g) plot.resourceGrowerId = growerIndexFor(model, g.crop, plot.upgrades);
  }
  normalizePlotStorage(model, plot);
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}
