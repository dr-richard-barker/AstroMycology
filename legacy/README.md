# Legacy: mesh volume calculator

This folder holds the original content of this repo before it became the AstroMycology
image database (see the top-level README).

- **`Mushroom_to_Volume_ply.ipynb`** — a Colab notebook that loads existing `.ply` meshes
  (via [trimesh](https://trimsh.org/)) and computes `mesh.volume`. It does not build 3D
  scans from images — it assumes a mesh already exists (e.g. from a handheld structured-light
  scanner) and just measures it. The Drive paths inside are hardcoded to the original
  author's personal Google Drive, so the notebook won't run as-is without editing those paths.
- **`Tube01_Raw_Mesh.ply`** — a real sample scan (produced by a Revopoint structured-light
  scanner) used to sanity-check the notebook's output. It's also used in the new app as the
  first sample entry for the in-app 3D viewer/analysis tool, so the two can be cross-checked
  against each other.

Kept for reference rather than deleted — the mesh-volume-from-`.ply` approach here is the
same math the new app's in-app 3D analysis tool uses (client-side, in the browser, via
Three.js), just ported from a notebook workflow into the live database.
