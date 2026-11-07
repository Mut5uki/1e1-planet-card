import test from "node:test";
import assert from "node:assert/strict";
import { checkWin, findMelds, validTriple, sevenCheckVictory } from "../game.js";

test("ValidTriple: same element / number / consecutive", () => {
  assert.equal(
    validTriple(
      { element: "water", number: 1 },
      { element: "water", number: 5 },
      { element: "water", number: 7 }
    ),
    true
  );
  assert.equal(
    validTriple(
      { element: "fire", number: 3 },
      { element: "ice", number: 3 },
      { element: "warm", number: 3 }
    ),
    true
  );
  assert.equal(
    validTriple(
      { element: "fire", number: 2 },
      { element: "metal", number: 3 },
      { element: "water", number: 4 }
    ),
    true
  );
  assert.equal(
    validTriple(
      { element: "fire", number: 1 },
      { element: "metal", number: 3 },
      { element: "water", number: 5 }
    ),
    false
  );
});

test("SevenCheckVictory: overlapping chain wins", () => {
  const hand = [
    { element: "water", number: 7 },
    { element: "water", number: 3 },
    { element: "water", number: 4 },
    { element: "metal", number: 5 },
    { element: "fire", number: 5 },
    { element: "earth", number: 5 },
    { element: "warm", number: 5 },
    { element: "warm", number: 2 },
    { element: "warm", number: 7 },
  ];
  assert.equal(sevenCheckVictory(hand), true);
  assert.equal(checkWin(hand).win, true);
  assert.ok(findMelds(hand).length >= 1);
});

test("SevenCheckVictory: three disjoint triples do not win", () => {
  const hand = [
    ...[1, 2, 3].map((n) => ({ element: "fire", number: n })),
    ...[1, 2, 3].map((n) => ({ element: "water", number: n })),
    ...[1, 2, 3].map((n) => ({ element: "ice", number: n })),
  ];
  assert.equal(checkWin(hand).win, false);
});

test("peak consecutive same element wins", () => {
  const hand = [1, 2, 3, 4, 5, 6, 7, 6, 5].map((n) => ({
    element: "earth",
    number: n,
  }));
  assert.equal(checkWin(hand).win, true);
});
