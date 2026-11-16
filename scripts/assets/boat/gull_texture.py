import math, sys
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
S = 2048
WING_H = int(S * 0.6)

def lerp(a, b, t):
    return a + (b - a) * t

def leading(u):
    wrist = 0.42
    if u < wrist:
        return lerp(0.2, 0.1, math.sin(u / wrist * math.pi / 2))
    t = (u - wrist) / (1 - wrist)
    return lerp(0.1, 0.62, t ** 1.7)

def trailing(u):
    wrist = 0.42
    if u < wrist:
        return lerp(0.9, 0.84, u / wrist)
    t = (u - wrist) / (1 - wrist)
    return lerp(0.84, 0.68, t ** 1.3)

def feather(draw, base, tip, width, fill):
    bx, by = base
    tx, ty = tip
    dx, dy = tx - bx, ty - by
    length = math.hypot(dx, dy)
    nx, ny = -dy / length, dx / length
    pts = []
    steps = 14
    for i in range(steps + 1):
        t = i / steps
        w = width * (0.55 + 0.45 * math.sin(t * math.pi * 0.5)) * (1 if t < 0.82 else math.sqrt(max(0.0, 1 - ((t - 0.82) / 0.18) ** 2)))
        pts.append((bx + dx * t + nx * w, by + dy * t + ny * w))
    for i in range(steps, -1, -1):
        t = i / steps
        w = width * (0.55 + 0.45 * math.sin(t * math.pi * 0.5)) * (1 if t < 0.82 else math.sqrt(max(0.0, 1 - ((t - 0.82) / 0.18) ** 2)))
        pts.append((bx + dx * t - nx * w, by + dy * t - ny * w))
    draw.polygon(pts, fill=fill)

def wing_feathers():
    rows = []
    for i in range(13):
        u = 0.02 + 0.4 * i / 12
        rows.append(((u, lerp(leading(u), trailing(u), 0.45)), (u + 0.03, trailing(u) + 0.02), 0.03, "secondary"))
    for i in range(10):
        t = i / 9
        u = 0.44 + 0.36 * t
        base = (u, lerp(leading(u), trailing(u), 0.4))
        angle = lerp(0.45, 1.3, t)
        length = lerp(0.24, 0.2, t)
        tip = (base[0] + math.sin(angle) * length, base[1] + math.cos(angle) * length * 0.62)
        rows.append((base, tip, lerp(0.034, 0.024, t), "primary"))
    return rows

def px(p):
    return (p[0] * S, p[1] * WING_H)

mask = Image.new("L", (S, S), 0)
md = ImageDraw.Draw(mask)
color = Image.new("RGB", (S, S), (246, 246, 242))
cd = ImageDraw.Draw(color)

cover = [px((u / 60, leading(u / 60))) for u in range(0, 59)] + [px((u / 60, lerp(leading(u / 60), trailing(u / 60), 0.62 if u < 26 else lerp(0.62, 0.25, (u - 26) / 33)))) for u in range(58, -1, -1)]
md.polygon(cover, fill=255)
cd.rectangle([0, 0, S, WING_H], fill=(166, 175, 184))

for base, tip, width, kind in wing_feathers():
    feather(md, px(base), px(tip), width * S, 255)
for index, (base, tip, width, kind) in enumerate(wing_feathers()):
    shade = 6 * (index % 2)
    if kind == "secondary":
        feather(cd, px(base), px(tip), width * S, (150 - shade, 160 - shade, 170 - shade))
        mid = (lerp(base[0], tip[0], 0.72), lerp(base[1], tip[1], 0.72))
        feather(cd, px(mid), px(tip), width * S * 0.98, (240, 241, 238))
    else:
        t = (index - 13) / 9
        feather(cd, px(base), px(tip), width * S, (140 - shade, 150 - shade, 160 - shade))
        dark = (lerp(base[0], tip[0], lerp(0.75, 0.3, t)), lerp(base[1], tip[1], lerp(0.75, 0.3, t)))
        feather(cd, px(dark), px(tip), width * S * 0.98, (30 + shade, 31 + shade, 34 + shade))
        if t > 0.35:
            spot = (lerp(base[0], tip[0], 0.93), lerp(base[1], tip[1], 0.93))
            cd.ellipse([spot[0] * S - 9, spot[1] * WING_H - 9, spot[0] * S + 9, spot[1] * WING_H + 9], fill=(240, 240, 236))

for u in range(0, 58):
    a = px((u / 60, leading(u / 60)))
    b = px(((u + 1) / 60, leading((u + 1) / 60)))
    cd.line([a, b], fill=(236, 238, 238), width=26)
cover_shade = Image.new("RGB", (S, S), (0, 0, 0))
cover_draw = ImageDraw.Draw(cover_shade)
for row in range(4):
    for i in range(22):
        u = 0.02 + 0.66 * i / 21
        v = lerp(leading(u), trailing(u), 0.16 + row * 0.11)
        cover_draw.ellipse([u * S - 30, v * WING_H - 12, u * S + 30, v * WING_H + 16], outline=(26, 26, 26), width=3)
color = Image.composite(color, Image.eval(color, lambda v: int(v * 0.9)), Image.eval(cover_shade.convert("L"), lambda v: 255 - v * 8))

TY, TX = WING_H + 40, int(S * 0.52)
TW, TH = int(S * 0.44), S - WING_H - 80
for i in range(9):
    a = lerp(-0.42, 0.42, i / 8)
    base = (TX + TW / 2, TY + 10)
    tip = (TX + TW / 2 + math.sin(a) * TH * 0.95, TY + 10 + math.cos(a) * TH * 0.95)
    feather(md, base, tip, TW * 0.075, 255)
    feather(cd, base, tip, TW * 0.075, (244 - 5 * (i % 2), 244 - 5 * (i % 2), 240 - 5 * (i % 2)))

mask = mask.filter(ImageFilter.GaussianBlur(1.5))
color = color.filter(ImageFilter.GaussianBlur(1.2))
out = color.convert("RGBA")
out.putalpha(mask)
out.resize((512, 512), Image.LANCZOS).save(OUT)
print("TAIL", TX / S, TY / S, TW / S, TH / S, "WING_H", WING_H / S)
