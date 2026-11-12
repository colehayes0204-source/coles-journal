# Draws simple fake candlestick chart images (demo data only).
import sys, random, os
from PIL import Image, ImageDraw
def chart(path, seed, w=960, h=560):
    random.seed(seed); im = Image.new('RGB', (w, h), (14, 18, 16)); d = ImageDraw.Draw(im)
    for y in range(0, h, 70): d.line((0, y, w, y), fill=(26, 34, 30))
    p = h / 2
    for i in range(60):
        o = p; c = o + random.gauss(0, 14); hi = max(o, c) + abs(random.gauss(0, 7)); lo = min(o, c) - abs(random.gauss(0, 7))
        x = 20 + i * 15; col = (63, 174, 79) if c < o else (217, 84, 43)
        d.line((x + 4, hi, x + 4, lo), fill=col); d.rectangle((x, min(o, c), x + 8, max(o, c) + 1), fill=col); p = min(max(c, 80), h - 80)
    im.save(path)
out, media = sys.argv[1], sys.argv[2]
for i in range(4): chart(os.path.join(out, f'chart{i}.png'), i)
for i in range(1, 6): chart(os.path.join(media, f'm{i}.png'), 100 + i)
