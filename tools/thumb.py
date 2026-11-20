# -*- coding: utf-8 -*-
"""thumb.jpg 960x540: a game screenshot with the title on a scroll band. usage: python -P tools/thumb.py shot.png"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
im = Image.open(sys.argv[1]).convert('RGB').resize((960, 540))
band = Image.new('RGBA', (960, 540), (0, 0, 0, 0))
d = ImageDraw.Draw(band)
d.rectangle((0, 380, 960, 540), fill=(243, 234, 210, 225))
d.line((0, 380, 960, 380), fill=(90, 70, 50, 255), width=3)
im = Image.alpha_composite(im.convert('RGBA'), band)
d = ImageDraw.Draw(im)
f1 = ImageFont.truetype(r'C:\Windows\Fonts\kaiu.ttf', 92)
f2 = ImageFont.truetype(r'C:\Windows\Fonts\NotoSerifTC-VF.ttf', 34)
d.text((40, 392), '龍門江湖志', font=f1, fill=(30, 22, 16))
d.text((560, 410), 'Sects of Longmen', font=f2, fill=(168, 50, 42))
d.text((560, 460), '開宗立派・逐鹿江湖', font=ImageFont.truetype(r'C:\Windows\Fonts\kaiu.ttf', 34), fill=(60, 45, 30))
d.rectangle((880, 470, 930, 520), fill=(168, 50, 42))
d.text((886, 474), '龍', font=ImageFont.truetype(r'C:\Windows\Fonts\kaiu.ttf', 40), fill=(250, 238, 222))
im.convert('RGB').save(os.path.join(ROOT, 'thumb.jpg'), quality=88)
print('thumb ok')
