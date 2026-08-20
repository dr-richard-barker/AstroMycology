import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, UploadCloud, Save, Loader2, AlertTriangle, CheckCircle2, RotateCw } from 'lucide-react';
import { createViewer, loadScan, computeStats, formatFromName, metricsForStats, type MeshStats, type Viewer } from '../lib/threed';
import { putResult } from '../lib/cose-results';

interface Props {
  // Reuses the same shape App.tsx hands every tool: `imageUrl` here carries the
  // scan's URL (from a database entry's `scanUrl`), `ref` is the stable
  // `${project}::${uuid}` key results get written back to.
  launch: { imageUrl?: string; ref?: string } | null;
}

const fmt = (n: number, d = 1) => n.toLocaleString(undefined, { maximumFractionDigits: d });

export const Scan3DViewer: React.FC<Props> = ({ launch }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<MeshStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const v = createViewer(containerRef.current);
    viewerRef.current = v;
    return () => v.dispose();
  }, []);

  const load = useCallback(async (source: string | Blob, name: string) => {
    const format = formatFromName(name);
    if (!format) { setErr(`Unrecognized 3D format for "${name}" — expected .ply, .obj, .glb, .gltf, or .stl.`); return; }
    setBusy(true); setErr(null); setSaved(false); setSourceName(name);
    try {
      const obj = await loadScan(source, format);
      viewerRef.current?.setObject(obj);
      setStats(computeStats(obj));
    } catch (e) {
      setStats(null);
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    if (launch?.imageUrl) load(launch.imageUrl, decodeURIComponent(launch.imageUrl).split('/').pop()?.split('?')[0] || 'scan.ply');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch?.imageUrl]);

  const onFiles = (files: FileList | File[] | null) => {
    const f = files?.[0];
    if (f) load(f, f.name);
  };

  const save = async () => {
    if (!stats || !launch?.ref) return;
    const metrics = metricsForStats(stats);
    await putResult({
      ref: launch.ref, imageUrl: launch.imageUrl || '',
      tool: 'scan3d-viewer', toolName: '3D Scan Viewer',
      metrics, generatedAt: new Date().toISOString(),
    });
    setSaved(true);
    window.dispatchEvent(new Event('focus')); // MarkerInspector refreshes results on focus
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 58px)' }}>
      <div className="row sb" style={{ justifyContent: 'space-between', padding: '9px 18px', borderBottom: '1px solid var(--line)', gap: 12, flexShrink: 0 }}>
        <span className="row" style={{ gap: 8, fontWeight: 650, fontSize: '.92rem' }}>
          <Box size={17} color="var(--accent2)" /> 3D Scan Viewer
          {sourceName && <span className="muted" style={{ fontWeight: 400, fontSize: '.8rem' }}>· <span className="mono">{sourceName}</span></span>}
        </span>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => fileRef.current?.click()}>
            <UploadCloud size={14} /> Load a local file
          </button>
          <input ref={fileRef} type="file" accept=".ply,.obj,.glb,.gltf,.stl" hidden onChange={e => onFiles(e.target.files)} />
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div
          ref={containerRef}
          style={{ position: 'relative', flex: 1, minWidth: 0 }}
          onDragOver={e => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={e => { e.preventDefault(); setDragActive(false); onFiles(e.dataTransfer.files); }}
        >
          {dragActive && (
            <div style={{ position: 'absolute', inset: 8, border: '2px dashed var(--accent2)', borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.35)', color: '#fff', pointerEvents: 'none', zIndex: 2 }}>
              Drop a .ply / .obj / .glb / .gltf / .stl file
            </div>
          )}
          {busy && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.35)', zIndex: 1 }}>
              <span className="row" style={{ gap: 8, color: '#fff' }}><Loader2 className="spin" /> Loading scan…</span>
            </div>
          )}
          {!sourceName && !busy && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: '.85rem', pointerEvents: 'none' }}>
              Drop a 3D scan here, or use “Load a local file”
            </div>
          )}
        </div>

        <div className="card pad" style={{ width: 300, flexShrink: 0, overflowY: 'auto', borderRadius: 0, borderTop: 0, borderRight: 0, borderBottom: 0 }}>
          <div className="card-title"><RotateCw size={15} /> Scan stats</div>
          {err && (
            <p style={{ color: 'var(--danger)', fontSize: '.82rem', display: 'flex', gap: 6 }}><AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {err}</p>
          )}
          {!stats && !err && (
            <p className="muted" style={{ fontSize: '.85rem' }}>Load a scan to see vertex/face counts, dimensions, volume and surface area — computed entirely in your browser.</p>
          )}
          {stats && (
            <>
              <dl className="kv">
                <dt>Vertices</dt><dd>{fmt(stats.vertexCount, 0)}</dd>
                {stats.parts > 1 && <><dt>Mesh parts</dt><dd>{stats.parts}</dd></>}
                <dt>Dimensions</dt><dd>{fmt(stats.dims.x)} × {fmt(stats.dims.y)} × {fmt(stats.dims.z)} mm</dd>
              </dl>
              {stats.isPointCloudOnly ? (
                <p className="muted" style={{ fontSize: '.8rem', marginTop: 10 }}>Point cloud only (no face indices) — volume and surface area aren't computable from points alone.</p>
              ) : (
                <>
                  <dl className="kv" style={{ marginTop: 4 }}>
                    <dt>Faces</dt><dd>{fmt(stats.faceCount, 0)}</dd>
                    <dt>Volume</dt><dd className="accent">{fmt((stats.volume || 0) / 1000, 2)} cm³</dd>
                    <dt>Surface area</dt><dd>{fmt((stats.area || 0) / 100, 2)} cm²</dd>
                  </dl>
                  <p className="muted" style={{ fontSize: '.72rem', marginTop: 6 }}>Volume/area assume the scan's native units are millimetres (the Revopoint scanner default) — rescale if your scanner uses different units.</p>
                  {!stats.watertight && (
                    <p style={{ color: 'var(--warn)', fontSize: '.8rem', marginTop: 8, display: 'flex', gap: 6 }}>
                      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> This mesh isn't watertight (some edges aren't shared by exactly two faces) — the volume figure may be unreliable.
                    </p>
                  )}
                </>
              )}
              {launch?.ref && (
                <div style={{ marginTop: 14 }}>
                  <button className="btn btn-teal btn-sm" onClick={save} disabled={saved}>
                    {saved ? <CheckCircle2 size={14} /> : <Save size={14} />} {saved ? 'Saved to entry' : 'Save to this entry'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
