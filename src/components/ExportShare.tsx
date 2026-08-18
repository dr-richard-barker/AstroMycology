import React from 'react';
import { FileJson, Share2, Database, ExternalLink, Table } from 'lucide-react';
import type { Ec5Entry, CollectionStats } from '../types';
import { EC5_BASE, projectUrl, projectName } from '../api/epicollect';
import { allResults } from '../lib/cose-results';

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
        uuid: e.uuid, project: e.project, title: e.title, species: e.species,
        createdAt: e.createdAt, uploadedAt: e.uploadedAt,
        photoUrl: e.photoUrl, gps: e.gps, fields: e.fields, marker: e.marker,
        analysisResults: byRef.get(`${e.project}::${e.uuid}`) || [],
      })),
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `astromycology_${label.toLowerCase().replace(/\s+/g, '-')}_manifest.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const shareUrl = projectSlugs.length === 1
    ? `${location.origin}${location.pathname}?project=${encodeURIComponent(projectSlugs[0])}`
    : `${location.origin}${location.pathname}`;

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Export &amp; share</div>
        <h1>Take the dataset with you</h1>
        <p>Raw data + photos live in Epicollect5 and are exportable there; this app adds a manifest that folds in the calibration-marker analysis you’ve computed. Currently viewing: <strong>{label}</strong>.</p>
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
          <p className="muted" style={{ fontSize: '.85rem' }}>The loaded entries with metadata, GPS, photo URLs, project, and any calibration-marker analysis (scale, rotation, colour chips) you’ve computed.</p>
          <button className="btn btn-primary btn-sm" onClick={downloadManifest} disabled={!entries.length}><FileJson /> Download manifest.json</button>
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
