# Tappy app icon (option C: alien on a rock platform, planet + moon behind, coins). Run from brand/icon/.
from PIL import Image, ImageDraw, ImageFilter
import numpy as np, random
S = 1024

def grad_radial(c0, c1, cx, cy, r):
    y, x = np.mgrid[0:S, 0:S]
    d = np.clip(np.hypot(x / S - cx, y / S - cy) / r, 0, 1)[..., None]
    return Image.fromarray((np.array(c0) + (np.array(c1) - np.array(c0)) * d).astype('uint8'), 'RGB').convert('RGBA')

def stars(im, n, seed):
    rnd = random.Random(seed); d = ImageDraw.Draw(im, 'RGBA')
    for _ in range(n):
        x, y = rnd.randrange(S), rnd.randrange(S); r = rnd.choice([2, 2, 3, 4])
        d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 240, 255, rnd.randrange(110, 230)))

def glow(im, cx, cy, r, col, a):
    g = Image.new('RGBA', (S, S), (0, 0, 0, 0)); ImageDraw.Draw(g).ellipse((cx - r, cy - r, cx + r, cy + r), fill=col + (a,))
    g = g.filter(ImageFilter.GaussianBlur(r * 0.45)); im.paste(g, (0, 0), g)

def sphere(r, light, mid, dark, bands=True, seed=1):
    N = 2 * r; y, x = np.mgrid[0:N, 0:N]; u = (x - r) / r; v = (y - r) / r; rr = np.hypot(u, v)
    z = np.sqrt(np.clip(1 - rr ** 2, 0, 1)); lam = np.clip(-0.5 * u - 0.55 * v + 0.62 * z, 0, 1); t = lam[..., None]
    col = np.where(t < 0.5, np.array(dark) + (np.array(mid) - np.array(dark)) * (t / 0.5), np.array(mid) + (np.array(light) - np.array(mid)) * ((t - 0.5) / 0.5))
    if bands:
        b = np.sin(v * 9 + np.sin(u * 3 + seed) * 0.6) * 0.5 + 0.5; col = col * (0.88 + 0.16 * b[..., None])
    rim = np.clip((rr - 0.8) / 0.2, 0, 1) ** 2  # soft atmosphere rim all round, so the dark side still has an outline
    col = col + rim[..., None] * np.array([120, 80, 190]) * 0.55
    alpha = (np.clip((1 - rr) * r / 1.5, 0, 1) * 255).astype('uint8')
    im = Image.fromarray(np.clip(col, 0, 255).astype('uint8'), 'RGB').convert('RGBA'); im.putalpha(Image.fromarray(alpha)); return im

def alien(pose, k=11):
    a = Image.open(f'alien_default_{pose}.png').convert('RGBA'); return a.resize((a.width * k, a.height * k), Image.NEAREST)

def place(im, a, cx, cy):
    x, y = cx - a.width // 2, cy - a.height // 2
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0)); m = a.split()[3].point(lambda v: int(v * 0.5))
    sh.paste(Image.new('RGBA', a.size, (10, 0, 30, 255)), (x + 10, y + 22), m); sh = sh.filter(ImageFilter.GaussianBlur(14)); im.paste(sh, (0, 0), sh); im.paste(a, (x, y), a)

def coin(d, x, y, r):
    d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 201, 40, 255), outline=(166, 95, 8, 255), width=8)
    d.ellipse((x - r * 0.55, y - r * 0.55, x + r * 0.55, y + r * 0.55), outline=(255, 243, 166, 255), width=6)


def compose(sc=1.0, k=11):
    """Returns (background, foreground) RGBA layers. sc shrinks the artwork about the centre (adaptive icons keep art inside the middle 2/3)."""
    f = lambda v: int(round(512 + (v - 512) * sc))
    R = lambda r: int(round(r * sc))
    bg = grad_radial((74, 28, 106), (10, 3, 32), 0.5, 0.3, 0.9); stars(bg, 60, 5)
    glow(bg, f(650), f(362), R(330), (170, 120, 255), 85)
    P = sphere(R(262), (225, 190, 255), (128, 86, 220), (56, 34, 130), True, 2); bg.paste(P, (f(650) - R(262), f(362) - R(262)), P)
    M = sphere(R(58), (255, 205, 228), (222, 104, 164), (96, 30, 84), False); bg.paste(M, (f(290) - R(58), f(240) - R(58)), M)
    fg = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(fg, 'RGBA')
    d.rounded_rectangle((f(232), f(712), f(792), f(812)), radius=R(44), fill=(122, 82, 64, 255))
    d.rounded_rectangle((f(232), f(688), f(792), f(736)), radius=R(24), fill=(255, 200, 120, 255))
    d.rounded_rectangle((f(250), f(696), f(774), f(712)), radius=R(8), fill=(255, 236, 190, 255))
    glow(fg, f(470), f(500), R(230), (125, 255, 224), 60)
    d = ImageDraw.Draw(fg, 'RGBA')
    def coin2(x, y, r):
        r = R(r); x = f(x); y = f(y); w = max(3, R(8))
        d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 201, 40, 255), outline=(166, 95, 8, 255), width=w)
        d.ellipse((x - r * 0.55, y - r * 0.55, x + r * 0.55, y + r * 0.55), outline=(255, 243, 166, 255), width=max(2, R(6)))
    coin2(190, 480, 44); coin2(850, 650, 38)
    place(fg, alien('idle', k), f(500), f(464))
    return bg, fg

import os
os.makedirs('final', exist_ok=True)
bg, fg = compose(1.0, 11)
master = bg.copy(); master.alpha_composite(fg); master = master.convert('RGB')
master.save('final/tappy_icon_1024.png')                      # LOCKED master (legacy launcher + source)
master.resize((512, 512), Image.LANCZOS).save('final/playstore_icon_512.png')
abg, afg = compose(0.667, 7)                                  # adaptive icon layers (art kept inside the safe zone)
abg.convert('RGB').save('final/adaptive_background_1024.png'); afg.save('final/adaptive_foreground_1024.png')

def mask(kind, sz):
    m = Image.new('L', (sz * 4, sz * 4), 0); dd = ImageDraw.Draw(m)
    if kind == 'sq': dd.rounded_rectangle((0, 0, sz * 4 - 1, sz * 4 - 1), radius=int(sz * 4 * 0.22), fill=255)
    else: dd.ellipse((0, 0, sz * 4 - 1, sz * 4 - 1), fill=255)
    return m.resize((sz, sz), Image.LANCZOS)
# legacy round icon
rnd = master.convert('RGBA'); rnd.putalpha(mask('ci', 1024)); rnd.save('final/legacy_round_1024.png')
# preview of the adaptive icon as phones show it (the visible window is the middle 72/108 of the layers)
ad = abg.copy(); ad.alpha_composite(afg)
win = ad.crop((int(1024 * 18 / 108), int(1024 * 18 / 108), int(1024 * 90 / 108), int(1024 * 90 / 108))).resize((300, 300), Image.LANCZOS)
sheet = Image.new('RGB', (980, 350), (236, 232, 225))
sheet.paste(master.resize((300, 300), Image.LANCZOS), (20, 25), mask('sq', 300))
sheet.paste(win, (340, 25), mask('ci', 300)); sheet.paste(win, (660, 25), mask('sq', 300))
sheet.save('final/preview_final.png')
