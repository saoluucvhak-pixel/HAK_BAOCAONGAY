from PIL import Image, ImageDraw, ImageFilter
import math

S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

# ---------- Nen: hinh vuong bo goc, gradient xanh rung (teal -> green) ----------
bg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
grad = Image.new("RGBA", (S, S), (0, 0, 0, 0))
top = (14, 98, 90)      # teal dam
bot = (46, 158, 107)    # xanh la rung
for y in range(S):
    t = y / (S - 1)
    r = int(top[0] + (bot[0]-top[0])*t)
    g = int(top[1] + (bot[1]-top[1])*t)
    b = int(top[2] + (bot[2]-top[2])*t)
    ImageDraw.Draw(grad).line([(0, y), (S, y)], fill=(r, g, b, 255))

mask = Image.new("L", (S, S), 0)
radius = int(S * 0.225)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S-1, S-1], radius=radius, fill=255)
bg.paste(grad, (0, 0), mask)

# vien sang nhe phia tren de tao chieu sau (flat design co do bong nhe)
sheen = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(sheen).rounded_rectangle([0, 0, S-1, int(S*0.55)], radius=radius, fill=(255, 255, 255, 22))
sheen_mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(sheen_mask).rounded_rectangle([0, 0, S-1, S-1], radius=radius, fill=255)
bg = Image.alpha_composite(bg, Image.composite(sheen, Image.new("RGBA", (S, S), (0,0,0,0)), sheen_mask))

img = Image.alpha_composite(img, bg)

# ---------- Bong do van ban (giay to / BKLS) ----------
doc_w, doc_h = int(S*0.46), int(S*0.58)
doc_x, doc_y = int(S*0.24), int(S*0.19)
shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle(
    [doc_x+18, doc_y+26, doc_x+doc_w+18, doc_y+doc_h+26], radius=36, fill=(0, 0, 0, 70)
)
shadow = shadow.filter(ImageFilter.GaussianBlur(20))
img = Image.alpha_composite(img, shadow)

# ---------- To giay trang (voi goc gap) ----------
doc = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(doc)
fold = int(doc_w * 0.28)
pts = [
    (doc_x, doc_y),
    (doc_x+doc_w-fold, doc_y),
    (doc_x+doc_w, doc_y+fold),
    (doc_x+doc_w, doc_y+doc_h),
    (doc_x, doc_y+doc_h),
]
# ve nen giay bo goc bang rounded_rectangle roi ve lai phan goc gap
d.rounded_rectangle([doc_x, doc_y, doc_x+doc_w, doc_y+doc_h], radius=28, fill=(255, 255, 255, 255))
# xoa goc tren-phai vuong de tao hinh gap giay (ve tam giac mau nen ghi nhe)
fold_bg = [(doc_x+doc_w-fold, doc_y), (doc_x+doc_w, doc_y), (doc_x+doc_w, doc_y+fold)]
d.polygon(fold_bg, fill=(0, 0, 0, 0))
d.polygon([(doc_x+doc_w-fold, doc_y), (doc_x+doc_w, doc_y+fold), (doc_x+doc_w-fold, doc_y+fold)], fill=(214, 231, 223, 255))
d.line([(doc_x+doc_w-fold, doc_y), (doc_x+doc_w-fold, doc_y+fold), (doc_x+doc_w, doc_y+fold)], fill=(150, 190, 175, 255), width=6, joint="curve")
img = Image.alpha_composite(img, doc)

# ---------- Cac dong van ban tren giay ----------
lines = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ld = ImageDraw.Draw(lines)
lx = doc_x + int(doc_w*0.16)
lw_full = int(doc_w*0.68)
ly0 = doc_y + int(doc_h*0.30)
gap = int(doc_h*0.115)
line_color = (23, 110, 88, 255)
line_color_light = (23, 110, 88, 140)
for i, wratio in enumerate([1.0, 1.0, 0.72, 1.0, 0.55]):
    y = ly0 + i*gap
    col = line_color if i != 2 else line_color_light
    ld.rounded_rectangle([lx, y, lx+int(lw_full*wratio), y+int(gap*0.34)], radius=int(gap*0.17), fill=col)
img = Image.alpha_composite(img, lines)

# ---------- Huy hieu tron mau cam: mui ten xuat hang ----------
badge_r = int(S*0.225)
bcx, bcy = int(S*0.735), int(S*0.755)
badge_shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(badge_shadow).ellipse([bcx-badge_r, bcy-badge_r+14, bcx+badge_r, bcy+badge_r+14], fill=(0,0,0,90))
badge_shadow = badge_shadow.filter(ImageFilter.GaussianBlur(18))
img = Image.alpha_composite(img, badge_shadow)

badge = Image.new("RGBA", (S, S), (0, 0, 0, 0))
bd = ImageDraw.Draw(badge)
amber_top = (255, 176, 59)
amber_bot = (240, 140, 20)
badge_grad = Image.new("RGBA", (badge_r*2, badge_r*2), (0,0,0,0))
for yy in range(badge_r*2):
    t = yy/(badge_r*2-1)
    r = int(amber_top[0]+(amber_bot[0]-amber_top[0])*t)
    g = int(amber_top[1]+(amber_bot[1]-amber_top[1])*t)
    b = int(amber_top[2]+(amber_bot[2]-amber_top[2])*t)
    ImageDraw.Draw(badge_grad).line([(0,yy),(badge_r*2,yy)], fill=(r,g,b,255))
bmask = Image.new("L", (badge_r*2, badge_r*2), 0)
ImageDraw.Draw(bmask).ellipse([0,0,badge_r*2,badge_r*2], fill=255)
badge.paste(badge_grad, (bcx-badge_r, bcy-badge_r), bmask)
# vien trang mong quanh huy hieu de tach khoi giay
bd.ellipse([bcx-badge_r, bcy-badge_r, bcx+badge_r, bcy+badge_r], outline=(255,255,255,255), width=14)
img = Image.alpha_composite(img, badge)

# mui ten xuat (arrow) huong len-phai, mau trang, trong huy hieu
arrow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ad = ImageDraw.Draw(arrow)
al = int(badge_r*0.95)
ang = math.radians(45)
ex, ey = bcx + int(al*0.62*math.cos(ang)), bcy - int(al*0.62*math.sin(ang))
sx, sy = bcx - int(al*0.62*math.cos(ang)), bcy + int(al*0.62*math.sin(ang))
sw = int(badge_r*0.20)
ad.line([sx, sy, ex, ey], fill=(255,255,255,255), width=sw)
# dau mui ten
perp = ang + math.radians(90)
head_len = int(badge_r*0.42)
p1 = (ex, ey)
p2 = (ex - int(head_len*math.cos(ang-math.radians(28))), ey + int(head_len*math.sin(ang-math.radians(28))))
p3 = (ex - int(head_len*math.cos(ang+math.radians(28))), ey + int(head_len*math.sin(ang+math.radians(28))))
ad.polygon([p1, p2, p3], fill=(255,255,255,255))
img = Image.alpha_composite(img, arrow)

img.save("/home/claude/installer/icon/icon_1024.png")

sizes = [16, 24, 32, 48, 64, 128, 256]
imgs = [img.resize((s, s), Image.LANCZOS) for s in sizes]
imgs[0].save("/home/claude/installer/icon/app.ico", sizes=[(s, s) for s in sizes], append_images=imgs[1:])
print("done")
