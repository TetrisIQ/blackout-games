const test = require("node:test");
const assert = require("node:assert");
const g = require("../game.js");

const seeded = () => {
  let s = 42;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
};

function fillRow(board, y, gapX = -1) {
  for (let x = 0; x < g.COLS; x++) board[y][x] = x === gapX ? null : "I";
}

test("new state has empty board and a piece", () => {
  const s = g.createState(seeded());
  assert.strictEqual(s.board.length, g.ROWS);
  assert.ok(s.piece && s.next);
  assert.strictEqual(s.over, false);
});

test("7-bag gives every type once per 7 pieces", () => {
  const s = g.createState(seeded());
  const seen = [s.piece.type, s.next];
  for (let i = 0; i < 5; i++) {
    g.hardDrop(s);
    if (s.over) break;
    seen.push(s.next);
  }
  assert.strictEqual(new Set(seen.slice(0, 7)).size, 7);
});

test("move is blocked by walls", () => {
  const s = g.createState(seeded());
  for (let i = 0; i < 20; i++) g.move(s, -1);
  assert.strictEqual(g.move(s, -1), false);
  assert.ok(!g.collides(s.board, s.piece.shape, s.piece.x, s.piece.y));
});

test("rotating four times returns the original shape", () => {
  let shape = g.SHAPES.L;
  for (let i = 0; i < 4; i++) shape = g.rotateShape(shape);
  assert.deepStrictEqual(shape, g.SHAPES.L);
});

test("rotation next to the wall kicks the piece inside", () => {
  const s = g.createState(seeded());
  s.piece = { type: "I", shape: g.rotateShape(g.SHAPES.I), x: -2, y: 5 };
  assert.ok(g.rotate(s));
  assert.ok(!g.collides(s.board, s.piece.shape, s.piece.x, s.piece.y));
});

test("full rows are cleared and rows above fall", () => {
  const board = Array.from({ length: g.ROWS }, () => Array(g.COLS).fill(null));
  fillRow(board, g.ROWS - 1);
  fillRow(board, g.ROWS - 2);
  board[g.ROWS - 3][0] = "T";
  assert.strictEqual(g.clearLines(board), 2);
  assert.strictEqual(board[g.ROWS - 1][0], "T");
  assert.ok(board[g.ROWS - 2].every((c) => c === null));
});

test("hard drop locks piece at the bottom and scores", () => {
  const s = g.createState(seeded());
  const type = s.piece.type;
  g.hardDrop(s);
  assert.ok(s.score > 0);
  assert.ok(s.board[g.ROWS - 1].some((c) => c === type));
});

test("clearing 4 rows scores 800 * level and levels up after 10 lines", () => {
  const s = g.createState(seeded());
  for (let y = g.ROWS - 4; y < g.ROWS; y++) fillRow(s.board, y, 0);
  s.piece = { type: "I", shape: g.rotateShape(g.SHAPES.I), x: -2, y: 0 };
  s.lines = 6;
  g.hardDrop(s);
  assert.strictEqual(s.lines, 10);
  assert.strictEqual(s.level, 2);
  assert.ok(s.score >= 800);
});

test("game over when the spawn position is blocked", () => {
  const s = g.createState(seeded());
  for (let y = 0; y < 3; y++) fillRow(s.board, y, 0);
  g.hardDrop(s);
  assert.strictEqual(s.over, true);
  const before = s.score;
  g.tick(s);
  g.softDrop(s);
  assert.strictEqual(s.score, before);
});

test("drop interval shrinks with level but has a floor", () => {
  assert.ok(g.dropInterval(2) < g.dropInterval(1));
  assert.strictEqual(g.dropInterval(99), 100);
});
