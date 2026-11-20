# -*- coding: utf-8 -*-
"""
龍門江湖志 Sects of Longmen - the orchestral renderer (adapted from the Longmen Quest II tools).

The game's own original compositions (the note data in tools/score.py: melodies, bass lines, chords and
drum patterns) are played here by recorded instruments instead of chip voices: a small sampler with
per-note pitch curves (erhu slides, grace notes, falls, vibrato), humanised timing and velocity, articulation
switching (sustain / spiccato / pizzicato), stereo seating, an algorithmic hall reverb, glue compression,
a limiter and loudness mastering. Extra parts (string and horn pads, countermelodies, percussion layers) are
added per track in ARR below.

Sample sources (all free licences, see CREDITS.md): VSCO-2 Community Edition (Versilian Studios, CC0) for the
orchestra and percussion; CC0 recordings from freesound.org for the erhu (tarane468), the dizi (Hypnotriod),
the guzheng (Pufermufin), muyu / temple blocks (jonopodmore, sazanami12), opera cymbal (kyles) and taiko
(Anuj_Shrestha1). tools/orch_sources.json lists every file and where it comes from.

Run (samples are not stored in the repo):
  python -P tools/orch.py prep  <samples_dir> <cache_dir> [inst ...]  decode, tune-check, trim, normalise
  python -P tools/orch.py render <cache_dir> [track ...]         render into ../audio (m4a + ogg)
"""
import importlib.util
import json
import os
import re
import subprocess
import sys

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt, sosfiltfilt

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'audio'))
TMP = os.environ.get('SOL_MUSIC_TMP', os.path.join(HERE, '_wav'))


def load_music():
    spec = importlib.util.spec_from_file_location('sol_score', os.path.join(HERE, 'score.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


M = load_music()
NOTE_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


# =================================================================================== sample preparation
def decode(path, ch=2):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', str(ch), '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, ch).copy()


def acf_f0(x, fmin=40, fmax=2500):
    """autocorrelation f0 of a mono segment -> (hz, clarity)"""
    x = x - x.mean()
    n = len(x)
    F = np.fft.rfft(x * np.hanning(n), 2 * n)
    ac = np.fft.irfft(np.abs(F) ** 2)[:n]
    if ac[0] <= 0:
        return 0.0, 0.0
    ac = ac / ac[0]
    lo, hi = int(SR / fmax), min(n - 2, int(SR / fmin))
    rng = ac[lo:hi]
    if len(rng) < 3:
        return 0.0, 0.0
    th = 0.85 * rng.max()
    i = lo + int(np.argmax(rng > th))
    while i + 1 < hi and ac[i + 1] > ac[i]:
        i += 1
    a, b, c = ac[i - 1], ac[i], ac[i + 1]
    den = a - 2 * b + c
    p = i + (0.5 * (a - c) / den if den else 0)
    return SR / p, float(b)


def name_midi(s):
    m = re.search(r'(?:^|[_\- ])([A-G])(#?)(-?\d)(?=[_\-. ]|$)', s)
    if not m:
        return None
    return 12 * (int(m.group(3)) + 1) + NOTE_PC[m.group(1)] + (1 if m.group(2) else 0)


def onset_of(x, frac=0.03):
    mono = np.abs(x).max(1)
    pk = mono.max()
    i = int(np.argmax(mono > pk * frac))
    return max(0, i - int(0.003 * SR))


def finish_zone(x, maxlen, fade=0.06):
    x = x[:int(maxlen * SR)].copy()
    f = min(len(x) // 3, int(fade * SR))
    if f > 0:
        x[-f:] *= np.linspace(1, 0, f)[:, None] ** 2
    return x.astype(np.float32)


def level_of(x, kind):
    if kind == 'perc':
        return float(np.abs(x[:int(0.15 * SR)]).max())
    seg = x[:int(1.0 * SR)]
    return float(np.sqrt((seg ** 2).mean()))


# instrument table: source folder (relative to the samples dir), kind, max length, how notes are named
INST = {
    'vln': ('vsco2/vln', 'sus', 7.0), 'vla': ('vsco2/vla', 'sus', 7.0), 'vc': ('vsco2/vc', 'sus', 7.0),
    'cb': ('vsco2/cb', 'sus', 6.0), 'vlntr': ('vsco2/vlntr', 'sus', 6.0),
    'vlnsp': ('vsco2/vlnsp', 'short', 1.2), 'vcsp': ('vsco2/vcsp', 'short', 1.2), 'cbsp': ('vsco2/cbsp', 'short', 1.2),
    'vlnpz': ('vsco2/vlnpz', 'pluck', 2.5), 'vcpz': ('vsco2/vcpz', 'pluck', 3.0), 'cbpz': ('vsco2/cbpz', 'pluck', 3.0),
    'harp': ('vsco2/harp', 'pluck', 6.0), 'glock': ('vsco2/glock', 'pluck', 5.0),
    'fl': ('vsco2/fl', 'sus', 6.0), 'flst': ('vsco2/flst', 'short', 1.0), 'bsn': ('vsco2/bsn', 'short', 1.2),
    'hn': ('vsco2/hn', 'sus', 7.0), 'hnst': ('vsco2/hnst', 'short', 1.4), 'tbn': ('vsco2/tbn', 'sus', 7.0),
    'tpt': ('vsco2/tpt', 'sus', 7.0), 'tptst': ('vsco2/tptst', 'short', 1.2),
    'erhu': ('fs_erhu', 'sus', 7.0), 'dizi': ('fs_dizi', 'sus', 6.0), 'guzheng': ('fs_guzheng', 'pluck', 6.0),
}


OCT_FORCE = {'vcpz': 1, 'cbpz': 1, 'cbsp': 1}     # low pizzicato / spiccato fool the pitch check; VSCO names are an octave low
SKIP = {'569841'}                                    # a second erhu D4 (named D3)


def prep_pitched(src_dir, name, folder, kind, maxlen, manifest):
    files = sorted(f for f in os.listdir(os.path.join(src_dir, folder)) if f.split('.')[0] not in SKIP)
    zones = []
    for fn in files:
        p = os.path.join(src_dir, folder, fn)
        title = manifest.get(fn.split('.')[0], fn)
        if name == 'dizi':
            nom = int(re.search(r'_(\d{3})_', title).group(1))
        else:
            nom = name_midi(title.replace('.wav', '_').replace('.mp3', '_'))
        if nom is None:
            continue
        lay = re.search(r'_(v\d|pp|p|mp|mf|f|ff|fff)(?=[_.])', title)
        x = decode(p)
        on = onset_of(x)
        x = x[on:]
        seg = x[int(0.12 * SR):int(0.62 * SR)].mean(1) if len(x) > int(0.7 * SR) else x.mean(1)
        f, clar = acf_f0(seg)
        det = 69 + 12 * np.log2(f / 440.0) if f > 0 else nom
        zones.append(dict(nom=nom, det=float(det), clar=clar, layer=lay.group(1) if lay else '', x=x, file=fn))
    # octave convention of this library: the most common whole-octave offset between the name and the pitch
    offs = [int(round((z['det'] - z['nom']) / 12.0)) for z in zones]
    k = OCT_FORCE.get(name, max(set(offs), key=offs.count))
    out = []
    for z in zones:
        root = z['nom'] + 12 * k
        fine = z['det'] - root
        fine -= 12 * round(fine / 12.0)
        if abs(fine) < 0.45 and z['clar'] > 0.5:
            root += fine
        x = finish_zone(z['x'], maxlen)
        lv = level_of(x, kind)
        out.append(dict(root=float(root), layer=z['layer'], lv=lv, x=x, file=z['file']))
    # every zone to the same level (dynamics are applied when playing); layers ranked by their raw level
    by_root = {}
    for z in out:
        by_root.setdefault(round(z['root']), []).append(z)
    for zs in by_root.values():
        zs.sort(key=lambda z: z['lv'])
        for i, z in enumerate(zs):
            z['vel'] = (i + 1) / len(zs)
    tgt = 0.12 if kind != 'pluck' else 0.10
    for z in out:
        z['x'] *= (tgt / max(z['lv'], 1e-6)) if kind != 'pluck' else (0.5 / max(np.abs(z['x'][:int(0.2 * SR)]).max(), 1e-6))
    print('  %-8s %2d zones, octave offset %+d, roots %s' % (name, len(out), k, ' '.join('%.1f' % z['root'] for z in sorted(out, key=lambda z: z['root']) if z['vel'] == 1.0)))
    return out


def slice_guzheng(path):
    """the guzheng recording is one long take of single plucks (tuned D pentatonic): cut out the clean,
    stable, long-ringing single notes and keep the best one per pitch"""
    x = decode(path, 1)[:, 0]
    hop = int(0.005 * SR)
    n = len(x) // hop
    env = np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12)
    db = 20 * np.log10(env)
    sm = np.convolve(db, np.ones(3) / 3, 'same')
    gpk = np.percentile(db, 99.5)
    rise = sm[4:] - sm[:-4]
    cands = []
    i = 4
    while i < n - 4:
        if rise[i - 4] > 9 and sm[i] > gpk - 30:
            j = i
            while j + 1 < n and sm[j + 1] >= sm[j]:
                j += 1
            cands.append(i - 4)
            i = j + 40
        else:
            i += 1
    notes = []
    for a, b in zip(cands, cands[1:] + [n]):
        L = (b - a) * hop
        if L < int(1.3 * SR):
            continue
        s0 = a * hop
        seg = x[s0:s0 + min(L, int(5.5 * SR))]
        f1, c1 = acf_f0(seg[int(0.06 * SR):int(0.36 * SR)], 70, 1800)
        f2, c2 = acf_f0(seg[int(0.40 * SR):int(0.90 * SR)], 70, 1800)
        if f1 <= 0 or f2 <= 0 or c1 < 0.8 or c2 < 0.8:
            continue
        mm0 = 69 + 12 * np.log2(f1 / 440.0)
        if abs(mm0 - round(mm0 - 0.2) - 0.2) > 0.3:         # off the instrument's tuning (+20 cents): a bend or harmonic
            continue
        if abs(1200 * np.log2(f2 / f1)) > 18:
            continue
        e = db[a:a + int(min(L, 4 * SR) / hop)]
        pk = int(np.argmax(e[:40]))
        tail = e[pk:]
        if len(tail) < 100:
            continue
        st = np.convolve(tail, np.ones(9) / 9, 'valid')[10:300]     # 0.1 .. 1.5 s, smoothed: no second pluck
        bumps = float(np.max(st - np.minimum.accumulate(st)))
        if bumps > 6 or f1 < 60:
            continue
        drop = tail[0] - tail[min(len(tail) - 1, 200)]       # level lost over the first second
        m = 69 + 12 * np.log2(f1 / 440.0)
        score = c1 + c2 - bumps * 0.1 - abs(drop - 14) * 0.02 + (e[pk] - gpk) * 0.01
        notes.append(dict(m=float(m), score=score, s0=s0, L=L, pk=e[pk]))
    best = {}
    for nt in notes:
        k = int(round(nt['m']))
        if k > 76:                       # the take's plain plucks reach D5; anything above is a harmonic
            continue
        if k not in best or nt['score'] > best[k]['score']:
            best[k] = nt
    zones = []
    for k in sorted(best):
        nt = best[k]
        seg = x[nt['s0']:nt['s0'] + min(nt['L'], int(6 * SR))]
        on = onset_of(seg[:, None])
        z = np.repeat(seg[on:, None], 2, 1)
        z = finish_zone(z, 6.0, 0.25)
        z *= 0.5 / max(np.abs(z[:int(0.2 * SR)]).max(), 1e-6)
        zones.append(dict(root=nt['m'], layer='', vel=1.0, lv=1.0, x=z, file='slice@%.2fs' % (nt['s0'] / SR)))
    print('  guzheng %d clean notes from %d onsets: %s' % (len(zones), len(cands), ' '.join('%.2f' % z['root'] for z in zones)))
    return zones


PERC = {  # key -> list of (folder, file stem) round robins
    'bd': [('vsco2/perc', 'bdrum_f_1'), ('vsco2/perc', 'bdrum_ff_1')],
    'bdsoft': [('vsco2/perc', 'bdrum_mp_1'), ('vsco2/perc', 'bdrum_p_1')],
    'bdroll': [('vsco2/perc', 'bdrum_roll_short_1')],
    'taiko': [('fs_taiko', '486140'), ('fs_taiko', '486141')],
    'bighand': [('vsco2/perc', 'EthnicLargeHand_hit_f_1'), ('vsco2/perc', 'EthnicLargeHand_hit_ff_1')],
    'bigmallet': [('vsco2/perc', 'EthnicLargeMallet_hit_ff_1'), ('vsco2/perc', 'EthnicLargeMallet_hit_f_1')],
    'bigsticks': [('vsco2/perc', 'EthnicLargeSticks_hit_f_1'), ('vsco2/perc', 'EthnicLargeSticks_hit_mf_1')],
    'rim': [('vsco2/perc', 'EthnicLargeStick_rimshot_1'), ('vsco2/perc', 'EthnicLargeStick_rimshot_2')],
    'sn': [('vsco2/perc', 'snare1_f_1'), ('vsco2/perc', 'snare1_mp_1'), ('vsco2/perc', 'snare1_ff_1')],
    'snsoft': [('vsco2/perc', 'snare1_p_1'), ('vsco2/perc', 'snare1_pp_1')],
    'snrim': [('vsco2/perc', 'snare1_rimshot_mf'), ('vsco2/perc', 'snare1_rimshot_f')],
    'snroll': [('vsco2/perc', 'snare2_nosnare_roll_ff_1')],
    'tenor': [('vsco2/perc', 'tenor_f_1'), ('vsco2/perc', 'tenor_mf_1')],
    'tenorhi': [('vsco2/perc', 'tenorH_f_1'), ('vsco2/perc', 'tenorH_mf_1')],
    'crash': [('vsco2/perc', 'crash_hit_ff_loose'), ('vsco2/perc', 'crash_hit_fff_loose')],
    'crashsoft': [('vsco2/perc', 'crash_hit_mp_loose')],
    'susp': [('vsco2/perc', 'susp_hit_softmall_mp')],
    'swell': [('vsco2/perc', 'susp_hit_softmall_roll2_cresc')],
    'nao': [('fs_nao', '452400')],
    'gong': [('vsco2/perc', 'gong_hit_mf_3'), ('vsco2/perc', 'gong_hit_mf_2')],
    'gongbig': [('vsco2/perc', 'gong_hit_ff')],
    'gongsoft': [('vsco2/perc', 'gong_hit_mp')],
    'shaker': [('vsco2/perc', 'shake1'), ('vsco2/perc', 'shake2'), ('vsco2/perc', 'shake3'), ('vsco2/perc', 'shake4')],
    'tamb': [('vsco2/perc', 'tambourine_up'), ('vsco2/perc', 'tambourine_down_2')],
    'muyu': [('fs_muyu', '607215')],
    'slit': [('vsco2/perc', 'slitdrum1_ff_1'), ('vsco2/perc', 'slitdrum1_mp_1')],
    'slitlo': [('vsco2/perc', 'slitdrum3_ff_1'), ('vsco2/perc', 'slitdrum3_mp_1')],
    'claves': [('vsco2/perc', 'claves_mf')],
    'fingcym': [('vsco2/perc', 'Fing_Cymb')],
    'bells': [('vsco2/perc', 'fx1_short_r01_main'), ('vsco2/perc', 'fx1_short_r02_main'), ('vsco2/perc', 'fx1_short_r03_main')],
    'chimes': [('vsco2/perc', 'windchimes_slowAsc1')],
    'timp': [('vsco2/timp', 'Timpani2_Hit_v3_rr1_Sum'), ('vsco2/timp', 'Timpani3_Hit_v3_rr1_Sum')],
    'timplo': [('vsco2/timp', 'Timpani1_Hit_v3_rr1_Sum')],
}
PERC_MAX = {'gong': 7.0, 'gongbig': 9.0, 'gongsoft': 7.0, 'crash': 4.0, 'crashsoft': 4.0, 'susp': 5.0,
            'swell': 5.0, 'chimes': 6.0, 'bells': 4.0, 'timproll': 4.0, 'bdroll': 3.0, 'snroll': 3.0}


def find_file(src_dir, folder, stem):
    d = os.path.join(src_dir, folder)
    for fn in os.listdir(d):
        if fn.rsplit('.', 1)[0] == stem:
            return os.path.join(d, fn)
    raise FileNotFoundError(folder + '/' + stem)


def slice_blocks(path):
    """temple blocks (5 pieces, played in turn): cut each hit"""
    x = decode(path)
    mono = np.abs(x).max(1)
    hop = int(0.004 * SR)
    n = len(mono) // hop
    e = mono[:n * hop].reshape(n, hop).max(1)
    pk = e.max()
    hits, i = [], 0
    while i < n:
        if e[i] > pk * 0.25:
            hits.append(i * hop)
            i += int(0.12 * SR / hop)
        else:
            i += 1
    return [finish_zone(x[max(0, h - 60):], 0.35, 0.08) for h in hits]


def prep(src_dir, cache, only=None):
    os.makedirs(cache, exist_ok=True)
    manifest = {}
    mpath = os.path.join(src_dir, 'fs_manifest.json')
    if os.path.exists(mpath):
        for r in json.load(open(mpath)):
            manifest[r['id']] = r['title'].replace('Freesound - ', '').split(' by ')[0]
    for name, (folder, kind, maxlen) in INST.items():
        if only and name not in only:
            continue
        if name == 'guzheng':
            fn = [f for f in os.listdir(os.path.join(src_dir, folder))][0]
            zones = slice_guzheng(os.path.join(src_dir, folder, fn))
        else:
            zones = prep_pitched(src_dir, name, folder, kind, maxlen, manifest)
        arr = {'z%d' % i: z['x'] for i, z in enumerate(zones)}
        meta = [dict(root=z['root'], vel=z['vel'], file=z['file']) for z in zones]
        np.savez(os.path.join(cache, name + '.npz'), meta=json.dumps(dict(kind=kind, zones=meta)), **arr)
    if only and 'perc' not in only:
        return
    arr, meta = {}, {}
    for key, lst in PERC.items():
        meta[key] = []
        for folder, stem in lst:
            x = decode(find_file(src_dir, folder, stem))
            x = x[onset_of(x, 0.05):]
            x = finish_zone(x, PERC_MAX.get(key, 2.0), 0.1)
            x *= 0.5 / max(np.abs(x[:int(0.2 * SR)]).max(), 1e-6)
            k = 'p%d' % len(arr)
            arr[k] = x
            meta[key].append(k)
    blocks = slice_blocks(find_file(src_dir, 'fs_tblock', '863784'))
    for nm, idx in (('blockhi', [0, 1]), ('blockmid', [2]), ('blocklo', [3, 4])):
        meta[nm] = []
        for i in idx:
            if i < len(blocks):
                k = 'p%d' % len(arr)
                b = blocks[i]
                arr[k] = b * (0.5 / max(np.abs(b).max(), 1e-6))
                meta[nm].append(k)
    print('  perc: %d keys, %d hits, temple blocks %d' % (len(meta), len(arr), len(blocks)))
    np.savez(os.path.join(cache, 'perc.npz'), meta=json.dumps(meta), **arr)


# =================================================================================== sampler
class Inst:
    def __init__(self, cache, name):
        d = np.load(os.path.join(cache, name + '.npz'))
        meta = json.loads(str(d['meta']))
        self.kind = meta['kind']
        self.zones = [(z['root'], z['vel'], d['z%d' % i]) for i, z in enumerate(meta['zones'])]
        self.roots = np.array([z[0] for z in self.zones])
        self.rr = 0

    def pick(self, m, vel):
        dist = np.abs(self.roots - m)
        best = dist.min()
        cand = [i for i in range(len(self.zones)) if dist[i] <= best + 0.6]
        # the velocity layer closest to the wanted dynamic, then round robin among equals
        cand.sort(key=lambda i: abs(self.zones[i][1] - vel))
        top = [i for i in cand if abs(self.zones[i][1] - self.zones[cand[0]][1]) < 1e-6 and abs(self.roots[i] - self.roots[cand[0]]) < 1.0]
        self.rr += 1
        return self.zones[top[self.rr % len(top)]]


_INST = {}
_CACHE = None


def inst(name):
    if name not in _INST:
        _INST[name] = Inst(_CACHE, name)
    return _INST[name]


def pitch_curve(n, orn, dur_s, vib_extra, rng):
    """cents offsets for one note: grace note, slide-up, fall, extra vibrato"""
    t = np.arange(n) / SR
    c = np.zeros(n)
    if '^' in orn:
        g = min(n, int(0.06 * SR))
        c[:g] += 200 * (1 - np.clip((np.arange(g) - 0.035 * SR) / (0.02 * SR), 0, 1))
    if '/' in orn:
        g = min(n, int(0.12 * SR))
        c[:g] += -200 * (1 - np.arange(g) / g) ** 1.6
    if '\\' in orn:
        s0 = int(min(n, dur_s * SR) * 0.6)
        e0 = int(min(n, dur_s * SR + 0.15 * SR))
        if e0 > s0:
            c[s0:e0] -= 300 * (np.arange(e0 - s0) / (e0 - s0)) ** 2
            c[e0:] -= 300
    depth = 28 if '~' in orn else vib_extra
    if depth and dur_s > 0.3:
        ramp = np.clip((t - 0.25) / 0.4, 0, 1)
        c += depth * ramp * np.sin(2 * np.pi * (5.2 + rng.uniform(-0.3, 0.3)) * t + rng.uniform(0, 6.28))
    return c


def play(z, m, n, cents=None, offset=0):
    root, _, x = z
    ratio = 2 ** ((m - root) / 12.0)
    if cents is None:
        pos = offset + np.arange(n) * ratio
    else:
        r = ratio * 2 ** (cents / 1200.0)
        pos = offset + np.concatenate([[0], np.cumsum(r[:-1])])
    L = len(x)
    pos = pos[pos < L - 2]
    i = pos.astype(np.int64)
    fr = (pos - i)[:, None].astype(np.float32)
    y = x[i] * (1 - fr) + x[i + 1] * fr
    if len(y) < n:
        y = np.concatenate([y, np.zeros((n - len(y), 2), np.float32)])
    return y


def env_note(n, att, rel_at, rel):
    e = np.ones(n, np.float32)
    a = min(n, int(att * SR))
    if a > 1:
        e[:a] = np.linspace(0, 1, a) ** 1.5
    r0 = int(rel_at * SR)
    if r0 < n:
        k = n - r0
        rr = max(1, int(rel * SR))
        tail = np.exp(-np.arange(k) / (rr / 4.0))
        e[r0:] *= tail.astype(np.float32)
    return e


# =================================================================================== score -> events
def section_steps(sec, name):
    lens = []
    for ch in ('p1', 'p2', 'tri'):
        if isinstance(sec.get(ch), str) and sec[ch] != 'echo':
            lens.append(M.parse(sec[ch], sec.get('bar', 16), name)[1])
    if 'noise' in sec:
        lens.append(M.parse_drums(sec['noise'])[1])
    return sec.get('steps') or max(lens)


def part_events(sec, src, loop, steps):
    if src == 'p2' and sec.get('p2') == 'echo':
        ev = []
        dly = sec.get('echo_delay', 3)
        for st, d, m, o in M.parse(sec['p1'], sec.get('bar', 16))[0]:
            s2 = st + dly
            if loop and s2 >= steps:
                s2 -= steps
            ev.append((s2, d, m, o.replace('!', '')))
        return ev
    if not isinstance(sec.get(src), str):
        return []
    return M.parse(sec[src], sec.get('bar', 16))[0]


def chord_tones(ch):
    pc, q = M.chord_pcs(ch)
    return [(pc + i) % 12 for i in q]


def voice_chords(chords, lo, hi, transpose, n=3):
    """smooth voicings: per bar n notes of the chord inside [lo, hi], each voice moving as little as possible"""
    out, prev = [], None
    for ch in chords:
        if ch is None:
            out.append(None)
            continue
        pcs = [(p + transpose) % 12 for p in chord_tones(ch)]
        opts = [m for m in range(lo, hi + 1) if m % 12 in pcs]
        best, bs = None, 1e9
        import itertools
        for combo in itertools.combinations(opts, n):
            if len({m % 12 for m in combo}) < min(n, len(set(pcs))):
                continue
            if combo[-1] - combo[0] > 14:
                continue
            s = sum(abs(a - b) for a, b in zip(combo, prev)) if prev else abs(np.mean(combo) - (lo + hi) / 2)
            if s < bs:
                best, bs = combo, s
        prev = best
        out.append(best)
    return out


# =================================================================================== rendering
def humanize(rng, sd):
    return float(np.clip(rng.normal(0, sd), -2.5 * sd, 2.5 * sd))


def vel_of(st, orn, base, rng, bar=16):
    pos = st % bar
    acc = 1.0 if pos == 0 else 0.92 if pos % 8 == 0 else 0.86 if pos % 4 == 0 else 0.8 if pos % 2 == 0 else 0.74
    v = base * acc * (1.2 if '!' in orn else 1.0) * (1 + rng.uniform(-0.07, 0.07))
    return float(np.clip(v, 0.05, 1.3))


PLAY_RANGE = {'guzheng': (38, 79), 'dizi': (65, 94), 'erhu': (57, 90), 'glock': (77, 108), 'tpt': (52, 87), 'tptst': (52, 87)}


def render_line(buf, off, events, step_s, p, rng, transpose):
    """one melodic/bass part into the stereo buffer `buf` (offset `off` samples)"""
    name = p['inst']
    short = p.get('short')                 # articulation used for short notes
    short_max = p.get('short_max', 0.22)
    o = p.get('oct', 0) + transpose
    gate = p.get('gate', 0.95)
    base = p.get('vel', 0.8)
    sd = p.get('tsd', 0.006)
    att = p.get('att', 0.006)
    rel = p.get('rel', 0.22)
    ring = p.get('ring', 1.2)
    vib = p.get('vib', 0)
    ev = sorted(events)
    for k, (st, d, m, orn) in enumerate(ev):
        dur_s = d * step_s
        if p.get('skip') and p['skip'](st, d, m):
            continue
        mm = m + o
        if p.get('lo') is not None:
            while mm < p['lo']:
                mm += 12
        if p.get('hi') is not None:
            while mm > p['hi']:
                mm -= 12
        rlo, rhi = PLAY_RANGE.get(name, (0, 127))     # keep each instrument where it has real samples
        while mm > rhi:
            mm -= 12
        while mm < rlo:
            mm += 12
        g = 0.5 if '*' in orn else gate
        nm = name
        if short and dur_s * g <= short_max:
            nm = short
        I = inst(nm)
        v = vel_of(st, orn, base, rng)
        z = I.pick(mm, min(1.0, v))
        if I.kind in ('pluck', 'short'):
            hold = dur_s * g if I.kind == 'short' else max(dur_s, ring)
            n = int((hold + 0.6) * SR)
            e = env_note(n, 0.001, hold, 0.35 if I.kind == 'pluck' else 0.12)
        else:
            # legato: overlap into the next note a little
            nxt = ev[k + 1][0] if k + 1 < len(ev) else None
            hold = dur_s * g
            if nxt is not None and abs(nxt - (st + d)) < 1e-6 and g > 0.8:
                hold = dur_s + 0.03
            n = int((hold + rel + 0.05) * SR)
            e = env_note(n, att, hold, rel)
        cents = pitch_curve(n, orn, dur_s, vib, rng) if (orn.strip('!*') or vib) else None
        y = play(z, mm, n, cents) * e[:, None] * (v ** 1.4)
        s0 = off + int(round((st * step_s + humanize(rng, sd) + p.get('delay', 0)) * SR))
        s0 = max(0, s0)
        L = min(n, len(buf) - s0)
        if L > 0:
            buf[s0:s0 + L] += y[:L]


def render_pad(buf, off, chords, step_s, p, rng, transpose, bar=16):
    lo, hi = p.get('range', (55, 72))
    vs = voice_chords(chords, lo, hi, transpose, p.get('voices', 3))
    I = inst(p['inst'])
    base = p.get('vel', 0.5)
    blen = p.get('bars', 1)
    for b, voicing in enumerate(vs):
        if voicing is None:
            continue
        if b % blen:
            continue
        dur_s = bar * blen * step_s
        for m in voicing:
            v = base * (1 + rng.uniform(-0.05, 0.05))
            z = I.pick(m, v)
            n = int((dur_s + p.get('rel', 0.6) + 0.1) * SR)
            e = env_note(n, p.get('att', 0.35), dur_s + 0.02, p.get('rel', 0.6))
            y = play(z, m, n) * e[:, None] * v ** 1.4
            s0 = off + int(round((b * bar * step_s + humanize(rng, 0.01)) * SR))
            L = min(n, len(buf) - s0)
            if L > 0:
                buf[s0:s0 + L] += y[:L]


KITS = {  # drum letter -> list of (perc key, gain dB)
    'wuxia': {'k': [('taiko', -2), ('bdsoft', -8)], 's': [('bigsticks', -5), ('sn', -9)], 'h': [('shaker', -14)],
              'o': [('tamb', -13)], 'c': [('nao', -5), ('crashsoft', -10)], 'g': [('gong', -3)],
              'w': [('blockhi', -6)], 'v': [('muyu', -5)], 't': [('tenor', -4)], 'T': [('taiko', 0), ('bighand', -6)],
              'R': [('rim', -6)]},
    'battle': {'k': [('taiko', -1), ('bd', -7)], 's': [('sn', -4), ('bigsticks', -9)], 'h': [('shaker', -12)],
               'o': [('tamb', -11)], 'c': [('crash', -5), ('nao', -9)], 'g': [('gongbig', -2)],
               'w': [('blockhi', -6)], 'v': [('muyu', -5)], 't': [('tenor', -2)], 'T': [('taiko', 0), ('bigmallet', -4)],
               'R': [('snrim', -6), ('rim', -8)]},
    'orch': {'k': [('bd', -3)], 's': [('sn', -6)], 'h': [('shaker', -14)], 'o': [('tamb', -12)],
             'c': [('crash', -6)], 'g': [('gong', -4)], 'w': [('blockhi', -7)], 'v': [('blocklo', -6)],
             't': [('tenor', -4)], 'T': [('timp', -2), ('bd', -6)], 'R': [('snrim', -6)]},
    'light': {'k': [('bdsoft', -4)], 's': [('tenorhi', -9)], 'h': [('shaker', -16)], 'o': [('tamb', -15)],
              'c': [('susp', -9)], 'g': [('gongsoft', -4)], 'w': [('blockhi', -8)], 'v': [('muyu', -6)],
              't': [('tenorhi', -7)], 'T': [('bighand', -4)], 'R': [('claves', -10)]},
    'temple': {'k': [('bighand', -6)], 's': [('slit', -9)], 'h': [('fingcym', -18)], 'o': [('tamb', -16)],
               'c': [('susp', -10)], 'g': [('gong', -2), ('bells', -14)], 'w': [('blockmid', -7)], 'v': [('muyu', -4)],
               't': [('tenor', -8)], 'T': [('bighand', -3)], 'R': [('claves', -10)]},
}

_PERC = None


def perc_data():
    global _PERC
    if _PERC is None:
        d = np.load(os.path.join(_CACHE, 'perc.npz'))
        meta = json.loads(str(d['meta']))
        _PERC = {k: [d[a] for a in v] for k, v in meta.items()}
    return _PERC


def hit(buf, s0, key, gain, rng, rate=1.0):
    P = perc_data()[key]
    x = P[int(rng.integers(len(P)))]
    if rate != 1.0:
        pos = np.arange(0, len(x) - 1, rate)
        i = pos.astype(np.int64)
        fr = (pos - i)[:, None].astype(np.float32)
        x = x[i] * (1 - fr) + x[i + 1] * fr
    L = min(len(x), len(buf) - s0)
    if L > 0 and s0 >= 0:
        buf[s0:s0 + L] += x[:L] * gain


def render_drums(buf, off, hits, step_s, p, rng):
    kit = KITS[p.get('kit', 'wuxia')]
    extra = p.get('map', {})
    g0 = 10 ** (p.get('gain', 0) / 20)
    bar = 16
    for st, c in hits:
        for key, gdb in extra.get(c, kit.get(c, [])):
            pos = st % bar
            acc = 1.0 if pos == 0 else 0.9 if pos % 4 == 0 else 0.78 if pos % 2 == 0 else 0.66
            if c in 'h':
                acc = 0.9 if pos % 4 == 2 else 0.7
            v = acc * (1 + rng.uniform(-0.1, 0.1))
            s0 = off + int(round((st * step_s + humanize(rng, 0.004)) * SR))
            hit(buf, max(0, s0), key, g0 * 10 ** (gdb / 20) * v ** 1.3, rng, 1 + rng.uniform(-0.015, 0.015))


def pan_gains(pan):
    a = (pan + 1) * np.pi / 4
    return np.cos(a) * 1.41421356, np.sin(a) * 1.41421356


def stereo_place(y, pan, width=1.0):
    mid = (y[:, 0] + y[:, 1]) * 0.5
    side = (y[:, 0] - y[:, 1]) * 0.5 * width
    l, r = pan_gains(pan)
    return np.stack([(mid + side) * l, (mid - side) * r], 1)


# =================================================================================== reverb + mastering
def make_ir(rt, seed=7, pre=0.018, bright=1.0):
    rng = np.random.default_rng(seed)
    n = int((rt * 1.15 + pre) * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2), np.float32)
    bands = [(None, 400, 1.25), (400, 3000, 1.0), (3000, None, 0.55 * bright)]
    for lo, hi, k in bands:
        noise = rng.standard_normal((n, 2))
        if lo and hi:
            sos = butter(2, [lo, hi], 'bandpass', fs=SR, output='sos')
        elif lo:
            sos = butter(2, lo, 'highpass', fs=SR, output='sos')
        else:
            sos = butter(2, hi, 'lowpass', fs=SR, output='sos')
        noise = sosfilt(sos, noise, axis=0)
        dec = np.exp(-6.9 * np.maximum(t - pre, 0) / (rt * k))
        ir += (noise * dec[:, None]).astype(np.float32)
    ir[:int(pre * SR)] = 0
    fade = np.clip((t - pre) / 0.03, 0, 1)            # soft onset of the diffuse tail
    ir *= fade[:, None]
    for dt, g in ((0.011, 0.5), (0.017, -0.4), (0.023, 0.35), (0.031, -0.3), (0.043, 0.25)):   # early reflections
        i = int((pre * 0.4 + dt) * SR)
        ir[i, 0] += g
        ir[int(i * 1.07), 1] += g * 0.9
    ir /= np.sqrt((ir ** 2).sum() / 2)
    return ir


def reverb(x, rt, loop, bright=1.0):
    ir = make_ir(rt, bright=bright)
    hp = butter(2, 180, 'highpass', fs=SR, output='sos')
    xs = sosfilt(hp, x, axis=0)
    y = np.stack([fftconvolve(xs[:, c], ir[:, c]) for c in range(2)], 1).astype(np.float32)
    if loop:
        L = len(x)
        out = y[:L].copy()
        k = L
        while k < len(y):
            seg = y[k:k + L]
            out[:len(seg)] += seg
            k += L
        return out
    return y


def kweight(x):
    b1 = butter(2, 1500, 'highpass', fs=SR, output='sos')    # a near-enough K weighting: shelf approximated
    hp = butter(2, 60, 'highpass', fs=SR, output='sos')
    y = sosfilt(hp, x, axis=0)
    hs = sosfilt(b1, y, axis=0)
    return y + hs * 0.585                                       # about +4 dB above 2 kHz


def lufs(x):
    y = kweight(x)
    w, h = int(0.4 * SR), int(0.1 * SR)
    p = (y ** 2).sum(1)
    cs = np.concatenate([[0], np.cumsum(p)])
    idx = np.arange(0, len(p) - w, h)
    if not len(idx):
        return -70.0
    ms = (cs[idx + w] - cs[idx]) / w
    lk = -0.691 + 10 * np.log10(ms + 1e-12)
    g = ms[lk > -70]
    if not len(g):
        return -70.0
    rel = -0.691 + 10 * np.log10(g.mean()) - 10
    g2 = ms[(lk > -70) & (lk > rel)]
    return float(-0.691 + 10 * np.log10(g2.mean()))


def wrap_pad(x, P, loop):
    if loop:
        return np.concatenate([x[-P:], x, x[:P]])
    return np.concatenate([np.zeros((P, 2), x.dtype), x, np.zeros((P, 2), x.dtype)])


def compressor(x, loop, thr_db=-18, ratio=2.2, att=0.012, rel=0.18):
    P = int(1.0 * SR)
    y = wrap_pad(x, P, loop)
    lvl = np.sqrt(np.convolve((y ** 2).mean(1), np.ones(int(0.01 * SR)) / int(0.01 * SR), 'same') + 1e-12)
    db = 20 * np.log10(lvl)
    over = np.maximum(db - thr_db, 0)
    gr = over * (1 - 1 / ratio)
    # smooth the gain reduction (attack/release one-pole, run as a fast loop on a decimated curve)
    dec = 32
    g = gr[::dec]
    sm = np.zeros_like(g)
    aa, rr = np.exp(-dec / (att * SR)), np.exp(-dec / (rel * SR))
    s = 0.0
    for i in range(len(g)):
        c = aa if g[i] > s else rr
        s = c * s + (1 - c) * g[i]
        sm[i] = s
    gain = 10 ** (-np.interp(np.arange(len(y)), np.arange(len(g)) * dec, sm) / 20)
    return (y * gain[:, None])[P:P + len(x)].astype(np.float32)


def limiter(x, loop, ceil_db=-1.0, look=0.004, rel=0.08):
    ceil = 10 ** (ceil_db / 20)
    P = int(0.5 * SR)
    y = wrap_pad(x, P, loop)
    pk = np.abs(y).max(1)
    need = np.minimum(1.0, ceil / np.maximum(pk, 1e-9))
    la = int(look * SR)
    from scipy.ndimage import minimum_filter1d
    need = minimum_filter1d(need, 2 * la + 1)
    dec = 8
    g = need[::dec]
    sm = np.empty_like(g)
    r = np.exp(-dec / (rel * SR))
    s = 1.0
    for i in range(len(g)):
        s = g[i] if g[i] < s else r * s + (1 - r) * g[i]
        sm[i] = s
    sm = minimum_filter1d(sm, 3)
    gain = np.interp(np.arange(len(y)), np.arange(len(sm)) * dec, sm)
    gain = np.convolve(gain, np.ones(la) / la, 'same')
    gain = np.minimum(gain, need)
    out = (y * gain[:, None])[P:P + len(x)]
    return np.clip(out, -ceil, ceil).astype(np.float32)


def master(x, loop, target, comp=True, air=4.0, low=2.0):
    """high-pass, shelving EQ (air above ~4.5 kHz, warmth below ~90 Hz), glue compression, loudness, limiter"""
    hp = butter(2, 28, 'highpass', fs=SR, output='sos')
    hs = butter(1, 4500, 'highpass', fs=SR, output='sos')
    ls = butter(1, 90, 'lowpass', fs=SR, output='sos')
    bp = butter(1, [220, 600], 'bandpass', fs=SR, output='sos')    # a soft dip in the boxy low mids
    ga, gl = 10 ** (air / 20) - 1, 10 ** (low / 20) - 1

    def eq(y):
        y = sosfilt(hp, y, axis=0)
        return y + ga * sosfilt(hs, y, axis=0) + gl * sosfilt(ls, y, axis=0) - 0.22 * sosfilt(bp, y, axis=0)
    if loop:
        L = len(x)
        x = eq(np.concatenate([x, x, x]))[L:2 * L].astype(np.float32)
    else:
        x = eq(x).astype(np.float32)
    x -= x.mean(0)
    if comp:
        x = compressor(x / max(np.abs(x).max(), 1e-9) * 0.5, loop)
    for _ in range(3):
        x *= 10 ** ((target - lufs(x)) / 20)
        x = limiter(x, loop)
    return x


# =================================================================================== arrangements
# part keys:  src  'p1' | 'p2' | 'tri' (the score's lines) | 'pad' (chords) | 'drums' (score drums) | 'extra' (added drums)
#             inst / short (articulation for short notes) / oct / vel / pan / width / gain (dB) / rev (send, 0..1)
_CH = {k: getattr(M, k) for k in dir(M) if k.endswith('_ch')}


def D(*bars):
    return '|'.join(bars) + '|'


def P(src, inst_, **kw):
    return dict(src=src, inst=inst_, **kw)


STR_SHORT = dict(short_max=0.2)
A_MIN = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
C_MAJ = A_MIN
ARR = {}

# ---- menu: the title theme - dizi over strings, guzheng runs, horns, war drums
ARR['menu'] = dict(rt=2.3, wet=0.24, target=-16.5, parts=[
    P('p1', 'dizi', gain=-1, pan=0.05, vel=0.85, rev=0.9),
    P('p1', 'vln', short='vlnsp', oct=-12, gain=-8, pan=-0.35, vel=0.7, rel=0.3),
    P('p2', 'guzheng', gain=-8, pan=0.4, vel=0.65, ring=0.6),
    P('p2', 'harp', oct=-12, gain=-12, pan=-0.5, vel=0.55, ring=0.4),
    P('harm', 'vla', scale=A_MIN, bars=(8, 16), gain=-7, pan=0.3, vel=0.65, rel=0.3),
    P('tri', 'vc', short='vcsp', gain=-8, pan=-0.2, vel=0.75, gate=0.85, lo=36),
    P('tri', 'cbpz', gain=-9, pan=0.15, vel=0.8, oct=-12, lo=28),
    P('pad', 'hn', chords='_me_ch', range=(48, 62), gain=-10, pan=0.25, vel=0.55, att=0.3),
    P('pad', 'vla', chords='_me_ch', range=(60, 74), gain=-12, pan=-0.3, vel=0.45, att=0.4),
    P('drums', None, kit='wuxia', gain=-1),
])
# ---- peace1: morning bell at the sect gate - flute, guzheng, harp, soft strings, temple percussion
ARR['peace1'] = dict(rt=3.0, wet=0.3, target=-17.3, parts=[
    P('p1', 'fl', gain=-1, pan=0.1, vel=0.7, rel=0.4, rev=1.0),
    P('p1', 'guzheng', oct=-12, gain=-12, pan=-0.4, vel=0.5, ring=1.2, skip=lambda st, d, m: d < 8),
    P('p2', 'guzheng', gain=-7, pan=0.35, vel=0.6, ring=1.6),
    P('p2', 'harp', oct=-12, gain=-13, pan=-0.45, vel=0.5, ring=1.0),
    P('tri', 'vc', gain=-11, pan=0.2, vel=0.55, gate=0.92, lo=36, att=0.1),
    P('tri', 'cbpz', gain=-13, pan=0.0, vel=0.6, oct=-12, lo=28),
    P('pad', 'vla', chords='_p1_ch', range=(55, 69), gain=-14, pan=0.3, vel=0.4, att=0.6, rel=1.0),
    P('pad', 'hn', chords='_p1_ch', range=(50, 62), gain=-18, pan=-0.2, vel=0.33, att=0.7, rel=1.0, voices=2),
    P('drums', None, kit='temple', gain=-4),
])
# ---- peace2: on the road - dizi and violins in octaves, harp, striding cellos, light drums
ARR['peace2'] = dict(rt=2.0, wet=0.22, target=-16.5, parts=[
    P('p1', 'dizi', gain=-2, pan=0.1, vel=0.8, rev=0.9),
    P('p1', 'vln', short='vlnsp', oct=-12, gain=-6, pan=-0.3, vel=0.72, rel=0.3),
    P('p2', 'harp', gain=-8, pan=0.4, vel=0.62, ring=0.8),
    P('harm', 'vla', scale=['D', 'E', 'F', 'G', 'A', 'B', 'C'], bars=(8, 16), gain=-8, pan=-0.4, vel=0.6, rel=0.3),
    P('p2', 'guzheng', gain=-13, pan=-0.45, vel=0.5, ring=0.4, skip=lambda st, d, m: st % 4 != 0),
    P('tri', 'vc', short='vcsp', gain=-8, pan=-0.15, vel=0.72, gate=0.88, lo=36),
    P('tri', 'cb', short='cbsp', gain=-11, pan=0.1, vel=0.7, gate=0.88, lo=28, oct=-12),
    P('pad', 'hn', chords='_p2_ch', range=(48, 62), gain=-11, pan=0.25, vel=0.5, att=0.3),
    P('drums', None, kit='orch', gain=-6, map={'k': [('bd', -5)], 's': [('tenor', -6)], 'h': [('shaker', -16)]}),
])
# ---- peace3: the teahouse - erhu with slides over guzheng, pizzicato, woodblocks
ARR['peace3'] = dict(rt=1.9, wet=0.22, target=-16.8, parts=[
    P('p1', 'erhu', gain=-1, pan=0.05, vel=0.75, vib=6, rel=0.3, rev=0.9),
    P('p2', 'guzheng', gain=-6, pan=-0.35, vel=0.7, ring=1.4),
    P('p2', 'vlnpz', oct=12, gain=-15, pan=0.4, vel=0.5, skip=lambda st, d, m: st % 8 != 4),
    P('tri', 'vcpz', gain=-9, pan=0.2, vel=0.7, lo=36),
    P('tri', 'cbpz', gain=-12, pan=0.0, vel=0.65, oct=-12, lo=28),
    P('pad', 'vla', chords='_p3_ch', range=(57, 71), gain=-15, pan=0.35, vel=0.4, att=0.5),
    P('drums', None, kit='light', gain=-4, map={'w': [('blockmid', -9)], 'v': [('muyu', -8)]}),
])
# ---- war: driving spiccato strings, horn and trumpet calls, taiko and snare
ARR['war'] = dict(rt=1.6, wet=0.17, target=-16.3, parts=[
    P('p1', 'vln', short='vlnsp', gain=-2, pan=-0.25, vel=0.85, rel=0.15, short_max=0.16),
    P('p1', 'tpt', short='tptst', oct=-12, gain=-9, pan=0.3, vel=0.68, short_max=0.16, skip=lambda st, d, m: d < 4),
    P('p1', 'erhu', gain=-13, pan=0.45, vel=0.55, vib=6, skip=lambda st, d, m: d < 4),
    P('p2', 'hnst', oct=-12, gain=-9, pan=0.3, vel=0.7),
    P('p2', 'vlnsp', oct=-12, gain=-13, pan=-0.45, vel=0.55),
    P('tri', 'vcsp', gain=-6, pan=0.15, vel=0.85, lo=36, oct=12),
    P('tri', 'cbsp', gain=-8, pan=0.0, vel=0.8, lo=28),
    P('pad', 'hn', chords='_wa_ch', range=(48, 62), gain=-11, pan=0.25, vel=0.6, att=0.12, rel=0.3),
    P('pad', 'tbn', chords='_wa_ch', range=(43, 55), gain=-15, pan=-0.15, vel=0.5, att=0.12, rel=0.3, voices=2),
    P('drums', None, kit='battle', gain=-1),
])
# ---- congress: a stately march - trumpet and horns over strings, snare and bass drum, gong
ARR['congress'] = dict(rt=2.1, wet=0.22, target=-16.5, parts=[
    P('p1', 'tpt', short='tptst', gain=-2, pan=-0.1, vel=0.75, short_max=0.15),
    P('p1', 'hn', oct=-12, gain=-9, pan=0.25, vel=0.7, lo=45, hi=60),
    P('p1', 'vln', short='vlnsp', oct=12, gain=-10, pan=-0.35, vel=0.62),
    P('p2', 'vlnsp', gain=-10, pan=0.35, vel=0.65),
    P('tri', 'vc', short='vcsp', gain=-8, pan=0.15, vel=0.8, gate=0.8, lo=36),
    P('tri', 'cb', short='cbsp', gain=-9, pan=0.0, vel=0.75, gate=0.8, lo=28, oct=-12),
    P('pad', 'tbn', chords='_cg_ch', range=(48, 62), gain=-14, pan=0.25, vel=0.45, att=0.3),
    P('drums', None, kit='orch', gain=-2, map={'k': [('bd', -4), ('timplo', -10)], 's': [('sn', -7)], 'g': [('gong', -3)]}),
])
# ---- victory / defeat
ARR['victory'] = dict(rt=2.2, wet=0.22, target=-16.0, tail=3.5, fade=2.0, parts=[
    P('p1', 'tpt', short='tptst', gain=-2, pan=0.2, vel=0.85, rel=0.5),
    P('p1', 'dizi', gain=-7, pan=-0.2, vel=0.7, skip=lambda st, d, m: d < 4),
    P('p1', 'vln', short='vlnsp', gain=-6, pan=-0.3, vel=0.8, oct=-12, rel=0.5),
    P('p2', 'harp', gain=-10, pan=0.45, vel=0.6, ring=1.2),
    P('p2', 'guzheng', gain=-12, pan=-0.45, vel=0.55, ring=0.6),
    P('tri', 'cb', short='cbsp', gain=-9, pan=0.0, vel=0.75, lo=28, rel=0.5),
    P('tri', 'vc', short='vcsp', gain=-9, pan=0.2, vel=0.7, lo=36),
    P('drums', None, kit='wuxia', gain=-2),
])
ARR['defeat'] = dict(rt=2.8, wet=0.3, target=-17.2, tail=4.0, fade=2.5, parts=[
    P('p1', 'erhu', gain=-1, pan=0.05, vel=0.7, vib=8, rel=0.8),
    P('p1', 'guzheng', oct=-12, gain=-12, pan=-0.35, vel=0.5, ring=2.0, skip=lambda st, d, m: d < 4),
    P('tri', 'vc', gain=-9, pan=0.2, vel=0.55, att=0.15, rel=1.2, lo=33),
    P('tri', 'cb', gain=-12, pan=0.0, vel=0.5, att=0.15, rel=1.2, oct=-12, lo=28),
    P('drums', None, kit='temple', gain=-3, map={'g': [('gongbig', -4)]}),
])
# ---- sound effects
SFX_KIT = {'w': [('blockhi', -2)], 'v': [('muyu', -2)], 'T': [('taiko', 0), ('bigsticks', -6)], 's': [('bigsticks', -3)], 'h': [('shaker', -6)], 'g': [('gong', -2)]}
ARR['sfx_click'] = dict(rt=0.8, wet=0.08, target=-18.0, comp=False, tail=0.4, fade=0.2, parts=[P('drums', None, kit='light', gain=0, map=SFX_KIT)])
ARR['sfx_select'] = dict(rt=1.0, wet=0.12, target=-19.0, comp=False, tail=0.6, fade=0.3, parts=[P('p1', 'guzheng', gain=0, pan=0.0, vel=0.7, ring=0.4)])
ARR['sfx_move'] = dict(rt=0.8, wet=0.08, target=-21.0, comp=False, tail=0.3, fade=0.2, parts=[P('drums', None, kit='light', gain=0, map={'v': [('blocklo', -3)]})])
ARR['sfx_hit'] = dict(rt=1.0, wet=0.1, target=-15.0, comp=False, tail=0.6, fade=0.3, parts=[P('drums', None, kit='battle', gain=0, map=SFX_KIT)])
ARR['sfx_arrow'] = dict(rt=0.9, wet=0.1, target=-19.0, comp=False, tail=0.4, fade=0.2, parts=[P('p1', 'flst', gain=0, vel=0.7), P('drums', None, kit='light', gain=-4, map=SFX_KIT)])
ARR['sfx_city'] = dict(rt=1.8, wet=0.2, target=-17.0, comp=False, tail=1.5, fade=0.8, parts=[P('p1', 'harp', gain=0, vel=0.7, ring=1.5), P('drums', None, kit='temple', gain=-6, map={'g': [('gongsoft', -2)]})])
ARR['sfx_turn'] = dict(rt=1.0, wet=0.12, target=-19.0, comp=False, tail=0.5, fade=0.3, parts=[P('drums', None, kit='temple', gain=0, map=SFX_KIT)])
ARR['sfx_war'] = dict(rt=1.6, wet=0.15, target=-15.0, comp=False, tail=1.5, fade=0.8, parts=[P('drums', None, kit='battle', gain=0, map={'g': [('gongbig', -1)], 'T': [('taiko', 0), ('bigmallet', -4)]})])
ARR['sfx_gong'] = dict(rt=1.8, wet=0.18, target=-17.0, comp=False, tail=2.0, fade=1.0, parts=[P('drums', None, kit='temple', gain=0, map=SFX_KIT)])
ARR['sfx_build'] = dict(rt=1.4, wet=0.15, target=-19.0, comp=False, tail=0.9, fade=0.4, parts=[P('p1', 'glock', oct=-12, gain=0, vel=0.6, ring=1.0)])
ARR['sfx_tech'] = dict(rt=1.6, wet=0.18, target=-18.0, comp=False, tail=1.2, fade=0.6, parts=[P('p1', 'harp', gain=0, vel=0.7, ring=1.4), P('p1', 'glock', oct=-12, gain=-10, vel=0.5, ring=1.0)])


# =================================================================================== track render
PART_REF = -20.0
TEMPO = 0.5
SRC_BIAS = {'drums': -3.0, 'extra': -3.0}


def render_parts(dry, wet, off, sec, parts, loop, steps, rng, wet_amt):
    step_s = 60.0 / sec['bpm'] / 4
    tr = sec.get('transpose', 0)
    for p in parts:
        buf = np.zeros_like(dry)
        src = p['src']
        if src in ('p1', 'p2', 'tri'):
            ev = part_events(sec, src, loop, steps)
            if p['inst'] in PERC:                 # an unpitched layer that follows a line's rhythm
                for st, d, m, o in ev:
                    hit(buf, off + int(round(st * step_s * SR)), p['inst'], 1.0, rng)
            else:
                render_line(buf, off, ev, step_s, p, rng, tr)
        elif src == 'harm':                       # a countermelody: the tune a third (deg) lower in its own scale
            ev = M.parse(M.harm(sec['p1'], p['scale'], p.get('deg', -2)), sec.get('bar', 16))[0]
            b0, b1 = p.get('bars', (0, 9999))
            ev = [e for e in ev if b0 * 16 <= e[0] < b1 * 16]
            render_line(buf, off, ev, step_s, p, rng, tr)
        elif src == 'pad':
            ch = p['chords']
            ch = _CH[ch] if isinstance(ch, str) else ch
            render_pad(buf, off, ch, step_s, p, rng, tr)
        elif src == 'drums':
            if 'noise' in sec:
                render_drums(buf, off, M.parse_drums(sec['noise'])[0], step_s, p, rng)
        elif src == 'extra':
            render_drums(buf, off, M.parse_drums(p['pattern'])[0], step_s, p, rng)
        # auto balance: every part is brought to a set loudness (K-weighted, gated, while it plays), so `gain`
        # reads as the part's level against the melody (0 dB) whatever the raw level of its samples
        if not np.any(buf):
            continue
        lv = lufs(buf)
        g = 10 ** ((PART_REF + p.get('gain', 0) + SRC_BIAS.get(src, 0) - lv) / 20) if lv > -69 else 0.0
        y = stereo_place(buf, p.get('pan', 0), p.get('width', 0.8)) * g
        if os.environ.get('LQ_PARTS'):
            act = np.abs(y).max(1) > 1e-4
            print('    %-6s %-8s raw %6.1f LUFS -> %6.1f' % (src, p['inst'] or p.get('kit', ''), lv, lufs(y)))
        dry += y
        wet += y * (p.get('rev', 0.6 if src != 'drums' else 0.45) * wet_amt)
        del buf, y


def fold(buf, pre, total):
    """a loop: the pre-roll (early humanised notes) goes onto the end, the ringing tail onto the start"""
    body = buf[pre:pre + total].copy()
    body[-pre:] += buf[:pre]
    k = pre + total
    while k < len(buf):
        seg = buf[k:k + total]
        body[:len(seg)] += seg
        k += total
    return body


def render_track(name):
    tr = M.T[name]
    arr = ARR[name]
    loop = tr.get('loop', True)
    rng = np.random.default_rng(sum(map(ord, name)) * 7919)
    secs = tr['sections']
    if not (name.startswith('j_') or name.startswith('sfx_')):          # the owner found the score too fast: music plays at TEMPO x the written bpm (jingles keep theirs)
        secs = [dict(sec, bpm=sec['bpm'] * TEMPO) for sec in secs]
    sect_parts = arr.get('sections') or [arr['parts']] * len(secs)
    lens = []
    for s in secs:
        st = section_steps(s, name)
        lens.append((st, int(round(st * 60.0 / s['bpm'] / 4 * SR))))
    total = sum(L for _, L in lens)
    tail = int(6.0 * SR)
    pre = int(0.05 * SR)
    dry = np.zeros((pre + total + tail, 2), np.float32)
    wet = np.zeros_like(dry)
    pos = pre
    for s, parts, (steps, L) in zip(secs, sect_parts, lens):
        render_parts(dry, wet, pos, s, parts, loop, steps, rng, arr.get('wet', 0.2))
        pos += L
    if loop:
        dry, wet = fold(dry, pre, total), fold(wet, pre, total)
    else:
        dry, wet = dry[pre:], wet[pre:]
    rv = reverb(wet, arr.get('rt', 2.0), loop)
    if loop:
        mix = dry + rv
    else:
        mix = np.zeros((max(len(dry), len(rv)), 2), np.float32)
        mix[:len(dry)] += dry
        mix[:len(rv)] += rv
        lvl = np.abs(mix).max(1)
        nz = np.nonzero(lvl > lvl.max() * 10 ** (-56 / 20))[0]
        cap = total + int(arr.get('tail', 1.6) * SR)          # jingles hand back to the music promptly
        mix = mix[:min(cap, nz[-1] + int(0.05 * SR))]
    del dry, wet, rv
    y = master(mix, loop, arr.get('target', -16.5), arr.get('comp', True))
    f = int(0.003 * SR)
    if not loop:
        y[:f] *= np.linspace(0, 1, f)[:, None]
        fo = min(len(y) // 4, int(arr.get('fade', 0.7) * SR))
        y[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 2
    return y, loop


def write_wav(path, y):
    import wave
    pcm = (np.clip(y, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def encode(wav, name):
    base = os.path.join(OUT, name)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'aac', '-b:a', '112k', '-movflags', '+faststart',
                    base + '.m4a'], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libvorbis', '-q:a', '3', base + '.ogg'], check=True)


def render(cache, which):
    global _CACHE
    _CACHE = cache
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(TMP, exist_ok=True)
    meta_path = os.path.join(OUT, 'tracks.json')
    meta = {}
    if os.path.exists(meta_path):
        with open(meta_path, encoding='utf-8') as f:
            meta = json.load(f)
    for name in which:
        y, loop = render_track(name)
        _INST.clear()
        wav = os.path.join(TMP, name + '.wav')
        write_wav(wav, y)
        encode(wav, name)
        dur = round(len(y) / SR, 3)
        zh, en = M.NAMES[name]
        meta[name] = {'zh': zh, 'en': en, 'loop': loop, 'dur': dur}
        seam = np.abs(y[0] - y[-1]).max() if loop else 0
        print('%-8s %6.2fs loop=%-5s peak %.2f dBFS  %.1f LUFS  seam %.3f' % (
            name, dur, loop, 20 * np.log10(np.abs(y).max()), lufs(y), seam), flush=True)
    meta = {k: meta[k] for k in M.NAMES if k in meta}
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    if len(sys.argv) >= 4 and sys.argv[1] == 'prep':
        prep(sys.argv[2], sys.argv[3], sys.argv[4:])
    elif len(sys.argv) >= 3 and sys.argv[1] == 'render':
        render(sys.argv[2], sys.argv[3:] or list(M.T))
    else:
        print(__doc__)
