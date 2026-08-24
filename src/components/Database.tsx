import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Database as DbIcon, CheckCircle2, Images, ImageIcon, Loader2, ChevronDown, FileText, LineChart, Crosshair, PlayCircle, Film, Box, Thermometer, Biohazard, ScanText, Ruler } from 'lucide-react';
import type { Ec5Entry, MarkerAnalysis, ThermalReading } from '../types';
import { MarkerInspector } from './MarkerInspector';
import { SmartImg } from './SmartImg';
import { projectName, saveMarker, saveContamination, saveThermalReading } from '../api/epicollect';
import { allResults, putResult } from '../lib/cose-results';
import { urlToImageData } from '../lib/capture';
import { analyzeMarker } from '../lib/detect';
import { analyzeContamination, type ContaminationResult } from '../lib/contamination';
import { extractThermalReading } from '../lib/thermal';
import { loadScan, computeStats, formatFromName, metricsForStats } from '../lib/threed';

interface Props {
  entries: Ec5Entry[];
  query: string;
  loading: boolean;
  hasNext: boolean;
  showProject: boolean;
  onLoadMore: () => void;
  onMarkerChanged: (uuid: string, marker: MarkerAnalysis | null) => void;
  onContaminationChanged: (uuid: string, contamination: ContaminationResult | null) => void;
  onThermalChanged: (uuid: string, thermal: ThermalReading | null) => void;
  onOpenTool: (id: string, imageUrl: string, ref: string, name?: string) => void;
  onHideImage?: (e: Ec5Entry) => void;   // admin-only: exclude an image
  currentUserId?: string;                // signed-in user (for owner delete)
  onDeleteUpload?: (e: Ec5Entry) => void; // delete a shared cloud upload
}

type Filter = 'all' | 'withPhoto' | 'analyzed';

// Genotype/line of an entry, if its metadata carries one (from a sidecar column
// named genotype/ecotype/cultivar/line). Generic — projects without such a field
// simply have no genotypes to filter by.
const genoOf = (e: Ec5Entry): string =>
  e.fields.find(f => /^(genotype|ecotype|cultivar|accession|line|strain)$/i.test(f.name.trim()))?.value.trim() || '';

const treatOf = (e: Ec5Entry): string =>
  e.fields.find(f => /^(treatment|growth condition|dose)$/i.test(f.name.trim()))?.value.trim() || '';

export const Database: React.FC<Props> = ({ entries, query, loading, hasNext, showProject, onLoadMore, onMarkerChanged, onContaminationChanged, onThermalChanged, onOpenTool, onHideImage, currentUserId, onDeleteUpload }) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [disabled, setDisabled] = useState<Set<string>>(new Set()); // projects toggled off
  const [disabledGeno, setDisabledGeno] = useState<Set<string>>(new Set()); // genotypes toggled off
  const [disabledTreat, setDisabledTreat] = useState<Set<string>>(new Set()); // treatments toggled off
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Batch marker derivation: auto-detect the calibration marker across loaded
  // photos so every entry gets a marker-present signal without manual clicks.
  const [derive, setDerive] = useState<{ done: number; total: number } | null>(null);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  const pending = useMemo(() => entries.filter(e => e.photoUrl && !e.marker), [entries]);

  const runDerive = async () => {
    if (!pending.length || derive) return;
    aliveRef.current = true;
    const queue = [...pending];
    setDerive({ done: 0, total: queue.length });
    let done = 0, idx = 0;
    const worker = async () => {
      while (idx < queue.length && aliveRef.current) {
        const e = queue[idx++];
        try {
          const m = await analyzeMarker(await urlToImageData(e.photoUrl!));
          if (!aliveRef.current) return;
          saveMarker(e.project, e.uuid, m);
          onMarkerChanged(e.uuid, m);
        } catch { /* skip unreadable image */ }
        setDerive({ done: ++done, total: queue.length });
      }
    };
    await Promise.all([worker(), worker(), worker()]); // 3 concurrent
    if (aliveRef.current) setDerive(null);
  };

  // Batch contamination screening: same pattern as marker derivation, over
  // photo entries that haven't been checked (or manually corrected) yet.
  const [contamProgress, setContamProgress] = useState<{ done: number; total: number } | null>(null);
  const pendingContam = useMemo(() => entries.filter(e => e.photoUrl && e.mediaKind !== 'thermal' && !e.contamination), [entries]);
  const runContamBatch = async () => {
    if (!pendingContam.length || contamProgress) return;
    aliveRef.current = true;
    const queue = [...pendingContam];
    setContamProgress({ done: 0, total: queue.length });
    let done = 0, idx = 0;
    const worker = async () => {
      while (idx < queue.length && aliveRef.current) {
        const e = queue[idx++];
        try {
          const result = analyzeContamination(await urlToImageData(e.photoUrl!));
          if (!aliveRef.current) return;
          saveContamination(e.project, e.uuid, result);
          onContaminationChanged(e.uuid, result);
        } catch { /* skip unreadable image */ }
        setContamProgress({ done: ++done, total: queue.length });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (aliveRef.current) setContamProgress(null);
  };

  // Batch thermal-value OCR: same pattern again, over thermal entries that
  // haven't been read (or manually corrected) yet.
  const [thermalProgress, setThermalProgress] = useState<{ done: number; total: number } | null>(null);
  const pendingThermal = useMemo(() => entries.filter(e => e.mediaKind === 'thermal' && e.photoUrl && !e.thermal), [entries]);
  const runThermalBatch = async () => {
    if (!pendingThermal.length || thermalProgress) return;
    aliveRef.current = true;
    const queue = [...pendingThermal];
    setThermalProgress({ done: 0, total: queue.length });
    let done = 0, idx = 0;
    const worker = async () => {
      while (idx < queue.length && aliveRef.current) {
        const e = queue[idx++];
        try {
          const reading = await extractThermalReading(e.photoUrl!);
          if (!aliveRef.current) return;
          saveThermalReading(e.project, e.uuid, reading);
          onThermalChanged(e.uuid, reading);
        } catch { /* skip unreadable image */ }
        setThermalProgress({ done: ++done, total: queue.length });
      }
    };
    // A single shared Tesseract worker underneath — 2 concurrent keeps the UI
    // responsive without actually running OCR in parallel (it's queued anyway).
    await Promise.all([worker(), worker()]);
    if (aliveRef.current) setThermalProgress(null);
  };

  // Which images have tool results (ref -> count), and which scan3d entries
  // already have a saved volume, from the shared store.
  const [resultCounts, setResultCounts] = useState<Map<string, number>>(new Map());
  const [volumeRefs, setVolumeRefs] = useState<Set<string>>(new Set());
  useEffect(() => {
    const load = () => allResults().then(rs => {
      const m = new Map<string, number>();
      const vr = new Set<string>();
      for (const r of rs) {
        m.set(r.ref, (m.get(r.ref) || 0) + 1);
        if (r.tool === 'scan3d-viewer') vr.add(r.ref);
      }
      setResultCounts(m); setVolumeRefs(vr);
    }).catch(() => {});
    load();
    window.addEventListener('focus', load); // refresh after returning from a tool tab
    return () => window.removeEventListener('focus', load);
  }, []);

  // Batch volume computation: run the same 3D-scan analysis the interactive
  // viewer offers, across every scan entry that doesn't have a saved result
  // yet, and write through the shared cose-results store — the Dashboard's
  // existing "Analysis results summary" picks these up with no further wiring.
  const [volumeProgress, setVolumeProgress] = useState<{ done: number; total: number } | null>(null);
  const pendingVolume = useMemo(() => entries.filter(e => e.scanUrl && !volumeRefs.has(`${e.project}::${e.uuid}`)), [entries, volumeRefs]);
  const runVolumeBatch = async () => {
    if (!pendingVolume.length || volumeProgress) return;
    aliveRef.current = true;
    const queue = [...pendingVolume];
    setVolumeProgress({ done: 0, total: queue.length });
    let done = 0, idx = 0;
    const worker = async () => {
      while (idx < queue.length && aliveRef.current) {
        const e = queue[idx++];
        const ref = `${e.project}::${e.uuid}`;
        try {
          // Prefer the entry's real filename over the URL: a local upload's
          // scanUrl is an extension-less blob: URL, so format detection off
          // the URL alone fails for anything not GitHub-hosted.
          const format = formatFromName(e.title || e.scanUrl!);
          if (format) {
            const obj = await loadScan(e.scanUrl!, format);
            const stats = computeStats(obj);
            await putResult({ ref, imageUrl: e.scanUrl!, tool: 'scan3d-viewer', toolName: '3D Scan Viewer', metrics: metricsForStats(stats), generatedAt: new Date().toISOString() });
            if (!aliveRef.current) return;
            setVolumeRefs(prev => new Set(prev).add(ref));
          }
        } catch { /* skip unreadable/unsupported scan */ }
        setVolumeProgress({ done: ++done, total: queue.length });
      }
    };
    // Meshes can be tens of MB each — 2 concurrent keeps memory reasonable.
    await Promise.all([worker(), worker()]);
    if (aliveRef.current) setVolumeProgress(null);
  };

  const projectsInView = useMemo(() => [...new Set(entries.map(e => e.project))], [entries]);
  const genotypesInView = useMemo(() => [...new Set(entries.map(genoOf).filter(Boolean))].sort(), [entries]);
  const treatmentsInView = useMemo(() => [...new Set(entries.map(treatOf).filter(Boolean))].sort(), [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(e => {
      if (disabled.has(e.project)) return false;
      // Strict genotype filter
      const g = genoOf(e);
      if (disabledGeno.size > 0 && (!g || disabledGeno.has(g))) return false;
      // Strict treatment filter
      const t = treatOf(e);
      if (disabledTreat.size > 0 && (!t || disabledTreat.has(t))) return false;
      if (filter === 'withPhoto' && !e.photoUrl) return false;
      if (filter === 'analyzed' && !e.marker?.markerFound) return false;
      if (!q) return true;
      return [e.title, e.species, ...e.fields.map(f => f.value)].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [entries, query, filter, disabled, disabledGeno, disabledTreat]);

  const selected = filtered.find(e => e.uuid === selectedId) || null;
  const withPhoto = entries.filter(e => e.photoUrl).length;
  const analyzed = entries.filter(e => e.marker?.markerFound).length;

  const toggleProject = (slug: string) =>
    setDisabled(prev => { const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n; });
  const toggleGeno = (g: string) =>
    setDisabledGeno(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const toggleTreat = (t: string) =>
    setDisabledTreat(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Shared collection</div>
        <h1>Mushroom image &amp; 3D scan database</h1>
        <p>Entries from every connected source — Epicollect5 projects, GitHub folders, and local uploads. Select a photo to detect the calibration marker and measure scale &amp; colour, or a 3D scan to open it in the 3D viewer — analysis runs in your browser and is cached locally.</p>
      </div>

      <div className="row wrap sb" style={{ marginBottom: 12, gap: 10 }}>
        <div className="row wrap" style={{ gap: 6 }}>
          <button className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter('all')}><Images /> All ({entries.length})</button>
          <button className={`btn btn-sm ${filter === 'withPhoto' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter('withPhoto')}><ImageIcon /> With images ({withPhoto})</button>
          <button className={`btn btn-sm ${filter === 'analyzed' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter('analyzed')}><CheckCircle2 /> Analyzed ({analyzed})</button>
        </div>
        <div className="row" style={{ gap: 10 }}>
          {derive ? (
            <span className="row muted" style={{ gap: 6, fontSize: '.82rem' }}><Loader2 className="spin" size={14} /> Detecting {derive.done}/{derive.total}…</span>
          ) : pending.length > 0 ? (
            <button className="btn btn-sm" onClick={runDerive} title="Auto-detect the calibration marker in every loaded photo (derives the marker-present badge)">
              <Crosshair size={14} /> Detect markers ({pending.length})
            </button>
          ) : null}
          {contamProgress ? (
            <span className="row muted" style={{ gap: 6, fontSize: '.82rem' }}><Loader2 className="spin" size={14} /> Screening {contamProgress.done}/{contamProgress.total}…</span>
          ) : pendingContam.length > 0 ? (
            <button className="btn btn-sm btn-ghost" onClick={runContamBatch} title="Colour-heuristic screen for likely contamination across every loaded photo">
              <Biohazard size={14} /> Check contamination ({pendingContam.length})
            </button>
          ) : null}
          {thermalProgress ? (
            <span className="row muted" style={{ gap: 6, fontSize: '.82rem' }}><Loader2 className="spin" size={14} /> Reading {thermalProgress.done}/{thermalProgress.total}…</span>
          ) : pendingThermal.length > 0 ? (
            <button className="btn btn-sm btn-ghost" onClick={runThermalBatch} title="OCR the min/max °C off every thermal photo's colorbar">
              <ScanText size={14} /> Read thermal data ({pendingThermal.length})
            </button>
          ) : null}
          {volumeProgress ? (
            <span className="row muted" style={{ gap: 6, fontSize: '.82rem' }}><Loader2 className="spin" size={14} /> Computing {volumeProgress.done}/{volumeProgress.total}…</span>
          ) : pendingVolume.length > 0 ? (
            <button className="btn btn-sm btn-ghost" onClick={runVolumeBatch} title="Compute volume/dimensions for every 3D scan and save the results">
              <Ruler size={14} /> Compute volumes ({pendingVolume.length})
            </button>
          ) : null}
          <span className="muted" style={{ fontSize: '.82rem' }}>{filtered.length} shown</span>
        </div>
      </div>

      {showProject && projectsInView.length > 1 && (
        <div className="row wrap" style={{ gap: 6, marginBottom: 14, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '.76rem', marginRight: 2 }}>Projects:</span>
          {projectsInView.map(slug => {
            const on = !disabled.has(slug);
            const n = entries.filter(e => e.project === slug).length;
            return (
              <button key={slug} onClick={() => toggleProject(slug)}
                className="chip" style={{
                  cursor: 'pointer',
                  background: on ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--card)',
                  color: on ? 'var(--accent)' : 'var(--muted)',
                  borderColor: on ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--line)',
                  opacity: on ? 1 : 0.6,
                }}>
                {on ? <CheckCircle2 size={12} /> : null} {projectName(slug)} ({n})
              </button>
            );
          })}
        </div>
      )}

      {genotypesInView.length > 1 && (
        <div className="row wrap" style={{ gap: 6, marginBottom: 14, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '.76rem', marginRight: 2 }}>Genotype:</span>
          {genotypesInView.map(g => {
            const on = !disabledGeno.has(g);
            const n = entries.filter(e => genoOf(e) === g).length;
            return (
              <button key={g} onClick={() => toggleGeno(g)}
                className="chip" style={{
                  cursor: 'pointer',
                  background: on ? 'color-mix(in srgb, var(--accent2) 15%, transparent)' : 'var(--card)',
                  color: on ? 'var(--accent2)' : 'var(--muted)',
                  borderColor: on ? 'color-mix(in srgb, var(--accent2) 40%, transparent)' : 'var(--line)',
                  opacity: on ? 1 : 0.6,
                }}>
                {on ? <CheckCircle2 size={12} /> : null} {g} ({n})
              </button>
            );
          })}
          {disabledGeno.size > 0 && (
            <button className="btn btn-sm btn-ghost" style={{ padding: '2px 8px', fontSize: '.72rem' }} onClick={() => setDisabledGeno(new Set())}>Reset</button>
          )}
        </div>
      )}

      {treatmentsInView.length > 1 && (
        <div className="row wrap" style={{ gap: 6, marginBottom: 14, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '.76rem', marginRight: 2 }}>Treatment:</span>
          {treatmentsInView.map(t => {
            const on = !disabledTreat.has(t);
            const n = entries.filter(e => treatOf(e) === t).length;
            return (
              <button key={t} onClick={() => toggleTreat(t)}
                className="chip" style={{
                  cursor: 'pointer',
                  background: on ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--card)',
                  color: on ? 'var(--accent)' : 'var(--muted)',
                  borderColor: on ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--line)',
                  opacity: on ? 1 : 0.6,
                }}>
                {on ? <CheckCircle2 size={12} /> : null} {t} ({n})
              </button>
            );
          })}
          {disabledTreat.size > 0 && (
            <button className="btn btn-sm btn-ghost" style={{ padding: '2px 8px', fontSize: '.72rem' }} onClick={() => setDisabledTreat(new Set())}>Reset</button>
          )}
        </div>
      )}

      {entries.length === 0 && !loading ? (
        <div className="card empty">
          <DbIcon size={30} style={{ opacity: .5 }} />
          <p>No entries found. Choose a project from the top-bar selector, or add one in <strong>Contribute</strong>.</p>
        </div>
      ) : (
        <>
          <div className="grid" style={{ gridTemplateColumns: selected ? 'minmax(0, 1.15fr) minmax(0, 1fr)' : '1fr', alignItems: 'start' }}>
            <div className="gallery">
              {filtered.map(e => (
                <div key={e.uuid} className={`tile ${selectedId === e.uuid ? 'sel' : ''}`} onClick={() => setSelectedId(e.uuid)}>
                  <div className="thumb">
                    {e.thumbUrl ? <SmartImg src={e.thumbUrl} alt={e.title} loading="lazy" crossOrigin="anonymous" />
                      : e.scanUrl ? <div style={{ display: 'grid', placeItems: 'center', height: '100%', gap: 6, background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent2) 22%, var(--card)), var(--card))', color: 'var(--accent2)' }}>
                          <Box size={34} /><span style={{ fontSize: '.68rem', color: 'var(--muted)' }}>3D scan</span>
                        </div>
                      : e.videoUrl ? <div style={{ display: 'grid', placeItems: 'center', height: '100%', gap: 6, background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, var(--card)), var(--card))', color: 'var(--accent)' }}>
                          <PlayCircle size={34} /><span style={{ fontSize: '.68rem', color: 'var(--muted)' }}>time-lapse video</span>
                        </div>
                      : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)', gap: 4 }}>
                          <FileText size={22} style={{ opacity: .5 }} /><span style={{ fontSize: '.68rem' }}>metadata only</span>
                        </div>}
                    <div className="corner-badge">
                      {e.scanUrl ? <span className="badge info"><Box size={11} /> 3D scan</span>
                        : e.videoUrl ? <span className="badge info"><Film size={11} /> video</span>
                        : e.mediaKind === 'thermal' ? (
                          e.thermal?.maxC != null
                            ? <span className="badge info" title={`OCR read: ${e.thermal.minC ?? '?'}–${e.thermal.maxC}°C`}><Thermometer size={11} /> {e.thermal.minC ?? '?'}–{e.thermal.maxC}°C</span>
                            : <span className="badge info"><Thermometer size={11} /> thermal</span>
                        )
                        : e.marker?.markerFound ? <span className="badge pos"><CheckCircle2 size={11} /> marker</span> : e.marker ? <span className="badge neg">no marker</span> : null}
                    </div>
                    {resultCounts.get(`${e.project}::${e.uuid}`) ? (
                      <div style={{ position: 'absolute', top: 7, right: 7 }}>
                        <span className="badge info" title="Tool analysis results attached"><LineChart size={11} /> {resultCounts.get(`${e.project}::${e.uuid}`)}</span>
                      </div>
                    ) : null}
                    {e.marker?.markerFound && e.marker.pxPerMm ? <div className="scale-badge">{e.marker.pxPerMm.toFixed(1)} px/mm</div> : null}
                    {e.contamination && e.contamination.verdict !== 'clean' && e.contamination.verdict !== 'inconclusive' ? (
                      <div style={{ position: 'absolute', bottom: 7, left: 7 }}>
                        <span className="badge" style={{ background: 'color-mix(in srgb, var(--danger) 20%, transparent)', color: 'var(--danger)' }} title={`Colour-heuristic screen: ${e.contamination.verdict}`}>
                          <Biohazard size={11} /> {e.contamination.verdict}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className="meta">
                    <h4>{e.title}</h4>
                    <div className="sp">{e.species || (e.fields[0]?.value ?? '')}</div>
                    {showProject && <div className="chip tag" style={{ marginTop: 6 }}>{projectName(e.project)}</div>}
                  </div>
                </div>
              ))}
            </div>

            {selected && (
              <div style={{ position: 'sticky', top: 74 }}>
                <MarkerInspector entry={selected} onMarkerChanged={onMarkerChanged} onContaminationChanged={onContaminationChanged} onThermalChanged={onThermalChanged} onOpenTool={onOpenTool}
                  onHide={onHideImage ? () => { onHideImage(selected); setSelectedId(null); } : undefined}
                  onDelete={onDeleteUpload && selected.cloud && (selected.cloud.owner === currentUserId || !!onHideImage)
                    ? () => { onDeleteUpload(selected); setSelectedId(null); } : undefined}
                  deleteIsOwn={selected.cloud?.owner === currentUserId} />
              </div>
            )}
          </div>

          <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
            {loading ? <span className="row muted" style={{ gap: 8 }}><Loader2 className="spin" size={16} /> Loading…</span>
              : hasNext ? <button className="btn btn-sm" onClick={onLoadMore}><ChevronDown /> Load more</button>
              : entries.length > 0 ? <span className="muted" style={{ fontSize: '.8rem' }}>End of collection</span> : null}
          </div>
        </>
      )}
    </div>
  );
};
