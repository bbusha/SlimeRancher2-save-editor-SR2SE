/**
 * Static game data extracted from the game's asset bundles
 * (resources/game/data/gamedata.json + icons). Loaded once at startup.
 */

export interface GameItem {
  /** "<Class>.<Name>" — matches entries of the save's identifiable type index */
  key: string;
  cls: 'IdentifiableType' | 'SlimeDefinition' | 'GadgetDefinition' | 'ToyDefinition' | 'LiquidDefinition';
  id: string;
  name: string | null;
  icon: string | null;
  isPlort: boolean;
  isAnimal: boolean;
  isPlayer: boolean;
  groupType: string | null;
  categories: string[];
  isLargo?: boolean | null;
  baseSlimes?: string[] | null;
}

export interface UpgradeLevel {
  title: string | null;
  description: string | null;
  currency: Array<{ currency: string | null; amount: number }>;
  items: Array<{ item: string | null; amount: number }>;
  components: Array<string | null>;
}

export interface GameUpgrade {
  id: string;
  uniqueId: number;
  icon: string | null;
  requireComponentToBeVisible: boolean;
  levels: UpgradeLevel[];
}

export interface GameComponent {
  key: string;
  id: string;
  title: string | null;
  description: string | null;
  icon: string | null;
}

export interface GamePlotUpgrade {
  id: string;
  upgrade: number;
  title: string | null;
  description: string | null;
  icon: string | null;
  cost: Array<{ currency: string | null; amount: number }>;
}

export interface GameGrower {
  persistenceId: string;
  id: string;
  primary: string | null;
  resources: Array<{ item: string | null; weight: number }>;
}

export interface GameMap {
  file: string;
  width: number;
  height: number;
  scale: number;
  a: number;
  b: number;
  c: number;
}

export interface GamePlot {
  id: string;
  map: 'fields' | 'sanctuary';
  cell: string;
  go: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  u: number;
  v: number;
}

export interface GameData {
  items: GameItem[];
  upgrades: GameUpgrade[];
  components: GameComponent[];
  plotUpgrades: GamePlotUpgrade[];
  currencies: Array<{ id: string; icon: string | null }>;
  growers: GameGrower[];
  plotTypes: Array<{ id: string; type: number; guid: string }>;
  zones: Array<{ id: string; nameKey: string | null; name: string | null; isRanch: boolean }>;
  miscIcons: Record<string, string>;
  maps: Record<string, GameMap>;
  plots: GamePlot[];
}

export class GameDb {
  readonly itemsByKey = new Map<string, GameItem>();
  readonly upgradesById = new Map<number, GameUpgrade>();
  readonly componentsByKey = new Map<string, GameComponent>();
  readonly plotUpgradesByEnum = new Map<number, GamePlotUpgrade>();
  readonly growersByPersistenceId = new Map<string, GameGrower>();
  readonly plotsById = new Map<string, GamePlot>();

  constructor(public readonly data: GameData) {
    for (const it of data.items) this.itemsByKey.set(it.key, it);
    for (const u of data.upgrades) this.upgradesById.set(u.uniqueId, u);
    for (const c of data.components) this.componentsByKey.set(c.key, c);
    for (const p of data.plotUpgrades) this.plotUpgradesByEnum.set(p.upgrade, p);
    for (const g of data.growers) this.growersByPersistenceId.set(g.persistenceId, g);
    for (const p of data.plots) this.plotsById.set(p.id, p);
  }

  item(key: string | undefined | null): GameItem | undefined {
    return key ? this.itemsByKey.get(key) : undefined;
  }

  iconUrl(file: string | null | undefined): string | null {
    return file ? `sr2://icons/${file}` : null;
  }

  itemIcon(key: string | null | undefined): string | null {
    return this.iconUrl(this.item(key)?.icon);
  }

  itemName(key: string | null | undefined): string {
    if (!key) return 'Empty';
    const it = this.item(key);
    if (it?.name) return it.name;
    return prettifyKey(key);
  }

  misc(name: string): string | null {
    return this.iconUrl(this.data.miscIcons[name]);
  }

  mapUrl(map: string): string {
    return `sr2://maps/${this.data.maps[map].file}`;
  }
}

/** "IdentifiableType.CarrotVeggie" -> "Carrot Veggie" */
export function prettifyKey(key: string): string {
  const name = key.includes('.') ? key.slice(key.indexOf('.') + 1) : key;
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
}

export async function loadGameData(): Promise<GameDb> {
  const url = await window.api.gameDataUrl();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load game data: ${res.status}`);
  const data = (await res.json()) as GameData;
  return new GameDb(data);
}

/** Broad UI categories for the item picker. */
export type ItemCategory = 'slimes' | 'plorts' | 'food' | 'animals' | 'resources' | 'toys' | 'gadgets' | 'deco' | 'other';

export function categorize(it: GameItem): ItemCategory {
  if (it.cls === 'SlimeDefinition') return 'slimes';
  if (it.cls === 'ToyDefinition') return 'toys';
  if (it.cls === 'GadgetDefinition') {
    const g = (it.groupType ?? '').toLowerCase();
    if (g.includes('deco') || /Deco|Fence|Statue|Plant|Tree|Rock|Lamp|Flower|Bush|Mushroom|Crystal|Glow|Fountain|Sign/i.test(it.id))
      return 'deco';
    return 'gadgets';
  }
  if (it.isPlort) return 'plorts';
  if (it.isAnimal || /Hen$|Rooster$|Chick$/.test(it.id)) return 'animals';
  if (/Craft$/.test(it.id)) return 'resources';
  if (/Veggie$|Fruit$|Meat$|Honey|Nectar|Egg|Food/i.test(it.id)) return 'food';
  if (it.cls === 'LiquidDefinition') return 'other';
  return 'other';
}
