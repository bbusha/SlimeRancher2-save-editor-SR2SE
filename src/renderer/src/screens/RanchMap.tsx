import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EditorProps } from '../App';
import type { Plot } from '@shared/sr2save';
import { AREA_NAMES, AREA_ORDER, PLOT_TYPE_INFO, itemKey } from '../lib/model';
import { PlotPanel } from './PlotPanel';

type MapKey = 'fields' | 'sanctuary';

interface View {
  x: number;
  y: number;
  zoom: number;
}

export function RanchMap(props: EditorProps): JSX.Element {
  const { db, model } = props;
  const mapsAvailable = useMemo(() => {
    const keys: MapKey[] = [];
    if (model.plots.some((p) => db.plotsById.get(p.id)?.map === 'fields')) keys.push('fields');
    if (model.plots.some((p) => db.plotsById.get(p.id)?.map === 'sanctuary')) keys.push('sanctuary');
    return keys.length ? keys : (['fields'] as MapKey[]);
  }, [db, model.plots]);
  const [mapKey, setMapKey] = useState<MapKey>(mapsAvailable[0]);
  const [selected, setSelected] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);

  const map = db.data.maps[mapKey];
  const plotsOnMap = useMemo(
    () =>
      model.plots
        .map((p) => ({ plot: p, gp: db.plotsById.get(p.id) }))
        .filter((x): x is { plot: Plot; gp: NonNullable<typeof x.gp> } => !!x.gp && x.gp.map === mapKey),
    [model.plots, db, mapKey],
  );
  const unknownPlots = useMemo(() => model.plots.filter((p) => !db.plotsById.has(p.id)), [model.plots, db]);

  const fitTo = useCallback(
    (cell: string | null) => {
      const el = wrapRef.current;
      const list = cell ? plotsOnMap.filter((p) => p.gp.cell === cell) : plotsOnMap;
      if (!el || !list.length) return;
      const us = list.map((p) => p.gp.u);
      const vs = list.map((p) => p.gp.v);
      const pad = cell ? 90 : 140;
      const minU = Math.min(...us) - pad;
      const maxU = Math.max(...us) + pad;
      const minV = Math.min(...vs) - pad;
      const maxV = Math.max(...vs) + pad;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const zoom = Math.min(w / (maxU - minU), h / (maxV - minV), 2.4);
      setView({ zoom, x: (w - (minU + maxU) * zoom) / 2, y: (h - (minV + maxV) * zoom) / 2 });
    },
    [plotsOnMap],
  );
  const fitToPlots = useCallback(() => fitTo(null), [fitTo]);

  const areasOnMap = useMemo(() => AREA_ORDER.filter((cell) => plotsOnMap.some((p) => p.gp.cell === cell)), [plotsOnMap]);

  useEffect(() => {
    // Start zoomed on the main area of the map (markers overlap when the whole map is shown).
    fitTo(areasOnMap[0] ?? null);
  }, [fitTo, areasOnMap, mapKey]);

  const areaLabels = useMemo(
    () =>
      areasOnMap.map((cell) => {
        const ps = plotsOnMap.filter((p) => p.gp.cell === cell);
        const u = ps.reduce((s, p) => s + p.gp.u, 0) / ps.length;
        const v = Math.min(...ps.map((p) => p.gp.v)) - 34;
        return { cell, name: AREA_NAMES[cell] ?? cell, u, v };
      }),
    [areasOnMap, plotsOnMap],
  );

  useEffect(() => {
    if (!mapsAvailable.includes(mapKey)) setMapKey(mapsAvailable[0]);
  }, [mapsAvailable, mapKey]);

  const onWheel = (e: React.WheelEvent): void => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setView((v) => {
      const factor = Math.exp(-e.deltaY * 0.0015);
      const zoom = Math.max(0.15, Math.min(6, v.zoom * factor));
      const k = zoom / v.zoom;
      return { zoom, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k };
    });
  };

  const onMouseDown = (e: React.MouseEvent): void => {
    if (e.button !== 0) return;
    dragState.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
    setDragging(true);
  };
  const onMouseMove = (e: React.MouseEvent): void => {
    const d = dragState.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const onMouseUp = (): void => {
    dragState.current = null;
    setDragging(false);
  };

  const selectedPlot = selected ? model.plots.find((p) => p.id === selected) ?? null : null;

  const areaStats = AREA_ORDER.map((cell) => {
    const ps = plotsOnMap.filter((p) => p.gp.cell === cell);
    return { cell, name: AREA_NAMES[cell] ?? cell, total: ps.length, built: ps.filter((p) => p.plot.typeId !== 1).length };
  }).filter((a) => a.total > 0);

  const slimeCount = (plot: Plot): number => {
    if (!plot.trackedActorIds?.length) return 0;
    const ids = new Set(plot.trackedActorIds);
    let n = 0;
    for (const a of model.actors) {
      if (!ids.has(a.actorId)) continue;
      const k = itemKey(model, a.typeId);
      const it = db.item(k);
      if (it?.cls === 'SlimeDefinition' || it?.isAnimal) n++;
    }
    return n;
  };

  return (
    <div className="ranch">
      <div
        ref={wrapRef}
        className={`map-wrap ${dragging ? 'dragging' : ''}`}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <div className="map-hud">
          {mapsAvailable.length > 1 && (
            <div className="seg">
              <button className={mapKey === 'fields' ? 'active' : ''} onClick={() => setMapKey('fields')}>
                <img src={db.misc('zone_conservatory') ?? ''} alt="" /> Conservatory
              </button>
              <button className={mapKey === 'sanctuary' ? 'active' : ''} onClick={() => setMapKey('sanctuary')}>
                <img src={db.misc('caretaker') ?? db.misc('pedia_slimeology') ?? ''} alt="" /> Sanctuary
              </button>
            </div>
          )}
          <div className="seg">
            {areasOnMap.map((cell) => (
              <button key={cell} onClick={() => fitTo(cell)}>
                {(AREA_NAMES[cell] ?? cell).replace(/^The /, '')}
              </button>
            ))}
          </div>
          <div className="seg">
            <button onClick={fitToPlots}>All plots</button>
            <button onClick={() => setView({ x: 0, y: 0, zoom: Math.min(wrapRef.current!.clientWidth / map.width, wrapRef.current!.clientHeight / map.height) })}>
              Whole map
            </button>
          </div>
        </div>
        <div className="map-progress">
          {areaStats.map((a) => (
            <div key={a.cell} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span>{a.name}</span>
              <b>
                {a.built}/{a.total}
              </b>
            </div>
          ))}
        </div>
        <div className="map-legend">
          {Object.entries(PLOT_TYPE_INFO)
            .filter(([id]) => id !== '1')
            .map(([id, info]) => (
              <span className="pill" key={id}>
                <img src={db.misc(info.icon) ?? ''} alt="" />
                {info.name}
              </span>
            ))}
          <span className="pill">Scroll to zoom · drag to pan</span>
        </div>
        <div className="map-stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          <img className="map" src={db.mapUrl(mapKey)} width={map.width} height={map.height} alt="" draggable={false} />
          {areaLabels.map((a) => (
            <div key={a.cell} className="area-label" style={{ left: a.u, top: a.v, transform: `translate(-50%, -100%) scale(${1 / view.zoom})` }}>
              {a.name}
            </div>
          ))}
          {plotsOnMap.map(({ plot, gp }) => {
            const info = PLOT_TYPE_INFO[plot.typeId] ?? PLOT_TYPE_INFO[1];
            const n = slimeCount(plot);
            return (
              <div
                key={plot.id}
                className={`marker ${plot.typeId === 1 ? 'empty' : ''} ${selected === plot.id ? 'selected' : ''}`}
                style={{ left: gp.u, top: gp.v, background: plot.typeId === 1 ? undefined : info.color, transform: `translate(-50%, -50%) scale(${1 / view.zoom})` }}
                title={`${AREA_NAMES[gp.cell] ?? gp.cell} · ${info.name}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setSelected(plot.id)}
              >
                {plot.typeId !== 1 && <img src={db.misc(info.icon) ?? ''} alt="" />}
                {n > 0 && <span className="count">{n}</span>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="plot-panel">
        {selectedPlot ? (
          <PlotPanel {...props} plot={selectedPlot} onClose={() => setSelected(null)} />
        ) : (
          <>
            <h2 style={{ fontSize: 20 }}>Ranch map</h2>
            <p className="hint" style={{ fontSize: 13 }}>
              Click a plot marker to edit it. Colored markers are built plots (the number shows how many slimes or animals live there); dashed markers are empty build sites.
            </p>
            <div className="notice info">
              Everything shown here is detected from your save: plot types, purchased plot upgrades, feeder / collector contents and the slimes inside each corral.
            </div>
            {unknownPlots.length > 0 && (
              <div className="notice">
                {unknownPlots.length} plot(s) in this save are not on the map (unknown location ids): {unknownPlots.map((p) => p.id).join(', ')}
              </div>
            )}
            <div className="section-title">Areas</div>
            {areaStats.map((a) => (
              <div key={a.cell} className="stat-row">
                <span>{a.name}</span>
                <b>
                  {a.built}/{a.total} built
                </b>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
