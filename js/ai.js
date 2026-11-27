// Computer sects. They play by the same rules as the human (difficulty bonuses are only the yield
// percentages listed in the setup screen). Personality comes from each leader (data.js SECTS[..].pers).
import { SECTS, UNITS, BUILDINGS, WONDERS, PROJECTS, TECHS, CIVICS, GOVS, POLICIES, VILLAGE_KINDS, DIFFICULTY, PROMOS } from './data.js?v=4';
import {
  mods, udef, isMilitary, unitsAt, cityAt, villageAt, campAt, tileOwner, cityById, buildOptions, setBuild, itemCost, itemRate, cityYield,
  buyCost, buyItem, availableTechs, availableCivics, techCost, civicCost, unlockedGovs, unlockedPolicies, setGov, setPolicies,
  canFound, tileYield, isLandPassable, terDef, resOf, cityTiles, isWater, maxMoves, hasBld, costMul, cityCoastal, alivePlayers, ter, eraOf,
} from './core.js?v=4';
import {
  findPath, moveAlong, attack, canAttackTile, predict, hostileUnit, atWar, canRanged, rangeOf, settle, canSettle, activateGP, canActivateGP,
  nearestOwnCity, routeTargets, establishRoute, routeCap, recruitHero, availableHeroes, heroCost, sendEnvoy, promoOptions, promote,
  upgradeTarget, upgradeCost, upgradeUnit, cityTargets, cityStrike, baseStr, stepUnit, canEnter, inZOC, cityStr,
} from './units.js?v=4';
import { declareWar, makePeace, makeAlliance, makePact, canAlly, canPact, aiConsider, attitude, militaryPower, treatyAge, canDeclareWar, score, denounce } from './world.js?v=4';
import { within, dist } from './hex.js?v=4';
import { rnd, rint } from './rng.js?v=4';

export function aiTurn(G, pid) {
  const p = G.players[pid];
  if (!p.alive) return;
  const ctx = analyze(G, p);
  safe(G, () => diplomacy(G, p, ctx));
  safe(G, () => research(G, p));
  safe(G, () => rules(G, p));
  safe(G, () => envoysAndHeroes(G, p, ctx));
  // units: specialists first, then the army
  const units = G.units.filter((u) => u.owner === pid);
  for (const u of units) if (!u.dead && u.pend) safe(G, () => autoPromote(G, u));
  for (const u of units) if (!u.dead && u.gp) safe(G, () => gpAct(G, p, u));
  for (const u of units) if (!u.dead && u.type === 'u_founder') safe(G, () => founderAct(G, p, u, ctx));
  for (const u of units) if (!u.dead && udef(u).cls === 'trade') safe(G, () => caravanAct(G, p, u));
  for (const u of units) if (!u.dead && udef(u).cls === 'recon') safe(G, () => scoutAct(G, p, u, ctx));
  const army = units.filter((u) => !u.dead && isMilitary(udef(u)) && udef(u).cls !== 'recon');
  army.sort((a, b) => (canRanged(G, b) ? 1 : 0) - (canRanged(G, a) ? 1 : 0));
  assignRoles(G, p, army, ctx);
  for (const u of army) if (!u.dead) safe(G, () => militaryAct(G, p, u, ctx));
  for (const c of G.cities.filter((c) => c.owner === pid)) safe(G, () => cityAct(G, p, c, ctx));
  safe(G, () => { for (const c of G.cities) if (c.owner === pid) { const ts = cityTargets(G, c); if (ts.length) cityStrike(G, c, ts[0]); } });
  safe(G, () => upgrades(G, p));
}
function safe(G, f) {
  try { f(); } catch (e) { if (G.strict) throw e; if (typeof console !== 'undefined') console.error('AI', e); }
}

// ------------------------------------------------------------------ situation
function analyze(G, p) {
  const W = G.map.w;
  const myCities = G.cities.filter((c) => c.owner === p.id);
  const vis = G._vis[p.id];
  const enemies = alivePlayers(G).filter((o) => o.id !== p.id && p.rel[o.id] === 'war').map((o) => o.id);
  const threats = new Map();
  for (const c of myCities) {
    let t = 0;
    for (const j of within(W, G.map.h, c.i, 4)) if (vis[j]) for (const o of unitsAt(G, j)) if (isMilitary(udef(o)) && hostileUnit(G, p.id, o) === true) t += Math.max(udef(o).str, udef(o).rstr || 0) * (o.hp / 100);
    threats.set(c.id, t);
  }
  const mil = G.units.filter((u) => u.owner === p.id && isMilitary(udef(u)) && udef(u).cls !== 'recon');
  // war target: a known enemy city near our army, weak ones and home seats first; keep it until it falls
  let target = null;
  p.ai.plan = p.ai.plan || { t: -1, state: 'gather', since: G.turn, stage: -1 };
  const plan = p.ai.plan;
  if (enemies.length && myCities.length) {
    const cur = plan.t >= 0 ? cityById(G, plan.t) : null;
    if (cur && enemies.includes(cur.owner) && G.turn - plan.since < 40) target = cur;
    else {
      const cap = cityById(G, p.capital) || myCities[0];
      let cx = cap.i;
      let best = 1e9;
      for (const c of G.cities) {
        if (!enemies.includes(c.owner) || !p.exp[c.i]) continue;
        const d = dist(W, cx, c.i) + cityStr(G, c) * 0.15 - (c.hp < 100 ? 4 : 0) - (c.origCap >= 0 ? 2 : 0);
        if (d < best) { best = d; target = c; }
      }
      if (target) {
        plan.t = target.id; plan.state = 'gather'; plan.since = G.turn;
        // staging ground: 4 tiles out, on the side facing home
        let st = -1, sd = 1e9;
        for (const j of within(W, G.map.h, target.i, 4)) if (dist(W, j, target.i) === 4 && isLandPassable(G, j)) { const dd = dist(W, j, cap.i); if (dd < sd) { sd = dd; st = j; } }
        plan.stage = st;
      }
    }
    if (target && plan.state === 'gather') {
      const att = mil.filter((u) => !cityAt(G, u.i) || cityAt(G, u.i).owner !== p.id);
      const near = att.filter((u) => dist(W, u.i, target.i) <= 6).length;
      if (near >= Math.max(3, Math.ceil(mil.length * 0.45)) || G.turn - plan.since > 10) plan.state = 'assault';
    }
  } else { plan.t = -1; }
  return { myCities, enemies, threats, mil, target, plan, P: SECTS[p.sect].pers, era: p.era };
}

// ------------------------------------------------------------------ diplomacy
function diplomacy(G, p, ctx) {
  const P = ctx.P;
  const others = alivePlayers(G).filter((o) => o.id !== p.id && p.met[o.id] !== undefined);
  const myPow = militaryPower(G, p.id);
  p.ai.warCool = (p.ai.warCool || 0) - 1;
  for (const o of others) {
    const rel = p.rel[o.id];
    const at = attitude(G, p.id, o.id).v;
    if (rel === 'war') {
      const ratio = (myPow + 1) / (militaryPower(G, o.id) + 1);
      const age = treatyAge(G, p.id, o.id);
      const winning = G.cities.some((c) => c.owner === p.id && c.origOwner === o.id);
      const wantPeace = age >= 8 && (ratio < 0.7 || (age > 26 + P.aggr * 35 && !winning) || (p.ai.lostRecently || 0) > 3);
      if (wantPeace && (p.ai.peaceAsk || 0) <= G.turn) {
        p.ai.peaceAsk = G.turn + 5;
        if (o.human) proposeToHuman(G, p.id, o.id, 'peace');
        else { const [yes] = aiConsider(G, o.id, p.id, 'peace'); if (yes) makePeace(G, p.id, o.id); }
      }
      continue;
    }
    if (rel === 'peace' && canAlly(G, p.id, o.id) && at >= 40 && !o.human) {
      const [yes] = aiConsider(G, o.id, p.id, 'ally');
      if (yes) makeAlliance(G, p.id, o.id);
    } else if (rel === 'peace' && canAlly(G, p.id, o.id) && at >= 45 && o.human && !(p.ai.asked && p.ai.asked['ally' + o.id] > G.turn)) {
      p.ai.asked = p.ai.asked || {}; p.ai.asked['ally' + o.id] = G.turn + 25;
      proposeToHuman(G, p.id, o.id, 'ally');
    }
    if (canPact(G, p.id, o.id) && at >= 10 && p.civics.c_road) {
      if (!o.human) { const [yes] = aiConsider(G, o.id, p.id, 'pact'); if (yes) makePact(G, p.id, o.id); }
      else if (!(p.ai.asked && p.ai.asked['pact' + o.id] > G.turn)) { p.ai.asked = p.ai.asked || {}; p.ai.asked['pact' + o.id] = G.turn + 20; proposeToHuman(G, p.id, o.id, 'pact'); }
    }
    if (at < -45 && rnd(G) < 0.04 && !((p.ai.denounced || {})[o.id] > G.turn - 30)) denounce(G, p.id, o.id);
  }
  // starting a war
  if ((ctx.enemies.length && !(P.aggr > 0.75 && ctx.enemies.length < 2 && militaryPower(G, p.id) > 1.8 * Math.max(...ctx.enemies.map((e) => militaryPower(G, e))))) || p.ai.warCool > 0 || !ctx.myCities.length) return;
  const early = G.turn < G.limit * (0.12 + (1 - P.aggr) * 0.15);
  if (early) return;
  let best = null, bv = 0;
  const cap = cityById(G, p.capital) || ctx.myCities[0];
  for (const o of others) {
    if (!canDeclareWar(G, p.id, o.id) || p.rel[o.id] === 'ally') continue;
    if (treatyAge(G, p.id, o.id) < 12) continue;
    const theirCities = G.cities.filter((c) => c.owner === o.id && p.exp[c.i]);
    if (!theirCities.length) continue;
    const near = Math.min(...theirCities.map((c) => dist(G.map.w, cap.i, c.i)));
    if (near > 16) continue;
    const ratio = (myPow + 1) / (militaryPower(G, o.id) + 1);
    const at = attitude(G, p.id, o.id).v;
    let want = P.aggr * 1.5 + (at < -10 ? 0.35 : 0) + (at < -35 ? 0.3 : 0) - (at > 30 ? 0.6 : 0) + (ratio - 1.3) * 0.8 - near / 30;
    // runaway leaders draw fire
    if (score(G, o.id) > score(G, p.id) * 1.25) want += 0.3;
    if (o.proj >= 1 || o.dip >= 6) want += 0.5;
    if (want > bv) { bv = want; best = o; }
  }
  if (best && bv > 0.9 && rnd(G) < 0.3) {
    declareWar(G, p.id, best.id);
    p.ai.warCool = 25;
  }
}
function proposeToHuman(G, from, to, what) {
  G.proposals = G.proposals || [];
  if (G.proposals.some((q) => q.from === from && q.what === what)) return;
  G.proposals.push({ from, to, what, turn: G.turn });
}

// ------------------------------------------------------------------ research and rules
const TECH_W = {
  t_stance: 1.3, t_farm: 1.5, t_mine: 1.2, t_archery: 1.0, t_breath: 1.4, t_barter: 1.1, t_herb: 0.9,
  t_saber: 1.0, t_iron: 1.1, t_sword: 1.0, t_horse: 0.8, t_boat: 0.7, t_trade: 1.1, t_hidden: 0.9, t_alchemy: 1.0, t_fort: 1.0,
  t_inner: 1.2, t_spear: 0.9, t_mech: 1.1, t_qinggong: 0.8, t_medic: 1.0, t_bank: 1.1, t_ships: 0.6, t_poison: 0.8,
  t_swordform: 1.0, t_crossbow: 1.0, t_ironcav: 0.8, t_powder: 1.0, t_cycle: 1.2, t_greattrade: 0.9, t_simple: 1.0, t_allstreams: 1.0, t_heaven: 1.5,
};
const MIL_TECH = new Set(['t_stance', 't_archery', 't_saber', 't_sword', 't_horse', 't_hidden', 't_fort', 't_spear', 't_mech', 't_inner', 't_swordform', 't_crossbow', 't_ironcav', 't_powder', 't_simple', 't_poison']);
function research(G, p) {
  if (p.tech) return;
  const av = availableTechs(p);
  if (!av.length) return;
  const P = SECTS[p.sect].pers;
  const war = alivePlayers(G).some((o) => p.rel[o.id] === 'war');
  let best = av[0], bv = -1;
  for (const t of av) {
    let v = (TECH_W[t] || 1) / Math.sqrt(techCost(G, p, t));
    v *= 1 + (4 - TECHS[t].era) * 0.12;
    if (MIL_TECH.has(t)) v *= 1 + P.aggr * 0.5 + (war ? 0.4 : 0);
    if (!MIL_TECH.has(t)) v *= 1 + P.sci * 0.3;
    v *= 0.9 + rnd(G) * 0.2;
    if (v > bv) { bv = v; best = t; }
  }
  p.tech = best;
}
function rules(G, p) {
  const P = SECTS[p.sect].pers;
  if (!p.civic) {
    const av = availableCivics(p);
    let best = null, bv = -1;
    for (const c of av) {
      let v = 1 / Math.sqrt(civicCost(G, p, c)) * (1 + (4 - CIVICS[c].era) * 0.15);
      if (CIVICS[c].gov) v *= 1.6;
      if (c === 'c_sworn' || c === 'c_invite' || c === 'c_peace') v *= 1 + P.diplo * 0.6;
      if (c === 'c_tales' || c === 'c_chivalry' || c === 'c_eternal') v *= 1 + P.cult * 0.6;
      if (c === 'c_first' || c === 'c_unify' || c === 'c_precepts') v *= 1 + P.aggr * 0.6;
      v *= 0.9 + rnd(G) * 0.2;
      if (v > bv) { bv = v; best = c; }
    }
    p.civic = best;
  }
  // government
  const govs = unlockedGovs(p);
  let g = p.gov;
  const pref = (id) => {
    if (id === 'g_hegemony') return P.aggr * 3;
    if (id === 'g_orthodox') return 1.6 + P.sci + P.diplo;
    if (id === 'g_martial') return 1 + P.aggr * 1.5;
    if (id === 'g_merchant') return 1 + (1 - P.aggr) * 0.8 + P.diplo * 0.4;
    if (id === 'g_virtue') return 1 + P.cult * 1.4;
    return 0;
  };
  for (const id of govs) if (pref(id) > pref(g)) g = id;
  if (g !== p.gov) setGov(G, p, g);
  // policies: score every unlocked card, fill slots
  const un = unlockedPolicies(p);
  const war = alivePlayers(G).some((o) => p.rel[o.id] === 'war');
  const nC = G.cities.filter((c) => c.owner === p.id).length;
  const val = (id) => {
    switch (id) {
      case 'p_patrol': return 1 + (war ? 0 : 0.5);
      case 'p_drill': return 1 + P.aggr + (war ? 1 : 0);
      case 'p_settle': return nC < 4 + P.expand * 4 ? 2.5 : 0.2;
      case 'p_market': return 0.5 + nC * 0.25;
      case 'p_frugal': return 1.5;
      case 'p_recruit': return 1.4;
      case 'p_chivalry': return 0.6 + nC * 0.3 * (0.5 + P.cult);
      case 'p_brothers': return 0.8 + P.diplo;
      case 'p_envoy': return 0.5 + G.villages.filter((v) => v.alive && (v.env[p.id] || 0) > 0).length * 0.4;
      case 'p_garrison': return war ? 2 : 0.7;
      case 'p_scouting': return 1.2;
      case 'p_guild': return 1.6;
      case 'p_caravan': return p.routes.length * 0.8;
      case 'p_vigil': return 1.2 + (war ? 1.2 : 0);
      case 'p_scholar': return 1.6 + P.sci;
      case 'p_academy': return 2.2;
      case 'p_tales': return 1 + P.cult * 2;
      case 'p_first': return 1.5 + P.aggr + (war ? 1 : 0);
      case 'p_siege': return war ? 2.5 * P.aggr + 0.5 : 0.3;
      case 'p_eternal': return 3;
      case 'p_peace': return 1.5 + P.cult + P.diplo;
    }
    return 1;
  };
  const sorted = un.slice().sort((a, b) => val(b) - val(a));
  const sl = GOVS[p.gov].slots;
  const pol = { w: [], m: [], v: [], a: [] };
  const used = new Set();
  for (const k of ['w', 'm', 'v']) for (const id of sorted) if (POLICIES[id].slot === k && pol[k].length < sl[k] && !used.has(id)) { pol[k].push(id); used.add(id); }
  for (const id of sorted) if (pol.a.length < sl.a && !used.has(id)) { pol.a.push(id); used.add(id); }
  const same = ['w', 'm', 'v', 'a'].every((k) => (p.pol[k] || []).join() === pol[k].join());
  if (!same) setPolicies(G, p, pol);
}

// ------------------------------------------------------------------ envoys, heroes, great people
function envoysAndHeroes(G, p, ctx) {
  let guard = 10;
  while (p.envoys > 0 && guard-- > 0) {
    let best = null, bv = -1e9;
    const cap = cityById(G, p.capital);
    for (const v of G.villages) {
      if (!v.alive || !p.exp[v.i]) continue;
      const mine = v.env[p.id] || 0;
      let top = 0; for (const k of Object.keys(v.env)) if (+k !== p.id) top = Math.max(top, v.env[k]);
      let val = 1;
      if (mine + 1 === 1 || mine + 1 === 3 || mine + 1 === 6) val += 2;
      if (mine + 1 > top && mine + 1 >= 3) val += 3;
      if (v.suz === p.id && mine > top + 1) val -= 2;
      if (cap) val -= dist(G.map.w, cap.i, v.i) / 20;
      if (val > bv) { bv = val; best = v; }
    }
    if (!best) break;
    sendEnvoy(G, p, best);
  }
  // heroes
  const mine = G.units.filter((u) => u.owner === p.id && u.hero).length;
  if (mine < 1 + Math.floor(p.era / 2) + (ctx.enemies.length ? 1 : 0) && p.renown >= heroCost(G, p)) {
    const av = availableHeroes(G);
    if (av.length) recruitHero(G, p, av[rint(G, av.length)]);
  }
}
function gpAct(G, p, u) {
  if (canActivateGP(G, u)) { activateGP(G, u); return; }
  const c = nearestOwnCity(G, p.id, u.i);
  if (c) { const r = findPath(G, u, c.i); if (r) moveAlong(G, u, r.path); if (canActivateGP(G, u)) activateGP(G, u); }
}
function autoPromote(G, u) {
  const pref = ['pr_charge', 'pr_iron', 'pr_aim', 'pr_heal', 'pr_break', 'pr_qing', 'pr_chain', 'pr_high', 'pr_wood', 'pr_eye'];
  let guard = 5;
  while (u.pend > 0 && guard-- > 0) {
    const opts = promoOptions(G, u);
    const pick = pref.find((k) => opts.includes(k));
    if (!pick) { u.pend = 0; break; }
    promote(G, u, pick);
  }
}

// ------------------------------------------------------------------ founders
function siteValue(G, p, i) {
  if (!canFound(G, i, p.id)) return -1;
  let s = 0;
  for (const j of within(G.map.w, G.map.h, i, 2)) {
    const o = tileOwner(G, j);
    if (o >= 0 && o !== p.id) continue;
    const y = tileYield(G, j, p);
    s += y.f * 1.3 + y.p * 1.1 + y.g * 0.5 + y.s * 0.6 + y.c * 0.5;
    if (resOf(G, j)) s += 1.2;
    if (terDef(G, j).deep) s -= 0.8;
  }
  if (G.map.river[i]) s += 3;
  for (const j of G._nb[i]) if (ter(G, j) === 'coast' || ter(G, j) === 'lake') { s += 1.5; break; }
  const t = ter(G, i); if (t === 'hills') s += 1.5;
  return s;
}
function bestSite(G, p, from, reserved) {
  let best = -1, bv = -1e9;
  const vis = G._vis[p.id];
  for (const j of within(G.map.w, G.map.h, from, 8)) {
    if (!p.exp[j] || reserved.has(j)) continue;
    let danger = false;
    for (const q of within(G.map.w, G.map.h, j, 1)) for (const o of unitsAt(G, q)) if (vis[q] && hostileUnit(G, p.id, o) === true && isMilitary(udef(o))) danger = true;
    if (danger) continue;
    const v = siteValue(G, p, j);
    if (v < 0) continue;
    // stay near home
    let dHome = 99; for (const c of G.cities) if (c.owner === p.id) dHome = Math.min(dHome, dist(G.map.w, c.i, j));
    if (dHome === 99) dHome = 0;
    const score = v - dist(G.map.w, from, j) * 2.2 - Math.max(0, dHome - 5) * 3;
    if (score > bv) { bv = score; best = j; }
  }
  return best;
}
function founderAct(G, p, u, ctx) {
  const reserved = new Set();
  for (const o of G.units) if (o.owner === p.id && o !== u && o.type === 'u_founder' && o.ai && o.ai.site >= 0) reserved.add(o.ai.site);
  u.ai = u.ai || {};
  // the very first city: right here, or one step away at most
  if (!ctx.myCities.length) {
    if (canSettle(G, u)) { settle(G, u); return; }
    for (const j of G._nb[u.i]) if (canFound(G, j, p.id)) { stepUnit(G, u, j); if (canSettle(G, u)) settle(G, u); return; }
  }
  if (u.ai.site === undefined || u.ai.site < 0 || !canFound(G, u.ai.site, p.id) || (u.ai.t || 0) > 12) {
    u.ai.site = bestSite(G, p, u.i, reserved); u.ai.t = 0;
  }
  u.ai.t = (u.ai.t || 0) + 1;
  if (u.ai.site < 0) { const c = nearestOwnCity(G, p.id, u.i); if (c && u.i !== c.i) moveAlong(G, u, (findPath(G, u, c.i) || { path: [] }).path); return; }
  if (u.i === u.ai.site) { settle(G, u); return; }
  const r = findPath(G, u, u.ai.site);
  if (!r) { u.ai.site = -1; return; }
  moveAlong(G, u, r.path);
  if (u.i === u.ai.site && canSettle(G, u)) settle(G, u);
}

// ------------------------------------------------------------------ caravans and scouts
function caravanAct(G, p, u) {
  if (p.routes.length >= routeCap(G, p)) { return; }
  u.ai = u.ai || {};
  let tgt = u.ai.to !== undefined ? cityById(G, u.ai.to) : null;
  if (!tgt) {
    const ts = routeTargets(G, u);
    if (!ts.length) return;
    tgt = ts[0].c; u.ai.to = tgt.id;
  }
  if (dist(G.map.w, u.i, tgt.i) <= 1) { if (!establishRoute(G, u, tgt)) u.ai.to = undefined; return; }
  const r = findPath(G, u, tgt.i, { attack: true });
  if (!r) { u.ai.to = undefined; return; }
  moveAlong(G, u, r.path.slice(0, -1));
  if (!u.dead && dist(G.map.w, u.i, tgt.i) <= 1) establishRoute(G, u, tgt);
}
function scoutAct(G, p, u, ctx) {
  const W = G.map.w, H = G.map.h;
  // retreat when hurt
  if (u.hp < 50) { const c = nearestOwnCity(G, p.id, u.i); if (c) { const r = findPath(G, u, c.i); if (r) moveAlong(G, u, r.path); } return; }
  // nearest frontier tile (explored, passable, next to unexplored)
  let best = -1, bd = 1e9;
  for (const j of within(W, H, u.i, 12)) {
    if (!p.exp[j] || !isLandPassable(G, j) || unitsAt(G, j).length) continue;
    let fr = 0; for (const q of G._nb[j]) if (!p.exp[q]) fr++;
    if (!fr) continue;
    const d = dist(W, u.i, j) - fr * 0.3 + rnd(G) * 1.5;
    if (d < bd) { bd = d; best = j; }
  }
  if (best >= 0) { const r = findPath(G, u, best, { max: 1500 }); if (r) { moveAlong(G, u, r.path); return; } }
  // nothing left to see: guard a city
  const c = nearestOwnCity(G, p.id, u.i);
  if (c && u.i !== c.i) { const r = findPath(G, u, c.i); if (r) moveAlong(G, u, r.path); }
}

// ------------------------------------------------------------------ the army
function assignRoles(G, p, army, ctx) {
  // one garrison per city (two in threatened cities / the capital at war), the rest form the field army
  const need = new Map();
  for (const c of ctx.myCities) {
    let n = 1;
    if ((ctx.threats.get(c.id) || 0) > 15) n = 2;
    if ((ctx.threats.get(c.id) || 0) > 50) n = 3;
    need.set(c.id, n);
  }
  const free = new Set(army);
  for (const u of army) u.role = null;
  // keep the units already sitting in cities as garrison
  for (const u of army) {
    const c = cityAt(G, u.i);
    if (c && c.owner === p.id && need.get(c.id) > 0 && !u.hero) {
      u.role = { k: 'garrison', c: c.id }; need.set(c.id, need.get(c.id) - 1); free.delete(u);
    }
  }
  for (const c of ctx.myCities) {
    let n = need.get(c.id);
    while (n > 0 && free.size) {
      let best = null, bd = 1e9;
      for (const u of free) { if (u.hero) continue; const d = dist(G.map.w, u.i, c.i); if (d < bd) { bd = d; best = u; } }
      if (!best || bd > 10) break;
      best.role = { k: 'garrison', c: c.id }; free.delete(best); n--;
    }
  }
  for (const u of free) u.role = { k: ctx.target ? 'attack' : 'field' };
}
function militaryAct(G, p, u, ctx) {
  const W = G.map.w;
  if (u.mv <= 0) return;
  // embarked units just keep going toward land
  // 1. strike something worthwhile from where we stand or within a short move
  if (tryStrike(G, p, u, ctx)) return;
  // 2. wounded go home
  if (u.hp < 40) {
    const c = nearestOwnCity(G, p.id, u.i);
    if (c) { if (u.i !== c.i && canEnter(G, u, c.i, true)) { const r = findPath(G, u, c.i); if (r) moveAlong(G, u, r.path); } return; }
  }
  const role = u.role || { k: 'field' };
  if (role.k === 'garrison') {
    const c = cityById(G, role.c);
    if (!c) return;
    // defend: hit threats next to the city, otherwise sit tight
    if (u.i !== c.i) {
      if (canEnter(G, u, c.i, true)) { const r = findPath(G, u, c.i); if (r) moveAlong(G, u, r.path); }
      else {
        // city tile full: stand next to it
        const spot = G._nb[c.i].find((j) => canEnter(G, u, j, true) && isLandPassable(G, j));
        if (spot !== undefined && u.i !== spot) { const r = findPath(G, u, spot); if (r) moveAlong(G, u, r.path); }
      }
    }
    tryStrike(G, p, u, ctx);
    return;
  }
  if (role.k === 'attack' && ctx.target) {
    const T = ctx.target;
    const plan = ctx.plan;
    const d = dist(W, u.i, T.i);
    const ranged = canRanged(G, u);
    const rng = ranged ? rangeOf(G, u) : 1;
    if (plan.state === 'gather' && d > 4) {
      // walk to the staging ground and wait for the others
      const goal = plan.stage >= 0 ? plan.stage : T.i;
      if (dist(W, u.i, goal) > 1) {
        let spot = goal;
        if (!canEnter(G, u, goal, true)) spot = within(W, G.map.h, goal, 2).find((j) => canEnter(G, u, j, true) && isLandPassable(G, j)) ?? goal;
        const r = findPath(G, u, spot);
        if (r) moveAlong(G, u, r.path);
      }
      tryStrike(G, p, u, ctx);
      return;
    }
    if (d > rng) {
      // advance: ranged to a tile in range, melee next to the city
      let goal = -1, gd = 1e9;
      for (const j of within(W, G.map.h, T.i, Math.max(1, rng))) {
        const dj = dist(W, j, T.i);
        if (ranged ? dj < 2 : dj !== 1) continue;
        if (!canEnter(G, u, j, true) || isWater(G, j) || ter(G, j) === 'mountain') continue;
        const dd = dist(W, u.i, j) - (terDef(G, j).def || 0) * 0.3;
        if (dd < gd) { gd = dd; goal = j; }
      }
      if (goal < 0) goal = T.i;
      const r = findPath(G, u, goal, { attack: goal === T.i });
      if (r) moveAlong(G, u, goal === T.i ? r.path.slice(0, -1) : r.path);
    }
    tryStrike(G, p, u, ctx, true);
    return;
  }
  // field: clear camps near home, else go stand on the border near the biggest threat or stay home
  const camp = nearestCamp(G, p, u);
  if (camp) {
    const r = findPath(G, u, camp.i, { attack: true });
    if (r) { moveAlong(G, u, r.path.slice(0, -1)); tryStrike(G, p, u, ctx, true); if (!u.dead && u.mv > 0 && dist(W, u.i, camp.i) === 1 && !unitsAt(G, camp.i).length) stepUnit(G, u, camp.i); return; }
  }
  let worst = null, wt = 0;
  for (const c of ctx.myCities) { const t = ctx.threats.get(c.id) || 0; if (t > wt) { wt = t; worst = c; } }
  const home = worst || nearestOwnCity(G, p.id, u.i);
  if (home && dist(W, u.i, home.i) > 2) {
    const spot = within(W, G.map.h, home.i, 2).find((j) => j !== home.i && canEnter(G, u, j, true) && isLandPassable(G, j) && !cityAt(G, j));
    if (spot !== undefined) { const r = findPath(G, u, spot); if (r) moveAlong(G, u, r.path); }
  }
}
function cityMaxHpSafe(c) { let h = 150; for (const b of c.blds) h += BUILDINGS[b].hp || 0; return h; }
function nearestCamp(G, p, u) {
  let best = null, bd = 9;
  const myStr = baseStr(G, u, false);
  if (myStr < 12 + p.era * 4) return null;
  for (const c of G.camps) {
    if (!p.exp[c.i]) continue;
    if (c.kind === 'bandit' && mods(G, p).convertCamp) { /* the Black Wind takes camps by walking in */ }
    const d = dist(G.map.w, u.i, c.i);
    let near = false; for (const cc of G.cities) if (cc.owner === p.id && dist(G.map.w, cc.i, c.i) <= 8) near = true;
    if (!near) continue;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
// look for a good attack within reach this turn; returns true if it attacked
function tryStrike(G, p, u, ctx, aggressive) {
  if (u.mv <= 0 || u.attacked) return false;
  const W = G.map.w, vis = G._vis[p.id];
  const ranged = canRanged(G, u);
  const reach = ranged ? rangeOf(G, u) : Math.max(1, Math.floor(u.mv)) + 1;
  let best = null, bv = aggressive ? 4 : 8;
  for (const j of within(W, G.map.h, u.i, reach)) {
    if (!vis[j] || j === u.i) continue;
    let hostile = false;
    for (const o of unitsAt(G, j)) if (hostileUnit(G, p.id, o) === true) hostile = true;
    const c = cityAt(G, j); if (c && atWar(G, p.id, c.owner)) hostile = true;
    if (!hostile) continue;
    let pr = null, moveTo = -1;
    if (ranged || dist(W, u.i, j) === 1) pr = predict(G, u, j);
    else {
      // melee: can we step next to it this turn?
      const r = findPath(G, u, j, { attack: true, max: 300 });
      if (!r || r.path.length < 2 || r.turns > 1) continue;
      moveTo = r.path[r.path.length - 2];
      if (inZOC(G, u, moveTo) && r.path.length > 2) {
        // we would stop in a zone of control before reaching it
        let ok = true; for (let k = 0; k < r.path.length - 2; k++) if (inZOC(G, u, r.path[k])) ok = false;
        if (!ok) continue;
      }
      pr = { ...predictFrom(G, u, moveTo, j) };
    }
    if (!pr || !pr.d) continue;
    let v;
    if (pr.d.kind === 'city') {
      const c2 = pr.d.c;
      const takes = !ranged && c2.hp - pr.toDef <= 0 && udef(u).cls !== 'siege';
      v = pr.toDef * 0.9 - pr.toAtt * (ranged ? 0 : 0.8) + (takes ? 200 : 0) + (ranged ? 8 : 0) + (aggressive ? 6 : 0);
      if (!ranged && u.hp - pr.toAtt < 30 && !takes) v -= 40;
    } else if (pr.d.kind === 'village') continue;
    else {
      const o = pr.d.u;
      const kills = pr.toDef >= o.hp;
      v = pr.toDef - pr.toAtt * 1.05 + (kills ? 25 + baseStr(G, o, false) * 0.5 : 0);
      if (!ranged && u.hp - pr.toAtt < 20 && !kills) v -= 40;
      if (pr.d.kind === 'civ') v = 30;
    }
    if (v > bv) { bv = v; best = { j, moveTo }; }
  }
  if (!best) return false;
  if (best.moveTo >= 0) {
    const r = findPath(G, u, best.moveTo);
    if (!r) return false;
    moveAlong(G, u, r.path);
    if (u.dead || u.mv <= 0 || dist(W, u.i, best.j) !== 1) return false;
  }
  const ev = attack(G, u, best.j);
  if (ev && ev.killed && u.owner >= 0) { /* follow up handled by rules */ }
  if (ev && ev.attDied) p.ai.lostRecently = (p.ai.lostRecently || 0) + 1;
  // a second strike (Blood Saber) if allowed
  if (!u.dead && !u.attacked && u.mv > 0) tryStrike(G, p, u, ctx, aggressive);
  return true;
}
function predictFrom(G, u, from, j) {
  const save = u.i;
  const { removeAt, addAt } = CORE;
  removeAt(G, u); u.i = from; addAt(G, u);
  const sm = u.mv; u.mv = Math.max(1, u.mv);
  let pr = null;
  try { pr = predict(G, u, j); } finally { removeAt(G, u); u.i = save; addAt(G, u); u.mv = sm; }
  return pr || {};
}
import * as CORE from './core.js?v=4';

// ------------------------------------------------------------------ cities
function cityAct(G, p, c, ctx) {
  const P = ctx.P;
  if (c.build && c.build.k === 'p') return;
  if (c.build && c.build.k !== 'u' && c.prod > 0) { maybeBuy(G, p, c, ctx); return; }
  const opts = buildOptions(G, c);
  const y = cityYield(G, c);
  const nCities = ctx.myCities.length;
  const W = G.map.w;
  const units = G.units.filter((u) => u.owner === p.id);
  const mil = units.filter((u) => isMilitary(udef(u)) && udef(u).cls !== 'recon').length;
  const founders = units.filter((u) => u.type === 'u_founder').length + G.cities.filter((o) => o !== c && o.owner === p.id && o.build && o.build.id === 'u_founder').length;
  const scouts = units.filter((u) => udef(u).cls === 'recon').length;
  const caravans = units.filter((u) => udef(u).cls === 'trade').length + G.cities.filter((o) => o !== c && o.owner === p.id && o.build && o.build.k === 'u' && UNITS[o.build.id].cls === 'trade').length;
  const war = ctx.enemies.length > 0;
  const threat = ctx.threats.get(c.id) || 0;
  const want = { cities: Math.round(4 + P.expand * 5 + (G.size === 'large' ? 2 : G.size === 'small' ? -1 : 0)) };
  const desiredArmy = Math.round(1.5 + nCities * (0.9 + P.aggr * 0.6) + (war ? nCities * 1.2 + 2 : 0) + (threat > 20 ? 2 : 0));
  let best = null, bv = -1e9;
  const turnsTo = (it) => (itemCost(G, c, it) - (c.build && c.build.id === it.id ? c.prod : 0)) / Math.max(1, itemRate(G, c, it, y.p));
  for (const it of opts) {
    let v = 0;
    if (it.k === 'u') {
      const U = UNITS[it.id];
      if (it.id === 'u_founder') {
        if (nCities + founders >= want.cities || founders >= 1 + Math.floor(nCities / 4) || war && threat > 10) continue;
        if (c.pop < 2) continue;
        if (bestSite(G, p, c.i, new Set()) < 0) continue;
        v = 22 * (0.6 + P.expand) * (G.turn < G.limit * 0.4 ? 1.3 : 0.7);
        if (nCities < 3) v += 12;
      } else if (U.cls === 'recon') {
        if (scouts >= (G.size === 'large' ? 2 : 1) || G.turn > G.limit * 0.3) continue;
        v = 7;
      } else if (U.cls === 'trade') {
        if (p.routes.length + caravans >= routeCap(G, p)) continue;
        v = 7 + (p.sect === 'qianjia' ? 3 : 0);
      } else if (U.naval) {
        continue; // the computer keeps to the land (ships only if it has nothing else)
      } else if (isMilitary(U)) {
        if (mil >= desiredArmy && threat < 10) continue;
        const deficit = Math.max(0, desiredArmy - mil) / Math.max(1, desiredArmy);
        v = 5 + deficit * 12 + (threat > 10 ? 10 : 0) + (war ? 3 : 0);
        // quality: strength per cost, prefer a mix
        const st = Math.max(U.str, U.rstr || 0);
        v *= 0.6 + st / (25 + p.era * 10);
        const same = units.filter((o) => udef(o).cls === U.cls).length;
        if (U.cls === 'ranged') v *= same < mil * 0.4 ? 1.15 : 0.75;
        if (U.cls === 'siege') v *= war && ctx.target && same < 2 ? 1.2 : 0.3;
        if (U.cls === 'mounted') v *= 0.95;
        // older units become pointless
        if (UNITS[it.id].up && opts.some((o) => o.id === UNITS[it.id].up || UNITS[o.id] && UNITS[o.id].rep === UNITS[it.id].up)) v *= 0.4;
      }
    } else if (it.k === 'b') {
      const B = BUILDINGS[it.id];
      const by = B.y || {};
      v = (by.f || 0) * 1.2 + (by.p || 0) * 1.4 + (by.g || 0) * 0.9 + (by.s || 0) * (1 + P.sci * 0.6) + (by.c || 0) * (0.8 + P.cult * 0.6) + (B.legend || 0) * (1 + P.cult * 1.5);
      if (B.pct) v += (B.pct.s || 0) * y.s * 1.2 + (B.pct.g || 0) * y.g + (B.pct.p || 0) * y.p * 1.2;
      if (B.unitPct) v += 1.5 + P.aggr * 2;
      if (B.def) v += war || threat > 0 ? 8 : (c.capital ? 2 : 0.5) + p.era * 0.4;
      if (B.routes) v += 2;
      if (B.keepFood) v += 1;
      if (B.border) v += 1;
      if (B.gp) v += 1;
      v -= (B.u || 0) * 0.6;
      v = v * 4 / Math.max(2, Math.sqrt(turnsTo(it)));
    } else if (it.k === 'w') {
      const D = WONDERS[it.id];
      const by = D.y || {};
      // only a strong city tries, and not two wonders at once
      if (G.cities.some((o) => o.owner === p.id && o !== c && o.build && o.build.k === 'w')) continue;
      const rate = itemRate(G, c, it, y.p);
      const tt = turnsTo(it);
      if (tt > 25 || c.pop < 4) continue;
      v = ((by.f || 0) + (by.p || 0) * 1.3 + (by.g || 0) * 0.7 + (by.s || 0) + (by.c || 0) + (D.legend || 0) * 1.5) * (0.6 + P.wonder + P.cult * 0.5);
      v = v * 1.6 / Math.sqrt(tt);
      if (war) v *= 0.5;
    } else if (it.k === 'p') {
      v = 200;
    }
    v *= 0.92 + rnd(G) * 0.16;
    if (c.build && c.build.k === it.k && c.build.id === it.id) v *= 1.35 + Math.min(0.5, c.prod / Math.max(1, itemCost(G, c, it)));
    if (v > bv) { bv = v; best = it; }
  }
  if (best && (!c.build || c.build.id !== best.id)) setBuild(G, c, best);
  maybeBuy(G, p, c, ctx);
}
function maybeBuy(G, p, c, ctx) {
  if (!c.build) return;
  const reserve = 60 + p.era * 50;
  const cost = buyCost(G, c, c.build);
  if (!isFinite(cost)) return;
  const threat = ctx.threats.get(c.id) || 0;
  const U = c.build.k === 'u' ? UNITS[c.build.id] : null;
  if (threat > 15 && U && isMilitary(U) && p.gold >= cost) { buyItem(G, c); return; }
  if (p.gold - cost > reserve && c.build.k === 'b' && rnd(G) < 0.5) buyItem(G, c);
}
function upgrades(G, p) {
  for (const u of G.units) {
    if (u.owner !== p.id) continue;
    const t = upgradeTarget(G, u);
    if (!t) continue;
    const cost = upgradeCost(G, u, t);
    if (p.gold > cost + 80 + p.era * 30) upgradeUnit(G, u);
  }
}
