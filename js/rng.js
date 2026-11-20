// Seeded random numbers. The game keeps its generator state inside the save (G.rs) so a loaded game
// continues exactly as it would have.
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
// mulberry32 step on a state holder {rs}
export function rnd(o) {
  let t = (o.rs = (o.rs + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function rint(o, n) { return Math.floor(rnd(o) * n); }
export function pickOne(o, arr) { return arr[Math.floor(rnd(o) * arr.length)]; }
export function shuffle(o, arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd(o) * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  return arr;
}
export function makeRng(seed) { return { rs: (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 1 }; }

// smooth value noise with a seeded lattice (for map generation)
export function makeNoise(seed) {
  const r = makeRng(seed);
  const P = new Uint16Array(512), G = new Float32Array(256);
  for (let i = 0; i < 256; i++) { P[i] = i; G[i] = rnd(r) * 2 - 1; }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd(r) * (i + 1)); const t = P[i]; P[i] = P[j]; P[j] = t; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const fade = (t) => t * t * (3 - 2 * t);
  function v(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = G[P[(P[xi & 255] + yi) & 511] & 255], b = G[P[(P[(xi + 1) & 255] + yi) & 511] & 255];
    const c = G[P[(P[xi & 255] + yi + 1) & 511] & 255], d = G[P[(P[(xi + 1) & 255] + yi + 1) & 511] & 255];
    const u = fade(xf), w = fade(yf);
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * w;
  }
  return function fbm(x, y, oct = 4) {
    let s = 0, amp = 1, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += v(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
    return s / norm;
  };
}
