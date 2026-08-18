// Domain model for the static Epicollect5-backed viewer.
// Photos + metadata live in an Epicollect5 project; marker analysis is computed
// client-side and cached in the browser. No values are AI-invented.

import type { ContaminationResult } from './lib/contamination';

export interface Pt { x: number; y: number; }

export type MarkerCorners = [Pt, Pt, Pt, Pt];

export interface ColorChip {
  name: string;
  measured: [number, number, number]; // 0-255, as photographed
  standard: [number, number, number]; // 0-255, AstroBotany reference
}

export interface MarkerAnalysis {
  markerFound: boolean;
  cornersFound: number;
  corners: MarkerCorners | null;
  pxPerCm: number | null;
  pxPerMm: number | null;
  rotationDeg: number | null;
  colorResidualRms: number | null;
  colorChips: ColorChip[];
  detector: 'geometric' | 'aruco' | 'manual';
  analyzedAt: string;
}

// One extra (non-photo) field from the Epicollect5 form, for display.
export interface EntryField {
  name: string;   // human field name from the form
  value: string;  // formatted for display
}

// An Epicollect5 entry mapped for the gallery.
export interface Ec5Entry {
  uuid: string;
  project: string;           // Epicollect5 project slug this entry belongs to
  title: string;
  createdAt: string;
  uploadedAt: string;
  photoUrl: string | null;   // media endpoint, entry_original
  thumbUrl: string | null;   // media endpoint, entry_thumb
  videoUrl?: string | null;  // for video entries (e.g. a GitHub .avi/.mp4)
  scanUrl?: string | null;   // for 3D-scan entries (.ply/.obj/.glb/.gltf/.stl)
  mediaKind?: 'photo' | 'thermal' | 'video' | 'scan3d'; // defaults to 'photo' when absent
  fields: EntryField[];      // remaining form fields (species, notes, …)
  species: string | null;    // best-effort, from a field named like "species"
  gps: { lat: number; lng: number } | null;
  marker: MarkerAnalysis | null; // hydrated from local cache
  contamination?: ContaminationResult | null; // hydrated from local cache
  cloud?: { owner: string; path: string }; // present on shared cloud uploads (for owner delete)
}

export interface CollectionStats {
  total: number;        // entries loaded so far
  totalAvailable: number; // meta.total from the API
  withPhoto: number;
  analyzed: number;     // have a locally-cached marker analysis
}
