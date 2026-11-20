// Core rules: game state, modifiers, yields, cities, research and rules trees, visibility.
// No DOM here; the browser UI and the Node tests both drive the game through these functions.
import {
  TERRAIN, TERRAIN_IDS, TID, RESOURCES, RES_IDS, IMPROVEMENTS, IMP_IDS, SECTS, SECT_IDS, UNITS, BUILDINGS, WONDERS,
  PROJECTS, TECHS, TECH_IDS, CIVICS, CIVIC_IDS, GOVS, POLICIES, HEROES, GREAT, GP_KEYS, VILLAGE_KINDS, VILLAGES, ENVOY_TIERS,
  DIFFICULTY, SIZES, SPEEDS, LEADER_HERO, ERAS, XP_LEVELS,
} from './data.js?v=1';
import { generate } from './mapgen.js?v=1';
import { neighbours, within, dist } from './hex.js?v=1';
import { rnd, rint, shuffle, makeRng, hashStr } from './rng.js?v=1';

export const VERSION = 1;
export const NEUTRAL = -1;

// ------------------------------------------------------------------ notes (the turn log shown to the human)
export function note(G, pid, zh, en, at = -1, kind = 'info') {
  G.log.push({ t: G.turn, pid, zh, en, at, kind });
  if (G.log.length > 400) G.log.splice(0, G.log.length - 400);
  if (G.onNote) G.onNote(G.log[G.log.length - 1]);
}
export function sectName(G, pid) { if (pid < 0) return ['流寇', 'Outlaws']; const p = G.players[pid]; return SECTS[p.sect].n; }
export function leaderName(G, pid) { const p = G.players[pid]; return SECTS[p.sect].ln; }

// ------------------------------------------------------------------ new game
export function newGame(o) {
  const size = SIZES[o.size || 'small'];
  const speed = SPEEDS[o.speed || 'standard'];
  const nPlayers = Math.max(2, Math.min(8, o.players || size.players));
  const seed = String(o.seed ?? Math.floor(Math.random() * 1e9));
  const map = generate({ w: size.w, h: size.h, seed, type: o.mapType || 'pangaea', players: nPlayers, villages: o.villages ?? size.villages, camps: size.camps });
  const N = map.w * map.h;
  const G = {
    v: VERSION, seed, turn: 1, size: o.size || 'small', speedId: o.speed || 'standard', mapType: o.mapType || 'pangaea',
    diff: o.difficulty ?? 1, limit: speed.limit, rs: hashStr('game:' + seed) || 7, nextId: 1,
    map: {
      w: map.w, h: map.h, ter: map.ter, res: map.res, river: map.river, rdir: map.rdir,
      imp: new Array(N).fill(255), road: new Array(N).fill(0), tc: new Array(N).fill(-1), land: map.landComp,
    },
    players: [], cities: [], units: [], villages: [], camps: [], log: [], heroes: {}, gpUsed: {},
    wonders: {}, congress: { next: 0, n: 0, active: [], history: [], noWar: 0, last: null }, winner: null, over: false,
    stats: { wars: 0, captures: 0 },
  };
  // sects: the human picks one (or none for an all-computer game); the rest are drawn at random
  const pool = shuffle({ rs: hashStr('sects:' + seed) }, SECT_IDS.slice());
  const chosen = [];
  if (o.sect) chosen.push(o.sect);
  for (const s of (o.rivals || [])) if (!chosen.includes(s)) chosen.push(s);
  for (const s of pool) { if (chosen.length >= nPlayers) break; if (!chosen.includes(s)) chosen.push(s); }
  chosen.length = Math.min(chosen.length, map.starts.length);
  chosen.forEach((sid, k) => {
    const human = !!o.sect && k === 0 && !o.allAI;
    G.players.push(newPlayer(G, k, sid, human));
  });
  // heroes: the cast, plus the leaders whose sect is not playing
  for (const hid of Object.keys(HEROES)) G.heroes[hid] = { by: -1, avail: 1 };
  for (const sid of SECT_IDS) if (!chosen.includes(sid)) G.heroes['L_' + sid] = { by: -1, avail: 1, leader: sid };
  initRuntime(G);
  // starting units
  G.players.forEach((p, k) => {
    const s = map.starts[k];
    const free = ['u_founder', 'u_disciple', 'u_scout'];
    if (!p.human) for (const u of DIFFICULTY[G.diff].free) free.push(u);
    const spots = [s, ...within(map.w, map.h, s, 2).filter((j) => j !== s && isLandPassable(G, j))];
    let si = 0;
    for (const t of free) {
      const def = UNITS[sectUnit(p, t)];
      let placed = false;
      while (si < spots.length && !placed) {
        const j = spots[si];
        if (canStack(G, j, def, p.id)) { makeUnit(G, p.id, sectUnit(p, t), j); placed = true; }
        else si++;
      }
    }
  });
  // villages
  map.villages.forEach((i, k) => {
    const vd = VILLAGES[k % VILLAGES.length];
    G.villages.push({ id: k, name: [vd[0], vd[1]], kind: vd[2], i, env: {}, suz: -1, hp: 120, war: {}, alive: true, lastSuz: -1 });
  });
  // camps
  map.camps.forEach((i, k) => G.camps.push({ id: G.nextId++, i, kind: k % 3 === 2 ? 'beast' : 'bandit', timer: 3 + (k % 4), units: [] }));
  initRuntime(G);
  for (const p of G.players) { refreshMods(G, p); updateVis(G, p.id); }
  G.congress.next = Math.round(G.limit * 0.22);
  beginTurnAll(G, true);
  return G;
}

function newPlayer(G, id, sect, human) {
  const S = SECTS[sect];
  return {
    id, sect, human, alive: true, gold: 15, techs: { t_basics: 1 }, tech: null, tprog: {}, civics: { c_rite: 1 }, civic: null, cprog: {},
    gov: 'g_fledgling', pol: { w: [], m: [], v: [], a: [] }, renown: 0, life: 0, legend: 0, tales: 0, favour: 0, gpp: { zs: 0, sy: 0, mj: 0, ss: 0 }, gpn: { zs: 0, sy: 0, mj: 0, ss: 0 },
    met: {}, rel: {}, relT: {}, griev: {}, pact: {}, envoys: 0, dip: 0, proj: 0, routes: [], cityNames: 0, stats: { kills: 0, lost: 0, taken: 0, founded: 0 },
    exp: null, ai: {}, capital: -1, eliminated: 0, era: 0, lastY: null, recruits: 0, boughtVotes: 0, warWeary: {},
    col: S.col,
  };
}

// runtime-only caches (rebuilt after loading)
export function initRuntime(G) {
  const N = G.map.w * G.map.h;
  G._uat = new Map();
  for (const u of G.units) addAt(G, u);
  G._cat = new Int32Array(N).fill(-1);
  for (const c of G.cities) G._cat[c.i] = c.id;
  G._vat = new Int32Array(N).fill(-1);
  for (const v of G.villages) if (v.alive) G._vat[v.i] = v.id;
  G._camp = new Int32Array(N).fill(-1);
  for (const c of G.camps) G._camp[c.i] = c.id;
  G._vis = G.players.map(() => new Uint8Array(N));
  for (const p of G.players) {
    if (!p.exp) p.exp = new Uint8Array(N);
    else if (typeof p.exp === 'string') p.exp = unpackBits(p.exp, N);
  }
  G._nb = neighbours(G.map.w, G.map.h);
  G._cityById = new Map(G.cities.map((c) => [c.id, c]));
  G._unitById = new Map(G.units.map((u) => [u.id, u]));
  for (const p of G.players) { p._m = null; }
}
export function packBits(a) {
  let s = '', i = 0;
  while (i < a.length) { let v = 0; for (let k = 0; k < 6; k++) v |= (a[i + k] ? 1 : 0) << k; s += String.fromCharCode(48 + v); i += 6; }
  return s;
}
export function unpackBits(s, N) {
  const a = new Uint8Array(N);
  for (let k = 0; k < s.length; k++) { const v = s.charCodeAt(k) - 48; for (let b = 0; b < 6; b++) if (k * 6 + b < N && (v >> b) & 1) a[k * 6 + b] = 1; }
  return a;
}
// a JSON-safe copy of the state (runtime caches stripped)
export function serialize(G) {
  const out = {};
  for (const k of Object.keys(G)) if (k[0] !== '_' && k !== 'onNote' && k !== 'hooks') out[k] = G[k];
  out.players = G.players.map((p) => { const q = {}; for (const k of Object.keys(p)) if (k[0] !== '_') q[k] = p[k]; q.exp = packBits(p.exp); return q; });
  return JSON.stringify(out);
}
export function deserialize(str) {
  const G = JSON.parse(str);
  initRuntime(G);
  for (const p of G.players) { refreshMods(G, p); updateVis(G, p.id); }
  return G;
}

// ------------------------------------------------------------------ small lookups
export const ter = (G, i) => TERRAIN_IDS[G.map.ter[i]];
export const terDef = (G, i) => TERRAIN[TERRAIN_IDS[G.map.ter[i]]];
export const resOf = (G, i) => (G.map.res[i] === 255 ? null : RES_IDS[G.map.res[i]]);
export const isWater = (G, i) => !!terDef(G, i).water;
export function isLandPassable(G, i) { const t = ter(G, i); return !TERRAIN[t].water && t !== 'mountain'; }
export const cityAt = (G, i) => (G._cat[i] >= 0 ? G._cityById.get(G._cat[i]) : null);
export const villageAt = (G, i) => (G._vat[i] >= 0 ? G.villages[G._vat[i]] : null);
export const campAt = (G, i) => (G._camp[i] >= 0 ? G.camps.find((c) => c.id === G._camp[i]) : null);
export const unitsAt = (G, i) => G._uat.get(i) || [];
export const unitById = (G, id) => G._unitById.get(id);
export const cityById = (G, id) => G._cityById.get(id);
export function tileOwner(G, i) { const c = G.map.tc[i]; if (c < 0) return -1; const city = G._cityById.get(c); return city ? city.owner : -1; }
export function addAt(G, u) { let a = G._uat.get(u.i); if (!a) G._uat.set(u.i, (a = [])); a.push(u); }
export function removeAt(G, u) { const a = G._uat.get(u.i); if (!a) return; const k = a.indexOf(u); if (k >= 0) a.splice(k, 1); if (!a.length) G._uat.delete(u.i); }
export function speed(G) { return SPEEDS[G.speedId]; }
export function costMul(G) { return SPEEDS[G.speedId].cost; }
export function alivePlayers(G) { return G.players.filter((p) => p.alive); }
export function isMilitary(def) { return !['civ', 'trade', 'gp'].includes(def.cls) || (def.cls === 'trade' && def.str > 0 && false); }
export function udef(u) { return UNITS[u.type]; }

export function sectUnit(p, base) {
  const S = SECTS[p.sect];
  if (S.uu && UNITS[S.uu].rep === base) return S.uu;
  return base;
}
export function sectBuilding(p, base) {
  const S = SECTS[p.sect];
  if (S.ub && BUILDINGS[S.ub].rep === base) return S.ub;
  return base;
}
export function eraOf(p) {
  let e = 0;
  for (const t in p.techs) e = Math.max(e, TECHS[t].era);
  for (const c in p.civics) e = Math.max(e, CIVICS[c].era);
  return e;
}
export function worldEra(G) {
  const al = alivePlayers(G); if (!al.length) return 0;
  let s = 0; for (const p of al) s += p.era; return Math.round(s / al.length);
}

// ------------------------------------------------------------------ modifiers
const Z = () => ({
  str: 0, meleeAtk: 0, vsWounded: 0, vsNeutral: 0, vsCity: 0, cityDef: 0, cityDefPct: 0, homeDef: 0, heal: 0, healHome: 0, healAlways: 0,
  sight: 0, unitPct: 0, founderPct: 0, founderCost: 0, bldPct: 0, siegePct: 0, wonderPct: 0, growthPct: 0, fPct: 0, pPct: 0, gPct: 0, sPct: 0, cPct: 0,
  allPct: 0, cityG: 0, cityC: 0, legendPct: 0, legend: 0, favour: 0, allyFavour: 0, votes: 0, routes: 0, routeG: 0, xp: 0, xpPct: 0,
  gpPct: { zs: 0, sy: 0, mj: 0, ss: 0 }, villageX: 0, rangedStr: 0, buyDisc: 0, herbFood: 0, waterCityC: 0, killRenown: 0, aura: 0, keepPop: 0,
  beastFriend: 0, banditFriend: 0, tame: 0, convertCamp: 0, secondStrike: 0, grievX: 1, ignoreRough: [], bounty: 0, pardon: 0, techSlow: 0, cityCAlign: 0,
  beastEvery: 0, freeTech: 0, revealCaps: 0,
});
function addFx(m, fx, k = 1) {
  if (!fx) return;
  for (const key of Object.keys(fx)) {
    const v = fx[key];
    if (key === 'gpPct') { for (const g of Object.keys(v)) m.gpPct[g] += v[g] * k; }
    else if (key === 'ignoreRough') m.ignoreRough = m.ignoreRough.concat(v);
    else if (key === 'grievX') m.grievX = Math.max(m.grievX, v);
    else if (typeof v === 'number') m[key] = (m[key] || 0) + v * k;
  }
}
export function refreshMods(G, p) {
  const m = Z();
  addFx(m, SECTS[p.sect].fx);
  addFx(m, GOVS[p.gov].fx);
  for (const sl of Object.keys(p.pol)) for (const pid of p.pol[sl]) addFx(m, POLICIES[pid].fx);
  for (const wid of Object.keys(G.wonders)) if (G.wonders[wid].owner === p.id) addFx(m, WONDERS[wid].fx);
  for (const c of Object.keys(p.civics)) addFx(m, CIVICS[c].fx);
  if (p.techs.t_herb) m.heal += 5;
  if (p.techs.t_medic) m.healHome += 10;
  if (p.techs.t_poison) m.rangedStr += 3;
  if (p.techs.t_greattrade) m.routes += 1;
  if (p.civics.c_invite) m.favour += 1;
  // village patrons
  for (const v of G.villages) if (v.alive && v.suz === p.id) addFx(m, VILLAGE_KINDS[v.kind].suz, 1 + m.villageX);
  // Assembly resolutions in force
  for (const r of G.congress.active) applyResolutionMods(G, p, m, r);
  if (!p.human) m.aiPct = DIFFICULTY[G.diff].ai; else m.aiPct = 0;
  p._m = m;
  return m;
}
export function mods(G, p) { return p._m || refreshMods(G, p); }
function applyResolutionMods(G, p, m, r) {
  const on = r.target === p.id;
  const alignOn = r.alignT !== undefined && SECTS[p.sect].al === r.alignT;
  switch (r.id) {
    case 'r_bounty': if (r.opt === 'a' && !on) m.bounty = r.target + 1; if (r.opt === 'b' && on) m.str += 3; break;
    case 'r_trade': if (on) m.routeG += r.opt === 'a' ? 3 : -3; break;
    case 'r_truce': break;
    case 'r_manuals': break;
    case 'r_banner': if (alignOn) { if (r.opt === 'a') m.cityC += 2; else m.cPct -= 0.15; } break;
    case 'r_purge': break;
    case 'r_ranking': if (on) { if (r.opt === 'a') m.legend += 4; else m.cPct -= 0.2; } break;
    case 'r_salt': if (on) m.pPct += r.opt === 'a' ? 0.1 : -0.1; break;
  }
}
export function resolutionOn(G, id, opt) { return G.congress.active.some((r) => r.id === id && (!opt || r.opt === opt)); }

// ------------------------------------------------------------------ tile yields
export function resVisible(p, r) { const d = RESOURCES[r]; return !d.tech || !!p.techs[d.tech]; }
export function tileYield(G, i, p) {
  const t = terDef(G, i);
  const y = { f: t.y.f || 0, p: t.y.p || 0, g: t.y.g || 0, s: t.y.s || 0, c: t.y.c || 0 };
  const r = resOf(G, i);
  if (r && (!p || resVisible(p, r))) {
    const ry = RESOURCES[r].y; for (const k in ry) y[k] += ry[k];
    if (p && r === 'herbs') y.f += mods(G, p).herbFood;
  }
  const imp = G.map.imp[i];
  if (imp !== 255) { const iy = IMPROVEMENTS[IMP_IDS[imp]].y; for (const k in iy) y[k] += iy[k]; if (r && IMP_IDS[imp] === 'mine' && r === 'jade') y.g += 1; }
  if (G.map.river[i]) y.g += 1;
  return y;
}
// which improvement a city would develop on this tile (or null)
export function improvementFor(G, i, p) {
  if (G.map.imp[i] !== 255) return null;
  const t = ter(G, i), r = resOf(G, i);
  let k = null;
  if (r && RESOURCES[r].imp && resVisible(p, r)) k = RESOURCES[r].imp;
  else if (IMPROVEMENTS.farm.on.includes(t) && (t !== 'desert' || G.map.river[i])) k = 'farm';
  else if (IMPROVEMENTS.mine.on.includes(t)) k = 'mine';
  else if (t === 'forest') k = 'lumber';
  else if (t === 'bamboo') k = 'garden';
  if (!k) return null;
  if (!p.techs[IMPROVEMENTS[k].tech]) return null;
  return k;
}

// ------------------------------------------------------------------ cities
export function cityName(G, p) {
  const S = SECTS[p.sect];
  const k = p.cityNames++;
  if (k < S.cities.length) return [S.cities[k], S.citiesEn[k]];
  return [S.cities[k % S.cities.length] + '新城', 'New ' + S.citiesEn[k % S.citiesEn.length]];
}
export function canFound(G, i, pid) {
  if (!isLandPassable(G, i)) return false;
  if (G._cat[i] >= 0 || G._vat[i] >= 0 || G._camp[i] >= 0) return false;
  const o = tileOwner(G, i);
  if (o >= 0 && o !== pid) return false;
  for (const c of G.cities) if (dist(G.map.w, c.i, i) < 4) return false;
  for (const v of G.villages) if (v.alive && dist(G.map.w, v.i, i) < 3) return false;
  return true;
}
export function foundCity(G, pid, i, unit) {
  const p = G.players[pid];
  const first = !G.cities.some((c) => c.origOwner === pid);
  const c = {
    id: G.nextId++, owner: pid, origOwner: pid, name: cityName(G, p), i, pop: 1, food: 0, prod: 0, build: null, queue: [], blds: [], hp: 150, worked: [],
    focus: 'bal', cult: 0, claimed: 0, founded: G.turn, capital: first, origCap: first ? pid : -1, struck: false, lastHit: -9, permFood: 0, lab: 0, nImp: 0,
    lastBuilt: null,
  };
  G.cities.push(c); G._cat[i] = c.id; G._cityById.set(c.id, c);
  if (first) p.capital = c.id;
  for (const j of within(G.map.w, G.map.h, i, 1)) if (G.map.tc[j] < 0 || j === i) G.map.tc[j] = c.id;
  G.map.road[i] = 1;
  if (unit) killUnit(G, unit, true);
  p.stats.founded++;
  assignWork(G, c);
  updateVis(G, pid);
  note(G, pid, `建立了${c.name[0]}。`, `Founded ${c.name[1]}.`, i, 'city');
  if (first) note(G, -2, `${sectName(G, pid)[0]}在${c.name[0]}開山立派。`, `${sectName(G, pid)[1]} founded its home seat at ${c.name[1]}.`, -1, 'world');
  return c;
}
export function cityTiles(G, c) {
  const out = [];
  for (const j of within(G.map.w, G.map.h, c.i, 3)) if (G.map.tc[j] === c.id) out.push(j);
  return out;
}
export function workable(G, c) { return cityTiles(G, c).filter((j) => j !== c.i); }

const FOCUS_W = {
  bal: { f: 1.25, p: 1.1, g: 0.6, s: 0.8, c: 0.7 }, food: { f: 2.2, p: 0.8, g: 0.4, s: 0.5, c: 0.4 }, prod: { f: 1.0, p: 2.0, g: 0.4, s: 0.5, c: 0.4 },
  gold: { f: 1.0, p: 0.7, g: 1.8, s: 0.5, c: 0.5 }, sci: { f: 1.0, p: 0.7, g: 0.5, s: 2.0, c: 0.6 }, cul: { f: 1.0, p: 0.7, g: 0.5, s: 0.6, c: 2.0 },
};
export function assignWork(G, c) {
  const p = G.players[c.owner];
  const w = FOCUS_W[c.focus] || FOCUS_W.bal;
  const cand = workable(G, c).filter((j) => {
    // a tile with an enemy unit on it can't be worked
    for (const u of unitsAt(G, j)) if (u.owner !== c.owner && isMilitary(udef(u))) return false;
    return true;
  });
  const sc = cand.map((j) => {
    const y = tileYield(G, j, p);
    let s = y.f * w.f + y.p * w.p + y.g * w.g + y.s * w.s + y.c * w.c;
    // a hungry city wants food first
    return [j, s];
  });
  sc.sort((a, b) => b[1] - a[1]);
  let picks = sc.slice(0, c.pop).map((a) => a[0]);
  // never starve: if food would be negative, swap in food tiles
  let food = cityYieldRaw(G, c, picks).f - c.pop * 2;
  if (food < 0) {
    const byFood = cand.slice().sort((a, b) => tileYield(G, b, p).f - tileYield(G, a, p).f);
    picks = byFood.slice(0, c.pop);
  }
  c.worked = picks;
}
function cityYieldRaw(G, c, worked) {
  const p = G.players[c.owner];
  const y = { f: 0, p: 0, g: 0, s: 0, c: 0 };
  for (const j of worked) { const t = tileYield(G, j, p); for (const k in y) y[k] += t[k]; }
  return y;
}
export function hasBld(c, id) { return c.blds.includes(id) || c.blds.some((b) => BUILDINGS[b].rep === id); }
export function cityCoastal(G, c) { for (const j of G._nb[c.i]) if (terDef(G, j).water) return true; return false; }
export function cityWaterAdj(G, c) { for (const j of G._nb[c.i]) if (ter(G, j) === 'coast' || ter(G, j) === 'lake') return true; return !!G.map.river[c.i]; }

// full city output for a turn: returns {f,p,g,s,c, legend, food surplus, gp}
export function cityYield(G, c) {
  const p = G.players[c.owner];
  const m = mods(G, p);
  const y = cityYieldRaw(G, c, c.worked);
  // centre tile: at least 2 food 1 production, plus what is there
  const cy = tileYield(G, c.i, p);
  y.f += Math.max(2, cy.f); y.p += Math.max(1, cy.p); y.g += cy.g + 1; y.s += cy.s; y.c += cy.c;
  // the people themselves practise and talk
  y.s += 1 + c.pop * 0.4; y.c += 0.5 + c.pop * 0.25;
  if (c.capital && c.owner === c.origOwner) { y.s += 2; y.c += 2; y.p += 1; y.g += 2; }
  else if (c.id === p.capital) { y.s += 1; y.c += 1; y.g += 1; }
  y.f += c.permFood;
  const pct = { f: 0, p: 0, g: 0, s: 0, c: 0 };
  let legend = 0;
  const gp = { zs: 0, sy: 0, mj: 0, ss: 0 };
  for (const b of c.blds) {
    const B = BUILDINGS[b];
    if (B.y) for (const k in B.y) y[k] += B.y[k];
    if (B.pct) for (const k in B.pct) pct[k] += B.pct[k];
    if (B.legend) legend += B.legend;
    if (B.gp) for (const k in B.gp) gp[k] += B.gp[k];
  }
  for (const wid of Object.keys(G.wonders)) {
    const W = G.wonders[wid]; if (W.city !== c.id) continue;
    const D = WONDERS[wid];
    if (D.y) for (const k in D.y) y[k] += D.y[k];
    if (D.legend) legend += D.legend;
    if (D.gp) for (const k in D.gp) gp[k] += D.gp[k];
  }
  // resource-linked building bonuses
  for (const j of c.worked) {
    const r = resOf(G, j); if (!r) continue;
    if (r === 'iron' && (hasBld(c, 'b_smithy'))) y.p += 1;
    if (r === 'tea' && hasBld(c, 'b_teahouse')) y.c += 1;
    if (r === 'herbs' && hasBld(c, 'b_herbroom')) y.f += 1;
  }
  if (hasBld(c, 'b_harbour')) for (const j of c.worked) if (ter(G, j) === 'coast' || ter(G, j) === 'lake') y.f += 1;
  y.g += m.cityG; y.c += m.cityC;
  if (m.waterCityC && cityWaterAdj(G, c)) y.c += m.waterCityC;
  // capital gets the village tributes
  if (c.id === p.capital) {
    for (const v of G.villages) {
      if (!v.alive) continue;
      const n = v.env[p.id] || 0; if (!n) continue;
      const tiers = ENVOY_TIERS.filter((t) => n >= t).length;
      const k = VILLAGE_KINDS[v.kind].y;
      y[k] += (k === 'g' ? 3 : 2) * tiers * (1 + m.villageX);
    }
    // heroes with yields
    for (const u of G.units) if (u.owner === p.id && u.hero) {
      const H = heroDef(G, u.hero);
      if (H.fortune) y.s += 2; if (H.scribe) y.s += H.scribe; if (H.trade) y.g += H.trade;
    }
  }
  const all = m.allPct + (m.aiPct || 0);
  const out = {
    f: y.f * (1 + pct.f + m.fPct + all * 0.5),
    p: y.p * (1 + pct.p + m.pPct + all),
    g: y.g * (1 + pct.g + m.gPct + all),
    s: y.s * (1 + pct.s + m.sPct + all - (m.techSlow || 0)),
    c: y.c * (1 + pct.c + m.cPct + all),
    legend, gp,
  };
  out.surplus = out.f - c.pop * 2;
  return out;
}
export function growthNeed(G, c) { return Math.round((14 + 7 * c.pop + Math.pow(c.pop, 1.6)) * costMul(G) * 1.1); }
export function luxCount(G, p) {
  const s = new Set();
  for (const c of G.cities) if (c.owner === p.id) for (const j of c.worked.concat([c.i])) { const r = resOf(G, j); if (r && RESOURCES[r].kind === 'lux') s.add(r); }
  return s.size;
}
export function hasResource(G, p, r) {
  for (const c of G.cities) if (c.owner === p.id) for (const j of cityTiles(G, c)) if (resOf(G, j) === r && resVisible(p, r)) return true;
  return false;
}

// ------------------------------------------------------------------ what a city can make
export function canTrain(G, c, uid) {
  const p = G.players[c.owner];
  const U = UNITS[uid];
  if (!U || U.neutral || U.cls === 'hero' || U.cls === 'gp') return false;
  if (U.sect && U.sect !== p.sect) return false;
  if (!U.sect && SECTS[p.sect].uu && UNITS[SECTS[p.sect].uu].rep === uid) return false;
  if (U.tech && !p.techs[U.tech]) return false;
  if (U.res && !(p.sect === 'yuyao' && uid === 'u_yy_tiger') && !hasResource(G, p, U.res)) return false;
  if (U.res2 && !hasResource(G, p, U.res2)) return false;
  if (U.naval && !cityCoastal(G, c)) return false;
  if (uid === 'u_founder' && c.pop < 2) return false;
  return true;
}
export function canBuild(G, c, bid) {
  const p = G.players[c.owner];
  const B = BUILDINGS[bid];
  if (!B) return false;
  if (B.sect && B.sect !== p.sect) return false;
  if (!B.sect && SECTS[p.sect].ub && BUILDINGS[SECTS[p.sect].ub].rep === bid) return false;
  if (c.blds.includes(bid)) return false;
  if (B.tech && !p.techs[B.tech]) return false;
  if (B.civic && !p.civics[B.civic]) return false;
  if (B.coastal && !cityWaterAdj(G, c)) return false;
  return true;
}
export function canWonder(G, c, wid) {
  const p = G.players[c.owner];
  const W = WONDERS[wid];
  if (G.wonders[wid]) return false;
  if (W.tech && !p.techs[W.tech]) return false;
  if (W.civic && !p.civics[W.civic]) return false;
  // one city at a time per sect for the same wonder
  return true;
}
export function canProject(G, c, pj) {
  const p = G.players[c.owner];
  const P = PROJECTS[pj];
  if (!p.techs[P.tech]) return false;
  if (p.proj !== P.stage - 1) return false;
  for (const o of G.cities) if (o.owner === p.id && o !== c && o.build && o.build.k === 'p') return false;
  return true;
}
export function itemCost(G, c, it) {
  const p = G.players[c.owner], m = mods(G, p);
  const cm = costMul(G);
  if (it.k === 'u') {
    let base = UNITS[it.id].cost;
    if (it.id === 'u_founder') {
      const made = p.stats.founded + G.units.filter((u) => u.owner === p.id && u.type === 'u_founder').length;
      base = (base + 18 * Math.max(0, made - 1)) * (1 - m.founderCost);
    }
    return Math.round(base * cm);
  }
  if (it.k === 'b') return Math.round(BUILDINGS[it.id].cost * cm);
  if (it.k === 'w') return Math.round(WONDERS[it.id].cost * cm);
  if (it.k === 'p') return Math.round(PROJECTS[it.id].cost * 1.5 * cm);
  return 999;
}
// production rate toward an item, with all the percentage boosts
export function itemRate(G, c, it, py) {
  const p = G.players[c.owner], m = mods(G, p);
  let pct = 0;
  if (it.k === 'u') {
    const U = UNITS[it.id];
    if (U.cls !== 'civ' && U.cls !== 'trade') pct += m.unitPct + c.blds.reduce((a, b) => a + (BUILDINGS[b].unitPct || 0), 0);
    if (it.id === 'u_founder') pct += m.founderPct;
    if (U.cls === 'siege') pct += m.siegePct;
  } else if (it.k === 'b') pct += m.bldPct;
  else if (it.k === 'w') pct += m.wonderPct;
  return py * (1 + pct);
}
export function buyCost(G, c, it) {
  const p = G.players[c.owner], m = mods(G, p);
  if (it.k === 'w' || it.k === 'p') return Infinity;
  const left = Math.max(0, itemCost(G, c, it) - c.prod);
  const k = it.k === 'u' ? 2.0 : 2.4;
  return Math.round((left * k + 10) * (1 - m.buyDisc));
}
export function buildOptions(G, c) {
  const out = [];
  for (const uid of Object.keys(UNITS)) if (canTrain(G, c, uid)) out.push({ k: 'u', id: uid });
  for (const bid of Object.keys(BUILDINGS)) if (canBuild(G, c, bid)) out.push({ k: 'b', id: bid });
  for (const wid of Object.keys(WONDERS)) if (canWonder(G, c, wid)) out.push({ k: 'w', id: wid });
  for (const pj of Object.keys(PROJECTS)) if (canProject(G, c, pj)) out.push({ k: 'p', id: pj });
  return out;
}
export function setBuild(G, c, it) {
  if (c.build && (c.build.k !== it.k || c.build.id !== it.id)) {
    // switching keeps progress between items of the same kind, halves it otherwise
    if ((c.build.k === 'u') !== (it.k === 'u')) c.prod = Math.floor(c.prod * 0.5);
  }
  c.build = it;
}
export function buyItem(G, c) {
  const p = G.players[c.owner];
  if (!c.build) return false;
  const cost = buyCost(G, c, c.build);
  if (!isFinite(cost) || p.gold < cost) return false;
  p.gold -= cost;
  c.prod = itemCost(G, c, c.build);
  completeItem(G, c, true);
  return true;
}
export function completeItem(G, c, bought = false) {
  const p = G.players[c.owner];
  const it = c.build; if (!it) return;
  const cost = itemCost(G, c, it);
  if (it.k === 'u') {
    const U = UNITS[it.id];
    // place the unit in the city, or next to it if the city tile is full
    let spot = -1;
    if (canStack(G, c.i, U, p.id)) spot = c.i;
    else for (const j of G._nb[c.i]) if ((U.naval ? isWater(G, j) : isLandPassable(G, j)) && canStack(G, j, U, p.id) && !enemyAt(G, j, p.id)) { spot = j; break; }
    if (spot < 0) { c.prod = Math.min(c.prod, cost); return; } // wait until there is room
    const u = makeUnit(G, p.id, it.id, spot);
    u.home = c.id;
    let xp = mods(G, p).xp;
    for (const b of c.blds) xp += BUILDINGS[b].xp || 0;
    for (const wid of Object.keys(G.wonders)) if (G.wonders[wid].owner === p.id && WONDERS[wid].fx && WONDERS[wid].fx.xp) xp += WONDERS[wid].fx.xp;
    if (isMilitary(U)) { u.xp = xp; checkLevel(G, u); }
    if (it.id === 'u_founder') c.pop = Math.max(1, c.pop - 1);
    if (p.human) note(G, p.id, `${c.name[0]}訓練出了${U.n[0]}。`, `${c.name[1]} trained ${U.n[1]}.`, c.i, 'build');
  } else if (it.k === 'b') {
    c.blds.push(it.id);
    if (it.id === 'b_walls' || BUILDINGS[it.id].hp) c.hp += BUILDINGS[it.id].hp || 0;
    if (p.human) note(G, p.id, `${c.name[0]}建好了${BUILDINGS[it.id].n[0]}。`, `${c.name[1]} completed ${BUILDINGS[it.id].n[1]}.`, c.i, 'build');
  } else if (it.k === 'w') {
    if (G.wonders[it.id]) { c.build = null; return; }
    G.wonders[it.id] = { owner: p.id, city: c.id, turn: G.turn };
    note(G, -2, `${sectName(G, p.id)[0]}在${c.name[0]}建成了奇觀「${WONDERS[it.id].n[0]}」！`, `${sectName(G, p.id)[1]} completed the wonder ${WONDERS[it.id].n[1]} in ${c.name[1]}!`, c.i, 'wonder');
    // others building the same wonder lose it: their progress turns into whatever they pick next
    for (const o of G.cities) if (o !== c && o.build && o.build.k === 'w' && o.build.id === it.id) { o.build = null; if (G.players[o.owner].human) note(G, o.owner, `${o.name[0]}的奇觀被別人搶先建成了。`, `Someone else finished the wonder ${o.name[1]} was building.`, o.i, 'warn'); }
    refreshMods(G, p);
    const fx = WONDERS[it.id].fx || {};
    if (fx.freeTech) freeTech(G, p);
    if (fx.revealCaps) for (const o of G.cities) if (o.capital) for (const j of within(G.map.w, G.map.h, o.i, 1)) p.exp[j] = 1;
  } else if (it.k === 'p') {
    p.proj = PROJECTS[it.id].stage;
    note(G, -2, `${sectName(G, p.id)[0]}完成了「${PROJECTS[it.id].n[0]}」（絕世神功 ${p.proj}/3）。`, `${sectName(G, p.id)[1]} completed ${PROJECTS[it.id].n[1]} (Peerless Art ${p.proj}/3).`, c.i, 'world');
  }
  c.prod = Math.max(0, c.prod - cost);
  c.lastBuilt = it;
  c.build = null;
  if (c.queue.length) { c.build = c.queue.shift(); if (!isValidItem(G, c, c.build)) c.build = null; }
}
export function isValidItem(G, c, it) {
  if (!it) return false;
  if (it.k === 'u') return canTrain(G, c, it.id);
  if (it.k === 'b') return canBuild(G, c, it.id);
  if (it.k === 'w') return canWonder(G, c, it.id);
  if (it.k === 'p') return canProject(G, c, it.id);
  return false;
}
function freeTech(G, p) {
  const av = availableTechs(p);
  if (!av.length) return;
  av.sort((a, b) => TECHS[a].cost - TECHS[b].cost);
  learnTech(G, p, av[0]);
}

// borders: claim the best free tile next to the city's land
function claimTile(G, c) {
  const p = G.players[c.owner];
  let best = -1, bv = -1e9;
  for (const j of within(G.map.w, G.map.h, c.i, 3)) {
    if (G.map.tc[j] >= 0 || G._vat[j] >= 0) continue;
    let adj = false; for (const q of G._nb[j]) if (G.map.tc[q] === c.id) adj = true;
    if (!adj) continue;
    const y = tileYield(G, j, p);
    let v = y.f * 1.2 + y.p + y.g * 0.6 + y.s + y.c - dist(G.map.w, c.i, j) * 0.6;
    if (resOf(G, j)) v += 2.5;
    if (terDef(G, j).deep) v -= 1.5;
    if (v > bv) { bv = v; best = j; }
  }
  if (best >= 0) { G.map.tc[best] = c.id; c.claimed++; return true; }
  return false;
}

// ------------------------------------------------------------------ research and rules
export function availableTechs(p) { return Object.keys(TECHS).filter((t) => !p.techs[t] && TECHS[t].req.every((r) => p.techs[r])); }
export function availableCivics(p) { return Object.keys(CIVICS).filter((t) => !p.civics[t] && CIVICS[t].req.every((r) => p.civics[r])); }
export function techCost(G, p, t) {
  let c = TECHS[t].cost * (1 + 0.35 * TECHS[t].era) * costMul(G) * (1 + 0.04 * Math.max(0, G.cities.filter((x) => x.owner === p.id).length - 3));
  const insp = TECHS[t].insp;
  if (insp && hasResource(G, p, insp)) c *= 0.8;
  if (resolutionOn(G, 'r_manuals', 'a')) { const k = G.players.filter((o) => o.alive && o.techs[t]).length; if (k >= 3) c *= 0.75; }
  // known by sects you have met: a little cheaper (ideas travel)
  const met = Object.keys(p.met).filter((q) => G.players[q].techs[t]).length;
  c *= 1 - Math.min(0.2, met * 0.05);
  return Math.round(c);
}
export function civicCost(G, p, t) {
  let c = CIVICS[t].cost * (1 + 0.3 * CIVICS[t].era) * costMul(G) * (1 + 0.03 * Math.max(0, G.cities.filter((x) => x.owner === p.id).length - 3));
  return Math.round(c);
}
export function learnTech(G, p, t) {
  if (p.techs[t]) return;
  p.techs[t] = G.turn;
  if (p.tech === t) p.tech = null;
  delete p.tprog[t];
  if (!p.tech && p.tq && p.tq.length) { p.tq = p.tq.filter((x) => !p.techs[x]); const nx = p.tq.find((x) => TECHS[x].req.every((r) => p.techs[r])); if (nx) { p.tech = nx; p.tq = p.tq.filter((x) => x !== nx); } }
  p.era = eraOf(p);
  refreshMods(G, p);
  if (p.human) note(G, p.id, `領悟了「${TECHS[t].n[0]}」。`, `Learned ${TECHS[t].n[1]}.`, -1, 'tech');
  if (t === 't_heaven') note(G, -2, `${sectName(G, p.id)[0]}領悟了「天人合一」，開始創造絕世神功！`, `${sectName(G, p.id)[1]} has learned Heaven and Man as One and begins the Peerless Art!`, -1, 'world');
  // revealed resources might make cities re-plan
  for (const c of G.cities) if (c.owner === p.id) assignWork(G, c);
}
export function learnCivic(G, p, t) {
  if (p.civics[t]) return;
  p.civics[t] = G.turn;
  if (p.civic === t) p.civic = null;
  delete p.cprog[t];
  if (!p.civic && p.cq && p.cq.length) { p.cq = p.cq.filter((x) => !p.civics[x]); const nx = p.cq.find((x) => CIVICS[x].req.every((r) => p.civics[r])); if (nx) { p.civic = nx; p.cq = p.cq.filter((x) => x !== nx); } }
  p.era = eraOf(p);
  const C = CIVICS[t];
  p.envoys += 1 + (C.envoys || 0);
  refreshMods(G, p);
  if (p.human) note(G, p.id, `立下了「${C.n[0]}」。得到 ${1 + (C.envoys || 0)} 位使者。`, `Adopted ${C.n[1]}. Gained ${1 + (C.envoys || 0)} envoy(s).`, -1, 'civic');
}
export function unlockedPolicies(p) { const s = []; for (const c in p.civics) for (const x of CIVICS[c].pol || []) s.push(x); return s; }
export function unlockedGovs(p) { const s = ['g_fledgling']; for (const c in p.civics) for (const x of CIVICS[c].gov || []) s.push(x); return s; }
export function setGov(G, p, g) {
  if (!unlockedGovs(p).includes(g)) return false;
  p.gov = g;
  // policies that no longer fit are dropped
  const sl = GOVS[g].slots;
  for (const k of Object.keys(p.pol)) p.pol[k] = p.pol[k].slice(0, sl[k]);
  refreshMods(G, p);
  return true;
}
export function setPolicies(G, p, pol) {
  const sl = GOVS[p.gov].slots, un = unlockedPolicies(p);
  const used = new Set();
  const out = { w: [], m: [], v: [], a: [] };
  for (const k of ['w', 'm', 'v', 'a']) for (const x of pol[k] || []) {
    if (!un.includes(x) || used.has(x)) continue;
    if (k !== 'a' && POLICIES[x].slot !== k) continue;
    if (out[k].length >= sl[k]) continue;
    out[k].push(x); used.add(x);
  }
  p.pol = out;
  refreshMods(G, p);
}

// ------------------------------------------------------------------ units (creation; movement and combat live in units.js)
export function makeUnit(G, pid, type, i, extra) {
  const U = UNITS[type];
  const u = { id: G.nextId++, owner: pid, type, i, hp: 100, mv: 0, xp: 0, lvl: 0, promos: [], fort: 0, order: null, acted: false, attacked: 0, home: -1, ...extra };
  u.mv = maxMoves(G, u);
  G.units.push(u); addAt(G, u); G._unitById.set(u.id, u);
  return u;
}
export function killUnit(G, u, quiet) {
  removeAt(G, u);
  const k = G.units.indexOf(u); if (k >= 0) G.units.splice(k, 1);
  G._unitById.delete(u.id);
  if (u.hero && G.heroes[u.hero]) { G.heroes[u.hero].by = -1; G.heroes[u.hero].avail = G.turn + 10; }
  u.dead = true;
}
export function heroDef(G, hid) {
  if (hid.startsWith('L_')) { const sid = hid.slice(2); return { ...LEADER_HERO, n: SECTS[sid].ln, spr: SECTS[sid].leader, leader: sid }; }
  return HEROES[hid];
}
export function maxMoves(G, u) {
  const U = UNITS[u.type];
  let m = U.mv;
  if (u.hero) { const H = heroDef(G, u.hero); m = 3 + (H.mvX || 0); }
  if (u.promos.includes('pr_qing')) m += 1;
  if (U.cls === 'recon' && u.owner >= 0 && G.players[u.owner].techs.t_qinggong) m += 1;
  return m;
}
export function canStack(G, i, def, pid) {
  const mil = isMilitary(def);
  for (const o of unitsAt(G, i)) {
    if (o.owner !== pid) return false;
    if (isMilitary(udef(o)) === mil) return false;
  }
  return true;
}
export function enemyAt(G, i, pid) {
  for (const o of unitsAt(G, i)) if (o.owner !== pid) return true;
  return false;
}
export function checkLevel(G, u) {
  let lv = 0; for (const t of XP_LEVELS) if (u.xp >= t) lv++;
  if (lv > u.lvl) { u.pend = (u.pend || 0) + (lv - u.lvl); u.lvl = lv; return true; }
  return false;
}

// ------------------------------------------------------------------ visibility
export function sightOf(G, u) {
  const U = UNITS[u.type];
  let s = U.sight || 2;
  if (u.hero) s = 3 + (heroDef(G, u.hero).sight || 0);
  if (u.promos.includes('pr_eye')) s += 1;
  const t = ter(G, u.i);
  if (t === 'hills' || t === 'mountain') s += 1;
  if (u.owner >= 0) s += mods(G, G.players[u.owner]).sight;
  return s;
}
export function updateVis(G, pid) {
  const p = G.players[pid];
  const v = G._vis[pid]; v.fill(0);
  const W = G.map.w, H = G.map.h;
  const mark = (i, r) => { for (const j of within(W, H, i, r)) { v[j] = 1; p.exp[j] = 1; } };
  for (const u of G.units) if (u.owner === pid) mark(u.i, sightOf(G, u));
  for (const c of G.cities) if (c.owner === pid) { mark(c.i, 2); for (const j of cityTiles(G, c)) { v[j] = 1; p.exp[j] = 1; for (const q of G._nb[j]) { v[q] = 1; p.exp[q] = 1; } } }
  // allies share sight
  for (const o of G.players) if (o.alive && o.id !== pid && p.rel[o.id] === 'ally') {
    for (const u of G.units) if (u.owner === o.id) for (const j of within(W, H, u.i, 2)) { v[j] = 1; p.exp[j] = 1; }
    for (const c of G.cities) if (c.owner === o.id) for (const j of within(W, H, c.i, 2)) { v[j] = 1; p.exp[j] = 1; }
  }
  // meeting other sects
  for (const u of G.units) if (u.owner >= 0 && u.owner !== pid && v[u.i]) meet(G, pid, u.owner);
  for (const c of G.cities) if (c.owner !== pid && v[c.i]) meet(G, pid, c.owner);
}
export function revealAround(G, pid, i, r) {
  const p = G.players[pid], v = G._vis[pid];
  for (const j of within(G.map.w, G.map.h, i, r)) { v[j] = 1; p.exp[j] = 1; }
  for (const j of within(G.map.w, G.map.h, i, r)) for (const o of unitsAt(G, j)) if (o.owner >= 0 && o.owner !== pid) meet(G, pid, o.owner);
}
export function meet(G, a, b) {
  if (a === b || a < 0 || b < 0) return;
  const A = G.players[a], B = G.players[b];
  if (A.met[b] !== undefined) return;
  A.met[b] = G.turn; B.met[a] = G.turn;
  A.rel[b] = 'peace'; B.rel[a] = 'peace'; A.relT[b] = G.turn; B.relT[a] = G.turn;
  A.griev[b] = A.griev[b] || 0; B.griev[a] = B.griev[a] || 0;
  if (A.human || B.human) {
    const h = A.human ? a : b, o = A.human ? b : a;
    note(G, h, `遇見了${sectName(G, o)[0]}（${leaderName(G, o)[0]}）。`, `Met ${sectName(G, o)[1]} (${leaderName(G, o)[1]}).`, -1, 'diplo');
    if (G.hooks && G.hooks.onMeet) G.hooks.onMeet(h, o);
  }
}

// ------------------------------------------------------------------ turn start for every sect
export function beginTurnAll(G, first = false) {
  for (const p of G.players) if (p.alive) beginTurn(G, p, first);
}
export function beginTurn(G, p, first) {
  refreshMods(G, p);
  const m = mods(G, p);
  const myCities = G.cities.filter((c) => c.owner === p.id);
  let tot = { f: 0, p: 0, g: 0, s: 0, c: 0, legend: 0 };
  const lux = luxCount(G, p);
  for (const c of myCities) {
    assignWork(G, c);
    const y = cityYield(G, c);
    y.c += lux * 0.5;
    tot.p += y.p; tot.g += y.g; tot.s += y.s; tot.c += y.c; tot.f += y.surplus; tot.legend += y.legend;
    for (const k of GP_KEYS) p.gpp[k] += y.gp[k] * (1 + m.gpPct[k]);
    if (first) continue;
    // growth
    const growth = 1 + m.growthPct + lux * 0.04;
    c.food += y.surplus > 0 ? y.surplus * growth : y.surplus;
    const need = growthNeed(G, c);
    if (c.food >= need) {
      c.pop++; c.food = 0;
      for (const b of c.blds) if (BUILDINGS[b].keepFood) c.food = need * BUILDINGS[b].keepFood;
      if (p.human) note(G, p.id, `${c.name[0]}人口成長到 ${c.pop}。`, `${c.name[1]} grew to ${c.pop}.`, c.i, 'grow');
    } else if (c.food < 0) {
      if (c.pop > 1) { c.pop--; c.food = growthNeed(G, c) * 0.5; if (p.human) note(G, p.id, `${c.name[0]}鬧饑荒，人口減少了。`, `${c.name[1]} is starving and lost population.`, c.i, 'warn'); }
      else c.food = 0;
    }
    // production
    if (c.build && !isValidItem(G, c, c.build)) c.build = null;
    if (c.build) {
      c.prod += itemRate(G, c, c.build, y.p);
      if (c.prod >= itemCost(G, c, c.build)) completeItem(G, c);
    } else c.prod += y.p * 0.5; // idle hands still stockpile a little
    // the city develops its land
    c.lab += 1 + c.pop * 0.5;
    const labNeed = 10 * costMul(G) * (1 + c.nImp * 0.1);
    if (c.lab >= labNeed) {
      for (const j of c.worked) { const k = improvementFor(G, j, p); if (k) { G.map.imp[j] = IMP_IDS.indexOf(k); c.nImp++; c.lab -= labNeed; break; } }
      c.lab = Math.min(c.lab, labNeed * 2);
    }
    // borders
    let bpct = m.cPct * 0 + c.blds.reduce((a, b) => a + (BUILDINGS[b].border || 0), 0);
    c.cult += (1 + y.c * 0.35) * (1 + bpct);
    const bneed = (6 + 5 * Math.pow(c.claimed + 1, 1.3)) * costMul(G);
    if (c.cult >= bneed) { if (claimTile(G, c)) c.cult -= bneed; else c.cult = bneed; }
    // heal the city
    const maxhp = cityMaxHp(c);
    if (G.turn - c.lastHit > 1) c.hp = Math.min(maxhp, c.hp + 20); else c.hp = Math.min(maxhp, c.hp + 5);
    c.struck = false;
  }
  if (first) { p.lastY = { ...tot }; return; }
  // research
  const sci = tot.s;
  if (!p.tech) p._idleS = (p._idleS || 0) + sci;
  if (p.tech) {
    p.tprog[p.tech] = (p.tprog[p.tech] || 0) + sci + (p._idleS || 0); p._idleS = 0;
    if (p.tprog[p.tech] >= techCost(G, p, p.tech)) { const over = p.tprog[p.tech] - techCost(G, p, p.tech); const t = p.tech; learnTech(G, p, t); p._idleS = over; }
  }
  // renown: rules tree progress, the spendable pool, and lifetime renown
  const ren = tot.c;
  p.renown += ren; p.life += ren;
  if (!p.civic) p._idleC = (p._idleC || 0) + ren;
  if (p.civic) {
    p.cprog[p.civic] = (p.cprog[p.civic] || 0) + ren + (p._idleC || 0); p._idleC = 0;
    if (p.cprog[p.civic] >= civicCost(G, p, p.civic)) { const over = p.cprog[p.civic] - civicCost(G, p, p.civic); learnCivic(G, p, p.civic); p._idleC = over; }
  }
  // legend
  let leg = tot.legend + p.tales * 3 + m.legend;
  const pacts = Object.keys(p.pact).filter((k) => p.pact[k] > G.turn).length;
  const foreignRoutes = p.routes.filter((r) => { const t = cityById(G, r.to); return t && t.owner !== p.id; }).length;
  leg *= (1 + m.legendPct) * (1 + 0.1 * pacts + 0.05 * foreignRoutes);
  p.legend += leg;
  // silver: income minus upkeep
  let gold = tot.g;
  for (const r of p.routes) gold += r.g + m.routeG;
  for (const k of Object.keys(p.pact)) if (p.pact[k] > G.turn && G.players[k].alive) gold += 2;
  // routes ending in our cities from other sects pay a little
  for (const o of G.players) if (o.id !== p.id) for (const r of o.routes) { const t = cityById(G, r.to); if (t && t.owner === p.id) gold += 1; }
  let upkeep = 0;
  for (const c of myCities) for (const b of c.blds) upkeep += BUILDINGS[b].u || 0;
  const mil = G.units.filter((u) => u.owner === p.id && isMilitary(udef(u)));
  const free = 2 + myCities.length;
  upkeep += Math.max(0, mil.length - free) * (1 + p.era * 0.25);
  upkeep += mil.filter((u) => u.hero).length;
  p.gold += gold - upkeep;
  p.lastY = { f: tot.f, p: tot.p, g: gold - upkeep, s: sci, c: ren, legend: leg, upkeep, income: gold };
  if (p.gold < 0) {
    // disband the weakest unit to pay
    const vict = mil.filter((u) => !u.hero).sort((a, b) => UNITS[a.type].cost - UNITS[b.type].cost)[0];
    if (vict) { if (p.human) note(G, p.id, `銀兩不足，${UNITS[vict.type].n[0]}解散了。`, `Out of silver: ${UNITS[vict.type].n[1]} disbanded.`, vict.i, 'warn'); killUnit(G, vict); }
    p.gold = 0;
  }
  // favour
  const allies = G.players.filter((o) => o.alive && p.rel[o.id] === 'ally').length;
  p.favour += 1 + m.favour + allies * (1 + m.allyFavour) + G.villages.filter((v) => v.alive && v.suz === p.id).length;
  // great people
  for (const k of GP_KEYS) {
    const need = gpNeed(G, p, k);
    if (p.gpp[k] >= need) { p.gpp[k] -= need; spawnGreat(G, p, k); }
  }
  // escort routes expire
  p.routes = p.routes.filter((r) => {
    const a = cityById(G, r.from), b = cityById(G, r.to);
    const okc = a && b && a.owner === p.id && !(b.owner !== p.id && p.rel[b.owner] === 'war');
    if (!okc || r.until <= G.turn) { if (p.human) note(G, p.id, '一條鏢路到期了。', 'An escort route has ended.', a ? a.i : -1, 'info'); return false; }
    return true;
  });
  // wonders with periodic gifts
  if (m.beastEvery && G.turn % m.beastEvery === 0) {
    const cap = cityById(G, p.capital);
    if (cap) { const t = NEUTRAL_POOL(G, 'beast'); const u = spawnNear(G, p.id, t, cap.i); if (u && p.human) note(G, p.id, '萬妖塔引來一頭野獸投效。', 'A beast answered the call of the Tower.', cap.i, 'unit'); }
  }
  // units: heal and refresh
  for (const u of G.units) if (u.owner === p.id) refreshUnit(G, u, m);
  p.era = eraOf(p);
  updateVis(G, p.id);
}
export function cityMaxHp(c) { let h = 150; for (const b of c.blds) h += BUILDINGS[b].hp || 0; return h; }
export function gpNeed(G, p, k) { return Math.round((30 + 70 * costMul(G)) * (1 + 0.8 * p.gpn[k])); }
function spawnGreat(G, p, k) {
  const cap = cityById(G, p.capital) || G.cities.find((c) => c.owner === p.id);
  if (!cap) return;
  const D = GREAT[k];
  let name = null;
  for (const nm of D.names) if (!G.gpUsed[nm[0]]) { name = nm; break; }
  if (!name) name = [D.n[0] + (p.gpn[k] + 1), D.n[1] + ' ' + (p.gpn[k] + 1)];
  G.gpUsed[name[0]] = p.id;
  p.gpn[k]++;
  const u = spawnNear(G, p.id, 'gp', cap.i, { gp: k, name });
  if (u) note(G, p.human ? p.id : -2, `${sectName(G, p.id)[0]}出了一位${D.n[0]}：${name[0]}。`, `A ${D.n[1]} appeared in ${sectName(G, p.id)[1]}: ${name[1]}.`, cap.i, 'gp');
}
export function NEUTRAL_POOL(G, kind) {
  const e = Math.min(4, worldEra(G));
  const pool = ({ bandit: [['x_lackey', 'x_bowman'], ['x_cudgel', 'x_bowman'], ['x_cudgel', 'x_thug'], ['x_thug'], ['x_thug']], beast: [['x_wolf', 'x_boar'], ['x_wolf', 'x_boar'], ['x_boar', 'x_tiger'], ['x_tiger', 'x_ape'], ['x_ape']] })[kind][e];
  return pool[rint(G, pool.length)];
}
export function spawnNear(G, pid, type, i, extra) {
  const U = UNITS[type];
  for (const j of within(G.map.w, G.map.h, i, 2)) {
    if (U.naval ? !isWater(G, j) : !isLandPassable(G, j)) continue;
    if (!canStack(G, j, U, pid)) continue;
    if (cityAt(G, j) && cityAt(G, j).owner !== pid) continue;
    if (villageAt(G, j) || (campAt(G, j) && pid >= 0)) continue;
    return makeUnit(G, pid, type, j, extra);
  }
  return null;
}
export function refreshUnit(G, u, m) {
  const U = udef(u);
  // healing
  if (u.hp < 100) {
    const own = tileOwner(G, u.i);
    let h = 0;
    if (!u.attacked || m.healAlways) {
      h = own === u.owner ? 15 : own < 0 ? 10 : 5;
      if (own === u.owner) h += m.healHome;
      const c = cityAt(G, u.i);
      if (c && c.owner === u.owner) { h += 10; for (const b of c.blds) h += BUILDINGS[b].healCity || 0; }
      h += m.heal;
      if (u.promos.includes('pr_heal')) h += 10;
      for (const j of G._nb[u.i]) for (const o of unitsAt(G, j)) if (o.owner === u.owner) { const od = udef(o); if (od.healAdj) h += od.healAdj; if (o.hero && heroDef(G, o.hero).healAdj) h += heroDef(G, o.hero).healAdj; }
      if (u.acted && !m.healAlways) h = Math.floor(h / 2);
    }
    h += m.healAlways;
    u.hp = Math.min(100, u.hp + h);
  }
  if (!u.acted && !u.attacked && isMilitary(U)) u.fort = Math.min(2, u.fort + 1); else if (u.acted) u.fort = 0;
  u.mv = maxMoves(G, u);
  u.acted = false; u.attacked = 0; u.strikes = 0;
}
