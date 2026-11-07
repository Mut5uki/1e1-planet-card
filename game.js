import { ELEMENTS } from "./icons.js";

/**
 * 行星牌逻辑（对齐解包 Draw.* / SevenReconstructed.cs）：
 * ShuffleSeven / SevenDealCard / SevenEnemyMove /
 * HandValue / BestRes / SevenCheckVictory / ValidTriple
 */

export function createDeck() {
  const deck = [];
  for (const el of ELEMENTS) {
    for (let n = 1; n <= 7; n++) {
      deck.push({ element: el.id, number: n, id: `${el.id}-${n}` });
    }
  }
  return shuffle(deck);
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dealNewGame() {
  const deck = createDeck();
  const player = deck.splice(0, 9);
  const opponent = deck.splice(0, 9);
  const publicCard = deck.splice(0, 1)[0];
  return {
    deck,
    player,
    opponent,
    publicCard,
    turn: "player",
    winner: null,
    draw: false,
  };
}

export function insertCard(hand, card, index) {
  const next = [...hand];
  next.splice(index, 0, card);
  return next;
}

export function discardAt(hand10, index) {
  const next = [...hand10];
  const [discarded] = next.splice(index, 1);
  return { hand: next, discarded };
}

/** ValidTriple：恰好三张 */
export function validTriple(a, b, c) {
  if (a.element === b.element && b.element === c.element) return true;
  if (a.number === b.number && b.number === c.number) return true;
  if (a.number + 1 === b.number && b.number + 1 === c.number) return true;
  if (a.number - 1 === b.number && b.number - 1 === c.number) return true;
  return false;
}

function windowFlags(hand) {
  const flags = [];
  for (let i = 0; i < hand.length - 2; i++) {
    flags.push(validTriple(hand[i], hand[i + 1], hand[i + 2]));
  }
  return flags;
}

/**
 * SevenCheckVictory：官方硬编码牌位窗检查（9 张）。
 * 互不重叠的三坨面子不能赢，必须重叠衔接。
 */
export function sevenCheckVictory(hand) {
  if (hand.length !== 9) return false;
  const flags = windowFlags(hand);
  for (let pos = 0; pos < 9; pos++) {
    if (pos === 0 && !flags[0]) return false;
    if (pos === 2 && !(flags[1] || flags[2])) return false;
    if (pos >= 3 && pos <= 5) {
      if (!flags[pos - 1] && !(flags[pos - 2] && flags[pos])) return false;
    }
    if (pos === 6 && !(flags[4] || flags[5])) return false;
    if (pos === 8 && !flags[6]) return false;
  }
  return true;
}

/** UI：连续 ValidTriple 窗合并成面子高亮 */
export function findMelds(hand) {
  const flags = windowFlags(hand);
  const melds = [];
  let i = 0;
  while (i < flags.length) {
    if (!flags[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < flags.length && flags[j + 1]) j++;
    melds.push({ start: i, end: j + 2 });
    i = j + 1;
  }
  return melds;
}

export function checkWin(hand) {
  const win = sevenCheckVictory(hand);
  return { win, melds: win ? findMelds(hand) : [] };
}

/** HandValue（简化对齐）：已胜 1e6；否则按邻窗/相邻关系给分 */
export function handValue(hand) {
  if (sevenCheckVictory(hand)) return 1_000_000;
  let score = 0;
  let soft = 0;
  const flags = windowFlags(hand);
  for (let i = 0; i < flags.length; i++) {
    if (flags[i]) score += 10;
  }
  for (let i = 0; i < hand.length - 1; i++) {
    const a = hand[i];
    const b = hand[i + 1];
    const related =
      a.element === b.element ||
      a.number === b.number ||
      Math.abs(a.number - b.number) === 1;
    if (related) score += 2;
    else soft++;
  }
  if (soft === 1) score -= Math.floor(Math.random() * 5);
  return score;
}

/**
 * BestRes：弃 0..8 × 插 0..8（先 RemoveAt 再 Insert）
 * 返回 { score, discardAt, insertAt, hand }
 */
export function bestRes(hand, newcard) {
  let best = null;
  for (let discardAt = 0; discardAt < 9; discardAt++) {
    for (let insertAt = 0; insertAt < 9; insertAt++) {
      const trial = [...hand];
      trial.splice(discardAt, 1);
      trial.splice(insertAt, 0, newcard);
      const score = handValue(trial);
      const candidate = { score, discardAt, insertAt, hand: trial };
      if (!best || score > best.score || (score === best.score && discardAt < best.discardAt)) {
        best = candidate;
      }
    }
  }
  return best;
}

/** SevenEnemyMove：公开牌 BestRes ≥ 当前 HandValue+3 才拿弃牌，否则摸牌 */
export function aiChooseSource(state) {
  if (!state.publicCard) return "deck";
  if (state.deck.length === 0) return "public";
  const cur = handValue(state.opponent);
  const takePublic = bestRes(state.opponent, state.publicCard);
  if (takePublic.score >= cur + 3) return "public";
  return "deck";
}

/**
 * 官方 seven_take / seven_give（Discard-then-Insert 之后的槽位标记）
 * 可落到 0..9（第 10 框）
 */
export function takeGiveMarks(discardIdx, insertIdx) {
  if (discardIdx > insertIdx) {
    return { takeAt: insertIdx, giveAt: discardIdx + 1 };
  }
  return { takeAt: insertIdx + 1, giveAt: discardIdx };
}

export function aiPlay(state, taken) {
  const move = bestRes(state.opponent, taken);
  const marks = takeGiveMarks(move.discardAt, move.insertAt);
  return {
    insertAt: move.insertAt,
    discardAt: move.discardAt,
    takeAt: marks.takeAt,
    giveAt: marks.giveAt,
    hand: move.hand,
    discarded: state.opponent[move.discardAt],
    wins: sevenCheckVictory(move.hand),
    score: move.score,
  };
}

/** —— 联机：座位 0/1，pending 进权威状态 —— */

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

/** 主机开局发牌；firstSeat=0|1 决定谁先手 */
export function dealNetGame(firstSeat = 0) {
  const g = dealNewGame();
  const turn = firstSeat === 1 ? 1 : 0;
  return {
    deck: g.deck,
    hands: [g.player, g.opponent],
    publicCard: g.publicCard,
    turn,
    winner: null,
    draw: false,
    pending: null,
    lastEvent: null,
    seq: 0,
  };
}

/**
 * 应用联机动作（主机权威）
 * action: { type:"take", source:"public"|"deck" }
 *        | { type:"insert", index:number }
 *        | { type:"discard", index:number }
 */
export function applyNetAction(state, seat, action) {
  if (!state || seat !== 0 && seat !== 1) {
    return { ok: false, error: "bad-seat" };
  }
  if (state.winner != null || state.draw) {
    return { ok: false, error: "ended" };
  }
  const s = cloneState(state);

  if (action?.type === "take") {
    if (s.turn !== seat || s.pending) return { ok: false, error: "not-your-take" };
    const source = action.source === "public" ? "public" : "deck";
    let card = null;
    if (source === "public") {
      if (!s.publicCard) return { ok: false, error: "no-public" };
      card = s.publicCard;
      s.publicCard = null;
    } else {
      if (!s.deck.length) return { ok: false, error: "empty-deck" };
      card = s.deck.shift();
    }
    s.pending = { seat, card, source, phase: "insert", insertAt: null };
    s.lastEvent = { seat, kind: source === "public" ? "takePublic" : "takeDeck", card: source === "public" ? card : null };
    s.seq += 1;
    return { ok: true, state: s };
  }

  if (action?.type === "insert") {
    const p = s.pending;
    if (!p || p.seat !== seat || p.phase !== "insert") {
      return { ok: false, error: "not-insert" };
    }
    const index = Number(action.index);
    if (!Number.isInteger(index) || index < 0 || index > s.hands[seat].length) {
      return { ok: false, error: "bad-insert" };
    }
    s.hands[seat] = insertCard(s.hands[seat], p.card, index);
    s.pending = { ...p, phase: "discard", insertAt: index };
    s.seq += 1;
    return { ok: true, state: s };
  }

  if (action?.type === "discard") {
    const p = s.pending;
    if (!p || p.seat !== seat || p.phase !== "discard") {
      return { ok: false, error: "not-discard" };
    }
    const index = Number(action.index);
    if (!Number.isInteger(index) || index < 0 || index >= s.hands[seat].length) {
      return { ok: false, error: "bad-discard" };
    }
    const insertAt = p.insertAt ?? 0;
    const { hand, discarded } = discardAt(s.hands[seat], index);
    s.hands[seat] = hand;
    s.publicCard = discarded;
    const marks = takeGiveMarks(
      /* discard-then-insert 近似：用插入位与弃牌位估槽 */
      index > insertAt ? index - 1 : index,
      insertAt > index ? insertAt - 1 : insertAt
    );
    s.lastEvent = {
      seat,
      kind: "give",
      card: discarded,
      source: p.source,
      taken: p.source === "public" ? p.card : null,
      takeAt: marks.takeAt,
      giveAt: marks.giveAt,
    };
    s.pending = null;

    if (sevenCheckVictory(hand)) {
      s.winner = seat;
      s.seq += 1;
      return { ok: true, state: s };
    }
    if (s.deck.length === 0) {
      s.draw = true;
      s.seq += 1;
      return { ok: true, state: s };
    }
    s.turn = 1 - seat;
    s.seq += 1;
    return { ok: true, state: s };
  }

  return { ok: false, error: "bad-action" };
}

/** 本地座位视角（供 UI） */
export function netToLocalView(netState, seat) {
  const other = 1 - seat;
  const pending =
    netState.pending && netState.pending.seat === seat
      ? {
          card: netState.pending.card,
          source: netState.pending.source,
          phase: netState.pending.phase,
        }
      : null;
  let winner = null;
  if (netState.winner === seat) winner = "player";
  else if (netState.winner === other) winner = "opponent";
  return {
    deck: netState.deck,
    player: netState.hands[seat],
    opponent: netState.hands[other],
    publicCard: netState.publicCard,
    turn: netState.turn === seat ? "player" : "opponent",
    winner,
    draw: netState.draw,
    pending,
    lastEvent: netState.lastEvent,
  };
}
