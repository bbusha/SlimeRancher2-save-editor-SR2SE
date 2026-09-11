import sys, os, glob
import UnityPy

AA = r"E:\SteamLibrary\steamapps\common\Slime Rancher 2\SlimeRancher2_Data\StreamingAssets\aa\StandaloneWindows64"
out = open(sys.argv[1], 'w', encoding='utf-8')
for path in sorted(glob.glob(os.path.join(AA, "*.bundle"))):
    base = os.path.basename(path)
    if base.startswith('music_') or base.startswith('sfx_') or 'dialogue' in base or base.startswith('fonts') or base.startswith('localization-string'):
        continue
    try:
        env = UnityPy.load(path)
    except Exception as e:
        out.write(f"!! {base} {e}\n"); continue
    for obj in env.objects:
        if obj.type.name not in ('Sprite', 'Texture2D'):
            continue
        try:
            d = obj.read()
            name = d.m_Name
            if obj.type.name == 'Texture2D':
                extra = f"{d.m_Width}x{d.m_Height}"
            else:
                extra = f"{d.m_Rect.width:.0f}x{d.m_Rect.height:.0f}"
        except Exception as e:
            name = f"<err {e}>"; extra = ''
        out.write(f"{obj.type.name}\t{name}\t{extra}\t{obj.path_id}\t{base}\n")
    out.flush()
out.close()
print("done")

