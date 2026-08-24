// GitHub folder source. The GitHub contents API and raw.githubusercontent.com
// are both CORS-open (Access-Control-Allow-Origin: *), so a static site can list
// a repo folder and load + analyse its images directly in the browser — no token
// for public repos (unauthenticated limit: 60 requests/hour, and a folder is one
// request). Images are served from raw.githubusercontent.com, so the marker
// detector can read their pixels off a canvas.

export interface GhTarget { owner: string; repo: string; path: string; ref: string; }
export interface GhFile { name: string; path: string; downloadUrl: string; size: number; sha: string; video?: boolean; scan?: boolean; }

const IMG_RE = /\.(jpe?g|png|webp|gif|tiff?|bmp|heic|heif)$/i;
// Video time-lapses (e.g. the ABRS root movies). AVI is included because the
// files exist and are worth surfacing, even though most browsers can't decode
// it inline — the UI offers a download/open fallback for unsupported codecs.
const VIDEO_RE = /\.(avi|mp4|webm|ogv|mov|m4v|mkv)$/i;
export const isVideoName = (name: string) => VIDEO_RE.test(name);
// 3D scans (meshes or point clouds) — rendered by the in-app 3D viewer instead
// of a flat <img>.
const SCAN3D_RE = /\.(ply|obj|glb|gltf|stl)$/i;
export const isScan3dName = (name: string) => SCAN3D_RE.test(name);

// Accept a full GitHub URL (…/tree/<ref>/<path>, or repo root) or an
// "owner/repo[/path]" shorthand (defaults to the main branch).
export function parseGithub(input: string): GhTarget | null {
  const s = input.trim();
  let m = s.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/i);
  if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, ''), ref: m[3], path: decodeURIComponent(m[4]).replace(/\/+$/, '') };
  m = s.match(/github\.com\/([^/]+)\/([^/]+)\/?$/i);
  if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, ''), ref: 'main', path: '' };
  m = s.match(/^([^/\s]+)\/([^/\s]+)(?:\/(.+))?$/);
  if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, ''), ref: 'main', path: (m[3] || '').replace(/\/+$/, '') };
  return null;
}

export const ghId = (t: GhTarget) => `gh:${t.owner}/${t.repo}/${t.ref}/${t.path}`;
export function parseGhId(id: string): GhTarget | null {
  const m = id.match(/^gh:([^/]+)\/([^/]+)\/([^/]+)\/(.*)$/);
  return m ? { owner: m[1], repo: m[2], ref: m[3], path: m[4] } : null;
}
export function ghUrl(t: GhTarget): string {
  return `https://github.com/${t.owner}/${t.repo}/tree/${t.ref}/${t.path}`;
}
export function defaultName(t: GhTarget): string {
  const last = t.path.split('/').filter(Boolean).pop();
  return last ? `${t.repo} · ${last}` : t.repo;
}

// Per-image metadata keyed by (normalised) filename, from a sidecar file.
export type MetaMap = Map<string, Record<string, string>>;
export interface GhFolder { images: GhFile[]; meta: MetaMap; metaFile: string | null; }

const folderCache = new Map<string, { time: number; folder: GhFolder }>();
const TTL_MS = 5 * 60_000;
const META_RE = /^(metadata|data|images?)\.(csv|tsv|json)$/i;

// `metaUrl` overrides the in-folder sidecar with an explicit raw CSV/JSON URL
// (used by the repo scanner, where the processed-data file lives elsewhere).
export async function fetchGithubFolder(t: GhTarget, metaUrl?: string): Promise<GhFolder> {
  const key = ghId(t) + (metaUrl ? `|${metaUrl}` : '');
  const hit = folderCache.get(key);
  if (hit && Date.now() - hit.time < TTL_MS) return hit.folder;

  const path = t.path.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${t.owner}/${t.repo}/contents/${path}?ref=${encodeURIComponent(t.ref)}`;
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (res.status === 403) throw new Error('GitHub API rate limit reached (60/hr for anonymous) — try again later');
  if (res.status === 404) throw new Error('Folder not found — check owner/repo/branch/path');
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  const j = await res.json();
  if (!Array.isArray(j)) throw new Error('That path is a file, not a folder');

  const images: GhFile[] = dedupeVideos(j
    .filter((f: any) => f.type === 'file' && (IMG_RE.test(f.name) || VIDEO_RE.test(f.name) || SCAN3D_RE.test(f.name)) && f.download_url)
    .map((f: any) => ({ name: f.name, path: f.path, downloadUrl: f.download_url, size: f.size, sha: f.sha, video: VIDEO_RE.test(f.name), scan: SCAN3D_RE.test(f.name) })));

  let meta: MetaMap = new Map();
  let metaFile: string | null = null;
  
  let sidecarUrl = metaUrl;
  let sidecarName = metaUrl ? (metaUrl.split('/').pop()?.split('?')[0] || 'metadata.csv') : null;

  if (!sidecarUrl) {
    // 1. Try to find datapackage.json first
    const dpFile = j.find((f: any) => f.type === 'file' && f.name.toLowerCase() === 'datapackage.json' && f.download_url);
    if (dpFile) {
      try {
        const dpText = await (await fetch(dpFile.download_url)).text();
        const dp = JSON.parse(dpText);
        const resMeta = dp.resources?.find((r: any) => r.path && (r.path.endsWith('.csv') || r.path.endsWith('.json')));
        if (resMeta) {
          const targetFile = j.find((f: any) => f.type === 'file' && f.name.toLowerCase() === resMeta.path.toLowerCase() && f.download_url);
          if (targetFile) {
            sidecarUrl = targetFile.download_url;
            sidecarName = targetFile.name;
          }
        }
      } catch (err) {
        console.warn('Failed to parse datapackage.json:', err);
      }
    }
    
    // 2. Fall back to standard metadata.csv/json regex search
    if (!sidecarUrl) {
      const match = j.find((f: any) => f.type === 'file' && META_RE.test(f.name) && f.download_url);
      if (match) {
        sidecarUrl = match.download_url;
        sidecarName = match.name;
      }
    }
  }

  if (sidecarUrl && sidecarName) {
    try {
      const text = await (await fetch(sidecarUrl)).text();
      meta = parseSidecarText(text, sidecarName);
      if (meta.size) metaFile = sidecarName;
    } catch { /* sidecar unreadable — ignore */ }
  }

  const folder: GhFolder = { images, meta, metaFile };
  folderCache.set(key, { time: Date.now(), folder });
  return folder;
}

// When a folder holds the same clip in several container formats (e.g. an MJPEG
// AVI archival original next to an H.264 MP4 for the web), keep only the most
// browser-playable one per basename so the gallery shows one tile, not several.
const VIDEO_PREF = ['mp4', 'webm', 'ogv', 'm4v', 'mov', 'mkv', 'avi'];
const videoRank = (name: string) => {
  const ext = name.toLowerCase().split('.').pop() || '';
  const i = VIDEO_PREF.indexOf(ext);
  return i < 0 ? VIDEO_PREF.length : i;
};
function dedupeVideos(files: GhFile[]): GhFile[] {
  const bestVideo = new Map<string, GhFile>(); // basename (no ext) -> preferred file
  for (const f of files) {
    if (!f.video) continue;
    const base = f.name.toLowerCase().replace(/\.[^.]+$/, '');
    const cur = bestVideo.get(base);
    if (!cur || videoRank(f.name) < videoRank(cur.name)) bestVideo.set(base, f);
  }
  return files.filter(f => {
    if (!f.video) return true;
    return bestVideo.get(f.name.toLowerCase().replace(/\.[^.]+$/, '')) === f;
  });
}

// Back-compat: just the images (used to validate a folder before adding it).
export async function fetchGithubImages(t: GhTarget): Promise<GhFile[]> {
  return (await fetchGithubFolder(t)).images;
}

// Look up a record for an image by full name, then by basename (no extension).
export function metaFor(meta: MetaMap, filename: string): Record<string, string> | undefined {
  return meta.get(filename.toLowerCase()) || meta.get(filename.toLowerCase().replace(/\.[^.]+$/, ''));
}

// --- whole-repo scan ---------------------------------------------------------
// Walk a repo's git tree in ONE recursive API call, group images by folder, find
// data files (CSV/JSON), and suggest which data file pairs with each image
// folder — so the user can pull a multi-folder repo in without hunting.

export interface ScanFolder {
  path: string; count: number; bytes: number; sampleNames: string[];
  derived: boolean;                            // likely plots/histograms/thumbnails (tiny avg size or a viz folder)
  suggestedMeta?: { name: string; path: string; rawUrl: string };
}
export interface RepoScan {
  owner: string; repo: string; branch: string;
  totalImages: number;
  folders: ScanFolder[];                       // image folders (≥3 images), by count
  dataFiles: { name: string; path: string; rawUrl: string }[];
}

export function parseGithubRepo(input: string): { owner: string; repo: string } | null {
  const s = input.trim();
  let m = s.match(/github\.com\/([^/]+)\/([^/#?\s]+)/i);
  if (!m) m = s.match(/^([^/\s]+)\/([^/\s]+)$/);
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, '') } : null;
}

const rawUrlFor = (owner: string, repo: string, branch: string, path: string) =>
  `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path.split('/').map(encodeURIComponent).join('/')}`;
const top2 = (p: string) => p.split('/').slice(0, 2).join('/');

export async function scanRepo(owner: string, repo: string): Promise<RepoScan> {
  const H = { Accept: 'application/vnd.github+json' };
  const metaRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: H });
  if (metaRes.status === 404) throw new Error('Repository not found — check owner/repo');
  if (metaRes.status === 403) throw new Error('GitHub API rate limit reached (60/hr) — try again later');
  if (!metaRes.ok) throw new Error(`GitHub API returned ${metaRes.status}`);
  const branch = (await metaRes.json()).default_branch || 'main';

  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers: H });
  if (!treeRes.ok) throw new Error(`Could not read the repo tree (${treeRes.status})`);
  const tree = await treeRes.json();
  const blobs: any[] = (tree.tree || []).filter((t: any) => t.type === 'blob');

  const DATA_RE = /\.(csv|tsv|json)$/i;
  const folders = new Map<string, ScanFolder>();
  const dataFiles: RepoScan['dataFiles'] = [];
  let totalImages = 0;
  for (const b of blobs) {
    const name = b.path.split('/').pop() as string;
    const dir = b.path.includes('/') ? b.path.slice(0, b.path.lastIndexOf('/')) : '(root)';
    if (IMG_RE.test(name)) {
      totalImages++;
      const g = folders.get(dir) || { path: dir, count: 0, bytes: 0, sampleNames: [], derived: false };
      g.count++; g.bytes += b.size || 0;
      if (g.sampleNames.length < 4) g.sampleNames.push(name);
      folders.set(dir, g);
    } else if (DATA_RE.test(name)) {
      dataFiles.push({ name, path: b.path, rawUrl: rawUrlFor(owner, repo, branch, b.path) });
    }
  }

  const list = [...folders.values()].filter(f => f.count >= 3).sort((a, b) => b.count - a.count);
  for (const f of list) {
    // Small average size or a viz-named folder ⇒ derived plots, not specimens.
    f.derived = (f.bytes / f.count) < 40_000 || /\/(histograms?|thumbnails?|thumbs|plots?|charts?)(\/|$)/i.test(f.path);
    // Suggest a data file sharing the folder's top-two path segments (prefer the
    // main output over a "background" file).
    const near = dataFiles.filter(d => top2(d.path) === top2(f.path));
    const chosen = near.find(d => !/background/i.test(d.name)) || near[0];
    if (chosen) f.suggestedMeta = { name: chosen.name, path: chosen.path, rawUrl: chosen.rawUrl };
  }

  return { owner, repo, branch, totalImages, folders: list, dataFiles };
}

const FILE_KEY_RE = /^(file|filename|image|images|photo|name|img)$/i;

function indexByFilename(rows: Record<string, string>[]): MetaMap {
  const map: MetaMap = new Map();
  for (const row of rows) {
    const keyCol = Object.keys(row).find(k => FILE_KEY_RE.test(k.trim()));
    const fname = keyCol ? String(row[keyCol]).trim() : '';
    if (!fname) continue;
    const rec: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) if (!FILE_KEY_RE.test(k.trim())) rec[k.trim()] = v;
    map.set(fname.toLowerCase(), rec);
    map.set(fname.toLowerCase().replace(/\.[^.]+$/, ''), rec);
  }
  return map;
}

// Parse a sidecar file's text into a filename→record map (shared with uploads).
export function parseSidecarText(text: string, filename: string): MetaMap {
  return /\.json$/i.test(filename)
    ? parseJsonMeta(text)
    : parseDelimitedMeta(text, /\.tsv$/i.test(filename) ? '\t' : ',');
}

function parseJsonMeta(text: string): MetaMap {
  const j = JSON.parse(text);
  if (Array.isArray(j)) return indexByFilename(j.map(stringifyValues));
  // object keyed by filename → { "img.jpg": {species: …}, … }
  const map: MetaMap = new Map();
  for (const [fname, rec] of Object.entries(j)) {
    const r = stringifyValues(rec as any);
    map.set(fname.toLowerCase(), r);
    map.set(fname.toLowerCase().replace(/\.[^.]+$/, ''), r);
  }
  return map;
}
function stringifyValues(o: any): Record<string, string> {
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(o || {})) r[k] = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return r;
}

// Minimal delimited parser with quoted-field support.
function parseDelimitedMeta(text: string, delim: string): MetaMap {
  const rows = splitRows(text);
  if (rows.length < 2) return new Map();
  const headers = splitLine(rows[0], delim).map(h => h.trim());
  const objs = rows.slice(1).filter(r => r.trim()).map(line => {
    const cells = splitLine(line, delim);
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = (cells[i] ?? '').trim(); });
    return o;
  });
  return indexByFilename(objs);
}
export function splitRows(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n');
}
export function splitLine(line: string, delim: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseFilenameMeta(name: string): { 
  fields: { name: string; value: string }[]; 
  capturedAt: string | null;
  species?: string;
  genotype?: string;
  treatment?: string;
} {
  const fields: { name: string; value: string }[] = [];
  let capturedAt: string | null = null;
  
  // 1) explicit YYYY_MM_DD[_HH_MM_SS] (e.g. ABRS "2010_02_14_09_36_44-0072.jpg")
  const dtm = name.match(/(\d{4})[_.-](\d{2})[_.-](\d{2})(?:[_.T-](\d{2})[_.:-](\d{2})[_.:-](\d{2}))?/);
  if (dtm && +dtm[1] > 1990 && +dtm[1] < 2100) {
    const d = new Date(Date.UTC(+dtm[1], +dtm[2] - 1, +dtm[3], +(dtm[4] || 0), +(dtm[5] || 0), +(dtm[6] || 0)));
    if (!isNaN(d.getTime())) { capturedAt = d.toISOString(); fields.push({ name: 'Captured', value: d.toLocaleString() }); }
  }
  // 2) else a unix timestamp (ExoLab rig style)
  if (!capturedAt) {
    const ts = name.match(/(?:^|[_-])(\d{10})(?:\D|$)/);
    if (ts) {
      const d = new Date(Number(ts[1]) * 1000);
      if (!isNaN(d.getTime())) { capturedAt = d.toISOString(); fields.push({ name: 'Captured', value: d.toLocaleString() }); }
    }
  }
  const pos = name.match(/position[_-]?([\d.]+)/i);
  if (pos) fields.push({ name: 'Lens position', value: pos[1] });
  const cam = name.match(/cam[_-]?(\d+)/i);
  if (cam) fields.push({ name: 'Camera', value: cam[1] });
  const fps = name.match(/(\d+)\s*fps/i);
  if (fps) fields.push({ name: 'Frame rate', value: `${fps[1]} fps` });

  // Infer biology from keywords in filename
  let species: string | undefined;
  const name_lower = name.toLowerCase();
  if (/landoltia|londultia|punctata/i.test(name_lower)) species = 'Landoltia punctata';
  else if (/lemna|minor/i.test(name_lower)) species = 'Lemna minor';
  else if (/wolffia/i.test(name_lower)) species = 'Wolffia arrhiza';
  else if (/azolla|azola/i.test(name_lower)) species = 'Azolla caroliniana';
  else if (/arabidopsis|thaliana/i.test(name_lower)) species = 'Arabidopsis thaliana';

  let genotype: string | undefined;
  if (/col-0|col0/i.test(name_lower)) genotype = 'Col-0';
  else if (/pgm/i.test(name_lower)) genotype = 'pgm1-1';

  let treatment: string | undefined;
  if (/gibberellic|ga/i.test(name_lower)) treatment = 'Gibberellic Acid (GA)';
  else if (/clinostat|clino/i.test(name_lower)) treatment = 'Clinostat';
  else if (/control|ctrl|water/i.test(name_lower)) treatment = 'Control';

  return { fields, capturedAt, species, genotype, treatment };
}
