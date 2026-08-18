import React, { useRef, useState } from 'react';
import { Smartphone, ExternalLink, FolderCog, Plus, Trash2, Eye, Camera, MapPin, UploadCloud, Apple, Play, ImagePlus, Github, Loader2, FileArchive, HardDrive, Download, FolderSearch, Table, Sparkles, Cloud, Users } from 'lucide-react';
import { addProject, removeProject, addGithubSource, addLocalSource, isBuiltin, isGithub, isLocal, projectUrl, type ProjectRef } from '../api/epicollect';
import { parseGithub, defaultName, fetchGithubImages, parseGithubRepo, scanRepo, type RepoScan } from '../api/github';
import { processUpload } from '../lib/localsource';
import { authConfigured } from '../lib/supabase';
import { uploadToCloud, CLOUD_SLUG, isCloud } from '../lib/uploads';

interface Props {
  projects: ProjectRef[];
  active: string;
  onChangeActive: (slug: string) => void;
  onProjectsChange: () => void;
}

const TEMPLATE_CSV = `filename,species,media_kind,treatment,captured,latitude,longitude,notes
example_001.jpg,Agaricus bisporus,photo,substrate A,2026-08-01T08:30:00,34.61988,135.49036,"day 3, fruiting"
example_002_thermal.jpg,Agaricus bisporus,thermal,substrate A,2026-08-01T08:31:00,,,"paired with example_001"
example_003.ply,Pleurotus ostreatus,scan3d,substrate B,2026-08-02T10:00:00,,,"structured-light scan, mm units"
`;

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'metadata.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

export const Contribute: React.FC<Props> = ({ projects, active, onChangeActive, onProjectsChange }) => {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [ghUrl, setGhUrl] = useState('');
  const [ghBusy, setGhBusy] = useState(false);
  const [ghMsg, setGhMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  const [upMsg, setUpMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [upProg, setUpProg] = useState<{ done: number; total: number } | null>(null);
  const [hot, setHot] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Shared cloud upload
  const [cloudFiles, setCloudFiles] = useState<File[]>([]);
  const [cloudSpecies, setCloudSpecies] = useState('');
  const [cloudNotes, setCloudNotes] = useState('');
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudProg, setCloudProg] = useState<{ done: number; total: number } | null>(null);
  const [cloudMsg, setCloudMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const doCloudUpload = async () => {
    if (!cloudFiles.length) return;
    setCloudBusy(true); setCloudMsg(null); setCloudProg({ done: 0, total: cloudFiles.length });
    try {
      const n = await uploadToCloud(cloudFiles, { species: cloudSpecies || undefined, notes: cloudNotes || undefined }, (done, total) => setCloudProg({ done, total }));
      onProjectsChange();
      if (n > 0) onChangeActive(CLOUD_SLUG);
      setCloudMsg({ ok: n > 0, text: n === cloudFiles.length ? `Shared ${n} image${n === 1 ? '' : 's'} to the community database.` : `Shared ${n} of ${cloudFiles.length} (some failed — check console).` });
      setCloudFiles([]); setCloudSpecies(''); setCloudNotes('');
    } catch (e) {
      setCloudMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setCloudBusy(false); setCloudProg(null); }
  };
  // Repo scan
  const [repoInput, setRepoInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<RepoScan | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [attach, setAttach] = useState<Set<string>>(new Set());
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const runScan = async () => {
    const t = parseGithubRepo(repoInput);
    if (!t) { setScanMsg({ ok: false, text: 'Not a GitHub repo URL (e.g. github.com/owner/repo).' }); return; }
    setScanning(true); setScanMsg(null); setScan(null);
    try {
      const r = await scanRepo(t.owner, t.repo);
      setScan(r);
      setSel(new Set(r.folders.filter(f => !f.derived).map(f => f.path)));
      setAttach(new Set(r.folders.filter(f => f.suggestedMeta && !f.derived).map(f => f.path)));
      if (!r.folders.length) setScanMsg({ ok: false, text: 'No image folders (≥3 images) found in this repo.' });
    } catch (e) {
      setScanMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setScanning(false); }
  };

  const addFolders = (folders: RepoScan['folders'], useMeta: (f: RepoScan['folders'][number]) => boolean, note: string) => {
    if (!scan) return;
    let first = '', n = 0;
    for (const f of folders) {
      const last = f.path.split('/').filter(Boolean).pop() || scan.repo;
      const ref = addGithubSource(
        { owner: scan.owner, repo: scan.repo, ref: scan.branch, path: f.path },
        `${scan.repo} · ${last}`, useMeta(f) ? f.suggestedMeta?.rawUrl : undefined,
      );
      if (!first) first = ref.slug; n++;
    }
    onProjectsChange();
    if (first) onChangeActive(first);
    setScanMsg({ ok: true, text: `Added ${n} source(s) from ${scan.repo}${note}.` });
    setScan(null);
  };
  const addScanned = () => scan && addFolders(scan.folders.filter(f => sel.has(f.path)), f => attach.has(f.path), '');
  // One-click: the best specimen folders (skip derived plots) + their data.
  const addBest = () => scan && addFolders(scan.folders.filter(f => !f.derived), () => true, ' (best pairing — skipped derived/plot folders)');
  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const n = new Set(set); n.has(key) ? n.delete(key) : n.add(key); setter(n);
  };

  const doUpload = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setUpBusy(true); setUpMsg(null); setUpProg({ done: 0, total: 0 });
    try {
      const res = await processUpload(arr, undefined, (done, total) => setUpProg({ done, total }));
      addLocalSource(res.id, res.name);
      onProjectsChange();
      onChangeActive(res.slug);
      setUpMsg({ ok: true, text: `Prepared ${res.count} images${res.skipped ? ` (${res.skipped} skipped)` : ''} into “${res.name}”.` });
    } catch (e) {
      setUpMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setUpBusy(false); setUpProg(null); }
  };

  const add = () => {
    if (!slug.trim()) return;
    addProject(slug, name);
    setSlug(''); setName('');
    onProjectsChange();
  };
  const remove = (s: string) => { removeProject(s); onProjectsChange(); };

  const addGithub = async () => {
    const t = parseGithub(ghUrl);
    if (!t) { setGhMsg({ ok: false, text: 'Not a GitHub folder URL. Use e.g. https://github.com/owner/repo/tree/main/path' }); return; }
    setGhBusy(true); setGhMsg(null);
    try {
      const files = await fetchGithubImages(t);            // validate + warm the cache
      if (!files.length) { setGhMsg({ ok: false, text: 'No images found in that folder.' }); return; }
      const ref = addGithubSource(t, defaultName(t));
      onProjectsChange();
      onChangeActive(ref.slug);
      setGhUrl('');
      setGhMsg({ ok: true, text: `Added ${files.length} images from ${ref.name}.` });
    } catch (e) {
      setGhMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setGhBusy(false); }
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="page-head">
        <div className="eyebrow">Contribute</div>
        <h1>Sources &amp; contributions</h1>
        <p>This database pulls live from free <a href="https://five.epicollect.net" target="_blank" rel="noreferrer">Epicollect5</a> projects and public <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a> image folders. Add any source, switch between them, or view them all together.</p>
      </div>

      <div className="grid" style={{ gap: 16 }}>
        {/* Share to the shared cloud database (only when login is configured) */}
        {authConfigured && (
          <div className="card pad" style={{ borderColor: 'var(--accent2)' }}>
            <div className="card-title"><Cloud /> Share images to the community database</div>
            <p className="muted" style={{ fontSize: '.85rem', marginTop: -4, marginBottom: 12 }}>
              Upload your calibrated photos to the shared collection — <Users size={12} style={{ verticalAlign: -1 }} /> everyone signed in can see them, marker analysis runs in each viewer’s browser, and an admin can hide or remove any of them. Images are compressed here before upload.
            </p>
            <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <label className="btn btn-sm">
                <ImagePlus size={14} /> Choose images
                <input type="file" accept="image/*" multiple hidden disabled={cloudBusy}
                  onChange={e => { setCloudFiles(Array.from(e.target.files || [])); setCloudMsg(null); }} />
              </label>
              <span className="muted" style={{ fontSize: '.82rem' }}>{cloudFiles.length ? `${cloudFiles.length} selected` : 'no files selected'}</span>
            </div>
            <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
              <input className="input" style={{ flex: '1 1 200px' }} placeholder="Species / cultivar (optional)" value={cloudSpecies} onChange={e => setCloudSpecies(e.target.value)} disabled={cloudBusy} />
              <input className="input" style={{ flex: '2 1 260px' }} placeholder="Notes (optional)" value={cloudNotes} onChange={e => setCloudNotes(e.target.value)} disabled={cloudBusy} />
            </div>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <button className="btn btn-teal btn-sm" disabled={!cloudFiles.length || cloudBusy} onClick={doCloudUpload}>
                {cloudBusy ? <Loader2 className="spin" size={14} /> : <UploadCloud size={14} />} {cloudBusy ? 'Uploading…' : 'Upload to shared database'}
              </button>
              {cloudProg && <span className="muted" style={{ fontSize: '.82rem' }}>{cloudProg.done}/{cloudProg.total}</span>}
            </div>
            {cloudMsg && <p style={{ fontSize: '.82rem', marginTop: 8, color: cloudMsg.ok ? 'var(--accent2)' : 'var(--danger)' }}>{cloudMsg.text}</p>}
          </div>
        )}
        {/* Upload a zip / images */}
        <div className="card pad">
          <div className="card-title"><FileArchive /> Upload images or a .zip</div>
          <p className="muted" style={{ fontSize: '.82rem', marginTop: -6, marginBottom: 10 }}>
            Drop a <span className="mono">.zip</span> of images (e.g. downloaded from a Google Drive folder) or pick image files — <span className="mono">.heic</span>/<span className="mono">.heif</span> included. They’re unzipped and prepared <strong>in your browser</strong> — EXIF (GPS, time, device) is read, HEIC is decoded to a displayable JPEG, each image is compressed, and any <span className="mono">metadata.csv</span>/<span className="mono">.json</span> inside is joined by filename (a <span className="mono">media_kind</span> column of <span className="mono">photo</span>/<span className="mono">thermal</span> tags RGB-thermal shots). Saved locally (IndexedDB) as a source you can analyse; nothing is uploaded to a server.
          </p>
          <div style={{ marginBottom: 10 }}>
            <button className="btn btn-sm btn-ghost" onClick={downloadTemplate}><Download size={14} /> Download metadata.csv template</button>
          </div>
          <div
            className={`dropzone ${hot ? 'hot' : ''}`}
            onDragOver={e => { e.preventDefault(); setHot(true); }}
            onDragLeave={() => setHot(false)}
            onDrop={e => { e.preventDefault(); setHot(false); if (e.dataTransfer.files.length) doUpload(e.dataTransfer.files); }}
          >
            {upBusy ? (
              <div className="row" style={{ justifyContent: 'center', gap: 8 }}><Loader2 className="spin" /> Preparing{upProg && upProg.total ? ` ${upProg.done}/${upProg.total}` : ''}…</div>
            ) : (
              <>
                <UploadCloud />
                <p style={{ margin: '10px 0 6px', fontWeight: 600 }}>Drop a .zip or images (incl. HEIC) here, or</p>
                <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()}><UploadCloud /> Choose files</button>
                <input ref={fileRef} type="file" accept=".zip,application/zip,image/*,.heic,.heif" multiple hidden
                  onChange={e => e.target.files && doUpload(e.target.files)} />
              </>
            )}
          </div>
          {upMsg && <div style={{ marginTop: 8, fontSize: '.82rem', color: upMsg.ok ? 'var(--ok)' : 'var(--danger)' }}>{upMsg.text}</div>}
        </div>

        {/* Scan a whole repo */}
        <div className="card pad">
          <div className="card-title"><FolderSearch /> Scan a GitHub repository</div>
          <p className="muted" style={{ fontSize: '.82rem', marginTop: -6, marginBottom: 10 }}>
            Paste a repo link and the app walks the whole tree (one API call), finds the image folders and any processed-data files (CSV/JSON), and suggests how to pull them in — pairing each image folder with its matching data file as metadata. Works on any branch.
          </p>
          <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 320px', marginBottom: 0 }}><label>GitHub repository URL</label>
              <input className="input" placeholder="https://github.com/dr-richard-barker/Hydra1-Orbital-Greenhouse"
                value={repoInput} onChange={e => setRepoInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && runScan()} />
            </div>
            <button className="btn btn-primary" disabled={scanning || !repoInput.trim()} onClick={runScan}>
              {scanning ? <Loader2 className="spin" size={16} /> : <FolderSearch size={16} />} Scan
            </button>
          </div>
          {scanMsg && <div style={{ marginTop: 8, fontSize: '.82rem', color: scanMsg.ok ? 'var(--ok)' : 'var(--danger)' }}>{scanMsg.text}</div>}

          {scan && scan.folders.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="muted" style={{ fontSize: '.78rem', marginBottom: 8 }}>
                <span className="mono">{scan.owner}/{scan.repo}</span> @ <span className="mono">{scan.branch}</span> · {scan.totalImages} images · {scan.folders.length} image folders · {scan.dataFiles.length} data files
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data">
                  <thead><tr><th style={{ width: 30 }}></th><th>Image folder</th><th style={{ textAlign: 'right' }}>Images</th><th style={{ textAlign: 'right' }}>Size</th><th>Metadata (auto-detected)</th></tr></thead>
                  <tbody>
                    {scan.folders.map(f => (
                      <tr key={f.path} style={{ opacity: f.derived ? 0.5 : 1 }}>
                        <td><input type="checkbox" checked={sel.has(f.path)} onChange={() => toggle(sel, f.path, setSel)} /></td>
                        <td><span className="mono" style={{ fontSize: '.78rem' }}>{f.path}</span> {f.derived && <span className="chip tag" style={{ fontSize: '.62rem' }}>derived</span>}</td>
                        <td style={{ textAlign: 'right' }} className="mono">{f.count}</td>
                        <td style={{ textAlign: 'right' }} className="mono">{(f.bytes / 1e6).toFixed(0)} MB</td>
                        <td>
                          {f.suggestedMeta ? (
                            <label className="row" style={{ gap: 6, fontSize: '.78rem', cursor: 'pointer' }}>
                              <input type="checkbox" checked={attach.has(f.path)} onChange={() => toggle(attach, f.path, setAttach)} />
                              <Table size={12} /> <span className="mono">{f.suggestedMeta.name}</span>
                            </label>
                          ) : <span className="muted" style={{ fontSize: '.76rem' }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={addBest} title="Add the specimen image folders (skipping derived plots/histograms) with their matching data files attached">
                  <Sparkles size={14} /> Add all (best pairing)
                </button>
                <button className="btn btn-sm" disabled={!sel.size} onClick={addScanned}><Plus size={14} /> Add {sel.size} selected</button>
                <span className="muted" style={{ fontSize: '.74rem' }}>Large folders load thumbnails lazily. Detection + calibration run per image as usual.</span>
              </div>
            </div>
          )}
        </div>

        {/* GitHub import */}
        <div className="card pad">
          <div className="card-title"><Github /> Import images from a GitHub folder</div>
          <p className="muted" style={{ fontSize: '.82rem', marginTop: -6, marginBottom: 10 }}>
            Paste a link to a folder of images in any public repo. Every image is listed straight from GitHub (no upload, no copy) and marker detection runs on them. Drop a <span className="mono">metadata.csv</span> or <span className="mono">metadata.json</span> in the folder to attach per-image metadata: a <span className="mono">filename</span> column joins rows to images, and <span className="mono">species</span>, <span className="mono">latitude</span>/<span className="mono">longitude</span>, <span className="mono">title</span>, and any other columns are picked up automatically.
          </p>
          <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 320px', marginBottom: 0 }}><label>GitHub folder URL</label>
              <input className="input" placeholder="https://github.com/dr-richard-barker/ExoLab_11/tree/main/grw08_images_11122024"
                value={ghUrl} onChange={e => setGhUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addGithub()} />
            </div>
            <button className="btn btn-primary" disabled={ghBusy || !ghUrl.trim()} onClick={addGithub}>
              {ghBusy ? <Loader2 className="spin" size={16} /> : <Plus size={16} />} Add folder
            </button>
          </div>
          {ghMsg && <div style={{ marginTop: 8, fontSize: '.82rem', color: ghMsg.ok ? 'var(--ok)' : 'var(--danger)' }}>{ghMsg.text}</div>}
          <p className="muted" style={{ fontSize: '.74rem', marginTop: 8 }}>Uses the public GitHub API (60 requests/hour, anonymous). Large folders load thumbnails lazily as you scroll.</p>
          <button className="btn btn-sm btn-ghost" onClick={downloadTemplate}><Download size={14} /> Download metadata.csv template</button>
        </div>

        {/* sources table */}
        <div className="card pad">
          <div className="card-title"><FolderCog /> Sources</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data" style={{ marginBottom: 12 }}>
              <thead><tr><th>Source</th><th>Type</th><th style={{ width: 110 }}></th></tr></thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.slug}>
                    <td>{p.name} {p.slug === active && <span className="badge info" style={{ marginLeft: 4 }}>viewing</span>}</td>
                    <td>{isCloud(p.slug) ? <span className="chip" style={{ color: 'var(--accent2)' }}><Cloud size={11} /> Community</span> : isGithub(p.slug) ? <span className="chip"><Github size={11} /> GitHub</span> : isLocal(p.slug) ? <span className="chip"><HardDrive size={11} /> Local</span> : <span className="chip">Epicollect5</span>}</td>
                    <td>
                      <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm btn-ghost" title="View" onClick={() => onChangeActive(p.slug)}><Eye size={14} /></button>
                        {!isLocal(p.slug) && !isCloud(p.slug) && <a className="btn btn-sm btn-ghost" title="Open source" href={projectUrl(p.slug)} target="_blank" rel="noreferrer"><ExternalLink size={14} /></a>}
                        {!isBuiltin(p.slug) && !isCloud(p.slug) && <button className="btn btn-sm btn-ghost" title="Remove" onClick={() => remove(p.slug)} style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '2 1 200px', marginBottom: 0 }}><label>Add an Epicollect5 project — slug</label>
              <input className="input" placeholder="my-epicollect-project" value={slug} onChange={e => setSlug(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
            </div>
            <div className="field" style={{ flex: '1 1 140px', marginBottom: 0 }}><label>Display name (optional)</label>
              <input className="input" placeholder="My project" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
            </div>
            <button className="btn" onClick={add}><Plus size={16} /> Add</button>
          </div>
          <p className="muted" style={{ fontSize: '.78rem', marginTop: 8 }}>
            Sources and the current view are remembered in your browser. Share a direct link with <span className="mono">?project=slug</span>.
          </p>
        </div>

        <div className="card pad">
          <div className="card-title"><ImagePlus /> Enable calibration-marker analysis</div>
          <p style={{ fontSize: '.88rem', margin: 0 }}>
            Any RGB image source works with the scale &amp; colour analysis (recycled from AstroBotany). For Epicollect5, the form needs a <strong>Photo</strong> question; for GitHub, just point at a folder of images. Photograph the specimen next to a fiducial + colour-chip calibration card so scale and colour are recoverable; entries with a photo get a <em>Detect marker</em> button. 3D-scan entries (.ply/.obj/.glb/.stl) skip this and use the in-app 3D viewer instead.
          </p>
        </div>

        <div className="card pad">
          <div className="card-title"><Smartphone /> Contribute from your phone (Epicollect5)</div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: '.9rem', lineHeight: 1.7 }}>
            <li>Install the free Epicollect5 app and add the project by name.</li>
            <li><Camera size={13} style={{ verticalAlign: -2 }} /> Add an entry — include a photo next to the marker if the form has a Photo field.</li>
            <li>Fill in species / notes; <MapPin size={13} style={{ verticalAlign: -2 }} /> GPS is captured automatically.</li>
            <li><UploadCloud size={13} style={{ verticalAlign: -2 }} /> Upload. It appears here on the next refresh.</li>
          </ol>
          <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
            <a className="btn btn-sm" href="https://apps.apple.com/app/epicollect5/id1183858199" target="_blank" rel="noreferrer"><Apple /> iOS app</a>
            <a className="btn btn-sm" href="https://play.google.com/store/apps/details?id=uk.ac.imperial.epicollect.five" target="_blank" rel="noreferrer"><Play /> Android app</a>
          </div>
        </div>
      </div>
    </div>
  );
};
