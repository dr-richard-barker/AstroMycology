// Thin adapter over the recycled colorcalib engine: run the client-side ArUco /
// geometric fiducial detector on an ImageData and shape the result into the
// MarkerAnalysis stored in the database. All measurement, no AI.

import {
  detectMarkerCorners, scaleAndRotation, fitFromQuad, orderCorners,
  ASTRO_CHIPS, MARKER_SPAN_CM, type Pt,
} from './colorcalib';
import type { MarkerAnalysis, MarkerCorners, ColorChip } from '../types';

function to255(rgb01: number[]): [number, number, number] {
  return [Math.round(rgb01[0] * 255), Math.round(rgb01[1] * 255), Math.round(rgb01[2] * 255)];
}

// Detect the calibration marker in an ImageData and derive scale + colour metrics.
export async function analyzeMarker(
  img: ImageData,
  opts: { skipGeometric?: boolean } = {},
): Promise<MarkerAnalysis> {
  const now = new Date().toISOString();
  const { data, width: w, height: h } = img;

  const { corners, found } = await detectMarkerCorners(data, w, h, opts);
  if (!corners) {
    return {
      markerFound: false, cornersFound: found, corners: null,
      pxPerCm: null, pxPerMm: null, rotationDeg: null,
      colorResidualRms: null, colorChips: [],
      detector: opts.skipGeometric ? 'aruco' : 'geometric', analyzedAt: now,
    };
  }

  const { pxPerCm, rotationDeg } = scaleAndRotation(corners, MARKER_SPAN_CM);
  const fit = fitFromQuad(data, w, h, corners);
  const colorChips: ColorChip[] = ASTRO_CHIPS.map((chip, i) => ({
    name: chip.name,
    measured: to255(fit.source[i]),
    standard: to255(chip.std),
  }));

  return {
    markerFound: true,
    cornersFound: found,
    corners: cornersToTuple(corners),
    pxPerCm: round(pxPerCm, 2),
    pxPerMm: round(pxPerCm / 10, 3),
    rotationDeg: round(rotationDeg, 2),
    colorResidualRms: round(fit.residual, 4),
    colorChips,
    detector: opts.skipGeometric ? 'aruco' : 'geometric',
    analyzedAt: now,
  };
}

// Recompute scale/colour from a user-adjusted 4-corner quad (manual annotation).
export function analyzeFromQuad(img: ImageData, quad: MarkerCorners): MarkerAnalysis {
  const now = new Date().toISOString();
  const ordered = orderCorners(quad.map(p => ({ x: p.x, y: p.y })));
  const { pxPerCm, rotationDeg } = scaleAndRotation(ordered, MARKER_SPAN_CM);
  const fit = fitFromQuad(img.data, img.width, img.height, ordered);
  const colorChips: ColorChip[] = ASTRO_CHIPS.map((chip, i) => ({
    name: chip.name,
    measured: to255(fit.source[i]),
    standard: to255(chip.std),
  }));
  return {
    markerFound: true, cornersFound: 4, corners: cornersToTuple(ordered),
    pxPerCm: round(pxPerCm, 2), pxPerMm: round(pxPerCm / 10, 3), rotationDeg: round(rotationDeg, 2),
    colorResidualRms: round(fit.residual, 4), colorChips, detector: 'manual', analyzedAt: now,
  };
}

function cornersToTuple(pts: Pt[]): MarkerCorners {
  const p = pts.map(q => ({ x: round(q.x, 1), y: round(q.y, 1) }));
  return [p[0], p[1], p[2], p[3]] as MarkerCorners;
}
function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export { MARKER_SPAN_CM };
