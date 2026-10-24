// Where the pins go. A grid scan is an odd N×N square around a center. An area scan fills a drawn
// service area with pins at the same spacing. Pure, so the browser preview and the server agree.

export type LatLng = { lat: number; lng: number };
export type GridPin = LatLng & { row: number; col: number };

export const MIN_SIZE = 3;
export const MAX_SIZE = 21;
export const MAX_PINS = MAX_SIZE * MAX_SIZE;
export const MILE = 1609.344;
export const MIN_SPACING = 100;
export const MAX_SPACING = 16_000;
const M_PER_DEG = 111_320;

/** Seven decimals, the most DataForSEO takes (about 1cm). */
export const round7 = (n: number) => Math.round(n * 1e7) / 1e7;

/** The point a given number of meters north and east of p. */
export function offset(p: LatLng, northM: number, eastM: number): LatLng {
  const lat = p.lat + northM / M_PER_DEG;
  const lng = p.lng + eastM / (M_PER_DEG * Math.cos((p.lat * Math.PI) / 180));
  return { lat: round7(lat), lng: round7(lng) };
}

export function metersBetween(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const validSize = (n: number) => Number.isInteger(n) && n >= MIN_SIZE && n <= MAX_SIZE && n % 2 === 1;
export const validSpacing = (m: number) => Number.isFinite(m) && m >= MIN_SPACING && m <= MAX_SPACING;
export const validPoint = (p: LatLng) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 85 && Math.abs(p.lng) <= 180;

/** An odd size×size grid, row 0 at the top (north), column 0 on the left (west). */
export function gridPoints(center: LatLng, size: number, spacingM: number): GridPin[] {
  if (!validSize(size)) throw new Error(`Grid size must be an odd number from ${MIN_SIZE} to ${MAX_SIZE}.`);
  if (!validSpacing(spacingM)) throw new Error("Pin spacing must be between 100 m and 16 km.");
  const half = (size - 1) / 2;
  const pins: GridPin[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      pins.push({ ...offset(center, (half - row) * spacingM, (col - half) * spacingM), row, col });
    }
  }
  return pins;
}

/** Ray casting on lat/lng. Fine at city scale; points on an edge may fall either way. */
export function pointInPolygon(p: LatLng, poly: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
}

export function polygonCenter(poly: LatLng[]): LatLng {
  const lats = poly.map((p) => p.lat);
  const lngs = poly.map((p) => p.lng);
  return { lat: round7((Math.min(...lats) + Math.max(...lats)) / 2), lng: round7((Math.min(...lngs) + Math.max(...lngs)) / 2) };
}

/** Pins every spacingM meters inside a service area. Throws when the area needs more than MAX_PINS. */
export function areaPoints(poly: LatLng[], spacingM: number, max = MAX_PINS): GridPin[] {
  if (poly.length < 3 || !poly.every(validPoint)) throw new Error("Draw the service area with at least 3 points.");
  if (!validSpacing(spacingM)) throw new Error("Pin spacing must be between 100 m and 16 km.");
  const center = polygonCenter(poly);
  const lats = poly.map((p) => p.lat);
  const lngs = poly.map((p) => p.lng);
  const heightM = (Math.max(...lats) - Math.min(...lats)) * M_PER_DEG;
  const widthM = metersBetween({ lat: center.lat, lng: Math.min(...lngs) }, { lat: center.lat, lng: Math.max(...lngs) });
  const rows = Math.floor(heightM / spacingM / 2) * 2 + 1;
  const cols = Math.floor(widthM / spacingM / 2) * 2 + 1;
  if (rows * cols > 40_000) throw new Error("That area is too big for this spacing. Space the pins further apart.");
  const pins: GridPin[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const p = offset(center, ((rows - 1) / 2 - row) * spacingM, (col - (cols - 1) / 2) * spacingM);
      if (pointInPolygon(p, poly)) pins.push({ ...p, row, col });
    }
  }
  if (!pins.length) throw new Error("No pins fit inside that area. Space the pins closer together.");
  if (pins.length > max) throw new Error(`That area needs ${pins.length} pins. The most is ${max}. Space the pins further apart.`);
  return pins;
}

/** The smallest spacing (rounded up to 50 m) that keeps an area at or under max pins. */
export function spacingForArea(poly: LatLng[], max = MAX_PINS): number {
  for (let s = MIN_SPACING; s <= MAX_SPACING; s += 50) {
    try {
      areaPoints(poly, s, max);
      return s;
    } catch {
      // too many pins at this spacing, or none: keep widening
    }
  }
  return MAX_SPACING;
}

/** The Google Maps zoom for a pin, so each search covers about the space between pins. */
export function zoomFor(spacingM: number): number {
  if (spacingM <= 300) return 17;
  if (spacingM <= 700) return 16;
  if (spacingM <= 1500) return 15;
  if (spacingM <= 3000) return 14;
  if (spacingM <= 6000) return 13;
  return 12;
}

export type ScanConfig =
  | { shape: "grid"; size: number; spacing_m: number; center: LatLng }
  | { shape: "area"; spacing_m: number; area: LatLng[] };

/** The pins for a scan config, checked. */
export function pinsFor(config: ScanConfig): GridPin[] {
  if (config.shape === "grid") {
    if (!validPoint(config.center)) throw new Error("Pick a center on the map.");
    return gridPoints(config.center, config.size, config.spacing_m);
  }
  return areaPoints(config.area, config.spacing_m);
}

/** Read a config from untrusted JSON. Throws a message a person can act on. */
export function parseConfig(raw: unknown): ScanConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  const spacing = Number(o.spacing_m);
  if (o.shape === "area") {
    const area = Array.isArray(o.area) ? o.area.map((p) => ({ lat: Number((p as LatLng).lat), lng: Number((p as LatLng).lng) })) : [];
    const config: ScanConfig = { shape: "area", spacing_m: spacing, area };
    pinsFor(config);
    return config;
  }
  const c = (o.center ?? {}) as LatLng;
  const config: ScanConfig = { shape: "grid", size: Number(o.size), spacing_m: spacing, center: { lat: round7(Number(c.lat)), lng: round7(Number(c.lng)) } };
  pinsFor(config);
  return config;
}

export function describeConfig(config: ScanConfig): string {
  const spacing = config.spacing_m >= 1000 ? `${+(config.spacing_m / MILE).toFixed(2)} mi` : `${config.spacing_m} m`;
  if (config.shape === "grid") return `${config.size}×${config.size} grid, ${spacing} apart`;
  return `Service area, ${spacing} apart`;
}
