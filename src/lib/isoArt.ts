// The pictures on empty screens (docs/empty-screens-plan.md): one object of solid isometric blocks on a pale plate,
// in the style of the city on arrowsterr.com (arrowsterr-site, pages/home/iso.php). Same 30° angle, same three tones
// per block (top, left 10% darker, right 22% darker), no outlines. Colors are CSS variables (--iso-<role>, -l, -r), so
// one picture works in light and dark. Pure, so tests can cover it: it returns SVG markup with no user text in it.

export type Role = "blue" | "sky" | "pale" | "paper" | "mist" | "gray" | "gold" | "green" | "ground" | "ink";
type Tone = "" | "l" | "r";

/** Base colors per role. The left and right faces are these, darkened (isoVars). */
export const ISO_PALETTE: Record<"light" | "dark", Record<Role, string>> = {
  light: { blue: "#0943B0", sky: "#4F7FE0", pale: "#BFD3FF", paper: "#FFFFFF", mist: "#E3EAFB", gray: "#C5CCDB", gold: "#F2A65A", green: "#3FA89A", ground: "#EEF2FA", ink: "#0B1B3F" },
  dark: { blue: "#5B87EA", sky: "#3A64C4", pale: "#2C4278", paper: "#2E3547", mist: "#252C3D", gray: "#465066", gold: "#E09A50", green: "#3A9688", ground: "#1C2230", ink: "#0B1B3F" },
};

/** Darken a hex color by k (0 to 1), the same as the website's aw_shade. */
export function shade(hex: string, k: number) {
  const h = hex.replace("#", "");
  const c = [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - k)));
  return `#${c.map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join("")}`;
}

/** The CSS variables for one theme: every role, with its left and right face tones. */
export function isoVars(theme: "light" | "dark"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [role, hex] of Object.entries(ISO_PALETTE[theme])) {
    out[`--iso-${role}`] = hex;
    out[`--iso-${role}-l`] = shade(hex, 0.1);
    out[`--iso-${role}-r`] = shade(hex, 0.22);
  }
  return out;
}

const fill = (role: Role, tone: Tone = "") => `var(--iso-${role}${tone ? `-${tone}` : ""})`;
const n = (v: number) => (Math.round(v * 10) / 10).toString();

/** Every picture shares one frame, so they sit at one size on every screen. */
export const FRAME = { w: 240, h: 170 } as const;
const OX = 120;
const OY = 52;
const S = 11;

type Item = { depth: number; step: number; svg: string; float: boolean };

/** A small isometric scene. Add shapes, then render them back to front. */
export class Iso {
  private items: Item[] = [];
  /** Where the shapes reach, so tests can check they stay in the frame. */
  bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  /** The animation step and whether shapes float with the object (the plate doesn't). */
  step = 0;
  float = true;

  p(x: number, y: number, z: number): [number, number] {
    const pt: [number, number] = [OX + (x - y) * 0.866 * S, OY + (x + y) * 0.5 * S - z * S];
    this.reach(pt[0], pt[1]);
    return pt;
  }
  private reach(x: number, y: number, r = 0) {
    const b = this.bounds;
    b.x0 = Math.min(b.x0, x - r);
    b.y0 = Math.min(b.y0, y - r);
    b.x1 = Math.max(b.x1, x + r);
    b.y1 = Math.max(b.y1, y + r);
  }
  private poly(pts: [number, number][], f: string, extra = "") {
    return `<polygon points="${pts.map(([a, b]) => `${n(a)},${n(b)}`).join(" ")}" fill="${f}"${extra}/>`;
  }
  add(depth: number, svg: string) {
    this.items.push({ depth, step: this.step, svg, float: this.float });
    return this;
  }

  /** A box at (x, y, z), w along x, d along y, h tall. */
  box(x: number, y: number, z: number, w: number, d: number, h: number, role: Role, opacity = 1) {
    const P = (a: number, b: number, c: number) => this.p(a, b, c);
    const o = opacity < 1 ? ` fill-opacity="${opacity}"` : "";
    const svg =
      this.poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], fill(role, "r"), o) +
      this.poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], fill(role, "l"), o) +
      this.poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], fill(role), o);
    return this.add(x + y + z + (w + d) / 2, svg);
  }

  /** A flat shape lying at height z, points on the ground plane. */
  flat(pts: [number, number][], z: number, role: Role, tone: Tone = "", depth?: number, extra = "") {
    const svg = this.poly(
      pts.map(([a, b]) => this.p(a, b, z)),
      fill(role, tone),
      extra,
    );
    const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length;
    const cy = pts.reduce((s, q) => s + q[1], 0) / pts.length;
    return this.add(depth ?? cx + cy + z, svg);
  }

  /** A rectangle drawn on an upright plane: y = at (the left face, "y") or x = at (the right face, "x"). */
  face(plane: "x" | "y", at: number, a0: number, z0: number, a1: number, z1: number, role: Role, tone: Tone = "", depth?: number) {
    const P = (a: number, z: number) => (plane === "y" ? this.p(a, at, z) : this.p(at, a, z));
    const svg = this.poly([P(a0, z0), P(a1, z0), P(a1, z1), P(a0, z1)], fill(role, tone));
    return this.add(depth ?? at + (a0 + a1) / 2 + z0 + 0.05, svg);
  }

  /** A loop on the ground plane at height z, drawn as a band (a ring, a chain link). */
  loop(cx: number, cy: number, z: number, a: number, b: number, width: number, role: Role, tone: Tone = "", depth?: number) {
    const pts = Array.from({ length: 36 }, (_, i) => {
      const t = (i / 36) * Math.PI * 2;
      return this.p(cx + a * Math.cos(t), cy + b * Math.sin(t), z);
    });
    const d = `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}Z`;
    return this.add(depth ?? cx + cy + z, `<path d="${d}" fill="none" stroke="${fill(role, tone)}" stroke-width="${n(width * S)}" stroke-linejoin="round"/>`);
  }

  /** An upright cylinder: its side, then its top. */
  cyl(cx: number, cy: number, z: number, r: number, h: number, role: Role, depth?: number) {
    const [x, yTop] = this.p(cx, cy, z + h);
    const [, yBot] = this.p(cx, cy, z);
    const rx = r * S * 1.2247;
    const ry = r * S * 0.7071;
    this.reach(x, yTop - ry, 0);
    this.reach(x - rx, yBot + ry, 0);
    this.reach(x + rx, yBot + ry, 0);
    const side = `<path d="M${n(x - rx)} ${n(yTop)}V${n(yBot)}A${n(rx)} ${n(ry)} 0 0 0 ${n(x + rx)} ${n(yBot)}V${n(yTop)}Z" fill="${fill(role, "l")}"/>`;
    const right = `<path d="M${n(x)} ${n(yTop + ry)}V${n(yBot + ry)}A${n(rx)} ${n(ry)} 0 0 0 ${n(x + rx)} ${n(yBot)}V${n(yTop)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x)} ${n(yTop + ry)}Z" fill="${fill(role, "r")}"/>`;
    const top = `<ellipse cx="${n(x)}" cy="${n(yTop)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill(role)}"/>`;
    return this.add(depth ?? cx + cy + z + r, side + right + top);
  }

  /** A flat ellipse lying at height z (a dial, a lens, a shadow). */
  disc(cx: number, cy: number, z: number, r: number, role: Role, tone: Tone = "", depth?: number, extra = "") {
    const [x, y] = this.p(cx, cy, z);
    const rx = r * S * 1.2247;
    const ry = r * S * 0.7071;
    this.reach(x, y, rx);
    return this.add(depth ?? cx + cy + z + 0.01, `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill(role, tone)}"${extra}/>`);
  }

  /** A shape on the ground plane, raised h tall (a gear): its sides as stacked slices, then its top. */
  extrude(pts: [number, number][], z: number, h: number, role: Role, depth?: number) {
    const slices = Math.max(2, Math.ceil(h / 0.08));
    const at = (k: number) => pts.map(([a, b]) => this.p(a, b, z + k)) as [number, number][];
    let svg = "";
    for (let i = 0; i < slices; i++) svg += this.poly(at((h * i) / slices), fill(role, i === 0 ? "r" : "l"));
    svg += this.poly(at(h), fill(role));
    const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length;
    const cy = pts.reduce((s, q) => s + q[1], 0) / pts.length;
    return this.add(depth ?? cx + cy + z, svg);
  }

  /** A line through points on the scene (x, y, z), as a stroke: a trend line, clock hands, a cable. */
  line(pts: [number, number, number][], role: Role, width: number, depth: number, tone: Tone = "") {
    const q = pts.map(([a, b, c]) => this.p(a, b, c));
    const d = `M${q.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}`;
    return this.add(depth, `<path d="${d}" fill="none" stroke="${fill(role, tone)}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  /** Any SVG at a screen point of the scene, for the few round things (a globe, a pin head, Zippie). */
  at(x: number, y: number, z: number, depth: number, draw: (sx: number, sy: number) => string, r = 0) {
    const [sx, sy] = this.p(x, y, z);
    this.reach(sx, sy, r);
    return this.add(depth, draw(sx, sy));
  }

  /** The pale plate every object stands on, and the object's soft shadow on it. */
  plate(shadow?: { cx: number; cy: number; r: number }) {
    const was = { step: this.step, float: this.float };
    this.step = 0;
    this.float = false;
    this.box(0, 0, -0.5, 8, 8, 0.5, "ground");
    this.items[this.items.length - 1].depth = -100;
    if (shadow) this.disc(shadow.cx, shadow.cy, 0.001, shadow.r, "ink", "", -99, ' fill-opacity="0.05"');
    Object.assign(this, was);
    return this;
  }

  /** The markup: back to front, each shape in its step's group, the object inside one floating group. */
  render() {
    const sorted = [...this.items].sort((a, b) => a.depth - b.depth);
    const wrap = (i: Item) => `<g class="iso-p" style="--i:${i.step}">${i.svg}</g>`;
    const still = sorted.filter((i) => !i.float).map(wrap).join("");
    const floating = sorted.filter((i) => i.float).map(wrap).join("");
    return `${still}<g class="iso-float">${floating}</g>`;
  }
}

/** Points of a flat shape around a center on the ground plane. */
const around = (cx: number, cy: number, k: number, r: (i: number) => number, turn = 0) =>
  Array.from({ length: k }, (_, i) => {
    const t = turn + (i / k) * Math.PI * 2;
    return [cx + r(i) * Math.cos(t), cy + r(i) * Math.sin(t)] as [number, number];
  });

const gear = (s: Iso, cx: number, cy: number, R: number, role: Role, step: number) => {
  s.step = step;
  s.extrude(around(cx, cy, 32, (i) => (i % 4 < 2 ? R : R * 0.78), Math.PI / 32), 0, 0.6, role);
  s.disc(cx, cy, 0.61, R * 0.3, "ground", "l", cx + cy + 0.7);
};

// ─────────────── the pictures ───────────────
// Each is drawn on the 8 by 8 plate. Steps order the drop-in: plate 0, then the object's parts.

export const DRAWINGS = {
  drafts: (s: Iso) => {
    s.plate({ cx: 3.8, cy: 3.6, r: 2.9 });
    s.step = 1;
    s.box(2.0, 1.0, 0, 4.4, 5.4, 0.25, "pale");
    s.step = 2;
    s.box(1.7, 1.3, 0.3, 4.4, 5.4, 0.25, "mist");
    s.step = 3;
    s.box(1.4, 1.6, 0.6, 4.4, 5.4, 0.25, "paper");
    s.flat([[1.9, 2.1], [4.9, 2.1], [4.9, 2.6], [1.9, 2.6]], 0.86, "blue", "", 9);
    s.flat([[1.9, 3.2], [5.3, 3.2], [5.3, 3.5], [1.9, 3.5]], 0.86, "pale", "", 9);
    s.flat([[1.9, 3.9], [5.0, 3.9], [5.0, 4.2], [1.9, 4.2]], 0.86, "pale", "", 9);
    s.flat([[1.9, 4.6], [4.2, 4.6], [4.2, 4.9], [1.9, 4.9]], 0.86, "pale", "", 9);
    s.flat([[1.9, 5.3], [4.7, 5.3], [4.7, 5.6], [1.9, 5.6]], 0.86, "pale", "", 9);
    s.step = 4;
    s.box(6.5, 1.8, 0, 0.45, 3.4, 0.45, "blue");
    s.box(6.5, 5.2, 0, 0.45, 0.6, 0.45, "gold");
  },
  calendar: (s: Iso) => {
    s.plate({ cx: 4, cy: 4, r: 3 });
    s.step = 1;
    s.box(1.2, 1.4, 0, 5.6, 5.2, 1.0, "paper");
    s.step = 2;
    s.box(1.2, 1.4, 1.0, 5.6, 1.1, 0.5, "blue");
    s.box(2.4, 1.7, 1.5, 0.35, 0.35, 0.6, "gray");
    s.box(5.3, 1.7, 1.5, 0.35, 0.35, 0.6, "gray");
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s.flat([[1.7 + i * 1.65, 2.9 + j * 1.2], [2.9 + i * 1.65, 2.9 + j * 1.2], [2.9 + i * 1.65, 3.8 + j * 1.2], [1.7 + i * 1.65, 3.8 + j * 1.2]], 1.0, "mist", "", 8);
    s.step = 3;
    s.box(3.35, 2.9, 1.0, 1.2, 0.9, 0.6, "blue");
    s.step = 4;
    s.box(5.0, 4.1, 1.0, 1.2, 0.9, 0.4, "sky");
    s.step = 5;
    s.box(1.7, 5.3, 1.0, 1.2, 0.9, 0.3, "pale");
  },
  search: (s: Iso) => {
    s.plate({ cx: 4, cy: 4.2, r: 3 });
    s.step = 1;
    s.box(0.8, 4.6, 0, 1.1, 1.1, 2.0, "pale");
    s.step = 2;
    s.box(2.2, 4.6, 0, 1.1, 1.1, 3.2, "sky");
    s.step = 3;
    s.box(3.6, 4.6, 0, 1.1, 1.1, 4.6, "blue");
    s.step = 4;
    s.cyl(5.6, 2.2, 0, 1.5, 0.5, "blue");
    s.disc(5.6, 2.2, 0.51, 1.05, "pale", "", 9, ' fill-opacity="0.85"');
    s.box(5.3, 3.7, 0, 0.6, 2.2, 0.45, "gold");
  },
  globe: (s: Iso) => {
    s.plate({ cx: 4, cy: 4, r: 2.4 });
    s.step = 1;
    s.cyl(4, 4, 0, 1.8, 0.6, "mist");
    s.box(3.8, 3.8, 0.6, 0.4, 0.4, 1.0, "gray");
    s.step = 2;
    const r = 2.5 * S;
    s.at(4, 4, 4.0, 20, (x, y) =>
      [
        `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${fill("blue", "l")}"/>`,
        `<circle cx="${n(x - r * 0.18)}" cy="${n(y - r * 0.18)}" r="${n(r * 0.78)}" fill="${fill("blue")}"/>`,
        `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r)}" ry="${n(r * 0.34)}" fill="none" stroke="${fill("pale")}" stroke-width="2" stroke-opacity="0.75"/>`,
        `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r * 0.42)}" ry="${n(r)}" fill="none" stroke="${fill("pale")}" stroke-width="2" stroke-opacity="0.75"/>`,
        `<circle cx="${n(x + r * 0.62)}" cy="${n(y - r * 0.55)}" r="${n(r * 0.16)}" fill="${fill("gold")}"/>`,
      ].join(""),
    r);
  },
  gap: (s: Iso) => {
    s.plate({ cx: 4, cy: 4, r: 3 });
    s.step = 1;
    s.box(1.4, 3.0, 0, 1.8, 1.8, 5.6, "gray");
    s.step = 2;
    s.box(4.4, 3.0, 0, 1.8, 1.8, 3.0, "blue");
    s.step = 3;
    s.box(4.4, 3.0, 3.0, 1.8, 1.8, 2.6, "sky", 0.28);
  },
  prompts: (s: Iso) => {
    s.plate({ cx: 4, cy: 3.8, r: 2.9 });
    s.step = 1;
    s.box(1.4, 3.2, 0.7, 5.2, 0.9, 3.6, "paper");
    s.step = 2;
    s.face("y", 4.1, 1.9, 3.3, 5.6, 3.7, "blue", "", 9.2);
    s.step = 3;
    s.face("y", 4.1, 1.9, 2.5, 4.8, 2.9, "sky", "", 9.2);
    s.step = 4;
    s.face("y", 4.1, 1.9, 1.7, 5.2, 2.1, "pale", "", 9.2);
    // The bubble's tail, on its front face, pointing down to the plate.
    s.step = 1;
    s.at(0, 0, 0, 9.15, () => {
      const a = s.p(1.9, 4.1, 0.75);
      const b = s.p(3.3, 4.1, 0.75);
      const c = s.p(1.5, 4.1, -0.1);
      return `<polygon points="${[a, b, c].map(([x, y]) => `${n(x)},${n(y)}`).join(" ")}" fill="${fill("paper", "l")}"/>`;
    });
  },
  waiting: (s: Iso) => {
    s.plate({ cx: 4, cy: 4, r: 2.2 });
    s.step = 1;
    s.cyl(4, 4, 0, 1.7, 0.35, "blue");
    s.step = 2;
    s.box(2.6, 5.0, 0.35, 0.3, 0.3, 3.85, "gray");
    s.box(5.0, 2.6, 0.35, 0.3, 0.3, 3.85, "gray");
    const [x, top] = s.p(4, 4, 4.2);
    const [, bot] = s.p(4, 4, 0.35);
    const mid = (top + bot) / 2;
    const w = 14;
    const h = bot - top;
    s.add(8.2, `<polygon points="${n(x - w)},${n(top)} ${n(x + w)},${n(top)} ${n(x)},${n(mid)}" fill="${fill("pale")}" fill-opacity="0.6"/><polygon points="${n(x)},${n(mid)} ${n(x - w)},${n(bot)} ${n(x + w)},${n(bot)}" fill="${fill("pale")}" fill-opacity="0.6"/>`);
    s.step = 3;
    s.add(8.3, `<polygon points="${n(x - w * 0.42)},${n(mid - h * 0.2)} ${n(x + w * 0.42)},${n(mid - h * 0.2)} ${n(x)},${n(mid)}" fill="${fill("gold")}"/><path d="M${n(x)} ${n(mid)}V${n(bot - h * 0.3)}" stroke="${fill("gold")}" stroke-width="1.5"/><polygon points="${n(x)},${n(bot - h * 0.3)} ${n(x - w * 0.62)},${n(bot)} ${n(x + w * 0.62)},${n(bot)}" fill="${fill("gold")}"/>`);
    s.step = 4;
    s.cyl(4, 4, 4.2, 1.7, 0.35, "blue", 8.4);
  },
  sources: (s: Iso) => {
    s.plate({ cx: 4, cy: 4, r: 3 });
    s.step = 1;
    s.box(1.2, 4.4, 0, 2.0, 2.0, 2.4, "sky");
    s.step = 2;
    s.box(4.4, 1.2, 0, 2.0, 2.0, 3.2, "blue");
    s.step = 3;
    const [x, y] = s.p(3.8, 3.8, 2.2);
    s.add(20, `<rect x="${n(x - 19)}" y="${n(y - 7)}" width="24" height="14" rx="7" fill="none" stroke="${fill("gold")}" stroke-width="4"/><rect x="${n(x - 5)}" y="${n(y - 7)}" width="24" height="14" rx="7" fill="none" stroke="${fill("gold", "r")}" stroke-width="4"/>`);
  },
  traffic: (s: Iso) => {
    s.plate({ cx: 4, cy: 5.3, r: 3 });
    const bars: [number, number, Role][] = [
      [1.0, 1.6, "pale"],
      [2.5, 2.6, "sky"],
      [4.0, 3.6, "sky"],
      [5.5, 4.8, "blue"],
    ];
    bars.forEach(([x, h, role], i) => {
      s.step = i + 1;
      s.box(x, 4.8, 0, 1.2, 1.2, h, role);
    });
    s.step = 5;
    s.line(bars.map(([x, h]) => [x + 0.6, 5.4, h + 1.2] as [number, number, number]), "gold", 3, 30);
    s.at(6.1, 5.4, 6.0, 30.1, (x, y) => `<circle cx="${n(x)}" cy="${n(y)}" r="4.5" fill="${fill("gold")}"/>`, 5);
  },
  visitors: (s: Iso) => {
    s.plate();
    const steps: [number, number][] = [
      [1.0, 6.2],
      [2.1, 5.2],
      [3.3, 4.4],
      [4.5, 3.6],
    ];
    steps.forEach(([x, y], i) => {
      s.step = i + 1;
      s.box(x, y, 0, 0.9, 0.9, 0.15, i === steps.length - 1 ? "sky" : "pale");
    });
    s.step = 5;
    s.disc(6.1, 2.2, 0.01, 0.7, "ink", "", 5, ' fill-opacity="0.1"');
    s.box(6.0, 2.1, 0, 0.2, 0.2, 2.4, "gray");
    const r = 1.0 * S;
    s.at(6.1, 2.2, 3.2, 12, (x, y) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${fill("blue")}"/><circle cx="${n(x - r * 0.15)}" cy="${n(y - r * 0.15)}" r="${n(r * 0.38)}" fill="${fill("paper")}"/>`, r);
  },
  reports: (s: Iso) => {
    s.plate({ cx: 4, cy: 3.6, r: 2.8 });
    s.step = 1;
    s.box(2.4, 2.4, 0, 4.0, 0.3, 5.0, "mist");
    s.step = 2;
    s.box(1.6, 3.8, 0, 4.0, 0.3, 4.6, "paper");
    s.face("y", 4.1, 2.2, 3.8, 4.6, 4.1, "blue", "", 8.5);
    s.step = 3;
    s.face("y", 4.1, 2.2, 0.8, 2.8, 2.8, "blue", "", 8.5);
    s.face("y", 4.1, 3.1, 0.8, 3.7, 2.0, "sky", "", 8.5);
    s.face("y", 4.1, 4.0, 0.8, 4.6, 3.3, "pale", "", 8.5);
  },
  clock: (s: Iso) => {
    s.plate({ cx: 4, cy: 4, r: 2.9 });
    s.step = 1;
    s.cyl(4, 4, 0, 2.6, 0.9, "blue");
    s.step = 2;
    s.disc(4, 4, 0.91, 2.15, "paper", "", 12);
    for (let i = 0; i < 4; i++) {
      const t = (i / 4) * Math.PI * 2 + Math.PI / 4;
      s.disc(4 + 1.7 * Math.cos(t), 4 + 1.7 * Math.sin(t), 0.92, 0.12, "gray", "r", 12.1);
    }
    s.step = 3;
    s.line([[4, 4, 0.93], [2.9, 2.9, 0.93]], "blue", 3, 12.2);
    s.line([[4, 4, 0.93], [5.4, 3.7, 0.93]], "gold", 2.5, 12.2);
    s.disc(4, 4, 0.94, 0.16, "blue", "", 12.3);
  },
  link: (s: Iso) => {
    s.plate({ cx: 4, cy: 4, r: 2.6 });
    s.step = 1;
    s.loop(3.2, 4.6, 0.12, 1.9, 0.95, 0.5, "blue", "l", 7);
    s.loop(3.2, 4.6, 0.3, 1.9, 0.95, 0.5, "blue", "", 7.1);
    s.step = 2;
    s.loop(4.8, 3.4, 0.12, 1.9, 0.95, 0.5, "sky", "l", 7.2);
    s.loop(4.8, 3.4, 0.3, 1.9, 0.95, 0.5, "sky", "", 7.3);
  },
  palette: (s: Iso) => {
    s.plate({ cx: 3.8, cy: 3.6, r: 3 });
    s.step = 1;
    s.box(1.0, 3.0, 0, 5.6, 1.2, 0.35, "paper");
    const cards: [number, Role][] = [
      [1.3, "blue"],
      [2.6, "sky"],
      [3.9, "gold"],
      [5.2, "green"],
    ];
    cards.forEach(([x, role], i) => {
      s.step = i + 2;
      s.box(x, 3.4, 0.35, 1.0, 0.25, 3.4 - i * 0.3, role);
    });
  },
  lock: (s: Iso) => {
    s.plate({ cx: 4, cy: 4.2, r: 2.4 });
    s.step = 2;
    s.box(2.6, 3.4, 0, 2.8, 1.6, 2.6, "blue");
    s.face("y", 5.0, 3.85, 0.7, 4.15, 1.4, "paper", "", 12);
    s.at(4, 5.0, 1.6, 12.1, (x, y) => `<circle cx="${n(x)}" cy="${n(y)}" r="3.2" fill="${fill("paper")}"/>`, 4);
    s.step = 1;
    const arc = Array.from({ length: 13 }, (_, i) => {
      const t = Math.PI - (i / 12) * Math.PI;
      return [4 + 0.95 * Math.cos(t), 4.2, 2.6 + 1.5 * Math.sin(t)] as [number, number, number];
    });
    s.line(arc, "gray", 0.55 * S, 7, "l");
  },
  files: (s: Iso) => {
    s.plate({ cx: 4, cy: 3.8, r: 2.9 });
    s.step = 1;
    s.box(1.6, 3.0, 0, 4.8, 0.35, 3.6, "sky");
    s.box(1.6, 3.0, 3.6, 1.8, 0.35, 0.5, "sky");
    s.step = 2;
    s.box(2.0, 3.4, 0.2, 4.0, 0.2, 3.8, "paper");
    s.step = 3;
    s.box(2.3, 3.65, 0.2, 3.6, 0.2, 3.3, "mist");
    s.step = 4;
    s.box(1.6, 3.9, 0, 4.8, 0.35, 2.6, "blue");
  },
  gears: (s: Iso) => {
    s.plate({ cx: 4, cy: 4, r: 3 });
    gear(s, 3.1, 4.6, 1.9, "blue", 1);
    gear(s, 5.3, 2.4, 1.3, "sky", 2);
  },
  plug: (s: Iso) => {
    s.plate({ cx: 4, cy: 4, r: 3 });
    s.step = 1;
    s.box(1.2, 3.4, 0, 2.6, 2.6, 1.6, "paper");
    s.flat([[1.9, 4.2], [2.3, 4.2], [2.3, 4.4], [1.9, 4.4]], 1.6, "gray", "r", 9);
    s.flat([[1.9, 5.0], [2.3, 5.0], [2.3, 5.2], [1.9, 5.2]], 1.6, "gray", "r", 9);
    s.step = 2;
    s.box(3.5, 1.6, 0.6, 1.4, 0.2, 0.2, "gray");
    s.box(3.5, 2.3, 0.6, 1.4, 0.2, 0.2, "gray");
    s.box(4.8, 1.2, 0, 1.8, 1.8, 1.4, "blue");
    s.step = 3;
    s.line([[6.6, 2.1, 0.5], [7.2, 3.6, 0.2], [6.6, 5.4, 0.1], [7.4, 7.2, 0.1]], "gray", 3.5, 20, "l");
  },
  flag: (s: Iso) => {
    s.plate({ cx: 4, cy: 4, r: 2.6 });
    s.step = 1;
    s.cyl(4, 4, 0, 2.4, 0.5, "green");
    s.cyl(4, 4, 0.5, 1.4, 0.45, "green", 9.5);
    s.step = 2;
    s.box(3.9, 3.9, 0.95, 0.2, 0.2, 4.4, "gray");
    s.step = 3;
    const wave = Array.from({ length: 9 }, (_, i) => [4.1 + i * 0.28, 4.0, 5.3 - Math.sin((i / 8) * Math.PI) * 0.18] as [number, number, number]);
    const low = [...wave].reverse().map(([x, y, z]) => [x, y, z - 1.6] as [number, number, number]);
    s.add(10, `<polygon points="${[...wave, ...low].map(([x, y, z]) => s.p(x, y, z)).map(([a, b]) => `${n(a)},${n(b)}`).join(" ")}" fill="${fill("blue")}"/>`);
  },
  chart: (s: Iso) => {
    s.plate({ cx: 4, cy: 3.9, r: 2.9 });
    s.step = 1;
    s.box(1.4, 3.6, 0, 5.2, 0.35, 4.2, "paper");
    for (let k = 0; k < 3; k++) s.face("y", 3.95, 1.9, 1.0 + k * 1.1, 6.1, 1.05 + k * 1.1, "mist", "", 8.5);
    s.step = 2;
    const pts: [number, number][] = [
      [1.9, 1.0],
      [2.9, 1.8],
      [3.8, 1.5],
      [4.8, 2.6],
      [5.9, 3.4],
    ];
    s.line(pts.map(([x, z]) => [x, 3.95, z] as [number, number, number]), "blue", 3, 8.6);
    s.step = 3;
    pts.forEach(([x, z]) => s.at(x, 3.95, z, 8.7, (a, b) => `<circle cx="${n(a)}" cy="${n(b)}" r="3" fill="${fill("paper")}" stroke="${fill("blue")}" stroke-width="2"/>`, 4));
  },
  zippie: (s: Iso) => {
    s.plate({ cx: 4, cy: 4, r: 2 });
    s.step = 1;
    // Zippie standing on the plate: the arrowhead body, eyes, smile and bow tie, flat colors from the palette.
    s.at(4, 4, 0, 20, (x, y) => {
      const k = 0.62;
      return `<g transform="translate(${n(x - 60 * k)} ${n(y - 108 * k)}) scale(${k})"><path d="M60 26 L102 104 Q104 108 99.5 108 L80 108 Q77 108 75.5 105.5 L60 97 L44.5 105.5 Q43 108 40 108 L20.5 108 Q16 108 18 104 Z" fill="${fill("blue")}" stroke="${fill("blue")}" stroke-width="10" stroke-linejoin="round"/><path d="M55 38 L30 86" stroke="#fff" stroke-opacity="0.22" stroke-width="5" stroke-linecap="round"/><ellipse cx="49" cy="66" rx="8.5" ry="9.5" fill="#fff"/><ellipse cx="71" cy="66" rx="8.5" ry="9.5" fill="#fff"/><circle cx="50.5" cy="67.5" r="4.6" fill="${fill("ink")}"/><circle cx="72.5" cy="67.5" r="4.6" fill="${fill("ink")}"/><path d="M54.5 78 Q60 83 65.5 78" fill="none" stroke="${fill("ink")}" stroke-width="2.4" stroke-linecap="round"/><path d="M58.5 89 L51 84.5 L49.5 85.5 L49.5 92.5 L51 93.5 Z M61.5 89 L69 84.5 L70.5 85.5 L70.5 92.5 L69 93.5 Z" fill="${fill("gold")}"/><path d="M60 2c1.6 6 3.2 7.6 9.2 9.2-6 1.6-7.6 3.2-9.2 9.2-1.6-6-3.2-7.6-9.2-9.2 6-1.6 7.6-3.2 9.2-9.2z" fill="${fill("gold")}"/></g>`;
    }, 0);
    // Zippie's height on screen, for the frame check.
    const [x, y] = s.p(4, 4, 0);
    s.bounds.y0 = Math.min(s.bounds.y0, y - 108 * 0.62);
    s.bounds.x0 = Math.min(s.bounds.x0, x - 44 * 0.62);
  },
} satisfies Record<string, (s: Iso) => void>;

export type DrawingKind = keyof typeof DRAWINGS;
export const DRAWING_KINDS = Object.keys(DRAWINGS) as DrawingKind[];

/** One picture's markup and how far it reaches, inside FRAME. */
export function drawing(kind: DrawingKind) {
  const s = new Iso();
  DRAWINGS[kind](s);
  return { body: s.render(), bounds: s.bounds };
}
