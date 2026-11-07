import {
  elementSvg,
  numberSvg,
  UI,
  alienNumberParts,
  numberFileGlyph,
  cardFace,
  word,
  publicTakeSentence,
  publicDiscardSentence,
  youGiveSentence,
  opponentTakePublicPrefix,
  opponentTakeDeckPrefix,
  andGiveSuffix,
  menuTitleGlyphs,
  singlePlayerGlyphs,
  twoPlayerGlyphs,
  youNameBeGlyphs,
  createRoomGlyphs,
  joinRoomGlyphs,
  modifyGameGlyphs,
  opponentLeaveGlyphs,
  colorSwatchGlyph,
  turnYouActionSentence,
  turnOpponentActionSentence,
} from "./icons.js?v=40";
import {
  dealNewGame,
  checkWin,
  insertCard,
  discardAt,
  aiChooseSource,
  aiPlay,
  dealNetGame,
  applyNetAction,
  netToLocalView,
} from "./game.js?v=34";
import {
  settings,
  WORD_COLORS,
  loadSettings,
  applySettings,
  setWordColor,
  setHideTerran,
  setPlayerName,
} from "./settings.js?v=34";
import { createRoomCode, connectRoom } from "./net.js?v=34";

/**
 * 12×9 棋盘（顶行留空）
 * 列：0–1 徽章，2–10 九张牌，11 余量
 * 行：0 顶空，1–2 对手，3–6 中区，7–8 玩家
 * 中区：公开牌 col2，接收 col4（中间空 col3），牌堆 col6–10
 * 提示：对手 y3，玩家 y6；回合提示在牌堆下方 y5 col6–
 */
const ROWS = 9;
const Y_OPP = 1;
const Y_OPP_INFO = 3;
const Y_MID = 4;
const Y_TURN_INFO = 5;
const X_DECK = 6;
const Y_PLAYER_INFO = 6;
const Y_PLAYER = 7;
const boardEl = document.getElementById("board");
const settingsBoardEl = document.getElementById("settings-board");
const roomBoardEl = document.getElementById("room-board");
const els = {
  menu: document.getElementById("menu"),
  game: document.getElementById("game"),
  settings: document.getElementById("settings"),
  menuTitle: document.getElementById("menu-title"),
  menuNameGlyphs: document.getElementById("menu-name-glyphs"),
  playerName: document.getElementById("player-name"),
  menuModifyGlyphs: document.getElementById("menu-modify-glyphs"),
  btnMenuModify: document.getElementById("btn-menu-modify"),
  choiceSingle: document.getElementById("choice-single"),
  choiceTwo: document.getElementById("choice-two"),
  btnSingle: document.getElementById("btn-single"),
  btnTwo: document.getElementById("btn-two"),
  room: document.getElementById("room"),
  /** 房间码输入（renderRoom 后挂到棋盘格内） */
  roomInput: null,
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayBody: document.getElementById("overlay-body"),
  btnOverlayOk: document.getElementById("btn-overlay-ok"),
};

/** @type {"menu" | "game" | "settings" | "room"} */
let screen = "menu";
/** 进入设置前的界面，leave 时返回 */
let settingsReturn = "menu";
/** @type {"single" | "two"} */
let gameMode = "single";
/** 多人：对手已离开 */
let opponentLeft = false;
/** @type {ReturnType<typeof connectRoom> | null} */
let netLink = null;
/** @type {"host" | "guest" | null} */
let netRole = null;
/** @type {0 | 1 | null} */
let netSeat = null;
/** 主机权威状态（双人） */
let netState = null;
/** 准备房间状态 */
let lobby = {
  /** @type {"entry" | "waiting"} */
  phase: "entry",
  code: "",
  peerPresent: false,
  /** @type {[boolean, boolean]} */
  ready: [false, false],
  /** @type {[string, string]} */
  names: ["", ""],
  /** 先手座位 0|1（默认房主） */
  firstSeat: 0,
};
/** @type {ReturnType<typeof dealNewGame>} */
let state;
/** @type {{ card: any, source: string, phase: "insert" | "discard" } | null} */
let pending = null;
/** y6：玩家侧提示；y3：对手侧提示 */
let playerInfo = null;
let opponentInfo = null;
/** 本局连胜积分（again 保留，回菜单清零） */
let matchScore = { player: 0, opponent: 0 };
let scoredThisRound = false;
/** 多人局末：双方座位是否已点 again */
let roundAgain = [false, false];
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

/** 判定框只包符号 .sq（与普通符号同尺寸）；on=选中描边 */
function hitGlyphs(html, on = false) {
  const cls = on ? "glyph-hit on" : "glyph-hit";
  return String(html ?? "").replace(
    /(<span class="glyph sq"[^>]*><\/span>)/g,
    `<span class="${cls}">$1</span>`
  );
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

function escapeText(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 徽章字形 + 正下方玩家名 */
function badgeWithName(glyphHtml, name) {
  const n = String(name ?? "").trim();
  if (!n) return glyphHtml;
  return `<div class="badge-named">${glyphHtml}<span class="badge-name">${escapeText(
    n
  )}</span></div>`;
}

function opponentDisplayName() {
  if (gameMode !== "two" || netSeat == null) return "";
  const other = 1 - netSeat;
  const n = lobby.names?.[other];
  return n && String(n).trim() ? String(n).trim() : "";
}

/** 左侧 2×2：上格徽章，下两格 ....score */
function putCornerBadge(html, y0) {
  put(0, y0, html, { className: "badge-corner" });
}

function putBadgeScore(y0, score) {
  const n = Math.max(0, Math.floor(Number(score) || 0));
  // 下两格：左格数字、右格 score，与其它棋盘格同尺寸
  const parts = alienNumberParts(n);
  const numHtml =
    parts.length === 1
      ? numberFileGlyph(parts[0].file, String(parts[0].value))
      : `<div class="badge-score-nums">${parts
          .map((p) => numberFileGlyph(p.file, String(p.value)))
          .join("")}</div>`;
  put(0, y0 + 1, numHtml, { className: "mid-glyph badge-score" });
  put(1, y0 + 1, UI.score(), { className: "mid-glyph badge-score" });
}

function creditWin(side) {
  if (scoredThisRound) return;
  scoredThisRound = true;
  if (side === "player") matchScore.player += 1;
  else matchScore.opponent += 1;
}

function resetMatchScore() {
  matchScore = { player: 0, opponent: 0 };
  scoredThisRound = false;
}

function putSentence(glyphs, y) {
  if (!glyphs) return;
  glyphs.forEach((html, i) => {
    if (!html || i > 11) return;
    put(i, y, html, { className: "mid-glyph" });
  });
}

function flushTo(target) {
  target.innerHTML = "";
  const skip = new Set();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < 12; x++) {
      const k = key(x, y);
      if (skip.has(k)) continue;
      const cell = cells[k];
      if (!cell) continue;
      const el = document.createElement(cell.tag || "div");
      el.className = `cell ${cell.className}`.trim();
      const cs = cell.colSpan || 1;
      const rs = cell.rowSpan || 1;
      el.style.gridColumn = cs > 1 ? `${x + 1} / span ${cs}` : String(x + 1);
      el.style.gridRow = rs > 1 ? `${y + 1} / span ${rs}` : String(y + 1);
      for (let dy = 0; dy < rs; dy++) {
        for (let dx = 0; dx < cs; dx++) {
          if (dx || dy) skip.add(key(x + dx, y + dy));
        }
      }
      el.innerHTML = cell.html;
      if (cell.tag === "button") {
        el.type = "button";
        el.disabled = !!cell.disabled;
      }
      if (cell.onClick) {
        el.classList.add("clickable");
        el.addEventListener("click", cell.onClick);
      }
      target.appendChild(el);
    }
  }
}

function flush() {
  flushTo(boardEl);
}

function canAct() {
  return (
    state.turn === "player" &&
    !pending &&
    !busy &&
    !state.winner &&
    !state.draw &&
    !opponentLeft
  );
}
function canDraw() {
  return canAct() && state.deck.length > 0;
}
function canTakePublic() {
  return canAct() && !!state.publicCard;
}

function render() {
  cells = {};

  // 顶行 y0：左 1e1 planet deck；第 8 张上方 again；右 leave
  put(0, 0, UI.title7(), { className: "mid-glyph title-row" });
  put(1, 0, UI.titlePlanet(), { className: "mid-glyph title-row" });
  put(2, 0, UI.deck(), { className: "mid-glyph title-row" });
  if (gameMode === "single") {
    put(9, 0, hitGlyphs(UI.again()), {
      className: "mid-glyph title-row",
      tag: "button",
      onClick: () => restartRound(),
    });
  } else if (
    gameMode === "two" &&
    roundIsEnded() &&
    !opponentLeft &&
    netSeat != null
  ) {
    put(9, 0, hitGlyphs(UI.again(), !!roundAgain[netSeat]), {
      className: "mid-glyph title-row",
      tag: "button",
      onClick: () => requestAgain(),
    });
  }
  put(11, 0, hitGlyphs(UI.leave()), {
    className: "mid-glyph title-row",
    tag: "button",
    onClick: () => leaveGame(),
  });

  // 多人：对手离开 → 第 3–4 张上方 opponent leave（1×2）
  // 否则胜负：第三张上方 win / fail
  if (opponentLeft) {
    put(4, 0, opponentLeaveGlyphs(), {
      className: "mid-glyph title-row modify-game",
      colSpan: 2,
    });
  } else if (state.winner === "player") {
    put(4, 0, UI.win(), { className: "mid-glyph title-row" });
  } else if (state.winner === "opponent") {
    put(4, 0, UI.fail(), { className: "mid-glyph title-row" });
  }

  frameCards(0, 11, Y_OPP, Y_OPP + 1);
  putCornerBadge(
    badgeWithName(UI.opponent(), opponentDisplayName() || "opponent"),
    Y_OPP
  );
  if (
    gameMode === "two" &&
    netSeat != null &&
    roundAgain[1 - netSeat]
  ) {
    put(1, Y_OPP, UI.again(), { className: "mid-glyph" });
  }
  putBadgeScore(Y_OPP, matchScore.opponent);

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
    ...alienNumberParts(state.deck.length).map((p) =>
      numberFileGlyph(p.file, String(p.value))
    ),
    UI.cardMark(),
  ];
  // 牌堆信息：y4 单行（不跨行）
  deckGlyphs.forEach((html, i) => {
    const x = X_DECK + i;
    if (x <= 10) put(x, Y_MID, html, { className: "mid-glyph" });
  });

  // 对手提示 y3；拿牌/弃牌提示 y6；牌堆下方 y5：回合 / you win|fail
  putSentence(opponentInfo, Y_OPP_INFO);
  if (pending?.phase === "insert" && pending.card) {
    putSentence(publicTakeSentence(pending.card), Y_PLAYER_INFO);
  } else if (pending?.phase === "discard" && pending.card) {
    putSentence(publicDiscardSentence(pending.card), Y_PLAYER_INFO);
  } else if (playerInfo) {
    putSentence(playerInfo, Y_PLAYER_INFO);
  }

  let underDeck = null;
  if (state.winner === "player") {
    underDeck = [word("you"), word("win")];
  } else if (state.winner === "opponent") {
    underDeck = [word("you"), word("fail")];
  } else if (!state.draw && !opponentLeft) {
    underDeck =
      state.turn === "player"
        ? turnYouActionSentence()
        : turnOpponentActionSentence();
  }
  underDeck?.forEach((html, i) => {
    if (!html) return;
    const x = X_DECK + i;
    if (x <= 11) put(x, Y_TURN_INFO, html, { className: "mid-glyph" });
  });

  frameCards(0, 11, Y_PLAYER, Y_PLAYER + 1);
  putCornerBadge(badgeWithName(UI.playerMark(), localPlayerName()), Y_PLAYER);
  if (gameMode === "two" && netSeat != null && roundAgain[netSeat]) {
    put(1, Y_PLAYER, UI.again(), { className: "mid-glyph" });
  }
  putBadgeScore(Y_PLAYER, matchScore.player);

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
  if (gameMode === "two") {
    dispatchNetAction({ type: "take", source: "public" });
    return;
  }
  beginPending(state.publicCard, "public");
}
function takeDeck() {
  if (!canDraw()) return;
  if (gameMode === "two") {
    dispatchNetAction({ type: "take", source: "deck" });
    return;
  }
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
  if (gameMode === "two") {
    dispatchNetAction({ type: "insert", index: insertAt });
    return;
  }
  state.player = insertCard(state.player, pending.card, insertAt);
  // 保留 card：弃牌阶段仍显示 you take [牌]；暗抽时接收格继续给玩家看牌
  pending = { card: pending.card, source: pending.source, phase: "discard" };
  render();
}
/** 从 10 张里打出一张 → you give [牌]，公共区显示该牌，再进入对手回合 */
function chooseDiscard(index) {
  if (!pending || pending.phase !== "discard" || busy) return;
  if (gameMode === "two") {
    dispatchNetAction({ type: "discard", index });
    return;
  }
  const { hand, discarded } = discardAt(state.player, index);
  state.player = hand;
  state.publicCard = discarded;
  pending = null;
  playerInfo = youGiveSentence(discarded);

  const result = checkWin(state.player);
  if (result.win) {
    state.winner = "player";
    creditWin("player");
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
  // 双人联机：对手由另一标签操作，禁止本机 AI
  if (gameMode === "two") return;
  if (state.winner || state.draw || opponentLeft) return;
  busy = true;
  opponentMarks = null;
  render();
  await wait(400);
  if (opponentLeft) {
    busy = false;
    render();
    return;
  }

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
  if (opponentLeft) {
    busy = false;
    render();
    return;
  }

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
  if (opponentLeft) {
    busy = false;
    render();
    return;
  }

  if (play.wins) {
    state.winner = "opponent";
    creditWin("opponent");
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
  playerInfo = null;
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
function hideAllScreens() {
  els.menu.hidden = true;
  els.game.hidden = true;
  els.settings.hidden = true;
  if (els.room) els.room.hidden = true;
}

function closeNetLink() {
  if (!netLink) return;
  try {
    netLink.close();
  } catch {
    /* ignore */
  }
  netLink = null;
  netRole = null;
  netSeat = null;
  netState = null;
}

function roomShareHint() {
  return `share link + code · tap code / copy`;
}

async function copyRoomCode() {
  const code = String(lobby.code || "").trim();
  if (!code) return;
  let ok = false;
  try {
    await navigator.clipboard.writeText(code);
    ok = true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      document.body.removeChild(ta);
    } catch {
      ok = false;
    }
  }
  lobby._copyHint = ok
    ? `copied ${code} · share ${location.origin}`
    : "copy failed — select code manually";
  renderRoom();
  clearTimeout(copyRoomCode._t);
  copyRoomCode._t = setTimeout(() => {
    lobby._copyHint = "";
    if (lobby.phase === "waiting") renderRoom();
  }, 1600);
}

function localPlayerName() {
  return String(settings.playerName || "").trim() || "you";
}

function resetLobby() {
  lobby = {
    phase: "entry",
    code: "",
    peerPresent: false,
    ready: [false, false],
    names: ["", ""],
    firstSeat: 0,
    _copyHint: "",
    _entryHint: "",
  };
}

function seatDisplayName(seat) {
  const filled =
    seat === netSeat || (lobby.peerPresent && seat !== netSeat && netSeat != null);
  if (!filled) return "";
  if (seat === netSeat) return localPlayerName();
  const n = lobby.names?.[seat];
  return n && String(n).trim() ? String(n).trim() : "";
}

function seatFilled(seat) {
  return (
    seat === netSeat ||
    (lobby.peerPresent && netSeat != null && seat !== netSeat)
  );
}

/** 点某座位 → 该座位成为先手；改顺序会清 ready（主机权威） */
function setFirstSeat(seat) {
  if (lobby.phase !== "waiting") return;
  const next = seat === 1 ? 1 : 0;
  if (netRole !== "host") {
    if (!lobby.peerPresent) return;
    netLink?.send({ type: "first", seat: next });
    return;
  }
  if (lobby.firstSeat === next) return;
  lobby.firstSeat = next;
  lobby.ready = [false, false];
  renderRoom();
  broadcastLobby();
}

function renderRoom() {
  if (!els.room || !roomBoardEl) return;
  cells = {};

  const inRoom = lobby.phase === "waiting";
  const firstSeat = lobby.firstSeat === 1 ? 1 : 0;
  const canPick =
    inRoom && netSeat != null && (netRole === "host" || lobby.peerPresent);
  if (netSeat != null && inRoom) {
    lobby.names[netSeat] = localPlayerName();
  }

  // 顶行：标题 | leave（与设置页同款 mid-glyph 落格）
  put(0, 0, UI.pair(), { className: "mid-glyph title-row" });
  put(1, 0, UI.playerWord(), { className: "mid-glyph title-row" });
  put(2, 0, UI.game(), { className: "mid-glyph title-row" });
  put(11, 0, hitGlyphs(UI.leave()), {
    className: "mid-glyph title-row",
    tag: "button",
    onClick: () => leaveRoomScreen(),
  });

  // y2：左右座位 —— home/player/first …… guest/opponent/second
  function putSeat(seat, x0) {
    const isFirst = firstSeat === seat;
    const order = isFirst ? UI.first() : UI.second();
    const dim = inRoom && !seatFilled(seat) ? " room-seat-dim" : "";

    put(x0, 2, seat === 0 ? UI.home() : UI.guest(), {
      className: `mid-glyph${dim}`,
    });
    put(x0 + 1, 2, seat === 0 ? UI.playerMark() : UI.player2Mark(), {
      className: `mid-glyph${dim}`,
    });
    put(x0 + 2, 2, canPick ? hitGlyphs(order, isFirst) : order, {
      className: `mid-glyph${dim}`,
      tag: canPick ? "button" : "div",
      onClick: canPick ? () => setFirstSeat(seat) : undefined,
    });

    const name = seatDisplayName(seat);
    if (inRoom && seatFilled(seat) && lobby.ready[seat]) {
      put(x0 + 1, 3, UI.yes(), { className: "mid-glyph" });
    } else if (name) {
      put(
        x0 + 1,
        3,
        `<span class="room-name-cell">${escapeText(name)}</span>`,
        { className: "mid-glyph" }
      );
    }
  }

  putSeat(0, 1);
  putSeat(1, 8);

  if (!inRoom) {
    // y5：紧挨左右座位 —— create | 填空(4–7) | join，中间不留空列
    put(3, 5, hitGlyphs(UI.create()), {
      className: "mid-glyph",
      tag: "button",
      onClick: () => createRoom(),
    });
    put(
      4,
      5,
      `<label class="room-code-blank-cell"><input class="room-input" id="room-input" maxlength="6" autocomplete="off" spellcheck="false" aria-label="room code" /></label>`,
      { className: "mid-glyph room-join-blank", colSpan: 4 }
    );
    put(8, 5, hitGlyphs(UI.join()), {
      className: "mid-glyph",
      tag: "button",
      onClick: () => joinRoom(),
    });
    if (lobby._entryHint) {
      put(
        2,
        7,
        `<span class="room-hint-cell">${escapeText(lobby._entryHint)}</span>`,
        { className: "mid-glyph", colSpan: 8 }
      );
    }
  } else {
    if (lobby.code) {
      put(
        4,
        5,
        `<span class="room-code-text">${escapeText(lobby.code)}</span>`,
        {
          className: "mid-glyph room-code-cell",
          tag: "button",
          colSpan: 4,
          onClick: () => copyRoomCode(),
        }
      );
    }
    const hint =
      lobby._copyHint ||
      (lobby.peerPresent
        ? lobby.ready[0] && lobby.ready[1]
          ? "starting…"
          : "first / second · both yes → start"
        : `waiting… ${roomShareHint()}`);
    put(2, 6, `<span class="room-hint-cell">${escapeText(hint)}</span>`, {
      className: "mid-glyph",
      colSpan: 8,
    });
    if (lobby.peerPresent && netSeat != null) {
      const myReady = !!lobby.ready[netSeat];
      put(5, 7, hitGlyphs(UI.yes(), myReady), {
        className: "mid-glyph",
        tag: "button",
        onClick: () => setLocalReady(!lobby.ready[netSeat]),
      });
    }
  }

  flushTo(roomBoardEl);

  els.roomInput = roomBoardEl.querySelector("#room-input");
  if (els.roomInput) {
    els.roomInput.value = lobby._joinDraft || "";
    els.roomInput.addEventListener("input", () => {
      lobby._joinDraft = els.roomInput.value;
    });
    els.roomInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") joinRoom();
    });
  }
}

function showRoom() {
  screen = "room";
  gameMode = "two";
  resetLobby();
  closeNetLink();
  hideOverlay();
  hideAllScreens();
  els.room.hidden = false;
  renderRoom();
}

function broadcastLobby() {
  if (netRole !== "host" || !netLink) return;
  if (netSeat != null) lobby.names[netSeat] = localPlayerName();
  netLink.send({
    type: "lobby",
    peer: lobby.peerPresent,
    ready: [...lobby.ready],
    names: [...lobby.names],
    code: lobby.code,
    firstSeat: lobby.firstSeat === 1 ? 1 : 0,
  });
}

function maybeStartFromLobby() {
  if (netRole !== "host") return;
  if (!lobby.peerPresent) return;
  if (!(lobby.ready[0] && lobby.ready[1])) return;
  netState = dealNetGame(lobby.firstSeat === 1 ? 1 : 0);
  netLink.send({ type: "start", state: netState });
  beginNetMatch();
  applyNetSnapshot(netState);
}

function applyLobbySync(msg) {
  if (msg.peer != null) lobby.peerPresent = !!msg.peer;
  if (Array.isArray(msg.ready) && msg.ready.length >= 2) {
    lobby.ready = [!!msg.ready[0], !!msg.ready[1]];
  }
  if (Array.isArray(msg.names) && msg.names.length >= 2) {
    lobby.names = [
      String(msg.names[0] || "").slice(0, 16),
      String(msg.names[1] || "").slice(0, 16),
    ];
  }
  if (msg.code) lobby.code = String(msg.code).toUpperCase();
  if (msg.firstSeat === 0 || msg.firstSeat === 1) {
    lobby.firstSeat = msg.firstSeat;
  }
  lobby.phase = "waiting";
  renderRoom();
}

function setLocalReady(next) {
  if (netSeat == null || lobby.phase !== "waiting" || !lobby.peerPresent) return;
  lobby.ready[netSeat] = next;
  renderRoom();
  if (netRole === "host") {
    broadcastLobby();
    maybeStartFromLobby();
    return;
  }
  netLink?.send({ type: "ready", seat: netSeat, ready: next });
}

function handleLobbyPeerLeft() {
  if (netRole === "guest") {
    closeNetLink();
    resetLobby();
    lobby._entryHint = "home left — create or join again";
    renderRoom();
    return;
  }
  lobby.peerPresent = false;
  lobby.ready = [lobby.ready[0], false];
  lobby.names[1] = "";
  lobby.firstSeat = lobby.firstSeat === 1 ? 1 : 0;
  renderRoom();
  broadcastLobby();
}

/** 把权威状态落到本机视角并刷新 UI */
function applyNetSnapshot(next) {
  netState = next;
  const view = netToLocalView(netState, netSeat);
  state = {
    deck: view.deck,
    player: view.player,
    opponent: view.opponent,
    publicCard: view.publicCard,
    turn: view.turn,
    winner: view.winner,
    draw: view.draw,
  };
  pending = view.pending;
  busy = false;

  const ev = view.lastEvent;
  if (ev && ev.seat !== netSeat) {
    if (ev.kind === "takePublic") {
      opponentInfo = opponentTakePublicPrefix();
      opponentMarks = null;
    } else if (ev.kind === "takeDeck") {
      opponentInfo = opponentTakeDeckPrefix();
      opponentMarks = null;
    } else if (ev.kind === "give") {
      opponentInfo = [
        ...(ev.source === "public"
          ? opponentTakePublicPrefix()
          : opponentTakeDeckPrefix()),
        ...andGiveSuffix(ev.card),
      ];
      opponentMarks = {
        takeAt: ev.takeAt,
        giveAt: ev.giveAt,
        taken: ev.source === "public" ? ev.taken : null,
      };
    }
  } else if (ev && ev.seat === netSeat && ev.kind === "give") {
    playerInfo = youGiveSentence(ev.card);
    opponentMarks = null;
  }

  render();

  if (state.winner === "player") {
    creditWin("player");
    showOverlay(
      UI.playerMark(),
      formatMelds(state.player, checkWin(state.player).melds)
    );
  } else if (state.winner === "opponent") {
    creditWin("opponent");
    showOverlay(
      UI.player2Mark(),
      formatMelds(state.opponent, checkWin(state.opponent).melds)
    );
  } else if (state.draw) {
    showOverlay(numberSvg(0), "");
  }
}

function dispatchNetAction(action) {
  if (gameMode !== "two" || !netLink || netSeat == null) return;
  if (netRole === "host") {
    const next = applyNetAction(netState, netSeat, action);
    if (!next.ok) return;
    netState = next.state;
    netLink.send({ type: "state", state: netState });
    applyNetSnapshot(netState);
    return;
  }
  netLink.send({ type: "action", seat: netSeat, action });
}

function beginNetMatch() {
  screen = "game";
  opponentLeft = false;
  playerInfo = null;
  opponentInfo = null;
  opponentMarks = null;
  roundAgain = [false, false];
  resetMatchScore();
  busy = false;
  hideOverlay();
  hideAllScreens();
  els.game.hidden = false;
}

function roundIsEnded() {
  return !!(state && (state.winner || state.draw));
}

function requestAgain() {
  if (gameMode !== "two" || netSeat == null || opponentLeft) return;
  if (!roundIsEnded() || roundAgain[netSeat]) return;
  setLocalAgain(true);
}

function setLocalAgain(next) {
  if (netSeat == null) return;
  roundAgain[netSeat] = !!next;
  render();
  if (netRole === "host") {
    broadcastAgain();
    maybeRestartFromAgain();
    return;
  }
  netLink?.send({ type: "again", seat: netSeat, again: !!next });
}

function broadcastAgain() {
  if (netRole !== "host" || !netLink) return;
  netLink.send({ type: "again-sync", again: [...roundAgain] });
}

/** 双方都 again → 主机发新局（保留 matchScore） */
function maybeRestartFromAgain() {
  if (netRole !== "host" || !netLink) return;
  if (!(roundAgain[0] && roundAgain[1])) return;
  startNetRematch();
}

function startNetRematch() {
  roundAgain = [false, false];
  scoredThisRound = false;
  playerInfo = null;
  opponentInfo = null;
  opponentMarks = null;
  busy = false;
  hideOverlay();
  netState = dealNetGame(lobby.firstSeat === 1 ? 1 : 0);
  netLink.send({ type: "start", state: netState, rematch: true });
  broadcastAgain();
  applyNetSnapshot(netState);
}

function applyRematchLocal() {
  roundAgain = [false, false];
  scoredThisRound = false;
  playerInfo = null;
  opponentInfo = null;
  opponentMarks = null;
  busy = false;
  hideOverlay();
}

function onNetMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "hello" || msg.type === "ping") {
    if (netRole === "host" && netState && screen === "game") {
      netLink.send({ type: "start", state: netState });
    } else if (netRole === "host" && screen === "room") {
      broadcastLobby();
    } else if (netRole === "guest" && screen === "room") {
      netLink.send({ type: "join", role: "guest", name: localPlayerName() });
    }
    return;
  }
  if (msg.type === "join") {
    if (netRole !== "host") return;
    if (netState && screen === "game") {
      netLink.send({ type: "start", state: netState });
      return;
    }
    // 准备房间：客机入座，等双方 yes
    lobby.peerPresent = true;
    lobby.phase = "waiting";
    lobby.ready = [lobby.ready[0], false];
    if (msg.name) lobby.names[1] = String(msg.name).slice(0, 16);
    lobby.names[0] = localPlayerName();
    renderRoom();
    broadcastLobby();
    return;
  }
  if (msg.type === "lobby") {
    if (netRole === "host") return;
    applyLobbySync(msg);
    return;
  }
  if (msg.type === "ready") {
    if (netRole !== "host") return;
    const seat = msg.seat === 0 || msg.seat === 1 ? msg.seat : null;
    if (seat == null || seat === netSeat) return;
    lobby.ready[seat] = !!msg.ready;
    lobby.peerPresent = true;
    renderRoom();
    broadcastLobby();
    maybeStartFromLobby();
    return;
  }
  if (msg.type === "first") {
    if (netRole !== "host") return;
    if (!lobby.peerPresent || lobby.phase !== "waiting") return;
    const seat = msg.seat === 0 || msg.seat === 1 ? msg.seat : null;
    if (seat == null) return;
    if (lobby.firstSeat === seat) return;
    lobby.firstSeat = seat;
    lobby.ready = [false, false];
    renderRoom();
    broadcastLobby();
    return;
  }
  if (msg.type === "start") {
    if (netRole !== "guest" || !msg.state) return;
    if (screen === "game" || msg.rematch) applyRematchLocal();
    else beginNetMatch();
    applyNetSnapshot(msg.state);
    return;
  }
  if (msg.type === "state") {
    if (!msg.state) return;
    applyNetSnapshot(msg.state);
    return;
  }
  if (msg.type === "again") {
    if (netRole !== "host") return;
    const seat = msg.seat === 0 || msg.seat === 1 ? msg.seat : null;
    if (seat == null || seat === netSeat) return;
    if (!roundIsEnded() || opponentLeft) return;
    roundAgain[seat] = !!msg.again;
    render();
    broadcastAgain();
    maybeRestartFromAgain();
    return;
  }
  if (msg.type === "again-sync") {
    if (netRole === "host") return;
    if (Array.isArray(msg.again) && msg.again.length >= 2) {
      roundAgain = [!!msg.again[0], !!msg.again[1]];
    }
    render();
    return;
  }
  if (msg.type === "action") {
    if (netRole !== "host" || !netState) return;
    const seat = msg.seat === 0 || msg.seat === 1 ? msg.seat : null;
    if (seat == null || seat === netSeat) return;
    const next = applyNetAction(netState, seat, msg.action);
    if (!next.ok) return;
    netState = next.state;
    netLink.send({ type: "state", state: netState });
    applyNetSnapshot(netState);
    return;
  }
  if (msg.type === "leave") {
    if (screen === "room") {
      handleLobbyPeerLeft();
      return;
    }
    if (screen !== "game" || gameMode !== "two") return;
    handleOpponentLeft();
  }
}

async function createRoom() {
  const code = createRoomCode();
  closeNetLink();
  netRole = "host";
  netSeat = 0;
  gameMode = "two";
  opponentLeft = false;
  lobby = {
    phase: "waiting",
    code,
    peerPresent: false,
    ready: [false, false],
    names: [localPlayerName(), ""],
    firstSeat: 0,
    _copyHint: "connecting relay…",
    _entryHint: "",
    _joinDraft: "",
  };
  renderRoom();
  try {
    netLink = connectRoom(code, { onMessage: onNetMessage });
    await netLink.ready;
  } catch (err) {
    closeNetLink();
    resetLobby();
    const why = err?.message || "relay-offline";
    lobby._entryHint =
      why === "room-full"
        ? "room full"
        : `relay offline — npm start / npm run deploy (${why})`;
    renderRoom();
    return;
  }
  lobby._copyHint = "";
  renderRoom();
  netLink.send({ type: "hello", role: "host", name: localPlayerName() });
}

async function joinRoom() {
  const raw = els.roomInput
    ? els.roomInput.value
    : lobby._joinDraft || "";
  const code = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
  if (code.length < 4) {
    lobby._entryHint = "enter room code";
    renderRoom();
    return;
  }
  closeNetLink();
  netRole = "guest";
  netSeat = 1;
  gameMode = "two";
  opponentLeft = false;
  lobby = {
    phase: "waiting",
    code,
    peerPresent: false,
    ready: [false, false],
    names: ["", localPlayerName()],
    firstSeat: 0,
    _copyHint: "connecting relay…",
    _entryHint: "",
    _joinDraft: code,
  };
  renderRoom();
  try {
    netLink = connectRoom(code, { onMessage: onNetMessage });
    await netLink.ready;
  } catch (err) {
    closeNetLink();
    resetLobby();
    const why = err?.message || "relay-offline";
    lobby._entryHint =
      why === "room-full"
        ? "room full — create a new code"
        : `relay offline — npm start / npm run deploy (${why})`;
    lobby._joinDraft = code;
    renderRoom();
    return;
  }
  lobby._copyHint = "";
  renderRoom();
  netLink.send({ type: "join", role: "guest", name: localPlayerName() });
}

/** 多人：对手离开 */
function handleOpponentLeft() {
  if (gameMode !== "two" || opponentLeft) return;
  opponentLeft = true;
  busy = false;
  pending = null;
  roundAgain = [false, false];
  hideOverlay();
  render();
}

/** 本机离开对局 */
function leaveGame() {
  if (gameMode === "two" && netLink) {
    try {
      netLink.send({ type: "leave" });
    } catch {
      /* ignore */
    }
  }
  closeNetLink();
  showMenu();
}

function showMenu() {
  screen = "menu";
  opponentLeft = false;
  closeNetLink();
  resetLobby();
  resetMatchScore();
  roundAgain = [false, false];
  hideOverlay();
  hideAllScreens();
  els.menu.hidden = false;
  busy = false;
  pending = null;
  gameMode = "single";
}

/** 设置页：同 12×9 网格（暂不显示地球人汉字） */
function renderSettings() {
  cells = {};

  // y0：左上 modify | game（各占一格）；右上 leave
  put(0, 0, UI.modify(), { className: "mid-glyph title-row" });
  put(1, 0, UI.game(), { className: "mid-glyph title-row" });
  put(11, 0, hitGlyphs(UI.leave()), {
    className: "mid-glyph title-row",
    tag: "button",
    onClick: () => leaveSettings(),
  });

  const pick = (glyphHtml, on) => hitGlyphs(glyphHtml, on);

  // y2：word color 标签 | 九色横排可选（选中画单个矩形）
  put(0, 2, UI.word(), { className: "mid-glyph" });
  put(1, 2, UI.color(), { className: "mid-glyph" });
  WORD_COLORS.forEach((c, i) => {
    const selected = settings.color === c.id;
    put(3 + i, 2, pick(colorSwatchGlyph(c.id), selected), {
      className: "mid-glyph settings-opt",
      tag: "button",
      onClick: () => {
        setWordColor(c.id);
        renderSettings();
      },
    });
  });

  // y4：hide terran language | yes / no（相邻）
  put(0, 4, UI.hide(), { className: "mid-glyph" });
  put(1, 4, UI.terran(), { className: "mid-glyph" });
  put(2, 4, UI.language(), { className: "mid-glyph" });
  put(4, 4, pick(UI.yes(), settings.hideTerran), {
    className: "mid-glyph settings-opt",
    tag: "button",
    onClick: () => {
      setHideTerran(true);
      renderSettings();
    },
  });
  put(5, 4, pick(UI.no(), !settings.hideTerran), {
    className: "mid-glyph settings-opt",
    tag: "button",
    onClick: () => {
      setHideTerran(false);
      renderSettings();
    },
  });

  flushTo(settingsBoardEl);
}

function showSettings() {
  settingsReturn = screen === "settings" ? "menu" : screen;
  screen = "settings";
  hideOverlay();
  hideAllScreens();
  els.settings.hidden = false;
  renderSettings();
}

function leaveSettings() {
  if (settingsReturn === "game") {
    screen = "game";
    hideAllScreens();
    els.game.hidden = false;
    render();
  } else if (settingsReturn === "room") {
    screen = "room";
    hideAllScreens();
    els.room.hidden = false;
    renderRoom();
  } else {
    showMenu();
  }
}

function startGame(mode) {
  if (mode === "two") {
    showRoom();
    return;
  }
  closeNetLink();
  resetLobby();
  resetMatchScore();
  gameMode = "single";
  screen = "game";
  opponentLeft = false;
  hideAllScreens();
  els.game.hidden = false;
  restartRound();
}

/** 同一模式下重新开一局（仅单人；保留 matchScore） */
function restartRound() {
  if (gameMode === "two") return;
  hideOverlay();
  state = dealNewGame();
  pending = null;
  playerInfo = null;
  opponentInfo = null;
  opponentMarks = null;
  opponentLeft = false;
  scoredThisRound = false;
  busy = false;
  render();
}

function restart() {
  // 多人：只关结算层，等双方 again；单人：回主界面
  if (gameMode === "two" && screen === "game") {
    hideOverlay();
    return;
  }
  showMenu();
}

function leaveRoomScreen() {
  if (netLink) {
    try {
      netLink.send({ type: "leave" });
    } catch {
      /* ignore */
    }
  }
  closeNetLink();
  resetLobby();
  showMenu();
}

function initMenu() {
  els.menuTitle.innerHTML = menuTitleGlyphs();
  els.menuNameGlyphs.innerHTML = youNameBeGlyphs();
  els.choiceSingle.innerHTML = singlePlayerGlyphs();
  els.choiceTwo.innerHTML = twoPlayerGlyphs();
  els.menuModifyGlyphs.innerHTML = modifyGameGlyphs();
  els.playerName.value = settings.playerName || "";
  els.playerName.addEventListener("input", () => {
    setPlayerName(els.playerName.value);
  });
  els.playerName.addEventListener("change", () => {
    setPlayerName(els.playerName.value.trim());
    els.playerName.value = settings.playerName;
  });
  els.btnSingle.addEventListener("click", () => startGame("single"));
  els.btnTwo.addEventListener("click", () => startGame("two"));
  els.btnMenuModify.addEventListener("click", () => showSettings());
}

els.btnOverlayOk.addEventListener("click", restart);
loadSettings();
applySettings();
initMenu();
showMenu();
