// The map: an ink-and-colour painted scroll. Terrain is painted once into cached chunks (per zoom bucket);
// fog, borders, cities, units and effects are drawn on top only when something changes or animates.
import { TERRAIN, TERRAIN_IDS, RESOURCES, RES_IDS, IMP_IDS, SECTS, UNITS, BUILDINGS } from './data.js?v=4';
import { center, corner, pick, EDGE, SQ3, dirTable } from './hex.js?v=4';
import { cityAt, unitsAt, udef, isMilitary, tileOwner, heroDef, resVisible, cityMaxHp, cityTiles } from './core.js?v=4';
import { KEY, SPR, POR } from './art.js?v=4';
import { AI } from './ai_art.js?v=81999887';
import { L } from './i18n.js?v=4';

export const S = 32;            // hex radius in map units
const CH = 512;                  // chunk size in map units
const AW = 108, AH = 124, AFIG = 120;   // painted map figures (tools/ai_art.py): cell size, figure height
const BUCKETS = [0.25, 0.5, 1, 1.5, 2, 3];

const PAL = {
  grass: '#b9cb8c', plains: '#d8cf98', hills: '#cdb787', mountain: '#bdb2a0', forest: '#a3bd86', bamboo: '#b0cc8c', marsh: '#aabb98',
  snow: '#eef0ec', desert: '#e7d4a2', lake: '#9fcbd1', coast: '#abd0d4', sea: '#87b3c3',
};
const INK = '#3a3026';
const PAPER = '#efe5cb';

function hash(i, k = 0) { let h = (i * 374761393 + k * 668265263) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
export function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

export class MapView {
  constructor(canvas, images) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.img = images; // {sprites, portraits}
    this.z = 1; this.cx = 0; this.cy = 0; this.dpr = 1;
    this.chunks = new Map(); this.disp = new Map(); this.fx = []; this.dirty = true;
    this.sel = null; this.path = null; this.highlight = null; this.range = null;
    this.paper = makePaper(); this.cloud = null; this.showYields = false; this.showGrid = true;
    this.anim = true;
    this.resize();
  }
  setGame(G, pid) {
    this.G = G; this.pid = pid; this.chunks.clear(); this.disp.clear();
    this.W = SQ3 * S * (G.map.w + 0.5) + S; this.H = 1.5 * S * (G.map.h - 1) + 3 * S;
    this.snapImp = G.map.imp.slice(); this.snapRoad = G.map.road.slice();
    this.techKey = this.techSig();
    this.dirty = true;
  }
  techSig() { const p = this.G.players[this.pid]; return p ? (p.techs.t_inner ? 'i' : '') : ''; }
  resize() {
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.vw = Math.max(1, r.width); this.vh = Math.max(1, r.height);
    this.cv.width = Math.round(this.vw * this.dpr); this.cv.height = Math.round(this.vh * this.dpr);
    this.dirty = true;
  }
  tileXY(i) { const w = this.G.map.w; const [x, y] = center(i % w, (i / w) | 0, S); return [x + S, y + S]; }
  toScreen(mx, my) { return [(mx - this.cx) * this.z + this.vw / 2, (my - this.cy) * this.z + this.vh / 2]; }
  toMap(sx, sy) { return [(sx - this.vw / 2) / this.z + this.cx, (sy - this.vh / 2) / this.z + this.cy]; }
  tileAt(sx, sy) {
    const [mx, my] = this.toMap(sx, sy);
    const [x, y] = pick(mx - S, my - S, S);
    const G = this.G; if (x < 0 || y < 0 || x >= G.map.w || y >= G.map.h) return -1;
    return y * G.map.w + x;
  }
  centerOn(i, animate) {
    const [x, y] = this.tileXY(i);
    if (animate && this.anim) { this.camAnim = { fx: this.cx, fy: this.cy, tx: x, ty: y, t0: performance.now(), d: 350 }; }
    else { this.cx = x; this.cy = y; }
    this.clampCam(); this.dirty = true;
  }
  clampCam() {
    this.z = Math.max(0.3, Math.min(2.6, this.z));
    this.cx = Math.max(0, Math.min(this.W, this.cx)); this.cy = Math.max(0, Math.min(this.H, this.cy));
  }
  zoomAt(f, sx, sy) {
    const [mx, my] = this.toMap(sx, sy);
    this.z *= f; this.clampCam();
    const [nx, ny] = this.toMap(sx, sy);
    this.cx += mx - nx; this.cy += my - ny; this.clampCam(); this.dirty = true;
  }
  // after a turn: repaint chunks whose tiles changed (improvements, roads, revealed resources)
  refreshTerrain() {
    const G = this.G, m = G.map;
    const sig = this.techSig();
    if (sig !== this.techKey) { this.techKey = sig; this.chunks.clear(); }
    const ch = new Set();
    for (let i = 0; i < m.imp.length; i++) if (m.imp[i] !== this.snapImp[i] || m.road[i] !== this.snapRoad[i]) {
      const [x, y] = this.tileXY(i);
      for (const [dx, dy] of [[0, 0], [-S, -S], [S, S], [-S, S], [S, -S]]) ch.add(Math.floor((x + dx) / CH) + ',' + Math.floor((y + dy) / CH));
    }
    if (ch.size) for (const k of [...this.chunks.keys()]) if (ch.has(k.split('@')[0])) this.chunks.delete(k);
    this.snapImp = m.imp.slice(); this.snapRoad = m.road.slice();
    this.dirty = true;
  }
  invalidateAll() { this.chunks.clear(); this.dirty = true; }

  // ------------------------------------------------------------------ terrain chunks
  chunk(cxi, cyi, b) {
    const key = cxi + ',' + cyi + '@' + b;
    let c = this.chunks.get(key);
    if (c) { c.used = performance.now(); return c.cv; }
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(CH * b); cv.height = Math.ceil(CH * b);
    const g = cv.getContext('2d');
    g.setTransform(b, 0, 0, b, -cxi * CH * b, -cyi * CH * b);
    this.paintTerrain(g, cxi * CH, cyi * CH, CH, CH);
    this.chunks.set(key, { cv, used: performance.now(), px: cv.width * cv.height });
    // keep memory modest (iOS has a tight canvas budget)
    let tot = 0; for (const v of this.chunks.values()) tot += v.px;
    if (tot > 24e6) {
      const arr = [...this.chunks.entries()].sort((a, b2) => a[1].used - b2[1].used);
      for (const [k, v] of arr) { if (tot <= 16e6) break; if (k === key) continue; tot -= v.px; v.cv.width = v.cv.height = 0; this.chunks.delete(k); }
    }
    return cv;
  }
  tilesInRect(x0, y0, w, h) {
    const G = this.G, out = [];
    const r0 = Math.max(0, Math.floor((y0 - 2 * S) / (1.5 * S)) - 1), r1 = Math.min(G.map.h - 1, Math.ceil((y0 + h) / (1.5 * S)) + 1);
    const c0 = Math.max(0, Math.floor((x0 - 2 * S) / (SQ3 * S)) - 1), c1 = Math.min(G.map.w - 1, Math.ceil((x0 + w) / (SQ3 * S)) + 1);
    for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) out.push(y * G.map.w + x);
    return out;
  }
  paintTerrain(g, x0, y0, w, h) {
    const G = this.G, m = G.map, W = m.w;
    const tiles = this.tilesInRect(x0, y0, w, h);
    // only the hexes are painted; the space outside the map stays transparent (clouds show through)
    const land = new Path2D();
    for (const i of tiles) { const [x, y] = this.tileXY(i); addHex(land, x, y, S + 0.8); }
    const tname = (i) => TERRAIN_IDS[m.ter[i]];
    // 1. washes
    for (const i of tiles) {
      const t = tname(i); const [x, y] = this.tileXY(i);
      const v = hash(i, 1) * 0.08 - 0.04;
      g.fillStyle = shade(PAL[t], v);
      hexPath(g, x, y, S + 0.8); g.fill();
    }
    // soft bleeding of neighbouring land colours (watercolour edges)
    const DT = dirTable(m.w, m.h);
    for (const i of tiles) {
      const t = tname(i); if (TERRAIN[t].water) continue;
      const [x, y] = this.tileXY(i);
      for (let d = 0; d < 6; d++) {
        const j = DT[i * 6 + d]; if (j < 0) continue;
        const tj = tname(j); if (tj === t || TERRAIN[tj].water) continue;
        const [a, b] = EDGE[d]; const [ax, ay] = corner(a, S), [bx, by] = corner(b, S);
        const mx = x + (ax + bx) / 2, my = y + (ay + by) / 2;
        const gr = g.createRadialGradient(mx, my, 0, mx, my, S * 0.55);
        gr.addColorStop(0, rgba(hexOf(PAL[tj]), 0.55)); gr.addColorStop(1, rgba(hexOf(PAL[tj]), 0));
        g.fillStyle = gr; g.beginPath(); g.arc(mx, my, S * 0.55, 0, 6.29); g.fill();
      }
    }
    // paper grain
    g.save(); g.clip(land); g.globalAlpha = 0.5; g.globalCompositeOperation = 'multiply';
    g.fillStyle = g.createPattern(this.paper, 'repeat'); g.fillRect(x0, y0, w, h); g.restore();
    // deep water darker towards the open sea, wave strokes
    for (const i of tiles) {
      const t = tname(i); if (!TERRAIN[t].water) continue;
      const [x, y] = this.tileXY(i);
      g.strokeStyle = t === 'sea' ? 'rgba(40,80,100,0.35)' : 'rgba(60,110,120,0.3)'; g.lineWidth = 1.1;
      const n = t === 'sea' ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const v = (i + ((i / m.w) | 0)) % 2, wx = x + (n === 1 ? (v ? 6 : -6) : (k ? 9 : -9)), wy = y + (n === 1 ? (v ? -5 : 5) : (k ? 7 : -6));
        g.beginPath(); g.moveTo(wx - 7, wy); g.quadraticCurveTo(wx - 3.5, wy - 4, wx, wy); g.quadraticCurveTo(wx + 3.5, wy - 4, wx + 7, wy); g.stroke();
      }
    }
    // grid
    g.strokeStyle = 'rgba(70,50,30,0.13)'; g.lineWidth = 0.8;
    for (const i of tiles) { const [x, y] = this.tileXY(i); hexPath(g, x, y, S); g.stroke(); }
    // coastlines: one ink line exactly on the shared hex edge, pale foam of one width on the water side (clipped)
    const coast = new Path2D(), sea = new Path2D(); let anyCoast = false;
    for (const i of tiles) {
      const t = tname(i); const [x, y] = this.tileXY(i);
      if (TERRAIN[t].water) { addHex(sea, x, y, S + 0.5); continue; }
      for (let d = 0; d < 6; d++) {
        const j = DT[i * 6 + d]; if (j < 0 || !TERRAIN[tname(j)].water) continue;
        const [a, b] = EDGE[d]; const [ax, ay] = corner(a, S), [bx, by] = corner(b, S);
        coast.moveTo(x + ax, y + ay); coast.lineTo(x + bx, y + by); anyCoast = true;
      }
    }
    if (anyCoast) {
      g.save(); g.clip(sea); g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,250,0.55)'; g.lineWidth = 7; g.stroke(coast); g.restore();
      g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke(coast);
    }
    // rivers: straight runs from hex centre to hex centre (one bank colour, one water colour, uniform widths)
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [col, lw] of [['#3e6f86', 5.2], ['#7fb5c8', 3]]) {
      g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
      for (const i of tiles) {
        if (!m.river[i]) continue;
        const d = m.rdir[i]; if (d === 255) continue;
        const j = DT[i * 6 + d]; if (j < 0) continue;
        const [x, y] = this.tileXY(i), [jx, jy] = this.tileXY(j);
        const ex = m.river[j] ? jx : (x + jx) / 2, ey = m.river[j] ? jy : (y + jy) / 2;
        g.moveTo(x, y); g.lineTo(ex, ey);
      }
      g.stroke();
    }
    // roads
    g.setLineDash([4, 4]); g.strokeStyle = 'rgba(110,70,40,0.75)'; g.lineWidth = 2.2;
    for (const i of tiles) {
      if (!m.road[i]) continue;
      const [x, y] = this.tileXY(i);
      for (let d = 0; d < 3; d++) { const j = DT[i * 6 + [0, 4, 5][d]]; if (j < 0 || !m.road[j]) continue; const [jx, jy] = this.tileXY(j); g.beginPath(); g.moveTo(x, y); g.lineTo(jx, jy); g.stroke(); }
    }
    g.setLineDash([]);
    // features, row by row so overlaps read right
    const p = G.players[this.pid];
    tiles.sort((a, b) => a - b);
    for (const i of tiles) {
      const t = tname(i); const [x, y] = this.tileXY(i);
      drawFeature(g, t, x, y, i, m);
      const imp = m.imp[i]; if (imp !== 255) drawImprovement(g, IMP_IDS[imp], x, y, i);
      const r = m.res[i];
      if (r !== 255) { const rid = RES_IDS[r]; if (!p || resVisible(p, rid)) drawResource(g, rid, x + S * 0.42, y + S * 0.42); }
    }
  }

  // ------------------------------------------------------------------ frame
  frame(now) {
    const G = this.G; if (!G) return false;
    let busy = false;
    if (this.camAnim) {
      const a = this.camAnim, t = Math.min(1, (now - a.t0) / a.d), e = t * (2 - t);
      this.cx = a.fx + (a.tx - a.fx) * e; this.cy = a.fy + (a.ty - a.fy) * e;
      if (t >= 1) this.camAnim = null; busy = true;
    }
    const g = this.ctx, dpr = this.dpr, z = this.z;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.cloud) this.cloud = makeCloud();
    if (!this._bgPat) this._bgPat = g.createPattern(this.cloud, 'repeat');
    g.fillStyle = '#e6dabb'; g.fillRect(0, 0, this.cv.width, this.cv.height);
    // the clouds drift with the map
    g.save(); g.setTransform(dpr * this.z, 0, 0, dpr * this.z, (this.vw / 2 - this.cx * this.z) * dpr, (this.vh / 2 - this.cy * this.z) * dpr);
    g.fillStyle = this._bgPat; const [ax, ay] = this.toMap(0, 0), [bx, by] = this.toMap(this.vw, this.vh); g.fillRect(ax - 200, ay - 200, bx - ax + 400, by - ay + 400); g.restore();
    // terrain chunks
    const zb = z * dpr;
    let b = BUCKETS[BUCKETS.length - 1]; for (const k of BUCKETS) if (k >= zb * 0.9) { b = k; break; }
    const [mx0, my0] = this.toMap(0, 0), [mx1, my1] = this.toMap(this.vw, this.vh);
    const c0 = Math.max(0, Math.floor(mx0 / CH)), c1 = Math.min(Math.floor(this.W / CH), Math.floor(mx1 / CH));
    const r0 = Math.max(0, Math.floor(my0 / CH)), r1 = Math.min(Math.floor(this.H / CH), Math.floor(my1 / CH));
    g.imageSmoothingEnabled = true;
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const cv = this.chunk(cx, cy, b);
      const [sx, sy] = this.toScreen(cx * CH, cy * CH);
      g.drawImage(cv, sx * dpr, sy * dpr, CH * z * dpr + 0.5, CH * z * dpr + 0.5);
    }
    g.setTransform(dpr * z, 0, 0, dpr * z, (this.vw / 2 - this.cx * z) * dpr, (this.vh / 2 - this.cy * z) * dpr);
    const vis = this.visibleTiles(mx0, my0, mx1, my1);
    this.drawBorders(g, vis);
    this.drawOverlays(g);
    this.drawSites(g, vis);
    busy = this.drawUnits(g, vis, now) || busy;
    this.drawFog(g, vis);
    this.drawLabels(g, vis);
    this.drawPath(g);
    busy = this.drawFx(g, now) || busy;
    this.dirty = busy;
    return busy;
  }
  visibleTiles(mx0, my0, mx1, my1) { return this.tilesInRect(mx0 - S, my0 - S, mx1 - mx0 + 2 * S, my1 - my0 + 2 * S); }
  seen(i) { const p = this.G.players[this.pid]; return !p || p.exp[i]; }
  visible(i) { const v = this.G._vis[this.pid]; return !v || this.spectate || v[i]; }

  drawFog(g, tiles) {
    const p = this.G.players[this.pid]; if (!p || this.spectate) return;
    const unex = new Path2D(), dim = new Path2D();
    const v = this.G._vis[this.pid];
    for (const i of tiles) {
      const [x, y] = this.tileXY(i);
      if (!p.exp[i]) addHex(unex, x, y, S + 1.2);
      else if (!v[i]) addHex(dim, x, y, S + 0.5);
    }
    g.fillStyle = 'rgba(236,226,200,0.42)'; g.fill(dim);
    if (!this.cloud) this.cloud = makeCloud();
    g.fillStyle = '#e6dabb'; g.fill(unex);
    g.save(); g.clip(unex); g.globalAlpha = 0.9; g.fillStyle = g.createPattern(this.cloud, 'repeat'); g.fill(unex); g.restore();
  }
  // territory: one fill per sect (no seams between hexes) and a border that runs exactly along the outer hex edges,
  // clipped to the inside so it is the same width everywhere and turns every corner cleanly
  drawBorders(g, tiles) {
    const G = this.G, m = G.map, DT = dirTable(m.w, m.h), by = new Map();
    for (const i of tiles) {
      if (!this.seen(i)) continue;
      const o = tileOwner(G, i); if (o < 0) continue;
      let e = by.get(o); if (!e) { e = { area: new Path2D(), edge: new Path2D(), any: false }; by.set(o, e); }
      const [x, y] = this.tileXY(i);
      addHex(e.area, x, y, S);
      for (let d = 0; d < 6; d++) {
        const j = DT[i * 6 + d];
        if (j >= 0 && tileOwner(G, j) === o) continue;
        const [a, b] = EDGE[d]; const [ax, ay] = corner(a, S), [bx, by2] = corner(b, S);
        e.edge.moveTo(x + ax, y + ay); e.edge.lineTo(x + bx, y + by2); e.any = true;
      }
    }
    g.save(); g.lineCap = 'square'; g.lineJoin = 'miter';
    for (const [o, e] of by) {
      const col = G.players[o].col;
      g.fillStyle = rgba(col, 0.13); g.fill(e.area);
      if (!e.any) continue;
      g.save(); g.clip(e.area);
      g.strokeStyle = 'rgba(255,250,235,0.7)'; g.lineWidth = 10; g.stroke(e.edge);
      g.strokeStyle = rgba(col, 0.92); g.lineWidth = 6; g.stroke(e.edge);
      g.restore();
    }
    g.restore();
  }
  drawOverlays(g) {
    // selected unit's reach / attack range / worked tiles of the open city
    if (this.range) {
      for (const [i, kind] of this.range) {
        const [x, y] = this.tileXY(i);
        g.fillStyle = kind === 'atk' ? 'rgba(200,40,30,0.28)' : kind === 'work' ? 'rgba(255,240,170,0.35)' : 'rgba(255,255,240,0.22)';
        hexPath(g, x, y, S * 0.94); g.fill();
        if (kind === 'atk') { g.strokeStyle = 'rgba(170,20,10,0.8)'; g.lineWidth = 2; g.stroke(); }
      }
    }
    if (this.highlight !== null && this.highlight >= 0) {
      const [x, y] = this.tileXY(this.highlight);
      g.strokeStyle = 'rgba(255,250,220,0.95)'; g.lineWidth = 3; hexPath(g, x, y, S * 0.9); g.stroke();
      g.strokeStyle = INK; g.lineWidth = 1; hexPath(g, x, y, S * 0.98); g.stroke();
    }
    if (this.showYields && this.yieldTiles) {
      g.font = 'bold 9px sans-serif'; g.textAlign = 'center';
      for (const [i, y] of this.yieldTiles) {
        const [x, yy] = this.tileXY(i);
        const parts = [];
        if (y.f) parts.push(['#5c8a2c', y.f]); if (y.p) parts.push(['#9a5a20', y.p]); if (y.g) parts.push(['#b08a10', y.g]); if (y.s) parts.push(['#3d5fa8', y.s]); if (y.c) parts.push(['#a83d6a', y.c]);
        parts.forEach(([c, n], k) => { const px = x + (k - (parts.length - 1) / 2) * 10; g.fillStyle = 'rgba(255,250,235,0.85)'; g.beginPath(); g.arc(px, yy - 2, 5.5, 0, 6.29); g.fill(); g.fillStyle = c; g.fillText(Math.round(n), px, yy + 1.5); });
      }
    }
  }
  drawSites(g, tiles) {
    const G = this.G;
    const set = new Set(tiles);
    for (const camp of G.camps) if (set.has(camp.i) && this.seen(camp.i)) { const [x, y] = this.tileXY(camp.i); drawCamp(g, x, y, camp.kind); }
    for (const v of G.villages) if (v.alive && set.has(v.i) && this.seen(v.i)) { const [x, y] = this.tileXY(v.i); drawVillage(g, x, y, v.suz >= 0 ? G.players[v.suz].col : '#8a7a60', v.i); }
    for (const c of G.cities) if (set.has(c.i) && this.seen(c.i)) { const [x, y] = this.tileXY(c.i); drawCity(g, x, y, c, G.players[c.owner].col, c.id); }
  }
  drawUnits(g, tiles, now) {
    const G = this.G; let busy = false;
    const set = new Set(tiles);
    const spr = this.img.sprites;
    const frame = Math.floor(now / 600) % 2;
    g.imageSmoothingEnabled = false;
    const drawn = new Set();
    for (const u of G.units) {
      // smooth movement
      let d = this.disp.get(u.id);
      const [tx, ty] = this.tileXY(u.i);
      if (!d) { d = { x: tx, y: ty, fx: tx, fy: ty, tx, ty, t0: 0 }; this.disp.set(u.id, d); }
      if (d.tx !== tx || d.ty !== ty) {
        const far = Math.hypot(tx - d.x, ty - d.y) > S * 8 || !this.anim;
        d.fx = far ? tx : d.x; d.fy = far ? ty : d.y; d.tx = tx; d.ty = ty; d.t0 = now; d.dur = Math.min(600, 140 + Math.hypot(tx - d.x, ty - d.y) * 2.2);
      }
      if (d.x !== d.tx || d.y !== d.ty) {
        const t = Math.min(1, (now - d.t0) / d.dur);
        d.x = d.fx + (d.tx - d.fx) * t; d.y = d.fy + (d.ty - d.fy) * t;
        if (t >= 1) { d.x = d.tx; d.y = d.ty; } else busy = true;
      }
      if (!set.has(u.i) && !(d.x !== d.tx)) continue;
      if (!this.visible(u.i)) continue;
      drawn.add(u.id);
    }
    // draw civilians first (behind), then the military token
    const list = G.units.filter((u) => drawn.has(u.id)).sort((a, b) => (isMilitary(udef(a)) ? 1 : 0) - (isMilitary(udef(b)) ? 1 : 0) || a.i - b.i);
    for (const u of list) {
      const d = this.disp.get(u.id);
      const mil = isMilitary(udef(u));
      const inCity = mil && !!cityAt(G, u.i);
      const ox = inCity ? S * 0.45 : mil ? 0 : -S * 0.42, oy = inCity ? S * 0.35 : mil ? 2 : S * 0.2;
      const x = d.x + ox, y = d.y + oy;
      const col = u.owner >= 0 ? G.players[u.owner].col : '#2a2a2a';
      const sel = this.sel === u.id;
      const water = TERRAIN[TERRAIN_IDS[G.map.ter[u.i]]].water && !udef(u).naval;
      // token plate
      const r = inCity ? 11 : mil ? 14 : 10;
      g.fillStyle = 'rgba(30,20,10,0.25)'; g.beginPath(); g.ellipse(x, y + r * 0.85, r * 0.95, r * 0.35, 0, 0, 6.29); g.fill();
      if (water) { g.fillStyle = '#6b4a2a'; g.beginPath(); g.moveTo(x - 15, y + 6); g.lineTo(x + 15, y + 6); g.lineTo(x + 10, y + 13); g.lineTo(x - 10, y + 13); g.closePath(); g.fill(); }
      g.fillStyle = sel ? '#fff6d0' : 'rgba(250,244,226,0.92)';
      g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill();
      g.lineWidth = sel ? 3 : 2.2; g.strokeStyle = col; g.stroke();
      if (u.owner < 0) { g.lineWidth = 1; g.strokeStyle = '#a01818'; g.beginPath(); g.arc(x, y, r - 2.5, 0, 6.29); g.stroke(); }
      // sprite
      const key = spriteKey(G, u);
      const s = SPR[key], ai = AI[key] && AI[key].s;
      if (ai && this.img.aiSprites) {
        // painted figure, drawn smoothed: front at rest, side or back while walking, side towards its foe in a fight
        const hit = this.fx.find((f) => f.id === u.id && (f.k === 'lunge' || f.k === 'arrow') && now >= f.t0 && now - f.t0 < f.d);
        let view = 0, flip = false, lx = 0, ly = 0, bob = 0;
        const face = (dx, dy) => { if (Math.abs(dx) >= Math.abs(dy) * 0.6) { view = 1; flip = dx < 0; } else view = dy < 0 ? 2 : 0; };
        if (hit) {
          face(hit.bx - hit.ax, hit.by - hit.ay);
          if (view !== 1 && hit.bx !== hit.ax) { view = 1; flip = hit.bx < hit.ax; }
          if (hit.k === 'lunge') { const t = Math.sin((now - hit.t0) / hit.d * Math.PI) * 0.4; lx = (hit.bx - hit.ax) * t; ly = (hit.by - hit.ay) * t; }
        } else if (d.x !== d.tx || d.y !== d.ty) {
          face(d.tx - d.fx, d.ty - d.fy);
          bob = Math.abs(Math.sin((now - d.t0) / 110)) * 1.6;
        }
        const fh = inCity ? 27 : mil ? 34 : 26, k = fh / AFIG, w = AW * k, h = AH * k;
        const fx = x + lx, fy = y + r * 0.62 + ly - bob + 2 * k;
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.save(); g.translate(fx, fy); if (flip) g.scale(-1, 1);
        g.drawImage(this.img.aiSprites, ai[0] + view * AW, ai[1], AW, AH, -w / 2, -h, w, h);
        g.restore();
        if (hit) busy = true;
      } else if (s && spr) {
        // whole screen pixels per sprite pixel, the sprite's corner on a whole screen pixel
        const zd = this.z * this.dpr, kv = (inCity ? 1.0 : mil ? 1.25 : 0.95) * zd, k = kv < 0.75 ? kv : Math.max(1, Math.round(kv));
        g.imageSmoothingEnabled = kv < 0.75;   // far out the sprite shrinks smoothly; otherwise whole pixels only
        const w = 16 * k / zd, h = 24 * k / zd, ox = this.vw / 2 * this.dpr - this.cx * zd, snap = (v) => (Math.round(v * zd + ox) - ox) / zd;
        g.drawImage(spr, s[0] + frame * 16, s[1], 16, 24, snap(x - w / 2), snap(y + r * 0.62 - h), w, h);
      }
      // health
      if (u.hp < 100) {
        g.fillStyle = 'rgba(30,20,10,0.7)'; g.fillRect(x - 11, y + r + 1, 22, 3.5);
        g.fillStyle = u.hp > 60 ? '#5fa83a' : u.hp > 30 ? '#d8a020' : '#c83020'; g.fillRect(x - 11, y + r + 1, 22 * u.hp / 100, 3.5);
      }
      // little marks: promotion ready, fortified, hero, orders
      if (u.owner === this.pid) {
        if (u.pend) { g.fillStyle = '#e8b820'; star(g, x + r - 2, y - r + 2, 4.5); }
        if (u.order && u.order.k === 'fort' || u.fort >= 1 && mil && !u.order) { g.fillStyle = '#5a6a80'; shield(g, x - r + 1, y - r + 3); }
        if (u.order && u.order.k === 'sleep') { g.fillStyle = '#3a4a70'; g.font = 'bold 8px sans-serif'; g.fillText('z', x - r + 2, y - r + 6); }
        if (u.order && u.order.k === 'goto') { g.fillStyle = '#2a6a3a'; g.beginPath(); g.moveTo(x + r - 6, y + r - 6); g.lineTo(x + r, y + r - 3); g.lineTo(x + r - 6, y + r); g.fill(); }
        if (u.mv > 0 && !u.order && this.showReady) { g.fillStyle = '#3fae4a'; g.beginPath(); g.arc(x - r + 3, y + r - 3, 2.5, 0, 6.29); g.fill(); }
      }
      if (u.hero) { g.fillStyle = '#c8962a'; g.font = 'bold 7px serif'; g.textAlign = 'center'; g.fillText('俠', x + r - 1, y + r); }
      if (u.gp) { g.fillStyle = '#7a4aa0'; g.font = 'bold 7px serif'; g.textAlign = 'center'; g.fillText('奇', x + r - 1, y + r); }
    }
    g.imageSmoothingEnabled = true;
    return busy;
  }
  drawLabels(g, tiles) {
    const G = this.G; const set = new Set(tiles);
    const zs = Math.max(0.75, Math.min(1.6, 1 / this.z));
    for (const c of G.cities) {
      if (!set.has(c.i) || !this.seen(c.i)) continue;
      const [x, y] = this.tileXY(c.i);
      const col = G.players[c.owner].col;
      const mine = c.owner === this.pid;
      const name = L(c.name);
      g.font = `bold ${Math.round(12 * zs)}px "Noto Serif TC", "Songti TC", serif`;
      const tw = g.measureText(name).width;
      const w = tw + 30 * zs, h = 17 * zs, bx = x - w / 2, by = y - S * 0.95 - h;
      g.fillStyle = rgba(col, 0.95); roundRect(g, bx, by, w, h, 4 * zs); g.fill();
      g.strokeStyle = 'rgba(30,20,10,0.6)'; g.lineWidth = 1; g.stroke();
      // population disc
      g.fillStyle = '#fbf5e3'; g.beginPath(); g.arc(bx + 8 * zs, by + h / 2, 6.5 * zs, 0, 6.29); g.fill();
      g.fillStyle = '#2a2018'; g.font = `bold ${Math.round(9 * zs)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(c.pop), bx + 8 * zs, by + h / 2 + 0.5);
      g.fillStyle = lightText(col) ? '#fff' : '#1a120a';
      g.font = `bold ${Math.round(12 * zs)}px "Noto Serif TC", "Songti TC", serif`; g.textAlign = 'left';
      g.fillText(name, bx + 16 * zs, by + h / 2 + 0.5);
      if (c.capital) { g.fillStyle = '#f2c84a'; star(g, bx + w - 5 * zs, by + h / 2, 4 * zs); }
      g.textBaseline = 'alphabetic';
      // health bar under the banner
      const mh = cityMaxHp(c);
      if (c.hp < mh) { g.fillStyle = 'rgba(20,10,0,0.7)'; g.fillRect(x - 18, by + h + 1, 36, 4); g.fillStyle = '#c83020'; g.fillRect(x - 18, by + h + 1, 36 * c.hp / mh, 4); }
      // what it is building (own cities)
      if (mine && this.buildLabel) {
        const s = this.buildLabel(c);
        if (s) { g.font = `${Math.round(9 * zs)}px "Noto Serif TC", serif`; g.textAlign = 'center'; g.fillStyle = 'rgba(250,244,226,0.9)'; const ww = g.measureText(s).width + 8; g.fillRect(x - ww / 2, by + h + 5, ww, 11 * zs); g.fillStyle = '#3a2a1a'; g.fillText(s, x, by + h + 5 + 9 * zs); }
      }
    }
    for (const v of G.villages) {
      if (!v.alive || !set.has(v.i) || !this.seen(v.i)) continue;
      const [x, y] = this.tileXY(v.i);
      g.font = `${Math.round(10 * zs)}px "Noto Serif TC", serif`; g.textAlign = 'center';
      const name = L(v.name); const tw = g.measureText(name).width + 10;
      g.fillStyle = 'rgba(250,244,226,0.9)'; roundRect(g, x - tw / 2, y - S * 0.95 - 13 * zs, tw, 13 * zs, 3); g.fill();
      g.strokeStyle = v.suz >= 0 ? G.players[v.suz].col : '#8a7a60'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = '#3a2a1a'; g.fillText(name, x, y - S * 0.95 - 3 * zs);
    }
  }
  drawPath(g) {
    if (!this.path || !this.path.tiles.length) return;
    const pts = this.path.tiles.map((i) => this.tileXY(i));
    const [sx, sy] = this.tileXY(this.path.from);
    g.strokeStyle = this.path.attack ? 'rgba(190,30,20,0.9)' : 'rgba(40,30,20,0.85)'; g.lineWidth = 3; g.setLineDash([6, 5]);
    g.beginPath(); g.moveTo(sx, sy); for (const [x, y] of pts) g.lineTo(x, y); g.stroke(); g.setLineDash([]);
    const [ex, ey] = pts[pts.length - 1];
    g.fillStyle = this.path.attack ? '#b02010' : '#3a2a1a';
    g.beginPath(); g.arc(ex, ey, 9, 0, 6.29); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(this.path.attack ? '⚔' : String(this.path.turns), ex, ey + 0.5); g.textBaseline = 'alphabetic';
  }
  // ------------------------------------------------------------------ effects
  addCombat(ev) {
    if (!this.G) return;
    const vis = (i) => this.visible(i);
    if (!vis(ev.at) && !vis(ev.from)) return;
    const now = performance.now();
    const [ax, ay] = this.tileXY(ev.from), [bx, by] = this.tileXY(ev.at);
    if (ev.kind === 'ranged') this.fx.push({ k: 'arrow', id: ev.a, ax, ay, bx, by, t0: now, d: 380 });
    else this.fx.push({ k: 'lunge', id: ev.a, ax, ay, bx, by, t0: now, d: 300 });
    this.fx.push({ k: 'slash', x: bx, y: by, t0: now + (ev.kind === 'ranged' ? 330 : 150), d: 380 });
    if (ev.dmgD) this.fx.push({ k: 'num', x: bx, y: by - 10, s: '-' + ev.dmgD, c: '#d02818', t0: now + 200, d: 1100 });
    if (ev.dmgA) this.fx.push({ k: 'num', x: ax, y: ay - 10, s: '-' + ev.dmgA, c: '#d07018', t0: now + 250, d: 1100 });
    if (ev.killed) this.fx.push({ k: 'puff', x: bx, y: by, t0: now + 300, d: 600 });
    if (ev.captured) this.fx.push({ k: 'banner', x: bx, y: by, t0: now + 300, d: 1400 });
    this.dirty = true;
  }
  addText(i, s, c) { const [x, y] = this.tileXY(i); this.fx.push({ k: 'num', x, y: y - 14, s, c, t0: performance.now(), d: 1500 }); this.dirty = true; }
  drawFx(g, now) {
    if (!this.fx.length) return false;
    this.fx = this.fx.filter((f) => now - f.t0 < f.d);
    for (const f of this.fx) {
      const t = (now - f.t0) / f.d; if (t < 0) continue;
      if (f.k === 'arrow') {
        const x = f.ax + (f.bx - f.ax) * t, y = f.ay + (f.by - f.ay) * t - Math.sin(t * Math.PI) * 18;
        g.strokeStyle = '#2a1a0a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - (f.bx - f.ax) * 0.06, y - (f.by - f.ay) * 0.06); g.lineTo(x, y); g.stroke();
      } else if (f.k === 'slash') {
        g.strokeStyle = `rgba(255,250,230,${1 - t})`; g.lineWidth = 4 * (1 - t) + 1;
        g.beginPath(); g.moveTo(f.x - 14, f.y - 12); g.quadraticCurveTo(f.x, f.y - 2, f.x + 14, f.y + 10); g.stroke();
        g.strokeStyle = `rgba(200,30,20,${0.8 * (1 - t)})`; g.lineWidth = 2;
        g.beginPath(); g.moveTo(f.x - 12, f.y + 10); g.quadraticCurveTo(f.x, f.y, f.x + 12, f.y - 12); g.stroke();
      } else if (f.k === 'num') {
        g.font = 'bold 15px "Noto Serif TC", serif'; g.textAlign = 'center';
        g.lineWidth = 3; g.strokeStyle = `rgba(255,250,235,${1 - t})`; g.strokeText(f.s, f.x, f.y - t * 26);
        g.fillStyle = f.c; g.globalAlpha = 1 - t * t; g.fillText(f.s, f.x, f.y - t * 26); g.globalAlpha = 1;
      } else if (f.k === 'puff') {
        g.fillStyle = `rgba(60,50,40,${0.5 * (1 - t)})`; for (let k = 0; k < 6; k++) { const a = k * 1.05; g.beginPath(); g.arc(f.x + Math.cos(a) * 14 * t, f.y + Math.sin(a) * 10 * t, 6 * (1 - t) + 2, 0, 6.29); g.fill(); }
      } else if (f.k === 'banner') {
        g.fillStyle = `rgba(200,40,30,${1 - t})`; g.fillRect(f.x - 2, f.y - 40 * Math.min(1, t * 3), 3, 40 * Math.min(1, t * 3));
        g.beginPath(); g.moveTo(f.x + 1, f.y - 40 * Math.min(1, t * 3)); g.lineTo(f.x + 18, f.y - 34 * Math.min(1, t * 3)); g.lineTo(f.x + 1, f.y - 28 * Math.min(1, t * 3)); g.fill();
      }
    }
    return true;
  }
  // portrait helper for the UI
  portraitURL(key) {
    if (!this._pc) this._pc = new Map();
    if (this._pc.has(key)) return this._pc.get(key);
    const id = KEY[key] || key, ai = AI[id] && AI[id].p, pos = POR[id];
    const c = document.createElement('canvas'); c.width = 192; c.height = 224;
    const g = c.getContext('2d');
    if (ai && this.img.aiPortraits) {
      // the painted bust (tools/ai_art.py) on a warm paper wash, kept at its full 192 x 224 so it stays sharp
      const bg = g.createRadialGradient(96, 90, 20, 96, 112, 150); bg.addColorStop(0, '#f6ecd4'); bg.addColorStop(1, '#c9b48a');
      g.fillStyle = bg; g.fillRect(0, 0, 192, 224);
      g.drawImage(this.img.aiPortraits, ai[0], ai[1], 192, 224, 0, 0, 192, 224);
    } else {
      if (!pos || !this.img.portraits) return '';
      g.imageSmoothingEnabled = false;   // the pixel bust in whole 4x pixels, so it stays crisp when the page scales it down
      g.drawImage(this.img.portraits, pos[0], pos[1], 48, 56, 0, 0, 192, 224);
    }
    const url = c.toDataURL(); this._pc.set(key, url); return url;
  }
  spriteURL(key, scale = 3) {
    if (!this._sc) this._sc = new Map();
    const k = key + '@' + scale; if (this._sc.has(k)) return this._sc.get(k);
    const pos = SPR[KEY[key] || key]; if (!pos || !this.img.sprites) return '';
    const c = document.createElement('canvas'); c.width = 16 * scale; c.height = 24 * scale;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(this.img.sprites, pos[0], pos[1], 16, 24, 0, 0, 16 * scale, 24 * scale);
    const url = c.toDataURL(); this._sc.set(k, url); return url;
  }
}

export function spriteKey(G, u) {
  if (u.hero) { const H = heroDef(G, u.hero); return KEY[H.spr] || H.spr; }
  if (u.gp) { const k = { zs: 'gp_zs', sy: 'mojide', mj: 'gp_mj', ss: 'baixian' }[u.gp]; return KEY[k]; }
  return KEY[UNITS[u.type].spr];
}

// ------------------------------------------------------------------ painting helpers
function hexOf(c) { return c; }
function hexPath(g, x, y, r) { g.beginPath(); for (let k = 0; k < 6; k++) { const [a, b] = corner(k, r); if (k) g.lineTo(x + a, y + b); else g.moveTo(x + a, y + b); } g.closePath(); }
function addHex(p, x, y, r) { for (let k = 0; k < 6; k++) { const [a, b] = corner(k, r); if (k) p.lineTo(x + a, y + b); else p.moveTo(x + a, y + b); } p.closePath(); }
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function star(g, x, y, r) { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }
function shield(g, x, y) { g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y - 4); g.lineTo(x + 4, y); g.quadraticCurveTo(x + 4, y + 4, x, y + 6); g.quadraticCurveTo(x - 4, y + 4, x - 4, y); g.closePath(); g.fill(); }
function lightText(col) { const n = parseInt(col.slice(1), 16); const l = (n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11; return l < 150; }
function makePaper() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); const d = g.createImageData(256, 256);
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < 256 * 256; i++) { const v = 225 + rnd() * 30; d.data[i * 4] = v; d.data[i * 4 + 1] = v - 4; d.data[i * 4 + 2] = v - 14; d.data[i * 4 + 3] = 255; }
  g.putImageData(d, 0, 0);
  // fibres
  g.strokeStyle = 'rgba(150,120,80,0.12)'; g.lineWidth = 0.7;
  for (let k = 0; k < 140; k++) { const x = rnd() * 256, y = rnd() * 256, a = rnd() * 6.28; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); g.stroke(); }
  return c;
}
function makeCloud() {
  // auspicious clouds (祥雲) for unexplored land
  const c = document.createElement('canvas'); c.width = 180; c.height = 150;
  const g = c.getContext('2d');
  g.fillStyle = '#e6dabb'; g.fillRect(0, 0, 180, 150);
  const cloud = (x, y, s) => {
    g.strokeStyle = 'rgba(150,125,85,0.55)'; g.lineWidth = 1.6; g.fillStyle = 'rgba(245,238,218,0.9)';
    g.beginPath(); g.arc(x, y, 9 * s, Math.PI * 0.9, Math.PI * 2.2); g.arc(x + 14 * s, y + 2 * s, 7 * s, Math.PI * 1.1, Math.PI * 2.3); g.arc(x - 12 * s, y + 3 * s, 6 * s, Math.PI * 0.8, Math.PI * 1.9); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.arc(x + 2 * s, y + 1 * s, 4 * s, 0, Math.PI * 1.5); g.stroke();
    g.beginPath(); g.moveTo(x - 18 * s, y + 9 * s); g.quadraticCurveTo(x, y + 13 * s, x + 22 * s, y + 9 * s); g.stroke();
  };
  cloud(40, 40, 1); cloud(130, 30, 0.8); cloud(95, 95, 1.1); cloud(25, 120, 0.7); cloud(160, 120, 0.9);
  return c;
}

// Features sit on a fixed pattern inside each hex (the same slots in every hex of a kind, mirrored on alternate
// hexes for variety), upright, at one size per kind, with one ink weight; nothing is jittered or rotated.
const INKW = 1.3;
function drawFeature(g, t, x, y, i, m) {
  const mir = ((i % m.w) + ((i / m.w) | 0)) % 2 ? -1 : 1;
  g.lineCap = 'round'; g.lineJoin = 'round';
  switch (t) {
    case 'mountain': {
      const snowy = ((i / m.w) | 0) < m.h * 0.3;
      for (const [dx, dy, hw, hh] of [[-10, 8, 12, 17], [10, 8, 12, 17], [0, 4, 15, 25]]) peak(g, x + dx * mir, y + dy, hw, hh, snowy);
      break;
    }
    case 'hills': {
      for (const [dx, dy, w] of [[-8, 3, 12], [8, 9, 12]]) {
        const px = x + dx * mir, py = y + dy;
        g.fillStyle = 'rgba(150,120,70,0.45)';
        g.beginPath(); g.moveTo(px - w, py); g.quadraticCurveTo(px, py - w * 1.1, px + w, py); g.closePath(); g.fill();
        g.strokeStyle = INK; g.lineWidth = INKW; g.beginPath(); g.moveTo(px - w, py); g.quadraticCurveTo(px, py - w * 1.1, px + w, py); g.stroke();
        g.strokeStyle = 'rgba(58,48,38,0.4)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(px - w * 0.35, py - w * 0.35); g.quadraticCurveTo(px - w * 0.05, py - w * 0.2, px + w * 0.15, py); g.stroke();
      }
      break;
    }
    case 'forest': {
      // two rows: two pines at the back, three in front
      for (const [dx, dy] of [[-8, -6], [8, -6], [-14, 6], [0, 7], [14, 6]]) pine(g, x + dx * mir, y + dy, 6.5);
      break;
    }
    case 'bamboo': {
      // five culms evenly spaced, heights from a fixed pattern
      const hs = mir > 0 ? [20, 26, 22, 27, 21] : [22, 27, 21, 26, 20];
      for (let k = 0; k < 5; k++) {
        const px = x - 12 + k * 6, py = y + 11, hh = hs[k];
        g.strokeStyle = '#4f7f35'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - hh); g.stroke();
        g.strokeStyle = '#2f4f22'; g.lineWidth = 1;
        for (let yy = py - 6; yy > py - hh + 2; yy -= 6) { g.beginPath(); g.moveTo(px - 1.3, yy); g.lineTo(px + 1.3, yy); g.stroke(); }
        g.fillStyle = 'rgba(70,120,50,0.9)'; const side = k % 2 ? -1 : 1, ly = py - hh + 3;
        g.beginPath(); g.moveTo(px, ly); g.lineTo(px + side * 6, ly - 2); g.lineTo(px + side * 1, ly + 1.5); g.closePath(); g.fill();
      }
      break;
    }
    case 'marsh': {
      g.fillStyle = 'rgba(110,160,170,0.5)';
      g.beginPath(); g.ellipse(x - 7 * mir, y + 7, 9, 3, 0, 0, 6.29); g.fill(); g.beginPath(); g.ellipse(x + 8 * mir, y - 3, 7, 2.5, 0, 0, 6.29); g.fill();
      g.strokeStyle = '#4a6a3a'; g.lineWidth = 1.1;
      for (const [dx, dy] of [[-12, 0], [-8, -1], [4, 9], [8, 8], [12, 9]]) { const px = x + dx * mir, py = y + dy; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 8); g.moveTo(px, py - 3); g.lineTo(px + 2.5, py - 7); g.stroke(); }
      break;
    }
    case 'snow': {
      g.strokeStyle = 'rgba(120,150,180,0.5)'; g.lineWidth = 1;
      for (const [dx, dy] of [[-9, -6], [9, -1], [-3, 9]]) { const px = x + dx * mir, py = y + dy; g.beginPath(); g.moveTo(px - 6, py); g.quadraticCurveTo(px, py - 3, px + 6, py); g.stroke(); }
      break;
    }
    case 'desert': {
      g.fillStyle = 'rgba(160,120,60,0.5)';
      for (const [dx, dy] of [[-12, -8], [0, -10], [12, -8], [-6, 0], [6, 0], [-12, 9], [12, 9]]) { g.beginPath(); g.arc(x + dx, y + dy, 1, 0, 6.29); g.fill(); }
      g.strokeStyle = 'rgba(150,110,50,0.55)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x - 11, y + 6); g.quadraticCurveTo(x, y - 1, x + 11, y + 6); g.stroke();
      break;
    }
    case 'grass': case 'plains': {
      g.strokeStyle = t === 'grass' ? 'rgba(70,110,40,0.55)' : 'rgba(130,110,50,0.5)'; g.lineWidth = 1;
      for (const [dx, dy] of [[-10, -5], [10, -5], [0, 9]]) { const px = x + dx * mir, py = y + dy; g.beginPath(); g.moveTo(px - 3, py); g.lineTo(px - 1.5, py - 4); g.moveTo(px, py); g.lineTo(px, py - 5); g.moveTo(px + 3, py); g.lineTo(px + 1.5, py - 4); g.stroke(); }
      break;
    }
  }
}
// an ink-wash peak: shaded faces, one ink outline, two texture strokes, a snow cap when asked
function peak(g, px, py, hw, hh, snowy) {
  const gr = g.createLinearGradient(px - hw, 0, px + hw, 0);
  gr.addColorStop(0, '#6e6a68'); gr.addColorStop(0.5, '#9a9590'); gr.addColorStop(0.52, '#c9c3b8'); gr.addColorStop(1, '#ddd6c8');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(px - hw, py); g.lineTo(px, py - hh); g.lineTo(px + hw, py); g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = INKW; g.beginPath(); g.moveTo(px - hw, py); g.lineTo(px, py - hh); g.lineTo(px + hw, py); g.stroke();
  g.strokeStyle = 'rgba(58,48,38,0.45)'; g.lineWidth = 0.9;
  g.beginPath(); g.moveTo(px, py - hh * 0.8); g.lineTo(px - hw * 0.35, py - 2); g.moveTo(px, py - hh * 0.45); g.lineTo(px - hw * 0.12, py - 1); g.stroke();
  if (snowy) { g.fillStyle = '#f8f8f4'; g.beginPath(); g.moveTo(px - hw * 0.3, py - hh * 0.7); g.lineTo(px, py - hh); g.lineTo(px + hw * 0.3, py - hh * 0.7); g.lineTo(px, py - hh * 0.78); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = INKW; g.beginPath(); g.moveTo(px - hw * 0.3, py - hh * 0.7); g.lineTo(px, py - hh); g.lineTo(px + hw * 0.3, py - hh * 0.7); g.stroke(); }
}
// a painted pine: straight trunk, three level tiers, one ink outline
function pine(g, x, y, s) {
  g.strokeStyle = '#5a3e26'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y + s * 0.2); g.lineTo(x, y + s * 1.2); g.stroke();
  for (let k = 0; k < 3; k++) {
    const w = s * (1.25 - k * 0.3), ty = y + s * 0.3 - k * s * 0.55;
    g.fillStyle = k === 2 ? '#5f8f4a' : k === 1 ? '#557f42' : '#4a6f3a';
    g.beginPath(); g.moveTo(x - w, ty); g.lineTo(x, ty - s * 0.75); g.lineTo(x + w, ty); g.closePath(); g.fill();
    g.strokeStyle = '#2c3f22'; g.lineWidth = 1; g.stroke();
  }
}
function drawImprovement(g, k, x, y, i) {
  g.lineWidth = 1;
  if (k === 'farm') {
    // a paddy: level furrows inside a squared field with a raised bund
    g.fillStyle = 'rgba(220,190,80,0.32)'; g.fillRect(x - 15, y - 10, 30, 20);
    g.strokeStyle = 'rgba(120,90,30,0.6)'; g.strokeRect(x - 15, y - 10, 30, 20);
    for (let j = -1; j <= 1; j++) { g.beginPath(); g.moveTo(x - 13, y + j * 5); g.lineTo(x + 13, y + j * 5); g.stroke(); }
  } else if (k === 'mine') {
    g.fillStyle = '#3a3026'; g.beginPath(); g.arc(x - 12, y + 12, 4, Math.PI, 0); g.fill();
    g.strokeStyle = '#6a5030'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 17, y + 13); g.lineTo(x - 7, y + 13); g.stroke();
  } else if (k === 'lumber') {
    g.fillStyle = '#8a5a30'; g.strokeStyle = '#4a3018';
    for (const [dx, dy] of [[-16, 15], [-8, 15], [-12, 11]]) { g.beginPath(); g.ellipse(x + dx, y + dy, 4, 1.8, 0, 0, 6.29); g.fill(); g.stroke(); }
  } else if (k === 'garden') {
    g.fillStyle = 'rgba(90,140,60,0.5)';
    for (let j = 0; j < 4; j++) for (let q = 0; q < 2; q++) { g.beginPath(); g.arc(x - 10 + j * 6, y + 10 + q * 5, 1.8, 0, 6.29); g.fill(); }
  } else if (k === 'pasture') {
    g.strokeStyle = '#7a5a30'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x - 15, y + 12); g.lineTo(x + 5, y + 12); g.moveTo(x - 15, y + 8); g.lineTo(x + 5, y + 8);
    for (let j = 0; j < 4; j++) { g.moveTo(x - 14 + j * 6, y + 6); g.lineTo(x - 14 + j * 6, y + 14); } g.stroke();
  }
}
export function drawResource(g, rid, x, y, big) {
  const s = big || 1;
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = 'rgba(250,246,232,0.95)'; g.strokeStyle = '#4a3a2a'; g.lineWidth = 1.1;
  g.beginPath(); g.arc(0, 0, 7.5, 0, 6.29); g.fill(); g.stroke();
  const c = RESOURCES[rid].col;
  g.fillStyle = c; g.strokeStyle = c; g.lineWidth = 1.4;
  switch (rid) {
    case 'iron': g.fillRect(-4, -1, 8, 3); g.fillRect(-2, -4, 4, 3); g.fillRect(-1, 2, 2, 3); break;
    case 'horses': g.beginPath(); g.moveTo(-3, 4); g.lineTo(-2, -2); g.lineTo(1, -5); g.lineTo(4, -3); g.lineTo(2, -2); g.lineTo(2, 4); g.closePath(); g.fill(); break;
    case 'tea': g.beginPath(); g.ellipse(0, 0, 3, 5.5, 0.6, 0, 6.29); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-2.5, 3); g.lineTo(2.5, -3); g.stroke(); break;
    case 'silk': g.beginPath(); g.ellipse(0, 0, 4.5, 3, 0, 0, 6.29); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 0.6; for (let k = -2; k <= 2; k += 2) { g.beginPath(); g.moveTo(k, -3); g.lineTo(k, 3); g.stroke(); } break;
    case 'salt': g.fillStyle = '#9aa4ac'; for (const [a, b] of [[-2.5, 1], [2, 1.5], [0, -2.5]]) { g.beginPath(); g.moveTo(a, b - 2.5); g.lineTo(a + 2.2, b); g.lineTo(a, b + 2.5); g.lineTo(a - 2.2, b); g.closePath(); g.fill(); } break;
    case 'herbs': for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(Math.cos(k * 2.1) * 2.5, Math.sin(k * 2.1) * 2.5 - 1, 2.6, 1.3, k * 2.1, 0, 6.29); g.fill(); } g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 5); g.stroke(); break;
    case 'jade': g.beginPath(); g.arc(0, 0, 4.8, 0, 6.29); g.fill(); g.fillStyle = 'rgba(250,246,232,1)'; g.beginPath(); g.arc(0, 0, 1.7, 0, 6.29); g.fill(); break;
    case 'spirit': g.beginPath(); g.moveTo(0, -5.5); g.lineTo(3.5, -1); g.lineTo(2, 5); g.lineTo(-2, 5); g.lineTo(-3.5, -1); g.closePath(); g.fill(); g.fillStyle = '#e8dcff'; g.fillRect(-0.6, -3, 1.2, 4); break;
    case 'fish': g.beginPath(); g.ellipse(-0.5, 0, 4, 2.4, 0, 0, 6.29); g.fill(); g.beginPath(); g.moveTo(3, 0); g.lineTo(5.5, -2.5); g.lineTo(5.5, 2.5); g.closePath(); g.fill(); break;
    case 'rice': g.beginPath(); g.moveTo(0, 5); g.quadraticCurveTo(0, -2, 3, -5); g.stroke(); for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(-1.5 + k * 1.2, -1 - k * 1.5, 1.6, 0.9, -0.6, 0, 6.29); g.fill(); } break;
  }
  g.restore();
}
function drawCity(g, x, y, c, col, seed) {
  const n = Math.min(4, 1 + Math.floor(c.pop / 4));
  // stone wall ring
  const walls = c.blds.some((b) => BUILDINGS[b].def);
  g.fillStyle = 'rgba(40,30,20,0.25)'; g.beginPath(); g.ellipse(x, y + 10, 24, 8, 0, 0, 6.29); g.fill();
  g.fillStyle = walls ? '#b8ab94' : '#c9b48a'; g.strokeStyle = INK; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(x - 22, y + 2); g.lineTo(x - 18, y + 12); g.lineTo(x + 18, y + 12); g.lineTo(x + 22, y + 2); g.lineTo(x + 16, y - 6); g.lineTo(x - 16, y - 6); g.closePath(); g.fill(); g.stroke();
  if (walls) { g.fillStyle = '#8f8270'; for (let k = -18; k <= 16; k += 6) g.fillRect(x + k, y - 9, 3.5, 3); }
  // halls with sweeping roofs
  const spots = [[0, -2, 1.15], [-11, 4, 0.85], [11, 4, 0.85], [0, 7, 0.75]];
  for (let k = n - 1; k >= 0; k--) {
    const [dx, dy, s] = spots[k];
    const hx = x + dx, hy = y + dy;
    g.fillStyle = '#efe4cc'; g.fillRect(hx - 7 * s, hy - 6 * s, 14 * s, 8 * s);
    g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(hx - 7 * s, hy - 6 * s, 14 * s, 8 * s);
    g.fillStyle = '#8a2a1a'; g.fillRect(hx - 2 * s, hy - 3 * s, 4 * s, 5 * s);
    g.fillStyle = col;
    g.beginPath(); g.moveTo(hx - 12 * s, hy - 5 * s); g.quadraticCurveTo(hx - 6 * s, hy - 7 * s, hx - 5 * s, hy - 12 * s); g.lineTo(hx + 5 * s, hy - 12 * s); g.quadraticCurveTo(hx + 6 * s, hy - 7 * s, hx + 12 * s, hy - 5 * s); g.closePath(); g.fill();
    g.strokeStyle = INK; g.stroke();
    if (k === 0 && c.capital) { g.beginPath(); g.moveTo(hx - 8 * s, hy - 12 * s); g.quadraticCurveTo(hx - 4 * s, hy - 13 * s, hx - 3 * s, hy - 17 * s); g.lineTo(hx + 3 * s, hy - 17 * s); g.quadraticCurveTo(hx + 4 * s, hy - 13 * s, hx + 8 * s, hy - 12 * s); g.closePath(); g.fill(); g.stroke(); }
  }
}
function drawVillage(g, x, y, col, seed) {
  g.fillStyle = 'rgba(40,30,20,0.2)'; g.beginPath(); g.ellipse(x, y + 9, 18, 6, 0, 0, 6.29); g.fill();
  for (const [dx, dy] of [[-8, 2], [7, 4], [0, -4]]) {
    const hx = x + dx, hy = y + dy;
    g.fillStyle = '#e8dcc0'; g.strokeStyle = INK; g.lineWidth = 1; g.fillRect(hx - 5, hy - 3, 10, 7); g.strokeRect(hx - 5, hy - 3, 10, 7);
    g.fillStyle = '#9a7a4a'; g.beginPath(); g.moveTo(hx - 8, hy - 2); g.lineTo(hx, hy - 9); g.lineTo(hx + 8, hy - 2); g.closePath(); g.fill(); g.stroke();
  }
  g.strokeStyle = '#4a3a2a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + 14, y + 8); g.lineTo(x + 14, y - 12); g.stroke();
  g.fillStyle = col; g.beginPath(); g.moveTo(x + 14, y - 12); g.lineTo(x + 24, y - 9); g.lineTo(x + 14, y - 6); g.closePath(); g.fill();
}
function drawCamp(g, x, y, kind) {
  if (kind === 'beast') {
    g.fillStyle = '#5a4a3a'; g.beginPath(); g.moveTo(x - 14, y + 8); g.quadraticCurveTo(x, y - 18, x + 14, y + 8); g.closePath(); g.fill();
    g.fillStyle = '#1a120a'; g.beginPath(); g.moveTo(x - 6, y + 8); g.quadraticCurveTo(x, y - 4, x + 6, y + 8); g.closePath(); g.fill();
    g.strokeStyle = '#efe8d8'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x - 12, y + 11); g.lineTo(x - 5, y + 9); g.moveTo(x + 6, y + 11); g.lineTo(x + 12, y + 10); g.stroke();
  } else {
    for (const dx of [-8, 7]) { g.fillStyle = '#6a5a40'; g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.moveTo(x + dx - 8, y + 9); g.lineTo(x + dx, y - 5); g.lineTo(x + dx + 8, y + 9); g.closePath(); g.fill(); g.stroke(); }
    g.strokeStyle = '#2a1a0a'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x, y + 10); g.lineTo(x, y - 16); g.stroke();
    g.fillStyle = '#1a1a1a'; g.beginPath(); g.moveTo(x, y - 16); g.lineTo(x + 11, y - 13); g.lineTo(x, y - 9); g.closePath(); g.fill();
  }
}
