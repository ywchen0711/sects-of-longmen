# 龍門江湖志 Sects of Longmen

一款原創的回合制六角格策略遊戲（4X：探索、擴張、經營、征服），舞台是龍門武林的江湖。你是江湖上的一個門派：派開山弟子開宗立派、研習武學、立下門規、結交村寨與各派，最後用武力、武學、名聲或人望稱霸江湖。在瀏覽器裡直接玩，不需要安裝。

An original turn-based hex strategy game (4X: explore, expand, exploit, exterminate) set in the jianghu of the
Longmen wulin. You lead a sect: send Founders out to build strongholds, study the martial arts, set your sect's
rules, befriend villages and rival sects, and win the jianghu by arms, mastery, renown or the Assembly's choice.
Plays in the browser from `index.html` with no build step; desktop, iPad and iPhone (portrait and landscape).

## 怎麼玩 How to play
- **地圖**：拖曳平移，雙指或滾輪縮放；長按（或滑鼠停留）看地塊資訊。 **Map:** drag to pan, pinch or wheel to zoom;
  long-press (or hover) a tile for details.
- **部隊**：點部隊，點目的地預覽路線，再點一次出發（滑鼠右鍵直接移動）；點敵人看戰況預估再按「攻擊」。
  **Units:** tap a unit, tap a destination to preview the route, tap again to go (right-click moves at once); tap an
  enemy to see the expected result, then Attack.
- **城市**：點我方城市（或點兩下）選擇生產、重點、用銀兩購買。 **Cities:** tap (or double-tap) your city to choose
  production, set its focus or buy with silver.
- **右下按鈕**會帶你處理該做的事（選武學、門規、生產、下一個部隊），處理完就是「結束回合」；⏭ 直接結束。
  **The big button** walks you through what needs doing, then ends the turn; ⏭ ends it at once.
- **鍵盤 Keys:** arrows/WASD pan, +/- zoom, Enter next step, Shift+Enter end turn, N/Space next unit, F fortify,
  Z sleep, X skip, B found city, R arts tree, C rules, P diplomacy, Y yields, H home, Esc close.
- 自動存檔每回合一次，另有三個存檔欄（選單 ≡）。 Autosave every turn plus three save slots (menu ≡).

## 規則摘要 Rules summary
- **十一個門派 Eleven sects**, each with a leader from the Longmen cast, an ability, a unique unit and a unique building:
  龍門刀莊 (奕叡), 寒江閣 (柳寒煙), 千佛寺 (苦禪), 暴龍崖 (冷笑天), 幽冥教 (屠千秋), 馭妖宗 (墨無涯), 錢家商號 (錢萬里),
  黑風寨 (黑熊), 血刀門 (厲寒山), 執法堂 (鐵無私), 慈雲庵 (靜慈師太). 2–8 sects per game; leaders whose sect is not
  playing join the pool of recruitable heroes.
- **Map:** seeded hex maps (small 44×28, medium 58×36, large 74×46; one great land, two shores or a thousand isles)
  with plains, grassland, hills, mountains, forest, bamboo, marsh, snow, desert, lakes, coast and sea; rivers;
  iron, horses, tea, silk, salt, herbs, jade, spirit stones, fish and rice; fog of war.
- **Cities (據點):** population works tiles for food, production, silver (銀), insight (武學) and renown (俠名);
  worked tiles develop farms, mines, lumber camps, gardens and pastures by themselves; borders grow with renown.
  18 buildings plus 11 sect buildings, 12 one-of-a-kind wonders (龍門飛瀑, 聽雨樓, 萬妖塔 …).
- **武學之樹 the martial arts tree** (34 techniques in five realms 入門・小成・大成・化境・宗師: stances, sabers,
  swords, qinggong, inner arts, formations, medicine, hidden weapons, trade, ships…) and **江湖規矩 the tree of
  rules** (17 rules, six constitutions, 21 rule cards for the Martial, Wealth, Virtue and Any slots).
- **Units:** disciples, sabers, swordsmen, archers, dart throwers, spear walls, riders, iron cavalry, siege rams,
  catapults and thunder carts, river boats and tower ships, escort caravans (trade routes that build roads),
  scouts, founders; heroes of the Longmen cast recruited with renown (each with an ability, they level up);
  great people (宗師, 神醫, 名匠, 說書人) from your buildings. Combat compares strength with terrain, fortification,
  flanking, rivers, promotions and hero auras; zones of control; city walls and city strikes; embarking.
- **Neutral jianghu:** bandit camps and beast lairs that raid; 16 villages (武館, 商鎮, 書院, 藥谷, 茶村, 鐵坊)
  befriended with envoys — the patron gets bonuses and the village's vote.
- **Diplomacy:** war, peace, alliances (after 結義), trade pacts, gifts, denouncing; grievances and public opinion
  remember who struck first. **The Wulin Assembly (武林大會)** meets regularly: two resolutions (bounties, trade,
  truces, open manuals, salt and iron…) and the Alliance Leader nomination; favour buys extra votes.
- **Victories:** 武林盟主 (hold every rival's original home seat), 武學宗師 (learn 天人合一, then build the three
  stages of the Peerless Art), 俠名遠播 (your legend exceeds every rival's lore), 眾望所歸 (enough Alliance Leader
  standing at the Assembly), 青史留名 (best score when the turns run out).
- **Computer sects** expand, build, research, set rules, recruit heroes, send envoys, trade, fight (staging and
  sieges), make and break treaties and vote, each with its leader's temperament. **Difficulty** 入門 → 武神: the only
  bonuses are the yield percentages and extra starting units listed on the setup screen.
- **Speeds:** quick (180 turns), standard (300), blitz (140, for tests).

## Files
- `index.html`, `style.css`, `js/` (`data.js` content, `mapgen.js`, `hex.js`, `rng.js`, `core.js` state/cities/research,
  `units.js` movement/combat, `world.js` turns/diplomacy/Assembly/victory, `ai.js`, `render.js`, `ui.js`, `main.js`,
  `audio.js`, `i18n.js`, `art.js` generated)
- `assets/` sprite atlases from the Character Gallery (`tools/art.py`), `audio/` music and sound (`tools/score.py`,
  `tools/orch.py`), `tools/icons.py`, `tools/thumb.py`, `tools/bump.py` (cache-busting `?v=`).

## Tests
- `node test/aigame.mjs [seed] [size] [speed] [players] [mapType]` — a full computer-vs-computer game to a victory
  (e.g. `node test/aigame.mjs s1 small blitz 4`), with save/load round trips every 25 turns.
- `node test/humansim.mjs [seed] [turns]` — a scripted human sect plays through the game API against the computer.
- `node test/smoke.mjs [url]` — browser smoke test through the real UI (needs `puppeteer-core` and Chrome; serve the
  folder first, e.g. `python -m http.server 8447`).

See CREDITS.md for art, music and font credits.
