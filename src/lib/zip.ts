// Minimal client-side ZIP reader (no dependency). Parses the central directory
// and inflates entries with the browser's built-in DecompressionStream
// ('deflate-raw'), so a user can drop in a .zip exported from Google Drive and
// we read its images in the browser. Supports stored (0) and deflate (8).

export interface ZipEntry { name: string; bytes: Uint8Array; }

const u16 = (d: DataView, o: number) => d.getUint16(o, true);
const u32 = (d: DataView, o: number) => d.getUint32(o, true);

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  // @ts-ignore — DecompressionStream is a browser global
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzip(file: Blob): Promise<ZipEntry[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);

  // Find End Of Central Directory (0x06054b50) scanning back from the end.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (u32(dv, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid .zip file');

  const count = u16(dv, eocd + 10);
  let off = u32(dv, eocd + 16); // start of central directory

  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (u32(dv, off) !== 0x02014b50) break; // central dir header signature
    const method = u16(dv, off + 10);
    const compSize = u32(dv, off + 20);
    const nameLen = u16(dv, off + 28);
    const extraLen = u16(dv, off + 30);
    const commentLen = u16(dv, off + 32);
    const localOff = u32(dv, off + 42);
    const name = new TextDecoder().decode(buf.subarray(off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue; // directory
    // Parse the local file header to find where the data actually starts
    // (its name/extra lengths can differ from the central record).
    if (u32(dv, localOff) !== 0x04034b50) continue;
    const lNameLen = u16(dv, localOff + 26);
    const lExtraLen = u16(dv, localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    try {
      const bytes = method === 0 ? comp.slice() : method === 8 ? await inflateRaw(comp) : null;
      if (bytes) out.push({ name, bytes });
    } catch { /* skip unreadable entry */ }
  }
  return out;
}
