import sharp from "sharp";
import fs from "fs";
import path from "path";

const OUT = "E:/Project/行星牌/assets/ui";
const ASSETS = "C:/Users/lenovo/.cursor/projects/e-Project/assets";

const SRC = {
  card: `${ASSETS}/image-c1157f21-cf89-433a-92e7-bada4840d2a7.png`,
  deck2: `${ASSETS}/image-8ede5032-1759-48bc-8868-6f7b54518479.png`,
  have: `${ASSETS}/image-c584f143-d712-46a0-ba4e-0aab78da53db.png`,
  count: `${ASSETS}/image-1d4dae1f-86e8-4e0b-962f-8af65c026bc6.png`,
  title: `${ASSETS}/image-098ebb04-4587-4af0-a817-1bf9b5e54b0a.png`,
  deckStrip: `${ASSETS}/image-a4513cf9-b716-4bf5-8bca-2f00c84fe122.png`,
  player: `${ASSETS}/image-e4cafaf7-480a-4dc3-a1ba-b6d80a89c724.png`,
  player2: `${ASSETS}/image-821b7003-dd88-4b23-af7a-e9f6debde1f5.png`,
};

async function toTransparent(buf, thresh = 55) {
  const raw = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const d = raw.data;
  for (let p = 0; p < d.length; p += 4) {
    const luma = 0.3 * d[p] + 0.59 * d[p + 1] + 0.11 * d[p + 2];
    if (luma < thresh) d[p + 3] = 0;
    else d[p + 3] = Math.round(255 * Math.min(1, (luma - thresh) / 40));
  }
  return { data: d, width: raw.info.width, height: raw.info.height };
}

function trimBounds(data, width, height, pad = 6) {
  let minX = width,
    minY = height,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 20) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  return {
    left,
    top,
    width: Math.min(width - left, maxX - minX + 1 + pad * 2),
    height: Math.min(height - top, maxY - minY + 1 + pad * 2),
  };
}

async function saveIcon(src, outName, { glyphOnly = false, region = null } = {}) {
  let pipeline = sharp(src);
  if (region) pipeline = pipeline.extract(region);
  if (glyphOnly) {
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const rowInk = [];
    for (let y = 0; y < height; y++) {
      let ink = 0;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * channels;
        const luma = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
        if (luma > 90) ink++;
      }
      rowInk.push(ink);
    }
    let glyphEnd = Math.floor(height * 0.55);
    let inGap = 0;
    for (let y = Math.floor(height * 0.35); y < height; y++) {
      if (rowInk[y] <= 2) {
        inGap++;
        if (inGap >= 8) {
          glyphEnd = y - inGap + 1;
          break;
        }
      } else inGap = 0;
    }
    pipeline = sharp(src).extract({
      left: 0,
      top: 0,
      width,
      height: Math.min(height, glyphEnd + 4),
    });
  }
  const buf = await pipeline.png().toBuffer();
  const { data, width, height } = await toTransparent(buf);
  const box = trimBounds(data, width, height, 6);
  const out = path.join(OUT, outName);
  const tmp = out + ".new.png";
  await sharp(data, { raw: { width, height, channels: 4 } })
    .extract(box)
    .png()
    .toFile(tmp);
  fs.copyFileSync(tmp, out);
  fs.unlinkSync(tmp);
  const m = await sharp(out).metadata();
  console.log(outName, `${m.width}x${m.height}`);
}

// Clean refs from user screenshots
await saveIcon(SRC.card, "ui-card.png");
await saveIcon(SRC.card, "title-card.png");
await saveIcon(SRC.deck2, "ui-deck.png");
await saveIcon(SRC.have, "ui-have.png");
await saveIcon(SRC.count, "ui-count-mark.png", { glyphOnly: true });

// Title 7 / 行星 from strip (glyph band only)
await saveIcon(SRC.title, "title-7.png", { region: { left: 0, top: 10, width: 100, height: 95 } });
await saveIcon(SRC.title, "title-planet.png", {
  region: { left: 100, top: 10, width: 110, height: 95 },
});

// || under 2 (30)
await saveIcon(SRC.deckStrip, "ui-two.png", {
  region: { left: 355, top: 10, width: 55, height: 95 },
});

// Player badges — drop left border on 玩家
{
  const { data, info } = await sharp(SRC.player).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let cutX = 0;
  for (let x = 0; x < Math.min(40, width); x++) {
    let ink = 0;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * channels;
      const luma = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
      if (data[i + 3] > 40 || luma > 90) ink++;
    }
    if (ink > height * 0.7) cutX = x + 1;
    else if (cutX > 0) break;
  }
  cutX = Math.min(width - 10, cutX + 2);
  const cropped = await sharp(SRC.player)
    .extract({ left: cutX, top: 0, width: width - cutX, height })
    .png()
    .toBuffer();
  await saveIcon(cropped, "player.png");
  await saveIcon(SRC.player2, "player2.png");
}
