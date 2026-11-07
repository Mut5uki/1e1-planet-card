from PIL import Image

img = Image.open(
    r"C:\Users\lenovo\.cursor\projects\e-Project\assets\image-dbf24514-689b-462e-9a10-d493ce285889.png"
).convert("RGB")
w, h = img.size
pix = img.load()
print("size", w, h)


def is_orange(x, y):
    r, g, b = pix[x, y]
    return r > 140 and 60 < g < 200 and b < 120 and r > g and (r - b) > 40


orange = [[False] * w for _ in range(h)]
count = 0
xmin, xmax, ymin, ymax = w, 0, h, 0
for y in range(h):
    for x in range(w):
        if is_orange(x, y):
            orange[y][x] = True
            count += 1
            xmin = min(xmin, x)
            xmax = max(xmax, x)
            ymin = min(ymin, y)
            ymax = max(ymax, y)
print("orange px", count)
print("content bbox", xmin, ymin, xmax, ymax)

# row bands
row_sum = [sum(1 for x in range(w) if orange[y][x]) for y in range(h)]
mx = max(row_sum) or 1
active = [v > mx * 0.08 for v in row_sum]
bands = []
inb = False
for y, a in enumerate(active):
    if a and not inb:
        s = y
        inb = True
    elif not a and inb:
        bands.append((s, y - 1))
        inb = False
if inb:
    bands.append((s, h - 1))
print("row bands", bands)

for bi, (y0, y1) in enumerate(bands):
    csum = [sum(1 for y in range(y0, y1 + 1) if orange[y][x]) for x in range(w)]
    thr = max(1, max(csum) * 0.15)
    chunks = []
    ino = False
    for x, v in enumerate(csum):
        o = v > thr
        if o and not ino:
            xs0 = x
            ino = True
        elif not o and ino:
            chunks.append((xs0, x - 1))
            ino = False
    if ino:
        chunks.append((xs0, w - 1))
    print(f"band{bi} y={y0}-{y1} n={len(chunks)} chunks={chunks}")

# player vertical divider lines in bottom area
y0, y1 = int(h * 0.55), int(h * 0.98)
vline = [0] * w
for y in range(y0, y1):
    for x in range(w):
        r, g, b = pix[x, y]
        if r > 160 and 80 < g < 190 and b < 100 and (r - b) > 50:
            # thin vertical: check neighbors mostly dark
            vline[x] += 1
vpeaks = []
for x in range(1, w - 1):
    if vline[x] > (y1 - y0) * 0.25 and vline[x] >= vline[x - 1] and vline[x] >= vline[x + 1]:
        if not vpeaks or x - vpeaks[-1] > 15:
            vpeaks.append(x)
print("player vertical lines", vpeaks)

print("12col from content:")
for i in range(13):
    print(f"  {i}: x={xmin + i * (xmax - xmin) / 12:.1f}")

# grid_measure overlay
gimg = Image.open(r"E:\Project\行星牌\extracted\grid_measure.png").convert("RGB")
gp = gimg.load()


def find_guides(pred, name):
    csum = [0] * w
    rsum = [0] * h
    for y in range(h):
        for x in range(w):
            if pred(*gp[x, y]):
                csum[x] += 1
                rsum[y] += 1
    vlines = []
    for x in range(1, w - 1):
        if csum[x] > h * 0.12 and csum[x] >= csum[x - 1] and csum[x] >= csum[x + 1]:
            if not vlines or x - vlines[-1] > 8:
                vlines.append(x)
    hlines = []
    for y in range(1, h - 1):
        if rsum[y] > w * 0.12 and rsum[y] >= rsum[y - 1] and rsum[y] >= rsum[y + 1]:
            if not hlines or y - hlines[-1] > 8:
                hlines.append(y)
    print(name, "v", vlines)
    print(name, "h", hlines)


find_guides(lambda r, g, b: b > 150 and g > 120 and r < 130 and b >= g, "cyan")
find_guides(lambda r, g, b: g > 150 and r < 120 and b < 120, "green")
