// 龍門江湖志 Sects of Longmen - all game content (sects, terrain, units, buildings, trees, rules).
// Pure data, no DOM: shared by the browser game and the Node test harness.
// Every name is [zh, en]. Yields: f food, p production, g gold, s insight (武學), c renown (俠名).

export const YIELDS = ['f', 'p', 'g', 's', 'c'];
export const YNAME = { f: ['糧', 'Food'], p: ['產', 'Production'], g: ['銀', 'Silver'], s: ['武學', 'Insight'], c: ['俠名', 'Renown'] };

export const ERAS = [
  ['入門', 'Initiate'], ['小成', 'Adept'], ['大成', 'Master'], ['化境', 'Transcendent'], ['宗師', 'Grandmaster'],
];

export const SEASONS = [['春', 'Spring'], ['夏', 'Summer'], ['秋', 'Autumn'], ['冬', 'Winter']];

// ------------------------------------------------------------------ map
export const SIZES = {
  small: { w: 44, h: 28, n: ['小', 'Small'], players: 4, villages: 4, camps: 5 },
  medium: { w: 58, h: 36, n: ['中', 'Medium'], players: 6, villages: 6, camps: 8 },
  large: { w: 74, h: 46, n: ['大', 'Large'], players: 8, villages: 9, camps: 12 },
};
export const MAPTYPES = {
  pangaea: ['九州一陸', 'One Great Land'],
  continents: ['兩岸江湖', 'Two Shores'],
  isles: ['千島', 'A Thousand Isles'],
};
export const SPEEDS = {
  quick: { n: ['快速', 'Quick'], cost: 0.55, limit: 180, congress: 18, route: 18 },
  standard: { n: ['標準', 'Standard'], cost: 1.0, limit: 300, congress: 28, route: 30 },
  blitz: { n: ['急速（測試）', 'Blitz (test)'], cost: 0.36, limit: 140, congress: 14, route: 14 },
};

// terrain: y yields, mv move cost (0 = impassable on foot), def defence bonus (flat strength), water
export const TERRAIN = {
  grass: { n: ['草原', 'Grassland'], y: { f: 2, p: 0, g: 0 }, mv: 1, def: 0, col: '#9fbf6a' },
  plains: { n: ['平原', 'Plains'], y: { f: 1, p: 1, g: 0 }, mv: 1, def: 0, col: '#c9c27a' },
  hills: { n: ['丘陵', 'Hills'], y: { f: 1, p: 2 }, mv: 2, def: 3, col: '#b39a62' },
  mountain: { n: ['山岳', 'Mountains'], y: { p: 1, s: 1 }, mv: 0, def: 5, col: '#8f8577' },
  forest: { n: ['森林', 'Forest'], y: { f: 1, p: 2 }, mv: 2, def: 3, col: '#5f8a4e' },
  bamboo: { n: ['竹林', 'Bamboo'], y: { f: 1, p: 1, c: 1 }, mv: 2, def: 3, col: '#7fae5a' },
  marsh: { n: ['沼澤', 'Marsh'], y: { f: 1, p: 0, g: 0 }, mv: 2, def: -2, col: '#7f9a78' },
  snow: { n: ['雪原', 'Snowfield'], y: { f: 0, p: 1 }, mv: 1, def: 0, col: '#e8ecee' },
  desert: { n: ['荒漠', 'Desert'], y: { f: 0, p: 1, g: 0 }, mv: 1, def: 0, col: '#dcc58e' },
  lake: { n: ['湖泊', 'Lake'], y: { f: 2, g: 1 }, mv: 0, def: 0, water: true, col: '#7fb6c2' },
  coast: { n: ['近海', 'Coast'], y: { f: 1, g: 1 }, mv: 0, def: 0, water: true, col: '#86b8c4' },
  sea: { n: ['遠海', 'Open Sea'], y: { f: 1 }, mv: 0, def: 0, water: true, deep: true, col: '#5d8fa6' },
};
export const TERRAIN_IDS = Object.keys(TERRAIN);
export const TID = Object.fromEntries(TERRAIN_IDS.map((k, i) => [k, i]));

// resources: kind lux (luxury: renown + growth when owned), strat (needed for some units), bonus
export const RESOURCES = {
  iron: { n: ['鐵礦', 'Iron'], kind: 'strat', y: { p: 1 }, on: ['hills', 'mountain', 'plains', 'desert'], imp: 'mine', col: '#5b6470' },
  horses: { n: ['良馬', 'Horses'], kind: 'strat', y: { f: 1, p: 1 }, on: ['plains', 'grass'], imp: 'pasture', col: '#8a5a3a' },
  tea: { n: ['茶', 'Tea'], kind: 'lux', y: { g: 1, c: 1 }, on: ['hills', 'grass', 'bamboo'], imp: 'garden', col: '#3f7a3a' },
  silk: { n: ['絲', 'Silk'], kind: 'lux', y: { g: 2 }, on: ['grass', 'plains', 'forest'], imp: 'garden', col: '#c86a8a' },
  salt: { n: ['鹽', 'Salt'], kind: 'lux', y: { f: 1, g: 1 }, on: ['desert', 'plains', 'marsh'], imp: 'mine', col: '#e8e4dc' },
  herbs: { n: ['藥草', 'Herbs'], kind: 'lux', y: { f: 1, s: 1 }, on: ['marsh', 'forest', 'bamboo', 'hills'], imp: 'garden', col: '#6aa84f' },
  jade: { n: ['玉', 'Jade'], kind: 'lux', y: { g: 2, c: 1 }, on: ['hills', 'mountain', 'desert'], imp: 'mine', col: '#4fb39a' },
  spirit: { n: ['靈石', 'Spirit Stones'], kind: 'strat', y: { s: 2 }, on: ['mountain', 'hills', 'snow'], imp: 'mine', col: '#8f6ad8', tech: 't_inner' },
  fish: { n: ['魚群', 'Fish'], kind: 'bonus', y: { f: 2 }, on: ['coast', 'lake'], imp: null, col: '#4a8ab8' },
  rice: { n: ['稻', 'Rice'], kind: 'bonus', y: { f: 1 }, on: ['grass', 'marsh', 'plains'], imp: 'farm', col: '#d8c060' },
};
export const RES_IDS = Object.keys(RESOURCES);

// improvements that cities develop by themselves on worked tiles once the tech is known
export const IMPROVEMENTS = {
  farm: { n: ['田', 'Farm'], y: { f: 1 }, tech: 't_farm', on: ['grass', 'plains', 'desert', 'marsh'] },
  mine: { n: ['礦', 'Mine'], y: { p: 1 }, tech: 't_mine', on: ['hills', 'mountain'] },
  lumber: { n: ['伐木場', 'Lumber camp'], y: { p: 1 }, tech: 't_iron', on: ['forest'] },
  garden: { n: ['園', 'Garden'], y: { g: 1 }, tech: 't_farm', on: ['bamboo'] },
  pasture: { n: ['牧場', 'Pasture'], y: { p: 1 }, tech: 't_horse', on: [] },
};
export const IMP_IDS = Object.keys(IMPROVEMENTS);

// ------------------------------------------------------------------ sects (players)
// ability flags are read by the rules (game.js); al = alignment: 正 righteous, 邪 unorthodox, 中 neutral
export const SECTS = {
  longmen: {
    n: ['龍門刀莊', 'Longmen Saber Manor'], leader: 'yirui', ln: ['奕叡', 'Yi Rui'], col: '#3b56a8', col2: '#d9e2ff', al: 0,
    ab: { n: ['一刀啟程', 'The First Cut'], d: ['近戰部隊進攻時 +3 戰力；開山弟子的產能需求 -25%。', 'Melee units get +3 strength when attacking; Founders cost 25% less production.'] },
    fx: { meleeAtk: 3, founderCost: 0.25 },
    uu: 'u_lm_saber', ub: 'b_lm_forge',
    pers: { aggr: 0.5, expand: 0.7, sci: 0.5, cult: 0.5, diplo: 0.5, wonder: 0.4 },
    cities: ['龍門', '刀莊', '啟程渡', '青石鎮', '雙奕城', '風刀嶺', '環首坡', '藍巾村', '奕家堡', '江口集', '斷雲關', '長亭'],
    citiesEn: ['Longmen', 'Saber Manor', 'Setting-out Ferry', 'Bluestone', 'Twin Yi', 'Windblade Ridge', 'Ring-pommel Slope', 'Blue Headband', 'Yi Fort', 'Rivermouth Market', 'Cloudbreak Pass', 'Long Pavilion'],
    intro: ['再遠的路，也是從第一刀開始的。', 'Even the longest road begins with the first cut.'],
  },
  hanjiang: {
    n: ['寒江閣', 'Cold River Pavilion'], leader: 'liuhanyan', ln: ['柳寒煙', 'Liu Hanyan'], col: '#4f9fc4', col2: '#e8f6ff', al: 0,
    ab: { n: ['霜飛雪落', 'Frost and Falling Snow'], d: ['部隊在雪原、沼澤與河流不受減速；臨水城市 +2 俠名。', 'Units ignore snow, marsh and river slowdowns; cities beside water get +2 renown.'] },
    fx: { ignoreRough: ['snow', 'marsh'], waterCityC: 2 },
    uu: 'u_hj_swordmaid', ub: 'b_hj_pavilion',
    pers: { aggr: 0.35, expand: 0.5, sci: 0.6, cult: 0.8, diplo: 0.5, wonder: 0.6 },
    cities: ['寒江閣', '聽雪渡', '霜橋', '冷月汀', '煙波亭', '白蘆洲', '寒煙鎮', '雪落村', '素劍坊', '凝霜堡', '江心島', '青簪樓'],
    citiesEn: ['Cold River Pavilion', 'Snow-listening Ferry', 'Frost Bridge', 'Cold Moon Shoal', 'Misty Wave Pavilion', 'White Reed Isle', 'Cold Mist', 'Snowfall', 'Plain Sword Works', 'Frozen Frost Fort', 'Midstream Isle', 'Green Hairpin Tower'],
    intro: ['人情欠下了，總是要還的。', 'A debt of kindness must always be repaid.'],
  },
  qianfo: {
    n: ['千佛寺', 'Thousand Buddha Temple'], leader: 'kuchan', ln: ['苦禪', 'Kuchan'], col: '#d9952a', col2: '#fff0d0', al: 0,
    ab: { n: ['慈悲為懷', 'Compassion First'], d: ['部隊即使移動或作戰也每回合恢復 10 點；宗師點數 +50%。', 'Units heal 10 every turn even after moving or fighting; +50% Grandmaster points.'] },
    fx: { healAlways: 10, gpPct: { zs: 0.5 } },
    uu: 'u_qf_luohan', ub: 'b_qf_hall',
    pers: { aggr: 0.2, expand: 0.5, sci: 0.8, cult: 0.6, diplo: 0.7, wonder: 0.6 },
    cities: ['千佛寺', '菩提院', '禪心林', '鐘鳴寺', '白眉峰', '袈裟鎮', '念珠村', '石窟', '蓮台', '晨鐘谷', '暮鼓崖', '般若堂'],
    citiesEn: ['Thousand Buddhas', 'Bodhi Court', 'Zen Heart Woods', 'Ringing Bell', 'White Brow Peak', 'Kasaya Town', 'Prayer Beads', 'The Grottoes', 'Lotus Throne', 'Morning Bell Valley', 'Evening Drum Cliff', 'Prajna Hall'],
    intro: ['阿彌陀佛，施主慢慢說，老衲都記得。', 'Amitabha. Take your time - this old monk remembers everything.'],
  },
  baolong: {
    n: ['暴龍崖', 'Tyrant Dragon Cliff'], leader: 'xiaotian', ln: ['冷笑天', 'Leng Xiaotian'], col: '#b8322a', col2: '#ffd7a0', al: 2,
    ab: { n: ['笑盡天下', 'Laugh Down the World'], d: ['擊殺敵軍時獲得等同其戰力的俠名；對受傷敵人 +5 戰力。', 'Killing a unit grants renown equal to its strength; +5 strength against wounded foes.'] },
    fx: { killRenown: 1, vsWounded: 5 },
    uu: 'u_bl_palm', ub: 'b_bl_arena',
    pers: { aggr: 0.9, expand: 0.6, sci: 0.4, cult: 0.3, diplo: 0.2, wonder: 0.3 },
    cities: ['暴龍崖', '金角城', '冷笑峰', '猩紅堡', '龍鱗關', '三笑坡', '掌風谷', '黑金寨', '霸天台', '赤崖', '龍吟渡', '傲世城'],
    citiesEn: ['Tyrant Dragon Cliff', 'Golden Horn', 'Cold Laugh Peak', 'Crimson Fort', 'Dragon Scale Pass', 'Three Laughs Slope', 'Palm Wind Valley', 'Black Gold Hold', 'Overlord Terrace', 'Red Cliff', 'Dragon Roar Ferry', 'Proud World'],
    intro: ['哈、哈、哈——天下英雄，不過如此。', 'Ha. Ha. Ha. So these are the heroes of the world.'],
  },
  youming: {
    n: ['幽冥教', 'Netherworld Sect'], leader: 'tuqianqiu', ln: ['屠千秋', 'Tu Qianqiu'], col: '#6b3d8f', col2: '#e6d0ff', al: 1,
    ab: { n: ['白骨幽冥', 'Bone and Shadow'], d: ['回合結束時，與我方部隊相鄰的敵軍各受 5 點傷害；攻下的城市人口不減。', 'At the end of each turn enemies next to our units take 5 damage; captured cities lose no population.'] },
    fx: { aura: 5, keepPop: 1 },
    uu: 'u_ym_assassin', ub: 'b_ym_altar',
    pers: { aggr: 0.8, expand: 0.5, sci: 0.6, cult: 0.4, diplo: 0.3, wonder: 0.4 },
    cities: ['幽冥殿', '白骨坡', '鬼面林', '冥河渡', '紫袍城', '寒骨洞', '無聲谷', '骨扇樓', '陰風口', '黑水鎮', '忘川', '夜行堡'],
    citiesEn: ['Netherworld Hall', 'White Bone Slope', 'Ghostmask Woods', 'Styx Ferry', 'Violet Robe', 'Cold Bone Cave', 'Silent Valley', 'Bone Fan Tower', 'Yin Wind Gap', 'Blackwater', 'River of Forgetting', 'Night-walker Fort'],
    intro: ['不急，不急。客客氣氣，才好說話。', 'No hurry. Polite people talk best.'],
  },
  yuyao: {
    n: ['馭妖宗', 'Beastbinder Sect'], leader: 'mowuya', ln: ['墨無涯', 'Mo Wuya'], col: '#4f8a3a', col2: '#dff5c8', al: 2,
    ab: { n: ['萬妖聽令', 'Ten Thousand Beasts Obey'], d: ['野獸不攻擊我方；擊敗野獸或清除獸穴時，有一半機會收服牠成為部隊。', 'Wild beasts never attack us; defeating a beast or clearing a lair has a 50% chance to tame it as a unit.'] },
    fx: { beastFriend: 1, tame: 0.5 },
    uu: 'u_yy_tiger', ub: 'b_yy_pen',
    pers: { aggr: 0.6, expand: 0.6, sci: 0.5, cult: 0.4, diplo: 0.4, wonder: 0.7 },
    cities: ['馭妖宗', '萬妖嶺', '鈴音谷', '獸王台', '青竹寨', '狼嚎坡', '蛇盤洞', '虎嘯林', '火鴉崖', '蛟潭', '狐丘', '百獸原'],
    citiesEn: ['Beastbinder Hall', 'Myriad Beasts Ridge', 'Bell Valley', 'Beast King Terrace', 'Green Bamboo Camp', 'Wolf Howl Slope', 'Coiled Snake Cave', 'Tiger Roar Woods', 'Fire Crow Cliff', 'Jiao Pool', 'Fox Mound', 'Hundred Beasts Plain'],
    intro: ['天下的妖物，終有一天都會聽話。', 'One day every beast under heaven will heed me.'],
  },
  qianjia: {
    n: ['錢家商號', 'House of Qian'], leader: 'qianwanli', ln: ['錢萬里', 'Qian Wanli'], col: '#c9a227', col2: '#fff3c0', al: 0,
    ab: { n: ['金算盤', 'The Golden Abacus'], d: ['鏢路容量 +1；銀兩 +10%；以銀兩購買便宜 15%。', '+1 escort route capacity; +10% silver; buying with silver costs 15% less.'] },
    fx: { routes: 1, gPct: 0.1, buyDisc: 0.15 },
    uu: 'u_qj_escort', ub: 'b_qj_bank',
    pers: { aggr: 0.25, expand: 0.6, sci: 0.5, cult: 0.5, diplo: 0.8, wonder: 0.5 },
    cities: ['錢家莊', '金算盤', '萬里號', '通寶鎮', '銀杏集', '紅珠坊', '富春', '聚寶盆', '算盤街', '招財渡', '進寶村', '盈泰'],
    citiesEn: ['Qian Manor', 'Golden Abacus', 'Wanli Trading', 'Tongbao', 'Ginkgo Market', 'Red Bead Works', 'Fuchun', 'Treasure Bowl', 'Abacus Street', 'Fortune Ferry', 'Jinbao', 'Yingtai'],
    intro: ['一文一釐，都要算得清清楚楚。', 'Every coin, every copper, counted to the last.'],
  },
  heifeng: {
    n: ['黑風寨', 'Black Wind Fort'], leader: 'heixiong', ln: ['黑熊', 'Black Bear'], col: '#5a4632', col2: '#f0dcc0', al: 2,
    ab: { n: ['綠林好漢', 'Brothers of the Greenwood'], d: ['流寇不攻擊我方；部隊走進流寇山寨可收編一支部隊並得 40 銀。', 'Bandits never attack us; a unit that walks into a bandit camp recruits a unit from it and takes 40 silver.'] },
    fx: { banditFriend: 1, convertCamp: 1 },
    uu: 'u_hf_club', ub: 'b_hf_hall',
    pers: { aggr: 0.75, expand: 0.7, sci: 0.3, cult: 0.3, diplo: 0.3, wonder: 0.2 },
    cities: ['黑風寨', '熊皮嶺', '狼牙關', '刀疤坳', '瘦猴坡', '聚義寨', '黑松林', '斷橋', '野豬林', '山神廟', '十八盤', '落草坡'],
    citiesEn: ['Black Wind Fort', 'Bearskin Ridge', 'Wolf-tooth Pass', 'Scar Hollow', 'Skinny Monkey Slope', 'Brotherhood Hold', 'Black Pine Woods', 'Broken Bridge', 'Boar Woods', 'Mountain God Shrine', 'Eighteen Bends', 'Outlaw Slope'],
    intro: ['吃肉喝酒，有難同當！', 'Meat, wine, and trouble shared!'],
  },
  xuedao: {
    n: ['血刀門', 'Blood Saber Sect'], leader: 'lihanshan', ln: ['厲寒山', 'Li Hanshan'], col: '#8e1b1b', col2: '#ffc8c0', al: 1,
    ab: { n: ['九斬不留', 'Nine Cuts, None Spared'], d: ['近戰部隊擊殺敵軍後，若還有行動力，可以再攻擊一次（每回合一次）。', 'A melee unit that kills an enemy may attack once more that turn if it has moves left.'] },
    fx: { secondStrike: 1 },
    uu: 'u_xd_blood', ub: 'b_xd_hall',
    pers: { aggr: 0.85, expand: 0.5, sci: 0.5, cult: 0.3, diplo: 0.2, wonder: 0.3 },
    cities: ['血刀門', '斷魂坡', '九斬台', '赤刃城', '紅袍谷', '不敗峰', '寒山寺', '刀光鎮', '血河渡', '孤峰', '殘陽關', '驚鴻'],
    citiesEn: ['Blood Saber Hall', 'Soulbreaker Slope', 'Nine Cuts Terrace', 'Red Blade', 'Red Robe Valley', 'Unbeaten Peak', 'Cold Mountain', 'Bladelight', 'Blood River Ferry', 'Lone Peak', 'Setting Sun Pass', 'Startled Swan'],
    intro: ['我平生最恨一個「輸」字。', 'There is no word I hate more than "lose".'],
  },
  zhifa: {
    n: ['執法堂', 'Hall of Law'], leader: 'tiewusi', ln: ['鐵無私', 'Tie Wusi'], col: '#4c5a6e', col2: '#dfe6ef', al: 0,
    ab: { n: ['鐵面無私', 'An Iron Face'], d: ['武林大會票數 +1；城市防禦戰力 +25%；對我方宣戰的門派得到雙倍公憤。', '+1 vote at the Wulin Assembly; +25% city defence; sects that declare war on us earn double grievances.'] },
    fx: { votes: 1, cityDefPct: 0.25, grievX: 2 },
    uu: 'u_zf_chain', ub: 'b_zf_court',
    pers: { aggr: 0.4, expand: 0.5, sci: 0.5, cult: 0.5, diplo: 0.9, wonder: 0.4 },
    cities: ['執法堂', '鐵鎖關', '烏紗城', '明鏡台', '公堂', '連環堡', '證據坊', '鐵面鎮', '法度', '正氣亭', '肅靜村', '回避巷'],
    citiesEn: ['Hall of Law', 'Iron Lock Pass', 'Black Gauze', 'Bright Mirror Terrace', 'The Court', 'Chain Fort', 'Evidence Works', 'Iron Face', 'Statute', 'Righteous Pavilion', 'Silence', 'Recusal Lane'],
    intro: ['我只認證據，不認交情。', 'I trust evidence, not friendship.'],
  },
  ciyun: {
    n: ['慈雲庵', 'Mercy Cloud Nunnery'], leader: 'jingci', ln: ['靜慈師太', 'Abbess Jingci'], col: '#c86a8e', col2: '#ffe0ec', al: 0,
    ab: { n: ['慈航普渡', 'Ferry of Mercy'], d: ['城市成長 +15%；藥草每處 +2 糧；我方部隊每回合多恢復 5 點。', '+15% city growth; each Herbs gives +2 food; our units heal 5 more each turn.'] },
    fx: { growthPct: 0.15, herbFood: 2, heal: 5 },
    uu: 'u_cy_nun', ub: 'b_cy_garden',
    pers: { aggr: 0.3, expand: 0.6, sci: 0.6, cult: 0.7, diplo: 0.7, wonder: 0.6 },
    cities: ['慈雲庵', '靜心庵', '雲水寺', '藥圃', '素衣坊', '普渡口', '蓮心', '慈航渡', '清音閣', '白雲坡', '杏林', '月華庵'],
    citiesEn: ['Mercy Cloud', 'Still Heart', 'Cloud and Water', 'Herb Garden', 'Plain Robe Works', 'Pudu Landing', 'Lotus Heart', 'Mercy Ferry', 'Clear Sound', 'White Cloud Slope', 'Apricot Grove', 'Moonlight Nunnery'],
    intro: ['刀劍無眼，人心有情。', 'Blades have no eyes; hearts have feeling.'],
  },
};
export const SECT_IDS = Object.keys(SECTS);
export const ALIGN = [['正', 'Righteous'], ['邪', 'Unorthodox'], ['中', 'Neutral']];

// ------------------------------------------------------------------ units
// cls: civ, recon, melee, anti, ranged, mounted, siege, navalR, navalM, hero, gp, trade, beast, bandit
export const UNITS = {
  u_founder: { n: ['開山弟子', 'Founder'], cls: 'civ', cost: 60, str: 0, mv: 2, sight: 2, spr: 'founder', d: ['在合適的地方開宗立派，建立新的據點。', 'Founds a new stronghold on a good site.'] },
  u_scout: { n: ['斥候', 'Scout'], cls: 'recon', cost: 25, str: 8, mv: 3, sight: 3, spr: 'scout', up: null, d: ['腳程快、看得遠，適合探路。', 'Fast and far-sighted; made for exploring.'] },
  u_disciple: { n: ['弟子', 'Disciple'], cls: 'melee', cost: 30, str: 12, mv: 2, spr: 'disciple', up: 'u_saber' },
  u_archer: { n: ['弓手', 'Archer'], cls: 'ranged', cost: 40, str: 6, rstr: 14, rng: 2, mv: 2, tech: 't_archery', spr: 'archer', up: 'u_hidden' },
  u_saber: { n: ['刀客', 'Saber'], cls: 'melee', cost: 55, str: 21, mv: 2, tech: 't_saber', spr: 'saber', up: 'u_sword' },
  u_sword: { n: ['劍客', 'Swordsman'], cls: 'melee', cost: 75, str: 27, mv: 2, tech: 't_sword', spr: 'sword', up: 'u_inner' },
  u_hidden: { n: ['暗器手', 'Dart Thrower'], cls: 'ranged', cost: 65, str: 12, rstr: 23, rng: 2, mv: 2, tech: 't_hidden', spr: 'hidden', up: 'u_crossbow' },
  u_rider: { n: ['馬隊', 'Riders'], cls: 'mounted', cost: 75, str: 25, mv: 4, tech: 't_horse', res: 'horses', spr: 'rider', up: 'u_ironcav' },
  u_ram: { n: ['攻城木', 'Battering Ram'], cls: 'siege', cost: 60, str: 16, vsCity: 20, mv: 2, tech: 't_fort', spr: 'ram', melee: true },
  u_caravan: { n: ['鏢隊', 'Escort Caravan'], cls: 'trade', cost: 45, str: 0, mv: 3, tech: 't_trade', spr: 'caravan', d: ['護送貨物到另一座城市，開出一條鏢路（每回合得銀兩，沿途修路）。', 'Carries goods to another city to open an escort route (silver every turn, builds roads on the way).'] },
  u_boat: { n: ['江船', 'River Boat'], cls: 'navalR', cost: 60, str: 12, rstr: 18, rng: 2, mv: 4, tech: 't_boat', spr: 'boat', naval: true, up: 'u_warship' },
  u_spear: { n: ['槍陣', 'Spear Wall'], cls: 'anti', cost: 80, str: 30, vsMounted: 10, mv: 2, tech: 't_spear', spr: 'spear', up: 'u_swordform' },
  u_inner: { n: ['內家高手', 'Inner-art Adept'], cls: 'melee', cost: 110, str: 34, mv: 2, tech: 't_inner', spr: 'inner', up: 'u_swordform' },
  u_catapult: { n: ['投石車', 'Catapult'], cls: 'siege', cost: 100, str: 12, rstr: 28, rng: 2, vsCity: 12, mv: 2, tech: 't_mech', spr: 'catapult', up: 'u_thunder' },
  u_warship: { n: ['樓船', 'Tower Ship'], cls: 'navalM', cost: 120, str: 36, mv: 4, tech: 't_ships', spr: 'warship', naval: true },
  u_swordform: { n: ['劍陣', 'Sword Formation'], cls: 'melee', cost: 160, str: 42, mv: 2, tech: 't_swordform', res: 'iron', spr: 'swordform', up: 'u_master' },
  u_crossbow: { n: ['連弩手', 'Repeater Crossbows'], cls: 'ranged', cost: 150, str: 22, rstr: 41, rng: 2, mv: 2, tech: 't_crossbow', spr: 'crossbow', up: 'u_starbow' },
  u_ironcav: { n: ['鐵騎', 'Iron Cavalry'], cls: 'mounted', cost: 170, str: 44, mv: 4, tech: 't_ironcav', res: 'horses', res2: 'iron', spr: 'ironcav' },
  u_thunder: { n: ['霹靂車', 'Thunder Cart'], cls: 'siege', cost: 180, str: 20, rstr: 46, rng: 2, vsCity: 15, mv: 2, tech: 't_powder', spr: 'thunder' },
  u_master: { n: ['絕頂高手', 'Peerless Master'], cls: 'melee', cost: 250, str: 56, mv: 3, tech: 't_simple', res: 'spirit', spr: 'master' },
  u_starbow: { n: ['落星弓手', 'Star-felling Archers'], cls: 'ranged', cost: 240, str: 30, rstr: 56, rng: 3, mv: 2, tech: 't_allstreams', spr: 'starbow' },
  // unique units
  u_lm_saber: { n: ['啟程刀客', 'Setting-out Saber'], cls: 'melee', cost: 55, str: 23, mv: 3, tech: 't_saber', sect: 'longmen', rep: 'u_saber', spr: 'lm_saber', up: 'u_sword', d: ['比一般刀客多一點行動力、多兩點戰力。', 'One more move and two more strength than a common Saber.'] },
  u_hj_swordmaid: { n: ['寒江劍姬', 'Cold River Swordmaid'], cls: 'melee', cost: 75, str: 28, mv: 2, tech: 't_sword', sect: 'hanjiang', rep: 'u_sword', spr: 'hj_sword', noZOC: true, up: 'u_inner', d: ['輕身細劍，不受敵軍控制區阻攔。', 'Light on her feet: ignores enemy zones of control.'] },
  u_qf_luohan: { n: ['羅漢僧', 'Arhat Monk'], cls: 'anti', cost: 80, str: 32, vsMounted: 10, fortBonus: 4, mv: 2, tech: 't_spear', sect: 'qianfo', rep: 'u_spear', spr: 'qf_monk', up: 'u_swordform', d: ['駐守時多 +4 戰力。', '+4 more strength when fortified.'] },
  u_bl_palm: { n: ['暴龍掌客', 'Dragon Palm Brawler'], cls: 'melee', cost: 32, str: 15, mv: 2, sect: 'baolong', rep: 'u_disciple', spr: 'bl_palm', up: 'u_saber', d: ['比一般弟子強三分的掌力。', 'Hits three points harder than a Disciple.'] },
  u_ym_assassin: { n: ['幽冥刺客', 'Netherworld Assassin'], cls: 'ranged', cost: 65, str: 16, rstr: 24, rng: 2, mv: 3, tech: 't_hidden', sect: 'youming', rep: 'u_hidden', spr: 'ym_assassin', noZOC: true, up: 'u_crossbow', d: ['多一點行動力，不受控制區阻攔。', 'One more move; ignores zones of control.'] },
  u_yy_tiger: { n: ['妖虎騎', 'Demon Tiger Rider'], cls: 'mounted', cost: 75, str: 27, mv: 4, tech: 't_horse', sect: 'yuyao', rep: 'u_rider', spr: 'yy_tiger', up: 'u_ironcav', d: ['不需要良馬。', 'Needs no Horses.'] },
  u_qj_escort: { n: ['金鏢隊', 'Golden Escort'], cls: 'trade', cost: 45, str: 14, mv: 3, tech: 't_trade', sect: 'qianjia', rep: 'u_caravan', spr: 'qj_escort', routeG: 2, d: ['能自衛的鏢隊，每條鏢路多 2 銀。', 'A caravan that can defend itself; +2 silver on each route.'] },
  u_hf_club: { n: ['狼牙棒手', 'Wolf-tooth Clubman'], cls: 'melee', cost: 45, str: 20, mv: 2, tech: 't_stance', sect: 'heifeng', rep: 'u_saber', spr: 'hf_club', up: 'u_sword', d: ['不必學刀法，練過紮馬步就能招募。', 'Available from Horse Stance, no Saber Art needed.'] },
  u_xd_blood: { n: ['血刀客', 'Blood Saber'], cls: 'melee', cost: 75, str: 30, mv: 2, tech: 't_sword', sect: 'xuedao', rep: 'u_sword', spr: 'xd_blood', up: 'u_inner', d: ['九斬之下不留人。', 'Nine cuts, none spared.'] },
  u_zf_chain: { n: ['鐵鍊捕快', 'Iron Chain Constable'], cls: 'anti', cost: 80, str: 30, vsMounted: 10, homeDef: 5, mv: 2, tech: 't_spear', sect: 'zhifa', rep: 'u_spear', spr: 'zf_chain', up: 'u_swordform', d: ['在我方境內防守 +5 戰力。', '+5 strength defending inside our borders.'] },
  u_cy_nun: { n: ['素衣劍尼', 'White-robed Sword Nun'], cls: 'melee', cost: 75, str: 26, mv: 2, tech: 't_sword', sect: 'ciyun', rep: 'u_sword', spr: 'cy_nun', healAdj: 10, up: 'u_inner', d: ['相鄰友軍每回合多恢復 10 點。', 'Adjacent friendly units heal 10 more each turn.'] },
  // neutrals of the jianghu
  x_lackey: { n: ['流寇嘍囉', 'Bandit Lackey'], cls: 'bandit', cost: 0, str: 10, mv: 2, spr: 'lackey', neutral: true },
  x_cudgel: { n: ['流寇棍手', 'Bandit Cudgeler'], cls: 'bandit', cost: 0, str: 18, mv: 2, spr: 'cudgeler', neutral: true },
  x_bowman: { n: ['山賊弓手', 'Bandit Archer'], cls: 'bandit', cost: 0, str: 8, rstr: 16, rng: 2, mv: 2, spr: 'archer_b', neutral: true },
  x_thug: { n: ['血刀打手', 'Blood Saber Thug'], cls: 'bandit', cost: 0, str: 30, mv: 2, spr: 'bloodthug', neutral: true },
  x_wolf: { n: ['灰狼', 'Grey Wolf'], cls: 'beast', cost: 0, str: 12, mv: 3, spr: 'greywolf', neutral: true },
  x_boar: { n: ['山豬', 'Wild Boar'], cls: 'beast', cost: 0, str: 16, mv: 2, spr: 'wildboar', neutral: true },
  x_tiger: { n: ['吊睛白額虎', 'White-browed Tiger'], cls: 'beast', cost: 0, str: 28, mv: 3, spr: 'tiger', neutral: true },
  x_ape: { n: ['白猿', 'White Ape'], cls: 'beast', cost: 0, str: 36, mv: 3, spr: 'ape', neutral: true },
  // heroes and great people are built from HEROES / GREAT below
  hero: { n: ['俠客', 'Hero'], cls: 'hero', cost: 0, str: 0, mv: 3, sight: 3, spr: 'hero' },
  gp: { n: ['奇人', 'Great Person'], cls: 'gp', cost: 0, str: 0, mv: 3, spr: 'gp' },
};
export const UNIT_IDS = Object.keys(UNITS);

// tame / recruit results by era (beasts tamed by the Beastbinders keep their kind; bandits join the Black Wind)
export const NEUTRAL_BY_ERA = {
  bandit: [['x_lackey', 'x_bowman'], ['x_cudgel', 'x_bowman'], ['x_cudgel', 'x_thug'], ['x_thug'], ['x_thug']],
  beast: [['x_wolf', 'x_boar'], ['x_wolf', 'x_boar'], ['x_boar', 'x_tiger'], ['x_tiger', 'x_ape'], ['x_ape']],
};

// promotions (chosen at level up). cls: which unit classes may take it
export const PROMOS = {
  pr_break: { n: ['破甲', 'Armour Breaker'], d: ['攻擊城市與駐守敵軍 +6', '+6 attacking cities and fortified foes'], cls: ['melee', 'anti', 'mounted', 'hero', 'siege', 'navalM'] },
  pr_iron: { n: ['鐵布衫', 'Iron Shirt'], d: ['防守 +5', '+5 when defending'], cls: ['melee', 'anti', 'mounted', 'hero', 'ranged', 'recon', 'navalM', 'navalR', 'siege'] },
  pr_chain: { n: ['連環', 'Chained Blows'], d: ['夾擊加成加倍', 'Double flanking bonus'], cls: ['melee', 'anti', 'mounted', 'hero'] },
  pr_qing: { n: ['輕功', 'Qinggong'], d: ['行動力 +1', '+1 movement'], cls: ['melee', 'anti', 'mounted', 'hero', 'recon', 'ranged'] },
  pr_heal: { n: ['療傷', 'Mend'], d: ['每回合多恢復 10', 'Heals 10 more each turn'], cls: ['melee', 'anti', 'mounted', 'hero', 'ranged', 'recon', 'siege', 'navalM', 'navalR'] },
  pr_aim: { n: ['百步穿楊', 'Hundred-pace Aim'], d: ['遠程攻擊 +5', '+5 ranged strength'], cls: ['ranged', 'siege', 'navalR', 'hero'] },
  pr_high: { n: ['居高臨下', 'High Ground'], d: ['在丘陵或山上遠程 +7', '+7 ranged from hills or mountains'], cls: ['ranged', 'siege'] },
  pr_wood: { n: ['林間伏擊', 'Woodland Ambush'], d: ['在森林與竹林作戰 +6', '+6 fighting in forest or bamboo'], cls: ['melee', 'anti', 'recon', 'hero', 'ranged'] },
  pr_charge: { n: ['衝陣', 'Charge'], d: ['進攻 +5', '+5 when attacking'], cls: ['melee', 'mounted', 'hero', 'navalM'] },
  pr_eye: { n: ['鷹眼', 'Hawk Eye'], d: ['視野 +1', '+1 sight'], cls: ['recon', 'ranged', 'navalR', 'navalM', 'hero', 'mounted'] },
};
export const XP_LEVELS = [15, 35, 65, 105, 160, 230];

// ------------------------------------------------------------------ buildings (one per city) and wonders (one per world)
// u upkeep in silver; gp great person points per turn {zs grandmaster, sy physician, mj smith, ss storyteller}
export const BUILDINGS = {
  b_granary: { n: ['糧倉', 'Granary'], cost: 55, u: 1, tech: 't_farm', y: { f: 2 }, keepFood: 0.25, d: ['+2 糧，成長時保留 25% 存糧。', '+2 food; keeps 25% of the food store on growth.'] },
  b_drill: { n: ['演武場', 'Drill Yard'], cost: 60, u: 1, tech: 't_stance', y: { c: 1 }, unitPct: 0.25, xp: 10, d: ['部隊產能 +25%，新部隊 +10 經驗。', '+25% production toward units; new units start with 10 experience.'] },
  b_market: { n: ['市集', 'Market'], cost: 60, u: 0, tech: 't_barter', y: { g: 3 }, d: ['+3 銀。', '+3 silver.'] },
  b_library: { n: ['藏經閣', 'Scripture Library'], cost: 70, u: 1, tech: 't_breath', y: { s: 3 }, gp: { zs: 1 }, d: ['+3 武學，宗師點數 +1。', '+3 insight; +1 Grandmaster point.'] },
  b_teahouse: { n: ['茶樓', 'Teahouse'], cost: 70, u: 1, civic: 'c_road', y: { c: 2, g: 1 }, legend: 1, gp: { ss: 1 }, d: ['+2 俠名 +1 銀，傳奇 +1，說書人點數 +1。茶 +1 俠名。', '+2 renown, +1 silver, +1 legend, +1 Storyteller point. Tea gives +1 renown.'] },
  b_shrine: { n: ['宗祠', 'Ancestral Hall'], cost: 80, u: 1, civic: 'c_charter', y: { c: 3 }, border: 0.5, d: ['+3 俠名，疆域擴張快 50%。', '+3 renown; borders grow 50% faster.'] },
  b_herbroom: { n: ['煉丹房', 'Alchemy Room'], cost: 90, u: 1, tech: 't_alchemy', y: { f: 2, s: 1 }, healCity: 20, gp: { sy: 1 }, d: ['+2 糧 +1 武學，城中部隊多恢復 20，神醫點數 +1。', '+2 food, +1 insight, units in the city heal 20 more, +1 Physician point.'] },
  b_escort: { n: ['鏢局', 'Escort Agency'], cost: 90, u: 1, tech: 't_trade', y: { g: 2 }, routes: 1, d: ['+2 銀，鏢路容量 +1。', '+2 silver; +1 escort route capacity.'] },
  b_smithy: { n: ['鐵匠鋪', 'Smithy'], cost: 90, u: 1, tech: 't_iron', y: { p: 3 }, gp: { mj: 1 }, d: ['+3 產，名匠點數 +1。鐵礦 +1 產。', '+3 production; +1 Master Smith point. Iron gives +1 production.'] },
  b_harbour: { n: ['港口', 'Harbour'], cost: 90, u: 1, tech: 't_boat', y: { f: 2, g: 2 }, coastal: true, d: ['臨水城市才能建。+2 糧 +2 銀。', 'Waterside cities only. +2 food, +2 silver.'] },
  b_walls: { n: ['城牆', 'City Walls'], cost: 80, u: 0, tech: 't_fort', def: 12, hp: 100, d: ['城市防禦 +12、耐久 +100，城市可以遠程射擊。', '+12 city defence, +100 city hit points; the city can make ranged strikes.'] },
  b_meditation: { n: ['練功房', 'Meditation Hall'], cost: 150, u: 2, tech: 't_inner', y: { s: 4 }, pct: { s: 0.15 }, gp: { zs: 1 }, d: ['+4 武學，城市武學 +15%，宗師點數 +1。', '+4 insight, +15% city insight, +1 Grandmaster point.'] },
  b_bank: { n: ['錢莊', 'Money House'], cost: 150, u: 0, tech: 't_bank', y: { g: 4 }, pct: { g: 0.2 }, d: ['+4 銀，城市銀兩 +20%。', '+4 silver, +20% city silver.'] },
  b_workshop: { n: ['機關坊', 'Mechanism Workshop'], cost: 170, u: 2, tech: 't_mech', y: { p: 4 }, pct: { p: 0.15 }, gp: { mj: 1 }, d: ['+4 產，城市產能 +15%，名匠點數 +1。', '+4 production, +15% city production, +1 Master Smith point.'] },
  b_stage: { n: ['說書場', 'Storytelling Hall'], cost: 180, u: 2, civic: 'c_tales', y: { c: 4 }, legend: 3, gp: { ss: 2 }, d: ['+4 俠名，傳奇 +3，說書人點數 +2。', '+4 renown, +3 legend, +2 Storyteller points.'] },
  b_watch: { n: ['箭樓', 'Arrow Tower'], cost: 160, u: 1, tech: 't_crossbow', def: 10, cityRanged: 8, d: ['城市防禦 +10，城市射擊 +8。', '+10 city defence; +8 to city ranged strikes.'] },
  b_academy: { n: ['武學院', 'Martial Academy'], cost: 260, u: 3, tech: 't_cycle', y: { s: 6 }, pct: { s: 0.2 }, gp: { zs: 2 }, d: ['+6 武學，城市武學 +20%，宗師點數 +2。', '+6 insight, +20% city insight, +2 Grandmaster points.'] },
  // unique buildings
  b_lm_forge: { n: ['龍門刀坊', 'Longmen Blade Forge'], cost: 90, u: 1, tech: 't_iron', y: { p: 3, s: 1 }, xp: 10, gp: { mj: 2 }, sect: 'longmen', rep: 'b_smithy', d: ['取代鐵匠鋪：+3 產 +1 武學，新部隊 +10 經驗，名匠點數 +2。', 'Replaces the Smithy: +3 production, +1 insight, new units +10 experience, +2 Master Smith points.'] },
  b_hj_pavilion: { n: ['聽雪亭', 'Snow-listening Pavilion'], cost: 70, u: 1, civic: 'c_road', y: { c: 3, s: 1 }, legend: 2, gp: { ss: 1 }, sect: 'hanjiang', rep: 'b_teahouse', d: ['取代茶樓：+3 俠名 +1 武學，傳奇 +2。', 'Replaces the Teahouse: +3 renown, +1 insight, +2 legend.'] },
  b_qf_hall: { n: ['千佛殿', 'Hall of a Thousand Buddhas'], cost: 70, u: 1, tech: 't_breath', y: { s: 3, c: 2 }, gp: { zs: 2 }, sect: 'qianfo', rep: 'b_library', d: ['取代藏經閣：+3 武學 +2 俠名，宗師點數 +2。', 'Replaces the Library: +3 insight, +2 renown, +2 Grandmaster points.'] },
  b_bl_arena: { n: ['暴龍擂台', 'Tyrant Dragon Arena'], cost: 60, u: 1, tech: 't_stance', y: { c: 3 }, unitPct: 0.3, xp: 15, sect: 'baolong', rep: 'b_drill', d: ['取代演武場：+3 俠名，部隊產能 +30%，新部隊 +15 經驗。', 'Replaces the Drill Yard: +3 renown, +30% unit production, new units +15 experience.'] },
  b_ym_altar: { n: ['幽冥殿', 'Netherworld Altar'], cost: 80, u: 1, civic: 'c_charter', y: { c: 3, s: 2 }, border: 0.5, sect: 'youming', rep: 'b_shrine', d: ['取代宗祠：+3 俠名 +2 武學，疆域擴張快 50%。', 'Replaces the Ancestral Hall: +3 renown, +2 insight, borders grow 50% faster.'] },
  b_yy_pen: { n: ['萬妖欄', 'Beast Pens'], cost: 55, u: 1, tech: 't_farm', y: { f: 2, p: 2 }, keepFood: 0.25, sect: 'yuyao', rep: 'b_granary', d: ['取代糧倉：+2 糧 +2 產。', 'Replaces the Granary: +2 food, +2 production.'] },
  b_qj_bank: { n: ['錢家錢莊', 'Qian Family Bank'], cost: 140, u: 0, tech: 't_bank', y: { g: 6 }, pct: { g: 0.3 }, routes: 1, sect: 'qianjia', rep: 'b_bank', d: ['取代錢莊：+6 銀，城市銀兩 +30%，鏢路容量 +1。', 'Replaces the Money House: +6 silver, +30% silver, +1 route capacity.'] },
  b_hf_hall: { n: ['聚義廳', 'Hall of Brotherhood'], cost: 80, u: 0, tech: 't_fort', def: 12, hp: 100, y: { p: 2 }, sect: 'heifeng', rep: 'b_walls', d: ['取代城牆：同城牆，另 +2 產。', 'Replaces City Walls: as walls, plus +2 production.'] },
  b_xd_hall: { n: ['血刀堂', 'Blood Saber Hall'], cost: 60, u: 1, tech: 't_stance', y: { p: 1, c: 1 }, unitPct: 0.25, xp: 20, sect: 'xuedao', rep: 'b_drill', d: ['取代演武場：+1 產 +1 俠名，新部隊 +20 經驗。', 'Replaces the Drill Yard: +1 production, +1 renown, new units +20 experience.'] },
  b_zf_court: { n: ['刑名司', 'Court of Penalties'], cost: 80, u: 0, tech: 't_fort', def: 16, hp: 120, y: { c: 1 }, favour: 1, sect: 'zhifa', rep: 'b_walls', d: ['取代城牆：防禦 +16、耐久 +120，+1 人情。', 'Replaces City Walls: +16 defence, +120 hit points, +1 favour.'] },
  b_cy_garden: { n: ['慈雲藥圃', 'Mercy Cloud Herb Garden'], cost: 90, u: 1, tech: 't_alchemy', y: { f: 3, s: 1, c: 1 }, healCity: 30, gp: { sy: 2 }, sect: 'ciyun', rep: 'b_herbroom', d: ['取代煉丹房：+3 糧 +1 武學 +1 俠名，神醫點數 +2。', 'Replaces the Alchemy Room: +3 food, +1 insight, +1 renown, +2 Physician points.'] },
};
export const BUILDING_IDS = Object.keys(BUILDINGS);

export const WONDERS = {
  w_falls: { n: ['龍門飛瀑', 'Longmen Falls'], cost: 240, tech: 't_stance', y: { p: 3, c: 2 }, legend: 2, fx: { xp: 10 }, d: ['+3 產 +2 俠名；所有城市新部隊 +10 經驗。', '+3 production, +2 renown; new units in every city get +10 experience.'] },
  w_rain: { n: ['聽雨樓', 'Listening-Rain Tower'], cost: 260, civic: 'c_road', y: { c: 4, g: 2 }, legend: 4, gp: { ss: 3 }, d: ['+4 俠名 +2 銀，傳奇 +4，說書人點數 +3。', '+4 renown, +2 silver, +4 legend, +3 Storyteller points.'] },
  w_grotto: { n: ['千佛石窟', 'Thousand Buddha Grottoes'], cost: 300, tech: 't_breath', y: { s: 5, c: 2 }, legend: 3, d: ['+5 武學 +2 俠名，傳奇 +3。', '+5 insight, +2 renown, +3 legend.'] },
  w_tomb: { n: ['寒江劍冢', 'Sword Tomb of the Cold River'], cost: 360, tech: 't_sword', y: { c: 2 }, legend: 2, fx: { str: 2 }, d: ['所有部隊 +2 戰力，+2 俠名。', 'All units +2 strength; +2 renown.'] },
  w_abacus: { n: ['金算盤樓', 'Golden Abacus Hall'], cost: 360, tech: 't_trade', y: { g: 8 }, legend: 2, fx: { routes: 2 }, d: ['+8 銀，鏢路容量 +2。', '+8 silver; +2 escort route capacity.'] },
  w_bell: { n: ['鎮魂鐘', 'Soul-calming Bell'], cost: 380, tech: 't_medic', y: { c: 3 }, legend: 3, fx: { heal: 10 }, d: ['所有部隊每回合多恢復 10，+3 俠名。', 'All units heal 10 more each turn; +3 renown.'] },
  w_tower: { n: ['萬妖塔', 'Tower of Ten Thousand Beasts'], cost: 440, tech: 't_qinggong', y: { c: 3, p: 2 }, legend: 3, fx: { beastEvery: 12 }, d: ['每 12 回合得到一頭野獸部隊，+3 俠名 +2 產。', 'A tamed beast joins every 12 turns; +3 renown, +2 production.'] },
  w_stele: { n: ['武林盟碑', 'Stele of the Wulin Alliance'], cost: 480, civic: 'c_invite', y: { c: 3 }, legend: 3, fx: { votes: 2, favour: 3 }, d: ['武林大會 +2 票，每回合 +3 人情。', '+2 votes at the Assembly; +3 favour every turn.'] },
  w_secrets: { n: ['天機閣', 'Pavilion of Heavenly Secrets'], cost: 560, tech: 't_cycle', y: { s: 8 }, legend: 4, fx: { freeTech: 1, revealCaps: 1 }, d: ['立刻領悟一門武學，看見所有門派的山門，+8 武學。', 'Grants a free technique and reveals every sect\'s home seat; +8 insight.'] },
  w_hoard: { n: ['藏劍山莊', 'Sword-hoard Manor'], cost: 520, tech: 't_swordform', y: { p: 6 }, legend: 3, fx: { unitPct: 0.15 }, d: ['+6 產，所有城市部隊產能 +15%。', '+6 production; +15% unit production in every city.'] },
  w_dream: { n: ['太虛幻境', 'Dreamland of the Great Void'], cost: 700, civic: 'c_tales', y: { c: 6 }, legend: 10, d: ['傳奇 +10，+6 俠名。', '+10 legend, +6 renown.'] },
  w_ninefold: { n: ['九重天樓', 'Ninefold Heaven Tower'], cost: 820, tech: 't_allstreams', y: { s: 6, c: 6 }, legend: 6, d: ['+6 武學 +6 俠名，傳奇 +6。', '+6 insight, +6 renown, +6 legend.'] },
};
export const WONDER_IDS = Object.keys(WONDERS);

// the 武學宗師 victory: three stages, built in any city after 天人合一
export const PROJECTS = {
  pj_1: { n: ['參悟殘篇', 'Study the Broken Pages'], cost: 420, tech: 't_heaven', stage: 1, d: ['絕世神功第一步：拼湊散落江湖的殘篇。', 'The peerless art, step one: piece together the scattered pages.'] },
  pj_2: { n: ['融會貫通', 'Bring It All Together'], cost: 560, tech: 't_heaven', stage: 2, d: ['第二步：把百家武學融為一爐。', 'Step two: fuse a hundred schools into one.'] },
  pj_3: { n: ['創出絕世神功', 'Create the Peerless Art'], cost: 720, tech: 't_heaven', stage: 3, d: ['最後一步：神功一成，天下無人能敵。', 'The last step: once the art is made, no one under heaven can match it.'] },
};

// ------------------------------------------------------------------ 武學 tree (insight)
// x era column, y row for the tree screen
export const TECHS = {
  t_basics: { n: ['基本功', 'Fundamentals'], era: 0, cost: 0, req: [], x: 0, y: 3.5 },
  t_stance: { n: ['紮馬步', 'Horse Stance'], era: 0, cost: 25, req: ['t_basics'], x: 1, y: 0.5, d: ['下盤穩了，招式才使得出。', 'A steady stance is where every move begins.'] },
  t_farm: { n: ['耕讀', 'Tilling and Reading'], era: 0, cost: 25, req: ['t_basics'], x: 1, y: 2.5, insp: 'rice', d: ['晴耕雨讀，田地自己會開墾。', 'Farm when it shines, read when it rains: cities clear farms.'] },
  t_mine: { n: ['採礦', 'Mining'], era: 0, cost: 30, req: ['t_basics'], x: 1, y: 4.5, insp: 'iron', d: ['開山取石，丘陵與山岳能建礦場。', 'Cut into the hills: mines on hills and mountains.'] },
  t_archery: { n: ['射藝', 'Archery'], era: 0, cost: 30, req: ['t_basics'], x: 1, y: 6.5 },
  t_breath: { n: ['吐納', 'Breathing Arts'], era: 0, cost: 35, req: ['t_stance'], x: 2, y: 0 },
  t_barter: { n: ['互市', 'Barter'], era: 0, cost: 35, req: ['t_farm'], x: 2, y: 2, insp: 'silk' },
  t_herb: { n: ['草藥', 'Herb Lore'], era: 0, cost: 35, req: ['t_farm'], x: 2, y: 3, insp: 'herbs', d: ['部隊每回合多恢復 5。', 'Units heal 5 more each turn.'] },
  t_saber: { n: ['刀法', 'Saber Art'], era: 1, cost: 70, req: ['t_stance'], x: 2, y: 1 },
  t_iron: { n: ['冶鐵', 'Ironworking'], era: 1, cost: 80, req: ['t_mine'], x: 2, y: 4.5, insp: 'iron', d: ['森林能建伐木場。', 'Lumber camps in forests.'] },
  t_sword: { n: ['劍術', 'Swordplay'], era: 1, cost: 90, req: ['t_saber', 't_breath'], x: 3, y: 0 },
  t_horse: { n: ['馴馬', 'Horse Taming'], era: 1, cost: 80, req: ['t_archery', 't_farm'], x: 2, y: 6, insp: 'horses' },
  t_boat: { n: ['舟楫', 'Boating'], era: 1, cost: 80, req: ['t_barter'], x: 3, y: 2, insp: 'fish', d: ['陸上部隊可以登船走近海。', 'Land units can embark onto coastal waters.'] },
  t_trade: { n: ['商道', 'Trade Roads'], era: 1, cost: 90, req: ['t_barter'], x: 3, y: 1 },
  t_hidden: { n: ['暗器', 'Hidden Weapons'], era: 1, cost: 90, req: ['t_archery', 't_breath'], x: 3, y: 5 },
  t_alchemy: { n: ['煉丹', 'Alchemy'], era: 1, cost: 90, req: ['t_herb', 't_breath'], x: 3, y: 3, insp: 'herbs' },
  t_fort: { n: ['築城', 'Fortification'], era: 1, cost: 90, req: ['t_mine', 't_stance'], x: 3, y: 4 },
  t_inner: { n: ['內功心法', 'Inner Arts'], era: 2, cost: 180, req: ['t_sword', 't_alchemy'], x: 4, y: 0, d: ['看得見靈石。', 'Reveals Spirit Stones.'] },
  t_spear: { n: ['槍陣', 'Spear Formation'], era: 2, cost: 170, req: ['t_horse', 't_fort'], x: 4, y: 6 },
  t_mech: { n: ['機關術', 'Mechanisms'], era: 2, cost: 190, req: ['t_fort', 't_iron'], x: 4, y: 5 },
  t_qinggong: { n: ['梯雲縱', 'Cloud Ladder'], era: 2, cost: 180, req: ['t_hidden', 't_sword'], x: 4, y: 1, d: ['部隊可以翻越山岳。', 'Units can cross mountains.'] },
  t_medic: { n: ['醫經', 'Medical Canon'], era: 2, cost: 180, req: ['t_alchemy'], x: 4, y: 4, d: ['境內部隊多恢復 10。', 'Units in our lands heal 10 more.'] },
  t_bank: { n: ['錢莊', 'Banking'], era: 2, cost: 200, req: ['t_trade'], x: 4, y: 2, insp: 'jade' },
  t_ships: { n: ['樓船', 'Tower Ships'], era: 2, cost: 200, req: ['t_boat', 't_iron'], x: 4, y: 3, d: ['部隊可以登船走遠海。', 'Embarked units may cross the open sea.'] },
  t_poison: { n: ['毒經', 'Poison Canon'], era: 2, cost: 200, req: ['t_hidden', 't_alchemy'], x: 4, y: 7, d: ['遠程部隊 +3 戰力。', 'Ranged units +3 strength.'] },
  t_swordform: { n: ['劍陣', 'Sword Formation'], era: 3, cost: 400, req: ['t_inner', 't_spear'], x: 5, y: 0 },
  t_crossbow: { n: ['神臂弓', 'Divine-arm Crossbow'], era: 3, cost: 400, req: ['t_mech', 't_poison'], x: 5, y: 5 },
  t_ironcav: { n: ['鐵騎', 'Iron Cavalry'], era: 3, cost: 420, req: ['t_spear', 't_mech'], x: 5, y: 6 },
  t_powder: { n: ['霹靂火', 'Thunder Powder'], era: 3, cost: 450, req: ['t_mech', 't_medic'], x: 5, y: 4 },
  t_cycle: { n: ['周天運轉', 'The Grand Cycle'], era: 3, cost: 420, req: ['t_inner', 't_medic'], x: 5, y: 1, insp: 'spirit' },
  t_greattrade: { n: ['天下商路', 'Roads Under Heaven'], era: 3, cost: 400, req: ['t_bank', 't_ships'], x: 5, y: 2.5, d: ['鏢路容量 +1。', '+1 escort route capacity.'] },
  t_simple: { n: ['返璞歸真', 'Return to Simplicity'], era: 4, cost: 760, req: ['t_swordform', 't_cycle'], x: 6, y: 0.5 },
  t_allstreams: { n: ['萬流歸宗', 'All Streams to One Source'], era: 4, cost: 800, req: ['t_crossbow', 't_cycle', 't_greattrade'], x: 6, y: 3 },
  t_heaven: { n: ['天人合一', 'Heaven and Man as One'], era: 4, cost: 950, req: ['t_simple', 't_allstreams', 't_powder'], x: 7, y: 2, d: ['可以著手創出絕世神功（武學宗師勝利）。', 'Lets you begin creating the Peerless Art (the Grandmaster victory).'] },
};
export const TECH_IDS = Object.keys(TECHS);

// ------------------------------------------------------------------ 江湖 rules tree (renown) and 門規 policies
export const CIVICS = {
  c_rite: { n: ['拜師禮', 'The Apprentice Rite'], era: 0, cost: 0, req: [], x: 0, y: 2 },
  c_road: { n: ['江湖規矩', 'Rules of the Road'], era: 0, cost: 30, req: ['c_rite'], x: 1, y: 1, pol: ['p_patrol'] },
  c_charter: { n: ['開山立派', 'Founding Charter'], era: 0, cost: 30, req: ['c_rite'], x: 1, y: 3, pol: ['p_settle', 'p_drill'] },
  c_sworn: { n: ['結義', 'Sworn Brotherhood'], era: 1, cost: 70, req: ['c_road'], x: 2, y: 0, pol: ['p_brothers'], d: ['可以和其他門派結盟。', 'Alliances with other sects become possible.'] },
  c_chivalry: { n: ['行俠仗義', 'Chivalry'], era: 1, cost: 80, req: ['c_road'], x: 2, y: 1, pol: ['p_chivalry'], envoys: 1 },
  c_system: { n: ['門派體制', 'Sect Constitution'], era: 1, cost: 95, req: ['c_road', 'c_charter'], x: 2, y: 2, gov: ['g_martial', 'g_merchant', 'g_virtue'], pol: ['p_market'] },
  c_disciples: { n: ['廣收門徒', 'Open the Gates'], era: 1, cost: 75, req: ['c_charter'], x: 2, y: 3, pol: ['p_recruit', 'p_frugal'] },
  c_invite: { n: ['武林帖', 'Wulin Invitations'], era: 2, cost: 180, req: ['c_sworn', 'c_system'], x: 3, y: 0, pol: ['p_envoy'], envoys: 2, d: ['人情 +1／回合。', '+1 favour per turn.'] },
  c_intel: { n: ['江湖耳目', 'Eyes of the Jianghu'], era: 2, cost: 170, req: ['c_chivalry'], x: 3, y: 1, pol: ['p_garrison', 'p_scouting'] },
  c_guild: { n: ['商幫', 'Merchant Guilds'], era: 2, cost: 190, req: ['c_system'], x: 3, y: 2, pol: ['p_guild', 'p_caravan'] },
  c_precepts: { n: ['戒律', 'Precepts'], era: 2, cost: 190, req: ['c_disciples'], x: 3, y: 3, pol: ['p_vigil', 'p_scholar'] },
  c_orthodox: { n: ['武林正宗', 'True Lineage'], era: 3, cost: 370, req: ['c_invite', 'c_precepts'], x: 4, y: 0, gov: ['g_orthodox'], pol: ['p_academy'] },
  c_tales: { n: ['說書天下', 'Tales Across the Land'], era: 3, cost: 360, req: ['c_intel', 'c_guild'], x: 4, y: 1, pol: ['p_tales'] },
  c_first: { n: ['天下第一', 'First Under Heaven'], era: 3, cost: 380, req: ['c_precepts'], x: 4, y: 3, pol: ['p_first'] },
  c_unify: { n: ['一統江湖', 'Unite the Jianghu'], era: 3, cost: 400, req: ['c_invite', 'c_first'], x: 5, y: 2.5, gov: ['g_hegemony'], pol: ['p_siege'] },
  c_eternal: { n: ['千秋萬代', 'For a Thousand Autumns'], era: 4, cost: 640, req: ['c_orthodox', 'c_tales'], x: 5, y: 0.5, pol: ['p_eternal'] },
  c_peace: { n: ['天下太平', 'Peace Under Heaven'], era: 4, cost: 640, req: ['c_orthodox', 'c_unify'], x: 6, y: 1.5, pol: ['p_peace'], fx: { votes: 2, favour: 2 }, d: ['武林大會 +2 票，人情 +2／回合。', '+2 Assembly votes; +2 favour per turn.'] },
};
export const CIVIC_IDS = Object.keys(CIVICS);

// slots: w 武 martial, m 財 wealth, v 德 virtue, a 通 any
export const GOVS = {
  g_fledgling: { n: ['草創', 'Fledgling Sect'], slots: { w: 1, m: 1, v: 0, a: 0 }, fx: {}, d: ['剛開山的小門派。', 'A sect only just founded.'] },
  g_martial: { n: ['以武立派', 'The Way of Arms'], slots: { w: 2, m: 1, v: 0, a: 1 }, fx: { unitPct: 0.15 }, d: ['部隊產能 +15%。', '+15% production toward units.'] },
  g_merchant: { n: ['以商立派', 'The Way of Trade'], slots: { w: 0, m: 2, v: 1, a: 1 }, fx: { gPct: 0.15 }, d: ['銀兩 +15%。', '+15% silver.'] },
  g_virtue: { n: ['以德立派', 'The Way of Virtue'], slots: { w: 1, m: 0, v: 2, a: 1 }, fx: { cPct: 0.15 }, d: ['俠名 +15%。', '+15% renown.'] },
  g_orthodox: { n: ['武林正宗', 'True Lineage'], slots: { w: 1, m: 2, v: 2, a: 1 }, fx: { sPct: 0.1, favour: 1 }, d: ['武學 +10%，人情 +1／回合。', '+10% insight; +1 favour per turn.'] },
  g_hegemony: { n: ['霸業', 'Hegemony'], slots: { w: 3, m: 1, v: 1, a: 1 }, fx: { str: 2, unitPct: 0.1 }, d: ['所有部隊 +2 戰力，部隊產能 +10%。', 'All units +2 strength; +10% unit production.'] },
};

export const POLICIES = {
  p_patrol: { n: ['夜巡', 'Night Watch'], slot: 'w', fx: { heal: 5, vsNeutral: 5 }, d: ['部隊多恢復 5，對流寇野獸 +5 戰力。', 'Units heal 5 more; +5 strength against bandits and beasts.'] },
  p_drill: { n: ['勤練', 'Hard Drilling'], slot: 'w', fx: { unitPct: 0.25 }, d: ['部隊產能 +25%。', '+25% production toward units.'] },
  p_settle: { n: ['開荒', 'Break New Ground'], slot: 'm', fx: { founderPct: 0.5 }, d: ['開山弟子產能 +50%。', '+50% production toward Founders.'] },
  p_market: { n: ['市易', 'Market Rules'], slot: 'm', fx: { cityG: 1 }, d: ['每座城市 +1 銀。', '+1 silver in every city.'] },
  p_frugal: { n: ['節用', 'Thrift'], slot: 'm', fx: { bldPct: 0.2 }, d: ['建築產能 +20%。', '+20% production toward buildings.'] },
  p_recruit: { n: ['收徒', 'Take Apprentices'], slot: 'v', fx: { growthPct: 0.15 }, d: ['城市成長 +15%。', '+15% city growth.'] },
  p_chivalry: { n: ['行俠', 'Knight-errantry'], slot: 'v', fx: { cityC: 1 }, d: ['每座城市 +1 俠名。', '+1 renown in every city.'] },
  p_brothers: { n: ['結義金蘭', 'Blood Brothers'], slot: 'v', fx: { favour: 2, allyFavour: 1 }, d: ['人情 +2／回合，每個盟友再 +1。', '+2 favour per turn, +1 more per ally.'] },
  p_envoy: { n: ['廣結善緣', 'Make Many Friends'], slot: 'v', fx: { villageX: 0.5 }, d: ['村寨給的好處 +50%。', 'Village bonuses +50%.'] },
  p_garrison: { n: ['守土', 'Hold the Land'], slot: 'w', fx: { cityDef: 6, homeDef: 3 }, d: ['城市防禦 +6，境內防守 +3。', '+6 city defence; +3 defending in our lands.'] },
  p_scouting: { n: ['耳目', 'Eyes and Ears'], slot: 'a', fx: { sight: 1, sPct: 0.05 }, d: ['所有部隊視野 +1，武學 +5%。', 'All units +1 sight; +5% insight.'] },
  p_guild: { n: ['商幫規', 'Guild Charter'], slot: 'm', fx: { gPct: 0.15 }, d: ['銀兩 +15%。', '+15% silver.'] },
  p_caravan: { n: ['走鏢', 'Escort Runs'], slot: 'm', fx: { routeG: 3 }, d: ['每條鏢路 +3 銀。', '+3 silver per escort route.'] },
  p_vigil: { n: ['戒備', 'Vigilance'], slot: 'w', fx: { str: 2 }, d: ['所有部隊 +2 戰力。', 'All units +2 strength.'] },
  p_scholar: { n: ['傳燈', 'Pass the Lamp'], slot: 'v', fx: { sPct: 0.12 }, d: ['武學 +12%。', '+12% insight.'] },
  p_academy: { n: ['論劍', 'Sword Debates'], slot: 'a', fx: { sPct: 0.1, cPct: 0.1 }, d: ['武學與俠名 +10%。', '+10% insight and renown.'] },
  p_tales: { n: ['說書人', 'Patron of Storytellers'], slot: 'v', fx: { legendPct: 0.3, gpPct: { ss: 0.5 } }, d: ['傳奇 +30%，說書人點數 +50%。', '+30% legend; +50% Storyteller points.'] },
  p_first: { n: ['爭鋒', 'Contest of Champions'], slot: 'w', fx: { str: 3, xpPct: 0.5 }, d: ['所有部隊 +3 戰力，經驗 +50%。', 'All units +3 strength; +50% experience.'] },
  p_siege: { n: ['攻城法', 'Siegecraft'], slot: 'w', fx: { vsCity: 6, siegePct: 0.4 }, d: ['攻城 +6 戰力，攻城器械產能 +40%。', '+6 strength against cities; +40% production toward siege units.'] },
  p_eternal: { n: ['萬代基業', 'Legacy of Ages'], slot: 'a', fx: { allPct: 0.1 }, d: ['所有產出 +10%。', '+10% to every yield.'] },
  p_peace: { n: ['太平盛世', 'Golden Peace'], slot: 'v', fx: { cPct: 0.15, legendPct: 0.2, favour: 2 }, d: ['俠名 +15%，傳奇 +20%，人情 +2。', '+15% renown, +20% legend, +2 favour.'] },
};
export const SLOT_NAMES = { w: ['武規', 'Martial'], m: ['財規', 'Wealth'], v: ['德規', 'Virtue'], a: ['通規', 'Any'] };

// ------------------------------------------------------------------ heroes (recruited with renown) and great people
// spr is the Character Gallery id. str is at level 1; each level +3
export const HEROES = {
  h_yishuo: { n: ['奕碩', 'Yi Shuo'], spr: 'yishuo', str: 20, rstr: 22, rng: 2, ab: ['旋風球：可以遠程攻擊（射程 2）。', 'Whirlwind Ball: can make ranged attacks (range 2).'] },
  h_xiaolian: { n: ['小蓮', 'Xiaolian'], spr: 'xiaolian', str: 20, xpX: 2, ab: ['偷學：經驗加倍。', 'Sneaky Learner: double experience.'] },
  h_daoba: { n: ['刀疤', 'Scar'], spr: 'daoba', str: 25, atk: 5, ab: ['狠刀：進攻 +5。', 'Ruthless Blade: +5 attacking.'] },
  h_chutiankuo: { n: ['楚天闊', 'Chu Tiankuo'], spr: 'chutiankuo', str: 23, duel: 6, ab: ['挑戰：對其他俠客與高手 +6。', 'Challenger: +6 against heroes and masters.'] },
  h_wudadan: { n: ['武大膽', 'Wu Dadan'], spr: 'wudadan', str: 22, guard: 4, ab: ['擋在前面：相鄰友軍防守 +4。', 'Steps In Front: adjacent friends +4 defending.'] },
  h_aman: { n: ['阿蠻', 'A-Man'], spr: 'aman', str: 22, wild: 1, ab: ['狼女：不受森林、竹林、沼澤減速，野獸不攻擊她。', 'Wolf Girl: ignores forest, bamboo and marsh costs; beasts leave her alone.'] },
  h_yuweng: { n: ['獨臂漁翁', 'One-Armed Fisherman'], spr: 'yuweng', str: 26, sight: 2, ab: ['眼比刀快：視野 +2，防守 +4。', 'Eyes Faster than Blades: +2 sight, +4 defending.'], def: 4 },
  h_wenduizhang: { n: ['文對仗', 'Wen Duizhang'], spr: 'wenduizhang', str: 18, inspire: 3, ab: ['對聯驚雷：相鄰友軍進攻 +3。', 'Thunder Couplets: adjacent friends +3 attacking.'] },
  h_huotianxia: { n: ['霍天下', 'Huo Tianxia'], spr: 'huotianxia', str: 19, boast: 2, ab: ['自吹自擂：他參與的勝仗俠名加倍。', 'Braggart: renown from his victories doubled.'] },
  h_hubanxian: { n: ['胡半仙', 'Hu Banxian'], spr: 'hubanxian', str: 16, fortune: 1, ab: ['鐵口直斷：每回合 +2 武學（從來沒算準過）。', 'Never Wrong (Never Right): +2 insight per turn.'] },
  h_jiabafang: { n: ['賈八方', 'Jia Bafang'], spr: 'jiabafang', str: 16, trade: 4, ab: ['什麼都賣：每回合 +4 銀。', 'Sells Anything: +4 silver per turn.'] },
  h_niubaobao: { n: ['牛飽飽', 'Niu Baobao'], spr: 'niubaobao', str: 24, healAdj: 10, ab: ['肉包子：相鄰友軍每回合多恢復 10。', 'Meat Buns: adjacent friends heal 10 more each turn.'] },
  h_wenruyu: { n: ['溫如玉', 'Wen Ruyu'], spr: 'wenruyu', str: 15, scribe: 3, ab: ['失禮了：每回合 +3 武學。', '"Pardon me": +3 insight per turn.'] },
  h_masked: { n: ['蒙面人', 'The Masked Man'], spr: 'masked', str: 27, noZOC: true, ab: ['無人見過真面目：不受控制區阻攔。', 'No One Has Seen His Face: ignores zones of control.'] },
  h_guimian: { n: ['鬼面護法', 'Ghost-mask Warden'], spr: 'guimian', str: 26, fear: 3, ab: ['一言不發：相鄰敵軍 -3 戰力。', 'Silent Warden: adjacent enemies -3 strength.'] },
  h_shouhou: { n: ['瘦猴', 'Skinny Monkey'], spr: 'shouhou', str: 15, mvX: 2, ab: ['跑得最快：行動力 +2。', 'Fastest Feet: +2 movement.'] },
};
// leaders whose sect is not in the game join the hero pool with these stats
export const LEADER_HERO = { str: 28, atk: 3, ab: ['一派之主：進攻 +3。', 'Master of a Sect: +3 attacking.'] };

export const GREAT = {
  zs: { n: ['宗師', 'Grandmaster'], spr: 'gp_zs', d: ['傳授武學：立刻得到等於 8 回合武學的進度。', 'Teaches: gain 8 turns of insight at once.'],
    names: [['孤雲子', 'Guyunzi'], ['白眉道長', 'White-brow Daoist'], ['鐵頭陀', 'Iron Dhuta'], ['江一葦', 'Jiang Yiwei'], ['慧明禪師', 'Chan Master Huiming'], ['風清客', 'The Clear-wind Guest'], ['石中玉', 'Shi Zhongyu'], ['雲中鶴', 'Crane in the Clouds'], ['無名老僧', 'The Nameless Old Monk'], ['南山劍叟', 'Old Swordsman of South Hill']] },
  sy: { n: ['神醫', 'Divine Physician'], spr: 'mojide', d: ['妙手回春：所有部隊回滿，這座城市永久 +3 糧。', 'Miracle Cure: every unit fully healed; this city gains +3 food for good.'],
    names: [['莫記得', 'Mo Jide'], ['華千針', 'Hua Qianzhen'], ['杏林叟', 'Old Man of the Apricot Grove'], ['回春手', 'Spring-returning Hand'], ['百草娘子', 'Lady of a Hundred Herbs'], ['孫一帖', 'Sun One-dose'], ['葉青囊', 'Ye Qingnang'], ['薛懸壺', 'Xue Xuanhu']] },
  mj: { n: ['名匠', 'Master Smith'], spr: 'gp_mj', d: ['巧奪天工：立刻完成這座城市一半的生產（奇觀可用）。', 'Heaven\'s Own Craft: completes half of this city\'s current build (works on wonders).'],
    names: [['歐冶平', 'Ouye Ping'], ['魯十三', 'Lu Thirteen'], ['莫邪娘', 'Mother Moye'], ['公輸巧', 'Gongshu Qiao'], ['鐵手張', 'Iron-hand Zhang'], ['干將兒', 'Ganjiang\'s Boy'], ['風爐翁', 'Old Man of the Bellows'], ['錘不語', 'Silent Hammer']] },
  ss: { n: ['說書人', 'Storyteller'], spr: 'baixian', d: ['寫下一部傳奇：每回合 +3 傳奇，立刻 +60 俠名。', 'Writes a Legend: +3 legend every turn from now on; +60 renown at once.'],
    names: [['白先生', 'Mr Bai'], ['張快嘴', 'Quick-mouth Zhang'], ['柳琴翁', 'Old Willow Lute'], ['說不完', 'Never-done'], ['醒木李', 'Clapper Li'], ['夜雨生', 'The Night Rain Scholar'], ['半壺茶', 'Half-pot Tea'], ['聽風客', 'The Wind-listener']] },
};
export const GP_KEYS = ['zs', 'sy', 'mj', 'ss'];

// ------------------------------------------------------------------ neutral villages (befriend with envoys)
export const VILLAGE_KINDS = {
  martial: { n: ['武館', 'Martial Hall'], y: 'p', suz: { xp: 10 }, d: ['每階 +2 產給山門；盟主：新部隊 +10 經驗。', '+2 production to your seat per tier; patron: new units +10 experience.'] },
  market: { n: ['商鎮', 'Market Town'], y: 'g', suz: { gPct: 0.1 }, d: ['每階 +3 銀；盟主：銀兩 +10%。', '+3 silver per tier; patron: +10% silver.'] },
  academy: { n: ['書院', 'Academy'], y: 's', suz: { sPct: 0.1 }, d: ['每階 +2 武學；盟主：武學 +10%。', '+2 insight per tier; patron: +10% insight.'] },
  herb: { n: ['藥谷', 'Herb Valley'], y: 'f', suz: { heal: 10, growthPct: 0.1 }, d: ['每階 +2 糧給山門；盟主：成長 +10%、部隊恢復 +10。', '+2 food to your seat per tier; patron: +10% growth, units heal 10 more.'] },
  tea: { n: ['茶村', 'Tea Village'], y: 'c', suz: { legend: 3 }, d: ['每階 +2 俠名；盟主：傳奇 +3／回合。', '+2 renown per tier; patron: +3 legend per turn.'] },
  forge: { n: ['鐵坊', 'Forge Town'], y: 'p', suz: { unitPct: 0.1 }, d: ['每階 +2 產；盟主：部隊產能 +10%。', '+2 production per tier; patron: +10% unit production.'] },
};
export const VILLAGES = [
  ['青竹寨', 'Green Bamboo Camp', 'herb'], ['蘇河鎮', 'Suhe', 'market'], ['洛霞村', 'Luoxia', 'tea'], ['北雁關', 'Beiyan Pass', 'martial'],
  ['杏花村', 'Apricot Blossom', 'herb'], ['斷崖渡', 'Cliff Ferry', 'market'], ['白鹿書院', 'White Deer Academy', 'academy'],
  ['百草谷', 'Hundred Herbs Valley', 'herb'], ['鐵爐鎮', 'Iron Furnace', 'forge'], ['雲霧茶村', 'Cloud Mist Tea', 'tea'],
  ['臥虎武館', 'Crouching Tiger Hall', 'martial'], ['臨江驛', 'Riverside Post', 'market'], ['松風書院', 'Pine Wind Academy', 'academy'],
  ['落雁坡', 'Wild Goose Slope', 'forge'], ['十里亭', 'Ten-li Pavilion', 'tea'], ['聽濤莊', 'Wave-listening Manor', 'academy'],
];
export const ENVOY_TIERS = [1, 3, 6];

// ------------------------------------------------------------------ the Wulin Assembly (武林大會)
// each session votes on two resolutions (A/B) and always on the 盟主推舉 (Alliance Leader nomination)
export const RESOLUTIONS = {
  r_bounty: { n: ['江湖懸賞', 'A Bounty on a Sect'], target: 'sect', a: ['懸賞此門派：其他門派打它的部隊 +5 戰力。', 'Put a bounty on this sect: everyone else gets +5 strength against its units.'], b: ['赦免此門派：它的部隊 +3 戰力。', 'Pardon this sect: its units get +3 strength.'] },
  r_trade: { n: ['通商令', 'The Trade Edict'], target: 'sect', a: ['此門派的鏢路每條 +3 銀。', "This sect's escort routes give +3 silver each."], b: ['此門派的鏢路每條 -3 銀。', "This sect's escort routes give 3 less silver each."] },
  r_truce: { n: ['休兵令', 'The Truce Edict'], target: null, a: ['宣戰帶來的公憤加倍。', 'Grievances from declaring war are doubled.'], b: ['戰爭中佔領城市不帶公憤。', 'Capturing cities in a war brings no grievances.'] },
  r_manuals: { n: ['秘笈公開', 'Open the Manuals'], target: null, a: ['已被三個以上門派學會的武學，便宜 25%。', 'Techniques already known by three or more sects cost 25% less.'], b: ['武學最高的門派研究速度 -15%。', 'The sect with the most insight researches 15% slower.'] },
  r_banner: { n: ['正邪之辨', 'Righteous and Unorthodox'], target: 'align', a: ['此陣營的門派每座城市 +2 俠名。', 'Sects of this alignment get +2 renown in every city.'], b: ['此陣營的門派俠名 -15%。', 'Sects of this alignment get 15% less renown.'] },
  r_purge: { n: ['剿匪令', 'The Bandit Purge'], target: null, a: ['清除流寇山寨與獸穴的獎賞變三倍。', 'Clearing camps and lairs pays triple.'], b: ['流寇與野獸出沒加快，但門派之間不許宣戰（下屆前）。', 'Bandits and beasts spread faster, but no sect may declare war until the next session.'] },
  r_ranking: { n: ['論劍排名', 'The Sword Ranking'], target: 'sect', a: ['此門派奪得論劍第一：+80 俠名、傳奇 +4／回合。', 'This sect tops the ranking: +80 renown and +4 legend per turn.'], b: ['此門派墊底：俠名 -20%。', 'This sect comes last: 20% less renown.'] },
  r_salt: { n: ['鹽鐵之議', 'Salt and Iron'], target: 'sect', a: ['此門派專營鹽鐵：產能 +10%。', 'This sect holds the salt and iron monopoly: +10% production.'], b: ['此門派被禁鹽鐵：產能 -10%。', 'This sect is barred from salt and iron: 10% less production.'] },
};
export const RES_IDS2 = Object.keys(RESOLUTIONS);

// ------------------------------------------------------------------ difficulty (all bonuses openly listed in setup)
export const DIFFICULTY = [
  { n: ['入門', 'Novice'], ai: -0.15, free: [], smart: 0.5, d: ['電腦產出 -15%。', 'Computer yields -15%.'] },
  { n: ['少俠', 'Young Hero'], ai: 0, free: [], smart: 0.75, d: ['無加成。', 'No bonuses.'] },
  { n: ['大俠', 'Great Hero'], ai: 0.15, free: [], smart: 1, d: ['電腦產出 +15%。', 'Computer yields +15%.'] },
  { n: ['宗師', 'Grandmaster'], ai: 0.3, free: ['u_disciple'], smart: 1, d: ['電腦產出 +30%，多一名弟子。', 'Computer yields +30% and one extra Disciple.'] },
  { n: ['武神', 'War God'], ai: 0.5, free: ['u_disciple', 'u_founder'], smart: 1, d: ['電腦產出 +50%，多一名弟子與一名開山弟子。', 'Computer yields +50%, one extra Disciple and one extra Founder.'] },
];

export const VICTORIES = {
  dom: { n: ['武林盟主', 'Lord of the Wulin'], d: ['佔下所有對手原本的山門。', "Take every rival's original home seat."] },
  sci: { n: ['武學宗師', 'Grandmaster of the Arts'], d: ['領悟天人合一，再完成絕世神功的三個階段。', 'Learn Heaven and Man as One, then finish the three stages of the Peerless Art.'] },
  cul: { n: ['俠名遠播', 'Renown Across the Land'], d: ['你的傳奇超過每個對手的門風（累積俠名的五成五），而且達到門檻。', "Your legend exceeds every rival's lore (55% of the renown they have ever earned) and reaches the threshold."] },
  dip: { n: ['眾望所歸', 'Chosen by the Assembly'], d: ['在武林大會累積足夠的盟主聲望。', 'Gather enough Alliance Leader standing at the Wulin Assembly.'] },
  score: { n: ['青史留名', 'Name in the Annals'], d: ['回合用完時分數最高。', 'Have the highest score when the turns run out.'] },
};
