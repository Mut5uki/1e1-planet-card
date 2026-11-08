import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dest = join(root, "_site");
const copy = [
  "index.html",
  "styles.css",
  "main.js",
  "icons.js",
  "game.js",
  "net.js",
  "settings.js",
  "preload.js",
  "functions",
  "assets",
];

if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const p of copy) {
  const src = join(root, p);
  if (!existsSync(src)) continue;
  cpSync(src, join(dest, p), { recursive: true });
}
writeFileSync(
  join(dest, ".assetsignore"),
  readFileSync(join(root, ".assetsignore"), "utf8"),
  "utf8"
);
console.log("[build-site] ready:", dest);
