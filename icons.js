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

import { ASSET_V } from "./preload.js";

const V = ASSET_V; // cache bust: --glyph-mask 与尺寸变量分离；与 preload 共用

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 字形用 mask + --line 上色；
 * label：地球人语言（英文），由 html.hide-terran 控制显隐
 */
function sq(src, label) {
  const url = src.includes("?") ? `${src}&${V}` : `${src}?${V}`;
  const lab = label == null || label === "" ? "" : String(label);
  const glyph = `<span class="glyph sq" style="--glyph-mask:url('${url}')" role="img"${
    lab ? ` aria-label="${escapeHtml(lab)}"` : ""
  }></span>`;
  if (!lab) return glyph;
  return `<span class="glyph-stack">${glyph}<span class="terran-lang">${escapeHtml(
    lab
  )}</span></span>`;
}

/** 英文词 → 官方字形（ParseString / DrawACToSlot） */
export function word(name) {
  return sq(`assets/official/ui/${name}.png`, name);
}

export function elementSvg(id) {
  // 旧 id terrain = 地球；图标用 earth.png 横框
  const file = id === "terrain" ? "earth" : id;
  return sq(`assets/official/elements/${file}.png`, file);
}

/** 牌面点数 1–7；7 用 1e1 */
export function numberSvg(n) {
  const v = Number(n);
  if (v === 7) return sq("assets/official/numbers/1e1.png", "7");
  return sq(`assets/official/numbers/n${v}.png`, String(v));
}

/** 专符 → 地球人数字：1e1=7, 2e1=14, 3e1=21, 4e1=28 */
const E1_LABELS = { "1e1": "7", "2e1": "14", "3e1": "21", "4e1": "28" };

export function numberFileGlyph(file, label) {
  const f = String(file).replace(/\.png$/i, "");
  const lab =
    label != null
      ? String(label)
      : E1_LABELS[f] ?? f.replace(/^n/, "");
  return sq(`assets/official/numbers/${f}.png`, lab);
}

export function alienNumberGlyphs(n) {
  return alienNumberParts(n)
    .map((p) => numberFileGlyph(p.file, String(p.value)))
    .join("");
}

export function cardFace(card) {
  return `${elementSvg(card.element)}${numberSvg(card.number)}`;
}

function ui(file, label) {
  const name = label ?? String(file).replace(/\.png$/i, "");
  return sq(`assets/official/ui/${file}`, name);
}

export const UI = {
  title7: () => sq("assets/official/numbers/1e1.png", "7"),
  titlePlanet: () => ui("planet.png", "planet"),
  titleCard: () => ui("card.png", "card"),
  /** 地球：文件夹 earth.png 横框符（词条用，不是玩家徽章） */
  earth: () => ui("earth.png", "earth"),
  /** 玩家：player.png */
  playerMark: () => ui("player.png", "player"),
  /** 玩家二 / 对手：opponent.png（玩家符 + * + ||） */
  player2Mark: () => ui("opponent.png", "opponent"),
  opponent: () => ui("opponent.png", "opponent"),
  receive: () => ui("draw.png", "draw"),
  deck: () => ui("deck.png", "deck"),
  have: () => ui("have.png", "have"),
  twoBars: () => sq("assets/official/numbers/n2.png", "2"),
  cardMark: () => ui("card.png", "card"),
  win: () => ui("win.png", "win"),
  fail: () => ui("fail.png", "fail"),
  leave: () => ui("leave.png", "leave"),
  again: () => ui("again.png", "again"),
  mark: () => ui("mark.png", "mark"),
  modify: () => ui("modify.png", "modify"),
  single: () => ui("single.png", "single"),
  pair: () => ui("pair.png", "pair"),
  game: () => ui("game.png", "game"),
  /** 词条 player（菜单用）；徽章仍用 playerMark */
  playerWord: () => ui("player.png", "player"),
  word: () => ui("word.png", "word"),
  color: () => ui("color.png", "color"),
  hide: () => ui("hide.png", "hide"),
  terran: () => ui("terran.png", "terran"),
  language: () => ui("language.png", "language"),
  yes: () => ui("yes.png", "yes"),
  no: () => ui("no.png", "no"),
  create: () => ui("create.png", "create"),
  join: () => ui("join.png", "join"),
  enter: () => ui("enter.png", "enter"),
  click: () => ui("click.png", "click"),
  for: () => ui("for.png", "for"),
  copy: () => ui("copy.png", "copy"),
  then: () => ui("then.png", "then"),
  share: () => ui("share.png", "share"),
  to: () => ui("to.png", "to"),
  other: () => ui("other.png", "other"),
  /** 房主：无 host 符，用 home */
  home: () => ui("home.png", "home"),
  guest: () => ui("guest.png", "guest"),
  first: () => ui("first.png", "first"),
  second: () => ui("second.png", "second"),
  score: () => ui("score.png", "score"),
  now: () => ui("now.png", "now"),
  action: () => ui("action.png", "action"),
  do: () => ui("do.png", "do"),
  round: () => ui("round.png", "round"),
};

/** modify game */
export function modifyGameGlyphs() {
  return [UI.modify(), UI.game()].join("");
}

/** opponent leave（多人：对手离开） */
export function opponentLeaveGlyphs() {
  return [UI.opponent(), UI.leave()].join("");
}

/** word color */
export function wordColorGlyphs() {
  return [UI.word(), UI.color()].join("");
}

/** hide terran language */
export function hideTerranLanguageGlyphs() {
  return [UI.hide(), UI.terran(), UI.language()].join("");
}

/** 当前配色名对应字形 */
export function colorSwatchGlyph(colorId) {
  return word(colorId);
}

/** 主界面大标题：1e1 planet card */
export function menuTitleGlyphs() {
  return [UI.title7(), UI.titlePlanet(), UI.titleCard()].join("");
}

/** single player game */
export function singlePlayerGlyphs() {
  return [UI.single(), UI.playerWord(), UI.game()].join("");
}

/** pair player game */
export function twoPlayerGlyphs() {
  return [UI.pair(), UI.playerWord(), UI.game()].join("");
}

/** you de name be */
export function youNameBeGlyphs() {
  return [word("you"), word("de"), word("name"), word("be")].join("");
}

/** create */
export function createRoomGlyphs() {
  return UI.create();
}

/** join */
export function joinRoomGlyphs() {
  return UI.join();
}

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

/** 轮到你行动：now you do round */
export function turnYouActionSentence() {
  return [word("now"), word("you"), word("do"), word("round")];
}

/** 轮到对手行动：now opponent do round */
export function turnOpponentActionSentence() {
  return [word("now"), word("opponent"), word("do"), word("round")];
}
