// Locally-uploaded image sources. A user drops a .zip (e.g. exported from Google
// Drive) or picks image files; we unzip in-browser, read EXIF, compress each
// image, join an optional metadata.csv/.json inside the upload, and persist to
// IndexedDB so the batch becomes a browsable, analysable source that survives
// reloads. Nothing is sent to a server.

import exifr from 'exifr';
import { unzip } from './zip';
import { compressImage } from './capture';
import { isHeicName, heicToJpeg } from './heic';
import { parseSidecarText, parseFilenameMeta, metaFor, type MetaMap } from '../api/github';
import { idbPut, idbGet, idbDeleteSource } from './idb';
import type { Ec5Entry, EntryField } from '../types';

const IMG_RE = /\.(jpe?g|png|webp|gif|tiff?|bmp|heic|heif)$/i;
const SCAN_RE = /\.(ply|obj|glb|gltf|stl)$/i;
const META_RE = /(^|\/)(metadata|data)\.(csv|tsv|json)$/i;

interface EntryMeta {
  name: string; title: string;
  fields: EntryField[]; species: string | null;
  gps: { lat: number; lng: number } | null;
  capturedAt: string | null; width: number; height: number;
  mediaKind: 'photo' | 'thermal' | 'scan3d';
}
interface SourceRec { id: string; name: string; createdAt: string; count: number; entries: EntryMeta[]; }

export interface UploadResult { id: string; slug: string; name: string; count: number; skipped: number; }

// Process picked files (.zip and/or images) into a stored local source.
export async function processUpload(files: File[], displayName?: string, onProgress?: (done: number, total: number) => void): Promise<UploadResult> {
  // 1. collect { name, blob, kind } from images/scans + expanded zips, plus any sidecar text
  const items: { name: string; blob: Blob; kind: 'image' | 'scan' }[] = [];
  let sidecarText = '', sidecarName = '';
  for (const f of files) {
    if (/\.zip$/i.test(f.name) || f.type === 'application/zip') {
      for (const e of await unzip(f)) {
        const base = e.name.split('/').pop() || e.name;
        if (META_RE.test(e.name)) { sidecarText = new TextDecoder().decode(e.bytes); sidecarName = base; }
        else if (IMG_RE.test(base)) items.push({ name: base, blob: new Blob([e.bytes]), kind: 'image' });
        else if (SCAN_RE.test(base)) items.push({ name: base, blob: new Blob([e.bytes]), kind: 'scan' });
      }
    } else if (IMG_RE.test(f.name)) {
      items.push({ name: f.name, blob: f, kind: 'image' });
    } else if (SCAN_RE.test(f.name)) {
      items.push({ name: f.name, blob: f, kind: 'scan' });
    } else if (META_RE.test(f.name)) {
      sidecarText = await f.text(); sidecarName = f.name;
    }
  }
  if (!items.length) throw new Error('No images or 3D scans found in the upload.');

  const meta: MetaMap = sidecarText ? parseSidecarText(sidecarText, sidecarName) : new Map();
  const id = crypto.randomUUID();
  const slug = `local:${id}`;
  const entries: EntryMeta[] = [];
  let skipped = 0;

  for (let i = 0; i < items.length; i++) {
    try {
      const { meta: em, blob } = await buildEntry(items[i], metaFor(meta, items[i].name));
      await idbPut('images', blob, `${id}::${em.name}`);
      entries.push(em);
    } catch { skipped++; }
    onProgress?.(i + 1, items.length);
  }
  if (!entries.length) throw new Error('Could not read any images or 3D scans from the upload.');

  const name = displayName?.trim() || (files.find(f => /\.zip$/i.test(f.name))?.name.replace(/\.zip$/i, '')) || `Upload (${entries.length})`;
  const rec: SourceRec = { id, name, createdAt: new Date().toISOString(), count: entries.length, entries };
  await idbPut('sources', rec);
  return { id, slug, name, count: entries.length, skipped };
}

async function buildEntry(item: { name: string; blob: Blob; kind: 'image' | 'scan' }, sidecar?: Record<string, string>): Promise<{ meta: EntryMeta; blob: Blob }> {
  const fn = parseFilenameMeta(item.name);
  const fields: EntryField[] = [...fn.fields];
  let species: string | null = null;
  let gps: { lat: number; lng: number } | null = null;
  let capturedAt = fn.capturedAt;
  let title = item.name;
  let mediaKind: 'photo' | 'thermal' | 'scan3d' = item.kind === 'scan' ? 'scan3d'
    : /thermal|_ir[_.]|_fir[_.]/i.test(item.name) ? 'thermal' : 'photo';

  // exifr/HEIC-decode/compressImage all assume image bytes and would throw on
  // a mesh — 3D scans skip straight to the sidecar join below and are stored
  // as raw, unmodified bytes (no width/height, no EXIF).
  if (item.kind === 'image') {
    let exif: any = null;
    try { exif = await exifr.parse(item.blob, { tiff: true, exif: true, gps: true }).catch(() => null); } catch { /* none */ }
    if (exif) {
      if (typeof exif.latitude === 'number' && typeof exif.longitude === 'number') gps = { lat: exif.latitude, lng: exif.longitude };
      const dt = exif.DateTimeOriginal ?? exif.CreateDate;
      if (dt instanceof Date && !isNaN(dt.getTime())) capturedAt = dt.toISOString();
      const dev = [exif.Make, exif.Model].filter(Boolean).map((s: any) => String(s).trim()).join(' ').trim();
      if (dev) fields.push({ name: 'Device', value: dev });
    }
  }

  if (sidecar) {
    let lat: number | null = null, lng: number | null = null;
    for (const [k, v] of Object.entries(sidecar)) {
      if (!v) continue;
      if (/^(title|label|caption)$/i.test(k)) { title = v; continue; }
      if (/^(lat|latitude)$/i.test(k)) { const n = parseFloat(v); if (!Number.isNaN(n)) lat = n; continue; }
      if (/^(lon|lng|long|longitude)$/i.test(k)) { const n = parseFloat(v); if (!Number.isNaN(n)) lng = n; continue; }
      if (/speci|taxon|plant|organism/i.test(k) && !species) species = v;
      if (/date|time|captured/i.test(k)) { const d = new Date(v); if (!isNaN(d.getTime())) capturedAt = d.toISOString(); }
      if (/^(media_?kind|sensor|image_?type)$/i.test(k) && /^(photo|thermal|scan3d)$/i.test(v)) { mediaKind = v.toLowerCase() as 'photo' | 'thermal' | 'scan3d'; continue; }
      fields.push({ name: prettify(k), value: v });
    }
    if (lat != null && lng != null) gps = { lat, lng };
  }

  if (item.kind === 'scan') {
    return { meta: { name: item.name, title, fields, species, gps, capturedAt, width: 0, height: 0, mediaKind }, blob: item.blob };
  }
  const pixelBlob = isHeicName(item.name) ? await heicToJpeg(item.blob) : item.blob;
  const c = await compressImage(pixelBlob);
  return { meta: { name: item.name, title, fields, species, gps, capturedAt, width: c.width, height: c.height, mediaKind }, blob: c.blob };
}

// Load a local source's entries as gallery records (fresh object URLs each call).
export async function loadLocalEntries(slug: string): Promise<Ec5Entry[]> {
  const id = slug.replace(/^local:/, '');
  const rec = await idbGet<SourceRec>('sources', id);
  if (!rec) return [];
  const out: Ec5Entry[] = [];
  for (const em of rec.entries) {
    const blob = await idbGet<Blob>('images', `${id}::${em.name}`);
    const url = blob ? URL.createObjectURL(blob) : null;
    const isScan = em.mediaKind === 'scan3d';
    out.push({
      uuid: em.name, project: slug, title: em.title,
      createdAt: em.capturedAt || rec.createdAt, uploadedAt: rec.createdAt,
      photoUrl: isScan ? null : url, thumbUrl: isScan ? null : url, scanUrl: isScan ? url : null,
      mediaKind: em.mediaKind,
      fields: isScan ? em.fields : [...em.fields, { name: 'Stored size', value: `${em.width}×${em.height}` }],
      species: em.species, gps: em.gps, marker: null,
    });
  }
  return out;
}

export const deleteLocalSource = (id: string) => idbDeleteSource(id);

function prettify(key: string): string {
  return key.replace(/^\d+_/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
}
