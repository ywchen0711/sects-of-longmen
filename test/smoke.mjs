// Browser smoke test (scripted human play through the real UI).
// Needs puppeteer-core and Chrome:  npm i -D puppeteer-core ; serve the folder (python -m http.server 8447) ; then
//   node test/smoke.mjs [url] [outPrefix]
// Env: CHROME=path to chrome.exe, TURNS=n
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://127.0.0.1:8447/index.html';
const out = process.argv[3] || 'smoke';
const TURNS = +(process.env.TURNS || 12);
const b = await puppeteer.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
const errs = [];
p.on('pageerror', (e) => errs.push('PAGE ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errs.push(m.text()); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const step = async (name, f) => { try { await f(); console.log('ok  ', name); } catch (e) { errs.push(name + ': ' + e.message); console.log('FAIL', name, e.message); } };

await p.goto(url); await wait(2000);
await step('title -> setup', async () => { await p.click('#tNew'); await wait(400); });
await step('pick a sect', async () => { await p.click('.scard[data-s="qianfo"]'); await wait(300); });
await step('start', async () => { await p.$eval('#oSeed', (e) => { e.value = 'smoke1'; }); await p.click('#sGo'); await wait(2500); });
await step('select founder and found city', async () => {
  await p.evaluate(() => { const ui = SOL.app.ui, G = SOL.app.G; ui.select(G.units.find((u) => u.owner === ui.pid && u.type === 'u_founder')); });
  await wait(200); await p.click('[data-a="found"]'); await wait(600);
  const n = await p.evaluate(() => SOL.app.G.cities.length); if (n < 1) throw new Error('no city');
});
await step('city panel: choose production', async () => { await p.click('#cityPanel .item'); await wait(200); await p.click('#cpClose'); });
await step('research screen: pick a technique', async () => { await p.click('[data-screen="tech"]'); await wait(400); await p.click('.tnode.av'); await wait(300); });
await step('rules screen: pick a rule', async () => { await p.click('[data-screen="rules"]'); await wait(400); await p.click('.tnode.civ.av'); await wait(200); await p.click('#mClose'); });
await step('move a unit with two taps', async () => {
  const xy = await p.evaluate(() => {
    const ui = SOL.app.ui, G = SOL.app.G, v = SOL.app.view;
    const u = G.units.find((x) => x.owner === ui.pid && x.type === 'u_scout'); ui.select(u);
    const t = u.i + 2; const [mx, my] = v.tileXY(t); return v.toScreen(mx, my);
  });
  const r = await p.$eval('#map', (c) => { const b = c.getBoundingClientRect(); return [b.left, b.top]; });
  await p.mouse.click(r[0] + xy[0], r[1] + xy[1]); await wait(250);
  await p.mouse.click(r[0] + xy[0], r[1] + xy[1]); await wait(400);
});
for (let k = 0; k < TURNS; k++) {
  await step('turn ' + (k + 1), async () => {
    await p.evaluate(async () => {
      const ui = SOL.app.ui, G = SOL.app.G;
      ui.closeModal();
      const me = G.players[ui.pid];
      if (!me.tech) ui.setResearchPath(me, 't_sword');
      if (!me.civic) me.civic = SOL.C.availableCivics(me)[0];
      for (const c of G.cities) if (c.owner === ui.pid && !c.build) SOL.C.setBuild(G, c, SOL.C.buildOptions(G, c)[0]);
      if (G.congress.session) { ui.congressScreen(); document.querySelector('#cgVote').click(); ui.closeModal(); }
    });
    await p.click('#endForce').catch(() => p.click('#endBtn'));
    for (let w = 0; w < 60; w++) { await wait(150); if (await p.evaluate(() => !SOL.app.ui.busy)) break; }
    await p.evaluate(() => SOL.app.ui.closeModal());
  });
}
await step('save and reload', async () => {
  await p.evaluate(() => SOL.app.saveSlot('1'));
  const t = await p.evaluate(() => SOL.app.G.turn);
  await p.evaluate(() => SOL.app.loadSlot('1')); await wait(600);
  const t2 = await p.evaluate(() => SOL.app.G.turn); if (t !== t2) throw new Error('turn mismatch ' + t + ' ' + t2);
});
await step('screens open', async () => {
  for (const s of ['diplo', 'congress', 'villages', 'heroes', 'overview', 'menu']) { await p.click(`[data-screen="${s}"]`); await wait(250); await p.click('#mClose'); }
});
await p.screenshot({ path: out + '-end.png' });
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'SMOKE OK (no page errors)');
await b.close();
process.exit(errs.length ? 1 : 0);
