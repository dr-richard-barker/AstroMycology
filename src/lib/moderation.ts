// Moderation: a `hidden_content` table lists projects/images the admin has
// excluded; every client filters these out. Admin-only writes are enforced by
// row-level security. `profiles` powers user management (ban / promote).
import { supabase } from './supabase';
import type { Profile } from './auth';

export interface HiddenItem {
  id: string;
  kind: 'project' | 'image';   // project = a source slug; image = `${project}::${uuid}` or a photo URL
  ref: string;
  label: string | null;
  reason: string | null;
  created_at: string;
}

export async function loadHidden(): Promise<HiddenItem[]> {
  if (!supabase) return [];
  const { data } = await supabase.from('hidden_content').select('id,kind,ref,label,reason,created_at').order('created_at', { ascending: false });
  return (data as HiddenItem[]) || [];
}

export async function hideItem(kind: HiddenItem['kind'], ref: string, label: string, reason: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('hidden_content').insert({ kind, ref, label, reason });
}
export async function unhideItem(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('hidden_content').delete().eq('id', id);
}

// Build fast lookup sets from a hidden list.
export function hiddenSets(items: HiddenItem[]) {
  const projects = new Set(items.filter(i => i.kind === 'project').map(i => i.ref));
  const images = new Set(items.filter(i => i.kind === 'image').map(i => i.ref));
  return { projects, images };
}

// --- user management (admin) ---
export async function listProfiles(): Promise<Profile[]> {
  if (!supabase) return [];
  const { data } = await supabase.from('profiles').select('id,email,display_name,role,banned').order('email');
  return (data as Profile[]) || [];
}
export async function setBanned(id: string, banned: boolean): Promise<void> {
  if (!supabase) return;
  await supabase.from('profiles').update({ banned }).eq('id', id);
}
export async function setRole(id: string, role: 'user' | 'admin'): Promise<void> {
  if (!supabase) return;
  await supabase.from('profiles').update({ role }).eq('id', id);
}
