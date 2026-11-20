# 龍門江湖志 Sects of Longmen — Credits

An original turn-based hex strategy game. Game design, rules, code, map painting, story text and the score were
made for this game. It is a game in the 4X genre (explore, expand, exploit, exterminate); it does not use the names,
interface, art, text, trees, leaders, wonders or music of any existing game.

## Characters and art
- **Character Gallery** (the same author's pixel character library, `nes` style, 8-bit Famicom portraits and
  16x24 field sprites): every leader, hero, great person, troop, crew and neutral foe. The troops, crews, the
  sects' own fighters, the two great people (宗師, 名匠) and 靜慈師太 (Abbess Jingci) were drawn for this game and
  added to the gallery (`src/nes_sects.py`, `src/nes_sects_busts.py`). `tools/art.py` packs them into
  `assets/sprites.png` and `assets/portraits.png`.
- The map (terrain washes, ink coastlines, mountains, forests, bamboo, rivers, cities, villages, camps, clouds) and
  the title scroll are painted by code in `js/render.js` and `js/main.js`.
- The app icon and thumbnail lettering use the Windows font 標楷體 (DFKai-SB) and Noto Serif TC to render the images.

## Music and sound
Original compositions written for the game (`tools/score.py`: every melody, chord, bass line and drum pattern),
played by a sampler (`tools/orch.py`, adapted from the same author's Longmen Quest II tools) with recorded
instrument samples, all released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) and credited
here with thanks:
- **VS Chamber Orchestra: Community Edition (VSCO-2 CE)** by Versilian Studios (Sam Gossner and contributors):
  strings, harp, flute, bassoon, horns, trumpet, trombone, glockenspiel, timpani and percussion.
  https://github.com/sgossner/VSCO-2-CE
- **Erhu:** "Chinese Erhu" pack by tarane468 (freesound.org). https://freesound.org/people/tarane468/packs/26451/
- **Dizi:** "Flute Dizi C all notes + pitched semitones" pack by Hypnotriod (freesound.org). https://freesound.org/people/Hypnotriod/packs/21613/
- **Guzheng:** "LOVELY CHINESE GUZHENG PLUCKED.wav" by Pufermufin (freesound.org). https://freesound.org/people/Pufermufin/sounds/396868/
- **Muyu:** "Mokugyo.wav" by jonopodmore. https://freesound.org/people/jonopodmore/sounds/607215/
- **Temple blocks:** "Temple Blocks (5pcs) - Hard Wood Mallets" by sazanami12. https://freesound.org/people/sazanami12/sounds/863784/
- **Opera cymbal:** kyles. https://freesound.org/people/kyles/sounds/452400/
- **Taiko:** Anuj_Shrestha1. https://freesound.org/people/Anuj_Shrestha1/sounds/486140/ and https://freesound.org/people/Anuj_Shrestha1/sounds/486141/

Tracks: 龍門江湖志 (title), 山門晨鐘, 江湖行, 茶樓聽書 (peace), 烽煙四起 (war), 武林大會 (the Assembly),
一統江湖 (victory), 江湖夜雨 (defeat), plus eleven short sound effects played by the same instruments.

## Fonts
- **Noto Serif TC** (Google, SIL Open Font License 1.1), loaded from Google Fonts for the interface.
