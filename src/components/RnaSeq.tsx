import React, { useEffect, useMemo, useState } from 'react';
import { Dna, Workflow, Filter, ScatterChart, Flame, Grid3x3, Table as TableIcon, ExternalLink } from 'lucide-react';
import {
  TISSUES, DE_COMPARISONS, fetchReadBudget, fetchPca, fetchDE, fetchModuleTraits, fetchAllMarkers,
  buildGeneNameIndex, type Track, type Tissue, type ReadBudgetRow, type PcaRow, type DERow,
  type ModuleTraitCell, type MarkerRow,
} from '../lib/rnaseq';
import { benjaminiHochberg } from '../lib/stats';
import { readVars, mix, PALETTE } from '../lib/svgTheme';

const REPO_URL = 'https://github.com/dr-richard-barker/Myco_tissue_RNAseq';
const tissueColor = (t: string) => PALETTE[Math.max(0, TISSUES.indexOf(t as Tissue)) % PALETTE.length];

export const RnaSeq: React.FC = () => {
  const { data: markers, error: markersError, loading: markersLoading } = useAsync(fetchAllMarkers, []);
  const geneIndex = useMemo(() => buildGeneNameIndex(markers || []), [markers]);
  const nameOf = (gene: string) => geneIndex.get(gene)?.name || gene;

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">RNA-seq</div>
        <h1>Tissue expression atlas</h1>
        <p>
          Real pipeline outputs from <a href={REPO_URL} target="_blank" rel="noreferrer">Myco_tissue_RNAseq <ExternalLink size={12} /></a> —
          tissue-specific <em>Pleurotus ostreatus</em> RNA-seq from mycoponic ceramic tubes, fetched live (nothing duplicated into this repo).
          Reference: BOM_ss5, the working assembly for this dataset.
        </p>
      </div>

      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="card-title"><Workflow /> Analysis pipeline</div>
        <p className="muted" style={{ fontSize: '.78rem', marginTop: -6, marginBottom: 10 }}>Raw reads to systems models — the tool chain behind every chart below.</p>
        <PipelineDiagram />
      </div>

      <ReadBudgetSection />
      <PcaSection />
      <VolcanoSection nameOf={nameOf} />
      <WgcnaSection />
      <MarkerSection markers={markers} error={markersError} loading={markersLoading} />
    </div>
  );
};

// ---- 1. pipeline overview (static, grounded in the repo's own data_dictionary.md) ----
const PipelineDiagram: React.FC = () => {
  const c = readVars({ '--line': '#e5e9f0', '--muted': '#5a6473', '--card': '#ffffff', '--fg': '#1a1f29' });
  const W = 900, H = 260;
  const box = (x: number, y: number, w: number, h: number, label: string, sub: string, color: string, key: string) => (
    <g key={key}>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + h / 2 - 3} fontSize={11} fontWeight={600} textAnchor="middle" fill={c['--fg']}>{label}</text>
      <text x={x + w / 2} y={y + h / 2 + 12} fontSize={9} textAnchor="middle" fill={c['--muted']}>{sub}</text>
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number, key: string) => (
    <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c['--muted']} strokeWidth={1.3} markerEnd="url(#rnaseq-arrow)" />
  );
  const topY = 20, topH = 46, bw = 118;
  const stages: [string, string, string][] = [
    ['Raw reads', 'fastp trim', PALETTE[0]],
    ['Trimmed', 'HISAT2 align', PALETTE[1]],
    ['Aligned', 'featureCounts -s 1', PALETTE[2]],
    ['Gene counts', 'per-sample matrix', PALETTE[3]],
  ];
  const branches: [string, string, string][] = [
    ['DESeq2', 'DE + PCA', PALETTE[4]],
    ['WGCNA', 'co-expression modules', PALETTE[5]],
    ['Yanai τ', 'tissue specificity', PALETTE[6]],
  ];
  const lastTopX = 20 + 3 * (bw + 24);
  const branchY = 130, branchW = 150;
  const branchXs = [W / 2 - branchW * 1.5 - 20, W / 2 - branchW / 2, W / 2 + branchW / 2 + 20];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 480, display: 'block' }}>
      <defs>
        <marker id="rnaseq-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={c['--muted']} />
        </marker>
      </defs>
      {stages.map(([label, sub, color], i) => box(20 + i * (bw + 24), topY, bw, topH, label, sub, color, `s${i}`))}
      {stages.slice(0, -1).map((_, i) => arrow(20 + i * (bw + 24) + bw, topY + topH / 2, 20 + (i + 1) * (bw + 24), topY + topH / 2, `a${i}`))}
      {branches.map(([label, sub, color], i) => box(branchXs[i], branchY, branchW, topH, label, sub, color, `b${i}`))}
      {branches.map((_, i) => (
        <path key={`ab${i}`} d={`M${lastTopX - bw / 2},${topY + topH} C${lastTopX - bw / 2},${branchY - 20} ${branchXs[i] + branchW / 2},${branchY - 20} ${branchXs[i] + branchW / 2},${branchY}`}
          fill="none" stroke={c['--muted']} strokeWidth={1.3} markerEnd="url(#rnaseq-arrow)" />
      ))}
      {box(W / 2 - 90, branchY + topH + 40, 180, topH, 'ModelSEED GEMs', 'draft → medium → gapfilled', PALETTE[7], 'gem')}
      {branchXs.map((x, i) => (
        <line key={`ag${i}`} x1={x + branchW / 2} y1={branchY + topH} x2={W / 2} y2={branchY + topH + 40} stroke={c['--muted']} strokeWidth={1.3} markerEnd="url(#rnaseq-arrow)" />
      ))}
    </svg>
  );
};

// ---- shared async-section scaffolding ----
function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean } {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  useEffect(() => {
    let alive = true;
    setState(s => ({ ...s, loading: true, error: null }));
    fn().then(data => { if (alive) setState({ data, error: null, loading: false }); })
      .catch(e => { if (alive) setState({ data: null, error: e instanceof Error ? e.message : String(e), loading: false }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
const ErrorBanner: React.FC<{ message: string }> = ({ message }) => (
  <div style={{ borderColor: 'var(--warn)', color: 'var(--warn)', fontSize: '.82rem' }}>Couldn't load this section: {message}</div>
);

// ---- 2. read-budget QC funnel ----
const ReadBudgetSection: React.FC = () => {
  const { data, error, loading } = useAsync(fetchReadBudget, []);
  const byTissue = useMemo(() => {
    if (!data) return [];
    const groups = new Map<string, ReadBudgetRow[]>();
    for (const r of data) { const g = groups.get(r.tissue) || []; g.push(r); groups.set(r.tissue, g); }
    const avg = (rows: ReadBudgetRow[], key: keyof ReadBudgetRow) => rows.reduce((a, r) => a + (r[key] as number), 0) / rows.length;
    return TISSUES.filter(t => groups.has(t)).map(t => {
      const rows = groups.get(t)!;
      return { tissue: t, n: rows.length, raw: avg(rows, 'raw'), rRNA: avg(rows, 'rRNA'), mRNA: avg(rows, 'mRNA'), pct: avg(rows, 'pct'), det10: avg(rows, 'det10') };
    });
  }, [data]);

  const c = readVars({ '--line': '#e5e9f0', '--muted': '#5a6473' });
  const W = 640, H = 240, padL = 60, padR = 14, padT = 12, padB = 40;
  const maxVal = Math.max(1, ...byTissue.map(t => t.raw));
  const groupW = (W - padL - padR) / Math.max(1, byTissue.length);
  const barW = groupW / 4;
  const stageColors = [PALETTE[0], PALETTE[4], PALETTE[2]];

  return (
    <div className="card pad" style={{ marginBottom: 16 }}>
      <div className="card-title"><Filter /> Read budget (raw → rRNA → mRNA)</div>
      <p className="muted" style={{ fontSize: '.78rem', marginTop: -6, marginBottom: 10 }}>Per-tissue average, from BOM_ss5's own read_budget.csv — how much signal survives each stage.</p>
      {loading && <p className="muted" style={{ fontSize: '.85rem' }}>Loading…</p>}
      {error && <ErrorBanner message={error} />}
      {byTissue.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 420, display: 'block' }}>
            {[0, 0.25, 0.5, 0.75, 1].map(f => (
              <g key={f}>
                <line x1={padL} y1={H - padB - f * (H - padT - padB)} x2={W - padR} y2={H - padB - f * (H - padT - padB)} stroke={c['--line']} strokeWidth={0.5} />
                <text x={padL - 6} y={H - padB - f * (H - padT - padB) + 3} fontSize={8} textAnchor="end" fill={c['--muted']}>{(f * maxVal / 1e6).toFixed(1)}M</text>
              </g>
            ))}
            {byTissue.map((t, gi) => (
              <g key={t.tissue}>
                {[t.raw, t.rRNA, t.mRNA].map((v, si) => {
                  const h = (v / maxVal) * (H - padT - padB);
                  const x = padL + gi * groupW + si * barW + 4;
                  return <rect key={si} x={x} y={H - padB - h} width={barW - 4} height={h} fill={stageColors[si]} rx={1}><title>{`${t.tissue} · ${['raw', 'rRNA', 'mRNA'][si]}: ${Math.round(v).toLocaleString()} reads`}</title></rect>;
                })}
                <text x={padL + gi * groupW + groupW / 2} y={H - padB + 14} fontSize={8} textAnchor="middle" fill={c['--muted']}>{t.tissue}</text>
              </g>
            ))}
          </svg>
          <div className="row wrap" style={{ gap: 10, marginTop: 4 }}>
            {['raw', 'rRNA', 'mRNA'].map((s, i) => (
              <span key={s} className="row muted" style={{ gap: 4, alignItems: 'center', fontSize: '.72rem' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: stageColors[i], display: 'inline-block' }} /> {s}
              </span>
            ))}
          </div>
          <div className="row wrap muted" style={{ gap: 12, fontSize: '.74rem', marginTop: 8 }}>
            {byTissue.map(t => <span key={t.tissue}>{t.tissue}: {t.pct.toFixed(1)}% mRNA, {Math.round(t.det10)} genes ≥10 reads (n={t.n})</span>)}
          </div>
        </div>
      )}
    </div>
  );
};

// ---- generic scatter (used by PCA; no y=x reference line) ----
const ScatterChartSvg: React.FC<{ points: { x: number; y: number; label: string; color: string; title: string }[]; xLabel: string; yLabel: string }> = ({ points, xLabel, yLabel }) => {
  const c = readVars({ '--line': '#e5e9f0', '--muted': '#5a6473', '--card': '#ffffff' });
  if (!points.length) return null;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys);
  const padX = (xMax - xMin) * 0.12 || 1, padY = (yMax - yMin) * 0.12 || 1;
  const W = 480, H = 340, pad = 40;
  const sx = (v: number) => pad + ((v - (xMin - padX)) / ((xMax + padX) - (xMin - padX))) * (W - pad * 2);
  const sy = (v: number) => H - pad - ((v - (yMin - padY)) / ((yMax + padY) - (yMin - padY))) * (H - pad * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 480, display: 'block', margin: '0 auto' }}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke={c['--line']} strokeWidth={0.75} />
      <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke={c['--line']} strokeWidth={0.75} />
      <text x={W / 2} y={H - 6} fontSize={9} textAnchor="middle" fill={c['--muted']}>{xLabel}</text>
      <text x={12} y={H / 2} fontSize={9} textAnchor="middle" fill={c['--muted']} transform={`rotate(-90 12 ${H / 2})`}>{yLabel}</text>
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={5} fill={p.color} stroke={c['--card']} strokeWidth={1}><title>{p.title}</title></circle>
      ))}
    </svg>
  );
};

// ---- 3. PCA ----
const PcaSection: React.FC = () => {
  const [track, setTrack] = useState<Track>('rRNArm');
  const { data, error, loading } = useAsync(() => fetchPca(track), [track]);
  const points = useMemo(() => (data || []).map((p: PcaRow) => ({
    x: p.pc1, y: p.pc2, label: p.sample, color: tissueColor(p.tissue),
    title: `${p.sample} (${p.tissue}): PC1 ${p.pc1.toFixed(1)}, PC2 ${p.pc2.toFixed(1)}, ${p.mrna.toLocaleString()} mRNA reads`,
  })), [data]);
  const tissuesPresent = useMemo(() => [...new Set((data || []).map(p => p.tissue))], [data]);

  return (
    <div className="card pad" style={{ marginBottom: 16 }}>
      <div className="row sb" style={{ justifyContent: 'space-between', marginBottom: -2 }}>
        <div className="card-title"><ScatterChart /> Sample clustering (PCA)</div>
        <select className="select" style={{ width: 'auto' }} value={track} onChange={e => setTrack(e.target.value as Track)}>
          <option value="rRNArm">rRNA-removed</option>
          <option value="all_genes">All genes</option>
        </select>
      </div>
      <p className="muted" style={{ fontSize: '.78rem', marginTop: 4, marginBottom: 10 }}>Each point is one library; colored by tissue.</p>
      {loading && <p className="muted" style={{ fontSize: '.85rem' }}>Loading…</p>}
      {error && <ErrorBanner message={error} />}
      {points.length > 0 && (
        <>
          <ScatterChartSvg points={points} xLabel="PC1" yLabel="PC2" />
          <div className="row wrap" style={{ gap: 10, marginTop: 6, justifyContent: 'center' }}>
            {tissuesPresent.map(t => (
              <span key={t} className="row muted" style={{ gap: 4, alignItems: 'center', fontSize: '.72rem' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: tissueColor(t), display: 'inline-block' }} /> {t}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ---- 4. volcano plots ----
const VolcanoSvg: React.FC<{ rows: DERow[]; nameOf: (gene: string) => string }> = ({ rows, nameOf }) => {
  const c = readVars({ '--line': '#e5e9f0', '--muted': '#5a6473', '--warn': '#c0392b' });
  const W = 640, H = 340, pad = 44;
  const xs = rows.map(r => r.log2FoldChange);
  const ys = rows.map(r => -Math.log10(Math.max(r.padj, 1e-300)));
  const xAbs = Math.max(1, ...xs.map(Math.abs));
  const yMax = Math.max(1, ...ys.filter(v => Number.isFinite(v)));
  const sx = (v: number) => pad + ((v + xAbs) / (2 * xAbs)) * (W - pad * 2);
  const sy = (v: number) => H - pad - (Math.min(v, yMax) / yMax) * (H - pad * 2);
  const isSig = (r: DERow) => r.padj < 0.05 && Math.abs(r.log2FoldChange) > 1;
  const sig = rows.filter(isSig), rest = rows.filter(r => !isSig(r));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 420, display: 'block' }}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke={c['--line']} strokeWidth={0.75} />
      <line x1={sx(0)} y1={pad} x2={sx(0)} y2={H - pad} stroke={c['--line']} strokeWidth={0.75} strokeDasharray="3 3" />
      <text x={W / 2} y={H - 6} fontSize={9} textAnchor="middle" fill={c['--muted']}>log2 fold change</text>
      <text x={12} y={H / 2} fontSize={9} textAnchor="middle" fill={c['--muted']} transform={`rotate(-90 12 ${H / 2})`}>-log10(padj)</text>
      {rest.map((r, i) => <circle key={`r${i}`} cx={sx(r.log2FoldChange)} cy={sy(-Math.log10(Math.max(r.padj, 1e-300)))} r={1.6} fill={c['--muted']} fillOpacity={0.4} />)}
      {sig.map((r, i) => (
        <circle key={`s${i}`} cx={sx(r.log2FoldChange)} cy={sy(-Math.log10(Math.max(r.padj, 1e-300)))} r={2.4} fill={c['--warn']} fillOpacity={0.85}>
          <title>{`${nameOf(r.gene)} · log2FC ${r.log2FoldChange.toFixed(2)}, padj ${r.padj.toExponential(2)}`}</title>
        </circle>
      ))}
      <text x={W - pad} y={pad + 10} fontSize={9} textAnchor="end" fill={c['--muted']}>{sig.length} significant of {rows.length} tested</text>
    </svg>
  );
};

const VolcanoSection: React.FC<{ nameOf: (gene: string) => string }> = ({ nameOf }) => {
  const [track, setTrack] = useState<Track>('rRNArm');
  const [pairIdx, setPairIdx] = useState(0);
  const [a, b] = DE_COMPARISONS[pairIdx];
  const { data, error, loading } = useAsync(() => fetchDE(a, b, track), [a, b, track]);

  return (
    <div className="card pad" style={{ marginBottom: 16 }}>
      <div className="row wrap sb" style={{ justifyContent: 'space-between', gap: 8, marginBottom: -2 }}>
        <div className="card-title"><Flame /> Differential expression (volcano)</div>
        <div className="row wrap" style={{ gap: 8 }}>
          <select className="select" style={{ width: 'auto' }} value={pairIdx} onChange={e => setPairIdx(Number(e.target.value))}>
            {DE_COMPARISONS.map(([x, y], i) => <option key={i} value={i}>{x} vs {y}</option>)}
          </select>
          <select className="select" style={{ width: 'auto' }} value={track} onChange={e => setTrack(e.target.value as Track)}>
            <option value="rRNArm">rRNA-removed</option>
            <option value="all_genes">All genes</option>
          </select>
        </div>
      </div>
      <p className="muted" style={{ fontSize: '.78rem', marginTop: 4, marginBottom: 10 }}>Highlighted points: padj &lt; 0.05 and |log2FC| &gt; 1. Hover a highlighted point for its gene.</p>
      {loading && <p className="muted" style={{ fontSize: '.85rem' }}>Loading…</p>}
      {error && <ErrorBanner message={error} />}
      {data && data.length > 0 && <VolcanoSvg rows={data} nameOf={nameOf} />}
    </div>
  );
};

// ---- 5. WGCNA module-trait heatmap ----
const WgcnaSection: React.FC = () => {
  const { data, error, loading } = useAsync(fetchModuleTraits, []);
  const rows = useMemo(() => {
    if (!data) return [];
    const { modules, cells } = data;
    const byModule = new Map<string, ModuleTraitCell[]>();
    for (const cell of cells) { const g = byModule.get(cell.module) || []; g.push(cell); byModule.set(cell.module, g); }
    const pvals = cells.map(c => c.p);
    const qs = benjaminiHochberg(pvals);
    const qByKey = new Map(cells.map((c, i) => [`${c.module}::${c.tissue}`, qs[i]]));
    return [...modules].sort((m1, m2) => {
      const max = (m: string) => Math.max(...(byModule.get(m) || []).map(c => Math.abs(c.r)));
      return max(m2) - max(m1);
    }).map(mod => ({
      module: mod,
      swatch: mod.replace(/^ME/, ''),
      cells: (byModule.get(mod) || []).map(c => ({ ...c, q: qByKey.get(`${c.module}::${c.tissue}`) ?? 1 })),
    }));
  }, [data]);
  const negColor = '#c0392b', posColor = '#3fb6a8';

  return (
    <div className="card pad" style={{ marginBottom: 16 }}>
      <div className="card-title"><Grid3x3 /> Co-expression modules × tissue (WGCNA)</div>
      <p className="muted" style={{ fontSize: '.78rem', marginTop: -6, marginBottom: 10 }}>Pearson r per module eigengene vs. tissue; * marks BH-FDR q &lt; 0.05 across all {(data?.cells.length || 0)} tests. Sorted by strongest signal.</p>
      {loading && <p className="muted" style={{ fontSize: '.85rem' }}>Loading…</p>}
      {error && <ErrorBanner message={error} />}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
          <table className="mono" style={{ width: '100%', fontSize: '.76rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', position: 'sticky', top: 0, background: 'var(--card)' }}>
                <th>Module</th>
                {rows[0].cells.map(c => <th key={c.tissue} style={{ textAlign: 'center' }}>{c.tissue}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.module} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="row" style={{ gap: 5, alignItems: 'center' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: /^[a-z]+$/i.test(row.swatch) ? row.swatch : '#999', display: 'inline-block', border: '1px solid var(--line)' }} />
                    {row.swatch}
                  </td>
                  {row.cells.map(c => {
                    const t = Math.min(1, Math.abs(c.r));
                    const bg = mix('#ffffff', c.r < 0 ? negColor : posColor, t * 0.75);
                    return (
                      <td key={c.tissue} style={{ textAlign: 'center', background: bg, color: t > 0.5 ? '#fff' : 'inherit' }}>
                        {c.r.toFixed(2)}{c.q < 0.05 ? '*' : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ---- 6. tissue marker / specificity table ----
const MarkerSection: React.FC<{ markers: MarkerRow[] | null; error: string | null; loading: boolean }> = ({ markers, error, loading }) => {
  const [tissueFilter, setTissueFilter] = useState<Tissue | 'all'>('all');
  const rows = useMemo(() => (markers || [])
    .filter(m => tissueFilter === 'all' || m.tissue === tissueFilter)
    .sort((a, b) => b.tau - a.tau), [markers, tissueFilter]);

  return (
    <div className="card pad">
      <div className="row sb" style={{ justifyContent: 'space-between', marginBottom: -2 }}>
        <div className="card-title"><TableIcon /> Tissue markers &amp; specificity</div>
        <select className="select" style={{ width: 'auto' }} value={tissueFilter} onChange={e => setTissueFilter(e.target.value as Tissue | 'all')}>
          <option value="all">All tissues</option>
          {TISSUES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <p className="muted" style={{ fontSize: '.78rem', marginTop: 4, marginBottom: 10 }}>
        Top marker genes by Yanai τ (tissue specificity) per tissue. Protein name and EC (molecular function) are shown when a
        Swiss-Prot homolog was found — blank otherwise, not guessed. <strong>No cellular-localization column</strong>: that needs a
        locus-tag↔protein-accession bridge (the genome's stock GTF) that isn't in the repo's results — descoped for this version.
      </p>
      {loading && <p className="muted" style={{ fontSize: '.85rem' }}>Loading…</p>}
      {error && <ErrorBanner message={error} />}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
          <table className="mono" style={{ width: '100%', fontSize: '.78rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', position: 'sticky', top: 0, background: 'var(--card)' }}>
                <th>Tissue</th><th>Gene</th><th>Protein name</th><th>EC (function)</th><th>τ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.tissue}-${r.gene}-${i}`} style={{ borderTop: '1px solid var(--line)' }}>
                  <td><span className="chip">{r.tissue}</span></td>
                  <td>{r.gene}</td>
                  <td className={r.proteinName ? '' : 'muted'}>{r.proteinName || '—'}</td>
                  <td className={r.ec ? '' : 'muted'}>{r.ec || '—'}</td>
                  <td>{r.tau.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
