import { generate } from '../js/mapgen.js?v=1';
import { TERRAIN_IDS } from '../js/data.js?v=1';
const type = process.argv[2] || 'pangaea';
const m = generate({ w: 58, h: 36, seed: process.argv[3] || 'abc', type, players: 6, villages: 6, camps: 8 });
const ch = { grass: '"', plains: '.', hills: 'n', mountain: 'A', forest: 'T', bamboo: 'b', marsh: 'm', snow: '*', desert: ':', lake: 'o', coast: '~', sea: ' ' };
const cnt = {};
for (let y = 0; y < m.h; y++) { let s = y & 1 ? ' ' : ''; for (let x = 0; x < m.w; x++) { const i = y * m.w + x; const t = TERRAIN_IDS[m.ter[i]]; cnt[t] = (cnt[t] || 0) + 1; let c = ch[t]; if (m.river[i]) c = 'r'; if (m.starts.includes(i)) c = '@'; if (m.villages.includes(i)) c = 'V'; if (m.camps.includes(i)) c = 'X'; s += c + ' '; } console.log(s); }
console.log(cnt, 'starts', m.starts.length, 'vil', m.villages.length, 'camps', m.camps.length);
