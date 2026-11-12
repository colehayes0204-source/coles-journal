#!/usr/bin/env python3
"""Copy Cole's supplied Gon images into the app and generate icons + splash timing.

Usage: python3 build/prepare-assets.py [portrait.jpg banner.jpg rod.gif]
Default sources: build/source-images/{gon-portrait.jpg,gon-banner.jpg,gon-rod.gif}
Missing images fall back gracefully (app shows an original SVG mascot / no banner / no gif).
"""
import json, os, shutil, sys
from PIL import Image, ImageDraw, ImageOps, ImageSequence

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'build', 'source-images')
ASSETS = os.path.join(ROOT, 'src', 'renderer', 'assets')
BUILD = os.path.join(ROOT, 'build')
args = sys.argv[1:]
srcs = dict(zip(['portrait', 'banner', 'gif'], args)) if args else {}
srcs.setdefault('portrait', os.path.join(SRC, 'gon-portrait.jpg'))
srcs.setdefault('banner', os.path.join(SRC, 'gon-banner.jpg'))
srcs.setdefault('gif', os.path.join(SRC, 'gon-rod.gif'))
os.makedirs(ASSETS, exist_ok=True)
meta = {}

def circle_icon(img, size, ring=True):
    img = ImageOps.fit(img.convert('RGBA'), (size, size), Image.LANCZOS, centering=(0.5, 0.4))
    s = size * 4
    mask = Image.new('L', (s, s), 0); ImageDraw.Draw(mask).ellipse((0, 0, s - 1, s - 1), fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask.resize((size, size), Image.LANCZOS))
    if ring:
        r = Image.new('RGBA', (s, s), (0, 0, 0, 0)); w = max(4, s // 28)
        ImageDraw.Draw(r).ellipse((w // 2, w // 2, s - w // 2 - 1, s - w // 2 - 1), outline=(47, 155, 255, 255), width=w)
        out = Image.alpha_composite(out, r.resize((size, size), Image.LANCZOS))
    return out

if os.path.exists(srcs['portrait']):
    p = Image.open(srcs['portrait']).convert('RGB')
    ImageOps.fit(p, (512, 512), Image.LANCZOS, centering=(0.5, 0.4)).save(os.path.join(ASSETS, 'gon-portrait.jpg'), quality=88)
    base = p; meta['portrait'] = 'supplied'
else:
    # neutral fallback icon: green ring on dark disc (no character art)
    base = Image.new('RGB', (1024, 1024), (22, 33, 27))
    ImageDraw.Draw(base).ellipse((330, 330, 694, 694), fill=(63, 174, 79))
    meta['portrait'] = 'fallback'
icon = circle_icon(base, 1024)
icon.save(os.path.join(BUILD, 'icon.png'))
icon.resize((256, 256), Image.LANCZOS).save(os.path.join(ASSETS, 'icon.png'))
icon.save(os.path.join(BUILD, 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
try:
    icon.save(os.path.join(BUILD, 'icon.icns'))
except Exception as e:
    print('icns skipped:', e)
icons_dir = os.path.join(BUILD, 'icons'); os.makedirs(icons_dir, exist_ok=True)
for s in (16, 32, 48, 64, 128, 256, 512, 1024):
    icon.resize((s, s), Image.LANCZOS).save(os.path.join(icons_dir, f'{s}x{s}.png'))

if os.path.exists(srcs['banner']):
    b = Image.open(srcs['banner']).convert('RGB'); b.thumbnail((1800, 1800), Image.LANCZOS)
    b.save(os.path.join(ASSETS, 'gon-banner.jpg'), quality=82); meta['banner'] = 'supplied'
if os.path.exists(srcs['gif']):
    shutil.copyfile(srcs['gif'], os.path.join(ASSETS, 'gon-rod.gif'))
    g = Image.open(srcs['gif'])
    meta['gifDurationMs'] = sum(f.info.get('duration', 100) for f in ImageSequence.Iterator(g))
    meta['gif'] = 'supplied'
    # Full-bleed entrance: a 4x Lanczos-upscaled + lightly sharpened animated WebP stays crisper than the browser stretching a 294px GIF.
    from PIL import ImageFilter
    frames, durs = [], []
    for f in ImageSequence.Iterator(g):
        frames.append(f.convert('RGB').resize((g.width * 4, g.height * 4), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2)))
        durs.append(f.info.get('duration', 40))
    frames[0].save(os.path.join(ASSETS, 'gon-rod-hd.webp'), save_all=True, append_images=frames[1:], duration=durs, loop=0, quality=82, method=4)
    meta['gifHd'] = 'gon-rod-hd.webp'
json.dump(meta, open(os.path.join(ASSETS, 'meta.json'), 'w'))
print(json.dumps(meta))
