# -*- coding: utf-8 -*-
"""龍門江湖志 Sects of Longmen - the original score: every melody, chord, bass line and drum pattern.

All melodies are original, written on Chinese pentatonic modes (gong C D E G A, shang D E G A C, zhi G A C D E,
yu A C D E G). tools/orch.py plays this score with recorded instruments (CC0 samples) into ../audio.
The score format and helpers come from the Longmen Quest II tools (same author, same pipeline).

Score format (one string per part, tokens separated by spaces):
  NOTE[:dur]   e.g.  A4:4   C#5:2   Bb3     (dur in 16th-note steps; sticky)
  r[:dur]      rest          -[:dur]  tie
  prefixes     ^ grace note from above   / slide up into the note   \\ fall at the end
               ~ strong vibrato          ! accent                    * staccato
  |            bar line - the parser checks every bar is exactly one bar long
Drum strings: one character per 16th step: k kick  s snare  h hat  o open hat  c crash  g gong
  w woodblock high  v woodblock low  t tom  T big drum  .  rest
"""
import re

NOTE_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def midi_of(name):
    m = re.fullmatch(r'([A-G])([#b]?)(-?\d)', name)
    if not m:
        raise ValueError('bad note ' + name)
    pc = NOTE_PC[m.group(1)] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)
    return 12 * (int(m.group(3)) + 1) + pc


def expand(s):
    pat = re.compile(r'\[([^\[\]]*)\]\*(\d+)')
    while True:
        n = pat.sub(lambda mm: ' '.join([mm.group(1)] * int(mm.group(2))), s)
        if n == s:
            return s
        s = n


def parse(s, bar=16, name='?'):
    """-> (events [(step, dur, midi, orn)], total_steps)"""
    s = expand(s).replace('|', ' | ')
    ev, t, dur, last_bar, barno = [], 0.0, 4.0, 0.0, 0
    for tok in s.split():
        if tok == '|':
            barno += 1
            if abs((t - last_bar) - bar) > 1e-6:
                raise ValueError('%s: bar %d is %g steps' % (name, barno, t - last_bar))
            last_bar = t
            continue
        orn = ''
        while tok and tok[0] in '^/\\~!*':
            orn += tok[0]
            tok = tok[1:]
        if ':' in tok:
            tok, d = tok.split(':')
            dur = float(d)
        if tok == 'r':
            t += dur
            continue
        if tok == '-':
            st, d0, m0, o0 = ev[-1]
            ev[-1] = (st, d0 + dur, m0, o0)
            t += dur
            continue
        ev.append((t, dur, midi_of(tok), orn))
        t += dur
    return ev, t


def parse_drums(s):
    s = expand(s).replace('|', '').replace(' ', '')
    return [(i, c) for i, c in enumerate(s) if c != '.'], len(s)


QUAL = {'': (0, 4, 7), 'm': (0, 3, 7), 's2': (0, 2, 7), 's4': (0, 5, 7), 'p': (0, 7, 12),
        'q': (0, 5, 10), '6': (0, 4, 9), 'm7': (0, 3, 10)}


def chord_pcs(ch):
    m = re.fullmatch(r'([A-G][#b]?)(.*)', ch)
    root = NOTE_PC[m.group(1)[0]] + (1 if '#' in m.group(1) else -1 if 'b' in m.group(1)[1:] else 0)
    return root % 12, QUAL[m.group(2)]


def place(pc, lo, transpose):
    m = pc
    while m + transpose < lo:
        m += 12
    while m + transpose >= lo + 12:
        m -= 12
    return m


def nn(m):
    names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
    return '%s%d' % (names[m % 12], m // 12 - 1)


BASS = {
    'drive': 'R:2 R:2 O:2 R:2 R:2 R:2 O:2 F:2', 'gallop': 'R:3 R:1 R:2 F:2 O:3 R:1 F:2 R:2',
    'oompah': 'R:2 r:2 F:2 r:2 R:2 r:2 O:2 r:2', 'walk': 'R:4 F:4 O:4 F:4', 'stride': 'R:6 F:2 O:4 F:4',
    'drone': 'R:16', 'halfs': 'R:8 R:8', 'pulse8': 'R:2 R:2 R:2 R:2 R:2 R:2 R:2 R:2', 'toll': 'R:12 F:4',
    'march': 'R:4 R:2 F:2 R:4 O:4',
}
ARP = {
    'up16': '0:1 1:1 2:1 3:1 0:1 1:1 2:1 3:1 0:1 1:1 2:1 3:1 0:1 1:1 2:1 3:1',
    'roll16': '0:1 2:1 3:1 2:1 1:1 2:1 3:1 2:1 0:1 2:1 3:1 2:1 1:1 2:1 3:1 2:1',
    'broken8': '0:2 1:2 2:2 3:2 2:2 1:2 2:2 1:2', 'off': 'r:2 1:2 r:2 2:2 r:2 1:2 r:2 2:2',
    'pluck4': '0:4 2:4 3:4 1:4', 'stab': '2:3 2:3 1:2 2:3 2:3 1:2', 'gentle': '0:4 2:2 3:2 1:4 2:4',
}


def bass_line(chords, style, transpose, lo=33):
    out = []
    for ch in chords:
        pc, q = chord_pcs(ch)
        R = place(pc, lo, transpose)
        tones = {'R': R, 'F': R + 7, 'O': R + 12}
        for tok in BASS[style].split():
            k, d = tok.split(':')
            out.append('r:' + d if k == 'r' else nn(tones[k]) + ':' + d)
        out.append('|')
    return ' '.join(out)


def arp_line(chords, style, transpose, lo=55):
    out = []
    for ch in chords:
        pc, q = chord_pcs(ch)
        R = place(pc, lo, transpose)
        tones = [R + q[0], R + q[1], R + q[2], R + 12]
        for tok in ARP[style].split():
            k, d = tok.split(':')
            out.append('r:' + d if k == 'r' else nn(tones[int(k)]) + ':' + d)
        out.append('|')
    return ' '.join(out)


_PCN = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
_NOTE_TOK = re.compile(r'^([\^/\\~!*]*)([A-G][#b]?-?\d)(:[\d.]+)?$')


def _map_notes(s, fn):
    out = []
    for tok in s.split():
        m = _NOTE_TOK.match(tok)
        if not m:
            out.append(tok)
            continue
        r = fn(midi_of(m.group(2)), m.group(1))
        if r is None:
            out.append('r' + (m.group(3) or ''))
        else:
            mm, orn = r
            out.append(orn + nn(mm) + (m.group(3) or ''))
    return ' '.join(out)


def shift(s, semi):
    return _map_notes(s, lambda m, o: (m + semi, o))


def harm(s, scale, deg=-2, drop=0):
    """a diatonic line `deg` scale steps from the melody (a third below by default); accents removed"""
    sc = sorted(_PCN[x] for x in scale)
    def f(m, o):
        pc = m % 12
        if pc not in sc:
            return (m - 3 - drop, o.replace('!', ''))
        i = sc.index(pc)
        j = i + deg
        octs, j = divmod(j, len(sc))
        return (m - pc + sc[j] + 12 * octs - drop, o.replace('!', '').replace('~', ''))
    return _map_notes(s, f)


def D(*bars):
    return '|'.join(bars) + '|'


T = {}

# ---- menu 「龍門江湖志」: the title theme (A yu): dizi over strings and guzheng, a heroic second half
_me = '''
A4:4 C5:2 D5:2 E5:8 | G5:4 E5:2 D5:2 C5:4 D5:4 | E5:6 G5:2 A5:4 G5:2 E5:2 | ~D5:12 r:4 |
C5:4 D5:2 E5:2 G5:6 A5:2 | C6:4 A5:2 G5:2 E5:8 | D5:2 E5:2 G5:4 E5:2 D5:2 C5:2 D5:2 | ~A4:12 r:4 |
A5:6 C6:2 D6:4 C6:4 | A5:4 G5:2 A5:2 E5:8 | G5:4 A5:2 C6:2 D6:4 E6:4 | !D6:12 r:4 |
C6:4 A5:4 G5:2 E5:2 G5:4 | A5:2 G5:2 E5:4 D5:4 C5:4 | D5:4 E5:2 G5:2 E5:2 D5:2 C5:2 D5:2 | A4:12 r:4 |'''
_me_ch = ['Am', 'G', 'C', 'G', 'Am', 'F', 'G', 'Am', 'F', 'C', 'G', 'G', 'F', 'C', 'G', 'Am']
_me_dr = D('g...........ssss', 'k.......s.s.sss.', 'k.h.s.h.k.k.s.h.', 'k.h.s.h.k.s.ssss',
           'c.h.s.h.k.k.s.h.', 'k.h.s.h.k.k.s.hh', 'k.h.s.h.k.k.s.h.', 'k.h.s.h.k.s.ssss',
           'c.h.s.h.k.k.s.h.', 'k.h.s.h.k.k.s.hh', 'k.h.s.h.k.k.s.h.', 'k.h.s.h.kkt.t.tt',
           'c.h.s.h.k.k.s.h.', 'k.h.s.h.k.k.s.hh', 'k.h.s.h.k.k.s.h.', 'g...k...s.ssssss')
T['menu'] = dict(loop=True, sections=[dict(bpm=108, transpose=0, p1=_me, p2=arp_line(_me_ch, 'up16', 0), tri=bass_line(_me_ch, 'gallop', 0), noise=_me_dr)])

# ---- peace1 「山門晨鐘」: morning bell at the sect gate (G gong): flute and guzheng, slow and open
_p1 = '''
D5:8 B4:4 A4:4 | G4:4 A4:4 B4:4 D5:4 | E5:8 D5:4 B4:4 | ~A4:16 |
B4:4 D5:4 E5:4 G5:4 | A5:8 G5:4 E5:4 | D5:4 E5:2 D5:2 B4:4 A4:4 | ~G4:16 |
E5:6 G5:2 A5:8 | G5:4 E5:4 D5:8 | B4:4 D5:4 E5:4 D5:4 | ~B4:16 |
A4:4 B4:4 D5:4 E5:4 | G5:6 E5:2 D5:8 | E5:4 D5:2 B4:2 A4:4 B4:4 | ~G4:16 |'''
_p1_ch = ['G', 'Em', 'C', 'D', 'G', 'C', 'D', 'G', 'C', 'Em', 'G', 'Em', 'D', 'G', 'D', 'G']
T['peace1'] = dict(loop=True, sections=[dict(bpm=84, transpose=0, p1=_p1, p2=arp_line(_p1_ch, 'gentle', 0, lo=52), tri=bass_line(_p1_ch, 'stride', 0, lo=31),
    noise=D(*(['g.......v.......', '........v.......', '....v.......v...', '........v...v...'] * 4)))])

# ---- peace2 「江湖行」: on the road of the jianghu (D shang): dizi and violins striding, harp, light drums
_p2 = '''
D5:4 E5:2 G5:2 A5:4 G5:4 | A5:2 C6:2 A5:4 G5:4 E5:4 | D5:4 C5:2 D5:2 E5:4 G5:4 | A5:12 r:4 |
C6:4 A5:2 C6:2 D6:6 C6:2 | A5:4 G5:4 A5:4 C6:4 | G5:4 E5:2 D5:2 E5:4 C5:4 | D5:12 r:4 |
G5:6 A5:2 G5:4 E5:4 | D5:4 E5:4 G5:8 | A5:6 C6:2 A5:4 G5:4 | E5:12 r:4 |
D5:2 E5:2 G5:4 A5:2 G5:2 E5:4 | G5:4 A5:4 C6:8 | A5:4 G5:2 E5:2 D5:4 E5:4 | D5:12 r:4 |'''
_p2_ch = ['Dm', 'Am', 'Dm', 'Am', 'F', 'C', 'C', 'Dm', 'C', 'G', 'F', 'Am', 'Dm', 'F', 'Am', 'Dm']
T['peace2'] = dict(loop=True, sections=[dict(bpm=104, transpose=0, p1=_p2, p2=arp_line(_p2_ch, 'broken8', 0, lo=52), tri=bass_line(_p2_ch, 'walk', 0, lo=31),
    noise=D(*(['k...h...s...h...', 'k...h...s...h.h.', 'k...h...s...h...', 'k...h...s.k.s.h.'] * 4)))])

# ---- peace3 「茶樓聽書」: tales at the teahouse (A yu): erhu with slides over guzheng and pizzicato, woodblocks
_p3 = '''
E5:6 G5:2 A5:4 C6:4 | /A5:6 G5:2 E5:8 | D5:4 E5:2 G5:2 E5:4 D5:4 | C5:12 r:4 |
A4:4 C5:2 D5:2 E5:4 G5:4 | /E5:6 D5:2 C5:8 | D5:4 C5:2 A4:2 G4:4 A4:4 | ~A4:12 r:4 |
C6:6 A5:2 G5:4 E5:4 | G5:4 A5:4 /C6:8 | D6:4 C6:2 A5:2 G5:4 E5:4 | ~G5:12 r:4 |
E5:4 G5:2 A5:2 G5:4 E5:4 | D5:4 E5:4 /G5:8 | E5:4 D5:2 C5:2 A4:4 C5:4 | ~A4:12 r:4 |'''
_p3_ch = ['Am', 'C', 'G', 'C', 'Am', 'C', 'G', 'Am', 'F', 'C', 'G', 'C', 'Am', 'G', 'F', 'Am']
T['peace3'] = dict(loop=True, sections=[dict(bpm=92, transpose=0, p1=_p3, p2=arp_line(_p3_ch, 'pluck4', 0, lo=55), tri=bass_line(_p3_ch, 'walk', 0, lo=31),
    noise=D(*(['w.......v...w...', 'w.......v.v.w...'] * 8)))])

# ---- war 「烽煙四起」: beacon smoke on every side (E yu): driving strings, horn calls, taiko
_wa = '''
E5:2 E5:1 E5:1 G5:2 A5:2 B5:4 A5:2 G5:2 | E5:2 D5:2 E5:4 r:2 B4:2 D5:2 E5:2 | G5:2 G5:1 G5:1 A5:2 B5:2 D6:4 B5:2 A5:2 | !B5:8 A5:4 G5:4 |
E6:3 D6:1 B5:2 A5:2 B5:4 G5:4 | A5:2 B5:2 A5:2 G5:2 E5:8 | D5:2 E5:2 G5:2 A5:2 B5:2 A5:2 G5:2 D5:2 | !E5:12 r:4 |
B5:2 B5:1 B5:1 D6:2 E6:2 D6:4 B5:2 A5:2 | B5:2 A5:2 G5:4 r:2 E5:2 G5:2 A5:2 | B5:4 D6:2 B5:2 A5:4 G5:4 | A5:8 B5:8 |
E6:4 D6:2 B5:2 D6:4 E6:4 | G6:6 E6:2 D6:8 | B5:2 D6:2 B5:2 A5:2 G5:2 A5:2 B5:2 D6:2 | !E6:12 r:4 |'''
_wa_ch = ['Em', 'Em', 'G', 'D', 'C', 'Am', 'D', 'Em', 'Em', 'Em', 'G', 'D', 'C', 'G', 'D', 'Em']
T['war'] = dict(loop=True, sections=[dict(bpm=156, transpose=0, p1=_wa, p2=arp_line(_wa_ch, 'stab', 0, lo=52), tri=bass_line(_wa_ch, 'drive', 0, lo=28),
    noise=D(*(['k.h.s.h.k.k.s.h.', 'k.h.s.h.k.k.s.hs', 'k.h.s.h.k.k.s.h.', 'k.h.s.h.kkt.tsss'] * 3 + ['c.h.s.h.k.k.s.h.', 'k.h.s.h.k.k.s.hs', 'k.h.s.h.k.k.s.h.', 'c...k...ssssssss'])))])

# ---- congress 「武林大會」: the Wulin Assembly (C gong): a stately march, horns and strings, gong
_cg = '''
C5:4 C5:2 D5:2 E5:4 G5:4 | A5:4 G5:2 E5:2 G5:8 | E5:4 G5:2 A5:2 C6:4 A5:4 | G5:12 r:4 |
A5:4 C6:2 A5:2 G5:4 E5:4 | D5:4 E5:2 G5:2 E5:8 | D5:4 E5:2 D5:2 C5:4 A4:4 | C5:12 r:4 |
G5:4 A5:2 G5:2 E5:4 G5:4 | C6:6 D6:2 C6:8 | A5:4 C6:2 D6:2 E6:4 D6:4 | C6:12 r:4 |
A5:4 G5:2 E5:2 D5:4 E5:4 | G5:4 A5:2 C6:2 A5:8 | G5:4 E5:2 D5:2 E5:4 D5:4 | C5:12 r:4 |'''
_cg_ch = ['C', 'Am', 'C', 'G', 'F', 'G', 'G', 'C', 'C', 'F', 'F', 'C', 'Dm', 'F', 'G', 'C']
T['congress'] = dict(loop=True, sections=[dict(bpm=100, transpose=-2, p1=_cg, p2=arp_line(_cg_ch, 'stab', -2, lo=52), tri=bass_line(_cg_ch, 'march', -2, lo=31),
    noise=D(*(['g...s...k...s...', 'k...s...k.k.s...'] + ['k...s...k...s...', 'k...s...k.k.s.ss'] * 6 + ['c...s...k...s...', 'k...s...ssssssss'])))])

# ---- victory 「一統江湖」 and defeat 「江湖夜雨」 (play once)
T['victory'] = dict(loop=False, sections=[dict(bpm=118, transpose=0,
    p1='E5:2 A5:2 C6:2 E6:2 D6:4 C6:2 D6:2 | E6:8 C6:4 A5:4 | G5:2 A5:2 C6:2 D6:2 E6:4 G6:4 | ~A6:16 | E6:4 G6:4 ~A6:8 | A6:16 |',
    p2=arp_line(['Am', 'C', 'G', 'A', 'C', 'A'], 'up16', 0), tri=bass_line(['Am', 'C', 'G', 'A', 'C', 'A'], 'gallop', 0),
    noise=D('c.h.s.h.k.k.s.h.', 'k.h.s.h.k.k.s.hh', 'k.h.s.h.kkt.t.tt', 'c...k...s.ssssss', 'c.......k.k.ssss', 'g...............'))])
T['defeat'] = dict(loop=False, sections=[dict(bpm=66, transpose=0,
    p1='E5:4 D5:4 C5:4 A4:4 | G4:4 A4:4 C5:4 D5:4 | E5:6 D5:2 C5:4 A4:4 | ~A4:16 | r:16 |',
    tri=bass_line(['Am', 'C', 'F', 'Am', 'Am'], 'halfs', 0, lo=31), noise=D('g...............', '................', '........v.......', 'g...............', '................'))])

# ---- sound effects (short one-shots, rendered with the same instruments)
T['sfx_click'] = dict(loop=False, sections=[dict(bpm=120, transpose=0, noise='w...')])
T['sfx_select'] = dict(loop=False, sections=[dict(bpm=140, transpose=0, p1='E6:1 A6:3 |'.replace(' |', '') + ' r:12 |')])
T['sfx_move'] = dict(loop=False, sections=[dict(bpm=120, transpose=0, noise='v.v.')])
T['sfx_hit'] = dict(loop=False, sections=[dict(bpm=120, transpose=0, noise='T.s.')])
T['sfx_arrow'] = dict(loop=False, sections=[dict(bpm=160, transpose=0, p1='A6:1 E6:1 r:14 |', noise='..h.')])
T['sfx_city'] = dict(loop=False, sections=[dict(bpm=150, transpose=0, p1='C5:1 E5:1 G5:1 C6:1 E6:12 |', noise='g...')])
T['sfx_turn'] = dict(loop=False, sections=[dict(bpm=120, transpose=0, noise='v...')])
T['sfx_war'] = dict(loop=False, sections=[dict(bpm=100, transpose=0, noise='g...T...T.T.....')])
T['sfx_gong'] = dict(loop=False, sections=[dict(bpm=100, transpose=0, noise='g...')])
T['sfx_build'] = dict(loop=False, sections=[dict(bpm=150, transpose=0, p1='C6:1 E6:1 G6:2 r:12 |')])
T['sfx_tech'] = dict(loop=False, sections=[dict(bpm=150, transpose=0, p1='A5:1 C6:1 E6:1 A6:13 |')])

NAMES = {
    'menu': ('龍門江湖志', 'Sects of Longmen'),
    'peace1': ('山門晨鐘', 'Morning Bell at the Sect Gate'),
    'peace2': ('江湖行', 'On the Road of the Jianghu'),
    'peace3': ('茶樓聽書', 'Tales at the Teahouse'),
    'war': ('烽煙四起', 'Beacon Smoke on Every Side'),
    'congress': ('武林大會', 'The Wulin Assembly'),
    'victory': ('一統江湖', 'The Jianghu United'),
    'defeat': ('江湖夜雨', 'Night Rain on the Jianghu'),
    'sfx_click': ('木魚', 'Woodblock'), 'sfx_select': ('撥弦', 'Pluck'), 'sfx_move': ('腳步', 'Steps'), 'sfx_hit': ('擊', 'Strike'),
    'sfx_arrow': ('箭', 'Arrow'), 'sfx_city': ('立城', 'A City Rises'), 'sfx_turn': ('更鼓', 'Watch Drum'), 'sfx_war': ('戰鼓', 'War Drums'),
    'sfx_gong': ('鑼', 'Gong'), 'sfx_build': ('鈴', 'Bells'), 'sfx_tech': ('悟', 'Insight'),
}
