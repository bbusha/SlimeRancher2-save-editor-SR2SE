import os, glob, json, UnityPy
AA = r"E:\SteamLibrary\steamapps\common\Slime Rancher 2\SlimeRancher2_Data\StreamingAssets\aa\StandaloneWindows64"
SCRATCH = os.path.dirname(os.path.abspath(__file__))
cabs = {}
for path in sorted(glob.glob(os.path.join(AA, "*.bundle"))):
    base = os.path.basename(path)
    if base.startswith(('music_', 'sfx_')) or 'dialogue' in base:
        continue
    try:
        env = UnityPy.Environment()
        env.load_file(path)
        for f in env.files.values():
            files = getattr(f, 'files', None)
            if files:
                for n in files:
                    cabs[os.path.basename(n)] = base
    except Exception as e:
        print('!!', base, e)
json.dump(cabs, open(os.path.join(SCRATCH, 'cab_index.json'), 'w'), indent=0)
print('cabs', len(cabs))

