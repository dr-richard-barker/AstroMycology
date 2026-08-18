# Contributing to AstroMycology

Thank you for contributing to AstroMycology! This repository hosts a static web application built with **React**, **TypeScript**, and **Vite** that provides browser-based viewing/analysis of mushroom RGB photos, RGB-thermal photos, and 3D scans (including an in-app Three.js 3D viewer).

---

## 🛠️ Local Development

### 1. Prerequisites
- **Node.js** (v18 or higher recommended)
- **npm** (v9 or higher)

### 2. Quickstart
```bash
# Clone the repository
git clone https://github.com/dr-richard-barker/AstroMycology.git
cd AstroMycology

# Install dependencies
npm install

# Run the development server
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📁 Repository Structure

- `src/App.tsx`: Layout, tabs, and routing.
- `src/api/`: Data integration layer.
  - `github.ts`: Fetching public folder contents, reading `metadata.csv` / `metadata.json` files, and parsing filenames.
  - `epicollect.ts`: Epicollect5 API connector.
- `src/components/`: UI components.
  - `Contribute.tsx`: Importing datasets from ZIP, Epicollect5, or GitHub folders.
  - `Database.tsx`: Searchable list of entries.
  - `Dashboard.tsx`: Visualization charts and GPS coordinates map.
  - `MarkerInspector.tsx`: Interactive calibration marker inspection and measurement visualization.
- `src/lib/`: Custom logic, including client-side marker contour/ArUco detection, IndexedDB caching, and image utility scripts.
- `src/types.ts`: Core data schemas (`Ec5Entry`, `MarkerAnalysis`, etc.).
- `tools/`: Python/Node utilities for preparing datasets.

---

## 🏷️ Metadata Sidecars

To pair external image folders (e.g., hosted on GitHub) with specimen metadata, we use **Frictionless Data sidecar files**.

### Naming Conventions
The hub looks for any of the following files in the same directory as the images:
- `metadata.csv` / `metadata.json`
- `data.csv` / `data.json`
- `images.csv` / `images.json`
- `datapackage.json` (Frictionless Data Descriptor)

### Canonical CSV Schema
Your sidecar should contain a header row with at least a `filename` or `file` column. Recommended columns include:

| Field | Type | Description |
| :--- | :--- | :--- |
| `filename` | string (Required) | The image filename (e.g., `IMG_1212.jpg`) |
| `species` | string | Standard scientific name or common name |
| `media_kind` | string | `photo` / `thermal` / `scan3d` / `video` (defaults to `photo`) |
| `genotype` | string | Strain, isolate, or accession identifier |
| `treatment` | string | Growth condition or experimental variable |
| `glds_accession` | string | NASA Open Science Data Repository (OSDR) entry ID |
| `date_taken` | ISO 8601 string | Date/time of capture |
| `notes` | string | Observations or additional context |

---

## 🚀 How to Submit Changes

1. **Fork the Repo** and create a feature branch (`git checkout -b feature/cool-new-thing`).
2. **Implement your changes**, ensuring clean TypeScript types.
3. **Verify** local build and type-safety:
   ```bash
   npm run lint
   npm run build
   ```
4. **Push your branch** to your fork and submit a **Pull Request**. Please describe the purpose of the changes and how you verified them.
