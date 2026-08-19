# Tube time series (2024)

A real Blue Oyster (*Pleurotus ostreatus*) grow-tube cultivation run, tracked across 10
harvests with paired RGB photos, IR/thermal photos, and 3D scans per tube, plus per-minute
temperature logs and weekly biomass measurements. Source: `(OLD DATA) Time series` (the
user's own local archive; not every harvest/tube combination has data — several are empty in
the original, which is preserved here rather than papered over).

## `scans-and-photos/`

Flattened into one folder (the app's GitHub-folder source type lists one directory, not a
tree), with `Harvest{N}_Tube{M}_` filename prefixes standing in for the original nested
`Harvest N/Tube M/` structure. `metadata.csv` carries the harvest/tube back out via its
`treatment` column (e.g. `Harvest 5 · Tube 1`), plus `media_kind` (`photo`/`thermal`/`scan3d`),
EXIF (camera/capture time/dimensions) for the RGB photos, and a parsed timestamp for the
thermal frames (filename pattern `HM<YYYYMMDDHHMMSS>.jpeg`).

**Not a 1:1 copy of the source folder** — for GitHub's 100MB per-file limit:
- 3 files (`Naked_mesh.obj` 109MB, `Harvest 6_01_mesh.obj` 116MB) were **dropped** — a
  smaller binary-PLY export of the same scan already existed alongside them (`Naked_mesh.ply`,
  `Harvest6_Tube1_mesh.ply`), so nothing is missing except a redundant, larger copy in a less
  compact format. The matching `_pc.obj` point clouds for those same two scans were dropped
  the same way, in favor of their existing `_pc.ply` equivalents.
- 1 file (`Harvest 5_01_mesh.obj`, 144MB) had **no smaller alternative**, so it was converted
  here (`Harvest5_Tube1_mesh.ply`, via `trimesh`, binary encoding) — same geometry, different
  container format.
- Everything else (12 RGB photos, 10 thermal frames, 18 3D scans after the above) is included
  as originally captured, just renamed for the flat layout.

3D-scan `captured` timestamps are the source file's modification time, not a guaranteed
capture time — noted as best-effort in each row's `notes`. RGB/thermal timestamps are real
(EXIF / filename-embedded).

## `temperature-logs/`

Six raw per-minute sensor logs (`TEMPDATA_{A,B,C}_{date}.txt`), each a 10-sensor probe array,
custom line format: `HH:MM:SS DD/MM/YYYY - {"sensor1": "...", ...}`. `-127.00` means that
sensor channel wasn't connected for that reading. Not wired into the image database (it's
scalar time series, not photos) — kept here as reference data alongside the scans it was
recorded during.

## `biomass/`

`Biomass_production_data.xlsx` — per-tube wet/dry weight measurements by week, plus
tube cross-sectional area (162.15 cm² / 0.016215 m²). Kept as the original spreadsheet
(not reformatted) to preserve the source exactly.
