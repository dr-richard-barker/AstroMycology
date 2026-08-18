// Color-based contamination screening — a first-pass heuristic, not a trained
// classifier. Buckets sampled pixels by hue/saturation/value against colors
// observed in this database's own photos (healthy Pleurotus ostreatus mycelium
// is white/cream; contamination showed up as grey/black sooty patches, green
// mold, or pink/red patches; yellow-gold droplets are a normal exudate, not a
// contamination sign, seen on clearly healthy jars too). Only samples a
// center-weighted crop, since most photos here frame the jar/mycelium roughly
// centered, with hands/tent/backdrop toward the edges.
//
// This is deliberately simple and will misfire on lighting casts (blue-LED
// fruiting chambers, green screens) it hasn't seen — it's meant as a seed for
// a real classifier once there are enough confirmed labels to train one, not
// a diagnostic. Every verdict can be manually corrected; corrections are
// stored so a future model has real ground truth to learn from.

export type ContaminationVerdict = 'clean' | 'suspect' | 'contaminated' | 'inconclusive';

export interface ContaminationResult {
  verdict: ContaminationVerdict;
  confidence: number;      // 0-1, how much weight to put on the verdict
  score: number;           // 0-1, fraction of organism-like pixels reading as contamination-colored
  coverage: number;        // 0-1, fraction of the sampled crop classified as organism (vs. background)
  breakdown: { pale: number; green: number; greyMold: number; dark: number; pinkRed: number; goldDroplet: number; background: number }; // pixel-fraction per bucket
  analyzedAt: string;
  overridden?: boolean;    // true once a human has corrected the verdict
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

// Fraction of the frame (each side) kept, centered — trims hands/tent/backdrop
// at the edges in most of this database's photos.
const CROP_FRACTION = 0.7;
const SAMPLE_STEP = 4; // every 4th pixel on each axis, for speed

export function analyzeContamination(img: ImageData): ContaminationResult {
  const { width: w, height: h, data } = img;
  const cw = Math.round(w * CROP_FRACTION), ch = Math.round(h * CROP_FRACTION);
  const x0 = Math.round((w - cw) / 2), y0 = Math.round((h - ch) / 2);

  // NOTE (v1 → v2, after testing against 35 real photos): the first version
  // merged true green hue and generic desaturated grey into one "greenGrey"
  // bucket. That over-fired — dim tent-fabric/backdrop pixels inside the crop
  // (achromatic, medium-dark) are common and got miscounted as mold. Split
  // into a hue-based `green` bucket and a narrower, darker `greyMold` bucket.
  // Known remaining false-positive source: a literal green-screen backdrop
  // (seen in a few of this database's own photos) still reads as `green` —
  // there's no subject/background segmentation here, so a colored backdrop
  // behind the jar is indistinguishable from green mold on the jar itself.
  const counts = { pale: 0, green: 0, greyMold: 0, dark: 0, pinkRed: 0, goldDroplet: 0, background: 0 };
  let n = 0;

  for (let y = y0; y < y0 + ch; y += SAMPLE_STEP) {
    for (let x = x0; x < x0 + cw; x += SAMPLE_STEP) {
      const i = (y * w + x) * 4;
      const [hue, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
      n++;
      if (v >= 0.55 && s <= 0.25) counts.pale++;
      else if (v < 0.12) counts.dark++;
      else if (hue >= 30 && hue <= 60 && s >= 0.3) counts.goldDroplet++;
      else if (hue >= 70 && hue <= 170 && s >= 0.2) counts.green++;
      else if (s < 0.13 && v >= 0.2 && v < 0.5) counts.greyMold++;
      else if ((hue >= 335 || hue <= 15) && s >= 0.25 && v >= 0.25) counts.pinkRed++;
      else counts.background++;
    }
  }
  if (n === 0) n = 1;
  const breakdown = {
    pale: counts.pale / n, green: counts.green / n, greyMold: counts.greyMold / n, dark: counts.dark / n,
    pinkRed: counts.pinkRed / n, goldDroplet: counts.goldDroplet / n, background: counts.background / n,
  };

  const organism = breakdown.pale + breakdown.green + breakdown.greyMold + breakdown.dark + breakdown.pinkRed;
  const coverage = organism + breakdown.goldDroplet;
  // Green hue is a much more specific signal than generic dark/grey (which
  // background fabric can trigger), so it's weighted higher in the score.
  const score = organism > 0 ? Math.min(1, (breakdown.green * 1.3 + breakdown.greyMold + breakdown.dark * 0.6 + breakdown.pinkRed) / organism) : 0;

  let verdict: ContaminationVerdict;
  if (coverage < 0.15) verdict = 'inconclusive';
  else if (score >= 0.35) verdict = 'contaminated';
  else if (score >= 0.15) verdict = 'suspect';
  else verdict = 'clean';

  const confidence = verdict === 'inconclusive' ? 0 : Math.min(1, coverage) * Math.min(1, Math.abs(score - 0.15) / 0.2 + 0.3);

  return { verdict, confidence, score, coverage, breakdown, analyzedAt: new Date().toISOString() };
}
