/** 官方解包符号（透明底 + 琥珀色描线，100×100） */

export const ELEMENTS = [
  { id: "fire", name: "火" },
  { id: "metal", name: "金属" },
  { id: "water", name: "水" },
  { id: "warm", name: "温暖的" },
  { id: "ice", name: "冰" },
  { id: "kelp", name: "海带" },
  { id: "earth", name: "地球" },
];

/**
 * 外星计数：7/14/21/28 对应专符 1e1/2e1/3e1/4e1
 * 例：20 → 14 + 6 → 2e1 + 6
 */
const ALIEN_SPECIALS = [
  { value: 28, file: "4e1" },
  { value: 21, file: "3e1" },
  { value: 14, file: "2e1" },
  { value: 7, file: "1e1" },
];

export function alienNumberParts(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  if (v === 0) return [{ value: 0, file: "n0" }];
  const parts = [];
  let rest = v;
  for (const s of ALIEN_SPECIALS) {
    while (rest >= s.value) {
      parts.push(s);
      rest -= s.value;
    }
  }
  if (rest > 0) parts.push({ value: rest, file: `n${rest}` });
  return parts;
}

const V = "v20"; // cache bust: win/lose glyphs

function sq(src) {
  const url = src.includes("?") ? `${src}&${V}` : `${src}?${V}`;
  return `<img class="glyph sq" src="${url}" alt="" draggable="false" />`;
}

/** 英文词 → 官方琥珀色字形（ParseString / DrawACToSlot） */
export function word(name) {
  return sq(`assets/official/ui/${name}.png`);
}

export function elementSvg(id) {
  // 旧 id terrain = 地球；图标用 earth.png 横框
  const file = id === "terrain" ? "earth" : id;
  return sq(`assets/official/elements/${file}.png`);
}

/** 牌面点数 1–7；7 用 1e1 */
export function numberSvg(n) {
  const v = Number(n);
  if (v === 7) return sq("assets/official/numbers/1e1.png");
  return sq(`assets/official/numbers/n${v}.png`);
}

export function alienNumberGlyphs(n) {
  return alienNumberParts(n)
    .map((p) => sq(`assets/official/numbers/${p.file}.png`))
    .join("");
}

export function cardFace(card) {
  return `${elementSvg(card.element)}${numberSvg(card.number)}`;
}

function ui(file) {
  return sq(`assets/official/ui/${file}`);
}

export const UI = {
  title7: () => sq("assets/official/numbers/1e1.png"),
  titlePlanet: () => ui("planet.png"),
  titleCard: () => ui("card.png"),
  /** 地球：文件夹 earth.png 横框符（词条用，不是玩家徽章） */
  earth: () => ui("earth.png"),
  /** 玩家：player.png */
  playerMark: () => ui("player.png"),
  /** 玩家二 / 对手：opponent.png（玩家符 + * + ||） */
  player2Mark: () => ui("opponent.png"),
  opponent: () => ui("opponent.png"),
  receive: () => ui("draw.png"),
  deck: () => ui("deck.png"),
  have: () => ui("have.png"),
  twoBars: () => sq("assets/official/numbers/n2.png"),
  cardMark: () => ui("card.png"),
  win: () => ui("win.png"),
  lose: () => ui("lose.png"),
  leave: () => ui("leave.png"),
};

function cardWords(card) {
  return [elementSvg(card.element), numberSvg(card.number)];
}

/** you take [牌] */
export function youTakePrefix(card) {
  return [word("you"), word("take"), ...cardWords(card)];
}

/** 空格 + locate this in hand card */
export function locateSuffix() {
  return [null, word("locate"), word("this"), word("in"), word("hand"), word("card")];
}

/** 空格 + give 1 card from hand card（替换后半句） */
export function giveFromHandSuffix() {
  return [
    null,
    word("give"),
    numberSvg(1),
    word("card"),
    word("from"),
    word("hand"),
    word("card"),
  ];
}

/** 插入阶段：you take [牌]  locate this in hand card */
export function publicTakeSentence(card) {
  return [...youTakePrefix(card), ...locateSuffix()];
}

/** 弃牌阶段：you take [牌]  give 1 card from hand card */
export function publicDiscardSentence(card) {
  return [...youTakePrefix(card), ...giveFromHandSuffix()];
}

/** 玩家弃牌后：you give [牌] */
export function youGiveSentence(card) {
  return [word("you"), word("give"), ...cardWords(card)];
}

/** 对手拿公开牌（你刚打出的）：opponent take you give de card */
export function opponentTakePublicPrefix() {
  return [
    word("opponent"),
    word("take"),
    word("you"),
    word("give"),
    word("de"),
    word("card"),
  ];
}

/** 对手摸牌堆：opponent take deck de card */
export function opponentTakeDeckPrefix() {
  return [
    word("opponent"),
    word("take"),
    word("deck"),
    word("de"),
    word("card"),
  ];
}

/** 空格 + and give [牌] */
export function andGiveSuffix(card) {
  return [null, word("and"), word("give"), ...cardWords(card)];
}
