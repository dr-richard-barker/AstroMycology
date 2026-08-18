// Image helpers for client-side marker detection on Epicollect5-hosted photos.
// The Epicollect5 media endpoint sends Access-Control-Allow-Origin: *, so images
// can be loaded with crossOrigin='anonymous' and read back off a canvas without
// tainting it.
import { isTiffUrl, tiffImageData } from './tiff';
import { isHeicUrl, heicImageData } from './heic';

// Load a (possibly cross-origin) image URL into an ImageData, capped so
// detection stays fast on large photos. TIFF is decoded via UTIF and HEIC via
// heic2any (browsers can't draw either to a canvas directly).
export async function urlToImageData(url: string, maxEdge = 1400): Promise<ImageData> {
  if (isTiffUrl(url)) return tiffImageData(url, maxEdge);
  if (isHeicUrl(url)) return heicImageData(url);
  const img = await loadImage(url);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = url;
  });
}

// Down-scale + JPEG-compress an image blob for storage/display.
export async function compressImage(blob: Blob, maxEdge = 1600, quality = 0.82): Promise<{ blob: Blob; width: number; height: number }> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions); }
  catch { bmp = await createImageBitmap(blob); }
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const width = Math.max(1, Math.round(bmp.width * scale));
  const height = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  const out = await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('encode failed')), 'image/jpeg', quality));
  return { blob: out, width, height };
}

export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
