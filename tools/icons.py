# -*- coding: utf-8 -*-
"""App icons: a cinnabar seal reading 龍門 on parchment inside an ink hexagon (rendered with a system Kai font)."""
import math
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
FONT = r'C:\Windows\Fonts\kaiu.ttf'


def icon(n):
    S = 4 * n
    im = Image.new('RGB', (S, S), (243, 234, 210))
    d = ImageDraw.Draw(im)
    # paper grain
    import random
    rnd = random.Random(3)
    for _ in range(S * 6):
        x, y = rnd.randrange(S), rnd.randrange(S)
        v = rnd.randrange(215, 240)
        d.point((x, y), fill=(v, v - 6, v - 22))
    cx = cy = S / 2
    R = S * 0.46
    pts = [(cx + R * math.cos(math.radians(60 * k - 30)), cy + R * math.sin(math.radians(60 * k - 30))) for k in range(6)]
    d.polygon(pts, outline=(42, 32, 24), width=max(2, S // 40))
    # seal
    s = S * 0.56
    x0, y0 = cx - s / 2, cy - s / 2
    d.rounded_rectangle((x0, y0, x0 + s, y0 + s), radius=S * 0.04, fill=(168, 50, 42))
    d.rounded_rectangle((x0 + s * 0.06, y0 + s * 0.06, x0 + s * 0.94, y0 + s * 0.94), radius=S * 0.03, outline=(243, 220, 200), width=max(2, S // 70))
    f = ImageFont.truetype(FONT, int(s * 0.42))
    for k, ch in enumerate('龍門'):
        w = f.getbbox(ch)
        tx = cx - (w[2] - w[0]) / 2 - w[0]
        ty = y0 + s * 0.07 + k * s * 0.43 - w[1] + s * 0.02
        d.text((tx, ty), ch, font=f, fill=(250, 238, 222))
    return im.resize((n, n), Image.LANCZOS)


for n, name in ((180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')):
    icon(n).save(os.path.join(ROOT, name))
print('icons ok')
