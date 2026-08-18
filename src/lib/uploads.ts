// Shared cloud uploads: signed-in users push calibrated images into a common
// "Community uploads" collection stored in Supabase (Storage for the files, the
// `uploads` table for metadata). Everyone signed in sees them; the admin can
// hide any of them (via hidden_content) or delete them (owner/admin, enforced
// by RLS). Runs only when Supabase is configured.
import { supabase, UPLOAD_BUCKET } from './supabase';
import { compressImage } from './capture';
import type { Ec5Entry, EntryField } from '../types';

export const CLOUD_SLUG = 'cloud:community';
export const isCloud = (slug: string) => slug.startsWith('cloud:');

export interface UploadMeta { species?: string; notes?: string; }

// Upload one or more image files: compress client-side, store the file, then
// record a row. Returns how many succeeded.
export async function uploadToCloud(files: File[], meta: UploadMeta, onProgress?: (done: number, total: number) => void): Promise<number> {
  if (!supabase) throw new Error('Cloud uploads are not configured.');
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Please sign in to upload.');

  let done = 0;
  for (const file of files) {
    try {
      const { blob } = await compressImage(file, 1600, 0.82);
      const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/\.[^.]+$/, '');
      const path = `${uid}/${crypto.randomUUID()}_${safe}.jpg`;
      const up = await supabase.storage.from(UPLOAD_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw up.error;
      const metadata: Record<string, string> = {};
      if (meta.notes) metadata.notes = meta.notes;
      const ins = await supabase.from('uploads').insert({
        title: file.name.replace(/\.[^.]+$/, ''),
        species: meta.species || null,
        path,
        metadata,
      });
      if (ins.error) throw ins.error;
    } catch (e) {
      // leave the count short; caller reports partial success
      console.warn('upload failed for', file.name, e);
    }
    onProgress?.(++done, files.length);
  }
  return done;
}

interface UploadRow { id: string; owner: string; title: string | null; species: string | null; path: string; metadata: Record<string, string> | null; created_at: string; }

function rowToEntry(r: UploadRow): Ec5Entry {
  const url = supabase!.storage.from(UPLOAD_BUCKET).getPublicUrl(r.path).data.publicUrl;
  const fields: EntryField[] = [];
  for (const [k, v] of Object.entries(r.metadata || {})) if (v) fields.push({ name: k[0].toUpperCase() + k.slice(1), value: String(v) });
  return {
    uuid: r.id, project: CLOUD_SLUG, title: r.title || 'Upload',
    createdAt: r.created_at || '', uploadedAt: r.created_at || '',
    photoUrl: url, thumbUrl: url, videoUrl: null,
    fields, species: r.species || null, gps: null, marker: null,
    cloud: { owner: r.owner, path: r.path },
  };
}

// One page of community uploads (newest first).
export async function fetchCloudPage(page: number, perPage: number): Promise<{ entries: Ec5Entry[]; total: number; hasNext: boolean }> {
  if (!supabase) return { entries: [], total: 0, hasNext: false };
  const from = (page - 1) * perPage;
  const { data, count, error } = await supabase
    .from('uploads')
    .select('id,owner,title,species,path,metadata,created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + perPage - 1);
  if (error) throw new Error(error.message);
  const rows = (data as UploadRow[]) || [];
  const total = count ?? rows.length;
  return { entries: rows.map(rowToEntry), total, hasNext: from + perPage < total };
}

// Delete an upload (owner or admin, enforced by RLS): remove the row + file.
export async function deleteCloudUpload(id: string, path: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('uploads').delete().eq('id', id);
  await supabase.storage.from(UPLOAD_BUCKET).remove([path]);
}
