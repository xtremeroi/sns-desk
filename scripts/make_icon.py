# Generates the S&S Desk app icon: dark rounded square, green punch-clock dot,
# "S&S" wordmark. Follows macOS Big Sur icon geometry (content inset ~10%).
from PIL import Image, ImageDraw, ImageFont
import os, subprocess

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Rounded-square canvas (Big Sur style: ~80% of frame, centered)
m = int(SIZE * 0.10)
r = int(SIZE * 0.18)
d.rounded_rectangle([m, m, SIZE - m, SIZE - m], radius=r, fill=(16, 18, 24, 255), outline=(70, 76, 92, 255), width=6)

# Subtle top gradient sheen
for i in range(200):
    a = int(26 * (1 - i / 200))
    d.rounded_rectangle([m + 8, m + 8 + i, SIZE - m - 8, m + 10 + i], radius=0, fill=(255, 255, 255, a)) if i < 2 else None

def font(size):
    for p in ["/System/Library/Fonts/SFNSRounded.ttf", "/System/Library/Fonts/SFNS.ttf",
              "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Helvetica.ttc"]:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()

# Wordmark
f = font(340)
text = "S&S"
bb = d.textbbox((0, 0), text, font=f)
tw, th = bb[2] - bb[0], bb[3] - bb[1]
tx, ty = (SIZE - tw) / 2 - bb[0], (SIZE - th) / 2 - bb[1] - 60
d.text((tx, ty), text, font=f, fill=(232, 234, 240, 255))

# Green "clocked in" ticker dot + bar under the wordmark
bar_y = int(SIZE * 0.66)
d.rounded_rectangle([SIZE * 0.30, bar_y, SIZE * 0.70, bar_y + 46], radius=23, fill=(37, 44, 58, 255))
d.ellipse([SIZE * 0.315, bar_y + 8, SIZE * 0.315 + 30, bar_y + 38], fill=(52, 211, 153, 255))
f2 = font(38)
d.text((SIZE * 0.365, bar_y + 2), "0:00:00", font=f2, fill=(154, 161, 176, 255))

out = os.path.dirname(os.path.abspath(__file__))
iconset = os.path.join(out, "icon.iconset")
os.makedirs(iconset, exist_ok=True)
for s in [16, 32, 64, 128, 256, 512, 1024]:
    im = img.resize((s, s), Image.LANCZOS)
    im.save(os.path.join(iconset, f"icon_{s}x{s}.png"))
    if s <= 512:
        img.resize((s * 2, s * 2), Image.LANCZOS).save(os.path.join(iconset, f"icon_{s}x{s}@2x.png"))
subprocess.run(["iconutil", "-c", "icns", iconset, "-o", os.path.join(out, "icon.icns")], check=True)
print("icns written")
