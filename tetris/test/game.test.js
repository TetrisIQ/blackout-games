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

// --- Campaign ---------------------------------------------------------------

const bot = require("./bot.js");

const emptyBoard = () => Array.from({ length: g.ROWS }, () => Array(g.COLS).fill(null));

test("endless state has no campaign config", () => {
  const s = g.createState(seeded());
  assert.strictEqual(s.mode, "endless");
  assert.strictEqual(s.cfg, null);
  assert.strictEqual(s.boss, null);
});

test("levels get harder: faster start, shorter ramp, more bias", () => {
  for (let w = 0; w < g.WORLDS.length; w++) {
    for (let n = 2; n <= g.LEVELS_PER_WORLD; n++) {
      const a = g.levelConfig(w, n - 1);
      const b = g.levelConfig(w, n);
      assert.ok(b.baseInterval < a.baseInterval);
      assert.ok(b.minInterval < a.minInterval);
      assert.ok(b.rampMs < a.rampMs);
      assert.ok(b.bias > a.bias);
      assert.ok(b.stars[0] < b.stars[1] && b.stars[1] < b.stars[2]);
    }
  }
});

test("pressure rises with time and is capped at 1", () => {
  const cfg = g.levelConfig(0, 5);
  assert.strictEqual(g.pressureAt(0, cfg), 0);
  assert.ok(g.pressureAt(cfg.rampMs / 2, cfg) < g.pressureAt(cfg.rampMs, cfg));
  assert.strictEqual(g.pressureAt(cfg.rampMs * 10, cfg), 1);
  assert.strictEqual(g.levelInterval(cfg, 0), cfg.baseInterval);
  assert.strictEqual(g.levelInterval(cfg, 1), cfg.minInterval);
});

test("late in a hard level the bag has extra S/Z and never three S/Z in a row", () => {
  const s = g.createState(seeded(), { world: 0, level: 10 });
  s.pressure = 1;
  s.bag = [];
  s.recent = [];
  const seq = Array.from({ length: 700 }, () => g.nextType(s));
  const sz = (t) => t === "S" || t === "Z";
  assert.ok(seq.filter(sz).length / seq.length > 2 / 7);
  assert.ok(seq.filter((t) => t === "I").length / seq.length < 1 / 7);
  for (let i = 2; i < seq.length; i++) assert.ok(!(sz(seq[i]) && sz(seq[i - 1]) && sz(seq[i - 2])), `S/Z run at ${i}`);
});

test("rising row pushes the stack up, leaves one gap and tops out", () => {
  const s = g.createState(seeded());
  s.board[g.ROWS - 1][0] = "T";
  g.risingRow(s);
  assert.strictEqual(s.board[g.ROWS - 2][0], "T");
  assert.strictEqual(s.board[g.ROWS - 1].filter((c) => !c).length, 1);
  assert.strictEqual(s.over, false);
  s.board[0][0] = "T";
  g.risingRow(s);
  assert.strictEqual(s.over, true);
});

test("lava garbage rises on schedule", () => {
  const s = g.createState(seeded(), { world: 1, level: 1 });
  g.advance(s, s.cfg.garbage.startMs - 1);
  assert.strictEqual(s.garbageRows, 0);
  g.advance(s, 2);
  assert.strictEqual(s.garbageRows, 1);
  assert.ok(s.board[g.ROWS - 1].some((c) => c === "G"));
});

test("standard levels only start garbage once the ramp is over", () => {
  const s = g.createState(seeded(), { world: 0, level: 3 });
  g.advance(s, s.cfg.rampMs - 1000);
  assert.strictEqual(s.garbageRows, 0);
});

test("night shows a band that shrinks and follows the piece", () => {
  const s = g.createState(seeded(), { world: 2, level: 10 });
  assert.deepStrictEqual(g.visibleBand(s), [0, g.ROWS]);
  s.pressure = 1;
  s.piece.y = 12;
  const [from, to] = g.visibleBand(s);
  assert.strictEqual(to - from, s.cfg.night.minRows);
  assert.ok(from <= 12 && to > 12);
  const plain = g.createState(seeded(), { world: 0, level: 1 });
  assert.deepStrictEqual(g.visibleBand(plain), [0, g.ROWS]);
});

test("concrete survives the first clear and goes on the second", () => {
  const board = emptyBoard();
  fillRow(board, g.ROWS - 1);
  board[g.ROWS - 1][3] = "X";
  assert.strictEqual(g.clearLines(board), 1);
  assert.deepStrictEqual(board[g.ROWS - 1].map((c) => c || "."), [".", ".", ".", "x", ".", ".", ".", ".", ".", "."]);
  fillRow(board, g.ROWS - 1, 3);
  board[g.ROWS - 1][3] = "x";
  assert.strictEqual(g.clearLines(board), 1);
  assert.ok(board[g.ROWS - 1].every((c) => c === null));
});

test("a dropped block lands on top of its column", () => {
  const s = g.createState(seeded());
  s.board[g.ROWS - 1].fill("I");
  s.piece = { type: "O", shape: g.SHAPES.O, x: 4, y: 0 };
  g.dropBlock(s, "G");
  assert.strictEqual(s.board[g.ROWS - 2].filter((c) => c === "G").length, 1);
});

test("boss damage grows with lines cleared at once", () => {
  assert.deepStrictEqual([0, 1, 2, 3, 4].map(g.bossDamage), [0, 1, 3, 5, 8]);
});

test("clearing lines hurts the boss and zero HP wins", () => {
  const s = g.createState(seeded(), { world: 0, level: g.BOSS_LEVEL });
  assert.strictEqual(s.mode, "boss");
  const full = s.boss.maxHp;
  for (let y = g.ROWS - 4; y < g.ROWS; y++) fillRow(s.board, y, 0);
  s.piece = { type: "I", shape: g.rotateShape(g.SHAPES.I), x: -2, y: 0 };
  g.hardDrop(s);
  assert.strictEqual(s.boss.hp, full - 8);
  assert.strictEqual(s.won, false);
  s.boss.hp = 1;
  fillRow(s.board, g.ROWS - 1, 0);
  s.piece = { type: "I", shape: g.rotateShape(g.SHAPES.I), x: -2, y: 0 };
  g.hardDrop(s);
  assert.strictEqual(s.boss.hp, 0);
  assert.strictEqual(s.won, true);
  assert.strictEqual(s.over, true);
});

test("the boss warns before it attacks", () => {
  const s = g.createState(seeded(), { world: 1, level: g.BOSS_LEVEL });
  const at = s.boss.nextAttackAt;
  g.advance(s, at - g.BOSS_WARN_MS - 10);
  assert.strictEqual(s.boss.warning, null);
  g.advance(s, 20);
  assert.ok(s.boss.warning && s.boss.warning.at === at);
  const rows = s.garbageRows;
  g.advance(s, g.BOSS_WARN_MS);
  assert.strictEqual(s.boss.warning, null);
  assert.strictEqual(s.boss.attacks, 1);
  assert.ok(s.boss.nextAttackAt > at);
  assert.ok(s.board.some((row) => row.some((c) => c === "G")) || rows > 0);
});

test("the Shadow blacks out the board and shows a wrong next piece", () => {
  const s = g.createState(seeded(), { world: 2, level: g.BOSS_LEVEL });
  assert.strictEqual(g.isBlackout(s), false);
  g.bossAttack(s, "blackout");
  assert.strictEqual(g.isBlackout(s), true);
  s.elapsed += g.BLACKOUT_MS + 1;
  assert.strictEqual(g.isBlackout(s), false);
  g.bossAttack(s, "fake");
  assert.notStrictEqual(g.previewType(s), s.next);
  g.hardDrop(s);
  assert.strictEqual(g.previewType(s), s.next);
});

test("stars come from score, boss stars from speed", () => {
  const cfg = g.levelConfig(0, 1);
  assert.strictEqual(g.starsFor(0, cfg), 0);
  assert.strictEqual(g.starsFor(cfg.stars[0], cfg), 1);
  assert.strictEqual(g.starsFor(cfg.stars[1], cfg), 2);
  assert.strictEqual(g.starsFor(cfg.stars[2] * 2, cfg), 3);
  const boss = g.bossConfig(0);
  assert.strictEqual(g.bossStarsFor(10 * 60 * 1000, boss), 1);
  assert.strictEqual(g.bossStarsFor(boss.timeStars[1], boss), 2);
  assert.strictEqual(g.bossStarsFor(1000, boss), 3);
});

test("progress: a star opens the next level, stars open the boss, the boss opens the next world", () => {
  const p = g.blankProgress();
  assert.strictEqual(g.unlockedLevel(p, 0), 1);
  assert.strictEqual(g.unlockedLevel(p, 1), 0);
  assert.strictEqual(g.recordResult(p, 0, 1, 0, 100), false);
  assert.strictEqual(g.unlockedLevel(p, 0), 1);
  assert.strictEqual(g.recordResult(p, 0, 1, 1, 900), true);
  assert.strictEqual(g.unlockedLevel(p, 0), 2);
  assert.strictEqual(g.recordResult(p, 0, 1, 3, 500), false);
  assert.strictEqual(g.starsAt(p, 0, 1), 3);
  assert.strictEqual(p.best["0-1"], 900);
  for (let n = 2; n <= g.LEVELS_PER_WORLD; n++) g.recordResult(p, 0, n, 1, 1);
  assert.strictEqual(g.unlockedLevel(p, 0), g.LEVELS_PER_WORLD);
  assert.strictEqual(g.starsIn(p, 0), 3 + 9);
  assert.strictEqual(g.bossUnlocked(p, 0), false);
  for (let n = 2; n <= 4; n++) g.recordResult(p, 0, n, 2, 1);
  assert.strictEqual(g.starsIn(p, 0), g.BOSS_STARS_NEEDED);
  assert.strictEqual(g.bossUnlocked(p, 0), true);
  assert.strictEqual(g.worldUnlocked(p, 1), false);
  assert.strictEqual(g.recordResult(p, 0, g.BOSS_LEVEL, 2, 1), true);
  assert.strictEqual(g.worldUnlocked(p, 1), true);
  assert.strictEqual(g.unlockedLevel(p, 1), 1);
});

test("every campaign level ends in reasonable time (bot, 1 s per piece)", () => {
  for (let w = 0; w < g.WORLDS.length; w++) {
    for (let n = 1; n <= g.BOSS_LEVEL; n++) {
      const r = bot.play(7, { world: w, level: n }, { delay: 1000, maxMs: 10 * 60 * 1000 });
      assert.ok(r.over, `world ${w} level ${n} did not end`);
      assert.ok(r.ms < 6 * 60 * 1000, `world ${w} level ${n} lasted ${Math.round(r.ms / 1000)} s`);
    }
  }
});
