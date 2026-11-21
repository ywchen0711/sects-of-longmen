// The flow of a turn, diplomacy, the Wulin Assembly, outlaws and beasts, victory and score.
import { SECTS, UNITS, RESOLUTIONS, RES_IDS2, ALIGN, WONDERS, VICTORIES, TECHS, CIVICS, SPEEDS } from './data.js?v=2';
import {
  note, sectName, leaderName, beginTurnAll, refreshMods, mods, udef, isMilitary, unitsAt, cityAt, tileOwner, makeUnit, killUnit,
  NEUTRAL_POOL, spawnNear, isLandPassable, cityById, costMul, alivePlayers, speed, worldEra, updateVis, campAt, villageAt,
} from './core.js?v=2';
import { atWar, hostileUnit, findPath, moveAlong, attack, canAttackTile, predict, addGriev, cityTargets, cityStrike, inZOC, stepUnit, canEnter } from './units.js?v=2';
import { within, dist } from './hex.js?v=2';
import { rnd, rint, shuffle } from './rng.js?v=2';

// ------------------------------------------------------------------ diplomacy
export function treatyAge(G, a, b) { return G.turn - (G.players[a].relT[b] ?? -99); }
export function canDeclareWar(G, a, b) {
  const A = G.players[a];
  if (!A || !G.players[b] || !G.players[b].alive || A.met[b] === undefined) return false;
  if (A.rel[b] === 'war') return false;
  if (G.congress.noWar > G.turn) return false;
  return true;
}
export function declareWar(G, a, b) {
  if (!canDeclareWar(G, a, b)) return false;
  const A = G.players[a], B = G.players[b];
  const wasAlly = A.rel[b] === 'ally';
  const young = treatyAge(G, a, b) < 10;
  let g = 10 + (young ? 12 : 0) + (wasAlly ? 18 : 0);
  if (G.congress.active.some((r) => r.id === 'r_truce' && r.opt === 'a')) g *= 2;
  addGriev(G, b, a, g);
  // the rest of the jianghu remembers who started it
  for (const o of G.players) if (o.alive && o.id !== a && o.id !== b && o.met[a] !== undefined) addGriev(G, o.id, a, Math.round(g / 4));
  A.rel[b] = 'war'; B.rel[a] = 'war'; A.relT[b] = G.turn; B.relT[a] = G.turn;
  delete A.pact[b]; delete B.pact[a];
  A.routes = A.routes.filter((r) => { const c = cityById(G, r.to); return !c || c.owner !== b; });
  B.routes = B.routes.filter((r) => { const c = cityById(G, r.to); return !c || c.owner !== a; });
  G.stats.wars++;
  note(G, -2, `${sectName(G, a)[0]}向${sectName(G, b)[0]}宣戰！`, `${sectName(G, a)[1]} declared war on ${sectName(G, b)[1]}!`, -1, 'war');
  // allies of the victim join in
  for (const o of G.players) if (o.alive && o.id !== a && o.id !== b && o.rel[b] === 'ally' && o.rel[a] !== 'war' && o.met[a] !== undefined) {
    o.rel[a] = 'war'; A.rel[o.id] = 'war'; o.relT[a] = G.turn; A.relT[o.id] = G.turn;
    note(G, -2, `${sectName(G, o.id)[0]}為盟友出兵，對${sectName(G, a)[0]}開戰。`, `${sectName(G, o.id)[1]} stands by its ally and joins the war against ${sectName(G, a)[1]}.`, -1, 'war');
  }
  if (G.hooks && G.hooks.onWar) G.hooks.onWar(a, b);
  return true;
}
export function makePeace(G, a, b) {
  const A = G.players[a], B = G.players[b];
  if (A.rel[b] !== 'war') return false;
  A.rel[b] = 'peace'; B.rel[a] = 'peace'; A.relT[b] = G.turn; B.relT[a] = G.turn;
  // units inside the other's land walk home
  for (const u of G.units.slice()) {
    if ((u.owner === a && tileOwner(G, u.i) === b) || (u.owner === b && tileOwner(G, u.i) === a)) bounceHome(G, u);
  }
  note(G, -2, `${sectName(G, a)[0]}與${sectName(G, b)[0]}議和。`, `${sectName(G, a)[1]} and ${sectName(G, b)[1]} made peace.`, -1, 'peace');
  return true;
}
function bounceHome(G, u) {
  let best = -1, bd = 1e9;
  for (const c of G.cities) if (c.owner === u.owner) {
    for (const j of within(G.map.w, G.map.h, c.i, 2)) if (isLandPassable(G, j) && canEnter(G, u, j, true) && tileOwner(G, j) === u.owner) { const d = dist(G.map.w, u.i, j); if (d < bd) { bd = d; best = j; } }
  }
  if (best >= 0) { const { removeAt, addAt } = CORE; removeAt(G, u); u.i = best; addAt(G, u); }
}
import * as CORE from './core.js?v=2';
export function canAlly(G, a, b) {
  const A = G.players[a], B = G.players[b];
  return A.rel[b] === 'peace' && A.civics.c_sworn && B.civics.c_sworn;
}
export function makeAlliance(G, a, b) {
  if (!canAlly(G, a, b)) return false;
  const A = G.players[a], B = G.players[b];
  A.rel[b] = 'ally'; B.rel[a] = 'ally'; A.relT[b] = G.turn; B.relT[a] = G.turn;
  note(G, -2, `${sectName(G, a)[0]}與${sectName(G, b)[0]}結為盟友。`, `${sectName(G, a)[1]} and ${sectName(G, b)[1]} became allies.`, -1, 'diplo');
  refreshMods(G, A); refreshMods(G, B);
  return true;
}
export function endAlliance(G, a, b) {
  const A = G.players[a], B = G.players[b];
  if (A.rel[b] !== 'ally') return false;
  A.rel[b] = 'peace'; B.rel[a] = 'peace'; A.relT[b] = G.turn; B.relT[a] = G.turn;
  addGriev(G, b, a, 4);
  return true;
}
export function canPact(G, a, b) { const A = G.players[a]; return A.rel[b] !== 'war' && !(A.pact[b] > G.turn) && A.met[b] !== undefined; }
export function makePact(G, a, b) {
  if (!canPact(G, a, b)) return false;
  const until = G.turn + speed(G).route;
  G.players[a].pact[b] = until; G.players[b].pact[a] = until;
  note(G, -2, `${sectName(G, a)[0]}與${sectName(G, b)[0]}簽下互市之約。`, `${sectName(G, a)[1]} and ${sectName(G, b)[1]} signed a trade pact.`, -1, 'diplo');
  return true;
}
export function giftGold(G, a, b, n) {
  const A = G.players[a], B = G.players[b];
  n = Math.min(n, A.gold); if (n <= 0) return false;
  A.gold -= n; B.gold += n;
  B.ai.gift = B.ai.gift || {}; B.ai.gift[a] = (B.ai.gift[a] || 0) + n;
  B.griev[a] = Math.max(0, (B.griev[a] || 0) - n / 25);
  return true;
}
export function denounce(G, a, b) {
  const A = G.players[a];
  A.ai.denounced = A.ai.denounced || {};
  A.ai.denounced[b] = G.turn;
  addGriev(G, b, a, 3);
  note(G, -2, `${sectName(G, a)[0]}公開譴責${sectName(G, b)[0]}。`, `${sectName(G, a)[1]} publicly denounced ${sectName(G, b)[1]}.`, -1, 'diplo');
  return true;
}
// how sect a feels about sect b (-100..100) with the reasons
export function attitude(G, a, b) {
  const A = G.players[a], B = G.players[b];
  const P = SECTS[A.sect].pers;
  const why = [];
  let s = Math.round(P.diplo * 12 - P.aggr * 6);
  why.push([s, '個性', 'temperament']);
  const al = SECTS[A.sect].al, bl = SECTS[B.sect].al;
  if (al === bl && al !== 2) { s += 8; why.push([8, '同道', 'same path']); }
  else if ((al === 0 && bl === 1) || (al === 1 && bl === 0)) { s -= 10; why.push([-10, '正邪不兩立', 'righteous vs unorthodox']); }
  const gv = Math.round(A.griev[b] || 0);
  if (gv) { s -= gv; why.push([-gv, '積怨', 'grievances']); }
  let pub = 0; for (const o of G.players) if (o.alive && o.id !== a && o.id !== b) pub += (o.griev[b] || 0);
  pub = Math.min(15, Math.round(pub / 6)); if (pub) { s -= pub; why.push([-pub, '江湖公論', 'public opinion']); }
  if (A.rel[b] === 'ally') { s += 20; why.push([20, '盟友', 'allies']); }
  if (A.pact[b] > G.turn) { s += 8; why.push([8, '互市', 'trade pact']); }
  if (A.rel[b] === 'war') { s -= 25; why.push([-25, '交戰中', 'at war']); }
  const gift = Math.round(Math.min(20, ((A.ai.gift || {})[b] || 0) / 10)); if (gift) { s += gift; why.push([gift, '贈禮', 'gifts']); }
  let border = 0;
  for (const c of G.cities) if (c.owner === a) for (const o of G.cities) if (o.owner === b && dist(G.map.w, c.i, o.i) <= 7) border++;
  border = Math.min(12, border * 3); if (border) { s -= border; why.push([-border, '地盤相鄰', 'crowded borders']); }
  let shared = 0; for (const o of G.players) if (o.alive && o.id !== a && o.id !== b && A.rel[o.id] === 'war' && B.rel[o.id] === 'war') shared = 10;
  if (shared) { s += shared; why.push([shared, '共同敵人', 'common enemy']); }
  if ((A.ai.denounced || {})[b] && G.turn - A.ai.denounced[b] < 30) { s -= 8; why.push([-8, '曾譴責', 'denounced them']); }
  if ((B.ai.denounced || {})[a] && G.turn - B.ai.denounced[a] < 30) { s -= 12; why.push([-12, '被譴責', 'was denounced']); }
  return { v: Math.max(-100, Math.min(100, s)), why };
}
export function attitudeWord(v) {
  if (v <= -35) return ['敵視', 'Hostile'];
  if (v <= -10) return ['冷淡', 'Cold'];
  if (v < 15) return ['中立', 'Neutral'];
  if (v < 40) return ['友好', 'Friendly'];
  return ['親密', 'Close'];
}
export function militaryPower(G, pid) {
  let s = 0;
  for (const u of G.units) if (u.owner === pid && isMilitary(udef(u))) { const U = udef(u); const st = u.hero ? 20 + u.lvl * 3 : Math.max(U.str, U.rstr || 0); s += st * st / 20 * (u.hp / 100); }
  for (const c of G.cities) if (c.owner === pid) s += 6;
  return s;
}
// AI answers to proposals: returns [yes, reasonZh, reasonEn]
export function aiConsider(G, ai, from, what, amount) {
  const A = G.players[ai];
  const at = attitude(G, ai, from).v;
  const P = SECTS[A.sect].pers;
  if (what === 'peace') {
    if (A.rel[from] !== 'war') return [false, '我們沒有在打仗。', 'We are not at war.'];
    const ratio = (militaryPower(G, ai) + 1) / (militaryPower(G, from) + 1);
    const age = treatyAge(G, ai, from);
    if (age < 5) return [false, '仗才剛開打。', 'The war has only just begun.'];
    const lost = (A.ai.lostRecently || 0);
    if (ratio < 0.9 || lost > 0 || age > 18 + P.aggr * 25 || (at > -10 && ratio < 1.5)) return [true, '好，就此罷手。', 'Very well, let us end it.'];
    return [false, '我們還沒打夠。', 'We have not had enough of this fight.'];
  }
  if (what === 'ally') {
    if (!canAlly(G, ai, from)) return [false, '結盟的時機未到（雙方都需要「結義」）。', 'Not yet (both sides need Sworn Brotherhood).'];
    if (at >= 32) return [true, '從今以後，有難同當。', 'From now on, trouble shared.'];
    return [false, '我們還不夠熟。', 'We do not know each other well enough.'];
  }
  if (what === 'pact') {
    if (!canPact(G, ai, from)) return [false, '現在不行。', 'Not now.'];
    if (at >= -5) return [true, '生意大家做。', 'Business is for everyone.'];
    return [false, '不和你做生意。', 'We will not trade with you.'];
  }
  if (what === 'gift') return [true, '多謝厚禮。', 'Thank you for the gift.'];
  return [false, '……', '...'];
}

// ------------------------------------------------------------------ the Wulin Assembly
export function votesOf(G, p) {
  let v = 1 + mods(G, p).votes;
  for (const vl of G.villages) if (vl.alive && vl.suz === p.id) v++;
  return v;
}
export function voteCost(k) { return 10 * k; }
export function dipTarget(G) { return G.players.length <= 4 ? 12 : 14; }
export function startCongress(G) {
  const C = G.congress;
  const ids = shuffle(G, RES_IDS2.slice()).slice(0, 2);
  C.session = { n: C.n + 1, turn: G.turn, res: ids.map((id) => ({ id })), human: null };
  note(G, -2, `第 ${C.n + 1} 屆武林大會召開了！`, `The ${ordinal(C.n + 1)} Wulin Assembly is in session!`, -1, 'congress');
  return C.session;
}
function ordinal(n) { return n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'); }
// a voter's choice for one resolution: {opt, target}
function aiPick(G, p, rid) {
  const R = RESOLUTIONS[rid];
  const others = alivePlayers(G).filter((o) => o.id !== p.id);
  const worst = others.slice().sort((a, b) => attitude(G, p.id, a.id).v - attitude(G, p.id, b.id).v)[0];
  const lead = others.slice().sort((a, b) => score(G, b.id) - score(G, a.id))[0];
  switch (rid) {
    case 'r_bounty': return { opt: 'a', target: (worst || lead || p).id };
    case 'r_trade': return { opt: 'a', target: p.id };
    case 'r_truce': return { opt: SECTS[p.sect].pers.aggr > 0.6 ? 'b' : 'a', target: null };
    case 'r_manuals': { const top = alivePlayers(G).sort((a, b) => (b.lastY?.s || 0) - (a.lastY?.s || 0))[0]; return { opt: top && top.id === p.id ? 'a' : 'b', target: null }; }
    case 'r_banner': return { opt: 'a', target: SECTS[p.sect].al };
    case 'r_purge': return { opt: SECTS[p.sect].pers.aggr > 0.7 ? 'a' : (G.players.some((o) => o.alive && p.rel[o.id] === 'war') ? 'b' : 'a'), target: null };
    case 'r_ranking': return { opt: 'a', target: p.id };
    case 'r_salt': return { opt: 'a', target: p.id };
  }
  return { opt: 'a', target: null };
}
function aiLeaderVote(G, p) {
  const P = SECTS[p.sect].pers;
  // most sects vote for themselves; a friendly sect may back an ally
  const allies = alivePlayers(G).filter((o) => o.id !== p.id && p.rel[o.id] === 'ally').sort((a, b) => b.dip - a.dip);
  if (allies.length && P.diplo < 0.6 && rnd(G) < 0.5) return allies[0].id;
  return p.id;
}
// human = {picks:[{opt,target}, {opt,target}], leader, extra: votes bought}
export function resolveCongress(G, human) {
  const C = G.congress, S = C.session;
  if (!S) return null;
  const voters = alivePlayers(G);
  const tallies = S.res.map(() => ({ a: 0, b: 0, ta: {}, tb: {} }));
  const leaderT = {};
  const ballots = [];
  for (const p of voters) {
    let base = votesOf(G, p);
    let extra = 0;
    if (p.human && human) {
      extra = Math.max(0, Math.min(human.extra || 0, 6));
      let cost = 0; for (let k = 1; k <= extra; k++) cost += voteCost(k);
      if (cost > p.favour) { extra = 0; cost = 0; }
      p.favour -= cost;
    } else if (!p.human) {
      const P = SECTS[p.sect].pers;
      // diplomats buy votes for the leader nomination
      let k = 0; while (k < 5 && p.favour >= voteCost(k + 1) + 6 && (P.diplo > 0.55 || p.dip >= dipTarget(G) - 3)) { k++; p.favour -= voteCost(k); }
      extra = k;
    }
    const picks = p.human && human ? human.picks : S.res.map((r) => aiPick(G, p, r.id));
    picks.forEach((pk, k) => {
      const T = tallies[k]; if (!pk) return;
      T[pk.opt] += base;
      if (pk.target !== null && pk.target !== undefined) { const tt = pk.opt === 'a' ? T.ta : T.tb; tt[pk.target] = (tt[pk.target] || 0) + base; }
    });
    const lv = p.human && human ? human.leader : aiLeaderVote(G, p);
    if (lv !== undefined && lv !== null) leaderT[lv] = (leaderT[lv] || 0) + base + extra;
    ballots.push({ pid: p.id, votes: base + extra, leader: lv, picks });
  }
  // results
  const active = [];
  const results = S.res.map((r, k) => {
    const T = tallies[k];
    const opt = T.a >= T.b ? 'a' : 'b';
    const tt = opt === 'a' ? T.ta : T.tb;
    let target = null, tv = -1;
    for (const key of Object.keys(tt)) if (tt[key] > tv) { tv = tt[key]; target = +key; }
    const R = RESOLUTIONS[r.id];
    const res = { id: r.id, opt, a: T.a, b: T.b };
    if (R.target === 'sect') res.target = target ?? -1;
    if (R.target === 'align') { res.alignT = target ?? 0; }
    active.push(res);
    return res;
  });
  C.active = active;
  if (active.some((r) => r.id === 'r_purge' && r.opt === 'b')) C.noWar = G.turn + speed(G).congress; else C.noWar = 0;
  for (const r of active) if (r.id === 'r_ranking' && r.opt === 'a' && r.target >= 0) { const T = G.players[r.target]; T.renown += 80; T.life += 80; }
  // leader nomination
  let lw = -1, lv = -1, second = -1, total = 0;
  for (const k of Object.keys(leaderT)) { total += leaderT[k]; if (leaderT[k] > lv) { second = lw; lv = leaderT[k]; lw = +k; } }
  if (lw >= 0) {
    const W = G.players[lw];
    const pts = 2 + (lv > total * 0.6 ? 1 : 0);
    W.dip += pts;
    note(G, -2, `武林大會推舉${sectName(G, lw)[0]}為盟主候選，盟主聲望 +${pts}（${W.dip}/${dipTarget(G)}）。`, `The Assembly named ${sectName(G, lw)[1]} for Alliance Leader: +${pts} standing (${W.dip}/${dipTarget(G)}).`, -1, 'congress');
  }
  for (const r of active) {
    const R = RESOLUTIONS[r.id];
    let tz = '', te = '';
    if (R.target === 'sect' && r.target >= 0) { tz = '（' + sectName(G, r.target)[0] + '）'; te = ' (' + sectName(G, r.target)[1] + ')'; }
    if (R.target === 'align') { tz = '（' + ALIGN[r.alignT][0] + '）'; te = ' (' + ALIGN[r.alignT][1] + ')'; }
    note(G, -2, `大會決議「${R.n[0]}」${tz}：${R[r.opt][0]}`, `Resolved ${R.n[1]}${te}: ${R[r.opt][1]}`, -1, 'congress');
  }
  C.history.push({ n: S.n, turn: G.turn, results, leader: lw, leaderVotes: leaderT, ballots });
  C.last = C.history[C.history.length - 1];
  C.n++; C.session = null; C.next = G.turn + speed(G).congress;
  for (const p of G.players) if (p.alive) refreshMods(G, p);
  return C.last;
}

// ------------------------------------------------------------------ outlaws and beasts
function neutralTurn(G) {
  const W = G.map.w, H = G.map.h;
  const fast = G.congress.active.some((r) => r.id === 'r_purge' && r.opt === 'b');
  for (const camp of G.camps) {
    camp.timer--;
    const mine = G.units.filter((u) => u.owner < 0 && u.camp === camp.id).length;
    if (camp.timer <= 0) {
      camp.timer = Math.round((9 + rint(G, 6)) * (fast ? 0.6 : 1) * Math.max(0.6, costMul(G)));
      let near = false; for (const c of G.cities) if (dist(W, c.i, camp.i) <= 11) near = true;
      if (mine < 2 && near) {
        const t = NEUTRAL_POOL(G, camp.kind);
        const u = spawnNear(G, -1, t, camp.i, { camp: camp.id });
        if (!u) {}
      }
    }
  }
  // camp defenders: a camp with nobody home gets one guard
  for (const camp of G.camps) {
    const here = unitsAt(G, camp.i).length;
    if (!here && G.turn % 6 === 0) { const t = NEUTRAL_POOL(G, camp.kind); makeUnit(G, -1, t, camp.i, { camp: camp.id, guard: 1 }); }
  }
  // new camps appear in the wilds nobody watches
  const maxCamps = Math.round(W * H / 230);
  if (G.turn % Math.max(6, Math.round(14 * costMul(G))) === 0 && G.camps.length < maxCamps) {
    for (let tries = 0; tries < 40; tries++) {
      const i = rint(G, W * H);
      if (!isLandPassable(G, i) || tileOwner(G, i) >= 0 || unitsAt(G, i).length || cityAt(G, i) || villageAt(G, i) || campAt(G, i)) continue;
      let seen = false; for (const p of G.players) if (p.alive && G._vis[p.id][i]) seen = true;
      if (seen) continue;
      if (G.cities.some((c) => dist(W, c.i, i) < 5) || G.camps.some((c) => dist(W, c.i, i) < 5)) continue;
      const camp = { id: G.nextId++, i, kind: rnd(G) < 0.35 ? 'beast' : 'bandit', timer: 4, units: [] };
      G.camps.push(camp); G._camp[i] = camp.id;
      break;
    }
  }
  // move and fight
  for (const u of G.units.slice()) {
    if (u.owner >= 0 || u.dead) continue;
    u.mv = UNITS[u.type].mv; u.attacked = 0;
    if (u.hp < 100) u.hp = Math.min(100, u.hp + 8);
    if (u.guard) {
      // guards only strike what stands next to the camp
      tryNeutralAttack(G, u, 1);
      continue;
    }
    if (tryNeutralAttack(G, u, 1)) continue;
    // hunt the nearest target within 7
    let best = -1, bd = 99;
    for (const o of G.units) {
      if (o.owner < 0 || o.dead) continue;
      if (hostileUnit(G, o.owner, u) !== true) continue;
      const d = dist(W, u.i, o.i); if (d < bd && d <= 7) { bd = d; best = o.i; }
    }
    if (best < 0) {
      // drift toward someone's land
      for (const c of G.cities) { if (hostileUnit(G, c.owner, u) !== true) continue; const d = dist(W, u.i, c.i); if (d < bd && d <= 9) { bd = d; best = c.i; } }
    }
    if (best >= 0) {
      const r = findPath(G, u, best, { attack: true, max: 600 });
      if (r && r.path.length > 1) moveAlong(G, u, r.path.slice(0, -1));
      tryNeutralAttack(G, u, 2);
    } else {
      const nb = G._nb[u.i].filter((j) => isLandPassable(G, j) && !unitsAt(G, j).length && !cityAt(G, j) && !villageAt(G, j));
      if (nb.length && rnd(G) < 0.5) stepUnit(G, u, nb[rint(G, nb.length)]);
    }
  }
}
function tryNeutralAttack(G, u, range) {
  let best = null, bv = -1e9;
  const r = Math.max(range, UNITS[u.type].rng || 1);
  for (const j of within(G.map.w, G.map.h, u.i, r)) {
    if (j === u.i) continue;
    const k = canAttackTile(G, u, j);
    if (!k) continue;
    const pr = predict(G, u, j);
    if (!pr || pr.d.kind === 'city' || pr.d.kind === 'village') continue;
    if (pr.d.kind === 'unit' && hostileUnit(G, pr.d.u.owner, u) !== true) continue;
    const v = pr.toDef - pr.toAtt * 0.8 + (pr.d.u && pr.d.u.hp <= pr.toDef ? 30 : 0);
    if (v > bv) { bv = v; best = j; }
  }
  if (best !== null && bv > -10) { attack(G, u, best); return true; }
  return false;
}

// ------------------------------------------------------------------ end-of-turn effects for one sect
export function endOfTurnFor(G, pid) {
  const p = G.players[pid];
  if (!p.alive) return;
  const m = mods(G, p);
  if (m.aura) {
    const hit = new Set();
    for (const u of G.units) if (u.owner === pid && isMilitary(udef(u))) for (const j of G._nb[u.i]) for (const o of unitsAt(G, j)) if (o.owner !== pid && isMilitary(udef(o)) && hostileUnit(G, pid, o) === true) hit.add(o);
    for (const o of hit) { o.hp -= m.aura; if (o.hp <= 0) { o.hp = 1; } }
  }
}
export function autoCityStrikes(G, pid) {
  for (const c of G.cities) if (c.owner === pid) {
    const ts = cityTargets(G, c);
    if (!ts.length) continue;
    let best = ts[0], bh = 999;
    for (const t of ts) { const u = unitsAt(G, t).find((o) => isMilitary(udef(o))); if (u && u.hp < bh) { bh = u.hp; best = t; } }
    cityStrike(G, c, best);
  }
}
// human units with standing orders move at the start of the human turn
export function runOrders(G, pid) {
  for (const u of G.units.slice()) {
    if (u.owner !== pid || u.dead || !u.order) continue;
    if (u.order.k === 'goto') {
      const r = findPath(G, u, u.order.to, { known: true });
      if (!r) { u.order = null; continue; }
      moveAlong(G, u, r.path);
      if (u.i === u.order.to) u.order = null;
      // stop if an enemy comes into view next to us
      for (const j of G._nb[u.i]) for (const o of unitsAt(G, j)) if (hostileUnit(G, pid, o) === true) u.order = null;
    }
    if (u.order && (u.order.k === 'fort' || u.order.k === 'sleep')) {
      // wake when enemies are near
      for (const j of within(G.map.w, G.map.h, u.i, 2)) for (const o of unitsAt(G, j)) if (hostileUnit(G, pid, o) === true && G._vis[pid][j]) u.order = null;
      if (u.order && u.order.k === 'sleep' && u.hp >= 100 && u.order.heal) u.order = null;
    }
  }
}

// ------------------------------------------------------------------ victory and score
export function score(G, pid) {
  const p = G.players[pid];
  let s = 0;
  for (const c of G.cities) if (c.owner === pid) s += 8 + c.pop * 2;
  s += Object.keys(p.techs).length * 4 + Object.keys(p.civics).length * 4;
  for (const w of Object.keys(G.wonders)) if (G.wonders[w].owner === pid) s += 15;
  s += p.legend / 20 + p.dip * 8 + p.proj * 30 + p.stats.kills * 0.5;
  let land = 0; for (let i = 0; i < G.map.tc.length; i++) if (G.map.tc[i] >= 0 && tileOwner(G, i) === pid) land++;
  s += land * 0.4;
  return Math.round(s);
}
export function lore(G, pid) { return G.players[pid].life * 0.55; }
export function cultureNeed(G) { return Math.round(2000 * Math.sqrt(costMul(G))); }
export function victoryProgress(G, pid) {
  const p = G.players[pid];
  const rivals = alivePlayers(G).filter((o) => o.id !== pid);
  const caps = G.cities.filter((c) => c.origCap >= 0 && c.origCap !== pid);
  const held = caps.filter((c) => c.owner === pid).length;
  const maxLore = Math.max(0, ...rivals.map((o) => lore(G, o.id)));
  return {
    dom: { held, need: caps.length },
    sci: { techs: Object.keys(p.techs).length, all: Object.keys(TECHS).length, heaven: !!p.techs.t_heaven, stage: p.proj },
    cul: { legend: p.legend, lore: maxLore, need: Math.max(maxLore, cultureNeed(G)) },
    dip: { pts: p.dip, need: dipTarget(G) },
    score: score(G, pid),
  };
}
export function checkVictory(G) {
  if (G.over) return G.winner;
  const al = alivePlayers(G);
  const human = G.players.find((p) => p.human);
  if (human && !human.alive) { G.over = true; G.winner = { pid: -1, type: 'defeat', turn: G.turn }; return G.winner; }
  for (const p of al) {
    if (p.proj >= 3) return win(G, p.id, 'sci');
  }
  for (const p of al) {
    const caps = G.cities.filter((c) => c.origCap >= 0 && c.origCap !== p.id);
    const others = G.players.filter((o) => o.id !== p.id).length;
    if (others > 0 && caps.length >= others && caps.every((c) => c.owner === p.id)) return win(G, p.id, 'dom');
    if (al.length === 1) return win(G, p.id, 'dom');
  }
  for (const p of al) {
    const rivals = al.filter((o) => o.id !== p.id);
    if (rivals.length && G.turn > G.limit * 0.5 && p.legend >= cultureNeed(G) && rivals.every((o) => p.legend > lore(G, o.id))) return win(G, p.id, 'cul');
  }
  for (const p of al) if (p.dip >= dipTarget(G)) return win(G, p.id, 'dip');
  if (G.turn > G.limit) {
    let best = al[0], bs = -1;
    for (const p of al) { const s = score(G, p.id); if (s > bs) { bs = s; best = p; } }
    return win(G, best.id, 'score');
  }
  return null;
}
function win(G, pid, type) {
  G.over = true;
  G.winner = { pid, type, turn: G.turn };
  note(G, -2, `${sectName(G, pid)[0]}以「${VICTORIES[type].n[0]}」稱霸江湖！`, `${sectName(G, pid)[1]} wins: ${VICTORIES[type].n[1]}!`, -1, 'victory');
  return G.winner;
}

// ------------------------------------------------------------------ the whole turn
// steps the UI can run one at a time (so the page never freezes); ai is the computer player function
export function turnSteps(G, ai) {
  const steps = [];
  const human = G.players.find((p) => p.human && p.alive);
  if (human) steps.push({ label: ['結束回合', 'Ending turn'], run: () => { if (G.settings?.autoStrike !== false) autoCityStrikes(G, human.id); endOfTurnFor(G, human.id); } });
  for (const p of G.players) {
    if (!p.alive || p.human) continue;
    steps.push({ label: SECTS[p.sect].n, pid: p.id, run: () => { if (p.alive) { ai(G, p.id); endOfTurnFor(G, p.id); } } });
  }
  steps.push({ label: ['江湖動靜', 'The jianghu stirs'], run: () => neutralTurn(G) });
  steps.push({ label: ['新的一季', 'A new season'], run: () => newTurn(G) });
  return steps;
}
export function newTurn(G) {
  for (const p of G.players) if (p.alive) {
    for (const k of Object.keys(p.griev)) p.griev[k] = Math.max(0, p.griev[k] - 0.25);
    p.ai.lostRecently = Math.max(0, (p.ai.lostRecently || 0) - 1);
  }
  checkVictory(G);
  if (G.over) return;
  G.turn++;
  beginTurnAll(G);
  for (const p of G.players) if (p.alive) CORE_check(G, p);
  if (G.turn >= G.congress.next && alivePlayers(G).length > 1 && !G.congress.session) {
    startCongress(G);
    if (!G.players.some((p) => p.human && p.alive)) resolveCongress(G, null);
  }
  checkVictory(G);
}
function CORE_check(G, p) {
  const { checkElimination } = UNITS_MOD;
  checkElimination(G, p);
}
import * as UNITS_MOD from './units.js?v=2';
export function runWholeTurn(G, ai) {
  for (const s of turnSteps(G, ai)) { if (G.over) break; s.run(); }
}
