import sharp from "sharp";
import fs from "fs";
import path from "path";

const SRC = {
  deck: "C:/Users/lenovo/.cursor/projects/e-Project/assets/image-a4513cf9-b716-4bf5-8bca-2f00c84fe122.png",
  title: "C:/Users/lenovo/.cursor/projects/e-Project/assets/image-098ebb04-4587-4af0-a817-1bf9b5e54b0a.png",
  player: "C:/Users/lenovo/.cursor/projects/e-Project/assets/image-e4cafaf7-480a-4dc3-a1ba-b6d80a89c724.png",
  player2: "C:/Users/lenovo/.cursor/projects/e-Project/assets/image-821b7003-dd88-4b23-af7a-e9f6debde1f5.png",
  receive: "C:/Users/lenovo/.cursor/projects/e-Project/assets/image-7931a78d-e10e-4d29-ada1-9bb16b4322cf.png",
};

const OUT = "E:/Project/行星牌/assets/ui";
fs.mkdirSync(OUT, { recursive: true });

async function transparentBg(file, thresh = 70) {
  const raw = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const d = raw.data;
  for (let p = 0; p < d.length; p += 4) {
    const luma = 0.3 * d[p] + 0.59 * d[p + 1] + 0.11 * d[p + 2];
    if (luma < thresh) d[p + 3] = 0;
    else d[p + 3] = Math.round(255 * Math.min(1, (luma - thresh) / 35));
  }
  await sharp(d, {
    raw: { width: raw.info.width, height: raw.info.height, channels: 4 },
  })
    .png()
    .toFile(file);
}

async function copyWhole(src, name) {
  const out = path.join(OUT, name);
  await sharp(src).png().toFile(out);
  await transparentBg(out);
  const m = await sharp(out).metadata();
  console.log(name, `${m.width}x${m.height}`);
}

function inkMask(data, width, height, channels, thresh = 95) {
  const colHas = new Array(width).fill(false);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * channels;
      const luma = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
      if (luma > thresh) {
        colHas[x] = true;
        break;
      }
    }
  }
  return colHas;
}

function rangesFromMask(colHas, minW = 4) {
  const ranges = [];
  let start = null;
  for (let x = 0; x < colHas.length; x++) {
    if (colHas[x] && start === null) start = x;
    if (start !== null && (!colHas[x] || x === colHas.length - 1)) {
      const end = !colHas[x] ? x - 1 : x;
      if (end - start + 1 >= minW) ranges.push([start, end]);
      start = null;
    }
  }
  return ranges;
}

function mergeClose(ranges, gap) {
  if (!ranges.length) return [];
  const out = [[...ranges[0]]];
  for (let i = 1; i < ranges.length; i++) {
    const prev = out[out.length - 1];
    const cur = ranges[i];
    if (cur[0] - prev[1] <= gap) prev[1] = Math.max(prev[1], cur[1]);
    else out.push([...cur]);
  }
  return out;
}

async function splitTopGlyphs(src, names, mergeGap = 18) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  // only look at top ~60% for glyphs (labels are below)
  const glyphH = Math.floor(height * 0.62);
  const colHas = new Array(width).fill(false);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < glyphH; y++) {
      const i = (y * width + x) * channels;
      const luma = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
      if (luma > 95) {
        colHas[x] = true;
        break;
      }
    }
  }
  const ranges = mergeClose(rangesFromMask(colHas), mergeGap);
  console.log(path.basename(src), "glyph groups", ranges.length, ranges);
  if (ranges.length !== names.length) {
    throw new Error(`expected ${names.length} groups, got ${ranges.length}`);
  }
  for (let i = 0; i < names.length; i++) {
    const [x0, x1] = ranges[i];
    let minY = glyphH;
    let maxY = 0;
    for (let y = 0; y < glyphH; y++) {
      for (let x = x0; x <= x1; x++) {
        const idx = (y * width + x) * channels;
        const luma = 0.3 * data[idx] + 0.59 * data[idx + 1] + 0.11 * data[idx + 2];
        if (luma > 95) {
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const pad = 6;
    const left = Math.max(0, x0 - pad);
    const top = Math.max(0, minY - pad);
    const w = Math.min(width - left, x1 - x0 + 1 + pad * 2);
    const h = Math.min(glyphH - top, maxY - minY + 1 + pad * 2);
    const out = path.join(OUT, `${names[i]}.png`);
    await sharp(src).extract({ left, top, width: w, height: h }).png().toFile(out);
    await transparentBg(out);
    const m = await sharp(out).metadata();
    console.log(names[i], `${m.width}x${m.height}`);
  }
}

await copyWhole(SRC.player, "player.png");
await copyWhole(SRC.player2, "player2.png");
await copyWhole(SRC.receive, "receive.png");
await copyWhole(SRC.deck, "deck-strip.png");
await copyWhole(SRC.title, "title-strip.png");

await splitTopGlyphs(SRC.title, ["title-7", "title-planet", "title-card"], 8);

// deck strip: 牌堆=两枚小图标, 有, 数量符, ||, 牌
await splitTopGlyphs(
  SRC.deck,
  ["ui-deck-a", "ui-deck-b", "ui-have", "ui-count-mark", "ui-two-a", "ui-two-b", "ui-card"],
  8
);

async function mergeSideBySide(files, outName, gap = 12) {
  const metas = [];
  for (const f of files) metas.push({ file: f, ...(await sharp(f).metadata()) });
  const height = Math.max(...metas.map((m) => m.height));
  const width = metas.reduce((s, m) => s + m.width, 0) + gap * (metas.length - 1);
  const composites = [];
  let left = 0;
  for (const m of metas) {
    composites.push({
      input: m.file,
      left,
      top: Math.floor((height - m.height) / 2),
    });
    left += m.width + gap;
  }
  const out = path.join(OUT, outName);
  await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .png()
    .toFile(out);
  console.log("merged", outName, `${width}x${height}`);
}

await mergeSideBySide(
  [path.join(OUT, "ui-deck-a.png"), path.join(OUT, "ui-deck-b.png")],
  "ui-deck.png",
  16
);
await mergeSideBySide(
  [path.join(OUT, "ui-two-a.png"), path.join(OUT, "ui-two-b.png")],
  "ui-two.png",
  18
);
