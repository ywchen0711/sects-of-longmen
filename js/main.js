// Boot: assets, title and setup screens, saves, settings, map input and the render loop.
import { SECTS, SECT_IDS, UNITS, BUILDINGS, DIFFICULTY, SIZES, MAPTYPES, SPEEDS, VICTORIES, ALIGN } from './data.js?v=2';
import * as C from './core.js?v=2';
import * as W from './world.js?v=2';
import * as U from './units.js?v=2';
import { aiTurn } from './ai.js?v=2';
import { MapView } from './render.js?v=2';
import { UI } from './ui.js?v=2';
import { Sound } from './audio.js?v=2';
import { L, T, getLang, setLang } from './i18n.js?v=2';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SLOTS = ['auto', '1', '2', '3'];

class App {
  constructor() {
    this.snd = new Sound();
    this.settings = { anim: true, autoStrike: true, autoNext: true };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('sol_settings') || '{}')); } catch (e) {}
    this.G = null; this.autoplay = false;
  }
  async boot() {
    setLang(getLang());
    const load = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
    const [sprites, portraits] = await Promise.all([load('assets/sprites.png?v=1'), load('assets/portraits.png?v=1')]);
    this.view = new MapView($('#map'), { sprites, portraits });
    this.view.anim = this.settings.anim;
    this.ui = new UI(this);
    this.bindInput();
    window.addEventListener('resize', () => { this.view.resize(); this.paintTitle(); this.kick(); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { this.view.resize(); this.kick(); });
    window.addEventListener('pagehide', () => this.autosave());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.autosave(); });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    this.toTitle();
    $('#loading').remove();
    // test hook
    window.SOL = { app: this, C, W, U, aiTurn, start: (o) => this.start(o) };
  }
  kick() {
    if (this._raf) return;
    this._raf = requestAnimationFrame((t) => this.loop(t));
  }
  loop(t) {
    this._raf = 0;
    if (!this.G) return;
    const busy = this.view.frame(t);
    if (busy) this.kick();
  }
  saveSettings() { try { localStorage.setItem('sol_settings', JSON.stringify(this.settings)); } catch (e) {} }

  // ------------------------------------------------------------------ music by situation
  music() {
    const G = this.G;
    if (!G) return this.snd.play('menu');
    const me = G.players.find((p) => p.human);
    if (G.over && G.winner) return this.snd.play(me && G.winner.pid !== me.id ? 'defeat' : 'victory');
    if (G.congress.session) return this.snd.play('congress');
    if (me && Object.values(me.rel).includes('war')) return this.snd.play('war');
    this.snd.play('peace');
  }

  // ------------------------------------------------------------------ title
  toTitle() {
    this.G = null; this.autoplay = false;
    $('#hud').hidden = true; $('#modal').hidden = true;
    const t = $('#title'); t.hidden = false;
    const has = SLOTS.some((s) => this.slotMeta(s));
    t.innerHTML = `<canvas id="titleArt"></canvas><div class="t-inner">
      <h1 class="t-title"><span>${getLang() === 'zh' ? '龍門江湖志' : 'Sects of Longmen'}</span><small>${getLang() === 'zh' ? 'Sects of Longmen' : '龍門江湖志'}</small></h1>
      <p class="t-sub">${T('subtitle')}</p>
      <div class="t-menu">
        ${has ? `<button class="btn big" id="tCont">${T('cont')}</button>` : ''}
        <button class="btn big red" id="tNew">${T('newGame')}</button>
        <button class="btn" id="tLoad">${T('load')}</button>
        <button class="btn" id="tHelp">${T('help')}</button>
        <button class="btn" id="tSet">${T('settings')}</button>
        <button class="btn" id="tCred">${T('credits')}</button>
        <button class="btn" id="tLang">${getLang() === 'zh' ? 'English' : '中文'}</button>
      </div></div>`;
    this.paintTitle();
    if ($('#tCont')) $('#tCont').onclick = () => { const s = SLOTS.map((k) => [k, this.slotMeta(k)]).filter((a) => a[1]).sort((a, b) => b[1].time - a[1].time)[0]; if (s) this.loadSlot(s[0]); };
    $('#tNew').onclick = () => this.setupScreen();
    $('#tLoad').onclick = () => this.loadScreen();
    $('#tHelp').onclick = () => this.helpScreen();
    $('#tSet').onclick = () => this.settingsScreen();
    $('#tCred').onclick = () => this.creditsScreen();
    $('#tLang').onclick = () => { setLang(getLang() === 'zh' ? 'en' : 'zh'); this.toTitle(); };
    this.snd.play('menu');
  }
  paintTitle() {
    const cv = $('#titleArt'); if (!cv) return;
    const w = cv.clientWidth || window.innerWidth, h = cv.clientHeight || window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    paintScroll(g, w, h);
  }

  // ------------------------------------------------------------------ setup
  setupScreen() {
    const t = $('#title');
    const o = this.setup || (this.setup = { sect: 'longmen', size: 'small', mapType: 'pangaea', players: 4, difficulty: 1, speed: 'standard', seed: '', allAI: false });
    const sects = SECT_IDS.map((s) => {
      const S = SECTS[s];
      return `<button class="scard ${o.sect === s ? 'on' : ''}" data-s="${s}" style="--c:${S.col}"><img src="${this.view.portraitURL(S.leader)}" alt=""><b>${esc(L(S.n))}</b><small>${esc(L(S.ln))}</small></button>`;
    }).join('');
    const S = SECTS[o.sect];
    const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, n]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    t.innerHTML = `<canvas id="titleArt"></canvas><div class="setup">
      <h2>${T('chooseSect')}</h2><div class="sgrid">${sects}</div>
      <div class="sdetail" style="border-color:${S.col}"><img src="${this.view.portraitURL(S.leader)}" alt="">
        <div><h3 style="color:${S.col}">${esc(L(S.n))} <small>${T('leader')}：${esc(L(S.ln))} · ${esc(L(ALIGN[S.al]))}</small></h3>
        <p class="quote">「${esc(L(S.intro))}」</p>
        <p><b>${T('ability')}・${esc(L(S.ab.n))}</b>：${esc(L(S.ab.d))}</p>
        <p><b>${T('uu')}・${esc(L(UNITS[S.uu].n))}</b>：${esc(L(UNITS[S.uu].d || ''))}</p>
        <p><b>${T('ub')}・${esc(L(BUILDINGS[S.ub].n))}</b>：${esc(L(BUILDINGS[S.ub].d))}</p></div></div>
      <div class="sopts">
        <label>${T('mapSize')}${sel('oSize', Object.entries(SIZES).map(([k, v]) => [k, L(v.n) + ` ${v.w}×${v.h}`]), o.size)}</label>
        <label>${T('mapType')}${sel('oType', Object.entries(MAPTYPES).map(([k, v]) => [k, L(v)]), o.mapType)}</label>
        <label>${T('rivals')}${sel('oPlayers', [2, 3, 4, 5, 6, 7, 8].map((n) => [n, String(n - 1)]), o.players)}</label>
        <label>${T('difficulty')}${sel('oDiff', DIFFICULTY.map((d, k) => [k, L(d.n) + '：' + L(d.d)]), o.difficulty)}</label>
        <label>${T('speed')}${sel('oSpeed', Object.entries(SPEEDS).map(([k, v]) => [k, L(v.n) + ` (${v.limit})`]), o.speed)}</label>
        <label>${T('seed')}<input id="oSeed" value="${esc(o.seed)}" placeholder="${T('random')}" maxlength="24"></label>
        <label class="chk"><input type="checkbox" id="oAI" ${o.allAI ? 'checked' : ''}> ${T('allAI')}</label>
      </div>
      <div class="row-b"><button class="btn" id="sBack">${T('back')}</button><button class="btn big red" id="sGo">${T('start')}</button></div></div>`;
    this.paintTitle();
    for (const b of t.querySelectorAll('.scard')) b.onclick = () => { this.readSetup(); o.sect = b.dataset.s; this.snd.sfx('select'); this.setupScreen(); };
    $('#sBack').onclick = () => this.toTitle();
    $('#sGo').onclick = () => { this.readSetup(); this.start({ ...o }); };
  }
  readSetup() {
    const o = this.setup; if (!$('#oSize')) return;
    o.size = $('#oSize').value; o.mapType = $('#oType').value; o.players = +$('#oPlayers').value; o.difficulty = +$('#oDiff').value;
    o.speed = $('#oSpeed').value; o.seed = $('#oSeed').value.trim(); o.allAI = $('#oAI').checked;
  }
  start(o) {
    $('#title').innerHTML = `<div class="t-inner"><p class="t-sub">${T('loading')}</p></div>`;
    setTimeout(() => {
      const G = C.newGame({ seed: o.seed || undefined, size: o.size, mapType: o.mapType, players: o.players, difficulty: o.difficulty, speed: o.speed, sect: o.allAI ? null : o.sect, allAI: o.allAI });
      this.begin(G);
    }, 30);
  }
  begin(G) {
    this.G = G;
    G.settings = { autoStrike: this.settings.autoStrike };
    $('#title').hidden = true; $('#title').innerHTML = '';
    const me = G.players.find((p) => p.human);
    this.view.setGame(G, me ? me.id : 0);
    this.ui.startGame();
    this.music();
    this.kick();
  }

  // ------------------------------------------------------------------ saves
  slotMeta(s) { try { const m = localStorage.getItem('sol_meta_' + s); return m ? JSON.parse(m) : null; } catch (e) { return null; } }
  saveSlot(s) {
    const G = this.G; if (!G) return false;
    const me = G.players.find((p) => p.human);
    const meta = { time: Date.now(), turn: G.turn, sect: me ? me.sect : null, size: G.size, over: G.over };
    try {
      localStorage.setItem('sol_save_' + s, C.serialize(G));
      localStorage.setItem('sol_meta_' + s, JSON.stringify(meta));
      return true;
    } catch (e) { console.warn('save failed', e); return false; }
  }
  autosave() { if (this.G && !this.G.over) this.saveSlot('auto'); }
  loadSlot(s) {
    try {
      const str = localStorage.getItem('sol_save_' + s); if (!str) return false;
      const G = C.deserialize(str);
      this.begin(G);
      return true;
    } catch (e) { console.error(e); alert('Save is damaged.'); return false; }
  }
  slotRows(kind) {
    return SLOTS.map((s) => {
      const m = this.slotMeta(s);
      const name = s === 'auto' ? T('autosave') : T('slot', s);
      const info = m ? `${m.sect ? esc(L(SECTS[m.sect].n)) : T('watch')} · ${T('turn')} ${m.turn} · ${new Date(m.time).toLocaleString()}` : T('empty');
      const dis = kind === 'load' ? !m : s === 'auto';
      return `<button class="row ${dis ? 'dis' : ''}" data-slot="${s}" ${dis ? 'disabled' : ''}><b>${name}</b><span>${info}</span></button>`;
    }).join('');
  }
  loadScreen() {
    this.ui.modal(`<h2>${T('load')}</h2><div class="list">${this.slotRows('load')}</div>`, (root) => {
      for (const b of root.querySelectorAll('[data-slot]')) b.onclick = () => { this.ui.closeModal(); this.loadSlot(b.dataset.slot); };
    });
  }
  menuScreen() {
    const ui = this.ui;
    ui.modal(`<h2>${T('menu')}</h2>
      <h4>${T('save')}</h4><div class="list" id="mSave">${this.slotRows('save')}</div>
      <h4>${T('load')}</h4><div class="list" id="mLoad">${this.slotRows('load')}</div>
      <div class="row-b">${this.G && !this.G.players.some((p) => p.human) ? `<button class="btn" id="mAuto">${this.autoplay ? '⏸' : '▶'} ${getLang() === 'zh' ? '自動觀戰' : 'Auto-play'}</button>` : ''}
      <button class="btn" id="mSet">${T('settings')}</button><button class="btn" id="mHelp">${T('help')}</button><button class="btn" id="mCred">${T('credits')}</button><button class="btn red" id="mQuit">${T('quit')}</button></div>`, (root) => {
      for (const b of root.querySelectorAll('#mSave [data-slot]')) b.onclick = () => { if (this.saveSlot(b.dataset.slot)) { ui.toast(T('saved')); this.menuScreen(); } };
      for (const b of root.querySelectorAll('#mLoad [data-slot]')) b.onclick = () => { ui.closeModal(); this.loadSlot(b.dataset.slot); };
      $('#mSet').onclick = () => this.settingsScreen();
      $('#mHelp').onclick = () => this.helpScreen();
      $('#mCred').onclick = () => this.creditsScreen();
      $('#mQuit').onclick = () => ui.confirm(T('quit') + '?', () => { this.autosave(); this.toTitle(); });
      if ($('#mAuto')) $('#mAuto').onclick = () => { this.autoplay = !this.autoplay; ui.closeModal(); if (this.autoplay) ui.endTurn(); };
    });
  }
  settingsScreen() {
    const ui = this.ui, s = this.settings;
    ui.modal(`<h2>${T('settings')}</h2><div class="settings">
      <label>${T('music')} <input type="range" id="sMus" min="0" max="1" step="0.05" value="${this.snd.vol.music}"></label>
      <label>${T('sfx')} <input type="range" id="sSfx" min="0" max="1" step="0.05" value="${this.snd.vol.sfx}"></label>
      <label>${T('language')} <button class="btn" id="sLang">${getLang() === 'zh' ? '中文 → English' : 'English → 中文'}</button></label>
      <label class="chk"><input type="checkbox" id="sAnim" ${s.anim ? 'checked' : ''}> ${T('anim')}</label>
      <label class="chk"><input type="checkbox" id="sStrike" ${s.autoStrike ? 'checked' : ''}> ${T('autoStrike')}</label>
      <label class="chk"><input type="checkbox" id="sNext" ${s.autoNext ? 'checked' : ''}> ${getLang() === 'zh' ? '移動完自動選下一個單位' : 'Select the next unit after moving'}</label></div>`, () => {
      $('#sMus').oninput = (e) => { this.snd.vol.music = +e.target.value; this.snd.apply(); };
      $('#sSfx').oninput = (e) => { this.snd.vol.sfx = +e.target.value; this.snd.apply(); this.snd.sfx('click'); };
      $('#sLang').onclick = () => { setLang(getLang() === 'zh' ? 'en' : 'zh'); ui.closeModal(); if (this.G) { this.view.invalidateAll(); ui.refresh(); } else this.toTitle(); };
      $('#sAnim').onchange = (e) => { s.anim = e.target.checked; this.view.anim = s.anim; this.saveSettings(); };
      $('#sStrike').onchange = (e) => { s.autoStrike = e.target.checked; if (this.G) this.G.settings.autoStrike = s.autoStrike; this.saveSettings(); };
      $('#sNext').onchange = (e) => { s.autoNext = e.target.checked; this.saveSettings(); };
    });
  }
  helpScreen() {
    const zh = getLang() === 'zh';
    const html = zh ? `<h2>說明</h2><div class="help">
      <p>《龍門江湖志》是一款回合制的開宗立派策略遊戲。你是江湖上的一個門派：派開山弟子去建立據點，研習武學、立下門規、結交村寨與各派，最後用武力、武學、名聲或人望稱霸江湖。</p>
      <h4>操作</h4><ul><li>拖曳地圖平移，雙指或滑鼠滾輪縮放。</li><li>點選我方部隊，再點目的地預覽路線，再點一次就出發（滑鼠右鍵可直接移動）。</li><li>點敵人會顯示戰況預估，按「攻擊」出手。</li><li>點我方城市（或點兩下）開啟城市面板，選擇生產、重點、購買。</li><li>右下按鈕會帶你處理該做的事：選擇武學、門規、生產與下一個部隊；處理完就是「結束回合」。長按顯示地塊資訊。</li>
      <li>鍵盤：方向鍵/WASD 平移，+/- 縮放，Enter 下一步，Shift+Enter 直接結束回合，N/空白鍵 下一個單位，F 駐守，Z 休息，X 略過，B 建城，R 武學，C 門規，P 外交，Y 顯示產出，H 回到山門，Esc 關閉。</li></ul>
      <h4>城市</h4><p>城市靠人口耕作周圍地塊，產出糧（成長）、產（生產）、銀（銀兩）、武學（研究）與俠名（門規、疆域、招募俠客）。耕作的地塊會自己慢慢開墾成田、礦、伐木場與園圃。奢侈資源讓俠名與成長增加；鐵、良馬、靈石是某些部隊需要的戰略資源。</p>
      <h4>武學與門規</h4><p>武學之樹解鎖部隊、建築與奇觀；最後的「天人合一」讓你能創造絕世神功。俠名推動江湖規矩之樹，解鎖門派體制與門規卡；把門規放進武、財、德、通四種欄位。</p>
      <h4>戰鬥</h4><p>雙方比較戰力，差越多傷害越懸殊。丘陵、森林、竹林、山上與駐守的部隊較難打；多支部隊圍攻同一敵人有夾擊加成；敵軍相鄰的格子會讓部隊停下（控制區）。城市有城牆與耐久，要用近戰部隊攻破才能佔領；攻城器械對城市特別有效。部隊靠經驗晉升。</p>
      <h4>江湖</h4><p>俠名可以招募龍門江湖的俠客；藏經閣、煉丹房、鐵匠鋪、茶樓等會培養宗師、神醫、名匠與說書人。流寇山寨與獸穴會派人出來騷擾；清除它們有賞。村寨可以派使者結交，成為盟主會給你好處與大會的一票。</p>
      <h4>外交與武林大會</h4><p>可以宣戰、議和、結盟（需「結義」）、互市、贈禮與譴責。各派會記住誰先動手（積怨與江湖公論）。武林大會定期召開，表決兩條決議並推舉盟主候選；可以用人情買票。</p>
      <h4>勝利</h4><ul>${Object.values(VICTORIES).map((v) => `<li><b>${esc(v.n[0])}</b>：${esc(v.d[0])}</li>`).join('')}</ul></div>`
      : `<h2>How to Play</h2><div class="help">
      <p>Sects of Longmen is a turn-based strategy game of founding a sect. You lead one sect of the jianghu: send Founders out to build strongholds, study the martial arts, set your sect's rules, befriend villages and rivals, and win the jianghu by arms, by mastery, by renown or by the Assembly's choice.</p>
      <h4>Controls</h4><ul><li>Drag to pan; pinch or use the mouse wheel to zoom.</li><li>Tap one of your units, tap a destination to preview the route, tap it again to go (right-click moves at once).</li><li>Tap an enemy to see the expected result, then press Attack.</li><li>Tap your city (or double-tap) to open it: production, focus, buying.</li><li>The button at bottom right walks you through what needs doing: research, rules, production and the next unit; then it ends the turn. Long-press a tile for details.</li>
      <li>Keys: arrows/WASD pan, +/- zoom, Enter next step, Shift+Enter end turn, N/Space next unit, F fortify, Z sleep, X skip, B found city, R research, C rules, P diplomacy, Y show yields, H home, Esc close.</li></ul>
      <h4>Cities</h4><p>Population works the tiles around a city for food (growth), production, silver, insight (research) and renown (rules, borders and heroes). Worked tiles are slowly developed into farms, mines, lumber camps and gardens on their own. Luxuries add renown and growth; Iron, Horses and Spirit Stones are needed for some units.</p>
      <h4>Martial arts and rules</h4><p>The martial arts tree unlocks units, buildings and wonders; its last technique, Heaven and Man as One, lets you create the Peerless Art. Renown drives the tree of jianghu rules, which unlocks constitutions and rule cards for the Martial, Wealth, Virtue and Any slots.</p>
      <h4>Combat</h4><p>Strength is compared; the bigger the gap, the more lopsided the damage. Hills, forest, bamboo, mountains and fortified units are hard to hit; several units around one enemy get a flanking bonus; tiles next to an enemy stop movement (zone of control). Cities have walls and hit points and fall only to a melee attack; siege engines hit cities hard. Units are promoted with experience.</p>
      <h4>The jianghu</h4><p>Renown recruits heroes of the Longmen cast; libraries, alchemy rooms, smithies and teahouses raise Grandmasters, Physicians, Master Smiths and Storytellers. Bandit camps and beast lairs send out raiders; clearing them pays. Villages are befriended with envoys; their patron gets bonuses and their vote at the Assembly.</p>
      <h4>Diplomacy and the Assembly</h4><p>Declare war, make peace, ally (needs Sworn Brotherhood), sign trade pacts, give gifts or denounce. Sects remember who struck first (grievances and public opinion). The Wulin Assembly meets regularly to vote on two resolutions and to name a candidate for Alliance Leader; favour buys extra votes.</p>
      <h4>Victory</h4><ul>${Object.values(VICTORIES).map((v) => `<li><b>${esc(v.n[1])}</b>: ${esc(v.d[1])}</li>`).join('')}</ul></div>`;
    this.ui.modal(html, null, 'wide');
  }
  creditsScreen() {
    const zh = getLang() === 'zh';
    this.ui.modal(`<h2>${T('credits')}</h2><div class="help">
      <p>${zh ? '原創遊戲，取材自龍門武林的人物。' : 'An original game featuring the people of the Longmen wulin.'}</p>
      <h4>${zh ? '人物美術' : 'Character art'}</h4><p>${zh ? '人物圖庫（Character Gallery）8-bit 紅白機風格頭像與小人。' : 'Character Gallery 8-bit Famicom-style portraits and sprites.'}</p>
      <h4>${zh ? '音樂' : 'Music'}</h4><p id="credMusic">${zh ? '為本遊戲創作的原創樂曲，以真實樂器取樣演奏：' : 'Original music composed for the game, played with recorded instrument samples:'} Versilian Studios VSCO-2 Community Edition (CC0); freesound.org CC0: tarane468 (erhu), Hypnotriod (dizi), Pufermufin (guzheng), jonopodmore, sazanami12 (temple blocks), kyles (opera cymbal), Anuj_Shrestha1 (taiko).</p>
      <h4>${zh ? '字型' : 'Font'}</h4><p>Noto Serif TC (SIL Open Font License), Google Fonts.</p>
      <p>${zh ? '詳見 CREDITS.md。' : 'See CREDITS.md for details.'}</p></div>`);
  }

  // ------------------------------------------------------------------ map input: mouse, touch, pen
  bindInput() {
    const cv = $('#map');
    const pts = new Map();
    let moved = false, pinch = null, lp = null, hoverT = 0, downAt = null, lastPan = null;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      if (!this.G) return;
      cv.setPointerCapture(e.pointerId);
      const [x, y] = pos(e);
      pts.set(e.pointerId, { x, y });
      if (pts.size === 1) {
        moved = false; downAt = { x, y, t: performance.now(), btn: e.button, type: e.pointerType }; lastPan = { x, y };
        clearTimeout(lp);
        if (e.pointerType !== 'mouse') lp = setTimeout(() => { if (!moved && pts.size === 1) { this.ui.showTip(this.view.tileAt(x, y), e.clientX, e.clientY); downAt.lp = true; } }, 480);
      } else if (pts.size === 2) {
        clearTimeout(lp);
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        moved = true;
      }
      this.ui.hideTip();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.G) return;
      const [x, y] = pos(e);
      if (!pts.has(e.pointerId)) {
        // hover tooltip for mice
        if (e.pointerType === 'mouse') { clearTimeout(hoverT); this.ui.hideTip(); hoverT = setTimeout(() => this.ui.showTip(this.view.tileAt(x, y), e.clientX, e.clientY), 550); }
        return;
      }
      pts.set(e.pointerId, { x, y });
      if (pts.size === 1 && downAt) {
        if (!moved && Math.hypot(x - downAt.x, y - downAt.y) > 7) { moved = true; clearTimeout(lp); }
        if (moved) { this.view.cx -= (x - lastPan.x) / this.view.z; this.view.cy -= (y - lastPan.y) / this.view.z; this.view.clampCam(); lastPan = { x, y }; this.kick(); }
      } else if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        this.view.zoomAt(d / pinch.d, mx, my);
        this.view.cx -= (mx - pinch.mx) / this.view.z; this.view.cy -= (my - pinch.my) / this.view.z; this.view.clampCam();
        pinch = { d, mx, my }; this.kick();
      }
    });
    const up = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      clearTimeout(lp);
      if (pts.size === 0) {
        if (!moved && downAt && !downAt.lp && e.type === 'pointerup') {
          const [x, y] = pos(e);
          const i = this.view.tileAt(x, y);
          this.ui.tap(i, { direct: downAt.btn === 2 });
        }
        pinch = null; downAt = null;
        if (lp) this.ui.hideTip();
      } else if (pts.size === 1) { pinch = null; const [a] = [...pts.values()]; lastPan = { x: a.x, y: a.y }; }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { if (!this.G) return; e.preventDefault(); const [x, y] = pos(e); this.view.zoomAt(Math.exp(-e.deltaY * 0.0015), x, y); this.kick(); }, { passive: false });
    cv.addEventListener('pointerleave', () => { clearTimeout(hoverT); this.ui.hideTip(); });
  }
}

// a painted scroll for the title: layered ink mountains, mist, a waterfall, a red sun, pines and a flying crane
function paintScroll(g, w, h) {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#f4ecd6'); sky.addColorStop(0.6, '#ece0c2'); sky.addColorStop(1, '#e2d3ae');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  // sun
  g.fillStyle = 'rgba(190,60,40,0.85)'; g.beginPath(); g.arc(w * 0.78, h * 0.22, Math.min(w, h) * 0.07, 0, 6.29); g.fill();
  const layers = [[0.42, '#b9b2a2', 0.35], [0.52, '#8f8a80', 0.5], [0.64, '#5f5c58', 0.7], [0.78, '#36332f', 0.9]];
  for (const [base, col, a] of layers) {
    g.fillStyle = col; g.globalAlpha = a;
    g.beginPath(); g.moveTo(0, h);
    let x = 0, y = h * base;
    g.lineTo(0, y);
    while (x < w) {
      const pw = 60 + rnd() * 140, ph = (40 + rnd() * 120) * (h / 700);
      g.quadraticCurveTo(x + pw * 0.35, y - ph * (0.7 + rnd() * 0.5), x + pw * 0.5, y - ph);
      g.quadraticCurveTo(x + pw * 0.7, y - ph * 0.6, x + pw, h * base + (rnd() - 0.5) * 30);
      x += pw; y = h * base;
    }
    g.lineTo(w, h); g.closePath(); g.fill();
    // mist band
    g.globalAlpha = 1;
    const mg = g.createLinearGradient(0, h * base - 10, 0, h * base + 60);
    mg.addColorStop(0, 'rgba(240,232,212,0)'); mg.addColorStop(0.5, 'rgba(240,232,212,0.75)'); mg.addColorStop(1, 'rgba(240,232,212,0)');
    g.fillStyle = mg; g.fillRect(0, h * base - 10, w, 70);
  }
  g.globalAlpha = 1;
  // waterfall
  const wx = w * 0.18;
  const wg = g.createLinearGradient(wx, h * 0.5, wx, h * 0.85);
  wg.addColorStop(0, 'rgba(255,255,255,0.0)'); wg.addColorStop(0.2, 'rgba(255,255,255,0.85)'); wg.addColorStop(1, 'rgba(255,255,255,0.2)');
  g.fillStyle = wg; g.fillRect(wx - 7, h * 0.5, 14, h * 0.35);
  // pines on the near ridge
  for (let k = 0; k < 9; k++) {
    const px = rnd() * w, py = h * (0.8 + rnd() * 0.12), sz = 14 + rnd() * 22;
    g.strokeStyle = '#1e1c1a'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - sz * 1.6); g.stroke();
    g.fillStyle = '#23302a';
    for (let j = 0; j < 3; j++) { g.beginPath(); g.ellipse(px + (j % 2 ? 8 : -8), py - sz * (0.6 + j * 0.35), sz * 0.7, sz * 0.18, 0, 0, 6.29); g.fill(); }
  }
  // crane
  g.strokeStyle = '#2a2622'; g.lineWidth = 2;
  const cx = w * 0.6, cy = h * 0.3;
  g.beginPath(); g.moveTo(cx - 30, cy + 4); g.quadraticCurveTo(cx - 12, cy - 14, cx, cy); g.quadraticCurveTo(cx + 12, cy - 14, cx + 30, cy + 4); g.stroke();
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 14, cy + 3); g.stroke();
  // seal
  g.fillStyle = 'rgba(170,40,30,0.85)'; g.fillRect(w - 70, h - 90, 44, 44);
  g.fillStyle = '#f4ecd6'; g.font = 'bold 18px "Noto Serif TC", serif'; g.textAlign = 'center'; g.fillText('龍門', w - 48, h - 62);
}

const app = new App();
app.boot();
