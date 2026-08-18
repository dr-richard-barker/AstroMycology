import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Database as DbIcon, UploadCloud, Share2, Info, Search, Menu, X, Sun, Moon, Sprout, AlertTriangle, BarChart3, Ruler, ClipboardList, BookText, ShieldCheck, LogOut, Library, Table } from 'lucide-react';
import { TOOLS, toolById } from './tools';
import type { Ec5Entry, MarkerAnalysis, CollectionStats } from './types';
import type { ContaminationResult } from './lib/contamination';
import {
  fetchEntriesPage, fetchAllPage, getActive, setActive as persistActive, getProjects,
  projectName, isDemoProject, ALL, type ProjectRef,
} from './api/epicollect';
import { Database } from './components/Database';
import { Dashboard } from './components/Dashboard';
import { Contribute } from './components/Contribute';
import { ExportShare } from './components/ExportShare';
import { About } from './components/About';
import { Scan3DViewer } from './components/Scan3DViewer';
import { MetadataReview } from './components/MetadataReview';
import { Datasets } from './components/Datasets';
import { Admin } from './components/Admin';
import { AuthGate } from './components/AuthGate';
import { MetadataEditor } from './components/MetadataEditor';
import { isAdmin, signOut, type AuthState } from './lib/auth';
import { loadHidden, hiddenSets, hideItem, type HiddenItem } from './lib/moderation';
import { deleteCloudUpload } from './lib/uploads';

type Tab = string;

const NAV: { id: Tab; label: string; sub: string; icon: React.ComponentType<any> }[] = [
  { id: 'database', label: 'Database', sub: 'Browse & analyze', icon: DbIcon },
  { id: 'dashboard', label: 'Dashboard', sub: 'Metadata analytics', icon: BarChart3 },
  { id: 'datasets', label: 'Datasets', sub: 'Provenance & citations', icon: Library },
  { id: 'metadata', label: 'Metadata review', sub: 'Conserved vs variant', icon: ClipboardList },
  { id: 'enrich', label: 'Enrich', sub: 'Generate sidecars', icon: Table },
  { id: 'contribute', label: 'Contribute', sub: 'Projects & app', icon: UploadCloud },
  { id: 'export', label: 'Export & share', sub: 'Manifest · CSV', icon: Share2 },
  { id: 'about', label: 'About', sub: 'Marker & pipeline', icon: Info },
];

const LOGO = `${import.meta.env.BASE_URL}cose/cose-logo.png`;
const PER_PAGE = 50;

function initialTheme(): 'light' | 'dark' {
  const saved = localStorage.getItem('cose-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  return <AuthGate>{auth => <AppInner auth={auth} />}</AuthGate>;
}

function AppInner({ auth }: { auth: AuthState }) {
  const admin = isAdmin(auth);
  const [tab, setTab] = useState<Tab>('database');
  const [projects, setProjects] = useState<ProjectRef[]>(getProjects);

  // Moderation: hidden projects/images loaded once (and after admin changes).
  const [hidden, setHidden] = useState<HiddenItem[]>([]);
  const reloadHidden = useCallback(() => { loadHidden().then(setHidden).catch(() => {}); }, []);
  useEffect(() => { reloadHidden(); }, [reloadHidden]);
  const hiddenSet = useMemo(() => hiddenSets(hidden), [hidden]);
  const [active, setActive] = useState<string>(getActive);
  const [entries, setEntries] = useState<Ec5Entry[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme);
  const [toolLaunch, setToolLaunch] = useState<{ imageUrl?: string; ref?: string } | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cose-theme', theme);
  }, [theme]);

  const load = useCallback(async (sel: string, targetPage: number, replace: boolean) => {
    setLoading(true); if (replace) setErrors([]);
    try {
      const res = sel === ALL
        ? await fetchAllPage(getProjects().map(p => p.slug))
        : await fetchEntriesPage(sel, targetPage, PER_PAGE);
      setEntries(prev => (replace ? res.entries : [...prev, ...res.entries]));
      setPage(res.page); setHasNext(res.hasNext); setTotalAvailable(res.total);
      setErrors(res.errors);
    } catch (e) {
      if (replace) setEntries([]);
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(active, 1, true); }, [active, load]);

  const changeActive = (sel: string) => {
    if (sel === active) { setTab('database'); return; }
    persistActive(sel); setActive(sel); setEntries([]); setPage(1); setTab('database');
  };
  const refreshProjects = () => setProjects(getProjects());

  // Open a sibling tool as an in-app view (optionally pre-loaded with an image).
  const openTool = (id: string, imageUrl?: string, ref?: string) => {
    setToolLaunch(imageUrl ? { imageUrl, ref } : null);
    setTab(id); setMenuOpen(false);
  };

  const onMarkerChanged = (uuid: string, marker: MarkerAnalysis | null) =>
    setEntries(prev => prev.map(e => (e.uuid === uuid ? { ...e, marker } : e)));
  const onContaminationChanged = (uuid: string, contamination: ContaminationResult | null) =>
    setEntries(prev => prev.map(e => (e.uuid === uuid ? { ...e, contamination } : e)));

  const stats: CollectionStats = useMemo(() => ({
    total: entries.length,
    totalAvailable,
    withPhoto: entries.filter(e => e.photoUrl).length,
    analyzed: entries.filter(e => e.marker?.markerFound).length,
  }), [entries, totalAvailable]);

  const activeLabel = active === ALL ? 'All projects' : projectName(active);
  const activeTool = toolById(tab);
  const activeRef = projects.find(p => p.slug === active)?.reference;

  // Hide moderated projects from the selector and moderated images from the grid.
  const visibleProjects = useMemo(() => projects.filter(p => !hiddenSet.projects.has(p.slug)), [projects, hiddenSet]);
  const visibleEntries = useMemo(() =>
    entries.filter(e => !hiddenSet.projects.has(e.project) && !hiddenSet.images.has(`${e.project}::${e.uuid}`)),
    [entries, hiddenSet]);
  const onHideImage = admin
    ? (e: Ec5Entry) => { hideItem('image', `${e.project}::${e.uuid}`, e.title, 'hidden by admin').then(reloadHidden); }
    : undefined;
  const currentUserId = auth.session?.user?.id;
  // Delete a shared cloud upload (owner or admin — RLS enforces it server-side).
  const onDeleteUpload = (e: Ec5Entry) => {
    if (!e.cloud) return;
    deleteCloudUpload(e.uuid, e.cloud.path).then(() => setEntries(prev => prev.filter(x => x.uuid !== e.uuid)));
  };
  const userLabel = auth.session?.user?.email || auth.profile?.display_name || '';

  return (
    <div className={`app ${menuOpen ? 'menu-open' : ''}`}>
      <div className="scrim" onClick={() => setMenuOpen(false)} />

      <aside className="rail">
        <div className="rail-brand">
          <img src={LOGO} alt="CoSE" />
          <div>
            <div className="t1">AstroMycology</div>
            <div className="t2">Image &amp; 3D Scan DB</div>
          </div>
        </div>
        <nav>
          {NAV.map(({ id, label, sub, icon: Icon }) => (
            <button key={id} className={`navbtn ${tab === id ? 'active' : ''}`} onClick={() => { setTab(id); setMenuOpen(false); }}>
              <Icon /><span>{label}<span className="sub">{sub}</span></span>
            </button>
          ))}
          {admin && (
            <button className={`navbtn ${tab === 'admin' ? 'active' : ''}`} onClick={() => { setTab('admin'); setMenuOpen(false); }}>
              <ShieldCheck /><span>Admin<span className="sub">People &amp; moderation</span></span>
            </button>
          )}
        </nav>
        <div className="rail-tools">
          <div className="rail-tools-h">Analysis tools <Ruler size={11} /></div>
          {TOOLS.map(t => (
            <div key={t.id} className={`tool-link ${tab === t.id ? 'active' : ''}`} role="button" tabIndex={0}
              onClick={() => openTool(t.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openTool(t.id); }}>
              <t.icon size={15} />
              <span>{t.name}<span className="sub">{t.sub}</span></span>
            </div>
          ))}
        </div>
        <div className="rail-foot">
          <div className="row" style={{ gap: 6 }}><Sprout size={14} color="var(--accent2)" /> {stats.total} loaded · {stats.analyzed} calibrated</div>
          <div style={{ marginTop: 6 }}>Viewing: <span className="mono">{activeLabel}</span></div>
          {auth.status === 'signed-in' && (
            <div className="row sb" style={{ justifyContent: 'space-between', marginTop: 8, gap: 6 }}>
              <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={userLabel}>
                {admin && <ShieldCheck size={11} style={{ verticalAlign: -1, color: 'var(--accent2)' }} />} {userLabel}
              </span>
              <button className="btn btn-xs btn-ghost" onClick={() => signOut()} title="Sign out"><LogOut size={12} /></button>
            </div>
          )}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn hamburger" onClick={() => setMenuOpen(o => !o)}>{menuOpen ? <X size={18} /> : <Menu size={18} />}</button>
          <div className="search">
            <Search />
            <input placeholder="Search title, species, metadata…" value={query} onChange={e => setQuery(e.target.value)} onFocus={() => setTab('database')} />
          </div>
          <span className="grow" />
          <select className="select" style={{ width: 'auto', minWidth: 200, maxWidth: 'min(420px, 42vw)' }} value={active} onChange={e => changeActive(e.target.value)} title="Choose Epicollect5 project">
            {visibleProjects.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            {visibleProjects.length > 1 && <option value={ALL}>All projects</option>}
          </select>
          <button className="icon-btn" title="Toggle theme" onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </header>

        <main className="content" style={activeTool ? { padding: 0 } : undefined}>
          {activeTool && <Scan3DViewer launch={toolLaunch} />}
          {!activeTool && <>
          {isDemoProject(active) && tab === 'database' && (
            <div className="card pad" style={{ marginBottom: 14, borderColor: 'var(--accent)', display: 'flex', gap: 10, alignItems: 'center' }}>
              <AlertTriangle size={18} color="var(--accent)" />
              <div style={{ fontSize: '.85rem' }}>Showing Epicollect5’s public demo project. Choose a real project from the selector, or add one in <button className="btn btn-sm btn-primary" style={{ padding: '2px 8px' }} onClick={() => setTab('contribute')}>Contribute</button></div>
            </div>
          )}
          {active !== ALL && !isDemoProject(active) && tab === 'database' && !loading && stats.total > 0 && stats.withPhoto === 0
            && !entries.every(e => e.scanUrl || e.videoUrl) && (
            <div className="card pad" style={{ marginBottom: 14, borderColor: 'var(--warn)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <AlertTriangle size={18} color="var(--warn)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: '.85rem' }}>
                This project has entries but <strong>no Photo field</strong>, so there are no images to analyse yet. Add a <span className="mono">Photo</span> question to its Epicollect5 form so contributors can attach a specimen photo next to the marker — the calibration analysis lights up automatically. You can still browse the metadata below.
              </div>
            </div>
          )}
          {errors.length > 0 && tab === 'database' && (
            <div className="card pad" style={{ marginBottom: 14, borderColor: 'var(--danger)', color: 'var(--danger)', fontSize: '.82rem' }}>
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          {activeRef && tab === 'database' && (
            <div className="card pad" style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '.82rem' }}>
              <BookText size={16} color="var(--accent2)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div><strong>Reference:</strong> {activeRef.text} <a href={activeRef.url} target="_blank" rel="noreferrer">{/pubmed|ncbi\.nlm/i.test(activeRef.url) ? 'PubMed' : /github\.com/i.test(activeRef.url) ? 'GitHub' : 'Source'} ↗</a></div>
            </div>
          )}
          {tab === 'database' ? (
            <Database entries={visibleEntries} query={query} loading={loading} hasNext={hasNext} showProject={active === ALL}
              onLoadMore={() => load(active, page + 1, false)} onMarkerChanged={onMarkerChanged} onContaminationChanged={onContaminationChanged} onOpenTool={openTool} onHideImage={onHideImage}
              currentUserId={currentUserId} onDeleteUpload={onDeleteUpload} />
          ) : tab === 'dashboard' ? (
            <Dashboard />
          ) : tab === 'datasets' ? (
            <Datasets projects={visibleProjects} onOpen={changeActive} />
          ) : tab === 'metadata' ? (
            <MetadataReview />
          ) : tab === 'enrich' ? (
            <MetadataEditor projects={visibleProjects} onProjectsChange={refreshProjects} />
          ) : tab === 'admin' && admin ? (
            <Admin projects={projects} hidden={hidden} myId={auth.session?.user?.id} onChanged={reloadHidden} />
          ) : tab === 'contribute' ? (
            <Contribute projects={visibleProjects} active={active} onChangeActive={changeActive} onProjectsChange={refreshProjects} />
          ) : tab === 'export' ? (
            <ExportShare entries={visibleEntries} label={activeLabel} stats={stats} />
          ) : (
            <About />
          )}
          </>}
        </main>
      </div>
    </div>
  );
}
