"""Draws a captured command output as a macOS terminal window (PNG) for the report."""
import sys
from PIL import Image, ImageDraw, ImageFont
src, out, title = sys.argv[1], sys.argv[2], sys.argv[3]
maxlines = int(sys.argv[4]) if len(sys.argv) > 4 else 60
lines = open(src).read().rstrip("\n").split("\n")[:maxlines]
import textwrap
wrap = 104
L = []
for l in lines:
    ind = len(l) - len(l.lstrip())
    sub = " " * (ind + 4 if "[PASS]" not in l and "[FAIL]" not in l else 21)
    L += textwrap.wrap(l, wrap, subsequent_indent=sub, drop_whitespace=False, replace_whitespace=False) or [""]
S = 2
font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 13 * S)
bold = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 13 * S, index=1)
cw = font.getbbox("M")[2]; lh = 18 * S
W = max(60, max(len(l) for l in L) + 2) * cw + 24 * S
H = 30 * S + len(L) * lh + 22 * S
im = Image.new("RGB", (W, H), (30, 30, 36)); d = ImageDraw.Draw(im)
d.rectangle([0, 0, W, 28 * S], fill=(58, 58, 64))
for i, c in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
    x = 14 * S + i * 20 * S; d.ellipse([x, 8 * S, x + 12 * S, 20 * S], fill=c)
tw = d.textlength(title, font=font); d.text(((W - tw) / 2, 7 * S), title, font=font, fill=(200, 200, 205))
y = 38 * S
for l in L:
    col, f = (225, 225, 228), font
    if l.startswith("$"): col, f = (120, 220, 120), bold
    elif "[PASS]" in l or " PASSED" in l or " passed" in l: col = (130, 210, 140)
    elif "[FAIL]" in l or "FAILED" in l or "Problem at" in l: col = (255, 120, 110)
    elif l.startswith("Warning"): col = (240, 200, 90)
    elif l.startswith("Fix") or l.startswith("Everything"): col = (130, 190, 255)
    d.text((12 * S, y), l, font=f, fill=col); y += lh
im.save(out, optimize=True)
print(out, im.size)
