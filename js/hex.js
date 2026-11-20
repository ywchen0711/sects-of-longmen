// Hex grid helpers: pointy-top hexes in "odd-r" offset layout (odd rows shifted half a hex right).
// Direction order everywhere: 0 E, 1 NE, 2 NW, 3 W, 4 SW, 5 SE.
const EVEN = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
const ODD = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];
export const SQ3 = Math.sqrt(3);

export function nb(w, h, x, y, d) {
  const o = (y & 1 ? ODD : EVEN)[d];
  const nx = x + o[0], ny = y + o[1];
  if (nx < 0 || ny < 0 || nx >= w || ny >= h) return -1;
  return ny * w + nx;
}

// neighbour indices of tile i (array of up to 6, -1 removed); cached per map size
const NBC = new Map();
export function neighbours(w, h) {
  const key = w + 'x' + h;
  let t = NBC.get(key);
  if (t) return t;
  t = new Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = [];
    for (let d = 0; d < 6; d++) { const j = nb(w, h, x, y, d); if (j >= 0) a.push(j); }
    t[y * w + x] = a;
  }
  NBC.set(key, t);
  return t;
}
// neighbour by direction for tile i (-1 off map)
const DIRC = new Map();
export function dirTable(w, h) {
  const key = w + 'x' + h;
  let t = DIRC.get(key);
  if (t) return t;
  t = new Int32Array(w * h * 6);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let d = 0; d < 6; d++) t[(y * w + x) * 6 + d] = nb(w, h, x, y, d);
  DIRC.set(key, t);
  return t;
}

export function toCube(x, y) { const q = x - ((y - (y & 1)) >> 1); return [q, y]; }
export function dist(w, a, b) {
  const ax = a % w, ay = (a / w) | 0, bx = b % w, by = (b / w) | 0;
  const [aq, ar] = toCube(ax, ay), [bq, br] = toCube(bx, by);
  const dq = aq - bq, dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) >> 1;
}
export function distXY(ax, ay, bx, by) {
  const [aq, ar] = toCube(ax, ay), [bq, br] = toCube(bx, by);
  const dq = aq - bq, dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) >> 1;
}

// all tile indices within radius r of tile i (including i), ring order
const RC = new Map();
export function within(w, h, i, r) {
  const key = w + 'x' + h + ':' + r;
  let cache = RC.get(key);
  if (!cache) { cache = new Map(); RC.set(key, cache); }
  let res = cache.get(i);
  if (res) return res;
  const cx = i % w, cy = (i / w) | 0;
  res = [];
  for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++)
    for (let x = Math.max(0, cx - r - 1); x <= Math.min(w - 1, cx + r + 1); x++)
      if (distXY(cx, cy, x, y) <= r) res.push(y * w + x);
  res.sort((a, b) => distXY(cx, cy, a % w, (a / w) | 0) - distXY(cx, cy, b % w, (b / w) | 0));
  if (cache.size < 20000) cache.set(i, res);
  return res;
}

// pixel centre of a tile for hex radius s
export function center(x, y, s) { return [SQ3 * s * (x + 0.5 * (y & 1)), 1.5 * s * y]; }
// tile under a pixel (map space) -> [x, y] (may be off map)
export function pick(px, py, s) {
  const q = (SQ3 / 3 * px - py / 3) / s, r = (2 / 3 * py) / s;
  // cube round
  let cx = q, cz = r, cy = -cx - cz;
  let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
  const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  const row = rz, col = rx + ((rz - (rz & 1)) >> 1);
  return [col, row];
}
// corner k (0..5) offset of a pointy hex, starting at the top-right going clockwise from angle -30
export function corner(k, s) { const a = Math.PI / 180 * (60 * k - 30); return [s * Math.cos(a), s * Math.sin(a)]; }
// the edge between a tile and its neighbour in direction d uses corners EDGE[d]
export const EDGE = [[0, 1], [5, 0], [4, 5], [3, 4], [2, 3], [1, 2]];
