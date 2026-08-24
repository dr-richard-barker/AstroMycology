import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, Scale, RotateCw, Sparkles, Save, Edit3, Loader2, Eraser, MapPin, Camera, ExternalLink, LineChart, Film, Box, Download, EyeOff, Trash2, Biohazard, ScanSearch, Thermometer, ScanText } from 'lucide-react';
import type { Ec5Entry, MarkerAnalysis, Pt, RotationDeg, ThermalReading } from '../types';
import { urlToImageData } from '../lib/capture';
import { analyzeMarker, analyzeFromQuad } from '../lib/detect';
import { analyzeContamination, type ContaminationResult, type ContaminationVerdict } from '../lib/contamination';
import { extractThermalReading } from '../lib/thermal';
import { saveMarker, clearMarker, saveContamination, saveThermalReading, saveRotation } from '../api/epicollect';
import { getResults, type AnalysisResult } from '../lib/cose-results';
import { QuadAnnotator } from './QuadAnnotator';
import { RotatableImg } from './RotatableImg';

interface Props {
  entry: Ec5Entry;
  onMarkerChanged: (uuid: string, marker: MarkerAnalysis | null) => void;
  onContaminationChanged?: (uuid: string, contamination: ContaminationResult | null) => void;
  onThermalChanged?: (uuid: string, thermal: ThermalReading | null) => void;
  onOpenTool: (id: string, imageUrl: string, ref: string, name?: string) => void;
  onHide?: () => void;    // admin-only: exclude this image
  onDelete?: () => void;  // delete a shared cloud upload (owner or admin)
  deleteIsOwn?: boolean;  // true if the current user owns this upload
}

const VERDICT_LABEL: Record<ContaminationVerdict, string> = {
  clean: 'Looks clean', suspect: 'Suspect — check visually', contaminated: 'Likely contaminated', inconclusive: 'Inconclusive (too little of the jar in frame)',
};
const VERDICT_CLASS: Record<ContaminationVerdict, string> = { clean: 'pos', suspect: 'neg', contaminated: 'neg', inconclusive: 'info' };
const BAR_LABEL: Record<keyof ContaminationResult['breakdown'], string> = {
  pale: 'White / cream (healthy)', green: 'Green mold (hue)', greyMold: 'Grey/sooty mold', dark: 'Dark / black spots',
  pinkRed: 'Pink / red patches', goldDroplet: 'Gold droplets (normal exudate)', background: 'Background (unclassified)',
};
const BAR_COLOR: Record<keyof ContaminationResult['breakdown'], string> = {
  pale: 'var(--muted)', green: 'var(--danger)', greyMold: '#8a8f98', dark: '#555', pinkRed: '#c0527a', goldDroplet: 'var(--accent2)', background: 'var(--line)',
};

const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const DEFAULT_QUAD: [Pt, Pt, Pt, Pt] = [
  { x: 0.35, y: 0.35 }, { x: 0.65, y: 0.35 }, { x: 0.65, y: 0.6 }, { x: 0.35, y: 0.6 },
];

export const MarkerInspector: React.FC<Props> = ({ entry, onMarkerChanged, onContaminationChanged, onThermalChanged, onOpenTool, onHide, onDelete, deleteIsOwn }) => {
  const slug = entry.project;
  const ref = `${entry.project}::${entry.uuid}`;

  // Analysis results written back by the sibling tools (shared same-origin store).
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const refreshResults = useCallback(() => { getResults(ref).then(setResults).catch(() => {}); }, [ref]);
  useEffect(() => {
    refreshResults();
    const on = () => refreshResults(); // pick up results when returning from a tool tab
    window.addEventListener('focus', on);
    return () => window.removeEventListener('focus', on);
  }, [refreshResults]);
  const [imgData, setImgData] = useState<ImageData | null>(null);
  const [marker, setMarker] = useState<MarkerAnalysis | null>(entry.marker);
  const [contam, setContam] = useState<ContaminationResult | null>(entry.contamination ?? null);
  const [contamBusy, setContamBusy] = useState(false);
  const [rotation, setRotation] = useState<RotationDeg>(entry.displayRotation ?? 0);
  const [thermal, setThermal] = useState<ThermalReading | null>(entry.thermal ?? null);
  const [thermalBusy, setThermalBusy] = useState(false);
  const [thermalErr, setThermalErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [annotate, setAnnotate] = useState(false);
  const [quad, setQuad] = useState<[Pt, Pt, Pt, Pt]>(DEFAULT_QUAD);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [videoErr, setVideoErr] = useState(false);
  const dims = useRef<{ w: number; h: number }>({ w: 1, h: 1 });
  const isAvi = !!entry.videoUrl && /\.avi(\?|$)/i.test(entry.videoUrl);
  useEffect(() => { setVideoErr(false); }, [entry.uuid]);

  useEffect(() => {
    setMarker(entry.marker); setContam(entry.contamination ?? null); setAnnotate(false); setDirty(false); setImgData(null); setErr(null);
    setRotation(entry.displayRotation ?? 0); setThermal(entry.thermal ?? null); setThermalErr(null);
    if (!entry.photoUrl) return;
    let alive = true;
    urlToImageData(entry.photoUrl).then(id => {
      if (!alive) return;
      dims.current = { w: id.width, h: id.height };
      setImgData(id);
      if (entry.marker?.corners) setQuad(cornersToFrac(entry.marker.corners, id.width, id.height));
    }).catch(() => alive && setErr('Could not load the image for analysis.'));
    return () => { alive = false; };
  }, [entry.uuid]);

  const runDetect = async (skipGeometric = false) => {
    if (!imgData) return;
    setBusy('detect');
    try {
      const m = await analyzeMarker(imgData, { skipGeometric });
      setMarker(m); setDirty(true);
      if (m.corners) setQuad(cornersToFrac(m.corners, dims.current.w, dims.current.h));
    } finally { setBusy(null); }
  };

  const recomputeFromQuad = () => {
    if (!imgData) return;
    const px = quad.map(p => ({ x: p.x * dims.current.w, y: p.y * dims.current.h })) as [Pt, Pt, Pt, Pt];
    setMarker(analyzeFromQuad(imgData, px)); setDirty(true);
  };

  const save = () => {
    if (!marker) return;
    saveMarker(slug, entry.uuid, marker);
    onMarkerChanged(entry.uuid, marker);
    setDirty(false);
  };
  const clear = () => {
    clearMarker(slug, entry.uuid);
    setMarker(null); setDirty(false);
    onMarkerChanged(entry.uuid, null);
  };

  const runContamCheck = async () => {
    if (!imgData) return;
    setContamBusy(true);
    try {
      const result = analyzeContamination(imgData);
      setContam(result);
      saveContamination(slug, entry.uuid, result);
      onContaminationChanged?.(entry.uuid, result);
    } finally { setContamBusy(false); }
  };
  const overrideContam = (verdict: ContaminationVerdict) => {
    const result: ContaminationResult = {
      verdict, confidence: 1, overridden: true, analyzedAt: new Date().toISOString(),
      score: contam?.score ?? 0, coverage: contam?.coverage ?? 0,
      breakdown: contam?.breakdown ?? { pale: 0, green: 0, greyMold: 0, dark: 0, pinkRed: 0, goldDroplet: 0, background: 0 },
    };
    setContam(result);
    saveContamination(slug, entry.uuid, result);
    onContaminationChanged?.(entry.uuid, result);
  };

  const onRotate = (deg: RotationDeg) => {
    setRotation(deg);
    saveRotation(slug, entry.uuid, deg);
  };

  const runThermalOcr = async () => {
    if (!entry.photoUrl) return;
    setThermalBusy(true); setThermalErr(null);
    try {
      const reading = await extractThermalReading(entry.photoUrl);
      setThermal(reading);
      saveThermalReading(slug, entry.uuid, reading);
      onThermalChanged?.(entry.uuid, reading);
    } catch (e) {
      setThermalErr(e instanceof Error ? e.message : String(e));
    } finally { setThermalBusy(false); }
  };
  const updateThermalField = (field: 'minC' | 'maxC', raw: string) => {
    if (!thermal) return;
    const n = raw === '' ? null : parseFloat(raw);
    const next: ThermalReading = { ...thermal, [field]: Number.isNaN(n as number) ? null : n, overridden: true };
    setThermal(next);
    saveThermalReading(slug, entry.uuid, next);
    onThermalChanged?.(entry.uuid, next);
  };

  const overlayQuad = marker?.corners ? cornersToFrac(marker.corners, dims.current.w, dims.current.h) : null;

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr)', gap: 16 }}>
      {entry.scanUrl && (
        <div className="card pad">
          <div className="card-title"><Box /> 3D scan</div>
          <p className="muted" style={{ fontSize: '.86rem', marginBottom: 10 }}>This entry is a 3D scan ({entry.scanUrl.split('.').pop()?.toUpperCase()}) — open it in the 3D viewer for an orbitable render plus volume, dimensions and surface area.</p>
          <button className="btn btn-primary btn-sm" onClick={() => onOpenTool('scan3d-viewer', entry.scanUrl!, ref, entry.title)}>
            <Box size={14} /> Open 3D viewer
          </button>
        </div>
      )}
      {entry.videoUrl && (
        <div className="card pad">
          <div className="card-title"><Film /> Time-lapse video</div>
          <video controls preload="metadata" playsInline crossOrigin="anonymous"
            onError={() => setVideoErr(true)}
            style={{ display: 'block', width: '100%', borderRadius: 8, background: '#000', maxHeight: 460 }}>
            <source src={entry.videoUrl} type={isAvi ? 'video/x-msvideo' : undefined} />
          </video>
          {(videoErr || isAvi) && (
            <p className="muted" style={{ fontSize: '.8rem', marginTop: 8 }}>
              {isAvi ? 'This is an AVI file. Most browsers can’t decode AVI inline' : 'Your browser couldn’t play this video inline'} — use <strong>Download / open</strong> below to view it in a media player (e.g. VLC or QuickTime).
            </p>
          )}
          <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
            <a className="btn btn-primary btn-sm" href={entry.videoUrl} download target="_blank" rel="noreferrer"><Download size={14} /> Download / open</a>
            <a className="btn btn-sm btn-ghost" href={entry.videoUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open in new tab</a>
          </div>
        </div>
      )}
      {!entry.videoUrl && !entry.scanUrl && (<>
      <div className="card pad">
        <div className="card-title sb" style={{ justifyContent: 'space-between' }}>
          <span className="row" style={{ gap: 8 }}><Crosshair /> {annotate ? 'Place the 4 marker corners' : 'Marker analysis'}</span>
          {entry.photoUrl && (
            <button className="btn btn-sm btn-ghost" onClick={() => setAnnotate(a => !a)}><Edit3 /> {annotate ? 'Done' : 'Adjust manually'}</button>
          )}
        </div>

        {!entry.photoUrl ? (
          <p className="muted" style={{ fontSize: '.86rem' }}>This entry has no photo.</p>
        ) : annotate ? (
          <>
            <QuadAnnotator imageUrl={entry.photoUrl} quad={quad} onChange={setQuad} />
            <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
              <button className="btn btn-teal btn-sm" onClick={recomputeFromQuad}><Scale /> Compute from these corners</button>
              <span className="muted" style={{ fontSize: '.78rem' }}>Order: top-left, top-right, bottom-right, bottom-left.</span>
            </div>
          </>
        ) : (
          <div style={{ position: 'relative' }}>
            <RotatableImg src={entry.photoUrl} alt={entry.title} crossOrigin="anonymous" rotationDeg={rotation} onRotationChange={onRotate} />
            {overlayQuad && rotation === 0 && (
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 460, pointerEvents: 'none' }}>
                <polygon points={overlayQuad.map(p => `${p.x * 100},${p.y * 100}`).join(' ')} style={{ fill: 'var(--accent2)', stroke: 'var(--accent2)' }} fillOpacity={0.18} strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
            {!imgData && !err && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 460, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.25)', borderRadius: 8 }}><Loader2 className="spin" color="#fff" /></div>
            )}
          </div>
        )}
        {err && <p style={{ color: 'var(--danger)', fontSize: '.82rem', marginTop: 8 }}>{err}</p>}

        {entry.photoUrl && (
          <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={!imgData || busy === 'detect'} onClick={() => runDetect(false)}>
              {busy === 'detect' ? <Loader2 className="spin" /> : <Sparkles />} Detect marker
            </button>
            <button className="btn btn-sm btn-ghost" disabled={!imgData || busy === 'detect'} onClick={() => runDetect(true)} title="Force the ArUco decoder (for a plain ArUco target)">ArUco decoder</button>
            {dirty && <button className="btn btn-teal btn-sm" onClick={save}><Save /> Save analysis</button>}
            {marker && !dirty && <button className="btn btn-sm btn-ghost" onClick={clear} style={{ color: 'var(--danger)' }}><Eraser /> Clear</button>}
            <span className="grow" />
            <a className="btn btn-sm btn-ghost" href={entry.photoUrl} target="_blank" rel="noreferrer" title="Open full image"><ExternalLink /></a>
          </div>
        )}
      </div>

      <div className="card pad">
        <div className="card-title"><Scale /> Calibration &amp; colour</div>
        {marker?.markerFound ? (
          <>
            <div className="stat-row" style={{ marginBottom: 14 }}>
              <div className="stat"><div className="k">Scale</div><div className="v accent">{marker.pxPerMm?.toFixed(2)}<span style={{ fontSize: '.8rem' }}> px/mm</span></div></div>
              <div className="stat"><div className="k"><RotateCw size={11} style={{ verticalAlign: -1 }} /> Rotation</div><div className="v">{marker.rotationDeg?.toFixed(1)}°</div></div>
              <div className="stat"><div className="k">Corners</div><div className="v teal">{marker.cornersFound}/4</div></div>
              <div className="stat"><div className="k">Colour residual</div><div className="v">{marker.colorResidualRms?.toFixed(3)}</div></div>
            </div>
            <div className="muted" style={{ fontSize: '.78rem', marginBottom: 8 }}>Detector: <span className="mono">{marker.detector}</span> · 15-chip AstroBotany reference (measured vs. standard) · cached in your browser</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(84px,1fr))', gap: 8 }}>
              {marker.colorChips.map((c, i) => (
                <div key={i} className="mono" style={{ fontSize: '.66rem', textAlign: 'center' }}>
                  <div style={{ display: 'flex', height: 26, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--line)' }}>
                    <div style={{ flex: 1, background: rgb(c.measured) }} title={`measured ${rgb(c.measured)}`} />
                    <div style={{ flex: 1, background: rgb(c.standard) }} title={`standard ${rgb(c.standard)}`} />
                  </div>
                  <div className="muted" style={{ marginTop: 3 }}>{c.name}</div>
                </div>
              ))}
            </div>
          </>
        ) : marker ? (
          <p className="muted" style={{ fontSize: '.86rem' }}>No marker detected ({marker.cornersFound}/4 corners). Use <strong>Adjust manually</strong> to place the four corners, then compute the scale.</p>
        ) : (
          <p className="muted" style={{ fontSize: '.86rem' }}>Run <strong>Detect marker</strong> to measure scale and colour from the AstroBotany card in this photo. Results are cached locally and included in exports.</p>
        )}
      </div>

      {entry.mediaKind !== 'thermal' && (
      <div className="card pad">
        <div className="card-title sb" style={{ justifyContent: 'space-between' }}>
          <span className="row" style={{ gap: 8 }}><Biohazard /> Contamination screen</span>
          {entry.photoUrl && (
            <button className="btn btn-sm btn-ghost" disabled={!imgData || contamBusy} onClick={runContamCheck}>
              {contamBusy ? <Loader2 className="spin" /> : <ScanSearch size={14} />} {contam ? 'Re-check' : 'Run check'}
            </button>
          )}
        </div>
        {!entry.photoUrl ? (
          <p className="muted" style={{ fontSize: '.86rem' }}>This entry has no photo.</p>
        ) : !contam ? (
          <p className="muted" style={{ fontSize: '.86rem' }}>Run a check to screen this photo for likely mold/contamination by colour (white/cream = healthy; grey, black, green or pink patches = flagged). A first-pass heuristic, not a diagnosis — always verify visually.</p>
        ) : (
          <>
            <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <span className={`badge ${VERDICT_CLASS[contam.verdict]}`} style={contam.verdict === 'contaminated' ? { background: 'color-mix(in srgb, var(--danger) 18%, transparent)', color: 'var(--danger)' } : undefined}>{VERDICT_LABEL[contam.verdict]}</span>
              {contam.overridden && <span className="chip tag" style={{ fontSize: '.7rem' }}>manually corrected</span>}
              {contam.verdict !== 'inconclusive' && !contam.overridden && <span className="muted" style={{ fontSize: '.72rem' }}>confidence {(contam.confidence * 100).toFixed(0)}%</span>}
            </div>
            {!contam.overridden && (
              <div style={{ display: 'grid', gap: 5, marginBottom: 4 }}>
                {(Object.keys(contam.breakdown) as (keyof ContaminationResult['breakdown'])[]).map(k => (
                  <div key={k} title={`${BAR_LABEL[k]}: ${(contam.breakdown[k] * 100).toFixed(0)}%`}>
                    <div className="row sb" style={{ justifyContent: 'space-between', fontSize: '.72rem', marginBottom: 2 }}>
                      <span className="muted">{BAR_LABEL[k]}</span>
                      <span className="mono muted">{(contam.breakdown[k] * 100).toFixed(0)}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}>
                      <div style={{ width: `${contam.breakdown[k] * 100}%`, height: '100%', background: BAR_COLOR[k], borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
              {contam.verdict !== 'clean' && <button className="btn btn-sm btn-ghost" onClick={() => overrideContam('clean')}>Mark clean</button>}
              {contam.verdict !== 'contaminated' && <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => overrideContam('contaminated')}>Mark contaminated</button>}
            </div>
            <p className="muted" style={{ fontSize: '.72rem', marginTop: 8 }}>Colour heuristic seeded from this database's own photos — it will misfire on lighting it hasn't seen (blue LED, green screens, etc). Corrections are saved locally and are the seed for a real classifier once there's enough labeled data.</p>
          </>
        )}
      </div>
      )}

      {entry.mediaKind === 'thermal' && (
      <div className="card pad">
        <div className="card-title sb" style={{ justifyContent: 'space-between' }}>
          <span className="row" style={{ gap: 8 }}><Thermometer /> Thermal reading</span>
          {entry.photoUrl && (
            <button className="btn btn-sm btn-ghost" disabled={thermalBusy} onClick={runThermalOcr}>
              {thermalBusy ? <Loader2 className="spin" /> : <ScanText size={14} />} {thermal ? 'Re-read' : 'Read with OCR'}
            </button>
          )}
        </div>
        {thermalErr && <p style={{ color: 'var(--danger)', fontSize: '.82rem', marginBottom: 8 }}>{thermalErr}</p>}
        {!thermal ? (
          <p className="muted" style={{ fontSize: '.86rem' }}>Reads the temperature range straight off the colorbar printed in the image — tries all 4 rotations and keeps the clearest read. First-pass OCR, not a certified reading — check the numbers against what's visibly printed.</p>
        ) : (
          <>
            <div className="stat-row" style={{ marginBottom: 10 }}>
              <div className="stat">
                <div className="k">Min</div>
                <div className="v accent">
                  <input type="number" step="0.1" value={thermal.minC ?? ''} onChange={e => updateThermalField('minC', e.target.value)}
                    style={{ width: 64, font: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid var(--line)', borderRadius: 6, padding: '2px 4px' }} />
                  <span style={{ fontSize: '.8rem' }}> °C</span>
                </div>
              </div>
              <div className="stat">
                <div className="k">Max</div>
                <div className="v accent">
                  <input type="number" step="0.1" value={thermal.maxC ?? ''} onChange={e => updateThermalField('maxC', e.target.value)}
                    style={{ width: 64, font: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid var(--line)', borderRadius: 6, padding: '2px 4px' }} />
                  <span style={{ fontSize: '.8rem' }}> °C</span>
                </div>
              </div>
            </div>
            {thermal.overridden
              ? <span className="chip tag" style={{ fontSize: '.7rem' }}>manually corrected</span>
              : <span className="muted" style={{ fontSize: '.72rem' }}>OCR confidence {thermal.confidence}% · read at {thermal.rotationDeg}° rotation</span>}
            <p className="muted" style={{ fontSize: '.72rem', marginTop: 8 }}>Edit the values above if the OCR misread them — corrections are saved and included in exports.</p>
          </>
        )}
      </div>
      )}

      {results.length > 0 && (
        <div className="card pad">
          <div className="card-title"><LineChart /> Analysis results</div>
          {results.map(r => (
            <div key={r.id} style={{ marginBottom: 12 }}>
              <div className="row sb" style={{ justifyContent: 'space-between' }}>
                <strong style={{ fontSize: '.86rem' }}>{r.toolName}</strong>
                <span className="muted" style={{ fontSize: '.72rem' }}>{new Date(r.generatedAt).toLocaleString()}</span>
              </div>
              <dl className="kv" style={{ marginTop: 4 }}>
                {Object.entries(r.metrics).map(([k, v]) => (<React.Fragment key={k}><dt>{k}</dt><dd>{String(v)}</dd></React.Fragment>))}
              </dl>
            </div>
          ))}
          <div className="muted" style={{ fontSize: '.72rem' }}>Written back by the analysis tools · shared in your browser · included in exports.</div>
        </div>
      )}
      </>)}

      <div className="card pad">
        <div className="card-title sb" style={{ justifyContent: 'space-between' }}>
          <span className="row" style={{ gap: 8 }}><Camera /> Entry metadata</span>
          <span className="row" style={{ gap: 6 }}>
            {onDelete && (
              <button className="btn btn-xs btn-ghost" style={{ color: 'var(--danger)' }}
                title={deleteIsOwn ? 'Permanently delete your upload' : 'Permanently delete this upload (admin)'}
                onClick={() => { if (confirm(deleteIsOwn ? 'Permanently delete your upload? This cannot be undone.' : 'Permanently delete this upload for everyone? This cannot be undone.')) onDelete(); }}>
                <Trash2 size={12} /> {deleteIsOwn ? 'Delete my upload' : 'Delete'}
              </button>
            )}
            {onHide && (
              <button className="btn btn-xs btn-ghost" style={{ color: 'var(--danger)' }} title="Exclude this image from the database (admin)"
                onClick={() => { if (confirm('Hide this image from all users? You can unhide it from the Admin tab.')) onHide(); }}>
                <EyeOff size={12} /> Hide
              </button>
            )}
          </span>
        </div>
        <dl className="kv">
          {entry.species && <><dt>Species</dt><dd>{entry.species}</dd></>}
          {entry.fields.filter(f => f.name.toLowerCase() !== 'species').map((f, i) => (
            <React.Fragment key={i}><dt>{f.name}</dt><dd>{f.value}</dd></React.Fragment>
          ))}
          {entry.gps && <><dt><MapPin size={11} style={{ verticalAlign: -1 }} /> GPS</dt><dd>{entry.gps.lat.toFixed(5)}, {entry.gps.lng.toFixed(5)}</dd></>}
          {entry.createdAt && <><dt>Recorded</dt><dd>{new Date(entry.createdAt).toLocaleString()}</dd></>}
          {entry.uploadedAt && <><dt>Uploaded</dt><dd>{new Date(entry.uploadedAt).toLocaleString()}</dd></>}
          <dt>Entry ID</dt><dd style={{ fontSize: '.72rem' }}>{entry.uuid}</dd>
        </dl>
      </div>
    </div>
  );
};

function cornersToFrac(corners: { x: number; y: number }[], w: number, h: number): [Pt, Pt, Pt, Pt] {
  const f = corners.map(p => ({ x: p.x / w, y: p.y / h }));
  return [f[0], f[1], f[2], f[3]] as [Pt, Pt, Pt, Pt];
}
