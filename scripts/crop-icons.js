import sharp from "sharp";
import fs from "fs";
import path from "path";

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

function rangesFromMask(colHas) {
  const ranges = [];
  let start = null;
  for (let x = 0; x < colHas.length; x++) {
    if (colHas[x] && start === null) start = x;
    if (start !== null && (!colHas[x] || x === colHas.length - 1)) {
      const end = !colHas[x] ? x - 1 : x;
      ranges.push([start, end]);
      start = null;
    }
  }
  return ranges.filter(([a, b]) => b - a + 1 >= 5);
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

function boundsIn(data, width, height, channels, x0, x1, thresh = 95) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * width + x) * channels;
      const luma = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
      if (luma > thresh) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Keep original ink pixels; only punch out dark background. */
async function recolorTransparent(file) {
  const raw = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const d = raw.data;
  for (let p = 0; p < d.length; p += 4) {
    const luma = 0.3 * d[p] + 0.59 * d[p + 1] + 0.11 * d[p + 2];
    if (luma < 70) {
      d[p + 3] = 0;
    } else {
      // soft edge: fade near threshold
      const t = Math.min(1, (luma - 70) / 40);
      d[p + 3] = Math.round(255 * t);
    }
  }
  await sharp(d, {
    raw: { width: raw.info.width, height: raw.info.height, channels: 4 },
  })
    .png()
    .toFile(file);
}

function groupNumberRanges(ranges) {
  const large = ranges.filter(([a, b]) => b - a + 1 >= 40);
  const small = ranges.filter(([a, b]) => b - a + 1 < 40);
  const smallGroups = mergeClose(small, 30);
  return [...large, ...smallGroups].sort((a, b) => a[0] - b[0]);
}

async function split(src, outDir, names, { mergeGap = 12, specialN1 = false, numberMode = false } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let ranges = rangesFromMask(inkMask(data, width, height, channels));
  ranges = numberMode ? groupNumberRanges(ranges) : mergeClose(ranges, mergeGap);
  console.log(path.basename(src), "groups", ranges.length, ranges);
  if (ranges.length !== names.length) {
    throw new Error(`group count mismatch ${ranges.length} vs ${names.length}`);
  }
  for (let i = 0; i < names.length; i++) {
    let { minX, minY, maxX, maxY } = boundsIn(
      data,
      width,
      height,
      channels,
      ranges[i][0],
      ranges[i][1]
    );
    if (specialN1 && names[i] === "n1") {
      const mid = (minX + maxX) / 2;
      const dens = [];
      for (let x = minX; x <= maxX; x++) {
        const ys = [];
        for (let y = minY; y <= maxY; y++) {
          const idx = (y * width + x) * channels;
          const luma = 0.3 * data[idx] + 0.59 * data[idx + 1] + 0.11 * data[idx + 2];
          if (luma <= 95) continue;
          // skip pixels that sit on the square frame's horizontal bars
          let run = 0;
          for (let dx = -18; dx <= 18; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            const j = (y * width + xx) * channels;
            const l2 = 0.3 * data[j] + 0.59 * data[j + 1] + 0.11 * data[j + 2];
            if (l2 > 95) run++;
          }
          if (run >= 14) continue;
          ys.push(y);
        }
        if (ys.length < 8) continue;
        dens.push({
          x,
          c: ys.length,
          t: ys[0],
          b: ys[ys.length - 1],
          h: ys[ys.length - 1] - ys[0],
        });
      }
      dens.sort((a, b) => Math.abs(a.x - mid) - Math.abs(b.x - mid) || b.h - a.h);
      const best = dens[0];
      if (!best) throw new Error("failed to isolate number 1 stroke");
      minX = best.x;
      maxX = best.x;
      minY = best.t;
      maxY = best.b;
    }
    const padX = specialN1 && names[i] === "n1" ? 12 : 8;
    const padY = 8;
    const left = Math.max(0, minX - padX);
    const top = Math.max(0, minY - padY);
    const w = Math.min(width - left, maxX - minX + 1 + padX * 2);
    const h = Math.min(height - top, maxY - minY + 1 + padY * 2);
    const out = path.join(outDir, `${names[i]}.png`);
    await sharp(src).extract({ left, top, width: w, height: h }).png().toFile(out);
    await recolorTransparent(out);
    const meta = await sharp(out).metadata();
    console.log(names[i], `${meta.width}x${meta.height}`);
  }
}

/** Keep only tall vertical strokes; strip short horizontal leftovers from bad screenshots. */
async function cleanVerticalOnly(file) {
  const raw = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = raw;
  const { width, height, channels } = info;
  const keep = new Uint8Array(width * height);

  // mark columns that are real strokes (enough vertical ink, not a short dash)
  for (let x = 0; x < width; x++) {
    const ys = [];
    for (let y = 0; y < height; y++) {
      const a = data[(y * width + x) * channels + 3];
      if (a > 40) ys.push(y);
    }
    if (ys.length < height * 0.35) continue;
    const span = ys[ys.length - 1] - ys[0] + 1;
    if (span < height * 0.45) continue;
    for (const y of ys) {
      // drop pixels that belong to a wide horizontal run
      let run = 0;
      for (let dx = -10; dx <= 10; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= width) continue;
        if (data[(y * width + xx) * channels + 3] > 40) run++;
      }
      if (run >= 8) continue;
      keep[y * width + x] = 1;
    }
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const out = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (!keep[y * width + x]) {
        out[i + 3] = 0;
      } else {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error(`cleanVerticalOnly failed: ${file}`);

  const pad = 8;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const w = Math.min(width - left, maxX - minX + 1 + pad * 2);
  const h = Math.min(height - top, maxY - minY + 1 + pad * 2);

  const tmp = file.replace(/\.png$/, ".clean.png");
  await sharp(out, { raw: { width, height, channels } }).png().toFile(tmp);
  await sharp(tmp).extract({ left, top, width: w, height: h }).png().toFile(file);
  fs.unlinkSync(tmp);
  const meta = await sharp(file).metadata();
  console.log("cleaned", path.basename(file), `${meta.width}x${meta.height}`);
}

await split(
  "C:/Users/lenovo/.cursor/projects/e-Project/assets/image-5f272cb8-12b9-45eb-989c-7a75341ffbb1.png",
  "E:/Project/行星牌/assets/icons/elements",
  ["fire", "metal", "water", "warm", "ice", "kelp", "terrain"],
  { mergeGap: 12 }
);

await split(
  "C:/Users/lenovo/.cursor/projects/e-Project/assets/image-3f4b7afc-872a-4976-ab00-1ee0b03af104.png",
  "E:/Project/行星牌/assets/icons/numbers",
  ["n1", "n2", "n3", "n4", "n5", "n6", "n7"],
  { specialN1: true, numberMode: true }
);

// 1 / 3：去掉截图带进来的顶底横线残影
await cleanVerticalOnly("E:/Project/行星牌/assets/icons/numbers/n1.png");
await cleanVerticalOnly("E:/Project/行星牌/assets/icons/numbers/n3.png");
