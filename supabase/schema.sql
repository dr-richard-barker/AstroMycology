-- AstroBotany Calibration Image Database — auth, moderation & uploads schema.
-- Run this in your Supabase project (SQL editor) once. See SETUP-AUTH.md.
-- Safe to re-run (idempotent).

-- ── profiles: one row per signed-up user ────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  role         text not null default 'user' check (role in ('user','admin')),
  banned       boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile whenever someone signs in with Google for the first time.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Is the *current* user an admin? SECURITY DEFINER so it bypasses RLS on
-- profiles (prevents recursive policy evaluation).
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and not banned);
$$;

-- ── hidden_content: admin moderation (hide a whole project or a single image) ─
create table if not exists public.hidden_content (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('project','image')),
  ref        text not null,          -- project = source slug; image = `${project}::${uuid}`
  label      text,
  reason     text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (kind, ref)
);

-- ── row-level security ──────────────────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.hidden_content enable row level security;

-- profiles: a user sees only their own row; admins see everyone. Only admins may
-- UPDATE (so a user can NOT promote/unban themselves). Inserts happen via the
-- trigger above (security definer), so no insert policy is granted to clients.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- hidden_content: any signed-in user may read (to filter their view); only
-- admins may add/remove entries.
drop policy if exists hidden_select on public.hidden_content;
create policy hidden_select on public.hidden_content for select
  using (auth.role() = 'authenticated');
drop policy if exists hidden_write on public.hidden_content;
create policy hidden_write on public.hidden_content for all
  using (public.is_admin()) with check (public.is_admin());

-- ── uploads: shared user contributions (metadata; files go to Storage) ───────
-- Powers the "Community uploads" collection: signed-in users insert their own
-- rows; everyone signed in can read; owner or admin can delete.
create table if not exists public.uploads (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references auth.users(id) default auth.uid(),
  title      text,
  species    text,
  path       text not null,          -- storage object path in the `uploads` bucket
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.uploads enable row level security;
drop policy if exists uploads_select on public.uploads;
create policy uploads_select on public.uploads for select using (auth.role() = 'authenticated');
drop policy if exists uploads_insert on public.uploads;
create policy uploads_insert on public.uploads for insert with check (owner = auth.uid());
drop policy if exists uploads_modify on public.uploads;
create policy uploads_modify on public.uploads for delete using (owner = auth.uid() or public.is_admin());

-- Storage bucket for upload files (public read; authenticated write own; admin delete).
insert into storage.buckets (id, name, public) values ('uploads','uploads', true)
  on conflict (id) do nothing;
drop policy if exists uploads_read on storage.objects;
create policy uploads_read on storage.objects for select using (bucket_id = 'uploads');
drop policy if exists uploads_put on storage.objects;
create policy uploads_put on storage.objects for insert
  with check (bucket_id = 'uploads' and auth.role() = 'authenticated');
drop policy if exists uploads_del on storage.objects;
create policy uploads_del on storage.objects for delete
  using (bucket_id = 'uploads' and (owner = auth.uid() or public.is_admin()));

-- ── grants: PostgREST's roles need table privileges too (RLS still restricts
-- which ROWS each user sees; these grant the base access the policies filter).
-- Login-for-everything, so only `authenticated` gets access — never `anon`.
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.hidden_content to authenticated;
grant select, insert, delete on public.uploads to authenticated;
grant execute on function public.is_admin() to authenticated;
