// AI-vs-AI full game in fast mode. usage: node test/aigame.mjs [seed] [size] [speed] [players] [mapType]
import { newGame, serialize, deserialize } from '../js/core.js?v=2';
import { runWholeTurn, score, victoryProgress } from '../js/world.js?v=2';
import { aiTurn } from '../js/ai.js?v=2';
import { SECTS, VICTORIES } from '../js/data.js?v=2';
const [seed = 's1', size = 'small', speed = 'blitz', players = '4', mapType = 'pangaea'] = process.argv.slice(2);
const t0 = Date.now();
let G = newGame({ seed, size, speed, players: +players, mapType, allAI: true, difficulty: 1 });
G.strict = true;
const quiet = process.env.QUIET;
function report() {
  const rows = G.players.map((p) => {
    const cs = G.cities.filter((c) => c.owner === p.id);
    const mil = G.units.filter((u) => u.owner === p.id && !['civ','trade','gp'].includes(u.type === 'hero' ? 'hero' : (u.type.startsWith('x_') ? 'x' : 'm')) ).length;
    const vp = victoryProgress(G, p.id);
    return `${p.sect.padEnd(9)} ${p.alive ? ' ' : 'X'} c${String(cs.length).padStart(2)} pop${String(cs.reduce((a, c) => a + c.pop, 0)).padStart(3)} t${String(Object.keys(p.techs).length).padStart(2)} cv${String(Object.keys(p.civics).length).padStart(2)} e${p.era} u${String(G.units.filter((u) => u.owner === p.id).length).padStart(3)} g${String(Math.round(p.gold)).padStart(5)} s/t${String(Math.round(p.lastY?.s || 0)).padStart(4)} c/t${String(Math.round(p.lastY?.c || 0)).padStart(4)} leg${String(Math.round(p.legend)).padStart(5)} lore${String(Math.round(p.life * 0.55)).padStart(5)} dip${p.dip} pj${p.proj} caps${vp.dom.held}/${vp.dom.need} sc${score(G, p.id)} war:${Object.keys(p.rel).filter((k) => p.rel[k] === 'war').join(',')}`;
  });
  console.log(`--- turn ${G.turn}  camps ${G.camps.length} neutral ${G.units.filter((u) => u.owner < 0).length} wars ${G.stats.wars} caps ${G.stats.captures} congress ${G.congress.n} wonders ${Object.keys(G.wonders).length}`);
  for (const r of rows) console.log('  ' + r);
}
while (!G.over) {
  runWholeTurn(G, aiTurn);
  if (G.turn % 10 === 0 && !quiet) report();
  if (G.turn % 25 === 0) { const s = serialize(G); G = deserialize(s); G.strict = true; }
  if (G.turn > 400) break;
}
report();
const w = G.winner;
console.log('WINNER', w && w.pid >= 0 ? SECTS[G.players[w.pid].sect].n[1] : w, w && VICTORIES[w.type]?.n[1], 'turn', w && w.turn, 'time', ((Date.now() - t0) / 1000).toFixed(1) + 's', 'save', serialize(G).length);
