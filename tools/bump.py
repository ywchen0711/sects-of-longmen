# -*- coding: utf-8 -*-
"""Set the cache-busting ?v=N on every relative module import and asset URL (js/*.js, index.html, test/*.mjs).
    python -P tools/bump.py 2
"""
import os
import re
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
V = sys.argv[1] if len(sys.argv) > 1 else '1'
pat_js = re.compile(r"""(from\s+['"])(\.{1,2}/[^'"?]+\.js)(\?v=\d+)?(['"])""")
pat_any = re.compile(r"""((?:src|href)=["'])([^"'?:]+\.(?:js|css|png|webmanifest))(\?v=\d+)?(["'])""")
pat_asset = re.compile(r"""(['"])((?:assets|audio)/[^'"?]+\.(?:png|m4a|ogg))(\?v=\d+)?(['"])""")
files = [os.path.join(ROOT, 'js', f) for f in os.listdir(os.path.join(ROOT, 'js')) if f.endswith('.js')]
files += [os.path.join(ROOT, 'test', f) for f in os.listdir(os.path.join(ROOT, 'test')) if f.endswith('.mjs')]
files.append(os.path.join(ROOT, 'index.html'))
for p in files:
    s = open(p, encoding='utf-8').read()
    n = pat_js.sub(lambda m: m.group(1) + m.group(2) + '?v=' + V + m.group(4), s)
    if p.endswith('.html'):
        n = pat_any.sub(lambda m: m.group(1) + m.group(2) + '?v=' + V + m.group(4), n)
    if n != s:
        open(p, 'w', encoding='utf-8').write(n)
        print('bumped', os.path.relpath(p, ROOT))
