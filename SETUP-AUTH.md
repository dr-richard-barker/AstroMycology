# Turning on login + accounts + moderation

The app ships **login-ready but open by default** — until you add your Supabase
keys it works exactly as before (no sign-in). Follow these one-time steps to
switch on Google login, user accounts, and admin moderation. Nothing here needs
code changes; you provide the keys and run one SQL script.

You'll need ~15 minutes and a Google account. **I (the assistant) can't create
these cloud accounts for you** — they require your own login — but everything is
already wired to use them.

## 1. Create a Supabase project
1. Go to <https://supabase.com> → sign in → **New project** (free tier is fine).
2. Note the project's **Project URL** and **anon public key** (Settings → API).
   The anon key is *publishable* — it's meant to live in client code; real access
   is enforced by the database rules in step 3.

## 2. Create the tables & rules
1. In Supabase → **SQL Editor** → paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   This creates `profiles`, `hidden_content`, `uploads`, the auto-profile
   trigger, and the row-level-security policies (including the rule that stops
   users from promoting or unbanning themselves).

## 3. Enable "Sign in with Google"
1. Supabase → **Authentication → Providers → Google** → enable.
2. Create a Google OAuth client: <https://console.cloud.google.com> →
   *APIs & Services → Credentials → Create OAuth client ID → Web application*.
   - **Authorized redirect URI**: the value Supabase shows on the Google provider
     page (looks like `https://<your-project>.supabase.co/auth/v1/callback`).
   - Paste the resulting **Client ID** and **Client secret** back into Supabase.
3. Supabase → **Authentication → URL Configuration** → add your app URL to the
   **Redirect URLs**:
   `https://dr-richard-barker.github.io/AstroMycology/`

## 4. Give the app the keys
In GitHub → this repo → **Settings → Secrets and variables → Actions →
Variables tab → New repository variable** (Variables, *not* Secrets — the anon
key is publishable):
- `VITE_SUPABASE_URL` = your Project URL
- `VITE_SUPABASE_ANON_KEY` = your anon public key

Then re-run the deploy (push any commit, or **Actions → Deploy → Run workflow**).
The site now requires Google sign-in.

## 5. Make yourself the admin
Sign in once with your Google account (this creates your profile row), then in
Supabase → **SQL Editor** run:
```sql
update public.profiles set role = 'admin' where email = 'YOUR_GMAIL@gmail.com';
```
Refresh the app — an **Admin** tab appears with People + Content moderation.

## Using it
- **Share the app link.** Anyone who opens it signs in with Google and gets an
  account automatically (open sign-up).
- **Ban / promote people** in Admin → People.
- **Hide a whole project** in Admin → Content; **hide a single image** with the
  *Hide* button in the image inspector. Hidden items vanish for everyone; unhide
  from Admin → Content.

## What login does and doesn't do
- ✅ Gates the **app** (who can use it), manages **accounts**, and hides content
  you flag — all enforced server-side by row-level security.
- ⚠️ It does **not** make the existing public datasets secret: the builtin
  NASA / Growing-Beyond-Earth / APEX05 / MadWest data live in public GitHub repos
  and the Epicollect5 API, so those URLs remain publicly reachable regardless of
  the login screen. Login controls the *experience and your own contributions*,
  not already-public data.
