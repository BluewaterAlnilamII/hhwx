import assert from "node:assert/strict";
import test from "node:test";
import { applyMove, createInitialBoard, getValidMoves, opponent } from "../src/lib/othello.ts";
import { kaoruAI } from "../src/lib/ai/kaoru.ts";

test("module Worker and synchronous fallback retain Kaoru's moves and error protocol", async () => {
  // Recorded from the former public Worker before consolidation; no live game data.
  const expectedMoves = new Map([
    [1, [[2, 2], [5, 5]]], [8, [[2, 3], [4, 2]]], [26, [[5, 2], [7, 7]]],
    [54, [[0, 0], [0, 7]]], [58, [[0, 0], [0, 0]]],
  ]);
  const originalSelf = globalThis.self;
  const originalRandom = Math.random;
  let response;
  globalThis.self = { postMessage(value) { response = value; } };
  let seed = 0;
  Math.random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  try {
    await import("../src/lib/ai/kaoru.worker.ts");
    let board = createInitialBoard();
    let color = "black";
    for (let step = 0; step <= 58; step += 1) {
      if (expectedMoves.has(step)) {
        for (const [index, aiColor] of ["black", "white"].entries()) {
          const [row, col] = expectedMoves.get(step)[index];
          const before = structuredClone(board);
          seed = 12345 + step;
          self.onmessage({ data: { board, aiColor } });
          assert.deepEqual(response, { move: { row, col } }, `${step}:${aiColor}`);
          seed = 12345 + step;
          assert.deepEqual(kaoruAI(board, aiColor), { row, col });
          assert.deepEqual(board, before);
        }
      }
      let moves = getValidMoves(board, color);
      if (moves.length === 0) {
        color = opponent(color);
        moves = getValidMoves(board, color);
      }
      assert.ok(moves.length > 0);
      const move = moves[(step * 13 + 7) % moves.length];
      board = applyMove(board, move.row, move.col, color);
      color = opponent(color);
    }
    const fullBoard = Array.from({ length: 8 }, () => Array(8).fill("black"));
    self.onmessage({ data: { board: fullBoard, aiColor: "white" } });
    assert.deepEqual(response, { error: "No valid moves" });
    assert.throws(() => kaoruAI(fullBoard, "white"));
  } finally {
    Math.random = originalRandom;
    if (originalSelf === undefined) delete globalThis.self;
    else globalThis.self = originalSelf;
  }
});
