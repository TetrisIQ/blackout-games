const test = require("node:test");
const assert = require("node:assert");
const g = require("../game.js");

const seeded = () => {
  let s = 7;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
};

test("new state: snake of 3 heading right, food not on snake", () => {
  const s = g.createState(seeded());
  assert.strictEqual(s.snake.length, 3);
  assert.ok(!s.snake.some((c) => c.x === s.food.x && c.y === s.food.y));
});

test("step moves the snake one cell without growing", () => {
  const s = g.createState(seeded());
  s.food = { x: 0, y: 0 };
  const head = s.snake[0];
  g.step(s);
  assert.deepStrictEqual(s.snake[0], { x: head.x + 1, y: head.y });
  assert.strictEqual(s.snake.length, 3);
});

test("eating grows, scores 10 and places new food off the snake", () => {
  const s = g.createState(seeded());
  const h = s.snake[0];
  s.food = { x: h.x + 1, y: h.y };
  g.step(s);
  assert.strictEqual(s.snake.length, 4);
  assert.strictEqual(s.score, 10);
  assert.ok(!s.snake.some((c) => c.x === s.food.x && c.y === s.food.y));
});

test("reversing is ignored, turns are applied", () => {
  const s = g.createState(seeded());
  assert.strictEqual(g.setDir(s, g.DIRS.left), false);
  assert.strictEqual(g.setDir(s, g.DIRS.right), false);
  assert.strictEqual(g.setDir(s, g.DIRS.up), true);
  g.step(s);
  assert.deepStrictEqual(s.dir, g.DIRS.up);
});

test("two quick turns are buffered, a third is dropped; no 180 via buffer", () => {
  const s = g.createState(seeded());
  assert.ok(g.setDir(s, g.DIRS.up));
  assert.strictEqual(g.setDir(s, g.DIRS.down), false); // reverse of queued up
  assert.ok(g.setDir(s, g.DIRS.left));
  assert.strictEqual(g.setDir(s, g.DIRS.up), false); // queue full
});

test("hitting a wall ends the game", () => {
  const s = g.createState(seeded());
  s.food = { x: 0, y: 0 };
  for (let i = 0; i < g.SIZE; i++) g.step(s);
  assert.strictEqual(s.over, true);
});

test("hitting the own body ends the game", () => {
  const s = g.createState(seeded());
  s.snake = [
    { x: 5, y: 5 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }, { x: 4, y: 4 }, { x: 5, y: 4 },
  ];
  s.dir = g.DIRS.up;
  s.food = { x: 0, y: 0 };
  g.setDir(s, g.DIRS.left);
  g.step(s); // moves into (4,5), which is body
  assert.strictEqual(s.over, true);
});

test("moving into the cell the tail just left is allowed", () => {
  const s = g.createState(seeded());
  s.snake = [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }];
  s.dir = g.DIRS.up;
  s.food = { x: 0, y: 0 };
  g.setDir(s, g.DIRS.right);
  g.step(s); // head to (6,5), the tail's cell
  assert.strictEqual(s.over, false);
});

test("filling the board wins", () => {
  const s = g.createState(seeded());
  const cells = [];
  for (let y = 0; y < g.SIZE; y++) {
    for (let x = 0; x < g.SIZE; x++) cells.push({ x: y % 2 ? g.SIZE - 1 - x : x, y });
  }
  // Head at the end of a serpentine path, one cell (the last) still free.
  const path = cells.slice(0, -1).reverse();
  s.snake = path;
  const head = path[0];
  const free = cells[cells.length - 1];
  s.dir = { x: free.x - head.x, y: free.y - head.y };
  s.food = free;
  g.step(s);
  assert.strictEqual(s.won, true);
  assert.strictEqual(s.over, true);
});

test("interval shrinks with score but has a floor", () => {
  assert.ok(g.interval(100) < g.interval(0));
  assert.strictEqual(g.interval(100000), 60);
});
