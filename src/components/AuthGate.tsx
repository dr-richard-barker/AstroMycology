import React, { useEffect, useState } from 'react';
import { LogIn, ShieldAlert, Loader2, Crosshair, Ruler, Palette, UploadCloud, Sprout, Rocket, Images, Box } from 'lucide-react';
import { watchAuth, signInWithGoogle, signOut, type AuthState } from '../lib/auth';

const LOGO = `${import.meta.env.BASE_URL}cose/cose-logo.png`;

function applyTheme() {
  const saved = localStorage.getItem('cose-theme');
  const theme = saved === 'light' || saved === 'dark'
    ? saved
    : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
}

// Wraps the whole app. In unconfigured mode (no Supabase keys) it renders the
// app openly, exactly as before. Once configured, visitors land on this public
// page and must sign in with Google to enter; banned users are locked out.
export const AuthGate: React.FC<{ children: (auth: AuthState) => React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading', session: null, profile: null });
  useEffect(() => { applyTheme(); return watchAuth(setAuth); }, []);

  if (auth.status === 'unconfigured' || auth.status === 'signed-in') return <>{children(auth)}</>;

  // Loading / banned: a compact card is enough.
  if (auth.status === 'loading' || auth.status === 'banned') {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <img src={LOGO} alt="CoSE" className="auth-logo" />
          <div className="auth-eyebrow">CoSE Cloud · AstroMycology</div>
          <h1>Image &amp; 3D Scan Database</h1>
          {auth.status === 'loading'
            ? <p className="auth-msg"><Loader2 className="spin" size={16} /> Checking your session…</p>
            : <>
                <div className="auth-msg" style={{ color: 'var(--danger)' }}><ShieldAlert size={18} /> Your access to this database has been revoked by an administrator.</div>
                <button className="btn btn-ghost" onClick={() => signOut()}>Sign out</button>
              </>}
        </div>
        <div className="auth-foot">Space biology · CoSE Cloud</div>
      </div>
    );
  }

  // signed-out → the public landing page.
  return (
    <div className="land">
      <header className="land-nav">
        <div className="land-brand"><img src={LOGO} alt="CoSE" /> <span>CoSE&nbsp;Cloud</span></div>
        <button className="btn btn-primary btn-sm" onClick={() => signInWithGoogle()}><LogIn size={15} /> Sign in</button>
      </header>

      <section className="land-hero">
        <div className="land-eyebrow"><Rocket size={13} /> Space biology · AstroMycology</div>
        <h1>The Mushroom Image &amp; 3D&nbsp;Scan&nbsp;Database</h1>
        <p className="land-sub">
          A shared collection of mushroom imagery — RGB photos, RGB-thermal photos, and 3D scans — with an
          in-browser <strong>3D viewer</strong> (orbit, volume, dimensions, surface area) and optional
          calibration-marker scale &amp; colour recovery for flat photos.
        </p>
        <div className="land-cta">
          <button className="btn btn-primary auth-google" onClick={() => signInWithGoogle()}><LogIn size={16} /> Continue with Google</button>
          <span className="land-fine">Free · signing in creates your account automatically <Sprout size={12} style={{ verticalAlign: -1, color: 'var(--accent2)' }} /></span>
        </div>
      </section>

      <section className="land-features">
        {[
          { icon: <Images size={18} />, t: 'Browse the collection', d: 'RGB, thermal and 3D-scan entries side by side — filter by project, species or media kind.' },
          { icon: <Crosshair size={18} />, t: 'Detect the marker', d: 'A calibration card is found in your browser to recover pixels-per-mm scale and a 15-chip colour correction on flat photos — no upload to a server.' },
          { icon: <Box size={18} />, t: 'View & measure 3D scans', d: 'Open a .ply/.obj/.glb/.stl scan in the in-app 3D viewer: orbit it, and get vertex/face counts, dimensions, volume and surface area, computed locally.' },
          { icon: <UploadCloud size={18} />, t: 'Share your own', d: 'Upload calibrated photos (including HEIC) to the community collection for everyone to see, measure and build on.' },
        ].map((f, i) => (
          <div className="land-card" key={i}>
            <div className="land-ico">{f.icon}</div>
            <h3>{f.t}</h3>
            <p>{f.d}</p>
          </div>
        ))}
      </section>

      <section className="land-inside">
        <div className="land-inside-h"><Ruler size={14} /> Inside the collection</div>
        <div className="land-chips">
          {['RGB photos', 'RGB-thermal photos', '3D scans (.ply/.obj/.glb/.stl)', 'Legacy mesh-volume notebook', 'Community uploads'].map(c => (
            <span className="land-chip" key={c}><Sprout size={11} /> {c}</span>
          ))}
        </div>
        <p className="land-note"><Palette size={12} style={{ verticalAlign: -1 }} /> Marker detection, colour calibration, and 3D-scan analysis all run locally in your browser; your account governs access and your own contributions.</p>
      </section>

      <footer className="land-footer">
        <span>AstroMycology Image &amp; 3D Scan Database</span>
        <span className="land-dot">·</span>
        <span>CoSE Cloud — Space Biology</span>
      </footer>
    </div>
  );
};
