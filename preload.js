/**
 * 首屏字形预载：把 official PNG 解进浏览器缓存，避免进菜单后一片空白再逐个蹦出来。
 * 与 icons.js 的 ?v= 保持一致。
 */
export const ASSET_V = "v36";

const FILES = [
  // elements
  "elements/earth.png",
  "elements/fire.png",
  "elements/ice.png",
  "elements/kelp.png",
  "elements/metal.png",
  "elements/terrain.png",
  "elements/warm.png",
  "elements/water.png",
  // numbers
  "numbers/1e1.png",
  "numbers/2e1.png",
  "numbers/3e1.png",
  "numbers/4e1.png",
  "numbers/n0.png",
  "numbers/n1.png",
  "numbers/n2.png",
  "numbers/n3.png",
  "numbers/n4.png",
  "numbers/n5.png",
  "numbers/n6.png",
  "numbers/n7.png",
  "numbers/n8.png",
  "numbers/n9.png",
  "numbers/n10.png",
  "numbers/n11.png",
  "numbers/n12.png",
  "numbers/n13.png",
  "numbers/n14.png",
  "numbers/n15.png",
  "numbers/n16.png",
  "numbers/n17.png",
  "numbers/n18.png",
  "numbers/n19.png",
  "numbers/n20.png",
  "numbers/n21.png",
  "numbers/n22.png",
  "numbers/n23.png",
  "numbers/n24.png",
  "numbers/n25.png",
  "numbers/n28.png",
  // ui
  "ui/action.png",
  "ui/again.png",
  "ui/and.png",
  "ui/be.png",
  "ui/benot.png",
  "ui/black.png",
  "ui/card.png",
  "ui/color.png",
  "ui/click.png",
  "ui/copy.png",
  "ui/create.png",
  "ui/de.png",
  "ui/deck.png",
  "ui/do.png",
  "ui/draw.png",
  "ui/earth.png",
  "ui/enter.png",
  "ui/exist.png",
  "ui/fail.png",
  "ui/first.png",
  "ui/for.png",
  "ui/from.png",
  "ui/game.png",
  "ui/geography.png",
  "ui/give.png",
  "ui/green.png",
  "ui/guest.png",
  "ui/hand.png",
  "ui/have.png",
  "ui/hide.png",
  "ui/home.png",
  "ui/in.png",
  "ui/infrablue.png",
  "ui/join.png",
  "ui/land.png",
  "ui/language.png",
  "ui/leave.png",
  "ui/locate.png",
  "ui/lose.png",
  "ui/mark.png",
  "ui/modify.png",
  "ui/name.png",
  "ui/new.png",
  "ui/no.png",
  "ui/now.png",
  "ui/number.png",
  "ui/opponent.png",
  "ui/orange.png",
  "ui/pair.png",
  "ui/planet.png",
  "ui/player.png",
  "ui/player2.png",
  "ui/real.png",
  "ui/red.png",
  "ui/red2.png",
  "ui/right.png",
  "ui/round.png",
  "ui/score.png",
  "ui/second.png",
  "ui/single.png",
  "ui/share.png",
  "ui/take.png",
  "ui/terran.png",
  "ui/then.png",
  "ui/this.png",
  "ui/title.png",
  "ui/to.png",
  "ui/other.png",
  "ui/white.png",
  "ui/win.png",
  "ui/word.png",
  "ui/yellow.png",
  "ui/yellowgreen.png",
  "ui/yes.png",
  "ui/you.png",
];

export function preloadUrls() {
  return FILES.map((f) => `assets/official/${f}?${ASSET_V}`);
}

function loadOne(url) {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve(url);
    };
    img.onload = () => {
      if (img.decode) {
        img.decode().then(done).catch(done);
      } else {
        done();
      }
    };
    img.onerror = done; // 缺图不卡死首屏
    img.src = url;
  });
}

/**
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function preloadAssets(onProgress) {
  const urls = preloadUrls();
  const total = urls.length;
  let done = 0;
  const report = () => onProgress?.(done, total);

  // 并发限流，避免一次打爆连接池
  const concurrency = 12;
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const url = urls[i++];
      await loadOne(url);
      done += 1;
      report();
    }
  }
  report();
  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => worker())
  );
}
