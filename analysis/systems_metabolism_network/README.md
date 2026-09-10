# Systems Metabolism Network Analysis

This directory contains the code, data, and results for the systems-level metabolic network mapping of *Pleurotus ostreatus* as part of the AstroMycology project. It adheres to FAIR (Findable, Accessible, Interoperable, and Reusable) principles to ensure reproducibility of the multi-omics pathway models.

## Provenance and Motivation
This analysis replicates and extends the PaintOmics pipeline by dynamically extracting KEGG KGML (Kyoto Encyclopedia of Genes and Genomes - XML) topologies via the KEGG REST API, overlaying transcriptomic and metabolomic data, and generating standalone static and interactive maps for the manuscript draft.

## Directory Structure

```text
analysis/systems_metabolism_network/
├── data/
│   └── input/
│       ├── metabolomics_quantification.txt   # Normalized MS metabolite annotations and Log2FC
│       └── transcriptomics_quantification.txt # Normalized RNAseq fold changes (Exudophore vs others)
├── scripts/
│   ├── build_myco_knowledge_graph.py     # Generates semantic ontology Knowledge Graph
│   ├── manuscript_pathways.py            # Generates top 5 targeted KEGG pathway figures
│   ├── omics_pathway_visualizer.py       # Base tool for mapping multi-omics to KEGG
│   ├── plot_ko00620_detailed.py          # Custom Pyruvate metabolism script (unhides all cofactors)
│   └── plot_ko01100_filtered.py          # Custom Global metabolism script (prunes unconnected nodes)
└── results/
    ├── figures/
    │   ├── knowledge_graph.png           # Semantic Knowledge Graph (High-res)
    │   ├── ko00010_highlighted.png       # Glycolysis
    │   ├── ko00620_detailed.png          # Pyruvate metabolism (Detailed Cofactors)
    │   ├── ko01100_filtered.png          # Global Metabolism (Omics-Filtered)
    │   └── ... (Other pathway PNGs)
    └── interactive/
        └── knowledge_graph.html          # Interactive Cytoscape.js Knowledge Graph
```

## Setup & Reproducibility (Interoperability)

To reproduce the analysis locally:

1. **Environment Setup:** Ensure you have Python 3.9+ installed along with `networkx` and `matplotlib`.
   ```bash
   pip install networkx matplotlib
   ```
2. **Execution:** Run any of the rendering scripts from within the `scripts/` directory. For example:
   ```bash
   python3 scripts/plot_ko01100_filtered.py
   ```
   *Note: The scripts dynamically query `https://rest.kegg.jp` to retrieve the latest pathway coordinate models, so an active internet connection is required.*

## Data Dictionary
- **Log2FC Coloring:** Node mapping colors correspond to log2 fold change relative to exudophore expression over the highest other tissue baseline. Red indicates upregulation, Blue indicates downregulation, Khaki indicates reaction cofactors, and Grey indicates undetected/basal features.
- **Enzymes Tracked:** EC 1.1.3.13, 1.2.1.3, 1.1.1.138, 1.1.1.14, 2.8.1.1, and 1.13.11.60.

## License & Accessibility
This code and its outputs are part of the open-source AstroMycology organization framework. Data inputs were parsed directly from the `pharma-mycoponics-summer26` mass-spec tables and the `Myco_tissue_RNAseq` differential expression results.
