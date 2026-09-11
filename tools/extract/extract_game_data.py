"""Extract icons + metadata from Slime Rancher 2 addressables for the save editor.

Outputs into <out>/:
  icons/<name>.png            128x128 icons
  maps/fields.png, sanctuary.png (2048px)
  data/gamedata.json          items, upgrades, components, plot upgrades, plots, growers, currencies, strings
"""
import sys, os, glob, json, re, math
from collections import defaultdict
import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
from PIL import Image

AA = r"E:\SteamLibrary\steamapps\common\Slime Rancher 2\SlimeRancher2_Data\StreamingAssets\aa\StandaloneWindows64"
SCRATCH = os.path.dirname(os.path.abspath(__file__))
DUMMY = os.path.join(SCRATCH, 'il2cpp', 'out', 'DummyDll')
OUT = sys.argv[1]
ICON_SIZE = 128
os.makedirs(os.path.join(OUT, 'icons'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'maps'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'data'), exist_ok=True)

CABS = json.load(open(os.path.join(SCRATCH, 'cab_index.json')))  # CAB name -> bundle file
mono = glob.glob(os.path.join(AA, "*_monoscripts_*.bundle"))[0]

env = UnityPy.Environment()
gen = None
loaded_bundles = set()

def load_bundle(base):
    global gen
    if base in loaded_bundles:
        return
    env.load_file(os.path.join(AA, base))
    loaded_bundles.add(base)
    if gen is None:
        gen = TypeTreeGenerator(env.assets[0].unity_version)
        gen.load_local_dll_folder(DUMMY)
        env.typetree_generator = gen

load_bundle(os.path.basename(mono))

def cab_objects(cab_name):
    """Return {path_id: obj} for the serialized file with this CAB name (loading its bundle if needed)."""
    if cab_name not in CABS:
        return None
    load_bundle(CABS[cab_name])
    for f in env.files.values():
        # bundle file -> contains serialized files
        files = getattr(f, 'files', None)
        if not files:
            continue
        for name, sf in files.items():
            if os.path.basename(name) == cab_name and hasattr(sf, 'objects'):
                return sf.objects
    return None

def resolve(pptr, assets_file):
    """Resolve a PPtr dict {m_FileID, m_PathID} relative to assets_file -> ObjectReader or None."""
    pid = pptr.get('m_PathID', 0)
    fid = pptr.get('m_FileID', 0)
    if pid == 0:
        return None
    if fid == 0:
        return assets_file.objects.get(pid)
    ext = assets_file.externals[fid - 1]
    cab = os.path.basename(ext.path)
    objs = cab_objects(cab)
    if objs is None:
        return None
    return objs.get(pid)

def class_name(obj):
    try:
        d = obj.read()
        return d.m_Script.read().m_ClassName
    except Exception:
        return None

exported_icons = {}
def export_sprite(obj, name):
    """Export sprite ObjectReader to icons/<name>.png (128px). Returns file name or None."""
    if obj is None or obj.type.name != 'Sprite':
        return None
    safe = re.sub(r'[^A-Za-z0-9_.\-]+', '_', name)
    fn = safe + '.png'
    if fn in exported_icons:
        return fn
    try:
        img = obj.read().image
        img = img.convert('RGBA')
        # trim to content then fit into square
        bbox = img.getbbox()
        if bbox:
            img = img.crop(bbox)
        w, h = img.size
        side = max(w, h)
        sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        sq.paste(img, ((side - w) // 2, (side - h) // 2))
        sq = sq.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
        sq.save(os.path.join(OUT, 'icons', fn), optimize=True)
        exported_icons[fn] = True
        return fn
    except Exception as e:
        print('  icon export failed', name, e)
        return None

# ---------------------------------------------------------------- localization
strings = {}      # (guid, id) -> en text ; also key->text via shared
shared_by_pathid = {}
guid_of_shared = {}
load_bundle([b for b in os.listdir(AA) if b.startswith('localization-assets-shared_')][0])
load_bundle([b for b in os.listdir(AA) if b.startswith('localization-string-tables-english(en)')][0])
key_to_text = {}
id_to_text = {}
shared_by_name = {}
for obj in env.objects:
    if obj.type.name != 'MonoBehaviour':
        continue
    cn = class_name(obj)
    if cn == 'SharedTableData':
        t = obj.read_typetree()
        shared_by_name[t.get('m_TableCollectionName')] = t
print('shared tables', sorted(shared_by_name))
for obj in env.objects:
    if obj.type.name != 'MonoBehaviour':
        continue
    if class_name(obj) != 'StringTable':
        continue
    t = obj.read_typetree()
    tname = re.sub(r'_en$', '', t.get('m_Name', ''))
    st = shared_by_name.get(tname)
    idkey = {e['m_Id']: e['m_Key'] for e in st.get('m_Entries', [])} if st else {}
    for e in t.get('m_TableData', []):
        txt = e['m_Localized']
        id_to_text[(tname, e['m_Id'])] = txt
        id_to_text[e['m_Id']] = txt
        k = idkey.get(e['m_Id'])
        if k:
            key_to_text[(tname, k)] = txt
            key_to_text.setdefault(k, txt)
print('strings', len(id_to_text), 'keys', len(key_to_text))
json.dump({k if isinstance(k, str) else f"{k[0]}|{k[1]}": v for k, v in key_to_text.items()}, open(os.path.join(OUT, 'data', 'strings_en.json'), 'w', encoding='utf-8'), indent=0, ensure_ascii=False)

def loc(ls):
    """LocalizedString typetree dict -> english text."""
    if not ls:
        return None
    tref = ls.get('m_TableReference', {}).get('m_TableCollectionName', '')
    er = ls.get('m_TableEntryReference', {})
    kid = er.get('m_KeyId', 0); key = er.get('m_Key', '')
    tname = tref
    if tref.startswith('GUID:'):
        tname = tref[5:]
    if kid:
        for cand in ((tname, kid), kid):
            if cand in id_to_text:
                return id_to_text[cand]
    if key:
        for cand in ((tname, key), key):
            if cand in key_to_text:
                return key_to_text[cand]
    return None

# ---------------------------------------------------------------- identifiable types
ITEM_CLASSES = {'IdentifiableType', 'SlimeDefinition', 'GadgetDefinition', 'ToyDefinition', 'LiquidDefinition'}
items = []
group_cache = {}
def group_name(pptr, af):
    o = resolve(pptr, af)
    if o is None:
        return None
    if o.path_id in group_cache:
        return group_cache[o.path_id]
    try:
        n = o.read().m_Name
    except Exception:
        n = None
    group_cache[o.path_id] = n
    return n

for bundle in sorted(set(CABS.values())):
    if not (bundle.startswith('identifiabletypes_assets') or bundle.startswith('additionalcontent-steam_assets__') or bundle.startswith('defaultlocalgroup_assets')):
        continue
    load_bundle(bundle)
for obj in list(env.objects):
    if obj.type.name != 'MonoBehaviour':
        continue
    cn = class_name(obj)
    if cn not in ITEM_CLASSES:
        continue
    t = obj.read_typetree()
    key = f"{cn}.{t['m_Name']}"
    icon = resolve(t.get('icon', {}), obj.assets_file)
    icon_file = export_sprite(icon, key)
    name = loc(t.get('localizedName'))
    groups = [group_name(g, obj.assets_file) for g in t.get('Categories', [])]
    groups = [g for g in groups if g]
    gt = group_name(t.get('groupType', {}), obj.assets_file)
    entry = {
        'key': key, 'cls': cn, 'id': t['m_Name'], 'name': name, 'icon': icon_file,
        'isPlort': bool(t.get('IsPlort')), 'isAnimal': bool(t.get('IsAnimal')), 'isPlayer': bool(t.get('IsPlayer')),
        'groupType': gt, 'categories': groups,
    }
    if cn == 'SlimeDefinition':
        entry['isLargo'] = bool(t.get('IsLargo')) if 'IsLargo' in t else None
        entry['baseSlimes'] = [group_name(b, obj.assets_file) for b in t.get('BaseSlimes', [])] if 'BaseSlimes' in t else None
    items.append(entry)
print('items', len(items), 'with icon', sum(1 for i in items if i['icon']), 'with name', sum(1 for i in items if i['name']))

# ---------------------------------------------------------------- upgrades / components / plot upgrades / currencies / growers / plot types
dup = [b for b in os.listdir(AA) if b.startswith('duplicateassetisolation_assets__')][0]
load_bundle(dup)
load_bundle([b for b in os.listdir(AA) if b.startswith('scriptableobjectlookupdata_assets_all')][0])

def ident_key(pptr, af):
    o = resolve(pptr, af)
    if o is None:
        return None
    cn = class_name(o)
    try:
        return f"{cn}.{o.read().m_Name}"
    except Exception:
        return None

upgrades = []; components = []; plot_upgrades = []; currencies = []; growers = []; plot_types = []; zones = []
seen = set()
for obj in list(env.objects):
    if obj.type.name != 'MonoBehaviour':
        continue
    cn = class_name(obj)
    if cn not in ('UpgradeDefinition', 'UpgradeComponent', 'PlotUpgradePurchaseItemModel', 'CurrencyDefinition', 'ResourceGrowerDefinition', 'PlotDefinition', 'ZoneDefinition', 'MapMarkerDefinition'):
        continue
    t = obj.read_typetree()
    sig = (cn, t['m_Name'])
    if sig in seen:
        continue
    seen.add(sig)
    af = obj.assets_file
    if cn == 'UpgradeDefinition':
        levels = []
        for lv in t.get('_levels', []):
            costs = lv.get('_costs', {})
            levels.append({
                'title': loc(lv.get('Title')), 'description': loc(lv.get('Description')),
                'currency': [{'currency': ident_key(c['_currency'], af), 'amount': c['_amount']} for c in costs.get('_currencyCosts', [])],
                'items': [{'item': ident_key(c['IdentType'], af), 'amount': c['Amount']} for c in costs.get('IdentCosts', [])],
                'components': [ident_key(c, af) for c in costs.get('ComponentCosts', [])],
            })
        upgrades.append({'id': t['m_Name'], 'uniqueId': t['_uniqueId'], 'icon': export_sprite(resolve(t['_icon'], af), 'upgrade_' + t['m_Name']),
                         'requireComponentToBeVisible': bool(t.get('_requireComponentToBeVisibleToPlayer')), 'levels': levels})
    elif cn == 'UpgradeComponent':
        components.append({'key': 'UpgradeComponent.' + t['m_Name'], 'id': t['m_Name'], 'title': loc(t.get('_title')), 'description': loc(t.get('_description')),
                           'icon': export_sprite(resolve(t['_icon'], af), 'component_' + t['m_Name'])})
    elif cn == 'PlotUpgradePurchaseItemModel':
        cost = t.get('_purchaseCost', {})
        plot_upgrades.append({'id': t['m_Name'], 'upgrade': t['_upgrade'], 'title': loc(t.get('_title')), 'description': loc(t.get('_description')),
                              'icon': export_sprite(resolve(t['_icon'], af), 'plotupgrade_' + t['m_Name']),
                              'cost': [{'currency': ident_key(c['_currency'], af), 'amount': c['_amount']} for c in cost.get('_currencyCosts', [])]})
    elif cn == 'CurrencyDefinition':
        currencies.append({'id': t['m_Name'], 'raw': {k: v for k, v in t.items() if k not in ('m_GameObject', 'm_Script', 'm_Enabled', 'references')},
                           'icon': export_sprite(resolve(t.get('_icon', t.get('icon', {})), af), 'currency_' + t['m_Name'])})
    elif cn == 'ResourceGrowerDefinition':
        growers.append({'persistenceId': t['_persistenceId'], 'id': t['m_Name'], 'primary': ident_key(t['_primaryResourceType'], af),
                        'resources': [{'item': ident_key(r['ResourceIdentifiableType'], af), 'weight': r['Weight']} for r in t.get('_resources', [])]})
    elif cn == 'PlotDefinition':
        plot_types.append({'id': t['m_Name'], 'type': t['Type'], 'guid': t['Guid']})
    elif cn == 'ZoneDefinition':
        zones.append({'id': t['m_Name'], 'nameKey': t.get('_nameKey'), 'name': loc(t.get('_localizedName')), 'isRanch': bool(t.get('_isRanchZone'))})
print('upgrades', len(upgrades), 'components', len(components), 'plot upgrades', len(plot_upgrades), 'currencies', len(currencies), 'growers', len(growers), 'plot types', len(plot_types), 'zones', len(zones))

# plot type base icons + misc by sprite name
misc_icons = {}
WANT_SPRITES = {'iconPatchCorralBase': 'plot_corral', 'iconPatchCoopBase': 'plot_coop', 'iconPatchGardenBase': 'plot_garden', 'iconPatchSiloBase': 'plot_silo',
                'iconPatchPondBase': 'plot_pond', 'iconPatchIncineratorBase': 'plot_incinerator', 'iconNewbuck': 'newbuck', 'newbucksicon': 'newbuck_small',
                'iconZoneConservatory': 'zone_conservatory', 'iconArchiveKey': 'key', 'iconWater': 'water', 'iconPediaSlimeology': 'pedia_slimeology',
                'iconPediaRancherRisks': 'pedia_risks', 'iconPediaPlortonomics': 'pedia_plortonomics', 'iconPatchGardenClearCrop': 'garden_clear',
                'iconPatchSiloStorageUpgrade': 'silo_storage_upgrade', 'iconRancherCaretaker': 'caretaker', 'iconMapBoat': 'map_boat',
                'iconMapLabyrinth': 'map_labyrinth', 'iconRefineryLink': 'refinery'}
for obj in list(env.objects):
    if obj.type.name == 'Sprite':
        try:
            n = obj.read().m_Name
        except Exception:
            continue
        if n in WANT_SPRITES and WANT_SPRITES[n] not in misc_icons:
            misc_icons[WANT_SPRITES[n]] = export_sprite(obj, 'misc_' + WANT_SPRITES[n])
print('misc icons', misc_icons)

# ---------------------------------------------------------------- maps
map_transforms = json.load(open(os.path.join(SCRATCH, 'map_transforms.json')))
MAP_SIZE = 2048
maps = {}
for sprite_name, key in (('Map_Fields', 'fields'), ('Map_Sanctuary', 'sanctuary')):
    for obj in env.objects:
        if obj.type.name == 'Sprite':
            try:
                d = obj.read()
            except Exception:
                continue
            if d.m_Name == sprite_name:
                img = d.image.convert('RGBA')
                w, h = img.size
                scale = MAP_SIZE / max(w, h)
                img2 = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
                img2.save(os.path.join(OUT, 'maps', key + '.png'), optimize=True)
                tr = map_transforms[key]
                maps[key] = {'file': key + '.png', 'width': img2.size[0], 'height': img2.size[1], 'scale': scale,
                             'a': tr['a'] * scale, 'b': tr['b'] * scale, 'c': tr['c'] * scale}
                print('map', key, img.size, '->', img2.size)
                break

# plots
plot_table = json.load(open(os.path.join(SCRATCH, 'plot_table.json')))
sq_fields = json.load(open(os.path.join(SCRATCH, 'squares_fields.json')))
sq_sanct = json.load(open(os.path.join(SCRATCH, 'squares_sanctuary.json')))
plots = []
for p in plot_table:
    if p['scene'] == 'conservatoryfields':
        mk = 'fields'; squares = sq_fields
    elif p['scene'] == 'sanctuary':
        mk = 'sanctuary'; squares = sq_sanct
    else:
        continue
    m = maps[mk]
    u = m['a'] * p['x'] + m['b']; v = m['c'] - m['a'] * p['z']
    # snap to nearest drawn square (in original 4096 coordinates -> scaled)
    best = None
    for s in squares:
        su, sv = s[0] * m['scale'], s[1] * m['scale']
        d = math.hypot(su - u, sv - v)
        if best is None or d < best[0]:
            best = (d, su, sv)
    if best and best[0] < 40:
        u, v = best[1], best[2]
    plots.append({'id': p['id'], 'map': mk, 'cell': p['cell'], 'go': p['go'], 'x': p['x'], 'y': p['y'], 'z': p['z'], 'yaw': p['yaw'], 'u': round(u, 1), 'v': round(v, 1)})
print('plots', len(plots))

json.dump({
    'items': items, 'upgrades': upgrades, 'components': components, 'plotUpgrades': plot_upgrades, 'currencies': currencies,
    'growers': growers, 'plotTypes': plot_types, 'zones': zones, 'miscIcons': misc_icons, 'maps': maps, 'plots': plots,
}, open(os.path.join(OUT, 'data', 'gamedata.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('done. icons:', len(exported_icons))

