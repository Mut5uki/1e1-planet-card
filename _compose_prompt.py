"""Compose candidate prompt sentences from official glyphs and compare to user screenshot."""
from PIL import Image, ImageDraw
import os

base = r"E:\Project\行星牌"
gdir = os.path.join(base, "extracted", "glyphs")
ref = Image.open(
    r"C:\Users\lenovo\.cursor\projects\e-Project\assets\image-b5f536d1-d1c6-4588-b00e-29f156b7acad.png"
).convert("RGBA")


def load_amber(name, size=100):
    p = os.path.join(gdir, f"{name}.png")
    im = Image.open(p).convert("RGBA")
    # recolor white->amber, black->transparent
    px = im.load()
    w, h = im.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            v = max(r, g, b)
            if a > 20 and v > 40:
                op[x, y] = (232, 176, 122, min(255, int(v * a / 255 * 1.2)))
    # trim
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    # fit height
    ow, oh = out.size
    nh = size
    nw = max(1, int(ow * nh / oh))
    return out.resize((nw, nh), Image.Resampling.LANCZOS)


def compose(words, gap=18, pad=10, h=100):
    imgs = [load_amber(w, h) for w in words]
    tw = pad * 2 + sum(i.size[0] for i in imgs) + gap * (len(imgs) - 1)
    canvas = Image.new("RGBA", (tw, h + pad * 2), (0, 0, 0, 0))
    x = pad
    for im in imgs:
        canvas.paste(im, (x, pad), im)
        x += im.size[0] + gap
    return canvas


candidates = [
    ["you", "give", "de", "card"],
    ["give", "de", "card"],
    ["you", "take", "de", "card"],
    ["take", "you", "give", "de", "card"],
    ["opponent", "take", "you", "give", "de", "card"],
    ["you", "give", "me", "de", "card"],
    ["choose", "give", "de", "card"],
    ["give", "card"],
    ["you", "have", "de", "card"],
    ["take", "de", "card", "and", "give"],
]

outdir = os.path.join(base, "extracted", "crops", "prompt_candidates")
os.makedirs(outdir, exist_ok=True)

# also save individual words for visual check
for w in ["you", "me", "give", "take", "de", "card", "and", "have", "choose", "opponent", "this", "hand", "into", "place", "want", "benot", "no"]:
    load_amber(w, 120).save(os.path.join(outdir, f"word_{w}.png"))

for words in candidates:
    name = "_".join(words)
    img = compose(words)
    img.save(os.path.join(outdir, f"sent_{name}.png"))
    print(name, img.size)

# save ref for side-by-side
ref.save(os.path.join(outdir, "_ref.png"))
print("done", outdir)
