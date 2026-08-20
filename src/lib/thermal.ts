// OCR-based extraction of the temperature range baked into the thermal
// (IR camera) photos' own on-screen overlay: a vertical colorbar with a
// printed max label above it and a min label below it, plus a redundant
// "Min X.X" readout in the top-left corner. Crop regions below were measured
// directly off this database's own photos (native camera-app screenshots,
// 480×640, stored portrait — NOT the landscape crop of the same frame a
// rotated preview might suggest). Tries all 4 rotations (0/90/180/270) as a
// safety net for any photo that doesn't match this layout, keeping whichever
// OCR read comes back most confident.
//
// This is a first-pass heuristic like lib/contamination.ts, not a certified
// reading — every result is meant to be reviewed/corrected by a human (see
// ThermalReading.overridden), and those corrections are what a future
// trained/calibrated pipeline would learn from once there's enough data.
import type { RotationDeg, ThermalReading } from '../types';

// Fractional crop boxes (0-1 of the frame), measured against real samples at
// rotation 0 (native orientation): the max label sits just above the vertical
// colorbar, the min label just below it, plus the separate top-left corner
// "Min X.X" readout. (A single tall crop spanning the whole colorbar — from
// the max label to the min label in one shot — reliably OCR'd to nothing on
// real samples here, even though the crop itself was visibly correct: too
// elongated an aspect ratio for Tesseract's default page segmentation. Two
// separate, more normally-proportioned crops is what actually works.)
const CROPS = {
  maxLabel: { x: 0.00, y: 0.17, w: 0.18, h: 0.10 },
  minLabel: { x: 0.00, y: 0.76, w: 0.20, h: 0.12 },
  cornerMin: { x: 0.00, y: 0.01, w: 0.26, h: 0.075 },
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = url;
  });
}

// Draw `img` onto a canvas rotated by `deg` (canvas dims swapped for 90/270).
function rotatedCanvas(img: HTMLImageElement, deg: RotationDeg): HTMLCanvasElement {
  const w = img.naturalWidth, h = img.naturalHeight;
  const rotated = deg === 90 || deg === 270;
  const canvas = document.createElement('canvas');
  canvas.width = rotated ? h : w;
  canvas.height = rotated ? w : h;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2);
  return canvas;
}

// Crop a fractional region and upscale it — small stylized camera-UI digits
// OCR far more reliably enlarged.
function cropUpscaled(canvas: HTMLCanvasElement, box: { x: number; y: number; w: number; h: number }, scale = 3): HTMLCanvasElement {
  const sx = box.x * canvas.width, sy = box.y * canvas.height;
  const sw = box.w * canvas.width, sh = box.h * canvas.height;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sw * scale));
  out.height = Math.max(1, Math.round(sh * scale));
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

// All decimal numbers found in a crop's OCR text, in reading order.
function parseNumbers(text: string): number[] {
  const matches = text.match(/-?\d+\.\d+|-?\d+/g) || [];
  return matches.map(parseFloat).filter(n => !Number.isNaN(n));
}

// A lazily-created, module-cached Tesseract worker — reused across every
// crop/rotation/image so a batch run doesn't pay WASM-init cost repeatedly.
// A throwaway warm-up recognize() call is fired right after creation: the
// very first real recognize() on a freshly-created worker was observed to
// silently return an empty result (confidence 0, no text) even on a clean,
// legible crop — a real bug hit while building this, not a hypothetical —
// so absorb that here rather than let it eat the first real image's rotation-0 attempt.
let workerPromise: Promise<any> | null = null;
function getWorker(): Promise<any> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      await worker.setParameters({ tessedit_char_whitelist: '0123456789.-' });
      const warm = document.createElement('canvas');
      warm.width = 40; warm.height = 20;
      await worker.recognize(warm).catch(() => {});
      return worker;
    })();
  }
  return workerPromise;
}

// Retries once on an empty result — belt-and-suspenders alongside the
// worker warm-up above, in case the flakiness isn't strictly first-call-only.
async function ocrCanvas(worker: any, canvas: HTMLCanvasElement): Promise<{ text: string; confidence: number }> {
  const { data } = await worker.recognize(canvas);
  const text = (data.text || '').trim();
  if (!text && (data.confidence || 0) === 0) {
    const retry = await worker.recognize(canvas);
    return { text: (retry.data.text || '').trim(), confidence: retry.data.confidence || 0 };
  }
  return { text, confidence: data.confidence || 0 };
}

interface Attempt { rotationDeg: RotationDeg; minC: number | null; maxC: number | null; confidence: number; ocrText: string; }

async function tryRotation(worker: any, img: HTMLImageElement, deg: RotationDeg): Promise<Attempt> {
  const canvas = rotatedCanvas(img, deg);
  const max = await ocrCanvas(worker, cropUpscaled(canvas, CROPS.maxLabel));
  const min = await ocrCanvas(worker, cropUpscaled(canvas, CROPS.minLabel));
  const corner = await ocrCanvas(worker, cropUpscaled(canvas, CROPS.cornerMin));
  const maxC = parseNumbers(max.text)[0] ?? null;
  const minC = parseNumbers(min.text)[0] ?? parseNumbers(corner.text)[0] ?? null;
  const bothParsed = minC != null && maxC != null;
  // Tesseract can report high confidence on confidently-wrong noise, so a
  // failed parse drags the score down hard rather than trusting the raw number.
  const confidence = ((max.confidence + min.confidence) / 2) * (bothParsed ? 1 : 0.3);
  return {
    rotationDeg: deg, minC, maxC, confidence,
    ocrText: `max="${max.text}" min="${min.text}" corner="${corner.text}"`,
  };
}

// Try all 4 rotations, keep the most confident. Stops early once a very
// confident read is found — only 4 rotations max regardless.
export async function extractThermalReading(url: string): Promise<ThermalReading> {
  const worker = await getWorker();
  const img = await loadImage(url);
  const order: RotationDeg[] = [0, 90, 180, 270];
  let best: Attempt | null = null;
  for (const deg of order) {
    const attempt = await tryRotation(worker, img, deg);
    if (!best || attempt.confidence > best.confidence) best = attempt;
    if (best.confidence > 90) break;
  }
  return {
    minC: best!.minC, maxC: best!.maxC, rotationDeg: best!.rotationDeg,
    confidence: Math.round(best!.confidence), ocrText: best!.ocrText,
    analyzedAt: new Date().toISOString(),
  };
}
