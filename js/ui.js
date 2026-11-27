// In-game interface: HUD, map input, unit and city panels, the trees, diplomacy, the Assembly, villages,
// heroes, overview, menus, notifications and the turn flow.
import {
  SECTS, SECT_IDS, UNITS, BUILDINGS, WONDERS, PROJECTS, TECHS, CIVICS, GOVS, POLICIES, SLOT_NAMES, HEROES, GREAT, GP_KEYS, VILLAGE_KINDS,
  RESOLUTIONS, ALIGN, DIFFICULTY, SIZES, MAPTYPES, SPEEDS, VICTORIES, TERRAIN, TERRAIN_IDS, RESOURCES, RES_IDS, IMPROVEMENTS, IMP_IDS,
  ERAS, SEASONS, PROMOS, YNAME, ENVOY_TIERS, LEADER_HERO,
} from './data.js?v=4';
import * as C from './core.js?v=4';
import * as U from './units.js?v=4';
import * as W from './world.js?v=4';
import { aiTurn } from './ai.js?v=4';
import { L, T, getLang, setLang } from './i18n.js?v=4';
import { KEY } from './art.js?v=4';
import { spriteKey, rgba } from './render.js?v=4';
import { dist, within } from './hex.js?v=4';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10);
const sgn = (n) => (n >= 0 ? '+' : '') + fmt(n);
const YI = { f: '糧', p: '產', g: '銀', s: '武', c: '俠' };

export class UI {
  constructor(app) {
    this.app = app; this.view = app.view; this.snd = app.snd;
    this.sel = null; this.pending = null; this.mode = null; this.cityOpen = null; this.busy = false;
    this.seenLog = 0; this.lastTap = { i: -1, t: 0 };
    this.bindStatic();
  }
  get G() { return this.app.G; }
  get me() { return this.G.players.find((p) => p.human) || null; }
  get pid() { const m = this.me; return m ? m.id : -1; }

  // ------------------------------------------------------------------ setup of the HUD
  bindStatic() {
    $('#endBtn').onclick = () => this.endButton();
    $('#endForce').onclick = () => this.endTurn(true);
    $('#zoomIn').onclick = () => { this.view.zoomAt(1.25, this.view.vw / 2, this.view.vh / 2); this.app.kick(); };
    $('#zoomOut').onclick = () => { this.view.zoomAt(0.8, this.view.vw / 2, this.view.vh / 2); this.app.kick(); };
    $('#homeBtn').onclick = () => { const c = this.me && C.cityById(this.G, this.me.capital); if (c) { this.view.centerOn(c.i, true); this.app.kick(); } };
    $('#yieldBtn').onclick = () => { this.view.showYields = !this.view.showYields; this.refreshYieldTiles(); this.app.kick(); };
    for (const b of document.querySelectorAll('[data-screen]')) b.onclick = () => this.openScreen(b.dataset.screen);
    $('#mini').addEventListener('pointerdown', (e) => this.miniClick(e));
    document.addEventListener('keydown', (e) => this.key(e));
  }
  startGame() {
    const G = this.G;
    this.sel = null; this.pending = null; this.mode = null; this.closeCity();
    G.hooks = { onCombat: (ev) => this.onCombat(ev), onWar: (a, b) => { if (a === this.pid || b === this.pid) { this.snd.sfx('war'); this.app.music(); } }, onMeet: () => {} };
    G.settings = G.settings || { autoStrike: true };
    this.view.spectate = !this.me;
    this.view.buildLabel = (c) => { if (c.owner !== this.pid) return ''; if (!c.build) return '—'; const n = this.itemName(c.build); const tt = this.turnsFor(c, c.build); return n + ' ' + tt; };
    $('#hud').hidden = false;
    this.seenLog = G.log.length;
    const home = this.me ? (C.cityById(G, this.me.capital) || G.units.find((u) => u.owner === this.pid)) : null;
    if (home) this.view.centerOn(home.i); else this.view.centerOn(Math.floor(G.map.h / 2) * G.map.w + Math.floor(G.map.w / 2));
    this.refresh();
    this.drawMini();
    if (this.me) { const u = this.nextUnit(); if (u) this.select(u, true); }
    this.afterTurnPopups();
  }

  // ------------------------------------------------------------------ HUD refresh
  refresh() {
    const G = this.G; if (!G) return;
    const p = this.me;
    const top = $('#yields');
    const yr = 1 + Math.floor((G.turn - 1) / 4), se = SEASONS[(G.turn - 1) % 4];
    $('#date').textContent = `${T('year', yr, L(se))} · ${T('turn')} ${G.turn}/${G.limit}`;
    if (p) {
      const y = p.lastY || {};
      top.innerHTML = [
        ['g', T('gold'), fmt(p.gold), sgn(y.g || 0)],
        ['s', T('insight'), '', sgn(y.s || 0)],
        ['c', T('renown'), fmt(p.renown), sgn(y.c || 0)],
        ['L', T('legend'), fmt(p.legend), sgn(y.legend || 0)],
        ['F', T('favour'), fmt(p.favour), ''],
      ].map(([k, n, v, d]) => `<span class="yi y-${k}" title="${esc(n)}"><b>${{ g: '銀', s: '武', c: '俠', L: '傳', F: '情' }[k]}</b>${v ? `<i>${v}</i>` : ''}<em>${d}</em></span>`).join('');
      $('#sectBadge').innerHTML = `<span class="seal" style="background:${p.col}">${esc(L(SECTS[p.sect].n).slice(0, 2))}</span>`;
      // research and rules progress
      const tp = p.tech ? Math.min(1, (p.tprog[p.tech] || 0) / C.techCost(G, p, p.tech)) : 0;
      const cp = p.civic ? Math.min(1, (p.cprog[p.civic] || 0) / C.civicCost(G, p, p.civic)) : 0;
      const tt = p.tech ? Math.max(1, Math.ceil((C.techCost(G, p, p.tech) - (p.tprog[p.tech] || 0)) / Math.max(1, y.s || 1))) : 0;
      const ct = p.civic ? Math.max(1, Math.ceil((C.civicCost(G, p, p.civic) - (p.cprog[p.civic] || 0)) / Math.max(1, y.c || 1))) : 0;
      $('#prog').innerHTML = `<button class="pbar t" data-s="tech"><span style="width:${tp * 100}%"></span><b>武</b>${p.tech ? esc(L(TECHS[p.tech].n)) + ' · ' + T('nturns', tt) : `<u>${T('chooseResearch')}</u>`}</button>`
        + `<button class="pbar c" data-s="rules"><span style="width:${cp * 100}%"></span><b>規</b>${p.civic ? esc(L(CIVICS[p.civic].n)) + ' · ' + T('nturns', ct) : `<u>${T('chooseCivic')}</u>`}</button>`;
      for (const b of $('#prog').querySelectorAll('button')) b.onclick = () => this.openScreen(b.dataset.s);
    } else {
      top.innerHTML = `<span class="yi"><b>觀</b><i>${T('watch')}</i></span>`;
      $('#sectBadge').innerHTML = '';
      $('#prog').innerHTML = '';
    }
    const cg = $('#btnCongress'); if (cg) cg.classList.toggle('alert', !!(G.congress.session));
    const vb = $('#btnVillages'); if (vb) vb.classList.toggle('alert', !!(p && p.envoys > 0));
    const hb = $('#btnHeroes'); if (hb) hb.classList.toggle('alert', !!(p && p.renown >= U.heroCost(G, p) && U.availableHeroes(G).length));
    this.updateEnd();
    this.renderUnitPanel();
    if (this.cityOpen) this.renderCity();
    this.app.kick();
  }
  updateEnd() {
    const b = $('#endBtn'); if (!b) return;
    const st = this.endState();
    b.innerHTML = `<span>${st.label}</span><small>${T('turn')} ${this.G.turn}</small>`;
    b.className = 'end ' + st.k;
    $('#endForce').hidden = !(this.me && st.k !== 'end');
  }
  endState() {
    const G = this.G, p = this.me;
    if (this.busy) return { k: 'busy', label: T('waitAI') };
    if (G.over) return { k: 'over', label: T('victory') };
    if (!p) return { k: 'end', label: T('endTurn') };
    if (!p.tech && C.availableTechs(p).length) return { k: 'tech', label: T('chooseResearch') };
    if (!p.civic && C.availableCivics(p).length) return { k: 'civic', label: T('chooseCivic') };
    const c = G.cities.find((x) => x.owner === p.id && !x.build);
    if (c) return { k: 'city', label: T('chooseBuild'), c };
    const u = this.nextUnit();
    if (u) return { k: 'unit', label: T('nextUnit'), u };
    return { k: 'end', label: T('endTurn') };
  }
  endButton() {
    if (this.busy) return;
    const st = this.endState();
    this.snd.sfx('click');
    if (st.k === 'tech') return this.openScreen('tech');
    if (st.k === 'civic') return this.openScreen('rules');
    if (st.k === 'city') { this.view.centerOn(st.c.i, true); return this.openCity(st.c); }
    if (st.k === 'unit') return this.select(st.u, true);
    if (st.k === 'over') return this.showVictory();
    this.endTurn();
  }
  needsOrders(u) {
    if (u.owner !== this.pid || u.dead || u.mv <= 0 || u.order) return false;
    if (u.skip === this.G.turn) return false;
    return true;
  }
  wasFortified(u) { return u.order && u.order.k === 'fort'; }
  nextUnit() {
    const list = this.G.units.filter((u) => this.needsOrders(u));
    if (!list.length) return null;
    const cur = this.sel ? list.findIndex((u) => u.id === this.sel) : -1;
    return list[(cur + 1) % list.length];
  }

  // ------------------------------------------------------------------ selection and map input
  select(u, center) {
    this.sel = u ? u.id : null; this.pending = null; this.mode = null;
    this.view.sel = this.sel; this.view.path = null; this.view.range = null;
    if (u) { this.view.highlight = u.i; if (center) this.view.centerOn(u.i, true); this.showRange(u); this.snd.sfx('select', 0.6); }
    else this.view.highlight = null;
    this.renderUnitPanel(); this.updateEnd(); this.app.kick();
  }
  selUnit() { return this.sel ? C.unitById(this.G, this.sel) : null; }
  showRange(u) {
    const G = this.G; const r = [];
    if (u.owner === this.pid && C.isMilitary(C.udef(u))) {
      const rng = U.canRanged(G, u) ? U.rangeOf(G, u) : 1;
      for (const j of within(G.map.w, G.map.h, u.i, rng)) if (j !== u.i && G._vis[this.pid][j] && U.canAttackTile(G, u, j)) r.push([j, 'atk']);
    }
    this.view.range = r.length ? r : null;
  }
  tap(i, info) {
    const G = this.G; if (!G || this.busy) return;
    const now = performance.now();
    const dbl = this.lastTap.i === i && now - this.lastTap.t < 380;
    this.lastTap = { i, t: now };
    this.hideTip();
    if (i < 0) return;
    const u = this.selUnit();
    const p = this.me;
    // a city strike target
    if (this.mode && this.mode.k === 'strike') {
      const c = C.cityById(G, this.mode.c);
      if (c && U.cityTargets(G, c).includes(i)) { U.cityStrike(G, c, i); this.snd.sfx('arrow'); }
      this.mode = null; this.view.range = null; this.refresh(); return;
    }
    if (u && u.owner === this.pid && i !== u.i) {
      // attack?
      const d = U.defenderAt(G, u.owner, i);
      const hostileThere = d && this.view.visible(i) && (d.kind === 'city' || d.kind === 'village' || (d.u && d.u.owner !== u.owner));
      if (hostileThere && C.isMilitary(C.udef(u))) { this.prepareAttack(u, i, d); return; }
      // a caravan next to a city: open route
      const tc = C.cityAt(G, i);
      if (tc && C.udef(u).cls === 'trade' && dist(G.map.w, u.i, tc.i) <= 1 && U.canEstablish(G, u, tc)) { U.establishRoute(G, u, tc); this.snd.sfx('build'); this.select(null); this.refresh(); return; }
      // move: first tap previews, second tap confirms (desktop right-click moves at once)
      if (this.pending && this.pending.to === i || info && info.direct) { this.doMove(u, i); return; }
      if (dbl && !this.pending) { this.doMove(u, i); return; }
      const r = U.findPath(G, u, i, { known: true });
      if (!r) { this.toast(T('cannotReach')); this.pending = null; this.view.path = null; this.app.kick(); return; }
      this.pending = { to: i, r };
      this.view.path = { from: u.i, tiles: r.path, turns: r.turns };
      this.toast(T('turnsAway', r.turns) + ' · ' + T('confirmMove'), 1400);
      this.app.kick();
      return;
    }
    // select what is on the tile
    const mine = C.unitsAt(G, i).filter((o) => o.owner === this.pid);
    const city = C.cityAt(G, i);
    if (city && city.owner === this.pid && (dbl || !mine.length || (u && u.i === i && mine.length <= 1 && !this.cityOpen))) {
      if (mine.length && !dbl && !(u && u.i === i)) { this.select(mine[0]); return; }
      this.select(null); this.openCity(city); return;
    }
    if (mine.length) {
      let k = 0;
      if (u && u.i === i) k = (mine.findIndex((o) => o.id === u.id) + 1) % mine.length;
      this.select(mine[k]); return;
    }
    this.select(null);
    this.view.highlight = i;
    this.showTileInfo(i);
    this.app.kick();
  }
  doMove(u, i) {
    const G = this.G;
    const r = U.findPath(G, u, i, { known: true });
    this.pending = null; this.view.path = null;
    if (!r) return;
    const before = u.i;
    U.moveAlong(G, u, r.path);
    if (u.i !== i) u.order = { k: 'goto', to: i }; else u.order = null;
    if (u.i !== before) this.snd.sfx('move', 0.5);
    this.view.highlight = u.i;
    this.showRange(u);
    this.afterAction();
    // done moving? go to the next unit
    if (u.mv <= 0 && !u.dead && this.app.settings.autoNext !== false) { const n = this.nextUnit(); if (n && n.id !== u.id) setTimeout(() => { if (!this.busy && this.sel === u.id) this.select(n, true); }, 260); }
  }
  prepareAttack(u, i, d) {
    const G = this.G;
    const owner = d.kind === 'city' ? d.c.owner : d.kind === 'village' ? null : d.u.owner;
    // declaring war first
    if (d.kind === 'village' && !d.v.war[u.owner]) {
      return this.confirm(T('attackConfirm', L(d.v.name)), () => { d.v.war[u.owner] = true; for (const o of G.players) if (o.alive && o.id !== u.owner) U.addGriev(G, o.id, u.owner, 4); this.prepareAttack(u, i, d); });
    }
    if (owner !== null && owner >= 0 && !U.atWar(G, u.owner, owner)) {
      if (!W.canDeclareWar(G, u.owner, owner)) { this.toast(G.congress.noWar > G.turn ? L(RESOLUTIONS.r_purge.b) : T('cannotReach')); return; }
      return this.confirm(T('attackConfirm', L(C.sectName(G, owner))), () => { W.declareWar(G, u.owner, owner); this.refresh(); this.prepareAttack(u, i, d); });
    }
    let kind = U.canAttackTile(G, u, i);
    let via = null;
    if (!kind && !U.canRanged(G, u)) {
      // step next to it first
      const r = U.findPath(G, u, i, { attack: true, known: true });
      if (r && r.path.length >= 2) {
        via = r.path[r.path.length - 2];
        const pr = this.predictFrom(u, via, i);
        if (pr) return this.showAttack(u, i, pr, via, r);
      }
      this.toast(T('cannotReach')); return;
    }
    if (!kind) { this.toast(T('cannotReach')); return; }
    this.showAttack(u, i, U.predict(G, u, i), null);
  }
  predictFrom(u, from, j) {
    const G = this.G; const save = u.i, sm = u.mv;
    C.removeAt(G, u); u.i = from; C.addAt(G, u); u.mv = Math.max(1, u.mv);
    let pr = null; try { pr = U.predict(G, u, j); } finally { C.removeAt(G, u); u.i = save; C.addAt(G, u); u.mv = sm; }
    return pr;
  }
  showAttack(u, i, pr, via, r) {
    if (!pr) { this.toast(T('cannotReach')); return; }
    const G = this.G;
    const d = pr.d;
    const name = d.kind === 'city' ? L(d.c.name) : d.kind === 'village' ? L(d.v.name) : L(U.unitName(G, d.u));
    if (via !== null && r) this.view.path = { from: u.i, tiles: r.path, turns: r.turns, attack: true };
    const box = $('#attackBox');
    box.innerHTML = `<div class="atk-h">${T('attack')}：${esc(name)}</div>
      <div class="atk-row"><span>${esc(L(U.unitName(G, u)))}</span><b>${fmt(pr.sa)}</b><i>vs</i><b>${fmt(pr.sd)}</b><span>${esc(name)}</span></div>
      <div class="atk-row dmg"><span class="them">${T('dmgTo', pr.toDef)}</span><span class="us">${pr.toAtt ? T('dmgFrom', pr.toAtt) : ''}</span></div>
      <div class="atk-b"><button class="btn red" id="atkGo">${T('attack')}</button><button class="btn" id="atkNo">${T('cancel')}</button></div>`;
    box.hidden = false;
    $('#atkNo').onclick = () => { box.hidden = true; this.view.path = null; this.app.kick(); };
    $('#atkGo').onclick = () => {
      box.hidden = true; this.view.path = null;
      if (via !== null) { const rr = U.findPath(G, u, via, { known: true }); if (rr) U.moveAlong(G, u, rr.path); if (u.i !== via || u.mv <= 0) { this.afterAction(); return; } }
      const ev = U.attack(G, u, i);
      if (ev) this.snd.sfx(ev.kind === 'ranged' ? 'arrow' : 'hit');
      if (ev && ev.captured) this.snd.sfx('city');
      this.afterAction();
      if (!u.dead) this.showRange(u);
    };
    this.app.kick();
  }
  afterAction() {
    const G = this.G;
    C.updateVis(G, this.pid);
    for (const p of G.players) if (p.alive) U.checkElimination(G, p);
    W.checkVictory(G);
    this.flushNotes();
    this.refresh();
    if (G.over) this.showVictory();
  }
  onCombat(ev) { this.view.addCombat(ev); this.app.kick(); }

  // ------------------------------------------------------------------ keyboard
  key(e) {
    if (!this.G || $('#title') && !$('#title').hidden) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const v = this.view, k = e.key;
    const modal = !$('#modal').hidden;
    if (k === 'Escape') { if (modal) this.closeModal(); else if (this.cityOpen) this.closeCity(); else this.select(null); e.preventDefault(); return; }
    if (modal) return;
    const pan = 60 / v.z;
    if (k === 'ArrowLeft' || k === 'a') { v.cx -= pan; v.clampCam(); this.app.kick(); }
    else if (k === 'ArrowRight' || k === 'd') { v.cx += pan; v.clampCam(); this.app.kick(); }
    else if (k === 'ArrowUp' || k === 'w') { v.cy -= pan; v.clampCam(); this.app.kick(); }
    else if (k === 'ArrowDown' || k === 's') { v.cy += pan; v.clampCam(); this.app.kick(); }
    else if (k === '+' || k === '=') { v.zoomAt(1.2, v.vw / 2, v.vh / 2); this.app.kick(); }
    else if (k === '-') { v.zoomAt(1 / 1.2, v.vw / 2, v.vh / 2); this.app.kick(); }
    else if (k === 'Enter') { if (e.shiftKey) this.endTurn(true); else this.endButton(); }
    else if (k === ' ' || k === 'n') { const u = this.nextUnit(); if (u) this.select(u, true); e.preventDefault(); }
    else if (k === 'f') this.unitAction('fort');
    else if (k === 'z') this.unitAction('sleep');
    else if (k === 'x') this.unitAction('skip');
    else if (k === 'b') this.unitAction('found');
    else if (k === 'r') this.openScreen('tech');
    else if (k === 'c') this.openScreen('rules');
    else if (k === 'p') this.openScreen('diplo');
    else if (k === 'y') { v.showYields = !v.showYields; this.refreshYieldTiles(); this.app.kick(); }
    else if (k === 'h') $('#homeBtn').onclick();
  }

  // ------------------------------------------------------------------ tile info (tooltip)
  tileHTML(i) {
    const G = this.G, p = this.me;
    if (p && !p.exp[i]) return `<b>${T('unexplored')}</b>`;
    const t = C.ter(G, i);
    const y = C.tileYield(G, i, p);
    let h = `<b>${esc(L(TERRAIN[t].n))}</b>${G.map.river[i] ? ' · ' + T('river') : ''}`;
    h += `<div class="yl">${this.yieldStr(y)}</div>`;
    const r = C.resOf(G, i); if (r && (!p || C.resVisible(p, r))) h += `<div>${T('resource')}：${esc(L(RESOURCES[r].n))}</div>`;
    const imp = G.map.imp[i]; if (imp !== 255) h += `<div>${T('improvement')}：${esc(L(IMPROVEMENTS[IMP_IDS[imp]].n))}</div>`;
    const o = C.tileOwner(G, i); if (o >= 0) h += `<div>${T('owner')}：<span style="color:${G.players[o].col}">■</span> ${esc(L(C.sectName(G, o)))}</div>`;
    const v = C.villageAt(G, i); if (v) h += `<div>${esc(L(v.name))} · ${esc(L(VILLAGE_KINDS[v.kind].n))}${v.suz >= 0 ? ' · ' + T('patron') + ' ' + esc(L(C.sectName(G, v.suz))) : ''}</div>`;
    const camp = C.campAt(G, i); if (camp) h += `<div>${camp.kind === 'beast' ? (getLang() === 'zh' ? '獸穴' : 'Beast lair') : (getLang() === 'zh' ? '流寇山寨' : 'Bandit camp')}</div>`;
    if (!p || G._vis[p.id][i]) for (const u of C.unitsAt(G, i)) h += `<div>· ${esc(L(U.unitName(G, u)))} (${esc(L(C.sectName(G, u.owner)))}) ${u.hp}/100</div>`;
    return h;
  }
  yieldStr(y) { return ['f', 'p', 'g', 's', 'c'].filter((k) => y[k]).map((k) => `<span class="y-${k}">${YI[k]}${fmt(y[k])}</span>`).join(' '); }
  showTip(i, x, y) {
    const tip = $('#tip'); if (i < 0) { tip.hidden = true; return; }
    tip.innerHTML = this.tileHTML(i); tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(4, Math.min(window.innerWidth - w - 4, x + 14)) + 'px';
    tip.style.top = Math.max(4, Math.min(window.innerHeight - h - 4, y + 14)) + 'px';
  }
  hideTip() { $('#tip').hidden = true; }
  showTileInfo(i) {
    const panel = $('#unitPanel');
    panel.hidden = false; $('#hud').classList.add('unit-open');
    panel.innerHTML = `<div class="tileinfo">${this.tileHTML(i)}</div>`;
    const c = C.cityAt(this.G, i);
    if (c && c.owner !== this.pid) panel.innerHTML += `<div class="cityfo">${esc(L(c.name))} · ${T('pop')} ${c.pop} · ${T('defense')} ${fmt(U.cityStr(this.G, c))} · ${c.hp}/${C.cityMaxHp(c)}</div>`;
  }
  refreshYieldTiles() {
    const G = this.G, p = this.me;
    if (!this.view.showYields) { this.view.yieldTiles = null; return; }
    const out = [];
    for (let i = 0; i < G.map.w * G.map.h; i++) if (!p || p.exp[i]) out.push([i, C.tileYield(G, i, p)]);
    this.view.yieldTiles = out;
  }

  // ------------------------------------------------------------------ unit panel
  renderUnitPanel() {
    this._renderUnitPanel();
    const hud = $('#hud'); if (hud) hud.classList.toggle('unit-open', !$('#unitPanel').hidden);
  }
  _renderUnitPanel() {
    const panel = $('#unitPanel');
    const u = this.selUnit();
    if (!u || u.dead) { if (!this.view.highlight || this.view.highlight < 0 || this.sel) { panel.hidden = true; } if (this.sel && (!u || u.dead)) { this.sel = null; this.view.sel = null; } return; }
    const G = this.G, D = C.udef(u);
    const mine = u.owner === this.pid;
    const key = spriteKey(G, u);
    const isHero = !!u.hero, isGP = !!u.gp;
    const pic = this.view.portraitURL(key) || this.view.spriteURL(key, 3);
    const nm = L(U.unitName(G, u));
    const sub = isHero ? (getLang() === 'zh' ? '俠客' : 'Hero') : isGP ? L(GREAT[u.gp].n) : L(D.n);
    let stats = '';
    const bs = U.baseStr(G, u, false);
    if (bs > 0) stats += `<span title="${T('strength')}">⚔ ${fmt(bs)}</span>`;
    if (U.canRanged(G, u)) stats += `<span title="${T('rstrength')}">🏹 ${fmt(U.baseStr(G, u, true))} · ${U.rangeOf(G, u)}</span>`;
    stats += `<span title="${T('moves')}">👣 ${fmt(u.mv)}/${C.maxMoves(G, u)}</span><span title="${T('hp')}">❤ ${u.hp}</span>`;
    if (C.isMilitary(D) && u.owner >= 0) stats += `<span title="${T('xp')}">${T('level')} ${u.lvl} · ${u.xp}xp</span>`;
    const promos = u.promos.map((k) => `<em title="${esc(L(PROMOS[k].d))}">${esc(L(PROMOS[k].n))}</em>`).join('');
    let desc = '';
    if (isHero) { const H = C.heroDef(G, u.hero); desc = L(H.ab); }
    else if (isGP) desc = L(GREAT[u.gp].d);
    else if (D.d) desc = L(D.d);
    let acts = '';
    if (mine) {
      const A = [];
      if (u.pend) A.push(['promote', T('promote'), 'gold']);
      if (u.type === 'u_founder') A.push(['found', T('found'), U.canSettle(G, u) ? 'green' : 'dis']);
      if (isGP) A.push(['activate', T('activate'), U.canActivateGP(G, u) ? 'green' : 'dis']);
      if (D.cls === 'trade') { A.push(['autoroute', T('autoRoute'), '']); }
      if (U.canRanged(G, u) && C.isMilitary(D)) A.push(['ranged', T('ranged'), u.mv > 0 && !u.attacked ? 'red' : 'dis']);
      if (C.isMilitary(D)) A.push(['fort', T('fortify'), '']);
      A.push(['sleep', T('sleep'), '']);
      A.push(['skip', T('skip'), '']);
      const ut = U.upgradeTarget(G, u);
      if (ut) A.push(['upgrade', `${T('upgrade')} ${L(UNITS[ut].n)} (${U.upgradeCost(G, u, ut)}銀)`, this.me.gold >= U.upgradeCost(G, u, ut) && C.tileOwner(G, u.i) === u.owner ? '' : 'dis']);
      if (u.order) A.push(['cancel', T('cancelOrder'), '']);
      if (!isHero) A.push(['disband', T('disband'), 'dim']);
      acts = A.map(([k, n, cls]) => `<button class="btn ${cls}" data-a="${k}">${esc(n)}</button>`).join('');
    }
    panel.hidden = false;
    panel.innerHTML = `<div class="up-pic por" style="border-color:${u.owner >= 0 ? G.players[u.owner].col : '#333'}"><img src="${pic}" alt=""></div>
      <div class="up-body"><div class="up-name">${esc(nm)} <small>${esc(sub)}${u.owner !== this.pid ? ' · ' + esc(L(C.sectName(G, u.owner))) : ''}</small></div>
      <div class="up-stats">${stats}</div>${promos ? `<div class="up-promos">${promos}</div>` : ''}${desc ? `<div class="up-desc">${esc(desc)}</div>` : ''}
      <div class="up-acts">${acts}</div></div>`;
    for (const b of panel.querySelectorAll('[data-a]')) b.onclick = () => this.unitAction(b.dataset.a);
  }
  unitAction(a) {
    const u = this.selUnit(); const G = this.G;
    if (!u || u.owner !== this.pid) return;
    this.snd.sfx('click', 0.6);
    switch (a) {
      case 'found': if (U.canSettle(G, u)) { const c = U.settle(G, u); this.snd.sfx('city'); this.select(null); this.view.invalidateAll(); this.afterAction(); if (c) this.openCity(c); } else this.toast(getLang() === 'zh' ? '這裡不能建城（離其他城市或村寨太近，或不是平地）。' : 'Cannot found here (too close to another city or village, or not open land).'); return;
      case 'fort': U.fortify(G, u); break;
      case 'sleep': U.sleep(G, u); u.order.heal = u.hp < 100; break;
      case 'skip': u.skip = G.turn; break;
      case 'cancel': u.order = null; break;
      case 'disband': return this.confirm(getLang() === 'zh' ? '確定解散這支部隊？' : 'Disband this unit?', () => { C.killUnit(G, u); this.select(null); this.refresh(); });
      case 'upgrade': if (!U.upgradeUnit(G, u)) this.toast(getLang() === 'zh' ? '需要在我方境內，且有足夠的銀兩。' : 'Must be inside our borders with enough silver.'); this.refresh(); return;
      case 'activate': if (U.activateGP(G, u)) { this.snd.sfx('gong'); this.select(null); this.afterAction(); } else this.toast(getLang() === 'zh' ? '奇人要在我方境內才能施展。' : 'Great people act only inside our borders.'); return;
      case 'promote': return this.promoDialog(u);
      case 'ranged': {
        const r = []; const rng = U.rangeOf(G, u);
        for (const j of within(G.map.w, G.map.h, u.i, rng)) if (U.canAttackTile(G, u, j)) r.push([j, 'atk']);
        if (!r.length) { this.toast(getLang() === 'zh' ? '射程內沒有目標。' : 'No targets in range.'); return; }
        this.view.range = r; this.app.kick(); this.toast(getLang() === 'zh' ? '點選目標' : 'Tap a target'); return;
      }
      case 'autoroute': {
        const ts = U.routeTargets(G, u);
        if (G.players[u.owner].routes.length >= U.routeCap(G, G.players[u.owner])) { this.toast(getLang() === 'zh' ? '鏢路已滿，多建鏢局可以增加容量。' : 'Route capacity is full; Escort Agencies add more.'); return; }
        if (!ts.length) { this.toast(getLang() === 'zh' ? '附近沒有可以走鏢的城市。' : 'No city in reach for a route.'); return; }
        return this.routeDialog(u, ts);
      }
    }
    if (a === 'fort' || a === 'sleep' || a === 'skip') { const n = this.nextUnit(); if (n) this.select(n, true); else this.select(null); }
    this.refresh();
  }
  promoDialog(u) {
    const G = this.G;
    const opts = U.promoOptions(G, u);
    this.modal(`<h2>${T('promote')}：${esc(L(U.unitName(G, u)))}</h2><div class="cards">${opts.map((k) => `<button class="card" data-k="${k}"><b>${esc(L(PROMOS[k].n))}</b><span>${esc(L(PROMOS[k].d))}</span></button>`).join('')}</div>`, (root) => {
      for (const b of root.querySelectorAll('[data-k]')) b.onclick = () => { U.promote(G, u, b.dataset.k); this.snd.sfx('build'); this.closeModal(); this.refresh(); };
    });
  }
  routeDialog(u, ts) {
    const G = this.G;
    this.modal(`<h2>${T('autoRoute')}</h2><div class="list">${ts.slice(0, 10).map((t, k) => `<button class="row" data-k="${k}"><b>${esc(L(t.c.name))}</b><span>${esc(L(C.sectName(G, t.c.owner)))}</span><span>+${t.g} 銀/${getLang() === 'zh' ? '回合' : 'turn'}</span><span>${t.d} ${getLang() === 'zh' ? '格' : 'tiles'}</span></button>`).join('')}</div>`, (root) => {
      for (const b of root.querySelectorAll('[data-k]')) b.onclick = () => {
        const t = ts[+b.dataset.k]; this.closeModal();
        if (dist(G.map.w, u.i, t.c.i) <= 1) { U.establishRoute(G, u, t.c); this.select(null); this.refresh(); return; }
        const r = U.findPath(G, u, t.c.i, { attack: true, known: true });
        if (!r) { this.toast(T('cannotReach')); return; }
        U.moveAlong(G, u, r.path.slice(0, -1));
        if (dist(G.map.w, u.i, t.c.i) <= 1) { U.establishRoute(G, u, t.c); this.select(null); }
        else { u.order = { k: 'goto', to: r.path[r.path.length - 2] }; u.routeTo = t.c.id; }
        this.refresh();
      };
    });
  }

  // ------------------------------------------------------------------ city panel
  openCity(c) {
    this.cityOpen = c.id; this.snd.sfx('select', 0.6);
    this.view.range = C.workable(this.G, c).map((j) => [j, c.worked.includes(j) ? 'work' : 'area']);
    this.view.highlight = c.i;
    $('#cityPanel').hidden = false; $('#hud').classList.add('city-open');
    this.renderCity(); this.app.kick();
  }
  closeCity() { this.cityOpen = null; const cp = $('#cityPanel'); if (cp) cp.hidden = true; $('#hud') && $('#hud').classList.remove('city-open'); if (this.view) { this.view.range = null; this.app && this.app.kick(); } }
  itemName(it) { return L(it.k === 'u' ? UNITS[it.id].n : it.k === 'b' ? BUILDINGS[it.id].n : it.k === 'w' ? WONDERS[it.id].n : PROJECTS[it.id].n); }
  turnsFor(c, it) {
    const G = this.G; const y = C.cityYield(G, c);
    const left = C.itemCost(G, c, it) - (c.build && c.build.k === it.k && c.build.id === it.id ? c.prod : 0);
    const r = C.itemRate(G, c, it, y.p);
    return T('nturns', Math.max(1, Math.ceil(left / Math.max(0.5, r))));
  }
  renderCity() {
    const G = this.G; const c = C.cityById(G, this.cityOpen);
    if (!c || c.owner !== this.pid) { this.closeCity(); return; }
    const p = this.me; const y = C.cityYield(G, c);
    const need = C.growthNeed(G, c);
    const gt = y.surplus > 0 ? Math.ceil((need - c.food) / y.surplus) : '∞';
    const opts = C.buildOptions(G, c);
    const groups = { u: [], b: [], w: [], p: [] };
    for (const it of opts) groups[it.k].push(it);
    const cur = c.build;
    const curCost = cur ? C.itemCost(G, c, cur) : 0;
    const bc = cur ? C.buyCost(G, c, cur) : Infinity;
    const itemRow = (it) => {
      const D = it.k === 'u' ? UNITS[it.id] : it.k === 'b' ? BUILDINGS[it.id] : it.k === 'w' ? WONDERS[it.id] : PROJECTS[it.id];
      let extra = '';
      if (it.k === 'u') { const s = []; if (D.str) s.push('⚔' + D.str); if (D.rstr) s.push('🏹' + D.rstr); s.push('👣' + D.mv); extra = s.join(' '); }
      else if (D.y) extra = this.yieldStr(D.y);
      const on = cur && cur.k === it.k && cur.id === it.id;
      const tip = esc(L(D.d || '') || '');
      return `<button class="item ${on ? 'on' : ''} ${D.sect ? 'uniq' : ''}" data-k="${it.k}" data-id="${it.id}" title="${tip}"><b>${esc(L(D.n))}</b><span class="ex">${extra}</span><span class="tt">${this.turnsFor(c, it)}</span>${tip ? `<small>${tip}</small>` : ''}</button>`;
    };
    const sec = (k, title) => groups[k].length ? `<h4>${title}</h4>${groups[k].map(itemRow).join('')}` : '';
    const bl = c.blds.map((b) => `<span class="bld" title="${esc(L(BUILDINGS[b].d || ''))}">${esc(L(BUILDINGS[b].n))}</span>`).join('');
    const wl = Object.keys(G.wonders).filter((w) => G.wonders[w].city === c.id).map((w) => `<span class="bld won" title="${esc(L(WONDERS[w].d))}">${esc(L(WONDERS[w].n))}</span>`).join('');
    const focus = ['bal', 'food', 'prod', 'gold', 'sci', 'cul'].map((f) => `<button class="chip ${c.focus === f ? 'on' : ''}" data-f="${f}">${T('f_' + f)}</button>`).join('');
    const canStrike = U.cityTargets(G, c).length > 0;
    $('#cityPanel').innerHTML = `<div class="cp-head" style="border-color:${p.col}"><button class="x" id="cpClose">✕</button>
      <h3>${c.capital ? '★ ' : ''}${esc(L(c.name))}</h3><div class="cp-sub">${T('pop')} ${c.pop} · ${T('defense')} ${fmt(U.cityStr(G, c))} · ${c.hp}/${C.cityMaxHp(c)}</div></div>
      <div class="cp-yields">${['f', 'p', 'g', 's', 'c'].map((k) => `<span class="y-${k}"><b>${YI[k]}</b>${fmt(k === 'f' ? y.surplus : y[k])}</span>`).join('')}${y.legend ? `<span class="y-L"><b>傳</b>${fmt(y.legend)}</span>` : ''}</div>
      <div class="cp-grow"><div class="bar"><span style="width:${Math.min(100, c.food / need * 100)}%"></span></div><small>${T('growth')} ${fmt(c.food)}/${need} · ${typeof gt === 'number' ? T('turns', gt) : gt}</small></div>
      <div class="cp-build">${cur ? `<div class="cur"><b>${esc(this.itemName(cur))}</b><div class="bar p"><span style="width:${Math.min(100, c.prod / curCost * 100)}%"></span></div><small>${fmt(c.prod)}/${curCost} · ${this.turnsFor(c, cur)}</small>
        ${isFinite(bc) ? `<button class="btn gold ${p.gold >= bc ? '' : 'dis'}" id="cpBuy">${T('buy')} ${bc}銀</button>` : ''}</div>` : `<div class="cur none">${T('chooseBuild')}</div>`}
        ${canStrike ? `<button class="btn red" id="cpStrike">${T('strike')}</button>` : ''}</div>
      <div class="cp-focus"><small>${T('focus')}</small>${focus}</div>
      <div class="cp-list">${sec('p', T('projects'))}${sec('u', T('units'))}${sec('b', T('buildings'))}${sec('w', T('wonders'))}</div>
      <div class="cp-blds"><h4>${T('buildings')}</h4>${bl || '<i>—</i>'}${wl}</div>`;
    $('#cpClose').onclick = () => this.closeCity();
    for (const b of $('#cityPanel').querySelectorAll('.item')) b.onclick = () => { C.setBuild(G, c, { k: b.dataset.k, id: b.dataset.id }); this.snd.sfx('click'); this.renderCity(); this.updateEnd(); this.app.kick(); };
    for (const b of $('#cityPanel').querySelectorAll('[data-f]')) b.onclick = () => { c.focus = b.dataset.f; C.assignWork(G, c); this.view.range = C.workable(G, c).map((j) => [j, c.worked.includes(j) ? 'work' : 'area']); this.renderCity(); this.app.kick(); };
    const buy = $('#cpBuy'); if (buy) buy.onclick = () => { if (C.buyItem(G, c)) { this.snd.sfx('build'); this.flushNotes(); this.refresh(); } };
    const st = $('#cpStrike'); if (st) st.onclick = () => { this.mode = { k: 'strike', c: c.id }; this.view.range = U.cityTargets(G, c).map((j) => [j, 'atk']); this.closeCityKeep(); this.toast(getLang() === 'zh' ? '點選射擊目標' : 'Tap a target'); };
  }
  closeCityKeep() { this.cityOpen = null; $('#cityPanel').hidden = true; $('#hud').classList.remove('city-open'); this.app.kick(); }

  // ------------------------------------------------------------------ modal screens
  modal(html, bind, cls = '') {
    const m = $('#modal');
    m.innerHTML = `<div class="sheet ${cls}"><button class="x" id="mClose">✕</button>${html}</div>`;
    m.hidden = false;
    $('#mClose').onclick = () => this.closeModal();
    m.onclick = (e) => { if (e.target === m && !cls.includes('sticky')) this.closeModal(); };
    if (bind) bind(m);
  }
  closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; if (this.onModalClose) { const f = this.onModalClose; this.onModalClose = null; f(); } this.refresh(); }
  confirm(text, yes) {
    this.modal(`<p class="confirm">${esc(text)}</p><div class="row-b"><button class="btn red" id="cfYes">${T('confirm')}</button><button class="btn" id="cfNo">${T('cancel')}</button></div>`, () => {
      $('#cfYes').onclick = () => { this.closeModal(); yes(); };
      $('#cfNo').onclick = () => this.closeModal();
    }, 'small');
  }
  toast(s, ms = 2200) {
    const t = $('#toast'); t.textContent = s; t.hidden = false; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => { t.classList.remove('show'); t.hidden = true; }, ms);
  }
  openScreen(k) {
    this.snd.sfx('click', 0.6);
    if (!this.G) return;
    if (k === 'tech') return this.techScreen();
    if (k === 'rules') return this.rulesScreen();
    if (k === 'diplo') return this.diploScreen();
    if (k === 'congress') return this.congressScreen();
    if (k === 'villages') return this.villageScreen();
    if (k === 'heroes') return this.heroScreen();
    if (k === 'overview') return this.overviewScreen();
    if (k === 'menu') return this.app.menuScreen();
    if (k === 'log') return this.logScreen();
  }

  // ---- 武學 tree
  techScreen() {
    const G = this.G, p = this.me || G.players[0];
    const CW = 196, RH = 62, X0 = 14, Y0 = 14;
    const pos = (t) => [X0 + TECHS[t].x * CW, Y0 + TECHS[t].y * RH];
    let lines = '';
    for (const t of Object.keys(TECHS)) for (const r of TECHS[t].req) { const [x1, y1] = pos(r), [x2, y2] = pos(t); lines += `<path d="M${x1 + 150},${y1 + 25} C${x1 + 175},${y1 + 25} ${x2 - 20},${y2 + 25} ${x2},${y2 + 25}" class="${p.techs[t] ? 'done' : p.techs[r] ? 'av' : ''}"/>`; }
    const unl = (t) => {
      const a = [];
      for (const u of Object.keys(UNITS)) if (UNITS[u].tech === t && (!UNITS[u].sect || UNITS[u].sect === p.sect) && !(SECTS[p.sect].uu && UNITS[SECTS[p.sect].uu].rep === u)) a.push(L(UNITS[u].n));
      for (const b of Object.keys(BUILDINGS)) if (BUILDINGS[b].tech === t && (!BUILDINGS[b].sect || BUILDINGS[b].sect === p.sect) && !(SECTS[p.sect].ub && BUILDINGS[SECTS[p.sect].ub].rep === b)) a.push(L(BUILDINGS[b].n));
      for (const w of Object.keys(WONDERS)) if (WONDERS[w].tech === t) a.push('◆' + L(WONDERS[w].n));
      for (const r of Object.keys(RESOURCES)) if (RESOURCES[r].tech === t) a.push(L(RESOURCES[r].n));
      return a.join('、');
    };
    const ys = p.lastY ? p.lastY.s : 1;
    const queue = p.tq || [];
    let nodes = '';
    const maxX = Math.max(...Object.values(TECHS).map((t) => t.x));
    for (const [t, D] of Object.entries(TECHS)) {
      const [x, y] = pos(t);
      const st = p.techs[t] ? 'done' : p.tech === t ? 'cur' : D.req.every((r) => p.techs[r]) ? 'av' : 'lock';
      const cost = C.techCost(G, p, t);
      const prog = p.tprog[t] || 0;
      const turns = p.techs[t] ? '' : T('nturns', Math.max(1, Math.ceil((cost - prog) / Math.max(1, ys))));
      const q = queue.indexOf(t);
      nodes += `<button class="tnode ${st}" data-t="${t}" style="left:${x}px;top:${y}px" title="${esc(L(D.d || ''))}"><b>${esc(L(D.n))}</b><span class="era">${esc(L(ERAS[D.era]))}</span>${turns ? `<span class="tt">${turns}</span>` : ''}${q >= 0 ? `<span class="q">${q + 1}</span>` : ''}<small>${esc(unl(t))}</small>${prog && !p.techs[t] ? `<i style="width:${Math.min(100, prog / cost * 100)}%"></i>` : ''}</button>`;
    }
    const w = X0 + maxX * CW + 170, h = Y0 + 8 * RH + 10;
    this.modal(`<h2>${T('research')} <small>${p.tech ? T('current') + '：' + esc(L(TECHS[p.tech].n)) : ''} · ${YI.s} ${sgn(ys)}/${getLang() === 'zh' ? '回合' : 'turn'}</small></h2>
      <div class="tree-wrap"><div class="tree" style="width:${w}px;height:${h}px"><svg width="${w}" height="${h}">${lines}</svg>${nodes}</div></div>`, (root) => {
      for (const b of root.querySelectorAll('.tnode')) b.onclick = () => {
        if (!this.me) return;
        const t = b.dataset.t; if (p.techs[t]) return;
        this.setResearchPath(p, t); this.snd.sfx('tech'); this.closeModal();
      };
      const cur = root.querySelector('.tnode.cur') || root.querySelector('.tnode.av');
      if (cur) root.querySelector('.tree-wrap').scrollLeft = Math.max(0, cur.offsetLeft - 200);
    }, 'wide');
  }
  setResearchPath(p, t) {
    const need = [];
    const visit = (x) => { if (p.techs[x] || need.includes(x)) return; for (const r of TECHS[x].req) visit(r); need.push(x); };
    visit(t);
    const first = need.find((x) => TECHS[x].req.every((r) => p.techs[r]));
    p.tech = first; p.tq = need.filter((x) => x !== first);
  }

  // ---- 門規 (rules): government, policy cards, the rules tree
  rulesScreen() {
    const G = this.G, p = this.me || G.players[0];
    const govs = C.unlockedGovs(p), pols = C.unlockedPolicies(p);
    const sl = GOVS[p.gov].slots;
    const used = new Set([].concat(...Object.values(p.pol)));
    let slots = '';
    for (const k of ['w', 'm', 'v', 'a']) for (let n = 0; n < sl[k]; n++) {
      const id = p.pol[k][n];
      slots += `<button class="slot s-${k}" data-slot="${k}" data-n="${n}"><small>${esc(L(SLOT_NAMES[k]))}</small>${id ? `<b>${esc(L(POLICIES[id].n))}</b><span>${esc(L(POLICIES[id].d))}</span>` : '<i>—</i>'}</button>`;
    }
    const cards = pols.map((id) => `<button class="pcard s-${POLICIES[id].slot} ${used.has(id) ? 'used' : ''}" data-p="${id}"><small>${esc(L(SLOT_NAMES[POLICIES[id].slot]))}</small><b>${esc(L(POLICIES[id].n))}</b><span>${esc(L(POLICIES[id].d))}</span></button>`).join('');
    const gv = govs.map((g) => `<button class="gcard ${p.gov === g ? 'on' : ''}" data-g="${g}"><b>${esc(L(GOVS[g].n))}</b><span>${esc(L(GOVS[g].d))}</span><small>${['w', 'm', 'v', 'a'].map((k) => L(SLOT_NAMES[k]) + GOVS[g].slots[k]).join(' ')}</small></button>`).join('');
    // civic tree
    const CW = 196, RH = 58, X0 = 14, Y0 = 14;
    const pos = (t) => [X0 + CIVICS[t].x * CW, Y0 + CIVICS[t].y * RH];
    let lines = '';
    for (const t of Object.keys(CIVICS)) for (const r of CIVICS[t].req) { const [x1, y1] = pos(r), [x2, y2] = pos(t); lines += `<path d="M${x1 + 160},${y1 + 22} C${x1 + 180},${y1 + 22} ${x2 - 16},${y2 + 22} ${x2},${y2 + 22}" class="${p.civics[t] ? 'done' : p.civics[r] ? 'av' : ''}"/>`; }
    const yc = p.lastY ? p.lastY.c : 1;
    let nodes = '';
    for (const [t, D] of Object.entries(CIVICS)) {
      const [x, y] = pos(t);
      const st = p.civics[t] ? 'done' : p.civic === t ? 'cur' : D.req.every((r) => p.civics[r]) ? 'av' : 'lock';
      const cost = C.civicCost(G, p, t), prog = p.cprog[t] || 0;
      const un = [].concat((D.gov || []).map((g) => '◆' + L(GOVS[g].n)), (D.pol || []).map((x) => L(POLICIES[x].n))).join('、');
      nodes += `<button class="tnode civ ${st}" data-c="${t}" style="left:${x}px;top:${y}px" title="${esc(L(D.d || ''))}"><b>${esc(L(D.n))}</b>${!p.civics[t] ? `<span class="tt">${T('nturns', Math.max(1, Math.ceil((cost - prog) / Math.max(1, yc))))}</span>` : ''}<small>${esc(un)}</small>${prog && !p.civics[t] ? `<i style="width:${Math.min(100, prog / cost * 100)}%"></i>` : ''}</button>`;
    }
    const w = X0 + 6 * CW + 175, h = Y0 + 4 * RH + 10;
    this.modal(`<h2>${T('rules')} <small>${YI.c} ${sgn(yc)}/${getLang() === 'zh' ? '回合' : 'turn'}</small></h2>
      <h4>${T('government')}</h4><div class="gov-row">${gv}</div>
      <h4>${T('policies')} <small>${getLang() === 'zh' ? '點選下方卡片放進空欄；點欄位可取下。' : 'Tap a card below to fill an empty slot; tap a slot to clear it.'}</small></h4><div class="slots">${slots}</div>
      <div class="pcards">${cards}</div>
      <h4>${getLang() === 'zh' ? '江湖規矩之樹' : 'Tree of the Jianghu Rules'}</h4>
      <div class="tree-wrap short"><div class="tree" style="width:${w}px;height:${h}px"><svg width="${w}" height="${h}">${lines}</svg>${nodes}</div></div>`, (root) => {
      if (!this.me) return;
      for (const b of root.querySelectorAll('[data-g]')) b.onclick = () => { C.setGov(G, p, b.dataset.g); this.snd.sfx('gong'); this.rulesScreen(); };
      for (const b of root.querySelectorAll('[data-slot]')) b.onclick = () => { const k = b.dataset.slot, n = +b.dataset.n; const pol = JSON.parse(JSON.stringify(p.pol)); pol[k].splice(n, 1); C.setPolicies(G, p, pol); this.rulesScreen(); };
      for (const b of root.querySelectorAll('[data-p]')) b.onclick = () => {
        const id = b.dataset.p; const pol = JSON.parse(JSON.stringify(p.pol));
        if (used.has(id)) { for (const k of Object.keys(pol)) pol[k] = pol[k].filter((x) => x !== id); }
        else {
          const k = POLICIES[id].slot;
          if (pol[k].length < sl[k]) pol[k].push(id);
          else if (pol.a.length < sl.a) pol.a.push(id);
          else { if (sl[k] > 0) pol[k][sl[k] - 1] = id; else if (sl.a > 0) pol.a[sl.a - 1] = id; else { this.toast(getLang() === 'zh' ? '沒有能放這張門規的欄位。' : 'No slot can take this rule.'); return; } }
        }
        C.setPolicies(G, p, pol); this.snd.sfx('click'); this.rulesScreen();
      };
      for (const b of root.querySelectorAll('[data-c]')) b.onclick = () => {
        const t = b.dataset.c; if (p.civics[t]) return;
        const need = []; const visit = (x) => { if (p.civics[x] || need.includes(x)) return; for (const r of CIVICS[x].req) visit(r); need.push(x); }; visit(t);
        p.civic = need.find((x) => CIVICS[x].req.every((r) => p.civics[r])); p.cq = need.filter((x) => x !== p.civic);
        this.snd.sfx('tech'); this.rulesScreen();
      };
    }, 'wide');
  }

  // ---- diplomacy
  diploScreen() {
    const G = this.G, me = this.me;
    const rows = G.players.filter((o) => !me || o.id !== me.id).map((o) => {
      const S = SECTS[o.sect];
      const met = !me || me.met[o.id] !== undefined;
      if (!met) return `<div class="drow unmet"><div class="dpor q">?</div><div class="dmain"><b>${T('notMet')}</b></div></div>`;
      const por = this.view.portraitURL(S.leader);
      let rel = '', att = '', acts = '';
      if (me) {
        const r = me.rel[o.id];
        rel = r === 'war' ? `<span class="tag war">${T('war')}</span>` : r === 'ally' ? `<span class="tag ally">${T('ally')}</span>` : `<span class="tag">${T('peace')}</span>`;
        if (me.pact[o.id] > G.turn) rel += ` <span class="tag pact">${T('pact')}</span>`;
        const a = W.attitude(G, o.id, me.id);
        att = `<span class="att" title="${esc(a.why.map(([v, z, e]) => (v > 0 ? '+' : '') + v + ' ' + (getLang() === 'zh' ? z : e)).join('\n'))}">${T('attitude')}：${esc(L(W.attitudeWord(a.v)))} (${a.v > 0 ? '+' : ''}${a.v})</span>`;
        const A = [];
        if (o.alive) {
          if (r === 'war') A.push(['peace', T('makePeace'), '']);
          else {
            A.push(['war', T('declareWar'), 'red']);
            if (r !== 'ally') A.push(['ally', T('proposeAlly'), W.canAlly(G, me.id, o.id) ? '' : 'dis']);
            if (W.canPact(G, me.id, o.id)) A.push(['pact', T('pact'), '']);
            A.push(['denounce', T('denounce'), 'dim']);
          }
          A.push(['gift', T('gift'), me.gold >= 50 ? 'gold' : 'dis']);
        }
        acts = A.map(([k, n, c2]) => `<button class="btn ${c2}" data-d="${k}" data-o="${o.id}">${n}</button>`).join('');
      }
      const cities = G.cities.filter((c) => c.owner === o.id).length;
      return `<div class="drow ${o.alive ? '' : 'dead'}"><div class="dpor" style="border-color:${o.col}"><img src="${por}" alt=""></div>
        <div class="dmain"><b style="color:${o.col}">${esc(L(S.n))}</b> <small>${esc(L(S.ln))} · ${esc(L(ALIGN[S.al]))}</small><div>${rel} ${att}</div>
        <div class="dstat">${T('city')} ${cities} · ${T('score')} ${W.score(G, o.id)} · ${esc(L(ERAS[o.era]))}${o.alive ? '' : ' · ✝'}</div>
        <div class="dab"><i>${esc(L(S.ab.n))}</i>：${esc(L(S.ab.d))}</div><div class="dacts">${acts}</div></div></div>`;
    }).join('');
    this.modal(`<h2>${T('diplomacy')}</h2><div class="dlist">${rows}</div>`, (root) => {
      for (const b of root.querySelectorAll('[data-d]')) b.onclick = () => this.diploAction(b.dataset.d, +b.dataset.o);
    }, 'wide');
  }
  diploAction(k, o) {
    const G = this.G, me = this.me;
    const say = (yes, z, e) => this.toast(`${L(C.leaderName(G, o))}：「${getLang() === 'zh' ? z : e}」`, 3200);
    if (k === 'war') return this.confirm(T('warConfirm', L(C.sectName(G, o))), () => { if (!W.declareWar(G, me.id, o)) this.toast(L(RESOLUTIONS.r_purge.b)); this.diploScreen(); this.refresh(); });
    if (k === 'peace') { const [y, z, e] = W.aiConsider(G, o, me.id, 'peace'); say(y, z, e); if (y) W.makePeace(G, me.id, o); }
    if (k === 'ally') { const [y, z, e] = W.aiConsider(G, o, me.id, 'ally'); say(y, z, e); if (y) W.makeAlliance(G, me.id, o); }
    if (k === 'pact') { const [y, z, e] = W.aiConsider(G, o, me.id, 'pact'); say(y, z, e); if (y) W.makePact(G, me.id, o); }
    if (k === 'gift') { if (W.giftGold(G, me.id, o, 50)) { const [y, z, e] = W.aiConsider(G, o, me.id, 'gift'); say(y, z, e); } }
    if (k === 'denounce') W.denounce(G, me.id, o);
    this.flushNotes(); this.diploScreen(); this.refresh();
  }

  // ---- the Wulin Assembly
  congressScreen() {
    const G = this.G, me = this.me, Cg = G.congress;
    const S = Cg.session;
    const sects = C.alivePlayers(G);
    const optRow = (r, k) => {
      const R = RESOLUTIONS[r.id];
      let tsel = '';
      if (R.target === 'sect') tsel = `<select data-t="${k}">${sects.map((o) => `<option value="${o.id}" ${me && o.id === me.id ? 'selected' : ''}>${esc(L(SECTS[o.sect].n))}</option>`).join('')}</select>`;
      if (R.target === 'align') tsel = `<select data-t="${k}">${[0, 1, 2].map((a) => `<option value="${a}" ${me && SECTS[me.sect].al === a ? 'selected' : ''}>${esc(L(ALIGN[a]))}</option>`).join('')}</select>`;
      return `<div class="res"><h4>${esc(L(R.n))}</h4><label><input type="radio" name="r${k}" value="a" checked> A：${esc(L(R.a))}</label><label><input type="radio" name="r${k}" value="b"> B：${esc(L(R.b))}</label>${tsel ? `<div>${T('target')}：${tsel}</div>` : ''}</div>`;
    };
    let body = '';
    if (S && me) {
      const votes = W.votesOf(G, me);
      body = `<p>${getLang() === 'zh' ? `第 ${S.n} 屆武林大會。你有 ${votes} 票。` : `The ${S.n}th Wulin Assembly. You hold ${votes} vote(s).`}</p>
        ${S.res.map(optRow).join('')}
        <div class="res"><h4>${T('leaderVote')}</h4><select id="cgLeader">${sects.map((o) => `<option value="${o.id}" ${o.id === me.id ? 'selected' : ''}>${esc(L(SECTS[o.sect].n))} (${o.dip}/${W.dipTarget(G)})</option>`).join('')}</select>
        <div>${T('buyVotes')}：<input type="range" id="cgExtra" min="0" max="5" value="0"> <span id="cgExtraV">0</span> <small id="cgCost"></small> (${T('favour')} ${fmt(me.favour)})</div></div>
        <div class="row-b"><button class="btn red" id="cgVote">${T('vote')}</button></div>`;
    } else {
      body = `<p>${T('nextCongress', Cg.next)}</p>`;
    }
    const act = Cg.active.map((r) => { const R = RESOLUTIONS[r.id]; const tgt = R.target === 'sect' && r.target >= 0 ? '（' + L(C.sectName(G, r.target)) + '）' : R.target === 'align' ? '（' + L(ALIGN[r.alignT]) + '）' : ''; return `<li><b>${esc(L(R.n))}${esc(tgt)}</b>：${esc(L(R[r.opt]))}</li>`; }).join('');
    const stand = C.alivePlayers(G).map((o) => `<li><span style="color:${o.col}">■</span> ${esc(L(SECTS[o.sect].n))}：${o.dip}/${W.dipTarget(G)} · ${T('votes')} ${W.votesOf(G, o)}</li>`).join('');
    const hist = Cg.history.slice(-4).reverse().map((h) => `<li>${getLang() === 'zh' ? '第' + h.n + '屆' : '#' + h.n} · ${T('turn')} ${h.turn}：${h.leader >= 0 ? esc(L(C.sectName(G, h.leader))) : '—'}</li>`).join('');
    this.modal(`<h2>${T('congress')}</h2>${body}<h4>${T('resolutions')}</h4><ul class="plain">${act || '<li>—</li>'}</ul><h4>${T('standing')}</h4><ul class="plain">${stand}</ul>${hist ? `<h4>${T('results')}</h4><ul class="plain">${hist}</ul>` : ''}`, (root) => {
      const ex = $('#cgExtra');
      if (ex) {
        const upd = () => { const n = +ex.value; let c = 0; for (let k = 1; k <= n; k++) c += W.voteCost(k); $('#cgExtraV').textContent = n; $('#cgCost').textContent = c + ' ' + T('favour'); };
        ex.oninput = upd; upd();
      }
      const vb = $('#cgVote');
      if (vb) vb.onclick = () => {
        const picks = S.res.map((r, k) => {
          const opt = root.querySelector(`input[name=r${k}]:checked`).value;
          const ts = root.querySelector(`select[data-t="${k}"]`);
          return { opt, target: ts ? +ts.value : null };
        });
        let extra = +$('#cgExtra').value; let cost = 0; for (let k = 1; k <= extra; k++) cost += W.voteCost(k); if (cost > me.favour) extra = 0;
        const res = W.resolveCongress(G, { picks, leader: +$('#cgLeader').value, extra });
        this.snd.sfx('gong');
        this.flushNotes();
        this.congressResult(res);
      };
    }, S ? 'sticky' : '');
  }
  congressResult(h) {
    const G = this.G;
    const rs = h.results.map((r) => { const R = RESOLUTIONS[r.id]; const tgt = R.target === 'sect' && r.target >= 0 ? '（' + L(C.sectName(G, r.target)) + '）' : R.target === 'align' ? '（' + L(ALIGN[r.alignT]) + '）' : ''; return `<li><b>${esc(L(R.n))}${esc(tgt)}</b> ${r.opt.toUpperCase()} (${r.a}:${r.b})：${esc(L(R[r.opt]))}</li>`; }).join('');
    const lv = Object.entries(h.leaderVotes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<li>${esc(L(C.sectName(G, +k)))}：${v}</li>`).join('');
    this.modal(`<h2>${T('congress')} · ${T('results')}</h2><ul class="plain">${rs}</ul><h4>${T('leaderVote')}</h4><ul class="plain">${lv}</ul>`, null);
    this.onModalClose = () => this.afterTurnPopups(true);
  }

  // ---- villages
  villageScreen() {
    const G = this.G, me = this.me;
    const vs = G.villages.filter((v) => v.alive && (!me || me.exp[v.i]));
    const rows = vs.map((v) => {
      const K = VILLAGE_KINDS[v.kind];
      const env = Object.entries(v.env).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span style="color:${G.players[k].col}">■</span>${esc(L(SECTS[G.players[k].sect].n))} ${n}`).join(' · ');
      const mine = me ? (v.env[me.id] || 0) : 0;
      return `<div class="vrow"><b>${esc(L(v.name))}</b> <small>${esc(L(K.n))}</small>${v.suz >= 0 ? ` · ${T('patron')}：<span style="color:${G.players[v.suz].col}">${esc(L(SECTS[G.players[v.suz].sect].n))}</span>` : ''}
        <div class="vd">${esc(L(K.d))}</div><div class="ve">${env || '—'}</div>
        ${me ? `<div>${T('envoys')} ${mine} / ${ENVOY_TIERS.join('·')} <button class="btn ${me.envoys > 0 ? '' : 'dis'}" data-v="${v.id}">${T('sendEnvoy')}</button> <button class="btn dim" data-c="${v.i}">◎</button></div>` : ''}</div>`;
    }).join('');
    this.modal(`<h2>${T('villages')} <small>${me ? T('envoys') + '：' + me.envoys : ''}</small></h2><p class="hint">${getLang() === 'zh' ? '每立下一條門規就得到使者。派到村寨的使者達 1、3、6 名時給你好處；使者最多（至少 3 名）的門派成為盟主，得到額外好處與它在武林大會的一票。' : 'Each sect rule adopted grants envoys. 1, 3 and 6 envoys in a village give you bonuses; the sect with the most (at least 3) becomes its patron, with an extra bonus and its vote at the Assembly.'}</p><div class="vlist">${rows || '—'}</div>`, (root) => {
      for (const b of root.querySelectorAll('[data-v]')) b.onclick = () => { if (U.sendEnvoy(G, me, G.villages[+b.dataset.v])) { this.snd.sfx('click'); this.flushNotes(); this.villageScreen(); this.refresh(); } };
      for (const b of root.querySelectorAll('[data-c]')) b.onclick = () => { this.closeModal(); this.view.centerOn(+b.dataset.c, true); this.view.highlight = +b.dataset.c; this.app.kick(); };
    });
  }

  // ---- heroes
  heroScreen() {
    const G = this.G, me = this.me;
    const av = U.availableHeroes(G);
    const cost = me ? U.heroCost(G, me) : 0;
    const mine = G.units.filter((u) => me && u.owner === me.id && u.hero);
    const card = (hid) => {
      const H = C.heroDef(G, hid);
      const por = this.view.portraitURL(H.spr);
      return `<div class="hcard"><img src="${por}" alt=""><b>${esc(L(H.n))}</b><span>⚔ ${H.str}${H.rstr ? ' 🏹' + H.rstr : ''}</span><small>${esc(L(H.ab))}</small>${me ? `<button class="btn ${me.renown >= cost ? 'gold' : 'dis'}" data-h="${hid}">${T('recruit')} ${cost}${YI.c}</button>` : ''}</div>`;
    };
    const taken = Object.entries(G.heroes).filter(([, h]) => h.by >= 0).map(([hid, h]) => `${esc(L(C.heroDef(G, hid).n))}（${esc(L(C.sectName(G, h.by)))}）`).join('、');
    this.modal(`<h2>${T('heroes')} <small>${me ? T('heroCost', cost, fmt(me.renown)) : ''}</small></h2>
      ${mine.length ? `<h4>${getLang() === 'zh' ? '我方俠客' : 'Our heroes'}</h4><div class="plain">${mine.map((u) => esc(L(U.unitName(G, u))) + ' Lv' + u.lvl).join('、')}</div>` : ''}
      <div class="hgrid">${av.map(card).join('') || T('noHeroes')}</div><p class="hint">${getLang() === 'zh' ? '已投效他派：' : 'Serving other sects: '}${taken || '—'}</p>
      <h4>${T('greatPeople')}</h4><div class="plain">${me ? GP_KEYS.map((k) => `${esc(L(GREAT[k].n))} ${fmt(me.gpp[k])}/${C.gpNeed(G, me, k)}`).join(' · ') : ''}</div><p class="hint">${me ? T('tales') + '：' + me.tales : ''}</p>`, (root) => {
      for (const b of root.querySelectorAll('[data-h]')) b.onclick = () => { const u = U.recruitHero(G, me, b.dataset.h); if (u) { this.snd.sfx('gong'); this.closeModal(); this.select(u, true); this.flushNotes(); } else this.toast(T('heroCost', cost, fmt(me.renown))); };
    }, 'wide');
  }

  // ---- overview: victory progress
  overviewScreen() {
    const G = this.G, me = this.me;
    const al = G.players.filter((o) => !me || o.id === me.id || me.met[o.id] !== undefined);
    const rows = al.map((o) => {
      const v = W.victoryProgress(G, o.id);
      return `<tr style="${o.alive ? '' : 'opacity:.45'}"><td><span style="color:${o.col}">■</span> ${esc(L(SECTS[o.sect].n))}</td><td>${v.dom.held}/${v.dom.need}</td><td>${v.sci.techs}/${v.sci.all}${v.sci.heaven ? ' · ' + v.sci.stage + '/3' : ''}</td><td>${fmt(v.cul.legend)} / ${fmt(v.cul.need)}</td><td>${v.dip.pts}/${v.dip.need}</td><td>${v.score}</td></tr>`;
    }).join('');
    const vd = Object.entries(VICTORIES).map(([k, V]) => `<li><b>${esc(L(V.n))}</b>：${esc(L(V.d))}</li>`).join('');
    this.modal(`<h2>${T('overview')} <small>${T('turn')} ${G.turn}/${G.limit}</small></h2>
      <table class="ov"><tr><th></th><th>${esc(L(VICTORIES.dom.n))}</th><th>${esc(L(VICTORIES.sci.n))}</th><th>${esc(L(VICTORIES.cul.n))}</th><th>${esc(L(VICTORIES.dip.n))}</th><th>${T('score')}</th></tr>${rows}</table>
      <h4>${T('victoryTypes')}</h4><ul class="plain">${vd}</ul>
      <div class="row-b"><button class="btn" id="ovLog">${T('summary')}</button></div>`, () => { $('#ovLog').onclick = () => this.logScreen(); }, 'wide');
  }
  logScreen() {
    const G = this.G;
    const items = G.log.filter((n) => n.pid === this.pid || n.pid === -2 || !this.me).slice(-60).reverse();
    this.modal(`<h2>${T('summary')}</h2><ul class="log">${items.map((n) => `<li class="k-${n.kind}" data-at="${n.at}"><small>${n.t}</small> ${esc(getLang() === 'zh' ? n.zh : n.en)}</li>`).join('') || `<li>${T('noNews')}</li>`}</ul>`, (root) => {
      for (const li of root.querySelectorAll('li[data-at]')) li.onclick = () => { const at = +li.dataset.at; if (at >= 0) { this.closeModal(); this.view.centerOn(at, true); this.view.highlight = at; this.app.kick(); } };
    });
  }

  // ------------------------------------------------------------------ notifications
  flushNotes() {
    const G = this.G;
    const fresh = G.log.slice(this.seenLog);
    this.seenLog = G.log.length;
    const box = $('#notes');
    for (const n of fresh) {
      if (this.me && n.pid !== this.pid && n.pid !== -2) continue;
      if (n.pid === -2 && n.at >= 0 && this.me && !this.me.exp[n.at] && n.kind !== 'world' && n.kind !== 'wonder') continue;
      const d = document.createElement('div');
      d.className = 'note k-' + n.kind;
      d.textContent = getLang() === 'zh' ? n.zh : n.en;
      d.onclick = () => { if (n.at >= 0) { this.view.centerOn(n.at, true); this.view.highlight = n.at; this.app.kick(); } d.remove(); };
      box.prepend(d);
      setTimeout(() => d.classList.add('fade'), 7000);
      setTimeout(() => d.remove(), 8200);
    }
    while (box.children.length > 6) box.lastChild.remove();
  }

  // ------------------------------------------------------------------ the turn
  async endTurn(force) {
    const G = this.G;
    if (this.busy || G.over) return;
    if (G.congress.session && this.me) { this.congressScreen(); return; }
    this.busy = true; this.select(null); this.closeCity(); this.updateEnd();
    this.snd.sfx('turn');
    const steps = W.turnSteps(G, aiTurn);
    const bar = $('#busy'); bar.hidden = false;
    const t0 = performance.now();
    for (let k = 0; k < steps.length; k++) {
      if (G.over) break;
      bar.innerHTML = `<div class="bz"><b>${esc(L(steps[k].label))}</b><div class="bar"><span style="width:${(k / steps.length) * 100}%"></span></div></div>`;
      bar.classList.toggle('show', performance.now() - t0 > 250);
      await new Promise((r) => setTimeout(r, 0));
      try { steps[k].run(); } catch (e) { console.error(e); }
    }
    bar.hidden = true; bar.classList.remove('show');
    this.busy = false;
    if (this.me) W.runOrders(G, this.pid);
    // escort orders: caravans that arrived open their route
    for (const u of G.units.filter((x) => x.owner === this.pid && x.routeTo !== undefined && !x.order)) { const c = C.cityById(G, u.routeTo); if (c && U.canEstablish(G, u, c)) U.establishRoute(G, u, c); delete u.routeTo; }
    if (this.me) C.updateVis(G, this.pid);
    this.view.refreshTerrain();
    if (this.view.showYields) this.refreshYieldTiles();
    this.app.autosave();
    this.flushNotes();
    this.drawMini();
    this.refresh();
    this.app.music();
    this.afterTurnPopups();
    if (!this.me && this.app.autoplay && !G.over) setTimeout(() => this.endTurn(), 30);
    else if (this.me) { const u = this.nextUnit(); if (u) this.select(u, true); }
  }
  afterTurnPopups(skipCongress) {
    const G = this.G;
    if (G.over) return this.showVictory();
    if (G.congress.session && this.me && !skipCongress) { this.snd.sfx('gong'); return this.congressScreen(); }
    if (G.proposals && G.proposals.length && this.me) {
      const q = G.proposals.shift();
      if (!G.players[q.from].alive) return this.afterTurnPopups(true);
      const S = SECTS[G.players[q.from].sect];
      const what = { peace: [`${L(S.ln)}派人前來議和。`, `${L(S.ln)} sends an envoy to propose peace.`], ally: [`${L(S.ln)}想與我們結為盟友。`, `${L(S.ln)} wishes to become our ally.`], pact: [`${L(S.ln)}想簽互市之約（雙方每回合 +2 銀）。`, `${L(S.ln)} proposes a trade pact (+2 silver a turn each).`] }[q.what];
      this.modal(`<h2>${T('proposal')}</h2><div class="prop"><img src="${this.view.portraitURL(S.leader)}" alt=""><p>${esc(getLang() === 'zh' ? what[0] : what[1])}</p></div><div class="row-b"><button class="btn green" id="pAcc">${T('accept')}</button><button class="btn" id="pDec">${T('decline')}</button></div>`, () => {
        $('#pAcc').onclick = () => { if (q.what === 'peace') W.makePeace(G, q.from, this.pid); if (q.what === 'ally') W.makeAlliance(G, q.from, this.pid); if (q.what === 'pact') W.makePact(G, q.from, this.pid); this.closeModal(); this.flushNotes(); };
        $('#pDec').onclick = () => { U.addGriev(G, q.from, this.pid, q.what === 'peace' ? 0 : 1); this.closeModal(); };
      }, 'small');
      this.onModalClose = () => this.afterTurnPopups(true);
      return;
    }
  }
  showVictory() {
    const G = this.G, w = G.winner; if (!w) return;
    const me = this.me;
    const won = me && w.pid === me.id;
    this.app.music();
    const rank = C.alivePlayers(G).concat(G.players.filter((p) => !p.alive)).map((o) => [o, W.score(G, o.id)]).sort((a, b) => b[1] - a[1]);
    const head = w.type === 'defeat' ? T('defeat') : won ? T('youWin') : (me ? T('youLose') : L(C.sectName(G, w.pid)) + ' · ' + T('victory'));
    const vt = VICTORIES[w.type];
    const por = w.pid >= 0 ? this.view.portraitURL(SECTS[G.players[w.pid].sect].leader) : '';
    this.modal(`<div class="victory ${won ? 'won' : 'lost'}"><h1>${esc(head)}</h1>${w.pid >= 0 ? `<div class="vic"><img src="${por}" alt=""><div><b style="color:${G.players[w.pid].col}">${esc(L(C.sectName(G, w.pid)))}</b><p>${esc(L(vt.n))} — ${esc(L(vt.d))}</p><p>${T('turn')} ${w.turn}</p></div></div>` : ''}
      <table class="ov">${rank.map(([o, s]) => `<tr><td><span style="color:${o.col}">■</span> ${esc(L(SECTS[o.sect].n))}</td><td>${s}</td><td>${G.cities.filter((c) => c.owner === o.id).length} ${T('city')}</td><td>${Object.keys(o.techs).length} ${T('research')}</td></tr>`).join('')}</table>
      <div class="row-b"><button class="btn" id="vKeep">${T('keepPlaying')}</button><button class="btn red" id="vNew">${T('newAfter')}</button></div></div>`, () => {
      $('#vKeep').onclick = () => this.closeModal();
      $('#vNew').onclick = () => { this.closeModal(); this.app.toTitle(); };
    }, 'sticky');
  }

  // ------------------------------------------------------------------ minimap
  drawMini() {
    const G = this.G; const cv = $('#mini'); if (!cv || !G) return;
    const w = G.map.w, h = G.map.h, s = 3;
    cv.width = w * s + s; cv.height = h * s;
    const g = cv.getContext('2d');
    g.fillStyle = '#d8caa4'; g.fillRect(0, 0, cv.width, cv.height);
    const p = this.me;
    for (let i = 0; i < w * h; i++) {
      if (p && !p.exp[i]) continue;
      const x = (i % w) * s + ((((i / w) | 0) & 1) ? s / 2 : 0), y = ((i / w) | 0) * s;
      const o = C.tileOwner(G, i);
      g.fillStyle = o >= 0 ? G.players[o].col : TERRAIN[TERRAIN_IDS[G.map.ter[i]]].col;
      g.fillRect(x, y, s, s);
    }
    for (const c of G.cities) if (!p || p.exp[c.i]) { const x = (c.i % w) * s, y = ((c.i / w) | 0) * s; g.fillStyle = '#fff'; g.fillRect(x - 1, y - 1, s + 2, s + 2); g.fillStyle = G.players[c.owner].col; g.fillRect(x, y, s, s); }
    this.miniScale = s;
  }
  miniClick(e) {
    const cv = $('#mini'); const r = cv.getBoundingClientRect();
    const G = this.G; const s = this.miniScale || 3;
    const x = (e.clientX - r.left) / r.width * cv.width / s, y = (e.clientY - r.top) / r.height * cv.height / s;
    const tx = Math.max(0, Math.min(G.map.w - 1, Math.floor(x))), ty = Math.max(0, Math.min(G.map.h - 1, Math.floor(y)));
    this.view.centerOn(ty * G.map.w + tx, true); this.app.kick();
    e.preventDefault();
  }
}
