// Shared SVG theming helpers, extracted from Dashboard.tsx so other chart-heavy
// tabs (e.g. RnaSeq.tsx) reuse the exact same theme-aware color convention
// instead of duplicating it.

// Resolve a CSS custom property to a concrete colour. SVG presentation
// attributes (fill=/stroke=) do NOT accept var() in Safari/WebKit, so we read
// the value and pass a literal colour instead — renders in every browser.
export function readVars(names: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const cs = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  for (const [k, fallback] of Object.entries(names)) out[k] = (cs?.getPropertyValue(k).trim() || fallback);
  return out;
}

// ---- colour helpers (concrete hex, so SVG fill works in every browser) ----
export function parseColor(s: string): [number, number, number] {
  s = s.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  }
  const m = s.match(/[\d.]+/g);
  return m ? [+m[0], +m[1], +m[2]] : [0, 0, 0];
}
export const toHex = (c: number[]) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export const mix = (a: string, b: string, t: number) => { const ca = parseColor(a), cb = parseColor(b); return toHex([0, 1, 2].map(i => ca[i] + (cb[i] - ca[i]) * t)); };

// A palette derived from the CoSE accent pair, cycled for categorical series.
export const PALETTE = ['#3b6ea5', '#3fb6a8', '#6a8ec2', '#57c2b4', '#8aa9cf', '#7bccc0', '#b7791f', '#9c6ea0'];
