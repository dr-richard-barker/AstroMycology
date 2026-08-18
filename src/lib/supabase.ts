// Supabase client for auth, moderation and shared uploads. Config comes from
// build-time env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). When absent the
// app runs in its original open, no-login mode — so the site keeps working
// until the admin wires up a Supabase project (see SETUP-AUTH.md).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const authConfigured = Boolean(URL && ANON);

// A single shared client (or null when unconfigured). The anon key is a
// publishable key — safe in client code; real access is enforced by row-level
// security policies in the database, not by hiding the key.
export const supabase: SupabaseClient | null = authConfigured
  ? createClient(URL!, ANON!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

export const UPLOAD_BUCKET = 'uploads';
