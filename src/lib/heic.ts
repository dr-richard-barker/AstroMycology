// Client-side HEIC/HEIF → JPEG decode. Chrome and Firefox can't decode HEIC
// pixels via <img>/canvas/createImageBitmap, so anything that needs pixels
// (thumbnails, compression, marker analysis) has to go through this first.
// exifr can already read HEIC EXIF directly from the original bytes, so
// metadata extraction does NOT need this — only rendering does.
import heic2any from 'heic2any';

const HEIC_RE = /\.(heic|heif)($|\?)/i;
export const isHeicName = (name: string) => HEIC_RE.test(name);
export const isHeicUrl = isHeicName;

const cache = new WeakMap<Blob, Promise<Blob>>();

export function heicToJpeg(blob: Blob, quality = 0.88): Promise<Blob> {
  const hit = cache.get(blob);
  if (hit) return hit;
  const p = (async () => {
    const out = await heic2any({ blob, toType: 'image/jpeg', quality });
    return (Array.isArray(out) ? out[0] : out) as Blob;
  })();
  cache.set(blob, p);
  return p;
}

// A displayable JPEG object URL for a remote HEIC (fetched + decoded, cached
// per source URL) — the URL analogue of `heicToJpeg`, for SmartImg.
const urlCache = new Map<string, Promise<string>>();
export function heicObjectUrl(url: string): Promise<string> {
  const hit = urlCache.get(url);
  if (hit) return hit;
  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HEIC fetch ${res.status}`);
    const jpeg = await heicToJpeg(await res.blob());
    return URL.createObjectURL(jpeg);
  })();
  urlCache.set(url, p);
  return p;
}

// ImageData for a remote HEIC, for the marker detector.
export async function heicImageData(url: string): Promise<ImageData> {
  const objUrl = await heicObjectUrl(url);
  const img = new Image();
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('decoded HEIC failed to load')); img.src = objUrl; });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
