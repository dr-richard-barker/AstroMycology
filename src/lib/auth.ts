// Auth + profile helpers on top of Supabase. A "profile" row (role, banned,
// display name) is auto-created for every signed-up user by a DB trigger; the
// admin promotes/bans via the Admin tab. All enforcement is via row-level
// security in the database — this module just reads state for the UI.
import { supabase, authConfigured } from './supabase';
import type { Session } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  role: 'user' | 'admin';
  banned: boolean;
}

export interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in' | 'banned' | 'unconfigured';
  session: Session | null;
  profile: Profile | null;
}

export function currentOrigin(): string {
  return `${location.origin}${import.meta.env.BASE_URL}`;
}

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: currentOrigin() },
  });
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

async function loadProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('profiles').select('id,email,display_name,role,banned').eq('id', userId).maybeSingle();
  return (data as Profile) || null;
}

// Resolve the full auth state for a session (signed-out / banned / signed-in).
async function resolve(session: Session | null): Promise<AuthState> {
  if (!authConfigured) return { status: 'unconfigured', session: null, profile: null };
  if (!session) return { status: 'signed-out', session: null, profile: null };
  const profile = await loadProfile(session.user.id);
  if (profile?.banned) return { status: 'banned', session, profile };
  return { status: 'signed-in', session, profile };
}

// Subscribe to auth changes; calls back with a resolved AuthState. Returns an
// unsubscribe function. In unconfigured mode it reports once and does nothing.
export function watchAuth(cb: (s: AuthState) => void): () => void {
  if (!supabase) { cb({ status: 'unconfigured', session: null, profile: null }); return () => {}; }
  supabase.auth.getSession().then(({ data }) => resolve(data.session).then(cb));
  const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { resolve(session).then(cb); });
  return () => sub.subscription.unsubscribe();
}

export const isAdmin = (s: AuthState) => s.profile?.role === 'admin';
