import {
  elementSvg,
  numberSvg,
  UI,
  alienNumberParts,
  cardFace,
  word,
  publicTakeSentence,
  publicDiscardSentence,
  youGiveSentence,
  opponentTakePublicPrefix,
  opponentTakeDeckPrefix,
  andGiveSuffix,
} from "./icons.js";
import {
  dealNewGame,
  checkWin,
  insertCard,
  discardAt,
  aiChooseSource,
  aiPlay,
} from "./game.js";

/**
 * 12×9 棋盘（顶行留空）
 * 列：0–1 徽章，2–10 九张牌，11 余量
 * 行：0 顶空，1–2 对手，3–6 中区，7–8 玩家
 * 中区：公开牌 col2，接收 col4（中间空 col3），牌堆 col6–10
 * 提示：对手 y3，玩家 y6
 */
const ROWS = 9;
const Y_OPP = 1;
const Y_OPP_INFO = 3;
const Y_MID = 4;
const Y_PLAYER_INFO = 6;
const Y_PLAYER = 7;
const boardEl = document.getElementById("board");
const els = {
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayBody: document.getElementById("overlay-body"),
  btnOverlayOk: document.getElementById("btn-overlay-ok"),
};

/** @type {ReturnType<typeof dealNewGame>} */
let state;
/** @type {{ card: any, source: string, phase: "insert" | "discard" } | null} */
let pending = null;
/** y6：玩家侧提示；y3：对手侧提示 */
let playerInfo = null;
let opponentInfo = null;
/**
 * 对手槽位标记（官方 seven_take / seven_give）
 * taken: 公开牌则显示牌面；暗抽为 null → 显示 new card
 */
let opponentMarks = null;
let busy = false;

/** @type {Record<string, { html: string, className: string, onClick?: Function, tag?: string, disabled?: boolean }>} */
let cells = {};

function key(x, y) {
  return `${x},${y}`;
}

function at(x, y) {
  const k = key(x, y);
  if (!cells[k]) cells[k] = { html: "", className: "" };
  return cells[k];
}

function addClass(x, y, ...names) {
  const cell = at(x, y);
  const set = new Set(
    `${cell.className} ${names.join(" ")}`
      .trim()
      .split(/\s+/)
      .filter(Boolean)
  );
  cell.className = [...set].join(" ");
}

function put(x, y, html, meta = {}) {
  const cell = at(x, y);
  cell.html = html ?? "";
  if (meta.className) {
    addClass(x, y, ...String(meta.className).split(/\s+/).filter(Boolean));
  }
  if (meta.onClick) cell.onClick = meta.onClick;
  if (meta.tag) cell.tag = meta.tag;
  if (meta.disabled != null) cell.disabled = meta.disabled;
  if (meta.rowSpan) cell.rowSpan = meta.rowSpan;
  if (meta.colSpan) cell.colSpan = meta.colSpan;
}

/**
 * 外框只画「牌位」列，徽章区留给 putBadge 一整块，避免和 colSpan 叠格错位
 * 列：badgeCols 列徽章 + 其后到 x1 为 9 个牌位
 */
function frameCards(x0, x1, y0, y1, badgeCols = 2) {
  const firstCard = x0 + badgeCols;
  for (let x = firstCard; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (y === y0) addClass(x, y, "vt");
      if (y === y1) addClass(x, y, "vb");
      if (x === firstCard) addClass(x, y, "vl"); // 首张左边框（徽章区已无竖线）
      addClass(x, y, "vr");
    }
  }
}

/** 左侧 2×2：符号只放左上格，区域内无分界线 */
function putCornerBadge(html, y0) {
  put(0, y0, html, { className: "badge-corner" });
}

function putSentence(glyphs, y) {
  if (!glyphs) return;
  glyphs.forEach((html, i) => {
    if (!html || i > 11) return;
    put(i, y, html, { className: "mid-glyph" });
  });
}

function flush() {
  boardEl.innerHTML = "";
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < 12; x++) {
      const cell = cells[key(x, y)];
      if (!cell) continue;
      const el = document.createElement(cell.tag || "div");
      el.className = `cell ${cell.className}`.trim();
      const cs = cell.colSpan || 1;
      el.style.gridColumn = cs > 1 ? `${x + 1} / span ${cs}` : String(x + 1);
      const span = cell.rowSpan || 1;
      el.style.gridRow = span > 1 ? `${y + 1} / span ${span}` : String(y + 1);
      el.innerHTML = cell.html;
      if (cell.tag === "button") {
        el.type = "button";
        el.disabled = !!cell.disabled;
      }
      if (cell.onClick) {
        el.classList.add("clickable");
        el.addEventListener("click", cell.onClick);
      }
      boardEl.appendChild(el);
    }
  }
}

function canAct() {
  return state.turn === "player" && !pending && !busy && !state.winner && !state.draw;
}
function canDraw() {
  return canAct() && state.deck.length > 0;
}
function canTakePublic() {
  return canAct() && !!state.publicCard;
}

function render() {
  cells = {};

  // 顶行 y0：左 1e1 planet deck，右 leave（第十张牌上方）
  // 对手 y1–2；中区 y3–6；玩家 y7–8
  put(0, 0, UI.title7(), { className: "mid-glyph title-row" });
  put(1, 0, UI.titlePlanet(), { className: "mid-glyph title-row" });
  put(2, 0, UI.deck(), { className: "mid-glyph title-row" });
  put(11, 0, UI.leave(), { className: "mid-glyph title-row" });

  // 胜负：对手第三张牌上方（槽位 index 2 → col 4）
  if (state.winner === "player") {
    put(4, 0, UI.win(), { className: "mid-glyph title-row" });
  } else if (state.winner === "opponent") {
    put(4, 0, UI.lose(), { className: "mid-glyph title-row" });
  }

  frameCards(0, 11, Y_OPP, Y_OPP + 1);
  putCornerBadge(UI.opponent(), Y_OPP);

  /** 对手一整列槽（y1–2） */
  function putOppCol(x, topHtml, botHtml) {
    put(
      x,
      Y_OPP,
      `<div class="stack stack-2">${topHtml}${botHtml || ""}</div>`,
      {
        className: "card-slot tall vt vb vr",
        rowSpan: 2,
      }
    );
    delete cells[key(x, Y_OPP + 1)];
  }

  if (state.winner === "opponent") {
    // 对手获胜：亮出从左到右九张牌
    state.opponent.forEach((card, i) => {
      putOppCol(i + 2, elementSvg(card.element), numberSvg(card.number));
    });
  } else if (opponentMarks) {
    // 对手行动后：拿牌位显示公开牌面 / new card，弃牌位显示 give
    const { takeAt, giveAt, taken } = opponentMarks;
    if (takeAt >= 0 && takeAt <= 9) {
      if (taken) {
        putOppCol(
          takeAt + 2,
          elementSvg(taken.element),
          numberSvg(taken.number)
        );
      } else {
        putOppCol(takeAt + 2, word("new"), word("card"));
      }
    }
    if (giveAt >= 0 && giveAt <= 9 && giveAt !== takeAt) {
      putOppCol(giveAt + 2, word("give"), "");
    }
  }

  // 公开区：仅公开牌（暗抽的牌不放这里，对手看不到）
  // 接受公开牌插入中：公开区仍显示刚拿走的那张（本来就公开）
  const publicShow =
    pending?.source === "public" && pending.phase === "insert"
      ? pending.card
      : state.publicCard;
  const takePub = canTakePublic();
  put(
    2,
    Y_MID,
    `<div class="stack stack-2">${
      publicShow ? elementSvg(publicShow.element) : ""
    }${publicShow ? numberSvg(publicShow.number) : ""}</div>`,
    {
      className: "box tall",
      rowSpan: 2,
      onClick: takePub ? () => takePublic() : null,
    }
  );

  // 第二个选项（接收）：暗抽后只在玩家侧显示抽到的牌
  const drawOk = canDraw();
  const secretDraw =
    pending?.source === "deck" && pending.card ? pending.card : null;
  put(
    4,
    Y_MID,
    secretDraw
      ? `<div class="stack stack-2">${elementSvg(secretDraw.element)}${numberSvg(
          secretDraw.number
        )}</div>`
      : `<div class="stack stack-2">${UI.receive()}${UI.cardMark()}</div>`,
    secretDraw
      ? { className: "box tall", rowSpan: 2 }
      : {
          className: "box tall",
          tag: "button",
          rowSpan: 2,
          disabled: !drawOk,
          onClick: () => takeDeck(),
        }
  );

  const deckGlyphs = [
    UI.deck(),
    UI.have(),
    ...alienNumberParts(state.deck.length).map(
      (p) =>
        `<img class="glyph sq" src="assets/official/numbers/${p.file}.png?v17" alt="" draggable="false" />`
    ),
    UI.cardMark(),
  ];
  deckGlyphs.forEach((html, i) => {
    const x = 6 + i;
    if (x <= 10) put(x, Y_MID, html, { className: "mid-glyph", rowSpan: 2 });
  });

  // 对手提示 y3；玩家提示 y6
  putSentence(opponentInfo, Y_OPP_INFO);
  if (pending?.phase === "insert" && pending.card) {
    putSentence(publicTakeSentence(pending.card), Y_PLAYER_INFO);
  } else if (pending?.phase === "discard" && pending.card) {
    putSentence(publicDiscardSentence(pending.card), Y_PLAYER_INFO);
  } else {
    putSentence(playerInfo, Y_PLAYER_INFO);
  }

  frameCards(0, 11, Y_PLAYER, Y_PLAYER + 1);
  putCornerBadge(UI.playerMark(), Y_PLAYER);

  /** 一整列牌：上下两符同一按钮，高亮整张 */
  function putCardCol(x, topHtml, botHtml, onClick) {
    put(
      x,
      Y_PLAYER,
      `<div class="stack stack-2">${topHtml}${botHtml}</div>`,
      {
        className: "card-slot tall vt vb vr",
        tag: onClick ? "button" : "div",
        rowSpan: 2,
        onClick: onClick || undefined,
      }
    );
    delete cells[key(x, Y_PLAYER + 1)];
  }

  if (pending?.phase === "insert") {
    state.player.forEach((card, i) => {
      putCardCol(
        i + 2,
        elementSvg(card.element),
        numberSvg(card.number),
        () => chooseInsert(i)
      );
    });
    putCardCol(11, word("join"), word("right"), () => chooseInsert(9));
  } else if (pending?.phase === "discard") {
    state.player.forEach((card, i) => {
      putCardCol(
        i + 2,
        elementSvg(card.element),
        numberSvg(card.number),
        () => chooseDiscard(i)
      );
    });
  } else {
    state.player.forEach((card, i) => {
      putCardCol(i + 2, elementSvg(card.element), numberSvg(card.number));
    });
  }

  flush();
  els.btnOverlayOk.innerHTML = UI.title7();
}

function takePublic() {
  if (!canTakePublic()) return;
  beginPending(state.publicCard, "public");
}
function takeDeck() {
  if (!canDraw()) return;
  beginPending(state.deck.shift(), "deck");
}
function beginPending(card, source) {
  if (source === "public") state.publicCard = null;
  playerInfo = null;
  pending = { card, source, phase: "insert" };
  render();
}
/** 插入：点中的位置放入新牌，该位及右侧右移一格 → 手牌 10 张 */
function chooseInsert(insertAt) {
  if (!pending || pending.phase !== "insert" || busy) return;
  state.player = insertCard(state.player, pending.card, insertAt);
  // 保留 card：弃牌阶段仍显示 you take [牌]；暗抽时接收格继续给玩家看牌
  pending = { card: pending.card, source: pending.source, phase: "discard" };
  render();
}
/** 从 10 张里打出一张 → you give [牌]，公共区显示该牌，再进入对手回合 */
function chooseDiscard(index) {
  if (!pending || pending.phase !== "discard" || busy) return;
  const { hand, discarded } = discardAt(state.player, index);
  state.player = hand;
  state.publicCard = discarded;
  pending = null;
  playerInfo = youGiveSentence(discarded);

  const result = checkWin(state.player);
  if (result.win) {
    state.winner = "player";
    render();
    showOverlay(UI.playerMark(), formatMelds(state.player, result.melds));
    return;
  }
  if (state.deck.length === 0) {
    state.draw = true;
    render();
    showOverlay(numberSvg(0), "");
    return;
  }
  state.turn = "opponent";
  render();
  setTimeout(runOpponentTurn, 450);
}

function formatMelds(hand, melds) {
  return melds
    .map((m) => {
      const cards = hand
        .slice(m.start, m.end + 1)
        .map((c) => `<div class="meld-card">${cardFace(c)}</div>`)
        .join("");
      return `<div class="meld-row">${cards}</div>`;
    })
    .join("");
}

async function runOpponentTurn() {
  if (state.winner || state.draw) return;
  busy = true;
  opponentMarks = null;
  render();
  await wait(400);

  let source = aiChooseSource(state);
  if (source === "deck" && state.deck.length === 0) source = "public";
  if (source === "public" && !state.publicCard) source = "deck";
  if (source === "deck" && state.deck.length === 0) {
    state.draw = true;
    busy = false;
    render();
    showOverlay(numberSvg(0), "");
    return;
  }

  let taken;
  if (source === "public") {
    taken = state.publicCard;
    state.publicCard = null;
    opponentInfo = opponentTakePublicPrefix();
  } else {
    taken = state.deck.shift();
    opponentInfo = opponentTakeDeckPrefix();
  }
  render();
  await wait(750);

  // AI 算完整步：槽位标记 + and give [牌]
  const play = aiPlay(state, taken);
  state.opponent = play.hand;
  state.publicCard = play.discarded;
  opponentMarks = {
    takeAt: play.takeAt,
    giveAt: play.giveAt,
    // 公开拿牌：显示那张牌；暗抽：对手视角未知 → new card
    taken: source === "public" ? taken : null,
  };
  opponentInfo = [...opponentInfo, ...andGiveSuffix(play.discarded)];
  render();
  await wait(750);

  if (play.wins) {
    state.winner = "opponent";
    busy = false;
    render();
    showOverlay(
      UI.player2Mark(),
      formatMelds(state.opponent, checkWin(state.opponent).melds)
    );
    return;
  }
  if (state.deck.length === 0) {
    state.draw = true;
    busy = false;
    render();
    showOverlay(numberSvg(0), "");
    return;
  }
  state.turn = "player";
  busy = false;
  render();
}

function showOverlay(titleHtml, bodyHtml) {
  els.overlay.hidden = false;
  els.overlayTitle.innerHTML = titleHtml;
  els.overlayBody.innerHTML = bodyHtml || "";
}
function hideOverlay() {
  els.overlay.hidden = true;
}
function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function restart() {
  hideOverlay();
  state = dealNewGame();
  pending = null;
  playerInfo = null;
  opponentInfo = null;
  opponentMarks = null;
  busy = false;
  render();
}

els.btnOverlayOk.addEventListener("click", restart);
restart();
