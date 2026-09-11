"""Dump typetrees of MonoBehaviours of given classes from a bundle to JSON.
usage: tt_dump.py <bundle glob> <Class1,Class2,...> <out.json> [max per class]
"""
import sys, os, glob, json
import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

AA = r"E:\SteamLibrary\steamapps\common\Slime Rancher 2\SlimeRancher2_Data\StreamingAssets\aa\StandaloneWindows64"
DUMMY = r"<WORKDIR>\il2cpp\out\DummyDll"
mono = glob.glob(os.path.join(AA, "*_monoscripts_*.bundle"))[0]
classes = set(sys.argv[2].split(','))
maxn = int(sys.argv[4]) if len(sys.argv) > 4 else 3
gen = None
result = {}
for path in sorted(glob.glob(os.path.join(AA, sys.argv[1]))):
    env = UnityPy.load(path, mono)
    if gen is None:
        gen = TypeTreeGenerator(env.assets[0].unity_version)
        gen.load_local_dll_folder(DUMMY)
    env.typetree_generator = gen
    for obj in env.objects:
        if obj.type.name != 'MonoBehaviour': continue
        try:
            d = obj.read(); cls = d.m_Script.read().m_ClassName
        except Exception:
            continue
        if cls not in classes: continue
        lst = result.setdefault(cls, [])
        if len(lst) >= maxn: continue
        try:
            tree = obj.read_typetree()
        except Exception as e:
            tree = {'error': str(e)}
        tree['__path_id'] = obj.path_id
        lst.append(tree)
json.dump(result, open(sys.argv[3], 'w'), indent=1, default=str)
print({k: len(v) for k, v in result.items()})

