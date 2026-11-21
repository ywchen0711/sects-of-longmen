// Seeded hex map generator: land shape, relief, climate (cold north, dry west, warm wet south),
// rivers running downhill, lakes, resources, start sites, villages and camps.
import { TID, TERRAIN_IDS, TERRAIN, RESOURCES, RES_IDS } from './data.js?v=3';
import { makeRng, makeNoise, rnd, rint, shuffle } from './rng.js?v=3';
import { neighbours, dirTable, dist, within } from './hex.js?v=3';

export function generate(opt) {
  const { w, h, seed, type = 'pangaea', players = 4, villages = 4, camps = 5 } = opt;
  const R = makeRng('map:' + seed);
  const n1 = makeNoise(seed + ':e'), n2 = makeNoise(seed + ':m'), n3 = makeNoise(seed + ':t'), n4 = makeNoise(seed + ':r');
  const N = w * h, NB = neighbours(w, h), DT = dirTable(w, h);
  const elev = new Float32Array(N);
  // land blobs
  const centres = [];
  if (type === 'pangaea') centres.push([0.5, 0.5, 0.62, 0.55]);
  else if (type === 'continents') { centres.push([0.27, 0.5, 0.33, 0.62]); centres.push([0.73, 0.5, 0.33, 0.62]); }
  else { for (let k = 0; k < 9; k++) centres.push([0.12 + rnd(R) * 0.76, 0.14 + rnd(R) * 0.72, 0.12 + rnd(R) * 0.1, 0.12 + rnd(R) * 0.1]); }
  const sc = 4.2 / Math.max(w, h) * 6;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5 * (y & 1)) / w, v = y / h;
    let blob = 0;
    for (const [cx, cy, rx, ry] of centres) {
      const dx = (u - cx) / rx, dy = (v - cy) / ry;
      blob = Math.max(blob, 1 - Math.sqrt(dx * dx + dy * dy));
    }
    const nz = n1(x * sc * 0.55, y * sc * 0.55, 5);
    let e = blob * 1.15 + nz * 0.75;
    // keep a frame of sea at the edges
    const edge = Math.min(x, w - 1 - x, y * 1.3, (h - 1 - y) * 1.3);
    if (edge < 2) e -= (2 - edge) * 0.5;
    elev[y * w + x] = e;
  }
  // land fraction
  const landFrac = type === 'isles' ? 0.36 : type === 'continents' ? 0.44 : 0.48;
  const sorted = Array.from(elev).sort((a, b) => b - a);
  const sea = sorted[Math.floor(N * landFrac)];
  const land = new Uint8Array(N);
  for (let i = 0; i < N; i++) land[i] = elev[i] > sea ? 1 : 0;
  // for two shores, make sure there is a channel between the halves
  if (type === 'continents') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x + 0.5 * (y & 1)) / w;
      if (Math.abs(u - 0.5) < 0.035 + 0.02 * n4(y * 0.3, 7)) land[y * w + x] = 0;
    }
  }
  // remove tiny specks of land (size 1-2) for the continental types, so starts are sane
  const comp = labelComponents(land, NB, 1);
  const sizes = comp.sizes;
  for (let i = 0; i < N; i++) if (land[i] && sizes[comp.id[i]] < (type === 'isles' ? 3 : 4)) land[i] = 0;

  // relief among land tiles: mountains = top of ridged noise + elevation, hills next
  const landIdx = [];
  for (let i = 0; i < N; i++) if (land[i]) landIdx.push(i);
  const relief = new Float32Array(N);
  for (const i of landIdx) {
    const x = i % w, y = (i / w) | 0;
    const ridge = 1 - Math.abs(n4(x * 0.16, y * 0.16, 3));
    relief[i] = elev[i] * 0.55 + ridge * 0.9;
  }
  const rs = landIdx.map((i) => relief[i]).sort((a, b) => b - a);
  const mtn = rs[Math.floor(rs.length * 0.075)], hil = rs[Math.floor(rs.length * 0.24)];
  const ter = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!land[i]) { ter[i] = TID.sea; continue; }
    const x = i % w, y = (i / w) | 0;
    const temp = y / (h - 1) + n3(x * 0.09, y * 0.09, 3) * 0.22;           // 0 north (cold) .. 1 south (warm)
    const moist = 0.5 + n2(x * 0.11, y * 0.11, 4) * 0.75 + ((x / w) - 0.5) * 0.35; // drier west
    let t;
    if (relief[i] >= mtn) t = 'mountain';
    else if (temp < 0.15) t = 'snow';
    else if (relief[i] >= hil) t = temp < 0.24 ? 'snow' : 'hills';
    else if (moist < 0.22 && temp > 0.28) t = 'desert';
    else if (moist > 0.78 && temp > 0.45) t = 'marsh';
    else if (moist > 0.6 && temp > 0.62) t = 'bamboo';
    else if (moist > 0.56) t = 'forest';
    else if (moist > 0.4) t = 'grass';
    else t = 'plains';
    
    ter[i] = TID[t];
  }
  // never let mountains wall off: break long mountain runs into hills here and there
  for (const i of landIdx) if (ter[i] === TID.mountain) {
    let m = 0; for (const j of NB[i]) if (ter[j] === TID.mountain) m++;
    if (m >= 4 && rnd(R) < 0.5) ter[i] = TID.hills;
  }
  // water: lakes are enclosed bodies; coast is water next to land
  const water = new Uint8Array(N);
  for (let i = 0; i < N; i++) water[i] = land[i] ? 0 : 1;
  const wc = labelComponents(water, NB, 1);
  let big = -1, bigSize = 0;
  wc.sizes.forEach((s, k) => { if (s > bigSize) { bigSize = s; big = k; } });
  for (let i = 0; i < N; i++) if (water[i] && wc.id[i] !== big && wc.sizes[wc.id[i]] < 30) ter[i] = TID.lake;
  // a few inland lakes in low wet places
  const lakeTries = Math.round(N / 700);
  for (let k = 0; k < lakeTries; k++) {
    const i = landIdx[rint(R, landIdx.length)];
    const t = TERRAIN_IDS[ter[i]];
    if (t === 'mountain' || t === 'snow' || t === 'desert') continue;
    let ok = true; for (const j of NB[i]) if (!land[j]) ok = false;
    if (!ok) continue;
    ter[i] = TID.lake; land[i] = 0;
    if (rnd(R) < 0.5) { const j = NB[i][rint(R, NB[i].length)]; if (land[j] && TERRAIN_IDS[ter[j]] !== 'mountain') { let ok2 = true; for (const q of NB[j]) if (!land[q] && ter[q] !== TID.lake) ok2 = false; if (ok2) { ter[j] = TID.lake; land[j] = 0; } } }
  }
  for (let i = 0; i < N; i++) if (ter[i] === TID.sea) { for (const j of NB[i]) if (land[j]) { ter[i] = TID.coast; break; } }
  // second ring of shallow water here and there
  for (let i = 0; i < N; i++) if (ter[i] === TID.sea) {
    let c = 0; for (const j of NB[i]) if (ter[j] === TID.coast) c++;
    if (c >= 3 && rnd(R) < 0.35) ter[i] = TID.coast;
  }

  // rivers: from high ground, flow to the lowest neighbour until reaching water
  const river = new Uint8Array(N), rdir = new Uint8Array(N).fill(255);
  const height = (i) => (land[i] ? relief[i] : -9);
  const srcs = shuffle(R, landIdx.filter((i) => relief[i] > hil * 0.98 && ter[i] !== TID.mountain || (ter[i] === TID.mountain && rnd(R) < 0.3)));
  const want = Math.round(landIdx.length / 120);
  let made = 0;
  for (const s of srcs) {
    if (made >= want) break;
    if (river[s]) continue;
    let near = false; for (const j of within(w, h, s, 4)) if (river[j]) near = true;
    if (near) continue;
    const path = [s]; const seen = new Set([s]); let cur = s, okEnd = false;
    for (let step = 0; step < 40; step++) {
      let best = -1, bh = 1e9, bd = -1;
      for (let d = 0; d < 6; d++) {
        const j = DT[cur * 6 + d]; if (j < 0 || seen.has(j)) continue;
        let touch = 0; for (const q of NB[j]) if (q !== cur && (seen.has(q) || river[q])) touch++;
        const hh = height(j) + (river[j] ? -5 : 0) + touch * 0.6 + (d === (rdir[path[path.length - 2]] ?? d) ? -0.05 : 0) + rnd(R) * 0.05;
        if (hh < bh) { bh = hh; best = j; bd = d; }
      }
      if (best < 0) break;
      rdir[cur] = bd;
      if (!land[best] || river[best]) { okEnd = true; break; }
      if (ter[best] === TID.mountain) { ter[best] = TID.hills; }
      path.push(best); seen.add(best); cur = best;
    }
    if (!okEnd || path.length < 4) { for (const p of path) rdir[p] = river[p] ? rdir[p] : 255; continue; }
    for (const p of path) { river[p] = 1; if (ter[p] === TID.mountain) ter[p] = TID.hills; }
    made++;
  }
  for (let i = 0; i < N; i++) if (!river[i]) rdir[i] = 255;

  // resources
  const res = new Uint8Array(N).fill(255);
  const W = { iron: 1.0, horses: 0.9, tea: 0.8, silk: 0.7, salt: 0.6, herbs: 0.9, jade: 0.55, spirit: 0.5, fish: 1.2, rice: 1.0 };
  for (let i = 0; i < N; i++) {
    const t = TERRAIN_IDS[ter[i]];
    if (t === 'sea') continue;
    const p = t === 'coast' || t === 'lake' ? 0.09 : 0.14;
    if (rnd(R) > p) continue;
    const cands = RES_IDS.filter((r) => RESOURCES[r].on.includes(t));
    if (!cands.length) continue;
    let tot = 0; for (const c of cands) tot += W[c];
    let q = rnd(R) * tot, pick = cands[0];
    for (const c of cands) { q -= W[c]; if (q <= 0) { pick = c; break; } }
    let near = false; for (const j of NB[i]) if (res[j] === RES_IDS.indexOf(pick)) near = true;
    if (near && rnd(R) < 0.7) continue;
    res[i] = RES_IDS.indexOf(pick);
  }

  // start sites
  const landComp = labelComponents(land, NB, 1);
  const goodLand = (i) => land[i] && !['mountain', 'snow', 'desert', 'marsh'].includes(TERRAIN_IDS[ter[i]]);
  const siteScore = (i) => {
    if (!goodLand(i)) return -1;
    let s = 0;
    for (const j of within(w, h, i, 2)) {
      const t = TERRAIN[TERRAIN_IDS[ter[j]]];
      const y = t.y; s += (y.f || 0) * 1.4 + (y.p || 0) * 1.1 + (y.g || 0) * 0.5;
      if (res[j] !== 255) s += 1.5;
      if (TERRAIN_IDS[ter[j]] === 'mountain') s -= 0.8;
      if (t.deep) s -= 0.6;
    }
    if (river[i]) s += 4;
    let coast = false; for (const j of NB[i]) if (ter[j] === TID.coast || ter[j] === TID.lake) coast = true;
    if (coast) s += 2;
    return s;
  };
  const scores = new Float32Array(N);
  for (let i = 0; i < N; i++) scores[i] = siteScore(i);
  // which landmasses can host starts
  const compSize = landComp.sizes;
  let masses = compSize.map((s, k) => [k, s]).filter((a) => a[1] >= 20).sort((a, b) => b[1] - a[1]);
  if (type === 'pangaea') masses = masses.slice(0, 1);
  else if (type === 'continents') masses = masses.slice(0, 2);
  else masses = masses.slice(0, Math.max(players, 3));
  const massSet = new Set(masses.map((m) => m[0]));
  const cand = [];
  for (let i = 0; i < N; i++) if (scores[i] > 0 && massSet.has(landComp.id[i])) {
    const y = (i / w) | 0, x = i % w;
    if (y < 3 || y > h - 4 || x < 3 || x > w - 4) continue;
    cand.push(i);
  }
  cand.sort((a, b) => scores[b] - scores[a]);
  const top = cand.slice(0, Math.max(40, Math.floor(cand.length * 0.45)));
  const starts = [];
  // spread across landmasses for the two-shores map: alternate
  const massOrder = masses.map((m) => m[0]);
  for (let k = 0; k < players; k++) {
    let best = -1, bv = -1e9;
    const wantMass = type === 'continents' ? massOrder[k % massOrder.length] : type === 'isles' ? massOrder[k % massOrder.length] : null;
    for (const i of top) {
      if (wantMass !== null && landComp.id[i] !== wantMass) continue;
      let md = 99;
      for (const s of starts) md = Math.min(md, dist(w, i, s));
      if (starts.length && md < 5) continue;
      const v = (starts.length ? Math.min(md, 14) * 3.2 : rnd(R) * 10) + scores[i] * 0.35 + rnd(R) * 2;
      if (v > bv) { bv = v; best = i; }
    }
    if (best < 0) { // relax
      for (const i of cand) { let md = 99; for (const s of starts) md = Math.min(md, dist(w, i, s)); if (md >= 4) { best = i; break; } }
    }
    if (best < 0) break;
    starts.push(best);
  }
  // fair starts: every start gets a luxury and a bonus resource within two tiles, and no mountain on the site
  for (const s of starts) {
    const ring = within(w, h, s, 2).filter((j) => j !== s && land[j] && ter[j] !== TID.mountain);
    const hasLux = ring.some((j) => res[j] !== 255 && RESOURCES[RES_IDS[res[j]]].kind === 'lux');
    if (!hasLux) {
      for (const j of shuffle(R, ring.slice())) {
        if (res[j] !== 255) continue;
        const t = TERRAIN_IDS[ter[j]];
        const opts = ['tea', 'silk', 'salt', 'herbs', 'jade'].filter((r) => RESOURCES[r].on.includes(t));
        if (opts.length) { res[j] = RES_IDS.indexOf(opts[rint(R, opts.length)]); break; }
      }
    }
    const hasBonus = ring.some((j) => res[j] !== 255 && ['rice', 'horses', 'iron'].includes(RES_IDS[res[j]]));
    if (!hasBonus) {
      for (const j of shuffle(R, ring.slice())) {
        if (res[j] !== 255) continue;
        const t = TERRAIN_IDS[ter[j]];
        const opts = ['rice', 'horses', 'iron'].filter((r) => RESOURCES[r].on.includes(t));
        if (opts.length) { res[j] = RES_IDS.indexOf(opts[rint(R, opts.length)]); break; }
      }
    }
    res[s] = 255;
  }
  // villages and camps
  const vil = [];
  for (const i of shuffle(R, cand.slice())) {
    if (vil.length >= villages) break;
    if (starts.some((s) => dist(w, i, s) < 6)) continue;
    if (vil.some((v) => dist(w, i, v) < 5)) continue;
    vil.push(i);
  }
  const allLand = shuffle(R, landIdx.filter((i) => land[i] && ter[i] !== TID.mountain));
  const cmp = [];
  for (const i of allLand) {
    if (cmp.length >= camps) break;
    if (starts.some((s) => dist(w, i, s) < 7)) continue;
    if (vil.some((v) => dist(w, i, v) < 4)) continue;
    if (cmp.some((c) => dist(w, i, c) < 5)) continue;
    cmp.push(i);
  }
  return { w, h, ter: Array.from(ter), res: Array.from(res), river: Array.from(river), rdir: Array.from(rdir), starts, villages: vil, camps: cmp, landComp: Array.from(landComp.id) };
}

function labelComponents(mask, NB, val) {
  const N = mask.length, id = new Int32Array(N).fill(-1), sizes = [];
  for (let i = 0; i < N; i++) {
    if (mask[i] !== val || id[i] >= 0) continue;
    const k = sizes.length; let size = 0;
    const st = [i]; id[i] = k;
    while (st.length) {
      const c = st.pop(); size++;
      for (const j of NB[c]) if (mask[j] === val && id[j] < 0) { id[j] = k; st.push(j); }
    }
    sizes.push(size);
  }
  return { id, sizes };
}
