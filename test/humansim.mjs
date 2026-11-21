// Scripted human-play test without a browser: a "human" sect plays through the same API the UI uses
// (found cities, research and rule paths, policies, production and buying, moving and attacking, heroes,
// envoys, great people, escort routes, diplomacy, Assembly votes, save/load) against computer sects.
// usage: node test/humansim.mjs [seed] [turns]
import * as C from '../js/core.js?v=2';
import * as U from '../js/units.js?v=2';
import * as W from '../js/world.js?v=2';
import { aiTurn } from '../js/ai.js?v=2';
import { UNITS, TECHS } from '../js/data.js?v=2';

const [seed = 'hs1', turns = '160'] = process.argv.slice(2);
let G = C.newGame({ seed, size: 'small', speed: 'quick', players: 4, sect: 'longmen', difficulty: 1 });
G.strict = true;
const me = () => G.players.find((p) => p.human);
const log = (...a) => console.log(`[t${G.turn}]`, ...a);
const checks = { founded: 0, attacks: 0, kills: 0, routes: 0, heroes: 0, envoys: 0, gp: 0, votes: 0, saves: 0, bought: 0, wars: 0, peace: 0, policies: 0 };

function humanTurn() {
  const p = me(); if (!p || !p.alive) return;
  // research & rules: aim at the peerless art, rules by order
  if (!p.tech) { const av = C.availableTechs(p); if (av.length) { const t = av.sort((a, b) => TECHS[a].cost - TECHS[b].cost)[0]; p.tech = t; } }
  if (!p.civic) { const av = C.availableCivics(p); if (av.length) p.civic = av[0]; }
  // government and policies
  const govs = C.unlockedGovs(p); if (govs.includes('g_virtue') && p.gov === 'g_fledgling') C.setGov(G, p, 'g_virtue');
  const un = C.unlockedPolicies(p); const pol = { w: [], m: [], v: [], a: [] };
  for (const id of un) { const sl = { p_patrol: 'w', p_drill: 'w', p_settle: 'm', p_market: 'm', p_recruit: 'v', p_chivalry: 'v' }[id]; if (sl) pol[sl].push(id); }
  const before = JSON.stringify(p.pol); C.setPolicies(G, p, pol); if (JSON.stringify(p.pol) !== before) checks.policies++;
  // envoys and heroes
  for (const v of G.villages) if (v.alive && p.envoys > 0 && p.exp[v.i]) { if (U.sendEnvoy(G, p, v)) checks.envoys++; }
  const av = U.availableHeroes(G); if (av.length && p.renown >= U.heroCost(G, p)) { if (U.recruitHero(G, p, av[0])) checks.heroes++; }
  // cities
  for (const c of G.cities.filter((x) => x.owner === p.id)) {
    if (!c.build) {
      const opts = C.buildOptions(G, c);
      const n = G.cities.filter((x) => x.owner === p.id).length;
      const atWar = G.players.some((o) => p.rel[o.id] === 'war');
      const mil = G.units.filter((x) => x.owner === p.id && C.isMilitary(C.udef(x))).length;
      const want = (n < 4 && c.pop >= 2 && opts.find((o) => o.id === 'u_founder')) || ((atWar || mil < n * 2) && opts.filter((o) => o.k === 'u' && C.isMilitary(UNITS[o.id]) && !UNITS[o.id].naval).sort((a, b) => UNITS[b.id].str - UNITS[a.id].str)[0]) || opts.find((o) => o.k === 'p') || opts.find((o) => o.k === 'b') || opts.find((o) => o.k === 'u' && UNITS[o.id].cls === 'melee') || opts[0];
      if (want) C.setBuild(G, c, want);
    }
    if (p.gold > 300 && c.build && c.build.k === 'b') { if (C.buyItem(G, c)) checks.bought++; }
  }
  // units
  for (const u of G.units.filter((x) => x.owner === p.id)) {
    if (u.dead) continue;
    if (u.pend) { const o = U.promoOptions(G, u); if (o.length) U.promote(G, u, o[0]); }
    if (u.type === 'u_founder') {
      if (U.canSettle(G, u)) { U.settle(G, u); checks.founded++; continue; }
      // walk outward to a legal spot
      let best = -1, bd = 99;
      for (let i = 0; i < G.map.w * G.map.h; i++) if (C.canFound(G, i, p.id) && p.exp[i]) { const d = distW(u.i, i); if (d < bd && d >= 1) { bd = d; best = i; } }
      if (best >= 0) { U.moveTo(G, u, best, { known: true }); if (U.canSettle(G, u)) { U.settle(G, u); checks.founded++; } }
      continue;
    }
    if (u.gp) { if (U.canActivateGP(G, u)) { U.activateGP(G, u); checks.gp++; } continue; }
    if (C.udef(u).cls === 'trade') {
      const ts = U.routeTargets(G, u);
      if (ts.length && p.routes.length < U.routeCap(G, p)) {
        const t = ts[0].c;
        if (distW(u.i, t.i) > 1) { const r = U.findPath(G, u, t.i, { attack: true, known: true }); if (r) U.moveAlong(G, u, r.path.slice(0, -1)); }
        if (distW(u.i, t.i) <= 1 && U.establishRoute(G, u, t)) checks.routes++;
      }
      continue;
    }
    if (!C.isMilitary(C.udef(u))) continue;
    // attack anything hostile in reach, else hunt camps, else go home
    let done = false;
    for (const j of nearTiles(u.i, U.canRanged(G, u) ? U.rangeOf(G, u) : 1)) {
      const k = U.canAttackTile(G, u, j);
      if (!k) continue;
      const pr = U.predict(G, u, j);
      if (pr && (pr.toDef >= pr.toAtt || k === 'ranged')) { const ev = U.attack(G, u, j); checks.attacks++; if (ev && ev.killed) checks.kills++; done = true; break; }
    }
    if (done || u.mv <= 0) continue;
    const camp = G.camps.filter((c) => p.exp[c.i]).sort((a, b) => distW(u.i, a.i) - distW(u.i, b.i))[0];
    if (camp && distW(u.i, camp.i) < 10 && u.hp > 60) U.moveTo(G, u, camp.i, { attack: true, known: true });
  }
  // diplomacy: one war in the middle game, peace later
  const others = G.players.filter((o) => o.alive && !o.human && p.met[o.id] !== undefined);
  if (G.turn >= 60 && !checks.wars && others.length) { const o = others.sort((a, b) => W.militaryPower(G, a.id) - W.militaryPower(G, b.id))[0]; if (W.militaryPower(G, p.id) > W.militaryPower(G, o.id) * 1.3 && W.declareWar(G, p.id, o.id)) checks.wars++; }
  if (G.turn > 75) for (const o of others) if (p.rel[o.id] === 'war') { const [y] = W.aiConsider(G, o.id, p.id, 'peace'); if (y) { W.makePeace(G, p.id, o.id); checks.peace++; } }
  for (const o of others) if (W.canPact(G, p.id, o.id)) { const [y] = W.aiConsider(G, o.id, p.id, 'pact'); if (y) W.makePact(G, p.id, o.id); }
  // proposals from the computer: accept peace and pacts
  while (G.proposals && G.proposals.length) { const q = G.proposals.shift(); if (q.what === 'peace') W.makePeace(G, q.from, p.id); if (q.what === 'pact') W.makePact(G, q.from, p.id); }
}
function distW(a, b) { const w = G.map.w; const ax = a % w, ay = (a / w) | 0, bx = b % w, by = (b / w) | 0; const q1 = ax - ((ay - (ay & 1)) >> 1), q2 = bx - ((by - (by & 1)) >> 1); const dq = q1 - q2, dr = ay - by; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) >> 1; }
function nearTiles(i, r) { const out = []; for (let j = 0; j < G.map.w * G.map.h; j++) { const d = distW(i, j); if (d >= 1 && d <= r) out.push(j); } return out; }

const t0 = Date.now();
while (!G.over && G.turn < +turns) {
  humanTurn();
  // the Assembly waits for the human vote
  if (G.congress.session) {
    const p = me();
    const picks = G.congress.session.res.map((r) => ({ opt: 'a', target: p.id }));
    W.resolveCongress(G, { picks, leader: p.id, extra: p.favour >= 10 ? 1 : 0 });
    checks.votes++;
  }
  const steps = W.turnSteps(G, aiTurn);
  for (const s of steps) { if (G.over) break; s.run(); }
  if (me()) W.runOrders(G, me().id);
  if (G.turn % 20 === 0) { const str = C.serialize(G); G = C.deserialize(str); G.strict = true; checks.saves++; }
}
const p = me();
const cities = G.cities.filter((c) => c.owner === p.id).length;
log('human', p.sect, 'alive', p.alive, 'cities', cities, 'techs', Object.keys(p.techs).length, 'civics', Object.keys(p.civics).length, 'gold', Math.round(p.gold), 'score', W.score(G, p.id));
log('checks', JSON.stringify(checks));
log('over', G.over, G.winner ? JSON.stringify(G.winner) : '', 'time', ((Date.now() - t0) / 1000).toFixed(1) + 's');
const ok = p && (cities >= 2 || !p.alive) && checks.founded >= 1 && checks.saves >= 1;
if (!ok) { console.error('HUMAN SIM FAILED'); process.exit(1); }
console.log('HUMAN SIM OK');
