const test = require("node:test");
const assert = require("node:assert");
const g = require("../game.js");

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Board without any matches: neighbours differ by 1 horizontally and by 2 vertically.
function base() {
  return Array.from({ length: g.H }, (_, y) => Array.from({ length: g.W }, (_, x) => g.gem((x + 2 * y) % g.TYPES)));
}

// Overrides cells: set(board, [[x, y, type, special?], ...])
function set(board, cells) {
  for (const [x, y, t, s] of cells) board[y][x] = g.gem(t, s ?? null);
  return board;
}

// State whose first refills come from a script, then a seeded generator.
function stateWith(board, refills = []) {
  const rnd = mulberry32(42);
  const queue = [...refills];
  const random = () => (queue.length ? queue.shift() : rnd());
  const cfg = g.levelConfig(1);
  return { board, score: 0, level: 1, types: g.TYPES, moves: cfg.moves, movesLeft: cfg.moves, target: cfg.target, stars: 0, status: "play", random };
}

const types = (b) => b.map((r) => r.map((c) => c.t));
const full = (b) => b.every((r) => r.every((c) => c));

test("base board has no matches", () => {
  assert.equal(g.findGroups(base()).length, 0);
});

test("createBoard: no matches, a move exists, deterministic per seed", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const b = g.createBoard(mulberry32(seed));
    assert.equal(g.findGroups(b).length, 0);
    assert.ok(g.findMove(b));
  }
  assert.deepEqual(g.createBoard(mulberry32(5)), g.createBoard(mulberry32(5)));
});

test("findGroups: horizontal, vertical and shorter runs", () => {
  const b = set(base(), [[0, 0, 4], [1, 0, 4], [2, 0, 4]]);
  const groups = g.findGroups(b);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].cells.size, 3);
  const v = set(base(), [[3, 2, 0], [3, 3, 0], [3, 4, 0], [3, 5, 0]]);
  assert.equal(g.findGroups(v)[0].cells.size, 4);
  assert.equal(g.findGroups(set(base(), [[0, 0, 4], [1, 0, 4]])).length, 0);
});

test("findGroups: L shape merges into one group", () => {
  const b = set(base(), [[2, 2, 2], [3, 2, 2], [4, 2, 2], [2, 3, 2], [2, 4, 2]]);
  const groups = g.findGroups(b);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].cells.size, 5);
});

test("invalid swap changes nothing and costs no move", () => {
  const b = base();
  const state = stateWith(g.cloneBoard(b));
  const res = g.trySwap(state, { x: 0, y: 0 }, { x: 1, y: 0 });
  assert.equal(res.valid, false);
  assert.deepEqual(state.board, b);
  assert.equal(state.movesLeft, g.levelConfig(1).moves);
});

test("non-adjacent swap is rejected", () => {
  const state = stateWith(base());
  assert.equal(g.trySwap(state, { x: 0, y: 0 }, { x: 2, y: 0 }).valid, false);
  assert.equal(g.trySwap(state, { x: 0, y: 0 }, { x: 1, y: 1 }).valid, false);
});

test("valid swap: scores 10 per gem, uses a move, refills the board", () => {
  // Row 0: 4 4 _ 4 ... ; the gem at (2,1) is a 4, swapping it up completes three in a row.
  const b = set(base(), [[0, 0, 4], [1, 0, 4], [2, 1, 4]]);
  assert.equal(g.findGroups(b).length, 0);
  const state = stateWith(b);
  const res = g.trySwap(state, { x: 2, y: 0 }, { x: 2, y: 1 });
  assert.equal(res.valid, true);
  assert.equal(state.movesLeft, g.levelConfig(1).moves - 1);
  assert.equal(res.steps[0].cleared.length >= 3, true);
  assert.equal(res.steps[0].points, res.steps[0].cleared.length * 10);
  assert.ok(full(state.board));
  assert.equal(g.findGroups(state.board).length, 0);
});

test("gravity: gems above a cleared run fall down", () => {
  const b = set(base(), [[0, 7, 3], [1, 7, 3], [2, 6, 3]]);
  assert.equal(g.findGroups(b).length, 0);
  const state = stateWith(b);
  const res = g.trySwap(state, { x: 2, y: 6 }, { x: 2, y: 7 });
  // The swap put the old (2,7) gem (type 4) at (2,6); the run at row 7 is gone, so it drops one row,
  // and the gem that sat above it falls into its place.
  assert.equal(res.steps[0].board[7][2].t, 4);
  assert.equal(res.steps[0].board[6][2].t, 0);
});

test("cascades multiply points", () => {
  const b = set(base(), [[0, 7, 3], [1, 7, 3], [3, 7, 3], [1, 6, 4], [2, 6, 4]]);
  assert.equal(g.findGroups(b).length, 0);
  const res = g.trySwap(stateWith(b), { x: 2, y: 7 }, { x: 3, y: 7 });
  assert.equal(res.valid, true);
  // Row 7 (3,3,3) clears; the 4s above drop next to the swapped-in 4 and match again.
  assert.equal(res.steps[0].cascade, 1);
  assert.equal(res.steps[1].cascade, 2);
  assert.equal(res.steps[1].points, res.steps[1].cleared.length * 20);
});

test("4 in a row creates a row special at the swapped gem", () => {
  const b = set(base(), [[0, 3, 5], [1, 3, 5], [3, 3, 5], [2, 4, 5]]);
  assert.equal(g.findGroups(b).length, 0);
  const state = stateWith(b);
  const res = g.trySwap(state, { x: 2, y: 3 }, { x: 2, y: 4 });
  assert.equal(res.valid, true);
  assert.deepEqual(res.steps[0].created, [{ x: 2, y: 3, special: "row" }]);
  assert.equal(res.steps[0].cleared.length, 3);
});

test("vertical 4 creates a column special", () => {
  const b = set(base(), [[3, 0, 4], [3, 1, 4], [3, 3, 4], [4, 2, 4]]);
  const res = g.trySwap(stateWith(b), { x: 3, y: 2 }, { x: 4, y: 2 });
  assert.equal(res.steps[0].created[0].special, "col");
});

test("5 in a row creates a colour gem", () => {
  const b = set(base(), [[0, 3, 4], [1, 3, 4], [3, 3, 4], [4, 3, 4], [2, 4, 4]]);
  const res = g.trySwap(stateWith(b), { x: 2, y: 3 }, { x: 2, y: 4 });
  assert.equal(res.steps[0].created[0].special, "color");
});

test("L/T shape creates a blast gem at the crossing", () => {
  const b = set(base(), [[3, 2, 5], [4, 2, 5], [5, 3, 5], [5, 4, 5], [5, 1, 5]]);
  assert.equal(g.findGroups(b).length, 0);
  const res = g.trySwap(stateWith(b), { x: 5, y: 1 }, { x: 5, y: 2 });
  assert.equal(res.valid, true);
  assert.equal(res.steps[0].created[0].special, "blast");
});

test("a row special clears its whole row when matched", () => {
  const b = set(base(), [[0, 7, 4, "row"], [1, 7, 4], [2, 6, 4]]);
  const res = g.trySwap(stateWith(b), { x: 2, y: 6 }, { x: 2, y: 7 });
  assert.equal(res.valid, true);
  assert.equal(res.steps[0].cleared.length, g.W);
});

test("a blast special clears the 3x3 area around it", () => {
  const b = set(base(), [[3, 4, 4, "blast"], [4, 4, 4], [5, 3, 4]]);
  const res = g.trySwap(stateWith(b), { x: 5, y: 3 }, { x: 5, y: 4 });
  assert.equal(res.valid, true);
  const cleared = res.steps[0].cleared.map((p) => `${p.x},${p.y}`);
  for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) assert.ok(cleared.includes(`${3 + dx},${4 + dy}`));
});

test("colour gem: swapping clears every gem of the partner's colour", () => {
  const b = set(base(), [[0, 0, g.COLOR, "color"]]);
  const target = b[0][1].t;
  const count = b.flat().filter((c) => c.t === target).length;
  const state = stateWith(b);
  const res = g.trySwap(state, { x: 0, y: 0 }, { x: 1, y: 0 });
  assert.equal(res.valid, true);
  assert.equal(res.steps[0].cleared.length, count + 1);
});

test("two colour gems clear the whole board", () => {
  const b = set(base(), [[0, 0, g.COLOR, "color"], [1, 0, g.COLOR, "color"]]);
  const res = g.trySwap(stateWith(b), { x: 0, y: 0 }, { x: 1, y: 0 });
  assert.equal(res.steps[0].cleared.length, g.W * g.H);
});

test("colour gem + special turns that colour into specials", () => {
  const b = set(base(), [[0, 0, g.COLOR, "color"], [1, 0, 2, "row"]]);
  const res = g.trySwap(stateWith(b), { x: 0, y: 0 }, { x: 1, y: 0 });
  assert.equal(res.valid, true);
  // Every colour-2 gem fires a row special: all rows that held one are gone.
  const rows = new Set(b.flatMap((r, y) => r.some((c) => c.t === 2) ? [y] : []));
  assert.ok(res.steps[0].cleared.length >= rows.size * g.W - 0);
});

test("two specials can always be swapped", () => {
  const b = set(base(), [[0, 0, 1, "row"], [1, 0, 2, "col"]]);
  assert.equal(g.isValidSwap(b, { x: 0, y: 0 }, { x: 1, y: 0 }), true);
});

test("a special swapped with a normal gem needs a match", () => {
  const b = set(base(), [[0, 0, 1, "row"]]);
  assert.equal(g.isValidSwap(b, { x: 0, y: 0 }, { x: 1, y: 0 }), false);
});

test("reaching the target clears the level with a bonus per remaining move", () => {
  const b = set(base(), [[0, 0, 4], [1, 0, 4], [2, 1, 4]]);
  const state = stateWith(b);
  state.score = state.target - 1;
  const res = g.trySwap(state, { x: 2, y: 0 }, { x: 2, y: 1 });
  assert.equal(state.status, "levelclear");
  assert.equal(res.bonus, (g.levelConfig(1).moves - 1) * 50);
  assert.equal(state.stars, 3);
  assert.equal(g.trySwap(state, { x: 0, y: 0 }, { x: 1, y: 0 }).valid, false);
  assert.equal(g.nextLevel(state), true);
  assert.equal(state.level, 2);
  assert.equal(state.movesLeft, g.levelConfig(1).moves);
  assert.equal(state.status, "play");
  assert.equal(g.nextLevel(state), false);
});

test("running out of moves ends the game", () => {
  const b = set(base(), [[0, 0, 4], [1, 0, 4], [2, 1, 4]]);
  const state = stateWith(b);
  state.movesLeft = 1;
  g.trySwap(state, { x: 2, y: 0 }, { x: 2, y: 1 });
  assert.equal(state.status, "over");
});

test("shuffle keeps the gems and leaves a playable board", () => {
  const state = g.createState(mulberry32(3), 1);
  const before = state.board.flat().map((c) => c.t).sort();
  g.shuffle(state);
  assert.deepEqual(state.board.flat().map((c) => c.t).sort(), before);
  assert.equal(g.findGroups(state.board).length, 0);
  assert.ok(g.findMove(state.board));
});

test("invariant: random play always leaves a full, stable, playable board", () => {
  for (let seed = 1; seed <= 15; seed++) {
    const rnd = mulberry32(seed);
    const state = g.createState(rnd);
    for (let i = 0; i < 60 && state.status !== "over"; i++) {
      if (state.status === "levelclear") g.nextLevel(state);
      const moves = [];
      for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (x + dx < g.W && y + dy < g.H && g.isValidSwap(state.board, { x, y }, { x: x + dx, y: y + dy })) moves.push([{ x, y }, { x: x + dx, y: y + dy }]);
      }
      assert.ok(moves.length > 0);
      const [a, b] = moves[Math.floor(rnd() * moves.length)];
      assert.equal(g.trySwap(state, a, b).valid, true);
      assert.ok(full(state.board));
      assert.equal(g.findGroups(state.board).length, 0);
      assert.ok(g.findMove(state.board));
    }
  }
});

test("levelConfig: world 1 has 100 levels, difficulty only ever grows", () => {
  assert.equal(g.WORLD_SIZE, 100);
  assert.equal(g.MAX_LEVEL, 200);
  let prev = g.levelConfig(1);
  for (let n = 2; n <= g.WORLD_SIZE; n++) {
    const c = g.levelConfig(n);
    assert.equal(c.level, n);
    assert.ok(c.target >= prev.target, `target at ${n}`);
    assert.ok(c.moves <= prev.moves, `moves at ${n}`);
    assert.deepEqual(c.layout, { rocks: [], cages: [] });
    prev = c;
  }
  assert.ok(prev.target > g.levelConfig(1).target);
  assert.ok(prev.moves < g.levelConfig(1).moves);
  assert.equal(g.levelConfig(0).level, 1);
  assert.equal(g.levelConfig(500).level, 200);
});

test("world 2: 100 levels with rocks and cages, valid boards, deterministic layouts", () => {
  for (let n = 101; n <= 200; n++) {
    const c = g.levelConfig(n);
    assert.equal(c.level, n);
    assert.deepEqual(c.layout, g.levelConfig(n).layout);
    const rocks = new Set(c.layout.rocks.map(([x, y]) => y * g.W + x));
    assert.ok(c.layout.rocks.length >= 4 && c.layout.rocks.length <= 20, `rocks at ${n}`);
    assert.equal(rocks.size, c.layout.rocks.length);
    assert.ok(c.layout.cages.length <= 20);
    for (const [x, y, hp] of c.layout.cages) {
      assert.ok(x >= 0 && x < g.W && y >= 0 && y < g.H);
      assert.ok(!rocks.has(y * g.W + x), `cage on a rock at ${n}`);
      assert.ok(hp === 1 || hp === 2);
    }
    const state = g.createState(mulberry32(n), n);
    assert.equal(g.findGroups(state.board).length, 0, `matches at start of ${n}`);
    assert.ok(g.findMove(state.board), `no move at ${n}`);
    assert.equal(state.board.flat().filter((c2) => c2.t === g.ROCK).length, c.layout.rocks.length);
    assert.equal(g.cagesLeft(state.board), c.layout.cages.length);
  }
  assert.equal(g.levelConfig(101).layout.cages.length, 0);
  assert.ok(g.levelConfig(200).layout.cages.length >= 10);
  assert.ok(g.levelConfig(200).layout.cages.length > g.levelConfig(120).layout.cages.length);
});

test("starsFor: more moves left means more stars", () => {
  assert.equal(g.starsFor(15, 25), 3);
  assert.equal(g.starsFor(7, 25), 2);
  assert.equal(g.starsFor(0, 25), 1);
});

test("startLevel resets the level and uses its gem types", () => {
  const state = g.createState(mulberry32(9), 1);
  g.startLevel(state, 60);
  assert.equal(state.level, 60);
  assert.equal(state.movesLeft, g.levelConfig(60).moves);
  assert.equal(state.target, g.levelConfig(60).target);
  assert.equal(state.score, 0);
  const t = new Set(g.createState(mulberry32(2), 1).board.flat().map((c) => c.t));
  assert.ok(t.size <= g.levelConfig(1).types);
});

test("a level needs its score AND all cages broken", () => {
  const b = set(base(), [[0, 0, 4], [1, 0, 4], [2, 1, 4]]);
  b[7][7].c = 2; // far away from the action
  const state = stateWith(b);
  state.score = state.target; // goal already reached
  g.trySwap(state, { x: 2, y: 0 }, { x: 2, y: 1 });
  assert.equal(state.status, "play");
  state.board[7][7].c = 0; // cage gone: the next move clears the level
  const [a2, b2] = g.findMove(state.board);
  g.trySwap(state, a2, b2);
  assert.equal(state.status, "levelclear");
});

test("last level cannot advance", () => {
  const state = g.createState(mulberry32(4), g.MAX_LEVEL);
  state.status = "levelclear";
  assert.equal(g.nextLevel(state), false);
});

test("endless mode: no goal, no move limit, never ends", () => {
  const state = g.startEndless(g.createState(mulberry32(11), 5));
  assert.equal(state.endless, true);
  for (let i = 0; i < 40; i++) {
    const [a, b] = g.findMove(state.board);
    assert.equal(g.trySwap(state, a, b).valid, true);
    assert.equal(state.status, "play");
  }
  assert.equal(state.movesLeft, Infinity);
  assert.ok(state.score > 0);
  g.startLevel(state, 2);
  assert.equal(state.endless, false);
  assert.ok(Number.isFinite(state.movesLeft));
});

test("ensurePlayable reshuffles a board without valid moves", () => {
  // Rows alternate between two gem patterns that never allow a match with one swap.
  const dead = Array.from({ length: g.H }, (_, y) => Array.from({ length: g.W }, (_, x) => g.gem(((x >> 1) + 2 * (y >> 1) + (x + y) % 2 * 3) % 6)));
  let board = dead;
  if (g.findMove(board) || g.findGroups(board).length) {
    // Fallback: search seeded boards for one that is stuck.
    board = null;
    for (let seed = 1; seed < 20000 && !board; seed++) {
      const rnd = mulberry32(seed);
      const b = Array.from({ length: g.H }, () => Array.from({ length: g.W }, () => g.gem(Math.floor(rnd() * 6))));
      if (!g.findGroups(b).length && !g.findMove(b)) board = b;
    }
  }
  assert.ok(board, "need a stuck board for this test");
  assert.equal(g.findMove(board), null);
  const state = stateWith(board);
  const before = board.flat().map((c) => c.t).sort();
  assert.equal(g.ensurePlayable(state), true);
  assert.ok(g.findMove(state.board));
  assert.equal(g.findGroups(state.board).length, 0);
  assert.deepEqual(state.board.flat().map((c) => c.t).sort(), before);
  assert.equal(g.ensurePlayable(state), false); // playable boards are left alone
});

function endlessWith(board, powerups) {
  const state = stateWith(board);
  state.endless = true;
  state.moves = state.movesLeft = state.target = Infinity;
  state.powerups = { hammer: 0, bomb: 0, rainbow: 0, ...powerups };
  return state;
}

test("powerups: hammer removes one gem, costs the item but no move", () => {
  const state = endlessWith(base(), { hammer: 2 });
  const res = g.usePowerup(state, "hammer", { x: 3, y: 3 });
  assert.equal(res.valid, true);
  assert.equal(state.powerups.hammer, 1);
  assert.equal(state.movesLeft, Infinity);
  assert.equal(res.steps[0].cleared.length, 1);
  assert.deepEqual(res.steps[0].cleared[0], { x: 3, y: 3 });
  assert.ok(full(state.board));
});

test("powerups: bomb clears the 3x3 area, also at the edge", () => {
  const state = endlessWith(base(), { bomb: 1 });
  const res = g.usePowerup(state, "bomb", { x: 0, y: 0 });
  assert.equal(res.steps[0].cleared.length, 4);
  const mid = endlessWith(base(), { bomb: 1 });
  assert.equal(g.usePowerup(mid, "bomb", { x: 4, y: 4 }).steps[0].cleared.length, 9);
});

test("powerups: rainbow clears every gem of the chosen colour", () => {
  const b = base();
  const t = b[2][2].t;
  const count = b.flat().filter((c) => c.t === t).length;
  const res = g.usePowerup(endlessWith(b, { rainbow: 1 }), "rainbow", { x: 2, y: 2 });
  assert.equal(res.steps[0].cleared.length, count);
});

test("powerups: need stock and a valid target, work in normal levels too", () => {
  const empty = endlessWith(base(), {});
  assert.equal(g.usePowerup(empty, "hammer", { x: 1, y: 1 }).valid, false);
  const inLevel = stateWith(base());
  inLevel.powerups = { hammer: 3, bomb: 0, rainbow: 0 };
  const res = g.usePowerup(inLevel, "hammer", { x: 1, y: 1 });
  assert.equal(res.valid, true);
  assert.equal(inLevel.powerups.hammer, 2);
  assert.equal(inLevel.movesLeft, g.levelConfig(1).moves); // costs no move
  const state = endlessWith(base(), { hammer: 1 });
  assert.equal(g.usePowerup(state, "hammer", { x: 9, y: 1 }).valid, false);
  assert.equal(g.usePowerup(state, "nuke", { x: 1, y: 1 }).valid, false);
  assert.equal(state.powerups.hammer, 1);
});

// 4-in-a-row at row 3 (type 5) by swapping (2,4) up, see the special-gem tests.
function fourMatch() {
  return set(base(), [[0, 3, 5], [1, 3, 5], [3, 3, 5], [2, 4, 5]]);
}

test("powerups: a combo of 4+ in endless earns one about half of the time", () => {
  let earned = 0;
  const N = 400;
  for (let seed = 1; seed <= N; seed++) {
    const state = endlessWith(fourMatch(), {});
    state.random = mulberry32(seed);
    const res = g.trySwap(state, { x: 2, y: 3 }, { x: 2, y: 4 });
    const total = Object.values(state.powerups).reduce((a, n) => a + n, 0);
    assert.equal(total, res.awards.length);
    assert.ok(res.steps[0].combos === 1);
    if (res.awards.length) earned++;
  }
  assert.ok(earned > N * 0.4 && earned < N * 0.6, `earned ${earned}/${N}`);
});

test("powerups: plain 3-matches never earn one", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const b = set(base(), [[0, 0, 4], [1, 0, 4], [2, 1, 4]]);
    const state = endlessWith(b, {});
    state.random = mulberry32(seed);
    const res = g.trySwap(state, { x: 2, y: 0 }, { x: 2, y: 1 });
    assert.equal(res.steps[0].combos, 0);
    assert.deepEqual(res.steps[0].cleared.length, 3);
  }
});

test("powerups: normal levels never award any", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const state = stateWith(fourMatch());
    state.random = mulberry32(seed);
    assert.deepEqual(g.trySwap(state, { x: 2, y: 3 }, { x: 2, y: 4 }).awards, []);
  }
});

test("the powerup inventory carries over between levels and modes", () => {
  const state = g.createState(mulberry32(1), 1, { hammer: 2, bomb: "x", rainbow: -5 });
  assert.deepEqual(state.powerups, { hammer: 2, bomb: 0, rainbow: 0 });
  g.startLevel(state, 5);
  g.startEndless(state);
  g.startLevel(state, 2);
  assert.deepEqual(state.powerups, { hammer: 2, bomb: 0, rainbow: 0 });
});

test("powerup types are weighted: hammer > bomb > rainbow", () => {
  const rnd = mulberry32(77);
  const n = { hammer: 0, bomb: 0, rainbow: 0 };
  const N = 10000;
  for (let i = 0; i < N; i++) n[g.pickPowerup(rnd)]++;
  assert.ok(n.hammer > n.bomb && n.bomb > n.rainbow, JSON.stringify(n));
  for (const p of g.POWERUPS) {
    const expected = g.POWERUP_WEIGHTS[p] / 100;
    assert.ok(Math.abs(n[p] / N - expected) < 0.03, `${p}: ${n[p] / N}`);
  }
  assert.equal(g.pickPowerup(() => 0), "hammer");
  assert.equal(g.pickPowerup(() => 0.999999), "rainbow");
});

const rock = () => g.gem(g.ROCK, "rock");
const cage = (b, x, y, hp) => { b[y][x].c = hp; return b; };

test("rocks and caged gems cannot be swapped", () => {
  const b = set(base(), [[0, 0, 4], [1, 0, 4], [2, 1, 4]]);
  assert.equal(g.isValidSwap(b, { x: 2, y: 0 }, { x: 2, y: 1 }), true);
  const r = g.cloneBoard(b);
  r[0][2] = rock();
  assert.equal(g.isValidSwap(r, { x: 2, y: 0 }, { x: 2, y: 1 }), false);
  assert.equal(g.isValidSwap(cage(g.cloneBoard(b), 2, 1, 1), { x: 2, y: 0 }, { x: 2, y: 1 }), false);
  assert.equal(g.isValidSwap(cage(g.cloneBoard(b), 2, 0, 1), { x: 2, y: 0 }, { x: 2, y: 1 }), false);
});

test("gravity works per segment: rocks stay and gems do not fall through them", () => {
  const b = set(base(), [[0, 7, 3], [1, 7, 3], [2, 6, 3]]);
  b[4][2] = rock();
  const above = b[3][2].t;
  const res = g.trySwap(stateWith(b), { x: 2, y: 6 }, { x: 2, y: 7 });
  const board = res.steps[0].board;
  assert.equal(res.valid, true);
  assert.equal(board[4][2].t, g.ROCK);
  assert.equal(board[3][2].t, above); // above the rock nothing moved
  assert.equal(board[7][2].t, 4); // below the rock the segment closed up...
  assert.equal(board[6][2].t, 0);
  assert.ok(board[5][2].t >= 0 && board[5][2].t < g.TYPES); // ...and refilled from its own top
});

test("matches do not clear rocks; specials and powerups skip them too", () => {
  const b = base();
  b[2][2] = rock();
  const state = endlessWith(b, { bomb: 1, hammer: 1 });
  const res = g.usePowerup(state, "bomb", { x: 1, y: 1 });
  const cleared = res.steps[0].cleared.map((p) => `${p.x},${p.y}`);
  assert.equal(cleared.length, 8);
  assert.ok(!cleared.includes("2,2"));
  assert.equal(state.board[2][2].t, g.ROCK);
  assert.equal(g.usePowerup(state, "hammer", { x: 2, y: 2 }).valid, false);
});

test("a cage takes a hit when a neighbour clears and breaks without clearing its gem", () => {
  const b = cage(set(base(), [[0, 7, 3], [1, 7, 3], [2, 6, 3]]), 3, 7, 1);
  const gemType = b[7][3].t;
  const res = g.trySwap(stateWith(b), { x: 2, y: 6 }, { x: 2, y: 7 });
  const step = res.steps[0];
  assert.deepEqual(step.broken, [{ x: 3, y: 7 }]);
  assert.ok(!step.cleared.some((p) => p.x === 3 && p.y === 7));
  assert.equal(step.board[7][3].t, gemType);
  assert.equal(step.board[7][3].c, 0);
});

test("a cage with two hits survives the first one", () => {
  const b = cage(set(base(), [[0, 7, 3], [1, 7, 3], [2, 6, 3]]), 3, 7, 2);
  const state = stateWith(b);
  const res = g.trySwap(state, { x: 2, y: 6 }, { x: 2, y: 7 });
  assert.deepEqual(res.steps[0].damaged, [{ x: 3, y: 7, c: 1 }]);
  assert.deepEqual(res.steps[0].broken, []);
  assert.equal(res.steps[0].board[7][3].c, 1);
  assert.equal(g.cagesLeft(state.board) >= 1, true);
});

test("a caged gem that is part of the match is cleared when its cage breaks", () => {
  const b = cage(set(base(), [[0, 7, 3], [1, 7, 3], [2, 6, 3]]), 1, 7, 1);
  const res = g.trySwap(stateWith(b), { x: 2, y: 6 }, { x: 2, y: 7 });
  const step = res.steps[0];
  assert.deepEqual(step.broken, [{ x: 1, y: 7 }]);
  assert.equal(step.cleared.length, 3);
});

test("shuffle keeps rocks and cages in place", () => {
  const state = g.createState(mulberry32(5), 150);
  const fixed = [];
  state.board.forEach((row, y) => row.forEach((c, x) => { if (g.isFixed(c)) fixed.push([x, y, c.t, c.c]); }));
  assert.ok(fixed.length > 0);
  g.shuffle(state);
  for (const [x, y, t, c] of fixed) {
    assert.equal(state.board[y][x].t, t);
    assert.equal(state.board[y][x].c, c);
  }
  assert.equal(g.findGroups(state.board).length, 0);
  assert.ok(g.findMove(state.board));
});

test("invariant: random play on world 2 levels keeps boards full, stable and playable", () => {
  for (const level of [101, 120, 150, 180, 200]) {
    const rnd = mulberry32(level);
    const state = g.createState(rnd, level);
    for (let i = 0; i < 40 && state.status === "play"; i++) {
      const moves = [];
      for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (x + dx < g.W && y + dy < g.H && g.isValidSwap(state.board, { x, y }, { x: x + dx, y: y + dy })) moves.push([{ x, y }, { x: x + dx, y: y + dy }]);
      }
      assert.ok(moves.length > 0);
      const [a, b] = moves[Math.floor(rnd() * moves.length)];
      assert.equal(g.trySwap(state, a, b).valid, true);
      assert.ok(full(state.board));
      assert.equal(g.findGroups(state.board).length, 0);
      assert.ok(g.findMove(state.board));
    }
  }
});

test("debug: awardChance overrides the combo award chance", () => {
  for (const [chance, expectAward] of [[1, true], [0, false]]) {
    for (let seed = 1; seed <= 30; seed++) {
      const state = endlessWith(set(base(), [[0, 3, 5], [1, 3, 5], [3, 3, 5], [2, 4, 5]]), {});
      state.random = mulberry32(seed);
      state.awardChance = chance;
      const res = g.trySwap(state, { x: 2, y: 3 }, { x: 2, y: 4 });
      assert.equal(res.awards.length >= 1, expectAward);
    }
  }
});
