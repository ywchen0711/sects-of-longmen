# -*- coding: utf-8 -*-
"""Build the game's sprite atlas from the Character Gallery (C:\\CharacterGallery, `nes` style).

Every unit token, leader portrait, hero and great person in 龍門江湖志 is a gallery character. This tool reads
chars/index.json, copies each needed character's 2-frame field sprite (idle row) and its 48x56 portrait, and writes
  assets/sprites.png   16x24 cells, two frames per character (monster 16x16 frames sit on the cell floor)
  assets/portraits.png 48x56 cells (monster battle pictures are fitted into the cell)
  js/art.js            the coordinates (SPR, POR) and which gallery id each game key uses
Run: python -P tools/art.py [gallery_dir]
"""
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
GAL = sys.argv[1] if len(sys.argv) > 1 else r'C:\CharacterGallery'

# game sprite key -> gallery character id
UNIT_SPR = {
    'founder': 'sx_founder', 'scout': 'sx_scout', 'disciple': 'sx_disciple', 'archer': 'sx_archer', 'saber': 'sx_saber',
    'sword': 'sx_sword', 'hidden': 'sx_hidden', 'rider': 'sx_rider', 'ram': 'sx_ram', 'caravan': 'sx_caravan', 'boat': 'sx_boat',
    'spear': 'sx_spear', 'inner': 'sx_inner', 'catapult': 'sx_catapult', 'warship': 'sx_warship', 'swordform': 'sx_swordform',
    'crossbow': 'sx_crossbow', 'ironcav': 'sx_ironcav', 'thunder': 'sx_thunder', 'master': 'sx_master', 'starbow': 'sx_starbow',
    'lm_saber': 'sx_lm_saber', 'hj_sword': 'sx_hj_sword', 'qf_monk': 'sx_qf_monk', 'bl_palm': 'sx_bl_palm', 'ym_assassin': 'sx_ym_assassin',
    'yy_tiger': 'sx_yy_tiger', 'qj_escort': 'sx_qj_escort', 'hf_club': 'sx_hf_club', 'xd_blood': 'sx_xd_blood', 'zf_chain': 'sx_zf_chain',
    'cy_nun': 'sx_cy_nun',
    'lackey': 'lackey', 'cudgeler': 'cudgeler', 'archer_b': 'archer', 'bloodthug': 'bloodthug', 'greywolf': 'greywolf',
    'wildboar': 'wildboar', 'tiger': 'tiger', 'ape': 'ape',
    'gp_zs': 'sx_grandmaster', 'gp_mj': 'sx_smith', 'baixian': 'baixian', 'mojide': 'mojide',
}
# fallbacks while a gallery character does not exist yet
FALLBACK = {
    'sx_founder': 'wenruyu', 'sx_scout': 'shouhou', 'sx_disciple': 'yirui', 'sx_archer': 'yirui', 'sx_saber': 'daoba', 'sx_sword': 'chutiankuo',
    'sx_hidden': 'masked', 'sx_rider': 'yirui', 'sx_ram': 'heixiong', 'sx_caravan': 'wudadan', 'sx_boat': 'yuweng', 'sx_spear': 'yirui',
    'sx_inner': 'yirui', 'sx_catapult': 'heixiong', 'sx_warship': 'yuweng', 'sx_swordform': 'chutiankuo', 'sx_crossbow': 'yirui',
    'sx_ironcav': 'yirui', 'sx_thunder': 'heixiong', 'sx_master': 'yirui', 'sx_starbow': 'yirui', 'sx_lm_saber': 'yirui',
    'sx_hj_sword': 'liuhanyan', 'sx_qf_monk': 'kuchan', 'sx_bl_palm': 'xiaotian', 'sx_ym_assassin': 'guimian', 'sx_yy_tiger': 'tiger',
    'sx_qj_escort': 'qianwanli', 'sx_hf_club': 'heixiong', 'sx_xd_blood': 'lihanshan', 'sx_zf_chain': 'tiewusi', 'sx_cy_nun': 'xiaolian',
    'sx_grandmaster': 'kuchan', 'sx_smith': 'heixiong', 'jingci': 'xiaolian',
}
LEADERS = ['yirui', 'liuhanyan', 'kuchan', 'xiaotian', 'tuqianqiu', 'mowuya', 'qianwanli', 'heixiong', 'lihanshan', 'tiewusi', 'jingci']
HEROES = ['yishuo', 'xiaolian', 'daoba', 'chutiankuo', 'wudadan', 'aman', 'yuweng', 'wenduizhang', 'huotianxia', 'hubanxian',
          'jiabafang', 'niubaobao', 'wenruyu', 'masked', 'guimian', 'shouhou']


def main():
    idx = json.load(open(os.path.join(GAL, 'chars', 'index.json'), encoding='utf-8'))
    have = {c['id']: c for c in idx['characters']}
    def resolve(gid):
        if gid in have:
            return gid
        fb = FALLBACK.get(gid)
        if fb and fb in have:
            return fb
        raise SystemExit('missing gallery character ' + gid)
    keys = {}
    for k, g in UNIT_SPR.items():
        keys[k] = resolve(g)
    for g in LEADERS + HEROES:
        keys[g] = resolve(g)
    ids = sorted(set(keys.values()))
    # sprites
    cols = 16
    rows = (len(ids) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * 32, rows * 24), (0, 0, 0, 0))
    por = Image.new('RGBA', (cols * 48, rows * 56), (0, 0, 0, 0))
    SPR, POR, BIG = {}, {}, {}
    for n, gid in enumerate(ids):
        d = os.path.join(GAL, 'chars', gid, 'nes')
        s = Image.open(os.path.join(d, 'sheet.png')).convert('RGBA')
        meta = json.load(open(os.path.join(d, 'sheet.json'), encoding='utf-8'))
        fw, fh = meta['frameWidth'], meta['frameHeight']
        anims = meta['animations']
        row = anims.get('walk', anims.get('move', anims.get('idle', list(anims.values())[0])))['row']
        x0, y0 = (n % cols) * 32, (n // cols) * 24
        for f in range(2):
            fr = s.crop((f * fw, row * fh, f * fw + fw, row * fh + fh))
            if fw > 16 or fh > 24:
                fr.thumbnail((16, 24), Image.NEAREST)
            sheet.paste(fr, (x0 + f * 16 + (16 - fr.size[0]) // 2, y0 + 24 - fr.size[1]), fr)
        SPR[gid] = [x0, y0]
        p = Image.open(os.path.join(d, 'portrait.png')).convert('RGBA')
        px, py = (n % cols) * 48, (n // cols) * 56
        if p.size != (48, 56):
            bg = Image.new('RGBA', (48, 56), (0, 0, 0, 255))
            q = p.copy(); q.thumbnail((48, 56), Image.NEAREST)
            bg.paste(q, ((48 - q.size[0]) // 2, (56 - q.size[1]) // 2), q)
            p = bg
        por.paste(p, (px, py), p)
        POR[gid] = [px, py]
    os.makedirs(os.path.join(ROOT, 'assets'), exist_ok=True)
    sheet.save(os.path.join(ROOT, 'assets', 'sprites.png'))
    por.save(os.path.join(ROOT, 'assets', 'portraits.png'))
    with open(os.path.join(ROOT, 'js', 'art.js'), 'w', encoding='utf-8') as f:
        f.write('// generated by tools/art.py from the Character Gallery - do not edit\n')
        f.write('export const KEY = ' + json.dumps(keys, ensure_ascii=False) + ';\n')
        f.write('export const SPR = ' + json.dumps(SPR) + ';\n')
        f.write('export const POR = ' + json.dumps(POR) + ';\n')
        f.write('export const NAMES = ' + json.dumps({g: have[g]['name'] for g in ids}, ensure_ascii=False) + ';\n')
    print('atlas', len(ids), 'characters', sheet.size, por.size)


if __name__ == '__main__':
    main()
