import sys, os, glob, re, json, struct
import UnityPy

AA = r"E:\SteamLibrary\steamapps\common\Slime Rancher 2\SlimeRancher2_Data\StreamingAssets\aa\StandaloneWindows64"

def qmul(q, v):
    x, y, z, w = q
    ix = w * v[0] + y * v[2] - z * v[1]; iy = w * v[1] + z * v[0] - x * v[2]; iz = w * v[2] + x * v[1] - y * v[0]; iw = -x * v[0] - y * v[1] - z * v[2]
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]
def qq(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return (aw*bx + ax*bw + ay*bz - az*by, aw*by - ax*bz + ay*bw + az*bx, aw*bz + ax*by - ay*bx + az*bw, aw*bw - ax*bx - ay*by - az*bz)
def world_pos(tr):
    chain = []; cur = tr
    while True:
        chain.append(cur)
        f = cur.m_Father
        if f.path_id == 0: break
        try: cur = f.read()
        except Exception: break
    p = [0.0, 0.0, 0.0]; q = (0.0, 0.0, 0.0, 1.0); s = [1.0, 1.0, 1.0]
    for t in reversed(chain):
        lp = [t.m_LocalPosition.x * s[0], t.m_LocalPosition.y * s[1], t.m_LocalPosition.z * s[2]]
        rp = qmul(q, lp); p = [p[0] + rp[0], p[1] + rp[1], p[2] + rp[2]]
        q = qq(q, (t.m_LocalRotation.x, t.m_LocalRotation.y, t.m_LocalRotation.z, t.m_LocalRotation.w))
        s = [s[0] * t.m_LocalScale.x, s[1] * t.m_LocalScale.y, s[2] * t.m_LocalScale.z]
    # yaw (rotation around Y) in degrees
    import math
    x, y, z, w = q
    yaw = math.degrees(math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z)))
    return p, [t.m_GameObject.read().m_Name for t in chain], yaw

mono = glob.glob(os.path.join(AA, "*_monoscripts_*.bundle"))[0]
results = []
for path in sorted(glob.glob(os.path.join(AA, "*_scenes_*.bundle"))):
    base = os.path.basename(path)
    try: env = UnityPy.load(path, mono)
    except Exception as e: print('!!', base, e); continue
    for obj in env.objects:
        if obj.type.name != 'MonoBehaviour': continue
        try:
            d = obj.read()
            sc = d.m_Script.read().m_ClassName
        except Exception:
            continue
        if sc != 'LandPlotLocation': continue
        raw = bytes(obj.get_raw_data())
        # id is the last int32 in the 52-byte blob? find plausibly: take last 4 bytes
        m = re.search(rb'plot\d{10}', raw)
        pid = m.group(0).decode() if m else '?'
        go = d.m_GameObject.read()
        tr = None
        for c in go.m_Components:
            comp = c.read() if hasattr(c, 'read') else c.component.read()
            if comp.__class__.__name__ == 'Transform': tr = comp; break
        p, chain, yaw = world_pos(tr)
        cell = next((n for n in chain if n.lower().startswith('cell')), chain[-1] if chain else '')
        results.append({'id': pid, 'scene': base.split('_scenes_')[0], 'cell': cell, 'go': go.m_Name, 'x': round(p[0], 2), 'y': round(p[1], 2), 'z': round(p[2], 2), 'yaw': round(yaw, 1), 'raw': raw.hex()})
        print(f"{results[-1]['id']} {base.split('_scenes_')[0]:20} {cell:24} {go.m_Name:14} x={p[0]:8.2f} y={p[1]:7.2f} z={p[2]:8.2f} yaw={yaw:7.1f}")
json.dump(results, open(os.path.join(os.path.dirname(__file__), 'plot_table.json'), 'w'), indent=1)
print('total', len(results))

