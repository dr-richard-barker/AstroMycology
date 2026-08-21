import React from 'react';
import { FileJson, Share2, Database, ExternalLink, Table, Thermometer } from 'lucide-react';
import type { Ec5Entry, CollectionStats } from '../types';
import { EC5_BASE, projectUrl, projectName } from '../api/epicollect';
import { allResults } from '../lib/cose-results';

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadText(filename: string, mime: string, text: string) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

interface Props {
  entries: Ec5Entry[];
  label: string;
  stats: CollectionStats;
}

export const ExportShare: React.FC<Props> = ({ entries, label, stats }) => {
  const projectSlugs = [...new Set(entries.map(e => e.project))];

  const downloadManifest = async () => {
    const byRef = new Map<string, any[]>();
    try { for (const r of await allResults()) { const a = byRef.get(r.ref) || []; a.push(r); byRef.set(r.ref, a); } } catch { /* no results */ }
    const manifest = {
      generatedAt: new Date().toISOString(),
      view: label,
      projects: projectSlugs,
      count: entries.length,
      entries: entries.map(e => ({
        uuid: e.uuid, project: e.project, title: e.title, species: e.species, mediaKind: e.mediaKind,
        createdAt: e.createdAt, uploadedAt: e.uploadedAt,
        photoUrl: e.photoUrl, scanUrl: e.scanUrl, gps: e.gps, fields: e.fields,
        marker: e.marker, contamination: e.contamination, thermal: e.thermal, displayRotation: e.displayRotation,
        analysisResults: byRef.get(`${e.project}::${e.uuid}`) || [],
      })),
    };
    downloadText(`astromycology_${label.toLowerCase().replace(/\s+/g, '-')}_manifest.json`, 'application/json', JSON.stringify(manifest, null, 2));
  };

  // A flat CSV of the two analyses that live only in this browser until
  // exported: OCR'd thermal readings (incl. manual corrections) and computed
  // 3D-scan volumes. Anything not yet run just leaves those columns blank.
  const downloadAnalysisCsv = async () => {
    const volumeByRef = new Map<string, Record<string, string | number>>();
    try { for (const r of await allResults()) if (r.tool === 'scan3d-viewer') volumeByRef.set(r.ref, r.metrics); } catch { /* no results */ }
    const num = (v: unknown) => { const n = parseFloat(String(v ?? '')); return Number.isNaN(n) ? '' : n; };

    const treatmentOf = (e: Ec5Entry) => e.fields.find(f => f.name.toLowerCase() === 'treatment')?.value || '';
    const cols = [
      'filename', 'project', 'species', 'treatment', 'media_kind',
      'thermal_min_c', 'thermal_max_c', 'thermal_confidence', 'thermal_overridden',
      'volume_cm3', 'dimensions_mm', 'surface_area_cm2', 'watertight',
    ];
    const rows = entries
      .filter(e => e.mediaKind === 'thermal' || e.scanUrl)
      .map(e => {
        const vol = volumeByRef.get(`${e.project}::${e.uuid}`);
        return [
          e.title, projectName(e.project), e.species || '', treatmentOf(e), e.mediaKind || 'photo',
          e.thermal?.minC ?? '', e.thermal?.maxC ?? '', e.thermal?.confidence ?? '', e.thermal?.overridden ? 'yes' : '',
          vol ? num(vol['Volume']) : '', vol?.['Dimensions'] ?? '', vol ? num(vol['Surface area']) : '', vol?.['Watertight'] ?? '',
        ];
      });
    const csv = [cols.join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\n');
    downloadText(`astromycology_${label.toLowerCase().replace(/\s+/g, '-')}_thermal-volume.csv`, 'text/csv', csv);
  };

  const shareUrl = projectSlugs.length === 1
    ? `${location.origin}${location.pathname}?project=${encodeURIComponent(projectSlugs[0])}`
    : `${location.origin}${location.pathname}`;

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Export &amp; share</div>
        <h1>Take the dataset with you</h1>
        <p>Raw data + photos live in Epicollect5 and are exportable there; this app adds a manifest that folds in every analysis you've computed — calibration marker, contamination screen, thermal OCR, 3D-scan volume. <strong>All of that only lives in this browser's local storage</strong> until you export it — download regularly if you've corrected any OCR/volume readings, especially before clearing browser data or switching devices. Currently viewing: <strong>{label}</strong>.</p>
      </div>

      <div className="stat-row" style={{ marginBottom: 18 }}>
        <div className="stat"><div className="k">Loaded</div><div className="v">{stats.total}<span style={{ fontSize: '.8rem' }}> / {stats.totalAvailable}</span></div></div>
        <div className="stat"><div className="k">With photo</div><div className="v accent">{stats.withPhoto}</div></div>
        <div className="stat"><div className="k">Analyzed</div><div className="v teal">{stats.analyzed}</div></div>
        <div className="stat"><div className="k">Projects</div><div className="v">{projectSlugs.length}</div></div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
        <div className="card pad">
          <div className="card-title"><FileJson /> Manifest + analysis (JSON)</div>
          <p className="muted" style={{ fontSize: '.85rem' }}>The loaded entries with metadata, GPS, photo/scan URLs, project, and every computed analysis: calibration marker, contamination screen, thermal OCR reading, and 3D-scan results.</p>
          <button className="btn btn-primary btn-sm" onClick={downloadManifest} disabled={!entries.length}><FileJson /> Download manifest.json</button>
        </div>

        <div className="card pad">
          <div className="card-title"><Thermometer /> Thermal &amp; volume (CSV)</div>
          <p className="muted" style={{ fontSize: '.85rem' }}>One row per thermal photo or 3D scan: OCR'd min/max °C (and whether you corrected it), computed volume/dimensions — ready to open in a spreadsheet or re-plot elsewhere.</p>
          <button className="btn btn-primary btn-sm" onClick={downloadAnalysisCsv} disabled={!entries.length}><Table /> Download thermal-volume.csv</button>
        </div>

        <div className="card pad">
          <div className="card-title"><Table /> Raw data (Epicollect5)</div>
          <p className="muted" style={{ fontSize: '.85rem' }}>The authoritative datasets — entries and media — straight from each Epicollect5 project.</p>
          <div className="grid" style={{ gap: 6 }}>
            {projectSlugs.map(s => (
              <div key={s} className="row wrap" style={{ gap: 6, justifyContent: 'space-between' }}>
                <span style={{ fontSize: '.82rem' }}>{projectName(s)}</span>
                <span className="row" style={{ gap: 6 }}>
                  <a className="btn btn-sm" href={`${EC5_BASE}/api/export/entries/${s}?format=csv`} target="_blank" rel="noreferrer"><Table size={13} /> CSV</a>
                  <a className="btn btn-sm btn-ghost" href={projectUrl(s)} target="_blank" rel="noreferrer"><ExternalLink size={13} /></a>
                </span>
              </div>
            ))}
            {!projectSlugs.length && <span className="muted" style={{ fontSize: '.82rem' }}>Load a project to see its export links.</span>}
          </div>
        </div>

        <div className="card pad">
          <div className="card-title"><Share2 /> Share this view</div>
          <p className="muted" style={{ fontSize: '.85rem' }}>A link that opens this database on the same {projectSlugs.length === 1 ? 'project' : 'view'}.</p>
          <div className="row" style={{ gap: 6, fontSize: '.78rem' }}><Database size={15} /> <span className="mono" style={{ wordBreak: 'break-all' }}>{shareUrl}</span></div>
        </div>
      </div>
    </div>
  );
};
