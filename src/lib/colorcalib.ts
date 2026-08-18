// Astrocalibration marker support — fully client-side, no network / AI.
//
// Implements the essentials of the PlantCV AstroBotany colour-correction
// workflow (astro_color_matrix + affine_color_correction) for the browser:
//   1. detect the 4 corner ArUco fiducials (js-aruco2, ARUCO_MIP_36h12)
//   2. build a sampling quad from the corners (user-adjustable in the UI)
//   3. sample the 15 reference chips through that quad
//   4. fit a 3x4 affine colour transform source -> Astro standard
//   5. apply it per-pixel in the analysis pipeline
//
// See docs/astrocalibration.md for the marker anatomy and rationale.

export interface Pt { x: number; y: number; }

// The 15-chip AstroBotany standard (pcv.transform.astro_color_matrix()), RGB in
// 0-1. u,v are the chip centre in normalised quad coords (0..1 across the 4
// marker-centre corners TL->TR = u, TL->BL = v), measured from a reference
// marker image. They are only a starting guess — the UI lets the user nudge the
// quad corners to fit their own photo.
export interface AstroChip { id: number; u: number; v: number; std: [number, number, number]; name: string; }

// Canonical LANDSCAPE orientation (marker held with ASTROBOTANY.COM at the top):
// a horizontal colour row over a horizontal grayscale ramp. u,v measured from a
// clean, flat reference photo. Place the corner handles so TL is the top-left
// fiducial (by the "ASTROBOTANY.COM"/plus icon) and the layout maps correctly.
export const ASTRO_CHIPS: AstroChip[] = [
  // colour row (left -> right)
  { id: 10, u: 0.110, v: 0.50, std: [0.18, 0.23, 0.50], name: 'blue' },
  { id: 20, u: 0.279, v: 0.50, std: [0.34, 0.62, 0.25], name: 'green' },
  { id: 30, u: 0.493, v: 0.50, std: [0.71, 0.25, 0.21], name: 'red' },
  { id: 40, u: 0.711, v: 0.50, std: [0.89, 0.81, 0.20], name: 'yellow' },
  { id: 50, u: 0.890, v: 0.50, std: [0.21, 0.22, 0.22], name: 'near-black' },
  // grayscale ramp (white -> dark), left -> right, one row below the colours
  { id: 60, u: 0.130, v: 0.61, std: [0.91, 0.95, 0.93], name: 'gray-0' },
  { id: 70, u: 0.212, v: 0.61, std: [0.82, 0.86, 0.86], name: 'gray-1' },
  { id: 80, u: 0.294, v: 0.61, std: [0.72, 0.75, 0.73], name: 'gray-2' },
  { id: 90, u: 0.377, v: 0.61, std: [0.64, 0.67, 0.64], name: 'gray-3' },
  { id: 100, u: 0.459, v: 0.61, std: [0.57, 0.58, 0.56], name: 'gray-4' },
  { id: 110, u: 0.541, v: 0.61, std: [0.48, 0.49, 0.48], name: 'gray-5' },
  { id: 120, u: 0.623, v: 0.61, std: [0.39, 0.40, 0.39], name: 'gray-6' },
  { id: 130, u: 0.706, v: 0.61, std: [0.33, 0.32, 0.32], name: 'gray-7' },
  { id: 140, u: 0.788, v: 0.61, std: [0.27, 0.28, 0.27], name: 'gray-8' },
  { id: 150, u: 0.870, v: 0.61, std: [0.22, 0.23, 0.23], name: 'gray-9' },
];

// Physical distance between opposite corner-marker centres on the 5 cm card.
// Used to derive pixels/cm from the detected quad.
export const MARKER_SPAN_CM = 4.3;

// --- geometry ---------------------------------------------------------------

// Bilinear map from normalised (u,v) to image space given the 4 corners
// ordered [TL, TR, BR, BL].
export function quadPoint(corners: Pt[], u: number, v: number): Pt {
  const [TL, TR, BR, BL] = corners;
  const top = { x: TL.x + (TR.x - TL.x) * u, y: TL.y + (TR.y - TL.y) * u };
  const bot = { x: BL.x + (BR.x - BL.x) * u, y: BL.y + (BR.y - BL.y) * u };
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
}

// Order 4 unordered points into [TL, TR, BR, BL] by position.
export function orderCorners(pts: Pt[]): Pt[] {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const tl = pts.find(p => p.x <= cx && p.y <= cy);
  const tr = pts.find(p => p.x > cx && p.y <= cy);
  const br = pts.find(p => p.x > cx && p.y > cy);
  const bl = pts.find(p => p.x <= cx && p.y > cy);
  // fall back to angle sort if any quadrant is empty
  if (tl && tr && br && bl) return [tl, tr, br, bl];
  const sorted = [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  return sorted;
}

export function scaleAndRotation(corners: Pt[], spanCm = MARKER_SPAN_CM): { pxPerCm: number; rotationDeg: number } {
  const [TL, TR, , BL] = corners;
  const topLen = Math.hypot(TR.x - TL.x, TR.y - TL.y);
  const leftLen = Math.hypot(BL.x - TL.x, BL.y - TL.y);
  const pxPerCm = ((topLen + leftLen) / 2) / spanCm;
  const rotationDeg = -(Math.atan2(TR.y - TL.y, TR.x - TL.x) * 180) / Math.PI;
  return { pxPerCm, rotationDeg };
}

// --- sampling ---------------------------------------------------------------

export function chipImagePoints(corners: Pt[]): Pt[] {
  return ASTRO_CHIPS.map(c => quadPoint(corners, c.u, c.v));
}

// Median RGB (0-1) in a small square patch around each chip point.
export function sampleChips(data: Uint8ClampedArray, w: number, h: number, pts: Pt[], radius = 6): number[][] {
  const med = (arr: number[]) => { arr.sort((a, b) => a - b); return arr[arr.length >> 1]; };
  return pts.map(p => {
    const R: number[] = [], G: number[] = [], B: number[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = Math.round(p.x + dx), y = Math.round(p.y + dy);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = (y * w + x) * 4;
        R.push(data[i]); G.push(data[i + 1]); B.push(data[i + 2]);
      }
    }
    if (!R.length) return [0, 0, 0];
    return [med(R) / 255, med(G) / 255, med(B) / 255];
  });
}

// --- affine colour fit ------------------------------------------------------

// Solve (A^T A) x = A^T y via Gaussian elimination. A is m x n, y is length m.
function solveNormal(A: number[][], y: number[]): number[] {
  const n = A[0].length;
  const ATA = Array.from({ length: n }, () => new Array(n).fill(0));
  const ATy = new Array(n).fill(0);
  for (let r = 0; r < A.length; r++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) ATA[i][j] += A[r][i] * A[r][j];
      ATy[i] += A[r][i] * y[r];
    }
  }
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(ATA[k][i]) > Math.abs(ATA[p][i])) p = k;
    [ATA[i], ATA[p]] = [ATA[p], ATA[i]];
    [ATy[i], ATy[p]] = [ATy[p], ATy[i]];
    if (Math.abs(ATA[i][i]) < 1e-9) continue;
    for (let k = i + 1; k < n; k++) {
      const f = ATA[k][i] / ATA[i][i];
      for (let j = i; j < n; j++) ATA[k][j] -= f * ATA[i][j];
      ATy[k] -= f * ATy[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = ATy[i];
    for (let j = i + 1; j < n; j++) s -= ATA[i][j] * x[j];
    x[i] = Math.abs(ATA[i][i]) < 1e-9 ? 0 : s / ATA[i][i];
  }
  return x;
}

// Fit a 3x4 affine matrix mapping source RGB (0-1) -> target RGB (0-1).
// Row k = [a, b, c, d] with out_k = a*R + b*G + c*B + d.
export function fitAffineColor(src: number[][], tgt: number[][]): number[][] {
  const A = src.map(s => [s[0], s[1], s[2], 1]);
  return [0, 1, 2].map(k => solveNormal(A, tgt.map(t => t[k])));
}

export function applyAffine(rgb01: number[], M: number[][]): number[] {
  return M.map(m => m[0] * rgb01[0] + m[1] * rgb01[1] + m[2] * rgb01[2] + m[3]);
}

export function residualRMS(src: number[][], tgt: number[][], M: number[][]): number {
  let s = 0;
  for (let i = 0; i < src.length; i++) {
    const c = applyAffine(src[i], M);
    s += (c[0] - tgt[i][0]) ** 2 + (c[1] - tgt[i][1]) ** 2 + (c[2] - tgt[i][2]) ** 2;
  }
  return Math.sqrt(s / src.length);
}

// Convenience: build source+target from an image + quad and fit.
export function fitFromQuad(data: Uint8ClampedArray, w: number, h: number, corners: Pt[]) {
  const pts = chipImagePoints(corners);
  const src = sampleChips(data, w, h, pts);
  const tgt = ASTRO_CHIPS.map(c => c.std);
  const M = fitAffineColor(src, tgt);
  return { matrix: M, residual: residualRMS(src, tgt, M), points: pts, source: src };
}

// Apply the affine transform to a full ImageData in place (values 0-255).
export function applyAffineToImageData(data: Uint8ClampedArray, M: number[][]): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const nr = M[0][0] * r + M[0][1] * g + M[0][2] * b + M[0][3] * 255;
    const ng = M[1][0] * r + M[1][1] * g + M[1][2] * b + M[1][3] * 255;
    const nb = M[2][0] * r + M[2][1] * g + M[2][2] * b + M[2][3] * 255;
    data[i] = nr < 0 ? 0 : nr > 255 ? 255 : nr;
    data[i + 1] = ng < 0 ? 0 : ng > 255 ? 255 : ng;
    data[i + 2] = nb < 0 ? 0 : nb > 255 ? 255 : nb;
  }
}

// --- marker detection --------------------------------------------------------

// js-aruco2's cv.js/aruco.js use the classic global idiom `this.CV = CV` at the
// top level. Bundled as an ES module, top-level `this` is `undefined`, so a plain
// `import('js-aruco2/src/cv.js')` THROWS ("Cannot set properties of undefined
// (setting 'CV')") before any export is usable — which silently killed the whole
// geometric detector in production builds. We instead load the module SOURCE as
// text (Vite `?raw`) and evaluate it against an explicit context object, so
// `this.CV` lands on a real object no matter how the bundler treats `this`.
let cvModulePromise: Promise<any> | null = null;
async function loadCV(): Promise<any> {
  if (cvModulePromise) return cvModulePromise;
  cvModulePromise = (async () => {
    // Primary: raw-source eval with a controlled `this` (bundler-independent).
    try {
      const src: string = (await import('js-aruco2/src/cv.js?raw')).default;
      const ctx: any = {};
      new Function(src).call(ctx);
      if (ctx.CV && ctx.CV.adaptiveThreshold) return ctx.CV;
    } catch { /* fall through to direct import */ }
    // Fallback: a direct import in case a future bundler exposes CV cleanly.
    try {
      const mod: any = await import('js-aruco2/src/cv.js');
      const CV = (mod.default || mod).CV || mod.CV;
      if (CV && CV.adaptiveThreshold) return CV;
    } catch { /* give up */ }
    return null;
  })();
  return cvModulePromise;
}

// aruco.js has the SAME top-level-`this` problem as cv.js (`this.AR = AR`), so a
// plain `import('js-aruco2')` throws under ESM bundling and the ArUco decoder
// fallback never runs. Load its source and eval it against a context that already
// carries CV (`var CV = this.CV || require('./cv').CV` — seeding this.CV avoids
// the browser-unavailable `require`). Returns the AR namespace (AR.Detector).
let arModulePromise: Promise<any> | null = null;
async function loadAR(): Promise<any> {
  if (arModulePromise) return arModulePromise;
  arModulePromise = (async () => {
    const CV = await loadCV(); // seed `this.CV` so aruco.js skips require('./cv')
    // Primary: raw-source eval with a controlled `this` (bundler-independent).
    try {
      const src: string = (await import('js-aruco2/src/aruco.js?raw')).default;
      const ctx: any = { CV };
      new Function(src).call(ctx);
      if (ctx.AR && ctx.AR.Detector) return ctx.AR;
    } catch { /* fall through to direct import */ }
    // Fallback: a direct import in case a future bundler exposes AR cleanly.
    try {
      const mod: any = await import('js-aruco2');
      const AR = (mod.default || mod).AR || mod.AR;
      if (AR && AR.Detector) return AR;
    } catch { /* give up */ }
    return null;
  })();
  return arModulePromise;
}

// Geometric fiducial detector (dictionary-independent). The AstroBotany markers
// use CUSTOM corner icons that generic ArUco/AprilTag decoders do not read, so
// we find the 4 dark corner SQUARES by contour geometry instead — the same
// approach as the PlantCV Pro notebook. Reuses js-aruco2's bundled CV module
// (grayscale -> adaptive threshold -> contours -> polygon approximation).
async function detectQuadCV(data: Uint8ClampedArray, w: number, h: number): Promise<Pt[] | null> {
  const CV: any = await loadCV();
  if (!CV || !CV.adaptiveThreshold) return null;

  const findSquares = (kernel: number): { x: number; y: number; a: number }[] => {
    const grey = new CV.Image(), thres = new CV.Image(), bin = new CV.Image();
    CV.grayscale({ width: w, height: h, data }, grey);
    CV.adaptiveThreshold(grey, thres, kernel, 7);
    const out: { x: number; y: number; a: number }[] = [];
    for (const c of CV.findContours(thres, bin)) {
      if (c.length < w * 0.02) continue;
      const poly = CV.approxPolyDP(c, c.length * 0.05);
      if (poly.length !== 4 || !CV.isContourConvex(poly)) continue;
      const xs = poly.map((p: Pt) => p.x), ys = poly.map((p: Pt) => p.y);
      const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
      const bw = maxx - minx, bh = maxy - miny;
      if (bw < 5 || bh < 5 || bw / bh < 0.6 || bw / bh > 1.6) continue;
      let a = 0;
      for (let i = 0; i < 4; i++) { const p = poly[i], q = poly[(i + 1) % 4]; a += p.x * q.y - q.x * p.y; }
      a = Math.abs(a / 2);
      if (a < w * h * 2e-4 || a > w * h * 2e-2 || a / (bw * bh) < 0.6) continue;
      out.push({ x: (minx + maxx) / 2, y: (miny + maxy) / 2, a });
    }
    return out;
  };

  type Sq = { x: number; y: number; a: number };

  // Aggregate square candidates across several adaptive-threshold kernel sizes so
  // detection doesn't depend on one kernel (the browser's JPEG decode can differ
  // subtly from Node's, changing which contours survive).
  const md = Math.min(w, h);
  // NOTE: CV.adaptiveThreshold -> stackBoxBlur only has mult/shift table entries
  // for kernel sizes 0..15; a larger kernel yields an all-zero blur (undefined
  // table lookup) and finds NOTHING. Clamp to that valid range so large uploaded
  // photos don't silently fail to detect.
  const kernels = [...new Set([0.003, 0.004, 0.005, 0.006, 0.008].map(k => Math.max(4, Math.min(15, Math.round(md * k)))))];
  let all: Sq[] = [];
  for (const k of kernels) { try { all = all.concat(findSquares(k)); } catch { /* skip kernel */ } }
  if (all.length < 4) return null;

  // Deduplicate overlapping detections of the same square (keep the larger).
  all.sort((a, b) => b.a - a.a);
  const mergeDist = md * 0.02;
  const cand: Sq[] = [];
  for (const c of all) if (!cand.some(k => Math.hypot(k.x - c.x, k.y - c.y) < mergeDist)) cand.push(c);
  if (cand.length < 4) return null;

  // The 4 fiducials are 4 SIMILAR-sized squares arranged as a rectangle. Try every
  // size cluster (each candidate as a reference size), take the 4 corner-most, and
  // keep the best-scoring valid rectangle. This ignores large outliers (dish/card
  // outlines) that previously skewed a single median and filtered the fiducials out.
  let best: Pt[] | null = null, bestScore = -Infinity;
  for (const ref of cand) {
    const cluster = cand.filter(c => c.a > 0.5 * ref.a && c.a < 2.0 * ref.a);
    if (cluster.length < 4) continue;
    const TL = cluster.reduce((a, b) => a.x + a.y < b.x + b.y ? a : b);
    const BR = cluster.reduce((a, b) => a.x + a.y > b.x + b.y ? a : b);
    const TR = cluster.reduce((a, b) => a.x - a.y > b.x - b.y ? a : b);
    const BL = cluster.reduce((a, b) => a.x - a.y < b.x - b.y ? a : b);
    const pts = [TL, TR, BR, BL];
    if (new Set(pts.map(p => `${Math.round(p.x)},${Math.round(p.y)}`)).size !== 4) continue;
    const qa = Math.abs((TR.x - TL.x) * (BL.y - TL.y) - (TR.y - TL.y) * (BL.x - TL.x));
    if (qa < w * h * 0.004) continue; // reject tiny / collinear quads
    const top = Math.hypot(TR.x - TL.x, TR.y - TL.y), bot = Math.hypot(BR.x - BL.x, BR.y - BL.y);
    const left = Math.hypot(BL.x - TL.x, BL.y - TL.y), right = Math.hypot(BR.x - TR.x, BR.y - TR.y);
    if (top < 1 || bot < 1 || left < 1 || right < 1) continue;
    const aspect = ((top + bot) / 2) / ((left + right) / 2);
    if (aspect < 0.4 || aspect > 2.6) continue; // marker is ~1.3 (landscape) or ~0.77 (portrait)
    const edgeBalance = (Math.min(top, bot) / Math.max(top, bot)) * (Math.min(left, right) / Math.max(left, right));
    const cornerAreas = pts.map(p => p.a);
    const sizeBalance = Math.min(...cornerAreas) / Math.max(...cornerAreas);
    if (sizeBalance < 0.3) continue; // the 4 fiducials should be similar-sized
    const score = edgeBalance * 2 + sizeBalance + Math.min(cluster.length, 8) * 0.04;
    if (score > bestScore) { bestScore = score; best = pts.map(p => ({ x: p.x, y: p.y })); }
  }
  return best;
}

// Detect the 4 corner fiducials. Returns corners ordered [TL,TR,BR,BL]. Tries the
// geometric detector first (reliable for the custom AstroBotany fiducials), then
// falls back to ArUco decoding (which sometimes recovers a couple of corners on
// glary frames the geometric pass misses).
//
// `skipGeometric` forces the ArUco-decoder path. An ArUco marker is built from
// nested squares, so the geometric detector always locks onto its cells/border
// first — the only way to exercise the ArUco fallback on a real marker image
// (e.g. the "ArUco marker target" demo via ?detector=aruco) is to skip geometric.
export async function detectMarkerCorners(
  data: Uint8ClampedArray, w: number, h: number,
  opts: { skipGeometric?: boolean } = {}
): Promise<{ corners: Pt[] | null; found: number }> {
  const cvQuad = opts.skipGeometric ? null : await detectQuadCV(data, w, h);
  if (cvQuad) return { corners: orderCorners(cvQuad), found: 4 };

  const AR: any = await loadAR();
  if (!AR || !AR.Detector) return { corners: null, found: 0 };

  let markers: any[] = [];
  try {
    const detector = new AR.Detector({ dictionaryName: 'ARUCO_MIP_36h12' });
    markers = detector.detectImage(w, h, data) || [];
  } catch {
    return { corners: null, found: 0 };
  }

  const areaOf = (c: Pt[]) => {
    let a = 0;
    for (let i = 0; i < 4; i++) { const p = c[i], q = c[(i + 1) % 4]; a += p.x * q.y - q.x * p.y; }
    return Math.abs(a / 2);
  };
  const ranked = markers
    .map(m => ({ area: areaOf(m.corners), cx: m.corners.reduce((s: number, p: Pt) => s + p.x, 0) / 4, cy: m.corners.reduce((s: number, p: Pt) => s + p.y, 0) / 4 }))
    .filter(m => m.area > (w * h) * 0.0004) // drop tiny false positives
    .sort((a, b) => b.area - a.area)
    .map(m => ({ x: m.cx, y: m.cy }));

  // Deduplicate: the detector often returns the SAME physical fiducial more than
  // once (different candidate IDs). Merge centres closer than ~4% of the image.
  const mergeDist = Math.min(w, h) * 0.04;
  const centres: Pt[] = [];
  for (const c of ranked) {
    if (!centres.some(k => Math.hypot(k.x - c.x, k.y - c.y) < mergeDist)) centres.push(c);
    if (centres.length === 4) break;
  }

  if (centres.length >= 4) return { corners: orderCorners(centres.slice(0, 4)), found: 4 };
  if (centres.length === 3) {
    // complete the parallelogram: the 4th corner is opposite the "middle" vertex
    const [a, b, c] = centres;
    const cand = { x: a.x + c.x - b.x, y: a.y + c.y - b.y };
    return { corners: orderCorners([a, b, c, cand]), found: 3 };
  }
  if (centres.length === 2) {
    // Only one edge found (common: glare hides the far side). Extrude a square-ish
    // quad perpendicular to that edge, toward the image interior, as a starting
    // guess the user drags into place.
    const [p, q] = [...centres].sort((m, n) => m.x - n.x);
    const ex = q.x - p.x, ey = q.y - p.y, len = Math.hypot(ex, ey) || 1;
    let nx = -ey / len, ny = ex / len; // unit normal to the edge
    // Default the guess to extrude "upward" (toward smaller y); the two reliably
    // detected fiducials are usually the card's lower edge. The user drags to fix.
    if (ny > 0) { nx = -nx; ny = -ny; }
    const d = len * 1.27; // card is slightly taller than the corner-to-corner span
    const corners = [p, q, { x: q.x + nx * d, y: q.y + ny * d }, { x: p.x + nx * d, y: p.y + ny * d }];
    return { corners: orderCorners(corners), found: 2 };
  }
  return { corners: null, found: centres.length };
}
