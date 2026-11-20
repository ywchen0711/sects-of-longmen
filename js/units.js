// Units: movement (costs, zones of control, embarking), pathfinding, combat, capture, promotions,
// great people, heroes, escort routes and envoys.
import { UNITS, TERRAIN, BUILDINGS, WONDERS, HEROES, GREAT, PROMOS, SECTS, TECHS, VILLAGE_KINDS, ENVOY_TIERS, RESOURCES } from './data.js?v=1';
import {
  note, sectName, ter, terDef, isWater, isLandPassable, cityAt, villageAt, campAt, unitsAt, tileOwner, addAt, removeAt, mods, udef,
  isMilitary, makeUnit, killUnit, heroDef, maxMoves, canStack, checkLevel, updateVis, revealAround, refreshMods, cityTiles, assignWork,
  cityMaxHp, costMul, NEUTRAL_POOL, spawnNear, cityById, eraOf, foundCity, canFound, worldEra, techCost, itemCost, learnTech, hasBld,
} from './core.js?v=1';
import { within, dist } from './hex.js?v=1';
import { rnd, rint } from './rng.js?v=1';

// ------------------------------------------------------------------ relations
export function atWar(G, a, b) {
  if (a === b) return false;
  if (a < 0 || b < 0) {
    const pl = a < 0 ? b : a; if (pl < 0) return false;
    return true;
  }
  return G.players[a].rel[b] === 'war';
}
// is unit o hostile to player pid (for blocking, ZOC, attacks)?
export function hostileUnit(G, pid, o) {
  if (o.owner === pid) return false;
  if (o.owner < 0) {
    if (pid < 0) return false;
    const m = mods(G, G.players[pid]);
    const cls = udef(o).cls;
    if (cls === 'bandit' && m.banditFriend) return 'friendly-neutral';
    if (cls === 'beast' && m.beastFriend) return 'friendly-neutral';
    return true;
  }
  if (pid < 0) return true;
  return G.players[pid].rel[o.owner] === 'war';
}
function hostileToNeutral(G, pid, o) { return hostileUnit(G, pid, o) === true; }

// ------------------------------------------------------------------ movement
export function embarkOK(G, u, i) {
  if (u.owner < 0) return false;
  const p = G.players[u.owner];
  const t = ter(G, i);
  if (t === 'sea') return !!p.techs.t_ships;
  return !!p.techs.t_boat;
}
// cost to step from a to b (Infinity if not allowed). Does not look at other units.
export function stepCost(G, u, a, b) {
  const U = udef(u);
  const tb = ter(G, b), ta = ter(G, a);
  const Tb = TERRAIN[tb];
  const cb = cityAt(G, b);
  if (U.naval) {
    if (cb && cb.owner === u.owner) return 1;
    if (!Tb.water) return Infinity;
    if (u.type === 'u_boat' && tb === 'sea') return Infinity;
    return 1;
  }
  if (Tb.water) {
    if (!embarkOK(G, u, b)) return Infinity;
    return TERRAIN[ta].water ? 1 : 99; // embarking takes the whole turn's moves
  }
  if (TERRAIN[ta].water && !cityAt(G, a)) return 99; // landing too
  if (tb === 'mountain') {
    if (u.owner < 0 || !G.players[u.owner].techs.t_qinggong) return Infinity;
    return 3;
  }
  if (G.map.road[a] && G.map.road[b]) return 0.5;
  let c = Tb.mv;
  if (u.owner >= 0) {
    const m = mods(G, G.players[u.owner]);
    if (m.ignoreRough.includes(tb)) c = 1;
    if (u.hero && heroDef(G, u.hero).wild && ['forest', 'bamboo', 'marsh'].includes(tb)) c = 1;
  }
  if (G.map.river[b] && !G.map.river[a] && !(u.owner >= 0 && G.players[u.owner].sect === 'hanjiang')) c += 1;
  return c;
}
// tiles adjacent to hostile military units or hostile cities (zone of control) for this unit
export function inZOC(G, u, i) {
  if (udef(u).noZOC || (u.hero && heroDef(G, u.hero).noZOC)) return false;
  for (const j of G._nb[i]) {
    for (const o of unitsAt(G, j)) if (isMilitary(udef(o)) && hostileToNeutral(G, u.owner, o)) return true;
    const c = cityAt(G, j); if (c && c.owner !== u.owner && atWar(G, u.owner, c.owner)) return true;
  }
  return false;
}
// may this unit end/pass a move on tile i (not attacking)?
export function canEnter(G, u, i, final) {
  const U = udef(u);
  const c = cityAt(G, i);
  if (c && c.owner !== u.owner) {
    // allies may pass through each other's cities
    if (!(u.owner >= 0 && G.players[u.owner].rel[c.owner] === 'ally')) return false;
  }
  const v = villageAt(G, i); if (v) return false;
  const camp = campAt(G, i);
  if (camp && !isMilitary(U)) return false;
  for (const o of unitsAt(G, i)) {
    if (o === u) continue;
    if (o.owner !== u.owner) return false;
    if (final && isMilitary(udef(o)) === isMilitary(U)) return false;
  }
  return true;
}

// A* path; returns {path:[tiles from next to target], turns} or null.
// opts.attack: the target may hold an enemy (path ends next to it); opts.known: only explored tiles (human)
export function findPath(G, u, target, opts = {}) {
  if (target === u.i) return { path: [], turns: 0 };
  const W = G.map.w, N = W * G.map.h;
  const maxMv = maxMoves(G, u);
  const p = u.owner >= 0 ? G.players[u.owner] : null;
  const known = opts.known && p ? p.exp : null;
  const vis = opts.known && p ? G._vis[u.owner] : null;
  const g = new Float64Array(N).fill(Infinity);
  const left = new Float64Array(N);
  const from = new Int32Array(N).fill(-1);
  const turns = new Int32Array(N);
  const heap = [];
  const push = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const q = (k - 1) >> 1; if (heap[q][0] <= heap[k][0]) break; [heap[q], heap[k]] = [heap[k], heap[q]]; k = q; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  g[u.i] = 0; left[u.i] = u.mv; turns[u.i] = 0;
  push(u.i, 0);
  const maxNodes = opts.max || 4000;
  let n = 0;
  while (heap.length) {
    const [, a] = pop();
    if (a === target) break;
    if (++n > maxNodes) break;
    for (const b of G._nb[a]) {
      let cost;
      if (known && !known[b]) cost = 1.5;
      else cost = stepCost(G, u, a, b);
      if (!isFinite(cost)) continue;
      const isT = b === target;
      // units: hostile ones block (visible ones only for the human), own ones may be passed
      if (!(opts.attack && isT)) {
        let blocked = false;
        for (const o of unitsAt(G, b)) if (o.owner !== u.owner && (!vis || vis[b])) blocked = true;
        if (blocked) continue;
        const c = cityAt(G, b); if (c && c.owner !== u.owner && !(u.owner >= 0 && G.players[u.owner].rel[c.owner] === 'ally')) continue;
        if (villageAt(G, b)) continue;
        if (campAt(G, b) && !isMilitary(udef(u)) ) continue;
      }
      let ml = left[a], tn = turns[a];
      if (ml <= 0) { tn++; ml = maxMv; }
      let nl = cost >= 99 ? 0 : Math.max(0, ml - cost);
      if (!opts.attack || !isT) if (inZOC(G, u, b) && (!vis || vis[b])) nl = 0;
      const ng = tn * maxMv + (maxMv - nl) + (cost >= 99 ? 0.5 : 0);
      if (ng < g[b]) {
        g[b] = ng; left[b] = nl; turns[b] = tn; from[b] = a;
        const h = dist(W, b, target) * 0.5;
        push(b, ng + h);
      }
    }
  }
  if (!isFinite(g[target])) return null;
  const path = [];
  for (let k = target; k !== u.i; k = from[k]) { path.push(k); if (path.length > 400) return null; }
  path.reverse();
  return { path, turns: turns[target] + (left[target] <= 0 ? 0 : 0) + (path.length ? 1 : 0), cost: g[target] };
}

// move one step (adjacent). Returns true if moved.
export function stepUnit(G, u, b) {
  if (u.mv <= 0) return false;
  if (!G._nb[u.i].includes(b)) return false;
  const cost = stepCost(G, u, u.i, b);
  if (!isFinite(cost)) return false;
  if (!canEnter(G, u, b, true) && !canEnter(G, u, b, false)) return false;
  const zoc = inZOC(G, u, b);
  removeAt(G, u); u.i = b; addAt(G, u);
  u.mv = cost >= 99 ? 0 : Math.max(0, u.mv - cost);
  if (zoc) u.mv = 0;
  u.acted = true; u.fort = 0;
  if (u.owner >= 0) {
    revealAround(G, u.owner, b, require_sight(G, u));
    afterEnter(G, u, b);
  }
  return true;
}
function require_sight(G, u) { const U = udef(u); let s = U.sight || 2; if (u.hero) s = 3; const t = ter(G, u.i); if (t === 'hills' || t === 'mountain') s++; return s + mods(G, G.players[u.owner]).sight; }

// follow a path as far as moves allow; stops when blocked. Returns tiles moved.
export function moveAlong(G, u, path) {
  let k = 0;
  while (k < path.length && u.mv > 0 && !u.dead) {
    const b = path[k];
    // a hidden enemy may stand in the way
    let blocked = false;
    for (const o of unitsAt(G, b)) if (o.owner !== u.owner) blocked = true;
    if (blocked) break;
    const last = k === path.length - 1;
    if (!canEnter(G, u, b, last)) {
      if (last || !canEnter(G, u, b, false)) break;
    }
    if (!stepUnit(G, u, b)) break;
    k++;
  }
  // never end stacked illegally: step back is not tracked; we simply stop before a full tile above
  return k;
}
export function moveTo(G, u, target, opts = {}) {
  const r = findPath(G, u, target, opts);
  if (!r) return 0;
  return moveAlong(G, u, r.path);
}

// things that happen when a unit enters a tile: camps, ruins
function afterEnter(G, u, i) {
  const camp = campAt(G, i);
  if (camp && isMilitary(udef(u)) && u.owner >= 0) {
    // defenders must be dead already (we could not have entered otherwise)
    clearCamp(G, u, camp);
  }
}
export function clearCamp(G, u, camp) {
  const p = G.players[u.owner];
  const m = mods(G, p);
  const mul = (G.congress.active.some((r) => r.id === 'r_purge' && r.opt === 'a')) ? 3 : 1;
  const gold = Math.round(30 * mul * (1 + worldEra(G) * 0.5));
  p.gold += gold; p.renown += 8 * mul; p.life += 8 * mul;
  G.camps.splice(G.camps.indexOf(camp), 1); G._camp[camp.i] = -1;
  let extra = '', extraEn = '';
  if (camp.kind === 'bandit' && m.convertCamp) {
    const t = NEUTRAL_POOL(G, 'bandit'); const nu = spawnNear(G, p.id, t, camp.i);
    if (nu) { extra = `，收編了${UNITS[t].n[0]}`; extraEn = ` and recruited ${UNITS[t].n[1]}`; }
    p.gold += 40;
  }
  if (camp.kind === 'beast' && m.tame && rnd(G) < m.tame) {
    const t = NEUTRAL_POOL(G, 'beast'); const nu = spawnNear(G, p.id, t, camp.i);
    if (nu) { extra = `，收服了${UNITS[t].n[0]}`; extraEn = ` and tamed ${UNITS[t].n[1]}`; }
  }
  const what = camp.kind === 'beast' ? ['獸穴', 'beast lair'] : ['流寇山寨', 'bandit camp'];
  if (p.human) note(G, p.id, `清除了${what[0]}，得到 ${gold} 銀${extra}。`, `Cleared a ${what[1]} and took ${gold} silver${extraEn}.`, camp.i, 'combat');
}

// ------------------------------------------------------------------ combat
function heroStr(G, u) {
  const H = heroDef(G, u.hero);
  return H.str + 3 * Math.max(0, u.lvl) + 4 * (u.hlvl || 0);
}
export function baseStr(G, u, ranged) {
  const U = udef(u);
  if (u.hero) {
    const H = heroDef(G, u.hero);
    if (ranged) return H.rstr ? H.rstr + 3 * u.lvl + 4 * (u.hlvl || 0) : 0;
    return heroStr(G, u);
  }
  return ranged ? (U.rstr || 0) : U.str;
}
export function canRanged(G, u) { const U = udef(u); if (u.hero) return !!heroDef(G, u.hero).rstr; return !!U.rstr; }
export function rangeOf(G, u) { const U = udef(u); if (u.hero) return heroDef(G, u.hero).rng || 0; let r = U.rng || 0; return r; }

// strength of unit u in a fight (attacking=true if it strikes), against defender/attacker `vs` at tile `at`
export function combatStr(G, u, attacking, ranged, vs, at, vsCity) {
  const U = udef(u);
  let s = baseStr(G, u, ranged);
  if (s <= 0) return 0;
  const pl = u.owner >= 0 ? G.players[u.owner] : null;
  const m = pl ? mods(G, pl) : null;
  if (m) { s += m.str; if (ranged) s += m.rangedStr; }
  // wounds
  s -= Math.floor((100 - u.hp) / 10);
  const t = ter(G, u.i);
  if (!U.naval && TERRAIN[t].water && !cityAt(G, u.i)) s = Math.min(s, 8 + (pl ? pl.era : 0) * 5);
  if (!attacking) {
    s += TERRAIN[t].def || 0;
    if (u.fort >= 1) s += 3 + (U.fortBonus || 0);
    if (u.promos.includes('pr_iron')) s += 5;
    if (m && tileOwner(G, u.i) === u.owner) { s += m.homeDef; if (U.homeDef) s += U.homeDef; }
    if (u.hero && heroDef(G, u.hero).def) s += heroDef(G, u.hero).def;
    // a big friend standing next to us
    for (const j of G._nb[u.i]) for (const o of unitsAt(G, j)) if (o.owner === u.owner && o.hero && heroDef(G, o.hero).guard) s += heroDef(G, o.hero).guard;
    if (G.map.river[u.i] && vs && !G.map.river[vs.i] && !ranged) s += 3;
  } else {
    if (U.cls === 'melee' || U.cls === 'anti' || U.cls === 'mounted' || u.hero) if (m && !ranged) s += m.meleeAtk;
    if (u.promos.includes('pr_charge') && !ranged) s += 5;
    if (u.hero && heroDef(G, u.hero).atk) s += heroDef(G, u.hero).atk;
    for (const j of G._nb[u.i]) for (const o of unitsAt(G, j)) if (o.owner === u.owner && o.hero && heroDef(G, o.hero).inspire) s += heroDef(G, o.hero).inspire;
    if (ranged && u.promos.includes('pr_aim')) s += 5;
    if (ranged && u.promos.includes('pr_high') && (t === 'hills' || t === 'mountain')) s += 7;
    if (vsCity) {
      if (m) s += m.vsCity;
      if (U.vsCity) s += U.vsCity;
      if (u.promos.includes('pr_break')) s += 6;
      if (ranged && U.cls !== 'siege' && U.cls !== 'navalR') s -= 8;
    }
    if (vs && !vsCity) {
      if (vs.fort >= 1 && u.promos.includes('pr_break')) s += 6;
      // flanking: friends around the defender
      if (!ranged && at >= 0) {
        let f = 0;
        for (const j of G._nb[at]) if (j !== u.i) for (const o of unitsAt(G, j)) if (o.owner === u.owner && isMilitary(udef(o))) f++;
        s += f * 2 * (u.promos.includes('pr_chain') ? 2 : 1);
      }
    }
  }
  if (vs && !vsCity) {
    const VU = udef(vs);
    if (U.vsMounted && VU.cls === 'mounted') s += U.vsMounted;
    if (m && m.vsWounded && vs.hp < 100) s += m.vsWounded;
    if (m && (VU.cls === 'bandit' || VU.cls === 'beast')) s += m.vsNeutral;
    if (m && m.bounty && vs.owner === m.bounty - 1) s += 5;
    if (u.hero && heroDef(G, u.hero).duel && (vs.hero || vs.type === 'u_master')) s += heroDef(G, u.hero).duel;
    // a fearsome warden next to us
    for (const j of G._nb[u.i]) for (const o of unitsAt(G, j)) if (o.owner === vs.owner && o.hero && heroDef(G, o.hero).fear) s -= heroDef(G, o.hero).fear;
    if (u.promos.includes('pr_wood') && ['forest', 'bamboo'].includes(ter(G, at))) s += 6;
  }
  if (!pl && u.owner < 0) s += worldEra(G) * 2; // outlaws grow with the times
  return Math.max(1, s);
}
export function cityStr(G, c, vsUnit) {
  const p = c.owner >= 0 ? G.players[c.owner] : null;
  const era = p ? p.era : worldEra(G);
  let s = 8 + c.pop * 0.8 + era * 7;
  for (const b of c.blds) s += (BUILDINGS[b].def || 0) * 0.7;
  // best garrison helps
  let g = 0; for (const o of unitsAt(G, c.i)) if (o.owner === c.owner && isMilitary(udef(o))) g = Math.max(g, baseStr(G, o, false));
  s += g * 0.3;
  if (p) { const m = mods(G, p); s += m.cityDef; s *= 1 + m.cityDefPct; }
  if (c.capital) s += 3;
  s -= Math.floor((cityMaxHp(c) - c.hp) / 40);
  return Math.max(4, s);
}
function villageStr(G, v) { return 16 + worldEra(G) * 7; }
export function damage(sa, sd, r) {
  const d = 30 * Math.exp((sa - sd) / 25) * r;
  return Math.max(1, Math.round(d));
}

// what is on the tile to fight: unit, city or village
export function defenderAt(G, pid, i) {
  let best = null;
  for (const o of unitsAt(G, i)) if (o.owner !== pid) { if (isMilitary(udef(o))) { if (!best || !isMilitary(udef(best)) || o.hp * baseStr(G, o) > best.hp * baseStr(G, best)) best = o; } else if (!best) best = o; }
  const c = cityAt(G, i);
  if (c && c.owner !== pid) {
    if (best && isMilitary(udef(best))) return { kind: 'unit', u: best, city: c };
    return { kind: 'city', c };
  }
  const v = villageAt(G, i);
  if (v) return { kind: 'village', v };
  if (best) return { kind: isMilitary(udef(best)) ? 'unit' : 'civ', u: best };
  return null;
}
export function canAttackTile(G, u, i) {
  if (u.owner < 0 && G.players.length === 0) return null;
  const U = udef(u);
  if (!isMilitary(U) || (U.str <= 0 && !u.hero)) return null;
  if (u.mv <= 0 && !(u.strikes > 0)) return null;
  if (u.attacked && !(u.extra)) return null;
  const d = defenderAt(G, u.owner, i);
  if (!d) return null;
  const tOwner = d.kind === 'city' ? d.c.owner : d.kind === 'village' ? null : d.u.owner;
  if (d.kind === 'village') { if (!(d.v.war[u.owner])) return null; }
  else if (d.kind === 'unit' || d.kind === 'civ') { if (hostileUnit(G, u.owner, d.u) !== true) return null; }
  else if (!atWar(G, u.owner, tOwner)) return null;
  const dd = dist(G.map.w, u.i, i);
  if (canRanged(G, u)) {
    if (dd <= rangeOf(G, u) && dd >= 1) return d.kind === 'civ' ? (dd === 1 && !U.naval ? 'melee' : 'ranged') : 'ranged';
    return null;
  }
  if (dd !== 1) return null;
  // melee needs to be able to stand there: land units can't attack into water, ships can't attack inland
  if (U.naval) { if (!isWater(G, i) && !cityAt(G, i)) return null; }
  else if (isWater(G, i)) return null;
  if (!U.naval && isWater(G, u.i)) return null; // no fighting from a boat
  if (ter(G, i) === 'mountain' && !(u.owner >= 0 && G.players[u.owner].techs.t_qinggong)) return null;
  return 'melee';
}
// expected result without dice
export function predict(G, u, i) {
  const kind = canAttackTile(G, u, i);
  if (!kind) return null;
  const d = defenderAt(G, u.owner, i);
  const ranged = kind === 'ranged';
  if (d.kind === 'unit') {
    const sa = combatStr(G, u, true, ranged, d.u, i, false);
    const sd = combatStr(G, d.u, false, ranged && false, u, i, false);
    return { kind, d, sa, sd, toDef: damage(sa, sd, 1), toAtt: ranged ? 0 : damage(sd, sa, 1) };
  }
  if (d.kind === 'city') {
    const sa = combatStr(G, u, true, ranged, null, i, true);
    const sd = cityStr(G, d.c);
    return { kind, d, sa, sd, toDef: Math.round(damage(sa, sd, 1) * (udef(u).cls === 'siege' ? 1.5 : 1)), toAtt: ranged ? 0 : damage(sd, sa, 1) };
  }
  if (d.kind === 'village') {
    const sa = combatStr(G, u, true, ranged, null, i, true);
    const sd = villageStr(G, d.v);
    return { kind, d, sa, sd, toDef: damage(sa, sd, 1), toAtt: ranged ? 0 : damage(sd, sa, 1) };
  }
  return { kind, d, sa: 1, sd: 0, toDef: 100, toAtt: 0 };
}

// resolve an attack. Returns an event object for the renderer.
export function attack(G, u, i) {
  const pr = predict(G, u, i);
  if (!pr) return null;
  const ev = { a: u.id, at: i, from: u.i, kind: pr.kind, owner: u.owner };
  const r1 = 0.8 + rnd(G) * 0.4, r2 = 0.8 + rnd(G) * 0.4;
  const pA = u.owner >= 0 ? G.players[u.owner] : null;
  const xpMul = pA ? 1 + mods(G, pA).xpPct : 1;
  const d = pr.d;
  u.attacked = 1; u.acted = true; u.fort = 0;
  const melee = pr.kind === 'melee';
  if (melee || !canRanged(G, u)) u.mv = 0; else u.mv = 0;
  if (d.kind === 'civ') {
    // capture or destroy a civilian
    const o = d.u; const oo = o.owner;
    if (o.type === 'u_founder' && u.owner >= 0 && melee) { removeAt(G, o); o.owner = u.owner; o.i = i; addAt(G, o); o.mv = 0; ev.capture = true; }
    else killUnit(G, o);
    if (melee && canEnter(G, u, i, true)) { removeAt(G, u); u.i = i; addAt(G, u); }
    if (oo >= 0 && G.players[oo].human) note(G, oo, `我方的${unitName(G, o)[0]}被擄走了！`, `Our ${unitName(G, o)[1]} was taken!`, i, 'combat');
    ev.def = o.id; ev.killed = true;
    finishFight(G, u, ev);
    return ev;
  }
  if (d.kind === 'unit') {
    const o = d.u;
    const toDef = damage(pr.sa, pr.sd, r1);
    const toAtt = melee ? damage(pr.sd, pr.sa, r2) : 0;
    o.hp -= toDef; ev.def = o.id; ev.dmgD = toDef; ev.dmgA = toAtt;
    if (melee) u.hp -= toAtt;
    gainXp(G, u, (melee ? 5 : 3) * xpMul);
    if (o.owner >= 0) gainXp(G, o, 3 * (1 + mods(G, G.players[o.owner]).xpPct));
    if (o.hp <= 0) {
      ev.killed = true;
      unitDied(G, o, u);
      if (melee && u.hp > 0 && canEnter(G, u, i, true) && !d.city) { removeAt(G, u); u.i = i; addAt(G, u); if (campAt(G, i)) afterEnter(G, u, i); }
    }
    if (u.hp <= 0) { ev.attDied = true; unitDied(G, u, o); }
    if (d.city) { d.city.lastHit = G.turn; }
    finishFight(G, u, ev);
    return ev;
  }
  if (d.kind === 'city') {
    const c = d.c;
    const toDef = Math.round(damage(pr.sa, pr.sd, r1) * (udef(u).cls === 'siege' ? 1.5 : 1));
    const toAtt = melee ? damage(pr.sd, pr.sa, r2) : 0;
    c.hp -= toDef; c.lastHit = G.turn; ev.city = c.id; ev.dmgD = toDef; ev.dmgA = toAtt;
    if (melee) u.hp -= toAtt;
    gainXp(G, u, (melee ? 5 : 3) * xpMul);
    if (u.hp <= 0) { ev.attDied = true; unitDied(G, u, null); }
    if (c.hp <= 0) {
      c.hp = 0;
      if (melee && !u.dead && udef(u).cls !== 'siege') { captureCity(G, c, u); ev.captured = true; }
    }
    finishFight(G, u, ev);
    return ev;
  }
  if (d.kind === 'village') {
    const v = d.v;
    const toDef = damage(pr.sa, pr.sd, r1);
    const toAtt = melee ? damage(pr.sd, pr.sa, r2) : 0;
    v.hp -= toDef; ev.village = v.id; ev.dmgD = toDef; ev.dmgA = toAtt;
    if (melee) u.hp -= toAtt;
    if (u.hp <= 0) { ev.attDied = true; unitDied(G, u, null); }
    if (v.hp <= 0 && melee && !u.dead) { takeVillage(G, v, u); ev.captured = true; }
    finishFight(G, u, ev);
    return ev;
  }
  return null;
}
function finishFight(G, u, ev) {
  if (G.hooks && G.hooks.onCombat) G.hooks.onCombat(ev);
  for (const p of G.players) if (p.alive && G._vis[p.id][ev.at]) { /* seen */ }
  if (u.owner >= 0 && !u.dead) updateVis(G, u.owner);
}
export function unitName(G, u) {
  if (u.hero) return heroDef(G, u.hero).n;
  if (u.gp) return u.name;
  return udef(u).n;
}
function gainXp(G, u, n) {
  if (u.dead || u.owner < 0) return;
  if (u.hero && heroDef(G, u.hero).xpX) n *= heroDef(G, u.hero).xpX;
  u.xp += Math.round(n);
  if (checkLevel(G, u) && u.owner >= 0 && G.players[u.owner].human) note(G, u.owner, `${unitName(G, u)[0]}可以晉升了。`, `${unitName(G, u)[1]} can be promoted.`, u.i, 'promo');
}
function unitDied(G, o, killer) {
  const ko = killer ? killer.owner : -1;
  if (o.owner >= 0) {
    G.players[o.owner].stats.lost++;
    if (G.players[o.owner].human) note(G, o.owner, `我方的${unitName(G, o)[0]}陣亡了。`, `Our ${unitName(G, o)[1]} fell.`, o.i, 'combat');
  }
  if (ko >= 0) {
    const P = G.players[ko];
    P.stats.kills++;
    const m = mods(G, P);
    const ostr = baseStr(G, o, false);
    if (m.killRenown) { let r = ostr; if (killer.hero && heroDef(G, killer.hero).boast) r *= 2; P.renown += r; P.life += r; }
    else if (killer.hero && heroDef(G, killer.hero).boast) { P.renown += ostr; P.life += ostr; }
    // grievance: killing their people
    if (o.owner >= 0) addGriev(G, o.owner, ko, 1);
    if (P.human) note(G, ko, `擊敗了${unitName(G, o)[0]}。`, `Defeated ${unitName(G, o)[1]}.`, o.i, 'combat');
    // the Beastbinders tame what they beat
    if (udef(o).cls === 'beast' && m.tame && rnd(G) < m.tame * 0.6) {
      const t = o.type; const at = o.i;
      killUnit(G, o);
      const nu = spawnNear(G, ko, t, at);
      if (nu && P.human) note(G, ko, `收服了${UNITS[t].n[0]}！`, `Tamed ${UNITS[t].n[1]}!`, at, 'unit');
      afterKill(G, killer);
      return;
    }
  }
  killUnit(G, o);
  if (killer) afterKill(G, killer);
}
function afterKill(G, killer) {
  if (killer.dead || killer.owner < 0) return;
  const m = mods(G, G.players[killer.owner]);
  // 九斬不留: one more strike
  const U = udef(killer);
  if (m.secondStrike && !killer.extraUsed && (U.cls === 'melee' || U.cls === 'anti' || killer.hero)) { killer.extraUsed = G.turn; killer.attacked = 0; killer.mv = Math.max(killer.mv, 1); }
}
export function addGriev(G, victim, offender, n) {
  if (victim < 0 || offender < 0) return;
  const V = G.players[victim];
  const mul = mods(G, V).grievX || 1;
  V.griev[offender] = (V.griev[offender] || 0) + n * mul;
}

export function captureCity(G, c, u) {
  const old = c.owner, pid = u.owner, P = G.players[pid];
  const oldP = old >= 0 ? G.players[old] : null;
  // garrison and civilians on the tile die
  for (const o of unitsAt(G, c.i).slice()) if (o.owner !== pid) killUnit(G, o);
  c.owner = pid;
  if (!mods(G, P).keepPop) c.pop = Math.max(1, c.pop - 1);
  c.hp = Math.round(cityMaxHp(c) * 0.3);
  c.build = null; c.queue = []; c.prod = 0; c.lastHit = G.turn;
  // walls are broken in the fighting
  c.blds = c.blds.filter((b) => !BUILDINGS[b].def || rnd(G) < 0.5);
  if (c.capital && old >= 0) { c.capital = false; if (oldP.capital === c.id) { oldP.capital = -1; const nc = G.cities.find((x) => x.owner === old && x !== c); if (nc) { nc.capital = true; oldP.capital = nc.id; } } }
  // our former home seat comes back
  if (c.origCap === pid) { c.capital = true; const cur = cityById(G, P.capital); if (cur && cur !== c) cur.capital = false; P.capital = c.id; }
  removeAt(G, u); u.i = c.i; addAt(G, u);
  for (const j of cityTiles(G, c)) { /* tiles stay with the city */ }
  P.stats.taken++;
  G.stats.captures++;
  // grievances (休兵令 B removes them)
  if (old >= 0 && !G.congress.active.some((r) => r.id === 'r_truce' && r.opt === 'b')) {
    addGriev(G, old, pid, c.origCap === old ? 25 : 12);
  }
  // wonders change hands with the city
  for (const wid of Object.keys(G.wonders)) if (G.wonders[wid].city === c.id) G.wonders[wid].owner = pid;
  // escort routes through it end
  for (const p of G.players) p.routes = p.routes.filter((r) => r.from !== c.id || p.id === pid);
  refreshMods(G, P); if (oldP) refreshMods(G, oldP);
  assignWork(G, c);
  note(G, -2, `${sectName(G, pid)[0]}攻下了${c.name[0]}！`, `${sectName(G, pid)[1]} captured ${c.name[1]}!`, c.i, 'capture');
  if (oldP && oldP.human) note(G, old, `${c.name[0]}失守了！`, `${c.name[1]} has fallen!`, c.i, 'capture');
  updateVis(G, pid); if (old >= 0) updateVis(G, old);
  if (oldP) checkElimination(G, oldP);
}
export function checkElimination(G, p) {
  if (!p.alive) return;
  const cities = G.cities.some((c) => c.owner === p.id);
  const founders = G.units.some((u) => u.owner === p.id && u.type === 'u_founder');
  if (!cities && (!founders || G.turn > 3)) {
    p.alive = false; p.eliminated = G.turn;
    for (const u of G.units.slice()) if (u.owner === p.id) killUnit(G, u);
    for (const o of G.players) { delete o.rel[p.id]; }
    note(G, -2, `${sectName(G, p.id)[0]}從江湖上消失了。`, `${sectName(G, p.id)[1]} has vanished from the jianghu.`, -1, 'world');
  }
}
function takeVillage(G, v, u) {
  const pid = u.owner, P = G.players[pid];
  v.alive = false; G._vat[v.i] = -1;
  const c = foundCity(G, pid, v.i, null);
  c.name = v.name; c.pop = 2; c.founded = G.turn;
  P.cityNames--; // the village keeps its own name
  removeAt(G, u); u.i = v.i; addAt(G, u);
  // the jianghu frowns on bullying villagers
  for (const o of G.players) if (o.alive && o.id !== pid) addGriev(G, o.id, pid, 6);
  note(G, -2, `${sectName(G, pid)[0]}吞併了村寨${v.name[0]}。`, `${sectName(G, pid)[1]} annexed the village of ${v.name[1]}.`, v.i, 'capture');
  refreshMods(G, P);
}

// city ranged strike
export function canCityStrike(G, c) {
  if (c.struck || c.hp <= 0) return false;
  return c.capital || c.blds.some((b) => BUILDINGS[b].def);
}
export function cityTargets(G, c) {
  if (!canCityStrike(G, c)) return [];
  const out = [];
  for (const j of within(G.map.w, G.map.h, c.i, 2)) {
    if (j === c.i) continue;
    for (const o of unitsAt(G, j)) if (isMilitary(udef(o)) && hostileUnit(G, c.owner, o) === true) { out.push(j); break; }
  }
  return out;
}
export function cityStrike(G, c, i) {
  if (!cityTargets(G, c).includes(i)) return null;
  const d = defenderAt(G, c.owner, i);
  if (!d || d.kind !== 'unit' && d.kind !== 'civ') return null;
  const o = d.u;
  let sa = cityStr(G, c);
  for (const b of c.blds) sa += BUILDINGS[b].cityRanged || 0;
  const sd = combatStr(G, o, false, true, null, i, false);
  const dmg = damage(sa, sd, 0.8 + rnd(G) * 0.4);
  o.hp -= dmg; c.struck = true;
  const ev = { cityA: c.id, at: i, from: c.i, kind: 'ranged', def: o.id, dmgD: dmg, owner: c.owner };
  if (o.hp <= 0) { ev.killed = true; unitDied(G, o, null); if (c.owner >= 0) G.players[c.owner].stats.kills++; }
  if (G.hooks && G.hooks.onCombat) G.hooks.onCombat(ev);
  return ev;
}

// ------------------------------------------------------------------ promotions, upgrades, orders
export function promoOptions(G, u) {
  const cls = u.hero ? 'hero' : udef(u).cls;
  return Object.keys(PROMOS).filter((k) => PROMOS[k].cls.includes(cls) && !u.promos.includes(k));
}
export function promote(G, u, k) {
  if (!u.pend || !promoOptions(G, u).includes(k)) return false;
  u.promos.push(k); u.pend--;
  if (u.hero) u.hlvl = (u.hlvl || 0) + 0;
  u.hp = Math.min(100, u.hp + 25);
  return true;
}
export function upgradeTarget(G, u) {
  const U = udef(u);
  if (!U.up || u.owner < 0) return null;
  const p = G.players[u.owner];
  let t = U.up;
  // the sect's own version if it has one
  const S = SECTS[p.sect];
  if (S.uu && UNITS[S.uu].rep === t) t = S.uu;
  const T = UNITS[t];
  if (T.tech && !p.techs[T.tech]) return null;
  if (T.res && !(p.sect === 'yuyao' && t === 'u_yy_tiger')) { const { hasResource } = CORE; if (!hasResource(G, p, T.res)) return null; }
  return t;
}
import * as CORE from './core.js?v=1';
export function upgradeCost(G, u, t) { return Math.round(((UNITS[t].cost - udef(u).cost) * 1.6 + 15) * costMul(G)); }
export function upgradeUnit(G, u) {
  const t = upgradeTarget(G, u); if (!t) return false;
  const p = G.players[u.owner];
  if (tileOwner(G, u.i) !== u.owner) return false;
  const cost = upgradeCost(G, u, t);
  if (p.gold < cost) return false;
  p.gold -= cost; u.type = t; u.mv = 0; u.hp = Math.max(u.hp, 60);
  return true;
}
export function fortify(G, u) { u.order = { k: 'fort' }; u.mv = 0; }
export function sleep(G, u) { u.order = { k: 'sleep' }; }

// ------------------------------------------------------------------ great people
export function canActivateGP(G, u) {
  if (!u.gp || u.owner < 0) return false;
  return tileOwner(G, u.i) === u.owner;
}
export function nearestOwnCity(G, pid, i) {
  let best = null, bd = 1e9;
  for (const c of G.cities) if (c.owner === pid) { const d = dist(G.map.w, c.i, i); if (d < bd) { bd = d; best = c; } }
  return best;
}
export function activateGP(G, u) {
  if (!canActivateGP(G, u)) return false;
  const p = G.players[u.owner];
  const c = nearestOwnCity(G, p.id, u.i);
  const nm = u.name;
  switch (u.gp) {
    case 'zs': {
      const amt = Math.max(40 * costMul(G), (p.lastY ? p.lastY.s : 5) * 8);
      if (p.tech) { p.tprog[p.tech] = (p.tprog[p.tech] || 0) + amt; if (p.tprog[p.tech] >= techCost(G, p, p.tech)) learnTech(G, p, p.tech); }
      else p._idleS = (p._idleS || 0) + amt;
      note(G, p.id, `${nm[0]}傳授武學，武學 +${Math.round(amt)}。`, `${nm[1]} taught the sect: +${Math.round(amt)} insight.`, u.i, 'gp');
      break;
    }
    case 'sy': {
      for (const o of G.units) if (o.owner === p.id) o.hp = 100;
      if (c) c.permFood += 3;
      note(G, p.id, `${nm[0]}妙手回春：所有部隊回滿，${c ? c.name[0] : ''}永久 +3 糧。`, `${nm[1]} healed every unit; ${c ? c.name[1] : ''} gains +3 food for good.`, u.i, 'gp');
      break;
    }
    case 'mj': {
      if (!c) return false;
      let target = c;
      if (!target.build) { const o = G.cities.find((x) => x.owner === p.id && x.build && x.build.k === 'w'); if (o) target = o; }
      if (!target.build) return false;
      const k = target.build.k === 'p' ? 0.25 : 0.5;
      target.prod += itemCost(G, target, target.build) * k;
      note(G, p.id, `${nm[0]}巧奪天工，${target.name[0]}的生產大有進展。`, `${nm[1]} lent a hand: ${target.name[1]}'s build leaps forward.`, target.i, 'gp');
      break;
    }
    case 'ss': {
      p.tales++; p.renown += 60; p.life += 60;
      note(G, p.id, `${nm[0]}寫下一部傳奇，從此每回合 +3 傳奇。`, `${nm[1]} wrote a legend: +3 legend every turn from now on.`, u.i, 'gp');
      break;
    }
  }
  killUnit(G, u);
  return true;
}

// ------------------------------------------------------------------ heroes
export function heroCost(G, p) { return Math.round((55 + 45 * p.era + 25 * p.recruits) * costMul(G)); }
export function availableHeroes(G) { return Object.keys(G.heroes).filter((h) => G.heroes[h].by < 0 && G.heroes[h].avail <= G.turn); }
export function recruitHero(G, p, hid) {
  const H = G.heroes[hid];
  if (!H || H.by >= 0 || H.avail > G.turn) return null;
  const cost = heroCost(G, p);
  if (p.renown < cost) return null;
  const cap = cityById(G, p.capital); if (!cap) return null;
  const u = spawnNear(G, p.id, 'hero', cap.i, { hero: hid });
  if (!u) return null;
  p.renown -= cost; p.recruits++;
  H.by = p.id;
  u.lvl = 1 + p.era; u.xp = [0, 15, 35, 65, 105, 160][Math.min(5, u.lvl - 1)] || 0;
  u.mv = maxMoves(G, u);
  const D = heroDef(G, hid);
  note(G, p.human ? p.id : -2, `${D.n[0]}加入了${sectName(G, p.id)[0]}。`, `${D.n[1]} joined ${sectName(G, p.id)[1]}.`, u.i, 'hero');
  return u;
}

// ------------------------------------------------------------------ escort routes
export function routeCap(G, p) {
  let n = 1 + mods(G, p).routes;
  for (const c of G.cities) if (c.owner === p.id) for (const b of c.blds) n += BUILDINGS[b].routes || 0;
  return n;
}
export function routeTargets(G, u) {
  const p = G.players[u.owner];
  const home = cityById(G, u.home) || nearestOwnCity(G, p.id, u.i);
  if (!home) return [];
  const out = [];
  for (const c of G.cities) {
    if (c.id === home.id) continue;
    if (c.owner !== p.id && (p.rel[c.owner] === 'war' || p.met[c.owner] === undefined)) continue;
    const d = dist(G.map.w, home.i, c.i);
    if (d > 16) continue;
    if (p.routes.some((r) => r.from === home.id && r.to === c.id)) continue;
    out.push({ c, d, g: routeGold(G, u, home, c) });
  }
  return out.sort((a, b) => b.g - a.g);
}
export function routeGold(G, u, home, c) {
  const p = G.players[u.owner];
  let g = 2 + Math.floor(dist(G.map.w, home.i, c.i) / 3) + (c.owner !== p.id ? 2 : 0) + (udef(u).routeG || 0);
  if (hasBld(c, 'b_market')) g += 1;
  return g;
}
export function canEstablish(G, u, c) {
  if (udef(u).cls !== 'trade') return false;
  const p = G.players[u.owner];
  if (p.routes.length >= routeCap(G, p)) return false;
  if (dist(G.map.w, u.i, c.i) > 1) return false;
  return routeTargets(G, u).some((t) => t.c.id === c.id);
}
export function establishRoute(G, u, c) {
  if (!canEstablish(G, u, c)) return false;
  const p = G.players[u.owner];
  const home = cityById(G, u.home) || nearestOwnCity(G, p.id, u.i);
  const g = routeGold(G, u, home, c);
  p.routes.push({ from: home.id, to: c.id, until: G.turn + G_routeLen(G), g });
  // a road along the way
  const tmp = { ...u, i: home.i, mv: 9, owner: u.owner, type: 'u_caravan', promos: [] };
  const path = findPathRaw(G, tmp, c.i);
  if (path) for (const j of path) if (!isWater(G, j)) G.map.road[j] = 1;
  G.map.road[c.i] = 1;
  if (c.owner !== p.id && c.owner >= 0) { G.players[c.owner].griev[p.id] = Math.max(0, (G.players[c.owner].griev[p.id] || 0) - 2); }
  if (p.human) note(G, p.id, `開出一條鏢路：${home.name[0]} → ${c.name[0]}，每回合 +${g} 銀。`, `Opened an escort route ${home.name[1]} -> ${c.name[1]}: +${g} silver a turn.`, c.i, 'trade');
  killUnit(G, u);
  return true;
}
function G_routeLen(G) { return CORE.speed(G).route; }
function findPathRaw(G, u, target) {
  // a pathfinder that ignores units (for roads)
  const save = G._uat; G._uat = new Map();
  let r = null;
  try { r = findPath(G, u, target, { max: 3000 }); } finally { G._uat = save; }
  return r ? r.path : null;
}

// ------------------------------------------------------------------ envoys and villages
export function sendEnvoy(G, p, v) {
  if (p.envoys <= 0 || !v.alive) return false;
  p.envoys--;
  v.env[p.id] = (v.env[p.id] || 0) + 1;
  updateSuz(G, v);
  return true;
}
export function updateSuz(G, v) {
  let best = -1, bn = 2, tie = false;
  for (const k of Object.keys(v.env)) { const n = v.env[k]; if (n > bn) { bn = n; best = +k; tie = false; } else if (n === bn && n >= 3) tie = true; }
  if (tie) best = v.suz >= 0 && v.env[v.suz] === bn ? v.suz : -1;
  if (best !== v.suz) {
    const old = v.suz; v.suz = best;
    if (best >= 0) note(G, -2, `${sectName(G, best)[0]}成了${v.name[0]}的盟主。`, `${sectName(G, best)[1]} became patron of ${v.name[1]}.`, v.i, 'diplo');
    if (best >= 0) refreshMods(G, G.players[best]);
    if (old >= 0 && G.players[old]) refreshMods(G, G.players[old]);
  }
}
export function envoyTier(v, pid) { const n = v.env[pid] || 0; return ENVOY_TIERS.filter((t) => n >= t).length; }

// ------------------------------------------------------------------ founding (unit action)
export function canSettle(G, u) { return u.type === 'u_founder' && u.mv > 0 && canFound(G, u.i, u.owner); }
export function settle(G, u) { if (!canSettle(G, u)) return null; return foundCity(G, u.owner, u.i, u); }
