// World country polygons for the dashboard choropleth. The GeoJSON (bundled in
// public/geo, ISO-A3 id + name, coords rounded to ~1 km) is loaded once at
// runtime; a ray-casting point-in-polygon assigns each GPS point to a country
// so we can shade countries by how many images came from each.

export interface GeoFeature {
  id: string;
  name: string;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
}

let cache: GeoFeature[] | null = null;
let inflight: Promise<GeoFeature[]> | null = null;

export function loadWorld(baseUrl: string): Promise<GeoFeature[]> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch(`${baseUrl}geo/countries.geo.json`)
    .then(r => { if (!r.ok) throw new Error(`world map ${r.status}`); return r.json(); })
    .then(j => {
      // Flatten the name out of GeoJSON `properties` so callers can use f.name.
      cache = (j.features as any[]).map(f => ({ id: f.id, name: f.properties?.name || f.id, geometry: f.geometry })) as GeoFeature[];
      return cache;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

function ringContains(ring: number[][], lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[k][0], yj = ring[k][1];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
// A polygon = outer ring minus any holes.
function polyContains(poly: number[][][], lng: number, lat: number): boolean {
  if (!ringContains(poly[0], lng, lat)) return false;
  for (let i = 1; i < poly.length; i++) if (ringContains(poly[i], lng, lat)) return false;
  return true;
}
export function featureContains(f: GeoFeature, lng: number, lat: number): boolean {
  const g = f.geometry;
  return g.type === 'Polygon'
    ? polyContains(g.coordinates as number[][][], lng, lat)
    : (g.coordinates as number[][][][]).some(p => polyContains(p, lng, lat));
}
export function countryOf(features: GeoFeature[], lng: number, lat: number): GeoFeature | null {
  for (const f of features) if (featureContains(f, lng, lat)) return f;
  return null;
}

// SVG path data for a feature, using a projection (lng/lat → x/y).
export function featurePath(f: GeoFeature, x: (n: number) => number, y: (n: number) => number): string {
  const ring = (r: number[][]) => r.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('') + 'Z';
  const g = f.geometry;
  return g.type === 'Polygon'
    ? (g.coordinates as number[][][]).map(ring).join('')
    : (g.coordinates as number[][][][]).map(poly => poly.map(ring).join('')).join('');
}
