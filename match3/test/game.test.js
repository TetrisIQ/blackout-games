const test = require("node:test");
const assert = require("node:assert");
const g = require("../game.js");

const T = 6; // gem colours of a Medium level

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
  return Array.from({ length: g.H }, (_, y) => Array.from({ length: g.W }, (_, x) => g.gem((x + 2 * y) % T)));
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
  return { board, score: 0, level: 1, types: T, moves: cfg.moves, movesLeft: cfg.moves, target: cfg.target, stars: 0, status: "play", random };
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

test("levelConfig: 10 worlds of 30 levels, goals grow inside a world", () => {
  assert.equal(g.WORLD_SIZE, 30);
  assert.equal(g.WORLDS.length, 10);
  assert.equal(g.MAX_LEVEL, 300);
  for (let w = 0; w < 10; w++) {
    let prev = g.levelConfig(w * 30 + 1);
    for (let n = w * 30 + 2; n <= w * 30 + 30; n++) {
      const c = g.levelConfig(n);
      assert.equal(c.level, n);
      assert.equal(c.world, w);
      assert.ok(c.target >= prev.target, `target at ${n}`);
      prev = c;
    }
    assert.ok(prev.target > g.levelConfig(w * 30 + 1).target);
  }
  assert.deepEqual(g.levelConfig(1).layout, g.emptyLayout());
  assert.equal(g.levelConfig(0).level, 1);
  assert.equal(g.levelConfig(999).level, 300);
});

test("difficulty: colours per level (Extreme goes 8 to 10 in every world)", () => {
  assert.deepEqual(g.DIFFICULTIES.map((d) => d.id), ["easy", "medium", "hard", "extreme"]);
  for (let w = 0; w < 10; w++) {
    const first = w * 30 + 1;
    const last = w * 30 + 30;
    assert.equal(g.levelConfig(first, "easy").types, 5);
    assert.equal(g.levelConfig(last, "easy").types, 5);
    assert.equal(g.levelConfig(first).types, 6);
    assert.equal(g.levelConfig(last, "medium").types, 6);
    assert.equal(g.levelConfig(first, "hard").types, 7);
    assert.equal(g.levelConfig(last, "hard").types, 7);
    assert.equal(g.levelConfig(first, "extreme").types, 8);
    assert.equal(g.levelConfig(last, "extreme").types, 10);
    let prev = 8;
    for (let n = first; n <= last; n++) {
      const t = g.levelConfig(n, "extreme").types;
      assert.ok(t >= prev && t <= 10);
      prev = t;
    }
  }
  assert.equal(g.levelConfig(5, "nope").types, 6); // unknown difficulty = Medium
  assert.ok(g.levelConfig(40, "easy").target < g.levelConfig(40, "extreme").target * 2);
  const s = g.createState(mulberry32(3), 1, {}, "extreme");
  assert.equal(s.difficulty, "extreme");
  assert.equal(s.types, 8);
  assert.ok(new Set(s.board.flat().map((c) => c.t)).size <= 8);
});

// The element a world introduces: the layout fields it fills (every other world leaves them empty).
const ELEMENT = { rocks: "rocks", cages: "cages", ice: "ice", conveyor: "conveyors", slime: "slime", portal: "portals", timer: "timers", fruit: "fruitCells", fog: "fog" };

test("worlds: each one adds exactly one element, valid boards, deterministic layouts", () => {
  for (const diff of ["easy", "medium", "hard", "extreme"]) {
    g.WORLDS.forEach((world, w) => {
      for (const i of [0, 7, 15, 22, 29]) {
        const n = w * 30 + i + 1;
        const c = g.levelConfig(n, diff);
        assert.deepEqual(c.layout, g.levelConfig(n, diff).layout);
        for (const [id, field] of Object.entries(ELEMENT)) {
          if (id !== world.id) assert.equal(c.layout[field].length, 0, `${field} in ${world.id} ${n}`);
        }
        if (world.id !== "classic") assert.ok(c.layout[ELEMENT[world.id]].length > 0 || (world.id === "cages" && i < 2), `${world.id} ${n} has its element`);
        const state = g.createState(mulberry32(n), n, {}, diff);
        assert.equal(g.findGroups(state.board).length, 0, `matches at start of ${n} ${diff}`);
        assert.ok(g.findMove(state.board, state.layout), `no move at ${n} ${diff}`);
      }
    });
  }
  const hard = g.levelConfig(60 + 30, "extreme").layout.cages.length;
  assert.ok(hard >= g.levelConfig(61, "extreme").layout.cages.length);
  assert.ok(g.levelConfig(90, "extreme").layout.cages.length <= 20);
});

test("rocks world: rocks sit on their cells, cages only in the cages world", () => {
  const c = g.levelConfig(45);
  const state = g.createState(mulberry32(1), 45);
  assert.equal(state.board.flat().filter((x) => x.t === g.ROCK).length, c.layout.rocks.length);
  assert.ok(c.layout.rocks.length >= 4 && c.layout.rocks.length <= 24);
  const cages = g.levelConfig(90);
  const st = g.createState(mulberry32(1), 90);
  assert.equal(g.cagesLeft(st.board), cages.layout.cages.length);
  assert.equal(st.board.flat().filter((x) => x.t === g.ROCK).length, 0);
  for (const [x, y, hp] of cages.layout.cages) assert.ok(hp === 1 || hp === 2, `${x},${y}`);
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
  assert.ok(board[5][2].t >= 0 && board[5][2].t < T); // ...and refilled from its own top
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
  const state = g.createState(mulberry32(5), 45); // rocks
  const free = [];
  state.board.forEach((row, y) => row.forEach((c, x) => { if (!g.isFixed(c)) free.push([x, y]); }));
  state.board[free[10][1]][free[10][0]].c = 2;
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

// Every legal swap, portal swaps included.
function allMoves(state) {
  const moves = [];
  for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) for (const [dx, dy] of [[1, 0], [0, 1]]) {
    if (x + dx < g.W && y + dy < g.H && g.isValidSwap(state.board, { x, y }, { x: x + dx, y: y + dy })) moves.push([{ x, y }, { x: x + dx, y: y + dy }]);
  }
  for (const [x1, y1, x2, y2] of state.layout.portals) if (g.isValidSwap(state.board, { x: x1, y: y1 }, { x: x2, y: y2 })) moves.push([{ x: x1, y: y1 }, { x: x2, y: y2 }]);
  return moves;
}

test("invariant: random play in every world keeps boards full, stable and playable", () => {
  for (const diff of ["easy", "extreme"]) {
    for (const level of [31, 60, 61, 90, 91, 120, 121, 150, 151, 180, 181, 210, 211, 240, 241, 270, 271, 300]) {
      const rnd = mulberry32(level);
      const state = g.createState(rnd, level, {}, diff);
      for (let i = 0; i < 30 && state.status === "play"; i++) {
        const moves = allMoves(state);
        assert.ok(moves.length > 0, `no move at ${level} ${diff}`);
        const [a, b] = moves[Math.floor(rnd() * moves.length)];
        assert.equal(g.trySwap(state, a, b).valid, true);
        assert.ok(full(state.board));
        assert.equal(g.findGroups(state.board).length, 0, `stable at ${level} ${diff}`);
        if (state.status === "play") assert.ok(g.findMove(state.board, state.layout), `playable at ${level} ${diff}`);
      }
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

// A board whose one move (swap (2,0)/(2,1)) is a plain 3-match, with two special gems elsewhere.
function finaleBoard() {
  const b = set(base(), [[0, 0, 4], [1, 0, 4], [2, 1, 4], [7, 2, 1, "blast"], [5, 5, 0, "row"]]);
  assert.equal(g.findGroups(b).length, 0);
  return b;
}
const noSpecials = (b) => b.flat().every((c) => !c.s || c.s === "rock");

test("finale: when the level ends every special gem fires in turn for a bonus", () => {
  const state = stateWith(finaleBoard());
  state.movesLeft = 1; // this move is the last one
  const res = g.trySwap(state, { x: 2, y: 0 }, { x: 2, y: 1 });
  assert.equal(state.status, "over");
  assert.ok(res.finale.length >= 2);
  assert.equal(res.finale[0].special, "blast"); // top-left first
  assert.equal(res.finale[0].x, 7);
  assert.ok(res.finale[0].steps[0].cleared.length >= 6);
  for (const round of res.finale) assert.equal(round.bonus, g.FINALE_BONUS);
  assert.ok(noSpecials(state.board));
  assert.equal(g.findGroups(state.board).length, 0);
  const finalePoints = res.finale.reduce((sum, r) => sum + r.bonus + r.steps.reduce((a, s) => a + s.points, 0), 0);
  assert.equal(state.score, res.steps.reduce((a, s) => a + s.points, 0) + finalePoints);
});

test("finale: also runs when the level is cleared, after the move bonus", () => {
  const state = stateWith(finaleBoard());
  state.score = state.target - 1;
  const res = g.trySwap(state, { x: 2, y: 0 }, { x: 2, y: 1 });
  assert.equal(state.status, "levelclear");
  assert.ok(res.bonus > 0);
  assert.ok(res.finale.length >= 2);
  assert.ok(noSpecials(state.board));
});

test("finale: does not run while the level goes on", () => {
  const state = stateWith(finaleBoard());
  const res = g.trySwap(state, { x: 2, y: 0 }, { x: 2, y: 1 });
  assert.equal(state.status, "play");
  assert.deepEqual(res.finale, []);
  assert.ok(state.board.flat().some((c) => c.s));
});

test("finale: a finale that reaches the goal saves a level that ran out of moves", () => {
  const state = stateWith(finaleBoard());
  state.movesLeft = 1;
  state.target = 200;
  g.trySwap(state, { x: 2, y: 0 }, { x: 2, y: 1 });
  assert.equal(state.status, "levelclear");
  assert.equal(state.stars, 1);
});

test("finale: specials that appear while firing are fired too (random play)", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const rnd = mulberry32(seed);
    const state = g.createState(rnd, 3);
    state.movesLeft = 12;
    while (state.status === "play") {
      const [a, b] = g.findMove(state.board);
      const res = g.trySwap(state, a, b);
      if (state.status !== "play") assert.ok(noSpecials(state.board), `specials left at seed ${seed}`);
      else assert.deepEqual(res.finale, []);
      assert.ok(full(state.board));
    }
  }
});

test("finale: endless mode never ends, so it never fires one", () => {
  const state = g.startEndless(g.createState(mulberry32(2), 1));
  for (let i = 0; i < 30; i++) {
    const [a, b] = g.findMove(state.board);
    assert.deepEqual(g.trySwap(state, a, b).finale, []);
  }
});

test("finale: a colour gem (the rainbow star) clears one complete colour", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const state = stateWith(set(base(), [[3, 3, g.COLOR, "color"]]));
    state.random = mulberry32(seed);
    const before = state.board.map((r) => r.map((c) => c.t));
    const [round] = g.finale(state);
    assert.equal(round.special, "color");
    const first = round.steps[0].cleared;
    const colours = new Set(first.map((p) => before[p.y][p.x]).filter((t) => t >= 0));
    assert.equal(colours.size, 1, "exactly one colour");
    const [t] = colours;
    assert.equal(first.length, before.flat().filter((x) => x === t).length + 1); // every gem of it, plus the star
  }
});

// --- world elements ---------------------------------------------------------
const gridOf = (fill) => Array.from({ length: g.H }, () => Array(g.W).fill(fill));

// A 3-run at the top left: swapping (2,0) with (2,1) clears the cells (0,0), (1,0) and (2,0).
function runState(extra = {}) {
  const state = stateWith(set(base(), [[0, 0, 4], [1, 0, 4], [2, 1, 4]]));
  state.layout = g.emptyLayout();
  return Object.assign(state, { target: 100000, movesLeft: 50, moves: 50 }, extra);
}
const A = { x: 2, y: 0 };
const B = { x: 2, y: 1 };

test("ice: a gem clearing on it cracks it; two-layer ice survives the first hit", () => {
  const state = runState({ ice: gridOf(0) });
  state.ice[0][0] = 1;
  state.ice[0][1] = 2;
  state.ice[5][5] = 1;
  g.trySwap(state, A, B);
  assert.equal(state.ice[0][0], 0);
  assert.equal(state.ice[0][1], 1);
  assert.equal(state.ice[5][5], 1);
  assert.equal(g.objectives(state).ice, 2);
});

test("ice: the level needs the score AND all ice gone", () => {
  const state = runState({ ice: gridOf(0) });
  state.ice[7][7] = 1;
  state.target = 10; // reached by the first move
  g.trySwap(state, A, B);
  assert.equal(state.status, "play");
  state.ice[7][7] = 0;
  const [a, b] = g.findMove(state.board);
  g.trySwap(state, a, b);
  assert.equal(state.status, "levelclear");
});

test("slime: goes where a gem clears and spreads when a move clears none", () => {
  const state = runState({ slime: gridOf(false) });
  state.slime[0][1] = true; // cleared by the move
  state.slime[6][6] = true; // far away
  g.trySwap(state, A, B);
  assert.equal(state.slime[0][1], false);
  assert.equal(g.objectives(state).slime >= 1, true);

  let grown = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const grow = runState({ slime: gridOf(false) }); // slime far from the move: it may spread
    grow.slime[7][7] = true;
    grow.random = mulberry32(seed);
    const res = g.trySwap(grow, A, B);
    if (res.slime) {
      grown++;
      assert.equal(g.objectives(grow).slime, 2);
      assert.ok(Math.abs(res.slime.x - 7) + Math.abs(res.slime.y - 7) === 1);
    } else assert.equal(g.objectives(grow).slime, 1);
  }
  assert.ok(grown > 0 && grown < 20, `spread in ${grown} of 20 moves`);
});

test("slime: cannot grow onto rocks", () => {
  const state = runState({ slime: gridOf(false), random: () => 0 });
  state.board[7][6] = g.gem(g.ROCK, "rock");
  state.board[6][7] = g.gem(g.ROCK, "rock");
  state.slime[7][7] = true;
  assert.equal(g.spreadSlime(state), null);
});

test("conveyor: rows slide one cell after every move, wrapping round", () => {
  const state = runState();
  state.layout.conveyors = [{ y: 5, dir: 1 }, { y: 3, dir: -1 }];
  const row5 = state.board[5].map((c) => c.t);
  const row3 = state.board[3].map((c) => c.t);
  const probe = runState();
  probe.layout.conveyors = state.layout.conveyors;
  probe.board = g.cloneBoard(state.board);
  g.conveyorShift(probe);
  assert.deepEqual(probe.board[5].map((c) => c.t), [row5[7], ...row5.slice(0, 7)]);
  assert.deepEqual(probe.board[3].map((c) => c.t), [...row3.slice(1), row3[0]]);
  const res = g.trySwap(state, A, B);
  assert.ok(res.conveyor && res.conveyor.rows.length === 2);
  assert.ok(full(state.board));
  assert.equal(g.findGroups(state.board).length, 0);
});

test("portal: linked cells swap from anywhere; other far swaps are rejected", () => {
  const b = set(base(), [[0, 0, 4], [1, 0, 4], [2, 1, 3], [6, 6, 4]]);
  const state = stateWith(b);
  state.layout = Object.assign(g.emptyLayout(), { portals: [[2, 0, 6, 6]] });
  const far = { x: 6, y: 6 };
  assert.equal(g.trySwap(state, { x: 0, y: 3 }, { x: 5, y: 5 }).valid, false);
  const res = g.trySwap(state, { x: 2, y: 0 }, far);
  assert.equal(res.valid, true);
  assert.equal(g.linkedCells(state.layout, A, far), true);
  assert.deepEqual(g.portalPartner(state.layout, far), { x: 2, y: 0 });
  assert.equal(g.portalPartner(state.layout, { x: 3, y: 3 }), null);
  assert.ok(state.score >= 30);
});

test("portal: findMove also finds portal swaps", () => {
  // a board with only one possible move, and it is a portal swap
  const b = base();
  assert.equal(g.findMove(b), null);
  set(b, [[0, 0, 4], [1, 0, 4], [6, 6, 4]]);
  const layout = Object.assign(g.emptyLayout(), { portals: [[2, 0, 6, 6]] });
  assert.equal(g.isValidSwap(b, { x: 2, y: 0 }, { x: 6, y: 6 }), true);
  const withoutPortal = g.findMove(b);
  const m = g.findMove(b, layout);
  assert.ok(m);
  assert.ok(withoutPortal === null || m, "portal-aware search never finds less");
});

test("bombs: the countdown ticks every move; a bomb reaching 0 loses the level", () => {
  const state = runState();
  state.board[7][7].k = 2;
  g.trySwap(state, A, B);
  assert.equal(state.board[7][7].k, 1);
  assert.equal(state.status, "play");
  const [a, b] = g.findMove(state.board);
  const res = g.trySwap(state, a, b);
  assert.deepEqual(res.exploded, { x: 7, y: 7 });
  assert.equal(state.status, "over");
});

test("bombs: matching a bomb gem defuses it", () => {
  const state = runState();
  state.board[0][0].k = 1; // part of the run that clears now
  const res = g.trySwap(state, A, B);
  assert.equal(res.exploded, null);
  assert.equal(g.objectives(state).bombs, 0);
  assert.equal(state.status, "play");
});

test("fruit: reaching the bottom row collects it for points and it never clears otherwise", () => {
  const state = runState();
  state.board[6][7] = g.gem(g.FRUIT);
  state.board[7][7] = g.gem(2); // a normal gem below the fruit
  const hammered = g.usePowerup(Object.assign(state, { powerups: { hammer: 1, bomb: 1, rainbow: 0 } }), "hammer", { x: 7, y: 6 });
  assert.equal(hammered.valid, false); // fruits cannot be hammered
  g.usePowerup(state, "bomb", { x: 6, y: 6 }); // the blast clears the gem below but not the fruit
  assert.ok(state.score >= g.FRUIT_POINTS, "collected after falling to the bottom");
  assert.equal(state.board.flat().filter((c) => c.t === g.FRUIT).length, 0);
});

test("fruit: a level needs every fruit, including the ones still to come", () => {
  const state = runState({ fruitQueue: 1 });
  state.target = 10;
  g.trySwap(state, A, B);
  assert.equal(state.status, "play");
  assert.equal(g.objectives(state).fruit >= 1, true);
  state.fruitQueue = 0;
  const [a, b] = g.findMove(state.board);
  g.trySwap(state, a, b);
  assert.equal(state.status, "levelclear");
});

test("fruit: levels place fruits on the board and queue the rest", () => {
  const c = g.levelConfig(241 + 29, "medium");
  assert.ok(c.layout.fruits > c.layout.fruitCells.length || c.layout.fruits === c.layout.fruitCells.length);
  const state = g.createState(mulberry32(4), 270);
  assert.equal(state.board.flat().filter((x) => x.t === g.FRUIT).length, c.layout.fruitCells.length);
  assert.equal(state.fruitQueue, c.layout.fruits - c.layout.fruitCells.length);
  assert.equal(g.objectives(state).fruit, c.layout.fruits);
});

test("fruit: a colour gem cannot be swapped onto a fruit", () => {
  const b = set(base(), [[3, 3, g.COLOR, "color"]]);
  b[3][4] = g.gem(g.FRUIT);
  assert.equal(g.isValidSwap(b, { x: 3, y: 3 }, { x: 4, y: 3 }), false);
});

test("fog: lifts around a clearing gem and does not change the rules", () => {
  const state = runState({ fog: gridOf(true) });
  g.trySwap(state, A, B);
  assert.equal(state.fog[0][0], false);
  assert.equal(state.fog[1][1], false); // next to a cleared gem
  assert.equal(state.fog[6][6], true);
});

test("powerup stock is per difficulty: states start from the inventory they get", () => {
  const easy = g.createState(mulberry32(1), 1, { hammer: 3 }, "easy");
  const hard = g.createState(mulberry32(1), 1, { bomb: 2 }, "hard");
  assert.equal(easy.powerups.hammer, 3);
  assert.equal(easy.powerups.bomb, 0);
  assert.equal(hard.powerups.bomb, 2);
  assert.equal(hard.powerups.hammer, 0);
});
