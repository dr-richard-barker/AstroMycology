// Browser TIFF support. Browsers can't render TIFF in <img>, so folders full of
// .tif scans (common in the space-biology repos) show as broken tiles. We decode
// TIFF client-side with UTIF, downscale to a canvas, and hand back a JPEG object
// URL (for display) or ImageData (for marker detection). Results are cached, and
// very large files bail to a download fallback so a 70 MB scan can't crash the tab.
import UTIF from 'utif2';

export const isTiffUrl = (url: string | null | undefined): boolean => !!url && /\.tiff?($|\?)/i.test(url);

const MAX_BYTES = 30 * 1048576; // above this, don't decode in-browser
const urlCache = new Map<string, string>(); // source url -> blob object URL

async function decodeToCanvas(url: string, maxEdge: number): Promise<HTMLCanvasElement> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TIFF fetch ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw new Error('TIFF too large to preview in the browser');
  const ifds = UTIF.decode(buf);
  UTIF.decodeImage(buf, ifds[0]);
  const rgba = UTIF.toRGBA8(ifds[0]);
  const w = (ifds[0] as any).width as number, h = (ifds[0] as any).height as number;

  const full = document.createElement('canvas');
  full.width = w; full.height = h;
  full.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);

  const scale = Math.min(1, maxEdge / Math.max(w, h));
  if (scale >= 1) return full;
  const out = document.createElement('canvas');
  out.width = Math.round(w * scale); out.height = Math.round(h * scale);
  out.getContext('2d')!.drawImage(full, 0, 0, out.width, out.height);
  return out;
}

// A displayable JPEG object URL for a TIFF (cached per source URL).
export async function tiffObjectUrl(url: string, maxEdge = 1600): Promise<string> {
  const hit = urlCache.get(url);
  if (hit) return hit;
  const canvas = await decodeToCanvas(url, maxEdge);
  const blob: Blob = await new Promise((r, j) => canvas.toBlob(b => (b ? r(b) : j(new Error('encode failed'))), 'image/jpeg', 0.85));
  const objUrl = URL.createObjectURL(blob);
  urlCache.set(url, objUrl);
  return objUrl;
}

// ImageData for a TIFF, for the marker detector.
export async function tiffImageData(url: string, maxEdge = 1400): Promise<ImageData> {
  const canvas = await decodeToCanvas(url, maxEdge);
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
}
