// Music and sound. Music: one reused <audio> element (iOS lets a reused element play after the first tap),
// AAC (.m4a) where the browser can play it, Ogg otherwise. Sound effects: short recorded samples decoded
// into Web Audio buffers. Everything is guarded so the game never fails on sound.
const TRACKS = {
  menu: 'menu', peace: ['peace1', 'peace2', 'peace3'], war: 'war', victory: 'victory', defeat: 'defeat', congress: 'congress',
};
const SFX = ['click', 'select', 'move', 'hit', 'arrow', 'city', 'turn', 'war', 'gong', 'build', 'tech'];

export class Sound {
  constructor() {
    const a = document.createElement('audio');
    const aac = !!a.canPlayType && a.canPlayType('audio/mp4; codecs="mp4a.40.2"') !== '';
    const ogg = !!a.canPlayType && a.canPlayType('audio/ogg; codecs="vorbis"') !== '';
    this.ext = aac || !ogg ? 'm4a' : 'ogg';
    this.music = a; a.loop = true; a.preload = 'auto'; a.setAttribute('playsinline', '');
    this.vol = { music: 0.6, sfx: 0.7 };
    try { const s = JSON.parse(localStorage.getItem('sol_vol') || 'null'); if (s) Object.assign(this.vol, s); } catch (e) {}
    this.cur = null; this.unlocked = false; this.buf = {}; this.peaceIdx = 0;
    try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) { this.ctx = new AC(); this.out = this.ctx.createGain(); this.out.connect(this.ctx.destination); } } catch (e) { this.ctx = null; }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    const unlock = () => this.unlock();
    for (const ev of ['touchend', 'click', 'keydown']) window.addEventListener(ev, unlock, { capture: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); else this.resume(); });
    window.addEventListener('pageshow', () => this.resume());
    this.music.addEventListener('ended', () => { if (this.cur === 'peace') this.next(); });
    this.apply();
  }
  apply() {
    for (const k of ['music', 'sfx']) { const v = +this.vol[k]; this.vol[k] = isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.6; }
    this.music.volume = this.vol.music;
    if (this.out) this.out.gain.value = this.vol.sfx;
    try { localStorage.setItem('sol_vol', JSON.stringify(this.vol)); } catch (e) {}
  }
  unlock() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.ctx) { try { const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0); } catch (e) {} this.loadSfx(); }
    const want = this.cur; this.cur = null;
    if (want) this.play(want);
    else { this.music.src = 'audio/menu.' + this.ext + '?v=1'; this.music.play().then(() => { if (!this.cur) this.music.pause(); }).catch(() => {}); }
  }
  loadSfx() {
    for (const n of SFX) {
      fetch('audio/sfx_' + n + '.' + this.ext + '?v=1').then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => {
        if (!ab || !this.ctx) return;
        return new Promise((res) => this.ctx.decodeAudioData(ab, (b) => { this.buf[n] = b; res(); }, () => res()));
      }).catch(() => {});
    }
  }
  file(name) {
    const t = TRACKS[name];
    if (Array.isArray(t)) return t[this.peaceIdx % t.length];
    return t || name;
  }
  play(name) {
    if (this.cur === name) { if (this.unlocked && this.music.paused) this.music.play().catch(() => {}); return; }
    this.cur = name; if (!this.unlocked) return;
    this.music.loop = name !== 'peace' && name !== 'victory' && name !== 'defeat';
    this.music.src = 'audio/' + this.file(name) + '.' + this.ext + '?v=1';
    this.music.currentTime = 0;
    this.music.play().catch(() => {});
  }
  next() { this.peaceIdx++; const c = this.cur; this.cur = null; this.play(c); }
  pause() { this.music.pause(); if (this.ctx) this.ctx.suspend().catch(() => {}); }
  resume() { if (!this.unlocked) return; if (this.ctx) this.ctx.resume().catch(() => {}); if (this.cur) this.music.play().catch(() => {}); }
  sfx(name, vol = 1) {
    if (!this.ctx || !this.unlocked || this.mute) return;
    if (this.ctx.state === 'interrupted' || this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const b = this.buf[name];
    try {
      if (b) { const s = this.ctx.createBufferSource(); s.buffer = b; const g = this.ctx.createGain(); g.gain.value = vol; s.connect(g); g.connect(this.out); s.start(); return; }
      // fallback: a soft plucked tone until the samples arrive
      const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      const f = { click: 880, select: 660, move: 440, hit: 160, arrow: 1200, city: 523, turn: 392, war: 110, gong: 98, build: 587, tech: 784 }[name] || 600;
      o.type = 'triangle'; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(0.18 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.3);
    } catch (e) {}
  }
}
