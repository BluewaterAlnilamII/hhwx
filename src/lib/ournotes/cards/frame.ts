import type { OurNotesCardKind } from "./api-contract";

type Point = [number, number];
type Color = [number, number, number];
type Stop = [number, Color];
type Gradient = { from: Point; to: Point; stops: Stop[] };
type FrameColor = { points?: Point[]; gradients: Gradient[] };

function palette(kind: OurNotesCardKind, rarity: number): Stop[] {
  const entries: [number, string][] = rarity === 2 ? [[0, "72b5ff"], [1, "72b5ff"]]
    : rarity === 3 ? [[0, kind === "member" ? "fefb94" : "fefbb2"], [1, "eac561"]]
    : rarity === 4 ? kind === "member"
      ? [[0.2, "7200ff"], [0.6, "00fff6"], [0.8, "ffd400"], [0.9000076295109484, "fd80ff"], [1, "ff6666"]]
      : [[0.2, "7ca1ff"], [0.4, "00fff6"], [0.6, "ffd400"], [0.8, "fd80ff"], [1, "ff80b3"]]
    : rarity === 10 ? [[0, "aafaff"], [1, "90ffc4"]]
    : rarity === 20 ? [[0, "ff6161"], [0.4, "fb5ca3"], [1, "ffbdf8"]]
    : [[0, "ffffff"], [1, "ffffff"]];
  return entries.map(([time, hex]) => [time, [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as Color]);
}

function sample(stops: Stop[], t: number, fixed: boolean): Color {
  const next = stops.findIndex(([time]) => time > t);
  if (next < 0) return stops[stops.length - 1][1];
  if (fixed || next === 0) return stops[next][1];
  const [start, a] = stops[next - 1], [end, b] = stops[next];
  return a.map((value, channel) => value + (b[channel] - value) * (t - start) / (end - start)) as Color;
}

// Express a scalar vertex field as an SVG gradient in native card coordinates.
function vertexGradient(points: Point[], values: number[], colors: [Color, Color]): Gradient {
  const [[x0, y0], [x1, y1], [x2, y2]] = points;
  const [v0, v1, v2] = values;
  const determinant = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  const dx = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / determinant;
  const dy = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / determinant;
  const min = Math.min(...values), max = Math.max(...values);
  const from = points[values.indexOf(min)];
  const scale = max === min ? 0 : (max - min) / (dx * dx + dy * dy);
  return { from, to: scale ? [from[0] + dx * scale, from[1] + dy * scale] : [from[0] + 1, from[1]], stops: [[0, colors[0]], [1, colors[1]]] };
}

function buildFrame(kind: OurNotesCardKind, rarity: number): FrameColor[] {
  const stops = palette(kind, rarity), fixed = rarity === 4;
  if (kind === "member") {
    // UIGradientImage splits axis-aligned nine-slice geometry at the color keys,
    // samples Fixed/Blend at those vertices, then the GPU interpolates the colors.
    const times = [...new Set([0, 9 / 294, 1 - 9 / 294, 1, ...stops.map(([t]) => t)])].sort((a, b) => a - b);
    return [{ gradients: [{ from: [0, 294], to: [0, 0], stops: times.map((t) => [t, sample(stops, t, fixed)]) }] }];
  }
  const angle = 128 * Math.PI / 180, dx = Math.cos(angle), dy = -Math.sin(angle);
  const min = dx * 326 + dy * 184;
  if (stops.length === 2) {
    return [{ gradients: [{ from: [326, 184], to: [326 - dx * min, 184 - dy * min], stops }] }];
  }
  const colorAt = ([x, y]: Point) => sample(stops, Math.max(0, Math.min(1, (dx * x + dy * y - min) / -min)), fixed);
  const xs = [0, 9, 317, 326], ys = [0, 9, 175, 184];
  return [0, 1, 2].flatMap((y) => [0, 1, 2].flatMap((x): FrameColor[] => {
    if (x === 1 && y === 1) return []; // Transparent center of FrameSquare_6px.
    const quad: Point[] = [[xs[x], ys[y + 1]], [xs[x], ys[y]], [xs[x + 1], ys[y]], [xs[x + 1], ys[y + 1]]];
    return [[quad[0], quad[1], quad[2]], [quad[2], quad[3], quad[0]]].map((points) => {
      const colors = points.map(colorAt);
      const unique = colors.filter((color, i) => colors.findIndex((other) => other.every((v, c) => v === color[c])) === i);
      if (unique.length <= 2) {
        return { points, gradients: [vertexGradient(points, colors.map((color) => color.every((v, c) => v === unique[0][c]) ? 0 : 1), [unique[0], unique[1] ?? unique[0]])] };
      }
      // SVG has no triangle color interpolation. Isolated RGB planes sum via
      // screen blending, reproducing the affine vertex color inside this triangle.
      return { points, gradients: [0, 1, 2].map((channel) => {
        const values = colors.map((color) => color[channel]);
        const tint = (value: number) => [0, 1, 2].map((c) => c === channel ? value : 0) as Color;
        return vertexGradient(points, values, [tint(Math.min(...values)), tint(Math.max(...values))]);
      }) };
    });
  }));
}

// Only the fixed game palettes are built; catalog rows reuse the same geometry.
const frames = Object.fromEntries((["member", "support"] as const).map((kind) => [kind,
  Object.fromEntries([0, 2, 3, 4, 10, 20].map((rarity) => [rarity, buildFrame(kind, rarity)])),
]));

export function ourNotesFrameColors(kind: OurNotesCardKind, rarity: number): FrameColor[] {
  return frames[kind][rarity] ?? frames[kind][0];
}
