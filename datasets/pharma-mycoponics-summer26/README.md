# Pharma Mycoponics Summer 26 Dataset

This directory contains the integrated dataset from the Pharma Mycoponics Summer 2026 collaboration, combining phenotypic observations with DESI-MS metabolomics spectra.

## FAIR Data Principles Implementation

**Findable:**
- The dataset is structured within the open AstroMycology repository.
- Each data modality is clearly separated: observational metadata (`Chamber Tubes Daily.csv`, `Chamber Conditions Daily.csv`) and mass spectrometry tables (`Spectra_Pos.csv`, `Spectra_Neg.csv`).
- A joined table (`PLATE_02_linked.csv`) seamlessly links mass-spec identifiers to observational phenotypic metadata.

**Accessible:**
- All tabular data is provided in plain `.csv` text format for broad accessibility without proprietary software.
- The mass spec summary presentation (`Spectra.pptx`) has been split into individual images in the `Spectra_Slides/` directory so researchers can view the spectra instantly without needing Microsoft PowerPoint.

**Interoperable:**
- The EpiCollect data exports include structured JSON metadata (in the `data/epicollect/` directory) and UUID-based linking, allowing relational database reconstruction.
- The `PLATE_02_linked.csv` establishes a clear relational join bridging phenotypic records and metabolic arrays. 

**Reusable:**
- Scripts used to download the data (`scripts/download_epicollect.ps1`) and link the omics layers (`../../tools/link_desi_ms.py`) are open-source and included.
- Extensive documentation on the methodology is available in `INTEGRATION_NOTES.md`.

## Contents

- **`Chamber Tubes Daily.csv`**: EpiCollect tube-level phenotypic observations (e.g. exudate colors, volumes).
- **`Chamber Conditions Daily.csv`**: Environmental context and overarching chamber data.
- **`UUIDs and Date.csv`**: Date indexing for linking chamber metadata.
- **`Spectra_Pos.csv` / `Spectra_Neg.csv`**: Untargeted unknown ion intensities from the DESI-MS pipeline.
- **`PLATE_02_linked.csv`**: 1-to-1 mapping connecting `Spectra` identifiers (e.g. `SAM_D1_0702_A1`) to their parent phenotypic UUIDs.
- **`Spectra_Slides/`**: PNG conversions of the visual mass spectrometry slide deck.
- **`data/` & `scripts/`**: Original raw exports and the PowerShell scripts used for the EpiCollect snapshots.
