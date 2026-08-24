import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, Images, ImageIcon, Sprout, MapPin, CalendarRange, FolderTree, CheckCircle2, LineChart, TrendingUp, Thermometer, ArrowRightLeft } from 'lucide-react';
import type { Ec5Entry } from '../types';
import { fetchAllComplete, getProjects, projectName } from '../api/epicollect';
import { allResults, type AnalysisResult } from '../lib/cose-results';
import { loadWorld, countryOf, featurePath, type GeoFeature } from '../lib/geo';

// A palette derived from the CoSE accent pair, cycled for categorical series.
const PALETTE = ['#3b6ea5', '#3fb6a8', '#6a8ec2', '#57c2b4', '#8aa9cf', '#7bccc0', '#b7791f', '#9c6ea0'];

export const Dashboard: React.FC = () => {
  const [entries, setEntries] = useState<Ec5Entry[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [disabled, setDisabled] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    fetchAllComplete(getProjects().map(p => p.slug)).then(r => {
      if (!alive) return;
      setEntries(r.entries); setErrors(r.errors);
    });
    return () => { alive = false; };
  }, []);

  const projectsInData = useMemo(() => entries ? [...new Set(entries.map(e => e.project))] : [], [entries]);
  const data = useMemo(() => (entries || []).filter(e => !disabled.has(e.project)), [entries, disabled]);
  const toggle = (slug: string) => setDisabled(p => { const n = new Set(p); n.has(slug) ? n.delete(slug) : n.add(slug); return n; });

  const agg = useMemo(() => computeAggregates(data), [data]);

  // World country polygons (bundled GeoJSON), loaded once for the choropleth.
  const [world, setWorld] = useState<GeoFeature[] | null>(null);
  useEffect(() => { let a = true; loadWorld(import.meta.env.BASE_URL).then(w => a && setWorld(w)).catch(() => {}); return () => { a = false; }; }, []);

  // Count geotagged images per country by point-in-polygon (respects toggles).
  const countryCounts = useMemo(() => {
    const m = new Map<string, number>();
    if (!world) return m;
    for (const p of agg.gps) {
      const c = countryOf(world, p.lng, p.lat);
      if (c) m.set(c.name, (m.get(c.name) || 0) + 1);
    }
    return m;
  }, [world, agg.gps]);

  // Tool results (shared same-origin store), aggregated across the loaded images.
  const [toolResults, setToolResults] = useState<AnalysisResult[]>([]);
  useEffect(() => {
    const load = () => allResults().then(setToolResults).catch(() => {});
    load();
    window.addEventListener('focus', load); // pick up results written while a tool tab was open
    return () => window.removeEventListener('focus', load);
  }, []);
  const resultSummary = useMemo(() => summariseResults(toolResults, data), [toolResults, data]);
  const growth = useMemo(() => growthAggregates(data, toolResults), [data, toolResults]);
  const dist = useMemo(() => distributionAggregates(data, toolResults), [data, toolResults]);
  const prePost = useMemo(() => prePostAggregates(data, toolResults), [data, toolResults]);

  // Field explorer
  const [expProject, setExpProject] = useState<string>('');
  useEffect(() => { if (!expProject && projectsInData[0]) setExpProject(projectsInData[0]); }, [projectsInData, expProject]);
  const expFields = useMemo(() => fieldNames(data.filter(e => e.project === expProject)), [data, expProject]);
  const [expField, setExpField] = useState<string>('');
  useEffect(() => { if (expFields.length && !expFields.includes(expField)) setExpField(expFields[0]); }, [expFields, expField]);
  const expValues = useMemo(() => valueCounts(data.filter(e => e.project === expProject), expField), [data, expProject, expField]);

  if (!entries) {
    return <div className="empty"><Loader2 className="spin" /> <div style={{ marginTop: 10 }}>Loading all entries across projects…</div></div>;
  }

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Dashboard</div>
        <h1>Collection analytics</h1>
        <p>An overview of every entry across the connected Epicollect5 projects — {entries.length} entries. Toggle projects to focus the charts.</p>
      </div>

      {errors.length > 0 && <div className="card pad" style={{ marginBottom: 14, borderColor: 'var(--warn)', color: 'var(--warn)', fontSize: '.82rem' }}>{errors.map((e, i) => <div key={i}>{e}</div>)}</div>}

      {projectsInData.length > 1 && (
        <div className="row wrap" style={{ gap: 6, marginBottom: 16, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '.76rem' }}>Projects:</span>
          {projectsInData.map((slug, i) => {
            const on = !disabled.has(slug);
            return (
              <button key={slug} onClick={() => toggle(slug)} className="chip" style={{
                cursor: 'pointer', opacity: on ? 1 : 0.5,
                background: on ? `color-mix(in srgb, ${PALETTE[i % PALETTE.length]} 18%, transparent)` : 'var(--card)',
                color: on ? PALETTE[i % PALETTE.length] : 'var(--muted)',
                borderColor: on ? `color-mix(in srgb, ${PALETTE[i % PALETTE.length]} 45%, transparent)` : 'var(--line)',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 8, background: PALETTE[i % PALETTE.length], display: 'inline-block' }} /> {projectName(slug)}
              </button>
            );
          })}
        </div>
      )}

      <div className="stat-row" style={{ marginBottom: 18 }}>
        <Tile icon={<Images size={13} />} k="Entries" v={agg.total} />
        <Tile icon={<FolderTree size={13} />} k="Projects" v={agg.projects} />
        <Tile icon={<ImageIcon size={13} />} k="With photos" v={agg.withPhoto} accent />
        <Tile icon={<CheckCircle2 size={13} />} k="Analyzed" v={agg.analyzed} teal />
        <Tile icon={<Sprout size={13} />} k="Species" v={agg.speciesCount} />
        <Tile icon={<MapPin size={13} />} k="GPS-tagged" v={agg.gpsCount} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', marginBottom: 16 }}>
        <div className="card pad">
          <div className="card-title"><FolderTree /> Entries per project</div>
          <HBar data={agg.byProject} colorFor={(_, i) => PALETTE[i % PALETTE.length]} />
        </div>
        <div className="card pad">
          <div className="card-title"><Sprout /> Top species</div>
          {agg.topSpecies.length ? <HBar data={agg.topSpecies} colorFor={() => 'var(--accent2)'} />
            : <p className="muted" style={{ fontSize: '.85rem' }}>No species field detected in these entries.</p>}
        </div>
      </div>

      {resultSummary.length > 0 && (
        <div className="card pad" style={{ marginBottom: 16 }}>
          <div className="card-title"><LineChart /> Analysis results summary</div>
          <p className="muted" style={{ fontSize: '.8rem', marginTop: -6, marginBottom: 12 }}>Averaged across images analysed by the sibling tools and written back to the shared store.</p>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
            {resultSummary.map((t, i) => (
              <div key={t.tool} className="card pad" style={{ background: 'var(--bg)' }}>
                <div className="row sb" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong style={{ fontSize: '.9rem', color: PALETTE[i % PALETTE.length] }}>{t.toolName}</strong>
                  <span className="chip">{t.images} image{t.images === 1 ? '' : 's'}</span>
                </div>
                <dl className="kv">
                  {t.metrics.map(m => (
                    <React.Fragment key={m.k}>
                      <dt>{m.k}</dt>
                      <dd>{m.mean.toFixed(m.mean >= 100 ? 0 : 2)}{m.unit ? ` ${m.unit}` : ''} <span className="muted">· n={m.n}</span></dd>
                    </React.Fragment>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      )}

      {growth.harvestRange && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', marginBottom: 16 }}>
          {growth.volumeSeries.length > 0 && (
            <div className="card pad">
              <div className="card-title"><TrendingUp /> Volume by harvest</div>
              <p className="muted" style={{ fontSize: '.78rem', marginTop: -6, marginBottom: 10 }}>Computed by the 3D-scan analysis (Database → "Compute volumes"), grouped by tube.</p>
              <LineChartSvg series={growth.volumeSeries} xMin={growth.harvestRange[0]} xMax={growth.harvestRange[1]} yUnit="cm³" />
            </div>
          )}
          {(growth.minSeries.length > 0 || growth.maxSeries.length > 0) && (
            <div className="card pad">
              <div className="card-title"><Thermometer /> Temperature range by harvest</div>
              <p className="muted" style={{ fontSize: '.78rem', marginTop: -6, marginBottom: 10 }}>OCR-read off each thermal photo's colorbar (Database → "Read thermal data"); dashed = frame min, solid = frame max, one colour per tube.</p>
              <LineChartSvg series={[...growth.maxSeries, ...growth.minSeries.map(s => ({ ...s, dashed: true }))]} xMin={growth.harvestRange[0]} xMax={growth.harvestRange[1]} yUnit="°C" />
            </div>
          )}
        </div>
      )}

      {(dist.thermalMin.length > 0 || dist.thermalMax.length > 0 || dist.volumes.length > 0) && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', marginBottom: 16 }}>
          {(dist.thermalMin.length > 0 || dist.thermalMax.length > 0) && (
            <div className="card pad">
              <div className="card-title"><Thermometer /> Temperature distribution</div>
              <p className="muted" style={{ fontSize: '.78rem', marginTop: -6, marginBottom: 10 }}>Every OCR-read frame min/max across the loaded thermal photos, binned.</p>
              <StatsRow values={[...dist.thermalMin, ...dist.thermalMax]} unit="°C" />
              <HistogramSvg
                unit="°C"
                series={[
                  { label: 'Frame min', color: PALETTE[4 % PALETTE.length], values: dist.thermalMin },
                  { label: 'Frame max', color: PALETTE[0], values: dist.thermalMax },
                ]}
              />
            </div>
          )}
          {dist.volumes.length > 0 && (
            <div className="card pad">
              <div className="card-title"><TrendingUp /> Volume distribution</div>
              <p className="muted" style={{ fontSize: '.78rem', marginTop: -6, marginBottom: 10 }}>Every computed 3D-scan volume across the loaded entries, binned.</p>
              <StatsRow values={dist.volumes} unit=" cm³" />
              <HistogramSvg unit="cm³" series={[{ label: 'Volume', color: PALETTE[2 % PALETTE.length], values: dist.volumes }]} />
            </div>
          )}
        </div>
      )}

      {prePost.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', marginBottom: 16 }}>
          <div className="card pad">
            <div className="card-title"><ArrowRightLeft /> Pre → Post volume (MDRS mission)</div>
            <p className="muted" style={{ fontSize: '.78rem', marginTop: -6, marginBottom: 10 }}>Per-tube volume before vs. after the mission rotation.</p>
            <div style={{ overflowX: 'auto' }}>
              <table className="mono" style={{ width: '100%', fontSize: '.8rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left' }}><th>Tube</th><th>Pre cm³</th><th>Post cm³</th><th>Δ cm³</th><th>Δ%</th></tr>
                </thead>
                <tbody>
                  {prePost.map(r => {
                    const both = r.pre != null && r.post != null;
                    const delta = both ? r.post! - r.pre! : null;
                    const pct = both && r.pre !== 0 ? (delta! / r.pre!) * 100 : null;
                    return (
                      <tr key={r.tube} style={{ borderTop: '1px solid var(--line)' }}>
                        <td>Tube {r.tube}</td>
                        <td>{r.pre != null ? r.pre.toFixed(1) : '—'}</td>
                        {r.post != null ? (
                          <>
                            <td>{r.post.toFixed(1)}</td>
                            <td>{delta! >= 0 ? '+' : ''}{delta!.toFixed(1)}</td>
                            <td>{pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%` : '—'}</td>
                          </>
                        ) : (
                          <td colSpan={3} className="muted">{r.note || '—'}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card pad">
            <div className="card-title"><Sprout /> Pre vs Post volume, per tube</div>
            <p className="muted" style={{ fontSize: '.78rem', marginTop: -6, marginBottom: 10 }}>Each point is one tube; above the dashed line means it grew.</p>
            <ScatterSvg
              unit="cm³"
              color={PALETTE[0]}
              points={prePost.filter(r => r.pre != null && r.post != null).map(r => ({ x: r.pre!, y: r.post!, label: `T${r.tube}` }))}
            />
          </div>
          <div className="card pad">
            <div className="card-title"><TrendingUp /> Pre vs Post volume distribution</div>
            <p className="muted" style={{ fontSize: '.78rem', marginTop: -6, marginBottom: 10 }}>Every tube's volume, pooled by mission stage.</p>
            <HistogramSvg
              unit="cm³"
              series={[
                { label: 'Pre', color: PALETTE[4 % PALETTE.length], values: prePost.map(r => r.pre).filter((v): v is number => v != null) },
                { label: 'Post', color: PALETTE[0], values: prePost.map(r => r.post).filter((v): v is number => v != null) },
              ]}
            />
          </div>
        </div>
      )}

      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="card-title"><CalendarRange /> Entries over time</div>
        {agg.byMonth.length ? <MonthBars data={agg.byMonth} /> : <p className="muted" style={{ fontSize: '.85rem' }}>No dated entries.</p>}
      </div>

      {agg.gps.length > 0 && (
        <div className="card pad" style={{ marginBottom: 16 }}>
          <div className="card-title"><MapPin /> Images by country ({countryCounts.size} countr{countryCounts.size === 1 ? 'y' : 'ies'}, {agg.gps.length} geotagged)</div>
          <WorldMap
            world={world}
            countryCounts={countryCounts}
            points={agg.gps}
            colorFor={slug => PALETTE[Math.max(0, projectsInData.indexOf(slug)) % PALETTE.length]}
          />
        </div>
      )}

      <div className="card pad">
        <div className="card-title"><BarChart3 /> Metadata field explorer</div>
        <p className="muted" style={{ fontSize: '.8rem', marginTop: -6, marginBottom: 12 }}>Pick a project and one of its form fields to see how the answers are distributed.</p>
        <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
          <select className="select" style={{ width: 'auto', maxWidth: 260 }} value={expProject} onChange={e => setExpProject(e.target.value)}>
            {projectsInData.map(s => <option key={s} value={s}>{projectName(s)}</option>)}
          </select>
          <select className="select" style={{ width: 'auto', maxWidth: 320 }} value={expField} onChange={e => setExpField(e.target.value)}>
            {expFields.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        {expValues.length ? <HBar data={expValues} colorFor={() => 'var(--accent)'} />
          : <p className="muted" style={{ fontSize: '.85rem' }}>No answers recorded for this field.</p>}
      </div>
    </div>
  );
};

// ---- tiles ----
const Tile: React.FC<{ icon: React.ReactNode; k: string; v: number; accent?: boolean; teal?: boolean }> = ({ icon, k, v, accent, teal }) => (
  <div className="stat"><div className="k">{icon} {k}</div><div className={`v ${accent ? 'accent' : ''} ${teal ? 'teal' : ''}`}>{v}</div></div>
);

// ---- horizontal bar chart (divs, responsive, theme-aware) ----
const HBar: React.FC<{ data: { label: string; value: number }[]; colorFor: (d: { label: string; value: number }, i: number) => string }> = ({ data, colorFor }) => {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="grid" style={{ gap: 7 }}>
      {data.map((d, i) => (
        <div key={i} title={`${d.label}: ${d.value}`}>
          <div className="row sb" style={{ justifyContent: 'space-between', fontSize: '.78rem', marginBottom: 3 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{d.label}</span>
            <span className="mono muted">{d.value}</span>
          </div>
          <div style={{ height: 8, borderRadius: 5, background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{ width: `${(d.value / max) * 100}%`, height: '100%', background: colorFor(d, i), borderRadius: 5, transition: 'width .3s' }} />
          </div>
        </div>
      ))}
    </div>
  );
};

// ---- monthly vertical bars ----
const MonthBars: React.FC<{ data: { label: string; value: number }[] }> = ({ data }) => {
  const max = Math.max(1, ...data.map(d => d.value));
  const step = Math.ceil(data.length / 12);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 160, overflowX: 'auto', paddingTop: 8 }}>
      {data.map((d, i) => (
        <div key={i} title={`${d.label}: ${d.value}`} style={{ flex: '1 0 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', minWidth: 14 }}>
          <span style={{ fontSize: '.62rem', color: 'var(--muted)', marginBottom: 2 }}>{d.value || ''}</span>
          <div style={{ width: '70%', height: `${(d.value / max) * 100}%`, minHeight: d.value ? 3 : 0, background: 'var(--accent)', borderRadius: '3px 3px 0 0' }} />
          <span style={{ fontSize: '.56rem', color: 'var(--muted)', marginTop: 4, transform: 'rotate(-45deg)', whiteSpace: 'nowrap', transformOrigin: 'center', height: 26 }}>
            {i % step === 0 ? d.label : ''}
          </span>
        </div>
      ))}
    </div>
  );
};

// ---- line chart (one polyline per series, x = integer harvest number) ----
// Gaps in x are real (not every harvest/tube combination has data) — drawn as
// broken segments rather than interpolated across, so the chart doesn't imply
// data that isn't there.
interface LineSeries { label: string; color: string; points: { x: number; y: number }[]; dashed?: boolean; }
const LineChartSvg: React.FC<{ series: LineSeries[]; xMin: number; xMax: number; yUnit?: string }> = ({ series, xMin, xMax, yUnit }) => {
  const W = 640, H = 240, padL = 40, padR = 14, padT = 12, padB = 26;
  const c = readVars({ '--line': '#e5e9f0', '--muted': '#5a6473' });
  const allY = series.flatMap(s => s.points.map(p => p.y));
  const yMin = Math.min(0, ...allY, 0);
  const yMax = Math.max(1, ...allY) * 1.1;
  const xOf = (v: number) => padL + (xMax > xMin ? (v - xMin) / (xMax - xMin) : 0.5) * (W - padL - padR);
  const yOf = (v: number) => H - padB - ((v - yMin) / Math.max(1e-9, yMax - yMin)) * (H - padT - padB);

  // Contiguous runs only (no line drawn across a missing harvest).
  const runsOf = (points: { x: number; y: number }[]) => {
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const runs: { x: number; y: number }[][] = [];
    for (const p of sorted) {
      const last = runs[runs.length - 1];
      if (last && p.x === last[last.length - 1].x + 1) last.push(p);
      else runs.push([p]);
    }
    return runs;
  };

  const ticks = Array.from({ length: Math.max(0, xMax - xMin) + 1 }, (_, i) => xMin + i);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 380, display: 'block' }}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={xOf(v)} y1={padT} x2={xOf(v)} y2={H - padB} stroke={c['--line']} strokeWidth={0.5} />
            <text x={xOf(v)} y={H - padB + 13} fontSize={9} textAnchor="middle" fill={c['--muted']}>{v}</text>
          </g>
        ))}
        <text x={W / 2} y={H - 2} fontSize={9} textAnchor="middle" fill={c['--muted']}>harvest #</text>
        {series.map((s, si) => (
          <g key={si}>
            {runsOf(s.points).map((run, ri) => (
              <polyline key={ri} points={run.map(p => `${xOf(p.x)},${yOf(p.y)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '4 3' : undefined} />
            ))}
            {s.points.map((p, pi) => (
              <circle key={pi} cx={xOf(p.x)} cy={yOf(p.y)} r={2.6} fill={s.color}>
                <title>{`${s.label} · Harvest ${p.x}: ${p.y.toFixed(2)}${yUnit ? ' ' + yUnit : ''}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <div className="row wrap" style={{ gap: 10, marginTop: 6 }}>
        {series.map((s, i) => (
          <span key={i} className="row muted" style={{ gap: 4, alignItems: 'center', fontSize: '.72rem' }}>
            <span style={{ width: 14, height: 0, borderTop: `2px ${s.dashed ? 'dashed' : 'solid'} ${s.color}`, display: 'inline-block' }} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
};

// ---- histogram (grouped bars per bin, one or more overlaid series) ----
// Rounds a raw bin width up to a "nice" 1/2/5×10^n step so bin edges land on
// sensible numbers instead of e.g. 1.73°C.
function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

interface HistSeries { label: string; color: string; values: number[]; }
const HistogramSvg: React.FC<{ series: HistSeries[]; unit?: string; targetBins?: number }> = ({ series, unit, targetBins = 7 }) => {
  const all = series.flatMap(s => s.values);
  const c = readVars({ '--line': '#e5e9f0', '--muted': '#5a6473' });
  if (!all.length) return <p className="muted" style={{ fontSize: '.85rem' }}>No data yet.</p>;

  const step = niceStep((Math.max(...all) - Math.min(...all)) / targetBins || 1);
  const lo = Math.floor(Math.min(...all) / step) * step;
  const hi = Math.ceil(Math.max(...all) / step) * step;
  const nBins = Math.max(1, Math.round((hi - lo) / step));
  const binned = series.map(s => {
    const counts = new Array(nBins).fill(0);
    for (const v of s.values) counts[Math.min(nBins - 1, Math.max(0, Math.floor((v - lo) / step)))]++;
    return { ...s, counts };
  });
  const maxCount = Math.max(1, ...binned.flatMap(b => b.counts));

  const W = 640, H = 220, padL = 28, padR = 10, padT = 10, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const groupW = plotW / nBins;
  const gap = 2;
  const barW = Math.max(1, (groupW - gap * (binned.length + 1)) / binned.length);
  const tickEvery = Math.max(1, Math.ceil(nBins / 8));

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 380, display: 'block' }}>
        {binned.map((s, si) => s.counts.map((count, bi) => {
          if (!count) return null;
          const x = padL + bi * groupW + gap + si * (barW + gap);
          const h = (count / maxCount) * plotH;
          return (
            <rect key={`${si}-${bi}`} x={x} y={H - padB - h} width={barW} height={h} fill={s.color} rx={1}>
              <title>{`${s.label}: ${count} in [${(lo + bi * step).toFixed(1)}, ${(lo + (bi + 1) * step).toFixed(1)})${unit ? ' ' + unit : ''}`}</title>
            </rect>
          );
        }))}
        {Array.from({ length: nBins + 1 }, (_, i) => i).filter(i => i % tickEvery === 0).map(i => (
          <text key={i} x={padL + i * groupW} y={H - padB + 12} fontSize={8} textAnchor="middle" fill={c['--muted']}>{(lo + i * step).toFixed(step < 1 ? 1 : 0)}</text>
        ))}
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke={c['--line']} strokeWidth={0.75} />
      </svg>
      <div className="row wrap" style={{ gap: 10, marginTop: 6 }}>
        {series.map((s, i) => (
          <span key={i} className="row muted" style={{ gap: 4, alignItems: 'center', fontSize: '.72rem' }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, display: 'inline-block' }} /> {s.label} (n={s.values.length})
          </span>
        ))}
      </div>
    </div>
  );
};

// ---- descriptive stats row (n / mean / median / range) ----
function basicStats(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const std = Math.sqrt(sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return { n, mean, median, std, min: sorted[0], max: sorted[n - 1] };
}
const StatsRow: React.FC<{ values: number[]; unit?: string; digits?: number }> = ({ values, unit = '', digits = 1 }) => {
  const s = basicStats(values);
  if (!s) return null;
  const f = (n: number) => n.toFixed(digits);
  return (
    <div className="row wrap muted" style={{ gap: 12, fontSize: '.74rem', marginBottom: 8 }}>
      <span>n={s.n}</span>
      <span>mean {f(s.mean)}{unit}</span>
      <span>median {f(s.median)}{unit}</span>
      <span>range {f(s.min)}–{f(s.max)}{unit}</span>
      <span>σ {f(s.std)}{unit}</span>
    </div>
  );
};

// ---- scatter plot with a y=x reference line (for a paired before/after metric) ----
interface ScatterPoint { x: number; y: number; label: string; }
const ScatterSvg: React.FC<{ points: ScatterPoint[]; unit?: string; color?: string }> = ({ points, unit = '', color }) => {
  const c = readVars({ '--line': '#e5e9f0', '--muted': '#5a6473', '--accent': '#3b6ea5', '--card': '#ffffff' });
  if (!points.length) return <p className="muted" style={{ fontSize: '.85rem' }}>No paired data yet.</p>;

  const dotColor = color || c['--accent'];
  const all = points.flatMap(p => [p.x, p.y]);
  const lo = Math.min(0, ...all), hi = Math.max(...all) * 1.08;
  const W = 320, H = 320, pad = 34;
  const s = (v: number) => pad + ((v - lo) / Math.max(1e-9, hi - lo)) * (W - pad * 2);
  // SVG y grows downward, so the value axis is flipped relative to s().
  const sy = (v: number) => H - pad - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - pad * 2);
  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => lo + (i / ticks) * (hi - lo));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 340, display: 'block', margin: '0 auto' }}>
      {tickVals.map((v, i) => (
        <g key={i}>
          <line x1={s(v)} y1={pad} x2={s(v)} y2={H - pad} stroke={c['--line']} strokeWidth={0.5} />
          <line x1={pad} y1={sy(v)} x2={W - pad} y2={sy(v)} stroke={c['--line']} strokeWidth={0.5} />
          <text x={s(v)} y={H - pad + 12} fontSize={8} textAnchor="middle" fill={c['--muted']}>{v.toFixed(0)}</text>
          <text x={pad - 5} y={sy(v) + 3} fontSize={8} textAnchor="end" fill={c['--muted']}>{v.toFixed(0)}</text>
        </g>
      ))}
      {/* y=x reference: points above this line grew, below shrank */}
      <line x1={s(lo)} y1={sy(lo)} x2={s(hi)} y2={sy(hi)} stroke={c['--muted']} strokeWidth={1} strokeDasharray="3 3" />
      {points.map((p, i) => (
        <circle key={i} cx={s(p.x)} cy={sy(p.y)} r={5} fill={dotColor} stroke={c['--card']} strokeWidth={1}>
          <title>{`${p.label}: pre ${p.x.toFixed(1)}${unit}, post ${p.y.toFixed(1)}${unit}`}</title>
        </circle>
      ))}
      {points.map((p, i) => (
        <text key={`l${i}`} x={s(p.x)} y={sy(p.y) - 8} fontSize={8} textAnchor="middle" fill={c['--muted']}>{p.label}</text>
      ))}
      <text x={W / 2} y={H - 4} fontSize={9} textAnchor="middle" fill={c['--muted']}>Pre {unit}</text>
      <text x={10} y={H / 2} fontSize={9} textAnchor="middle" fill={c['--muted']} transform={`rotate(-90 10 ${H / 2})`}>Post {unit}</text>
    </svg>
  );
};

// Resolve a CSS custom property to a concrete colour. SVG presentation
// attributes (fill=/stroke=) do NOT accept var() in Safari/WebKit, so we read
// the value and pass a literal colour instead — renders in every browser.
function readVars(names: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const cs = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  for (const [k, fallback] of Object.entries(names)) out[k] = (cs?.getPropertyValue(k).trim() || fallback);
  return out;
}

// ---- colour helpers (concrete hex, so SVG fill works in every browser) ----
function parseColor(s: string): [number, number, number] {
  s = s.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  }
  const m = s.match(/[\d.]+/g);
  return m ? [+m[0], +m[1], +m[2]] : [0, 0, 0];
}
const toHex = (c: number[]) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a: string, b: string, t: number) => { const ca = parseColor(a), cb = parseColor(b); return toHex([0, 1, 2].map(i => ca[i] + (cb[i] - ca[i]) * t)); };

// ---- World choropleth (equirectangular; countries shaded by image count) ----
const WorldMap: React.FC<{
  world: GeoFeature[] | null;
  countryCounts: Map<string, number>;
  points: { lat: number; lng: number; label: string; project: string }[];
  colorFor: (slug: string) => string;
}> = ({ world, countryCounts, points, colorFor }) => {
  const W = 720, H = 360;
  const x = (lng: number) => ((lng + 180) / 360) * W;
  const y = (lat: number) => ((90 - lat) / 180) * H;
  const c = readVars({ '--line': '#e5e9f0', '--muted': '#5a6473', '--accent': '#3b6ea5', '--accent2': '#3fb6a8', '--bg': '#ffffff', '--card': '#ffffff' });

  const ocean = mix(c['--accent'], c['--bg'], 0.9);          // faint blue sea
  const land0 = mix(c['--muted'], c['--bg'], 0.82);          // neutral land, no images
  // Discrete count bins with a distinct green→red ramp — far easier to tell
  // apart than a single-hue gradient when counts are skewed (e.g. 143 vs 1).
  const BINS = [
    { min: 1, max: 1, label: '1', color: '#4da64d' },
    { min: 2, max: 5, label: '2–5', color: '#a6d96a' },
    { min: 6, max: 20, label: '6–20', color: '#fee08b' },
    { min: 21, max: 100, label: '21–100', color: '#fc8d3c' },
    { min: 101, max: Infinity, label: '100+', color: '#d7191c' },
  ];
  const maxCount = Math.max(0, ...countryCounts.values());
  const binFor = (n: number) => { let b = BINS[0]; for (const x of BINS) if (n >= x.min) b = x; return b; };
  const fillFor = (name: string) => { const n = countryCounts.get(name) || 0; return n ? binFor(n).color : land0; };
  const shownBins = BINS.filter(b => b.min <= maxCount);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 460, borderRadius: 8, display: 'block' }}>
        {/* ocean */}
        <rect x={0} y={0} width={W} height={H} fill={ocean} stroke={c['--line']} />
        {/* equator + prime meridian for orientation */}
        <line x1={x(0)} y1={0} x2={x(0)} y2={H} stroke={c['--line']} strokeWidth={0.5} strokeOpacity={0.7} />
        <line x1={0} y1={y(0)} x2={W} y2={y(0)} stroke={c['--line']} strokeWidth={0.5} strokeOpacity={0.7} />
        {/* countries — shaded by image count */}
        {world && world.map(f => {
          const n = countryCounts.get(f.name) || 0;
          return (
            <path key={f.name} d={featurePath(f, x, y)} fill={fillFor(f.name)} stroke={n ? mix(fillFor(f.name), '#000000', 0.28) : c['--card']} strokeWidth={n ? 0.5 : 0.4} strokeLinejoin="round">
              <title>{`${f.name}: ${n} image${n === 1 ? '' : 's'}`}</title>
            </path>
          );
        })}
        {!world && <text x={W / 2} y={H / 2} fontSize={12} fill={c['--muted']} textAnchor="middle">Loading world map…</text>}
        {/* exact geotagged points (small, on top of the choropleth) */}
        {points.map((p, i) => (
          <circle key={i} cx={x(p.lng)} cy={y(p.lat)} r={2.4} fill={colorFor(p.project)} fillOpacity={0.9} stroke={c['--bg']} strokeWidth={0.5}>
            <title>{`${p.label} — ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="row wrap muted" style={{ fontSize: '.72rem', marginTop: 8, gap: 12, alignItems: 'center' }}>
        <span style={{ fontWeight: 500 }}>images / country:</span>
        {shownBins.map(b => (
          <span key={b.label} className="row" style={{ gap: 4, alignItems: 'center' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: b.color, display: 'inline-block', border: `1px solid ${mix(b.color, '#000000', 0.28)}` }} /> {b.label}
          </span>
        ))}
        <span className="row" style={{ gap: 4, alignItems: 'center' }}><span style={{ width: 12, height: 12, borderRadius: 3, background: land0, display: 'inline-block', border: `1px solid ${c['--line']}` }} /> none</span>
      </div>
    </div>
  );
};

// ---- aggregation ----
function computeAggregates(entries: Ec5Entry[]) {
  const byProjectMap = new Map<string, number>();
  const speciesMap = new Map<string, number>();
  const monthMap = new Map<string, number>();
  const gps: { lat: number; lng: number; label: string; project: string }[] = [];
  let withPhoto = 0, analyzed = 0;

  for (const e of entries) {
    byProjectMap.set(e.project, (byProjectMap.get(e.project) || 0) + 1);
    if (e.photoUrl) withPhoto++;
    if (e.marker?.markerFound) analyzed++;
    if (e.species) speciesMap.set(e.species, (speciesMap.get(e.species) || 0) + 1);
    if (e.gps) gps.push({ ...e.gps, label: e.title, project: e.project });
    const d = e.createdAt || e.uploadedAt;
    if (d && d.length >= 7) monthMap.set(d.slice(0, 7), (monthMap.get(d.slice(0, 7)) || 0) + 1);
  }

  const byProject = [...byProjectMap.entries()].sort((a, b) => b[1] - a[1]).map(([slug, v]) => ({ label: projectName(slug), value: v }));
  const topSpecies = [...speciesMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value }));
  const byMonth = fillMonths(monthMap);

  return {
    total: entries.length,
    projects: byProjectMap.size,
    withPhoto, analyzed,
    speciesCount: speciesMap.size,
    gpsCount: gps.length, gps,
    byProject, topSpecies, byMonth,
  };
}

// Continuous month buckets from earliest to latest so gaps render as zero bars.
function fillMonths(m: Map<string, number>): { label: string; value: number }[] {
  const keys = [...m.keys()].sort();
  if (!keys.length) return [];
  const [ys, ms] = keys[0].split('-').map(Number);
  const [ye, me] = keys[keys.length - 1].split('-').map(Number);
  const out: { label: string; value: number }[] = [];
  let y = ys, mo = ms;
  for (let guard = 0; guard < 240; guard++) {
    const key = `${y}-${String(mo).padStart(2, '0')}`;
    out.push({ label: key, value: m.get(key) || 0 });
    if (y === ye && mo === me) break;
    mo++; if (mo > 12) { mo = 1; y++; }
  }
  return out;
}

// Pulls "Harvest 5 · Tube 1" (the tube-time-series-2024 dataset's `treatment`
// convention) out of an entry's fields. Generic — entries without a matching
// field just don't participate in the harvest trend charts below.
function harvestTubeOf(e: Ec5Entry): { harvest: number; tube: number } | null {
  const f = e.fields.find(f => f.name.toLowerCase() === 'treatment');
  if (!f) return null;
  const m = f.value.match(/harvest\s*(\d+)\s*[·:]\s*tube\s*(\d+)/i);
  return m ? { harvest: parseInt(m[1], 10), tube: parseInt(m[2], 10) } : null;
}

// Volume (from the 3D-scan batch analysis, joined through the shared
// cose-results store) and thermal min/max (already on the entry, from the
// thermal-OCR batch), grouped by tube and harvest number, averaged when a
// tube/harvest has more than one reading. Missing harvest/tube combinations
// are simply absent — LineChartSvg draws that as a gap, not an interpolation.
function growthAggregates(entries: Ec5Entry[], toolResults: AnalysisResult[]) {
  const volumeByRef = new Map(toolResults.filter(r => r.tool === 'scan3d-viewer').map(r => [r.ref, r]));
  const volumeByTube = new Map<number, Map<number, number[]>>();
  const minByTube = new Map<number, Map<number, number[]>>();
  const maxByTube = new Map<number, Map<number, number[]>>();
  const bump = (store: Map<number, Map<number, number[]>>, tube: number, harvest: number, v: number) => {
    if (!store.has(tube)) store.set(tube, new Map());
    const byHarvest = store.get(tube)!;
    if (!byHarvest.has(harvest)) byHarvest.set(harvest, []);
    byHarvest.get(harvest)!.push(v);
  };

  const harvestNumbers: number[] = [];
  for (const e of entries) {
    const ht = harvestTubeOf(e);
    if (!ht) continue;
    harvestNumbers.push(ht.harvest);
    if (e.scanUrl) {
      const raw = volumeByRef.get(`${e.project}::${e.uuid}`)?.metrics['Volume'];
      const v = raw != null ? parseFloat(String(raw)) : NaN;
      if (!Number.isNaN(v)) bump(volumeByTube, ht.tube, ht.harvest, v);
    }
    if (e.mediaKind === 'thermal' && e.thermal) {
      if (e.thermal.minC != null) bump(minByTube, ht.tube, ht.harvest, e.thermal.minC);
      if (e.thermal.maxC != null) bump(maxByTube, ht.tube, ht.harvest, e.thermal.maxC);
    }
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const toSeries = (store: Map<number, Map<number, number[]>>): LineSeries[] =>
    [...store.entries()].sort((a, b) => a[0] - b[0]).map(([tube, byHarvest], i) => ({
      label: `Tube ${tube}`, color: PALETTE[i % PALETTE.length],
      points: [...byHarvest.entries()].sort((a, b) => a[0] - b[0]).map(([h, vals]) => ({ x: h, y: avg(vals) })),
    }));

  return {
    harvestRange: harvestNumbers.length ? [Math.min(...harvestNumbers), Math.max(...harvestNumbers)] as [number, number] : null,
    volumeSeries: toSeries(volumeByTube),
    minSeries: toSeries(minByTube),
    maxSeries: toSeries(maxByTube),
  };
}

// Flat pools (not grouped by harvest/tube) of every thermal min/max reading
// and every computed scan volume across the currently-visible entries — the
// distribution shapes behind the "by harvest" trend lines above.
function distributionAggregates(entries: Ec5Entry[], toolResults: AnalysisResult[]) {
  const enabled = new Set(entries.map(e => `${e.project}::${e.uuid}`));
  const thermalMin: number[] = [], thermalMax: number[] = [];
  for (const e of entries) {
    if (e.mediaKind !== 'thermal' || !e.thermal) continue;
    if (e.thermal.minC != null) thermalMin.push(e.thermal.minC);
    if (e.thermal.maxC != null) thermalMax.push(e.thermal.maxC);
  }
  const volumes = toolResults
    .filter(r => r.tool === 'scan3d-viewer' && enabled.has(r.ref))
    .map(r => parseFloat(String(r.metrics['Volume'])))
    .filter(v => !Number.isNaN(v));
  return { thermalMin, thermalMax, volumes };
}

// Pulls "Pre · Tube 3" / "Post · Tube 3" (the mdrs-pre-post-mission dataset's
// `treatment` convention — a two-timepoint mission, not a harvest sequence,
// so it's a separate parser from harvestTubeOf rather than forcing a fake
// harvest number) out of an entry's fields.
function stageOf(e: Ec5Entry): { stage: 'pre' | 'post'; tube: number } | null {
  const f = e.fields.find(f => f.name.toLowerCase() === 'treatment');
  if (!f) return null;
  const m = f.value.match(/^(pre|post)\s*[·:]\s*tube\s*(\d+)/i);
  return m ? { stage: m[1].toLowerCase() as 'pre' | 'post', tube: parseInt(m[2], 10) } : null;
}

// Per-tube Pre/Post volume pairing for a before/after mission comparison.
// Tubes missing one side (e.g. no post-scan) carry that side's dataset note
// (e.g. "tube exploded in transit") rather than a silently blank cell.
interface PrePostRow { tube: number; pre: number | null; post: number | null; note: string | null; }
function prePostAggregates(entries: Ec5Entry[], toolResults: AnalysisResult[]): PrePostRow[] {
  const volumeByRef = new Map(toolResults.filter(r => r.tool === 'scan3d-viewer').map(r => [r.ref, r]));
  const byTube = new Map<number, { pre: number | null; post: number | null; note: string | null }>();
  for (const e of entries) {
    const st = stageOf(e);
    if (!st || !e.scanUrl) continue;
    const row = byTube.get(st.tube) || { pre: null, post: null, note: null };
    const raw = volumeByRef.get(`${e.project}::${e.uuid}`)?.metrics['Volume'];
    const v = raw != null ? parseFloat(String(raw)) : NaN;
    if (!Number.isNaN(v)) row[st.stage] = v;
    const noteField = e.fields.find(f => f.name.toLowerCase() === 'notes');
    if (noteField?.value) row.note = noteField.value;
    byTube.set(st.tube, row);
  }
  return [...byTube.entries()].sort((a, b) => a[0] - b[0]).map(([tube, r]) => ({ tube, ...r }));
}

// Aggregate tool results across the loaded (and project-toggle-enabled) images:
// per tool, the mean of each numeric metric (parsing a leading number + unit).
function summariseResults(results: AnalysisResult[], entries: Ec5Entry[]) {
  const enabled = new Set(entries.map(e => `${e.project}::${e.uuid}`));
  const rel = results.filter(r => enabled.has(r.ref));
  const byTool = new Map<string, { toolName: string; refs: Set<string>; metrics: Map<string, { sum: number; n: number; unit: string }> }>();
  for (const r of rel) {
    let g = byTool.get(r.tool);
    if (!g) { g = { toolName: r.toolName, refs: new Set(), metrics: new Map() }; byTool.set(r.tool, g); }
    g.refs.add(r.ref);
    for (const [k, v] of Object.entries(r.metrics)) {
      const num = parseFloat(String(v));
      if (Number.isNaN(num)) continue;
      const unit = String(v).replace(/^[+\-\d.,]+\s*/, '').trim();
      let m = g.metrics.get(k);
      if (!m) { m = { sum: 0, n: 0, unit }; g.metrics.set(k, m); }
      m.sum += num; m.n++;
    }
  }
  return [...byTool.entries()].map(([tool, g]) => ({
    tool, toolName: g.toolName, images: g.refs.size,
    metrics: [...g.metrics.entries()].map(([k, m]) => ({ k, mean: m.sum / m.n, n: m.n, unit: m.unit })),
  }));
}

function fieldNames(entries: Ec5Entry[]): string[] {
  const set = new Set<string>();
  for (const e of entries) for (const f of e.fields) set.add(f.name);
  return [...set];
}
function valueCounts(entries: Ec5Entry[], fieldName: string): { label: string; value: number }[] {
  const m = new Map<string, number>();
  for (const e of entries) {
    const f = e.fields.find(x => x.name === fieldName);
    if (f && f.value) m.set(f.value, (m.get(f.value) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([label, value]) => ({ label, value }));
}
