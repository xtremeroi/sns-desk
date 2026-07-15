# Generates the S&S Desk app icon: the Ligature mark (two bar-chart S glyphs
# sharing the long bars) on the brand icon tile — violet gradient
# (#7c3aed -> #5b21b6), 22.5% corner radius, white long bars, #d9ccfb stubs.
# Geometry per the S&S logo spec: glyph 90x89, bars h=13 rx=6.5, pitch 19.
from PIL import Image, ImageDraw
import os, subprocess

SIZE = 1024
# macOS Big Sur icon: tile ~80% of frame, centered.
M = int(SIZE * 0.10)
TILE = SIZE - 2 * M
RADIUS = int(TILE * 0.225)

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# Vertical gradient tile, masked to the rounded rect.
grad = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
gd = ImageDraw.Draw(grad)
top, bottom = (0x7C, 0x3A, 0xED), (0x5B, 0x21, 0xB6)
for y in range(M, SIZE - M):
    t = (y - M) / TILE
    c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    gd.line([(M, y), (SIZE - M, y)], fill=c + (255,))
mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle([M, M, SIZE - M, SIZE - M], radius=RADIUS, fill=255)
img.paste(grad, (0, 0), mask)

# The mark, centered, ~56% of tile width.
BARS = [  # x, y, w  (h=13, rx=6.5) in 90x89 glyph space; stubs get the accent
    (0, 0, 90, False), (0, 19, 22, True), (34, 19, 22, True),
    (0, 38, 90, False), (34, 57, 22, True), (68, 57, 22, True),
    (0, 76, 90, False),
]
GW, GH, PH, PR = 90, 89, 13, 6.5
s = (TILE * 0.56) / GW
ox = (SIZE - GW * s) / 2
oy = (SIZE - GH * s) / 2
d = ImageDraw.Draw(img)
WHITE, STUB = (255, 255, 255, 255), (0xD9, 0xCC, 0xFB, 255)
for (bx, by, bw, stub) in BARS:
    d.rounded_rectangle(
        [ox + bx * s, oy + by * s, ox + (bx + bw) * s, oy + (by + PH) * s],
        radius=PR * s, fill=STUB if stub else WHITE)

out = os.path.dirname(os.path.abspath(__file__))
iconset = os.path.join(out, "icon.iconset")
os.makedirs(iconset, exist_ok=True)
for sz in [16, 32, 64, 128, 256, 512, 1024]:
    img.resize((sz, sz), Image.LANCZOS).save(os.path.join(iconset, f"icon_{sz}x{sz}.png"))
    if sz <= 512:
        img.resize((sz * 2, sz * 2), Image.LANCZOS).save(os.path.join(iconset, f"icon_{sz}x{sz}@2x.png"))
subprocess.run(["iconutil", "-c", "icns", iconset, "-o",
                os.path.join(os.path.dirname(out), "build", "icon.icns")], check=True)
print("build/icon.icns written")
