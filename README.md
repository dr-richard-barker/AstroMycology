# AstroMycology

A static image + 3D-scan database for mushroom imagery — RGB photos, RGB-thermal photos, and 3D scans (`.ply`/`.obj`/`.glb`/`.gltf`/`.stl`) — with an in-browser 3D viewer/analysis tool and optional calibration-marker scale & colour recovery for flat photos. No server: it's a Vite/React SPA deployed to GitHub Pages, forked from the architecture of [AstroBotany_calibration_image_sharing_and_analysis](https://github.com/dr-richard-barker/AstroBotany_calibration_image_sharing_and_analysis).

## What's here

- **Multi-source database** — browse a free [Epicollect5](https://five.epicollect.net) project, a public GitHub image/scan folder, or files uploaded locally in your browser (persisted via IndexedDB, nothing sent to a server). Switch sources or merge them into an "All projects" view.
- **In-app 3D viewer & analysis** (`src/components/Scan3DViewer.tsx`, `src/lib/threed.ts`) — load a `.ply`/`.obj`/`.glb`/`.gltf`/`.stl` scan (from a database entry, or drag-and-drop a local file) into an orbitable Three.js viewer. Vertex/face counts, bounding-box dimensions, surface area, and volume are computed client-side (signed-tetrahedron sum over the mesh faces — the same approach the legacy notebook used with `trimesh`), with a watertightness check so an unreliable mesh gets flagged instead of silently mismeasured.
- **RGB / RGB-thermal / 3D-scan media kinds** — a `media_kind` sidecar column (or filename hints) tags entries as `photo`, `thermal`, or `scan3d`; the gallery shows a distinct tile/badge for each.
- **HEIC/HEIF ingestion** — `.heic`/`.heif` photos are accepted in the local-upload flow (decoded client-side via `heic2any` for thumbnails/analysis; EXIF is read directly via `exifr`), and `tools/heic_metadata_to_csv.py` batch-extracts EXIF/GPS from a folder of HEIC files into a `metadata.csv` sidecar.
- **Calibration-marker scale & colour** (for flat RGB/thermal photos) — client-side ArUco + geometric marker detection recycled from AstroBotany, recovering pixels-per-mm scale and a 15-chip colour correction.
- **Optional auth + shared uploads** — a Supabase-backed sign-in and community-upload layer, config-gated: the app runs fully open until `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are set (see [SETUP-AUTH.md](SETUP-AUTH.md)).

## `legacy/`

The repo's original content — a Colab notebook (`Mushroom_to_Volume_ply.ipynb`) that computes mesh volume from an existing `.ply` scan via `trimesh`, plus one sample scan (`Tube01_Raw_Mesh.ply`, from a Revopoint structured-light scanner) — is kept there as reference. See [legacy/README.md](legacy/README.md).

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build (GitHub Pages base path)
npm run lint      # tsc --noEmit
```

Deploys automatically to GitHub Pages on push to `main` via `.github/workflows/deploy.yml`.

## Tools (`tools/`)

- `heic_metadata_to_csv.py` — batch EXIF/GPS extraction from a folder of `.heic`/`.heif` files into a `metadata.csv` sidecar (needs `pip install Pillow pillow-heif`).
- `make_metadata_csv.py` / `generate_sidecar.py` — build a `metadata.csv`/`datapackage.json` sidecar from a folder of images/scans (local or a GitHub folder).
- `metadata_template.csv`, `sidecar-schema.json` — the sidecar column schema the app's GitHub/local-upload sources join by `filename`.
