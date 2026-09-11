# Asset extraction pipeline

These scripts regenerate `resources/game` (icons, maps, `gamedata.json`) from an installed copy of
Slime Rancher 2. Re-run them after a game update adds items, upgrades or plots.

Requirements: Python 3.12, `pip install UnityPy TypeTreeGeneratorAPI pillow numpy scipy`, and
[Il2CppDumper](https://github.com/Perfare/Il2CppDumper) run on `GameAssembly.dll` +
`SlimeRancher2_Data/il2cpp_data/Metadata/global-metadata.dat` (its `DummyDll` folder is needed for
typetrees; `dump.cs` documents the save-format classes `*V01…`).

Every script has the game path (`AA = …StreamingAssets\aa\StandaloneWindows64`) and a working
directory placeholder `<WORKDIR>` at the top — set both before running.

Order:

1. `cab_index.py` — maps Unity CAB archive names to bundle files (needed to resolve cross-bundle references).
2. `list_all.py all_sprites.tsv` — inventory of every sprite/texture (for `export_sprites.py` and the map export).
3. `plot_table.py` — reads every `LandPlotLocation` in the scene bundles: plot id, world position, area cell.
4. `export_sprites.py all_sprites.tsv probe "^(Map_Fields|Map_Sanctuary)$"` then `find_squares.py` on each map
   and `fit_map.py` — calibrates world → map-pixel transforms using the plot squares drawn on the map art.
5. `extract_game_data.py <repo>/resources/game` — exports 128 px icons, 2048 px maps and `gamedata.json`.

`tt_dump.py <bundle glob> <Class,…> out.json` dumps typetrees of any ScriptableObject class for exploration.
