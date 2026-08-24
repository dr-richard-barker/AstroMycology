// Fetches and parses the real pipeline outputs from the sibling Myco_tissue_RNAseq
// repo's results/ tree, live from raw.githubusercontent.com — nothing is copied
// into this repo. All BOM_ss5-referenced (the working reference; PC9.15 is the
// poor-performing one and is never used here — see that repo's own notes).
import { splitRows, splitLine } from '../api/github';

const OWNER = 'dr-richard-barker';
const REPO = 'Myco_tissue_RNAseq';
const RNASEQ_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/results/`;

export type Track = 'all_genes' | 'rRNArm';

// The 4 tissues and the exact 6 pairwise comparisons that exist in the repo
// (not every A-vs-B ordering is present — this mirrors the real file set).
export const TISSUES = ['Exuding mycelium', 'Exudophore', 'Fuzzy mycelium', 'Nodule'] as const;
export type Tissue = typeof TISSUES[number];
export const DE_COMPARISONS: [Tissue, Tissue][] = [
  ['Exudophore', 'Exuding mycelium'],
  ['Fuzzy mycelium', 'Exuding mycelium'],
  ['Fuzzy mycelium', 'Exudophore'],
  ['Nodule', 'Exuding mycelium'],
  ['Nodule', 'Exudophore'],
  ['Nodule', 'Fuzzy mycelium'],
];
// Multi-word tissue names join with "." in these filenames, not "_" or " ".
const fileSlug = (t: string) => t.replace(/ /g, '.');
// markers_<tissue>.csv instead uses "_" for the space.
const markerSlug = (t: string) => t.replace(/ /g, '_');

// ---- low-level fetch + parse (in-memory cache so re-selecting a comparison is instant) ----
const textCache = new Map<string, Promise<string>>();
async function fetchText(path: string): Promise<string> {
  const url = RNASEQ_BASE + path;
  let p = textCache.get(url);
  if (!p) {
    p = fetch(url).then(r => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.text();
    });
    textCache.set(url, p);
  }
  return p;
}
async function fetchTable(path: string, delim: string): Promise<{ headers: string[]; rows: string[][] }> {
  const text = await fetchText(path);
  const lines = splitRows(text).filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  return { headers: splitLine(lines[0], delim), rows: lines.slice(1).map(l => splitLine(l, delim)) };
}
const num = (s: string) => { const n = parseFloat(s); return Number.isNaN(n) ? NaN : n; };

// ---- typed readers, one per result file the RNA-seq tab needs ----
export interface ReadBudgetRow { sample: string; well: string; tissue: string; raw: number; rRNA: number; mRNA: number; det1: number; det10: number; pct: number; }
export async function fetchReadBudget(): Promise<ReadBudgetRow[]> {
  const { rows } = await fetchTable('read_budget_BOM_ss5.csv', ',');
  return rows.map(r => ({ sample: r[0], well: r[1], tissue: r[2], raw: num(r[3]), rRNA: num(r[4]), mRNA: num(r[5]), det1: num(r[6]), det10: num(r[7]), pct: num(r[8]) }));
}

export interface PcaRow { sample: string; pc1: number; pc2: number; tissue: string; mrna: number; }
export async function fetchPca(track: Track): Promise<PcaRow[]> {
  const { rows } = await fetchTable(`dge_BOM_ss5/PCA_${track}.csv`, ',');
  return rows.map(r => ({ sample: r[0], pc1: num(r[1]), pc2: num(r[2]), tissue: r[3].replace(/\./g, ' '), mrna: num(r[4]) }));
}

export interface DERow { gene: string; baseMean: number; log2FoldChange: number; lfcSE: number; stat: number; pvalue: number; padj: number; }
export async function fetchDE(a: Tissue, b: Tissue, track: Track): Promise<DERow[]> {
  const path = `dge_BOM_ss5/DE_${track}_${fileSlug(a)}_vs_${fileSlug(b)}.csv`;
  const { rows } = await fetchTable(path, ',');
  return rows.map(r => ({ gene: r[0], baseMean: num(r[1]), log2FoldChange: num(r[2]), lfcSE: num(r[3]), stat: num(r[4]), pvalue: num(r[5]), padj: num(r[6]) }))
    .filter(r => !Number.isNaN(r.log2FoldChange) && !Number.isNaN(r.padj));
}

export interface ModuleTraitCell { module: string; tissue: string; r: number; p: number; }
export async function fetchModuleTraits(): Promise<{ modules: string[]; cells: ModuleTraitCell[] }> {
  const [corr, pval] = await Promise.all([
    fetchTable('wgcna/module_trait_correlation.csv', ','),
    fetchTable('wgcna/module_trait_pvalue.csv', ','),
  ]);
  const tissueCols = corr.headers.slice(1); // header[0] is the blank module-id column
  const pByModule = new Map(pval.rows.map(r => [r[0], r.slice(1).map(num)]));
  const modules: string[] = [];
  const cells: ModuleTraitCell[] = [];
  for (const row of corr.rows) {
    const mod = row[0];
    modules.push(mod);
    const ps = pByModule.get(mod) || [];
    tissueCols.forEach((tissue, i) => cells.push({ module: mod, tissue, r: num(row[i + 1]), p: ps[i] ?? NaN }));
  }
  return { modules, cells };
}

// EC cells hold one or more "<number> {evidence codes}" entries separated by
// ";" — keep just the bare numbers, dropping the ECO evidence-code clutter.
function parseEc(cell: string): string {
  return (cell || '').split(';').map(e => e.split('{')[0].trim()).filter(Boolean).join(', ');
}

export interface MarkerRow { tissue: Tissue; gene: string; proteinName: string; ec: string; tau: number; }
export async function fetchMarkers(tissue: Tissue): Promise<MarkerRow[]> {
  const { rows } = await fetchTable(`tissue_models_BOM_ss5/markers_${markerSlug(tissue)}.csv`, ',');
  // gene,tau,mean_<Tissue>,protein_name,EC,KEGG
  return rows.map(r => ({ tissue, gene: r[0], tau: num(r[1]), proteinName: r[3] || '', ec: parseEc(r[4]) }));
}
export async function fetchAllMarkers(): Promise<MarkerRow[]> {
  const perTissue = await Promise.all(TISSUES.map(fetchMarkers));
  return perTissue.flat();
}

// Gene name/EC/tissue-specificity lookup built from every marker file — the
// only source of human-readable annotation available without the
// (deliberately descoped) NCBI GTF + GO-ontology bridge. Coverage is sparse
// (only genes that are a top-tau marker for some tissue), so most
// whole-genome DE/volcano hits fall back to the bare locus tag with no tau —
// that's a real limit of the data, not a bug.
export interface GeneInfo { name: string; ec: string; tissue: Tissue; tau: number; }
export function buildGeneIndex(markers: MarkerRow[]): Map<string, GeneInfo> {
  const idx = new Map<string, GeneInfo>();
  for (const m of markers) if (!idx.has(m.gene)) idx.set(m.gene, { name: m.proteinName, ec: m.ec, tissue: m.tissue, tau: m.tau });
  return idx;
}
