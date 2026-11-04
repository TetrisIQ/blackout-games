// Match 3: 8x8 board, swap neighbours to line up 3+, special gems, cascades, levels with a move limit.
const GAME_ID = "match3";
const W = 8;
const H = 8;
const TYPES = 6; // most gem types a level can use
const COLOR = -1; // type of a colour gem; it never matches on its own
const ROCK = -2; // type of a blocked cell: never moves, never clears
const WORLD_SIZE = 100;
const MAX_LEVEL = 200; // world 1 (classic) + world 2 (walls and cages)
const BONUS_PER_MOVE = 50;
const POWERUPS = ["hammer", "bomb", "rainbow"]; // earned in endless mode, usable everywhere
const AWARD_CHANCE = 0.5; // per combo of 4+ gems in endless mode
const POWERUP_WEIGHTS = { hammer: 55, bomb: 30, rainbow: 15 }; // which powerup an award is: common to rare
const TARGET_BASE = 1100;
const TARGET_STEP = 18;
const TARGET_CURVE = 0;

// --- Logic (no DOM; testable with node) ---------------------------------
// A gem is { t: type 0..TYPES-1 (or COLOR / ROCK), s: null | "row" | "col" | "blast" | "color" | "rock", c: cage hits left }.
// Rocks and caged gems are fixed: they cannot be swapped and do not fall. A cage takes a hit whenever its gem or a
// neighbouring cell clears (match, special or powerup) and breaks after c hits; the gem is then a normal gem.
// Cells are addressed as flat indexes y * W + x inside sets; positions are { x, y }.

const gem = (t, s = null, c = 0) => ({ t, s, c });
const isRock = (g) => !!g && g.t === ROCK;
const isFixed = (g) => !!g && (g.t === ROCK || g.c > 0);
const idx = (x, y) => y * W + x;
const at = (i) => ({ x: i % W, y: Math.floor(i / W) });
const inBoard = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const cloneBoard = (b) => b.map((r) => r.map((c) => c && { t: c.t, s: c.s, c: c.c || 0 }));
const cagesLeft = (b) => b.flat().filter((g) => g && g.c > 0).length;

// World 2 layouts: rock patterns (cells that are blocked) ...
const PATTERNS = [
  [[0, 0], [7, 0], [0, 7], [7, 7]],
  [[2, 2], [5, 2], [2, 5], [5, 5]],
  [[3, 3], [4, 3], [3, 4], [4, 4]],
  [[3, 0], [4, 0], [3, 7], [4, 7]],
  [[1, 3], [2, 3], [5, 4], [6, 4]],
  [[0, 0], [1, 0], [0, 1], [7, 0], [6, 0], [7, 1], [0, 7], [1, 7], [0, 6], [7, 7], [6, 7], [7, 6]],
  [[3, 2], [4, 2], [3, 5], [4, 5], [2, 3], [2, 4], [5, 3], [5, 4]],
  [[1, 1], [6, 1], [3, 3], [4, 4], [1, 6], [6, 6]],
  [[0, 3], [0, 4], [7, 3], [7, 4], [3, 0], [4, 0]],
  [[0, 0], [1, 0], [0, 1], [7, 7], [6, 7], [7, 6], [3, 3], [4, 4]],
  [[1, 3], [2, 3], [5, 3], [6, 3], [1, 4], [2, 4], [5, 4], [6, 4]],
  [[2, 1], [3, 1], [4, 5], [5, 5], [1, 4], [6, 2]],
];

// Ways to line up three with the caged gem at (x, y), not counting windows with a rock or another (immovable) cage.
function matchWindows(x, y, blocked) {
  const free = (xx, yy) => (inBoard(xx, yy) && !blocked.has(idx(xx, yy))) || (xx === x && yy === y);
  let n = 0;
  for (let k = 0; k < 3; k++) {
    if ([0, 1, 2].every((d) => free(x - k + d, y))) n++;
    if ([0, 1, 2].every((d) => free(x, y - k + d))) n++;
  }
  return n;
}

// ... plus cages on free cells. Deterministic per level; i = 0..99 within the world.
const layoutCache = new Map();
function makeLayout(i) {
  if (layoutCache.has(i)) return layoutCache.get(i);
  const cells = new Set(PATTERNS[i % PATTERNS.length].map(([x, y]) => idx(x, y)));
  if (i >= 50) for (const [x, y] of PATTERNS[(i * 5 + 3) % PATTERNS.length]) cells.add(idx(x, y));
  const rnd = seeded(1000 + i);
  const candidates = [];
  for (let n = 0; n < W * H; n++) if (!cells.has(n)) candidates.push(n);
  for (let k = candidates.length - 1; k > 0; k--) {
    const j = Math.floor(rnd() * (k + 1));
    [candidates[k], candidates[j]] = [candidates[j], candidates[k]];
  }
  const count = i < 5 ? 0 : Math.min(20, 2 + Math.floor((i - 5) / 5));
  const chosen = [];
  for (const n of candidates) {
    if (chosen.length >= count) break;
    const next = [...chosen, n];
    // every cage (old and new) keeps at least 2 windows free of rocks and of the other cages
    if (next.every((c) => matchWindows(c % W, Math.floor(c / W), new Set([...cells, ...next.filter((o) => o !== c)])) >= 2)) chosen.push(n);
  }
  const cages = chosen.map((n, k) => {
    const hp = (i >= 70 && k % 2 === 0) || (i >= 30 && k % 3 === 0) ? 2 : 1;
    return [n % W, Math.floor(n / W), hp];
  });
  const layout = { rocks: [...cells].map((n) => [n % W, Math.floor(n / W)]), cages };
  layoutCache.set(i, layout);
  return layout;
}

// Small seeded PRNG so layouts are the same every time.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Difficulty grows with the level: fewer moves, higher goal. World 2 (levels 101+) adds rocks and cages;
// all cages have to be broken as well as the score reached.
function levelConfig(level) {
  const n = Math.min(MAX_LEVEL, Math.max(1, Math.round(level)));
  if (n > WORLD_SIZE) {
    const i = n - WORLD_SIZE - 1;
    const layout = makeLayout(i);
    const hits = layout.cages.reduce((sum, c) => sum + c[2], 0);
    const moves = 22 + Math.ceil(hits * 0.8) - Math.floor(i / 20);
    return { level: n, types: TYPES, moves, target: Math.round((800 + 14 * i) / 50) * 50, layout };
  }
  const moves = 22 - Math.floor((n - 1) / 16);
  const target = Math.round((TARGET_BASE + TARGET_STEP * (n - 1) + TARGET_CURVE * (n - 1) * (n - 1)) / 50) * 50;
  return { level: n, types: TYPES, moves, target, layout: { rocks: [], cages: [] } };
}

// 3 stars with at least half the moves left, 2 with a quarter, else 1.
const starsFor = (movesLeft, moves) => (movesLeft * 2 >= moves ? 3 : movesLeft * 4 >= moves ? 2 : 1);

// Runs of 3+ in a row/column, merged into groups when they share a cell (L/T shapes).
function findGroups(board) {
  const runs = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; ) {
      const c = board[y][x];
      if (!c || c.t < 0) { x++; continue; }
      let e = x + 1;
      while (e < W && board[y][e] && board[y][e].t === c.t) e++;
      if (e - x >= 3) runs.push({ dir: "h", t: c.t, cells: Array.from({ length: e - x }, (_, k) => idx(x + k, y)) });
      x = e;
    }
  }
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; ) {
      const c = board[y][x];
      if (!c || c.t < 0) { y++; continue; }
      let e = y + 1;
      while (e < H && board[e][x] && board[e][x].t === c.t) e++;
      if (e - y >= 3) runs.push({ dir: "v", t: c.t, cells: Array.from({ length: e - y }, (_, k) => idx(x, y + k)) });
      y = e;
    }
  }
  const groups = [];
  for (const r of runs) {
    const g = { t: r.t, cells: new Set(r.cells), runs: [r] };
    for (const o of groups.filter((o) => r.cells.some((c) => o.cells.has(c)))) {
      o.cells.forEach((c) => g.cells.add(c));
      g.runs.push(...o.runs);
      groups.splice(groups.indexOf(o), 1);
    }
    groups.push(g);
  }
  return groups;
}

// Special gem a group turns into (or null). Placed on a preferred cell (the swapped ones) if possible.
function specialFor(group, prefs) {
  const longest = group.runs.reduce((a, r) => (r.cells.length > a.cells.length ? r : a));
  const pick = (cells) => prefs.find((p) => cells.includes(p)) ?? cells[Math.floor(cells.length / 2)];
  if (longest.cells.length >= 5) return { idx: pick(longest.cells), gem: gem(COLOR, "color") };
  for (const h of group.runs.filter((r) => r.dir === "h")) {
    for (const v of group.runs.filter((r) => r.dir === "v")) {
      const cross = h.cells.find((c) => v.cells.includes(c));
      if (cross !== undefined) return { idx: cross, gem: gem(group.t, "blast") };
    }
  }
  if (longest.cells.length === 4) return { idx: pick(longest.cells), gem: gem(group.t, longest.dir === "h" ? "row" : "col") };
  return null;
}

// Adds everything hit by special gems in `set` (chain reactions included).
function expand(state, set) {
  const board = state.board;
  const queue = [...set];
  const add = (x, y) => {
    if (!inBoard(x, y)) return;
    const i = idx(x, y);
    if (!set.has(i)) { set.add(i); queue.push(i); }
  };
  while (queue.length) {
    const { x, y } = at(queue.pop());
    const c = board[y][x];
    if (!c || !c.s || c.s === "rock") continue;
    if (c.s === "row") for (let k = 0; k < W; k++) add(k, y);
    else if (c.s === "col") for (let k = 0; k < H; k++) add(x, k);
    else if (c.s === "blast") for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) add(x + dx, y + dy);
    else if (c.s === "color") {
      // Hit by another special instead of swapped: clears a random colour present on the board.
      const present = [...new Set(board.flat().filter((g) => g && g.t >= 0).map((g) => g.t))];
      if (present.length) {
        const t = present[Math.floor(state.random() * present.length)];
        for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (board[yy][xx] && board[yy][xx].t === t) add(xx, yy);
      }
    }
  }
}

// Gravity: gems fall down inside each column segment (between rocks / caged gems); new random gems fill
// the top of every segment.
function settle(state) {
  const b = state.board;
  for (let x = 0; x < W; x++) {
    let y = H - 1;
    while (y >= 0) {
      if (isFixed(b[y][x])) { y--; continue; }
      let top = y;
      while (top >= 0 && !isFixed(b[top][x])) top--;
      top++;
      const col = [];
      for (let r = y; r >= top; r--) if (b[r][x]) col.push(b[r][x]);
      for (let r = y, k = 0; r >= top; r--, k++) b[r][x] = k < col.length ? col[k] : gem(Math.floor(state.random() * state.types));
      y = top - 1;
    }
  }
}

// Clears matches (plus `forced` cells) and refills until the board is stable. Returns the steps.
function resolve(state, forced, prefs) {
  const steps = [];
  for (let cascade = 1; ; cascade++) {
    const clear = new Set(forced ?? []);
    forced = null;
    const creates = [];
    let combos = 0;
    for (const g of findGroups(state.board)) {
      if (g.cells.size > 3) combos++;
      g.cells.forEach((c) => clear.add(c));
      const sp = specialFor(g, prefs);
      if (sp && !isFixed(state.board[at(sp.idx).y][at(sp.idx).x])) creates.push(sp);
    }
    if (!clear.size) break;
    expand(state, clear);
    for (const c of creates) clear.delete(c.idx); // new specials survive
    // Rocks never clear. A cage takes one hit per step when its gem or a neighbouring cell clears; when the
    // last hit lands the cage breaks (the gem clears if it was part of the clear, otherwise it is free).
    for (const i of [...clear]) if (isRock(state.board[at(i).y][at(i).x])) clear.delete(i);
    const damaged = [];
    const broken = [];
    const hit = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = state.board[y][x];
        if (!c || !(c.c > 0)) continue;
        const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inBoard(x + dx, y + dy) && clear.has(idx(x + dx, y + dy)));
        if (near) hit.push({ x, y, c });
      }
    }
    for (const { x, y, c } of hit) {
      c.c--;
      if (c.c > 0) { clear.delete(idx(x, y)); damaged.push({ x, y, c: c.c }); } else broken.push({ x, y });
    }
    const points = clear.size * 10 * cascade;
    const cleared = [...clear].map(at);
    for (const p of cleared) state.board[p.y][p.x] = null;
    for (const c of creates) { const p = at(c.idx); state.board[p.y][p.x] = c.gem; }
    state.score += points;
    settle(state);
    steps.push({
      cleared,
      created: creates.map((c) => ({ ...at(c.idx), special: c.gem.s })),
      points,
      cascade,
      combos,
      damaged,
      broken,
      board: cloneBoard(state.board),
    });
    prefs = [];
  }
  return steps;
}

// Swap a and b on a copy of the board. valid=false if the move does nothing.
function evaluateSwap(board, a, b) {
  const bd = cloneBoard(board);
  const ga = bd[a.y][a.x];
  const gb = bd[b.y][b.x];
  if (!ga || !gb || isFixed(ga) || isFixed(gb)) return { valid: false };
  bd[a.y][a.x] = gb;
  bd[b.y][b.x] = ga;
  const ia = idx(a.x, a.y);
  const ib = idx(b.x, b.y);
  const colorA = ga.s === "color";
  const colorB = gb.s === "color";
  if (colorA || colorB) {
    const forced = new Set([ia, ib]);
    if (colorA && colorB) {
      for (let i = 0; i < W * H; i++) forced.add(i);
    } else {
      const other = colorA ? gb : ga;
      for (const row of bd) {
        for (const g of row) {
          if (g.t !== other.t || g.s === "color") continue;
          if (other.s && !g.s) g.s = other.s; // colour + special: every gem of that colour becomes the special
        }
      }
      bd.forEach((row, y) => row.forEach((g, x) => { if (g.t === other.t && g.s !== "color") forced.add(idx(x, y)); }));
    }
    ga.s = ga.s === "color" ? null : ga.s; // the colour gem is spent; keep it from firing a second time
    gb.s = gb.s === "color" ? null : gb.s;
    return { valid: true, board: bd, forced };
  }
  if (ga.s && gb.s) return { valid: true, board: bd, forced: new Set([ia, ib]) };
  if (findGroups(bd).length) return { valid: true, board: bd, forced: null };
  return { valid: false };
}

function isValidSwap(board, a, b) {
  return evaluateSwap(board, a, b).valid;
}

// First valid move ([a, b]) or null.
function findMove(board) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (!inBoard(x + dx, y + dy)) continue;
        const a = { x, y };
        const b = { x: x + dx, y: y + dy };
        if (isValidSwap(board, a, b)) return [a, b];
      }
    }
  }
  return null;
}

// Board with no pending matches and at least one valid move.
function createBoard(random = Math.random, types = TYPES, layout = { rocks: [], cages: [] }) {
  const rocks = new Set(layout.rocks.map(([x, y]) => idx(x, y)));
  for (;;) {
    const b = [];
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < W; x++) {
        if (rocks.has(idx(x, y))) { row.push(gem(ROCK, "rock")); continue; }
        const bad = new Set();
        if (x >= 2 && row[x - 1].t === row[x - 2].t) bad.add(row[x - 1].t);
        if (y >= 2 && b[y - 1][x].t === b[y - 2][x].t) bad.add(b[y - 1][x].t);
        const ok = [...Array(types).keys()].filter((t) => !bad.has(t));
        row.push(gem(ok[Math.floor(random() * ok.length)]));
      }
      b.push(row);
    }
    for (const [x, y, hp] of layout.cages) b[y][x].c = hp;
    if (findMove(b)) return b;
  }
}

// `inventory` = powerups carried over from earlier sessions.
function createState(random = Math.random, level = 1, inventory = {}) {
  const state = { random, status: "play" };
  state.powerups = Object.fromEntries(POWERUPS.map((p) => [p, Math.max(0, Math.floor(Number(inventory[p])) || 0)]));
  startLevel(state, level);
  return state;
}

// (Re)starts a level: fresh board, full moves, score 0.
function startLevel(state, level) {
  const cfg = levelConfig(level);
  state.level = cfg.level;
  state.types = cfg.types;
  state.moves = cfg.moves;
  state.movesLeft = cfg.moves;
  state.target = cfg.target;
  state.score = 0;
  state.stars = 0;
  state.endless = false;
  state.powerups ??= { hammer: 0, bomb: 0, rainbow: 0 }; // the inventory survives level changes
  state.status = "play";
  state.layout = cfg.layout;
  state.board = createBoard(state.random, cfg.types, cfg.layout);
  return state;
}

// Endless mode: no goal and no move limit, the score just keeps counting.
function startEndless(state) {
  startLevel(state, 1);
  state.level = 0;
  state.moves = Infinity;
  state.movesLeft = Infinity;
  state.target = Infinity;
  state.endless = true;
  return state;
}

// Shuffles the board if no valid move is left. Returns true if it had to.
function ensurePlayable(state) {
  if (findMove(state.board)) return false;
  shuffle(state);
  return true;
}

// Reshuffles the existing gems until there are no matches and a move exists.
function shuffle(state) {
  // Only free gems move; rocks and caged gems stay where they are.
  const free = [];
  state.board.forEach((row, y) => row.forEach((g, x) => { if (g && !isFixed(g)) free.push({ x, y }); }));
  for (let n = 0; n < 200; n++) {
    const gems = free.map((p) => state.board[p.y][p.x]);
    for (let i = gems.length - 1; i > 0; i--) {
      const j = Math.floor(state.random() * (i + 1));
      [gems[i], gems[j]] = [gems[j], gems[i]];
    }
    const b = cloneBoard(state.board);
    free.forEach((p, k) => { b[p.y][p.x] = gems[k]; });
    if (!findGroups(b).length && findMove(b)) { state.board = b; return; }
  }
  state.board = createBoard(state.random, state.types, state.layout);
}

// Weighted random powerup type (see POWERUP_WEIGHTS).
function pickPowerup(random) {
  let r = random() * POWERUPS.reduce((sum, p) => sum + POWERUP_WEIGHTS[p], 0);
  for (const p of POWERUPS) {
    r -= POWERUP_WEIGHTS[p];
    if (r < 0) return p;
  }
  return POWERUPS[POWERUPS.length - 1];
}

// Endless mode: every combo of 4+ gems (one group in a step) has an AWARD_CHANCE to earn a random powerup.
// Returns the types earned.
function awardPowerups(state, steps) {
  const got = [];
  if (!state.endless) return got;
  for (const step of steps) {
    for (let k = 0; k < step.combos; k++) {
      if (state.random() >= (state.awardChance ?? AWARD_CHANCE)) continue; // awardChance: debug override
      const type = pickPowerup(state.random);
      state.powerups[type]++;
      got.push(type);
    }
  }
  return got;
}

// Plays a swap. Invalid swaps change nothing. Returns { valid, start, steps, shuffled, bonus }.
function trySwap(state, a, b) {
  const none = { valid: false, steps: [], shuffled: false, bonus: 0, awards: [] };
  if (state.status !== "play") return none;
  if (!inBoard(a.x, a.y) || !inBoard(b.x, b.y) || Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) return none;
  const info = evaluateSwap(state.board, a, b);
  if (!info.valid) return none;
  state.board = info.board;
  state.movesLeft--;
  const start = cloneBoard(state.board);
  const steps = resolve(state, info.forced, [idx(a.x, a.y), idx(b.x, b.y)]);
  const shuffled = ensurePlayable(state);
  let bonus = 0;
  if (state.score >= state.target && cagesLeft(state.board) === 0) {
    bonus = state.movesLeft * BONUS_PER_MOVE;
    state.score += bonus;
    state.status = "levelclear";
    state.stars = starsFor(state.movesLeft, state.moves);
  } else if (state.movesLeft <= 0) {
    state.status = "over";
  }
  const awards = awardPowerups(state, steps);
  return { valid: true, start, steps, shuffled, bonus, awards };
}

// Uses a powerup on the gem at pos (any mode, costs no move):
// hammer = that gem, bomb = 3x3 around it, rainbow = every gem of its colour.
function usePowerup(state, type, pos) {
  const none = { valid: false, steps: [], shuffled: false, bonus: 0, awards: [] };
  if (state.status !== "play" || !POWERUPS.includes(type) || !(state.powerups[type] > 0)) return none;
  if (!inBoard(pos.x, pos.y) || !state.board[pos.y][pos.x] || isRock(state.board[pos.y][pos.x])) return none;
  const target = state.board[pos.y][pos.x];
  if (type === "rainbow" && target.t < 0) return none;
  const forced = new Set();
  if (type === "hammer") forced.add(idx(pos.x, pos.y));
  else if (type === "bomb") {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inBoard(pos.x + dx, pos.y + dy)) forced.add(idx(pos.x + dx, pos.y + dy));
  } else {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (state.board[y][x].t === target.t) forced.add(idx(x, y));
  }
  state.powerups[type]--;
  const start = cloneBoard(state.board);
  const steps = resolve(state, forced, []);
  const shuffled = ensurePlayable(state);
  const awards = awardPowerups(state, steps);
  return { valid: true, start, steps, shuffled, bonus: 0, awards, powerup: true };
}

function nextLevel(state) {
  if (state.status !== "levelclear" || state.level >= MAX_LEVEL) return false;
  startLevel(state, state.level + 1);
  return true;
}

if (typeof module !== "undefined") {
  module.exports = {
    W, H, TYPES, COLOR, ROCK, WORLD_SIZE, MAX_LEVEL, cagesLeft, isFixed, gem, idx, levelConfig, starsFor, POWERUPS, POWERUP_WEIGHTS, AWARD_CHANCE, pickPowerup, usePowerup, startLevel, startEndless, ensurePlayable, cloneBoard, findGroups, evaluateSwap, isValidSwap,
    findMove, createBoard, createState, shuffle, trySwap, nextLevel,
  };
}

// --- Browser: input, rendering, animation -------------------------------
// The logic above is already final when an animation starts; the browser only replays the steps.
// Gems are sprites ({ g, x, y, sc, al, flash }, positions in cell units) that tweens move around.

if (typeof document !== "undefined") {
  // --- Theme: follow the kit portal (data-theme on the page), else the saved kit choice, else the system ---
  const PAL = {};
  const root = document.documentElement;
  const systemDark = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;

  function readPalette() {
    const cs = getComputedStyle(root);
    for (const k of ["board", "line", "text", "muted", "accent", "overlay", "cell-a", "cell-b", "cage", "bg"]) PAL[k] = cs.getPropertyValue(`--${k}`).trim();
  }

  let lastAuto = root.hasAttribute("data-theme-auto") ? root.getAttribute("data-theme") : null; // set by the page's head script
  function autoTheme() {
    const now = root.getAttribute("data-theme");
    if (now && now !== lastAuto) return; // the portal's choice wins
    let saved = null;
    try { saved = localStorage.getItem("kit-theme"); } catch (e) { /* storage blocked */ }
    lastAuto = saved || (systemDark && systemDark.matches ? "dark" : "light");
    root.setAttribute("data-theme", lastAuto);
  }

  autoTheme();
  readPalette();
  if (systemDark && systemDark.addEventListener) systemDark.addEventListener("change", () => { autoTheme(); readPalette(); });
  if (typeof MutationObserver !== "undefined") new MutationObserver(readPalette).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const cell = canvas.width / W;
  const el = (id) => document.getElementById(id);
  let animSpeed = 1; // debug: 0 = instant
  const touchOnly = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
  const progressKey = `${GAME_ID}:progress`;
  const COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22"];
  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Saved progress: { unlocked: highest reachable level, endlessBest, powerups (inventory), stars: {level: 1-3}, best: {level: best score} }.
  function loadProgress() {
    try {
      const p = JSON.parse(localStorage.getItem(progressKey));
      if (p && typeof p === "object") {
        return {
          unlocked: Math.min(MAX_LEVEL, Math.max(1, Math.floor(Number(p.unlocked)) || 1)),
          endlessBest: Math.max(0, Number(p.endlessBest) || 0),
          powerups: Object.fromEntries(POWERUPS.map((k) => [k, Math.max(0, Math.floor(Number(p.powerups && p.powerups[k])) || 0)])),
          stars: p.stars && typeof p.stars === "object" ? p.stars : {},
          best: p.best && typeof p.best === "object" ? p.best : {},
        };
      }
    } catch (e) { /* corrupt or missing: start fresh */ }
    return { unlocked: 1, endlessBest: 0, powerups: { hammer: 0, bomb: 0, rainbow: 0 }, stars: {}, best: {} };
  }

  const progress = loadProgress();
  let state = createState(Math.random, progress.unlocked, progress.powerups); // continue at the highest level reached
  let sprites = [];
  let particles = [];
  let popups = [];
  let shake = 0;
  let selected = null;
  let cursor = { x: 0, y: 0 };
  let hint = null;
  let paused = false;
  let busy = false;
  let drag = null;
  let panelOpen = false;
  let armed = null; // powerup waiting for a target gem
  const LABELS = { hammer: "Hammer", bomb: "Bomb", rainbow: "Rainbow" };
  let shownScore = 0;
  let targetScore = 0;

  // --- animation helpers ---
  const easeOut = (t) => 1 - (1 - t) * (1 - t);
  const easeBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2); // small overshoot
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  function tween(ms, fn, ease = (t) => t) {
    return new Promise((resolve) => {
      if (reduced || animSpeed === 0) { fn(1); resolve(); return; }
      const t0 = performance.now();
      const tick = () => {
        const t = Math.min(1, ((performance.now() - t0) * animSpeed) / ms);
        fn(ease(t));
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
  }

  function say(text) {
    el("msg").textContent = text || " ";
  }

  function setBoard(board) {
    sprites = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (board[y][x]) sprites.push({ g: board[y][x], x, y, sc: 1, al: 1, flash: 0 });
  }

  const spriteAt = (x, y) => sprites.find((s) => Math.round(s.x) === x && Math.round(s.y) === y);

  function burst(x, y, g) {
    const color = g.t === COLOR ? "#fff" : COLORS[g.t];
    for (let k = 0; k < 7; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = (1.5 + Math.random() * 3.5) * cell;
      particles.push({ x: (x + 0.5) * cell, y: (y + 0.5) * cell, vx: Math.cos(a) * v, vy: Math.sin(a) * v - cell, life: 0, max: 0.45 + Math.random() * 0.3, color, size: 3 + Math.random() * 4 });
    }
  }

  function popup(x, y, text, size = 20) {
    popups.push({ x: (x + 0.5) * cell, y: (y + 0.5) * cell, text, size, life: 0, max: 0.95 });
  }

  // New board: gems drop in from above, column by column.
  async function intro() {
    setBoard(state.board);
    const falling = sprites.filter((s) => !isRock(s.g)); // rocks are just there
    const start = new Map(falling.map((s) => [s, s.y]));
    for (const s of falling) s.y -= H + 1 + s.x * 0.6 + Math.random();
    const from = new Map(falling.map((s) => [s, s.y]));
    await tween(700, (t) => { for (const s of falling) s.y = from.get(s) + (start.get(s) - from.get(s)) * t; }, easeBack);
    setBoard(state.board);
  }

  async function swapAnim(a, b, back) {
    const sa = spriteAt(a.x, a.y);
    const sb = spriteAt(b.x, b.y);
    const move = (t) => {
      sa.x = a.x + (b.x - a.x) * t; sa.y = a.y + (b.y - a.y) * t;
      sb.x = b.x + (a.x - b.x) * t; sb.y = b.y + (a.y - b.y) * t;
    };
    await tween(140, move, easeInOut);
    if (back) {
      shake = 4;
      await tween(140, (t) => move(1 - t), easeInOut);
    }
  }

  async function animateStep(step) {
    const key = (x, y) => y * W + x;
    const gone = new Set(step.cleared.map((p) => key(p.x, p.y)));
    const doomed = sprites.filter((s) => gone.has(key(Math.round(s.x), Math.round(s.y))));
    for (const c of step.created) {
      const s = spriteAt(c.x, c.y);
      s.g = c.special === "color" ? gem(COLOR, "color") : gem(s.g.t, c.special);
      s.sc = 1.6;
    }
    const born = sprites.filter((s) => s.sc > 1);
    for (const s of doomed) burst(s.x, s.y, s.g);
    // Cages: a hit that does not break the cage shakes it, a broken cage bursts into grey chips.
    const hurt = [];
    for (const d of step.damaged) { const s = spriteAt(d.x, d.y); if (s) { s.g = { ...s.g, c: d.c }; hurt.push(s); } }
    for (const b of step.broken) {
      const s = spriteAt(b.x, b.y);
      if (!s) continue;
      burst(s.x, s.y, { t: COLOR });
      if (!gone.has(key(b.x, b.y))) { s.g = { ...s.g, c: 0 }; hurt.push(s); }
    }
    if (hurt.length) shake = Math.max(shake, 3);
    if (step.cleared.length) {
      const cx = step.cleared.reduce((a, p) => a + p.x, 0) / step.cleared.length;
      const cy = step.cleared.reduce((a, p) => a + p.y, 0) / step.cleared.length;
      popup(cx, cy, `+${step.points}`, 18 + Math.min(14, step.cascade * 3));
    }
    if (step.cascade > 1) popup(W / 2 - 0.5, H / 2 - 0.5, `Cascade x${step.cascade}!`, 26);
    if (step.cleared.length >= 8) shake = Math.max(shake, Math.min(10, step.cleared.length / 2));
    targetScore += step.points;

    await tween(230, (t) => {
      for (const s of doomed) { s.sc = 1 - t; s.al = 1 - t * 0.6; s.flash = Math.sin(Math.min(1, t * 2) * Math.PI / 2) * (1 - t); }
      for (const s of born) s.sc = 1.6 - 0.6 * t;
      for (const s of hurt) s.flash = 0.8 * (1 - t);
    }, easeOut);
    sprites = sprites.filter((s) => !doomed.includes(s));

    // Gravity per column segment (between rocks / caged gems): survivors drop to the segment bottom, new gems
    // enter from above the board, or pop in when the segment starts below the top row.
    const moves = [];
    let far = 1;
    const fixedAt = (col, r) => col[r] && isFixed(col[r].g);
    for (let x = 0; x < W; x++) {
      const col = Array.from({ length: H }, () => null);
      for (const s of sprites) if (Math.round(s.x) === x) col[Math.round(s.y)] = s;
      let y = H - 1;
      while (y >= 0) {
        if (fixedAt(col, y)) { y--; continue; }
        let top = y;
        while (top >= 0 && !fixedAt(col, top)) top--;
        top++;
        const surv = [];
        for (let r = y; r >= top; r--) if (col[r]) surv.push(col[r]);
        surv.forEach((sp, k) => { moves.push({ s: sp, from: sp.y, to: y - k }); far = Math.max(far, y - k - sp.y); });
        const missing = y - top + 1 - surv.length;
        for (let m = 0; m < missing; m++) {
          const r = top + m;
          const pop = top > 0;
          const sp = { g: step.board[r][x], x, y: pop ? r : r - missing, sc: pop ? 0 : 1, al: 1, flash: 0 };
          sprites.push(sp);
          moves.push({ s: sp, from: sp.y, to: r, pop });
          far = Math.max(far, pop ? 1 : missing);
        }
        y = top - 1;
      }
    }
    await tween(140 + 55 * far, (t) => {
      for (const m of moves) { m.s.y = m.from + (m.to - m.from) * t; if (m.pop) m.s.sc = Math.min(1, t * 1.5); }
    }, easeBack);
    setBoard(step.board);
    await tween(90, () => {});
  }

  async function shuffleAnim() {
    say("No moves left - board shuffled");
    const movable = () => sprites.filter((s) => !isFixed(s.g));
    await tween(220, (t) => { for (const s of movable()) s.sc = 1 - t; }, easeOut);
    setBoard(state.board);
    for (const s of movable()) s.sc = 0;
    await tween(300, (t) => { for (const s of movable()) s.sc = t; }, easeBack);
  }

  // --- drawing ---
  function shape(t, r) {
    ctx.beginPath();
    if (t === 0) ctx.arc(0, 0, r, 0, Math.PI * 2);
    else if (t === 1) ctx.rect(-r, -r, r * 2, r * 2);
    else if (t === 2) { ctx.moveTo(0, -r); ctx.lineTo(r, r * 0.8); ctx.lineTo(-r, r * 0.8); }
    else if (t === 3) { ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); }
    else if (t === 4) for (let k = 0; k < 6; k++) { const a = (Math.PI / 3) * k; ctx.lineTo(r * Math.cos(a), r * Math.sin(a)); }
    else for (let k = 0; k < 10; k++) { const a = (Math.PI / 5) * k - Math.PI / 2; const rr = k % 2 ? r * 0.5 : r; ctx.lineTo(rr * Math.cos(a), rr * Math.sin(a)); }
    ctx.closePath();
    ctx.fill();
  }

  function drawSprite(s, now) {
    if (s.sc <= 0.01) return;
    let sc = s.sc;
    const isHint = hint && hint.some((p) => Math.round(s.x) === p.x && Math.round(s.y) === p.y);
    const isSel = selected && Math.round(s.x) === selected.x && Math.round(s.y) === selected.y;
    if (isHint) sc *= 1 + 0.1 * Math.sin(now / 150);
    if (isSel) sc *= 1.12;
    const r = cell * 0.34;
    const pulse = 1 + 0.08 * Math.sin(now / 200);
    ctx.save();
    ctx.globalAlpha = s.al;
    ctx.translate((s.x + 0.5) * cell, (s.y + 0.5) * cell);
    ctx.scale(sc, sc);
    if (isRock(s.g)) {
      const h = cell * 0.46;
      ctx.fillStyle = "#4a4f57";
      ctx.fillRect(-h, -h, h * 2, h * 2);
      ctx.fillStyle = "#6b727d";
      ctx.fillRect(-h, -h, h * 2, h * 0.35);
      ctx.fillRect(-h, -h, h * 0.35, h * 2);
      ctx.fillStyle = "#2f3338";
      ctx.fillRect(-h, h * 0.7, h * 2, h * 0.3);
      ctx.fillRect(h * 0.7, -h, h * 0.3, h * 2);
      ctx.restore();
      return;
    }
    if (s.g.t === COLOR) {
      ctx.rotate(now / 600);
      ctx.fillStyle = `hsl(${(now / 6) % 360}, 85%, 62%)`;
      shape(5, r * 1.2 * pulse);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = COLORS[s.g.t];
      shape(s.g.t, r);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      if (s.g.s === "row") { ctx.beginPath(); ctx.moveTo(-r - 5 * pulse, 0); ctx.lineTo(r + 5 * pulse, 0); ctx.stroke(); }
      else if (s.g.s === "col") { ctx.beginPath(); ctx.moveTo(0, -r - 5 * pulse); ctx.lineTo(0, r + 5 * pulse); ctx.stroke(); }
      else if (s.g.s === "blast") { ctx.beginPath(); ctx.arc(0, 0, (r + 5) * pulse, 0, Math.PI * 2); ctx.stroke(); }
    }
    if (s.flash > 0) {
      ctx.globalAlpha = s.flash;
      ctx.fillStyle = "#fff";
      shape(s.g.t < 0 ? 5 : s.g.t, r * 1.1);
    }
    if (s.g.c > 0) {
      // cage: bars over the gem; gold and double when it takes two hits
      const h = cell * 0.43;
      ctx.globalAlpha = s.al;
      ctx.strokeStyle = s.g.c > 1 ? "#e0a800" : PAL.cage;
      ctx.lineWidth = s.g.c > 1 ? 4 : 3;
      ctx.strokeRect(-h, -h, h * 2, h * 2);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const k of [-0.45, 0, 0.45]) { ctx.moveTo(k * h, -h); ctx.lineTo(k * h, h); }
      if (s.g.c > 1) for (const k of [-0.45, 0, 0.45]) { ctx.moveTo(-h, k * h); ctx.lineTo(h, k * h); }
      ctx.stroke();
    }
    ctx.restore();
  }

  function outline(p, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeRect(p.x * cell + 2, p.y * cell + 2, cell - 4, cell - 4);
  }

  function overlay(text) {
    ctx.fillStyle = PAL.overlay;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = PAL.text;
    ctx.font = "28px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  function draw(now) {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake * 2, (Math.random() - 0.5) * shake * 2);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        ctx.fillStyle = (x + y) % 2 ? PAL["cell-b"] : PAL["cell-a"];
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    for (const s of sprites) drawSprite(s, now);
    for (const p of particles) {
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const p of popups) {
      const t = p.life / p.max;
      ctx.globalAlpha = 1 - t * t;
      ctx.font = `bold ${p.size}px Georgia, serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = PAL.bg;
      ctx.strokeText(p.text, p.x, p.y - t * 40);
      ctx.fillStyle = PAL.text;
      ctx.fillText(p.text, p.x, p.y - t * 40);
    }
    ctx.globalAlpha = 1;
    if (hint) { outline(hint[0], "#2ecc71", 3); outline(hint[1], "#2ecc71", 3); }
    if (selected) outline(selected, PAL.text, 4);
    if (armed && !busy) {
      for (const p of previewCells()) {
        ctx.fillStyle = "rgba(255,140,0,0.25)";
        ctx.fillRect(p.x * cell, p.y * cell, cell, cell);
        outline(p, "#ff8c00", 2);
      }
    }
    if (!touchOnly) outline(cursor, PAL.muted, 1);
    ctx.restore();

    if (state.status === "levelclear" && !busy) overlay(state.level >= MAX_LEVEL ? `All ${MAX_LEVEL} levels cleared!` : `Level clear! ${"\u2605".repeat(state.stars)} (Enter / tap)`);
    else if (state.status === "over" && !busy) overlay("Out of moves (R / tap)");
    else if (paused) overlay("Paused");
  }

  function hud() {
    shownScore += (targetScore - shownScore) * 0.2;
    if (Math.abs(targetScore - shownScore) < 1) shownScore = targetScore;
    el("level").textContent = state.endless ? "\u221e" : state.level;
    el("moves").textContent = state.endless ? "\u221e" : state.movesLeft;
    el("score").textContent = Math.round(shownScore);
    el("target").textContent = state.endless ? "\u221e" : state.target;
    el("best").textContent = (state.endless ? progress.endlessBest : progress.best[state.level]) || 0;
    const goal = el("goal");
    goal.hidden = state.endless;
    goal.max = state.endless ? 1 : state.target;
    goal.value = Math.max(0, state.endless ? 0 : Math.min(goal.max, Math.round(shownScore)));
    el("powerups").hidden = false;
    const cages = cagesLeft(state.board);
    el("cages-wrap").hidden = !state.layout.cages.length;
    el("cages").textContent = cages;
    POWERUPS.forEach((p, i) => {
      const b = el(`pu-${p}`);
      b.textContent = `${LABELS[p]} x${state.powerups[p]} (${i + 1})`;
      b.disabled = !(state.powerups[p] > 0);
      b.classList.toggle("armed", armed === p);
    });
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const p of particles) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 9 * cell * dt; }
    particles = particles.filter((p) => p.life < p.max);
    for (const p of popups) p.life += dt;
    popups = popups.filter((p) => p.life < p.max);
    shake = Math.max(0, shake - dt * 25);
    hud();
    draw(now);
    requestAnimationFrame(frame);
  }

  const goalText = () => state.endless
    ? "Endless: no goal, no move limit - the board reshuffles when you get stuck"
    : `Goal: ${state.target} points${state.layout.cages.length ? ` and break all ${state.layout.cages.length} cages` : ""} in ${state.moves} moves`;

  // Stores the result of the current level and unlocks the next one.
  function recordResult() {
    const n = state.level;
    progress.powerups = { ...state.powerups };
    if (state.endless) {
      progress.endlessBest = Math.max(progress.endlessBest, state.score);
      } else {
      progress.best[n] = Math.max(progress.best[n] || 0, state.score);
      if (state.status === "levelclear") {
        progress.stars[n] = Math.max(progress.stars[n] || 0, state.stars);
        progress.unlocked = Math.max(progress.unlocked, Math.min(MAX_LEVEL, n + 1));
      }
    }
    try { localStorage.setItem(progressKey, JSON.stringify(progress)); } catch (e) { /* storage full or blocked */ }
    buildGrid();
  }

  async function play(a, b) {
    if (busy || paused || state.status !== "play") return;
    selected = null;
    hint = null;
    if (dbg.freezeMoves && isFinite(state.movesLeft)) state.movesLeft = Math.max(state.movesLeft, 2);
    const res = trySwap(state, a, b);
    if (dbg.freezeMoves && isFinite(state.movesLeft) && res.valid) state.movesLeft = Math.max(1, state.moves);
    busy = true;
    if (!res.valid) {
      say("No match - try another swap");
      await swapAnim(a, b, true);
      busy = false;
      return;
    }
    say(goalText());
    await swapAnim(a, b, false);
    setBoard(res.start);
    await finishMove(res);
  }

  // Replays a resolved move (swap or powerup): steps, shuffle, bonus, earned powerups, saving.
  async function finishMove(res) {
    for (const step of res.steps) await animateStep(step);
    if (res.shuffled) await shuffleAnim();
    for (const type of res.awards) {
      popup(W / 2 - 0.5, H / 2 - 0.5, `${LABELS[type]} earned!`, 26);
      say(`Powerup earned: ${LABELS[type]}`);
      flashPowerup(type);
    }
    if (res.bonus) {
      popup(W / 2 - 0.5, H / 2 - 0.5, `+${res.bonus} bonus`, 28);
      say(`Level clear! +${res.bonus} bonus for unused moves`);
    }
    targetScore = state.score;
    if (state.status !== "play" || state.endless || res.powerup || res.awards.length) recordResult();
    busy = false;
  }

  // Lets the powerup's button glow and pop for a moment (restarts if it is earned again).
  function flashPowerup(type) {
    const b = el(`pu-${type}`);
    b.classList.remove("earned");
    void b.offsetWidth; // restart the CSS animation
    b.classList.add("earned");
    setTimeout(() => b.classList.remove("earned"), 1500);
  }

  async function usePower(pos) {
    if (busy || paused || !armed) return;
    const type = armed;
    const res = usePowerup(state, type, pos);
    if (!res.valid) return;
    armed = null;
    selected = null;
    hint = null;
    busy = true;
    say(goalText());
    setBoard(res.start);
    shake = type === "hammer" ? 2 : 6;
    await finishMove(res);
  }

  function arm(type) {
    if (state.status !== "play" || busy || paused || panelOpen) return;
    armed = armed === type || !(state.powerups[type] > 0) ? null : type;
    selected = null;
    say(armed ? `${LABELS[armed]}: click a gem (Esc cancels)` : goalText());
  }

  // Cells the armed powerup would hit at the cursor (for the preview).
  function previewCells() {
    if (isRock(state.board[cursor.y][cursor.x])) return [];
    if (armed === "hammer") return [cursor];
    if (armed === "bomb") {
      const out = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inBoard(cursor.x + dx, cursor.y + dy) && !isRock(state.board[cursor.y + dy][cursor.x + dx])) out.push({ x: cursor.x + dx, y: cursor.y + dy });
      return out;
    }
    const t = state.board[cursor.y][cursor.x].t;
    const out = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (state.board[y][x].t === t) out.push({ x, y });
    return t < 0 ? [] : out;
  }

  function cellAt(e) {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * W);
    const y = Math.floor(((e.clientY - r.top) / r.height) * H);
    return inBoard(x, y) ? { x, y } : null;
  }

  const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

  canvas.addEventListener("pointerdown", (e) => {
    const p = cellAt(e);
    if (dbg.placing) { if (p && !busy) dbg.place(dbg.placing, p.x, p.y); return; }
    if (!p || busy || paused) return;
    cursor = p;
    if (armed) { usePower(p); return; }
    if (selected && adjacent(selected, p)) { play(selected, p); return; }
    selected = p;
    drag = { p, x: e.clientX, y: e.clientY };
    hint = null;
  });

  canvas.addEventListener("pointermove", (e) => {
    if (armed) { const p = cellAt(e); if (p) cursor = p; return; }
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    const min = (canvas.getBoundingClientRect().width / W) * 0.4;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const from = drag.p;
    drag = null;
    play(from, { x: from.x + (horizontal ? Math.sign(dx) : 0), y: from.y + (horizontal ? 0 : Math.sign(dy)) });
  });

  window.addEventListener("pointerup", () => { drag = null; });

  const arrows = {
    ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1],
    ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0],
  };

  async function newBoard() {
    busy = true;
    selected = null;
    hint = null;
    armed = null;
    particles = [];
    popups = [];
    say(goalText());
    targetScore = shownScore = state.score;
    await intro();
    busy = false;
  }

  function retry() {
    paused = false;
    if (state.endless) startEndless(state); else startLevel(state, state.level);
    newBoard();
  }

  function advance() {
    if (nextLevel(state)) newBoard();
  }

  function showHint() {
    if (state.status !== "play" || busy || paused || panelOpen) return;
    hint = findMove(state.board);
    selected = null;
  }

  // Tap the board when a level is over: continue / retry (no keyboard on phones).
  canvas.addEventListener("pointerdown", () => {
    if (busy || panelOpen || dbg.placing) return;
    if (state.status === "levelclear") advance();
    else if (state.status === "over") retry();
  });

  document.addEventListener("keydown", (e) => {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return; // typing in the debug window
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === "l") { togglePanel(); }
    else if (key === "Escape" && panelOpen) togglePanel(false);
    else if (panelOpen || busy) return;
    else if (key === "r") retry();
    else if (key === "p" && state.status === "play") paused = !paused;
    else if (key === "Enter" && state.status === "levelclear") advance();
    else if (paused) return;
    else if (key === "Escape" && armed) { armed = null; say(goalText()); }
    else if (armed && (key === " " || key === "Enter")) usePower(cursor);
    else if (key === "1" || key === "2" || key === "3") arm(POWERUPS[Number(key) - 1]);
    else if (key === "h") showHint();
    else if (arrows[key]) {
      const [dx, dy] = arrows[key];
      if (selected) {
        const to = { x: selected.x + dx, y: selected.y + dy };
        if (inBoard(to.x, to.y)) { cursor = to; play(selected, to); }
      } else {
        cursor = { x: Math.min(W - 1, Math.max(0, cursor.x + dx)), y: Math.min(H - 1, Math.max(0, cursor.y + dy)) };
      }
    } else if (key === " " || key === "Enter") selected = selected ? null : { ...cursor };
    else return;
    e.preventDefault();
  });

  // --- level overview ---

  const grids = [el("grid"), el("grid2")];

  function buildGrid() {
    el("endless").className = state.endless ? "current" : "";
    el("endless").textContent = `\u221e Endless (best ${progress.endlessBest})`;
    grids.forEach((grid, w) => {
      grid.textContent = "";
      for (let n = w * WORLD_SIZE + 1; n <= (w + 1) * WORLD_SIZE; n++) {
        const cfg = levelConfig(n);
        const b = document.createElement("button");
        const locked = n > progress.unlocked;
        b.className = "lvl" + (locked ? " locked" : "") + (n === state.level && !state.endless ? " current" : "");
        b.disabled = locked;
        const extras = (cfg.layout.rocks.length ? `, ${cfg.layout.rocks.length} rocks` : "") + (cfg.layout.cages.length ? `, ${cfg.layout.cages.length} cages` : "");
        b.title = `Level ${n}: ${cfg.target} points in ${cfg.moves} moves${extras}` + (progress.best[n] ? ` (best ${progress.best[n]})` : "");
        const stars = progress.stars[n] || 0;
        b.innerHTML = `<b>${n}</b><span>${locked ? "\u{1F512}" : "\u2605".repeat(stars) + "\u2606".repeat(3 - stars)}</span>`;
        b.addEventListener("click", () => { if (!busy) { startLevel(state, n); paused = false; togglePanel(false); newBoard(); } });
        grid.appendChild(b);
      }
    });
  }

  function togglePanel(open = !panelOpen) {
    if (open && busy) return;
    panelOpen = open;
    armed = null;
    el("levels").hidden = !open;
    el("board").hidden = open;
    if (open) { buildGrid(); const cur = grids[0].querySelector(".current") || grids[1].querySelector(".current"); if (cur && cur.focus) cur.focus(); }
  }

  el("endless").addEventListener("click", () => { if (!busy) { startEndless(state); paused = false; togglePanel(false); newBoard(); } });
  for (const p of POWERUPS) el(`pu-${p}`).addEventListener("click", () => arm(p));
  el("btn-hint").addEventListener("click", showHint);
  el("btn-retry").addEventListener("click", () => { if (!busy && !panelOpen) retry(); });
  el("levels-btn").addEventListener("click", () => togglePanel());
  el("levels-close").addEventListener("click", () => togglePanel(false));

  // --- Debug window: type debug_window() in the browser console (debug_window(false) closes it) ---
  // The same actions are available from the console as `match3_debug` (e.g. match3_debug.goto(150)).
  const idle = async () => { while (busy) await new Promise((r) => setTimeout(r, 40)); };
  const persist = () => { try { localStorage.setItem(progressKey, JSON.stringify(progress)); } catch (e) { /* ignore */ } };
  const forEachCell = (fn) => state.board.forEach((row, y) => row.forEach((c, x) => fn(c, x, y)));

  const dbg = {
    freezeMoves: false, // moves never run out
    placing: null, // tool applied to the clicked cell instead of playing
    get state() { return state; },
    progress,
    findMove, levelConfig, usePowerup, trySwap,

    async goto(n) {
      await idle();
      startLevel(state, Math.min(MAX_LEVEL, Math.max(1, Math.round(Number(n)) || 1)));
      paused = false;
      togglePanel(false);
      newBoard();
    },
    async endless() { await idle(); startEndless(state); paused = false; togglePanel(false); newBoard(); },
    async retry() { await idle(); retry(); },
    async win() {
      await idle();
      if (state.status !== "play") return;
      forEachCell((c) => { if (c && c.c > 0) c.c = 0; });
      setBoard(state.board);
      if (state.endless) return;
      state.score = Math.max(state.score, state.target);
      state.status = "levelclear";
      state.stars = starsFor(Math.max(state.movesLeft, 0), state.moves);
      targetScore = state.score;
      recordResult();
    },
    async lose() {
      await idle();
      if (state.endless || state.status !== "play") return;
      state.movesLeft = 0;
      state.status = "over";
      recordResult();
    },
    addMoves(n) {
      if (!isFinite(state.movesLeft)) return;
      state.movesLeft = Math.max(0, state.movesLeft + n);
      if (state.status === "over" && state.movesLeft > 0) state.status = "play";
    },
    addScore(n) { state.score = Math.max(0, state.score + n); targetScore = state.score; },
    setPowerup(type, n) {
      state.powerups[type] = Math.max(0, Math.floor(n));
      if (n > 0) flashPowerup(type);
      progress.powerups = { ...state.powerups };
      persist();
    },
    setAwardChance(percent) { state.awardChance = Math.min(1, Math.max(0, percent / 100)); },
    async shuffle() { await idle(); busy = true; shuffle(state); setBoard(state.board); busy = false; },
    breakCages() { forEachCell((c) => { if (c && c.c > 0) c.c = 0; }); setBoard(state.board); },
    // Plays out any matches left on the board (after placing gems by hand).
    async resolve() {
      await idle();
      busy = true;
      setBoard(state.board);
      const steps = resolve(state, null, []);
      const shuffled = ensurePlayable(state);
      await finishMove({ steps, shuffled, bonus: 0, awards: awardPowerups(state, steps), powerup: true });
    },
    place(tool, x, y) {
      if (!inBoard(x, y)) return;
      const cur = state.board[y][x];
      const keepType = cur && cur.t >= 0 ? cur.t : 0;
      if (/^t\d$/.test(tool)) state.board[y][x] = gem(Number(tool[1]));
      else if (tool === "row" || tool === "col" || tool === "blast") state.board[y][x] = gem(keepType, tool);
      else if (tool === "color") state.board[y][x] = gem(COLOR, "color");
      else if (tool === "cage1" || tool === "cage2") state.board[y][x] = gem(keepType, null, tool === "cage1" ? 1 : 2);
      else if (tool === "uncage") state.board[y][x] = gem(keepType, cur && cur.s !== "rock" ? cur.s : null);
      else if (tool === "rock") state.board[y][x] = gem(ROCK, "rock");
      else if (tool === "random") state.board[y][x] = gem(Math.floor(Math.random() * state.types));
      setBoard(state.board);
    },
    unlockAll() { progress.unlocked = MAX_LEVEL; persist(); buildGrid(); },
    resetProgress() {
      Object.assign(progress, { unlocked: 1, endlessBest: 0, powerups: { hammer: 0, bomb: 0, rainbow: 0 }, stars: {}, best: {} });
      for (const p of POWERUPS) state.powerups[p] = 0;
      persist();
      buildGrid();
    },
    speed(x) { animSpeed = x; },
    theme(t) {
      if (t === "auto") { root.removeAttribute("data-theme"); lastAuto = null; autoTheme(); } else root.setAttribute("data-theme", t);
      readPalette();
    },
    info() {
      let moves = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (const [dx, dy] of [[1, 0], [0, 1]]) if (inBoard(x + dx, y + dy) && isValidSwap(state.board, { x, y }, { x: x + dx, y: y + dy })) moves++;
      let rocks = 0;
      forEachCell((c) => { if (isRock(c)) rocks++; });
      return [
        `level ${state.endless ? "endless" : state.level}  status ${state.status}${busy ? "  (busy)" : ""}`,
        `moves ${state.movesLeft}/${state.moves}  score ${state.score}/${state.target}  stars ${state.stars}`,
        `cages ${cagesLeft(state.board)}  rocks ${rocks}  valid moves ${moves}`,
        `powerups ${POWERUPS.map((p) => `${p[0].toUpperCase()}${state.powerups[p]}`).join(" ")}  award chance ${Math.round((state.awardChance ?? AWARD_CHANCE) * 100)}%`,
        `unlocked ${progress.unlocked}  stars ${Object.keys(progress.stars).length}  anim x${animSpeed}`,
        `theme ${root.getAttribute("data-theme")}  armed ${armed || "-"}  placing ${dbg.placing || "-"}`,
      ].join("\n");
    },
  };
  window.match3_debug = dbg;

  let debugPanel = null;
  let debugTimer = null;

  function buildDebugPanel() {
    const style = document.createElement("style");
    style.textContent = `
      #debug { position: fixed; right: 6px; bottom: 6px; z-index: 50; width: 300px; max-width: 96vw; max-height: 86vh; overflow: auto;
        background: var(--bg); color: var(--text); border: 1px solid var(--accent); border-radius: 6px; padding: 6px 8px; font: 12px/1.4 monospace; text-align: left;
        -webkit-user-select: text; user-select: text; }
      #debug h4 { margin: 8px 0 3px; font: bold 11px monospace; color: var(--accent); text-transform: uppercase; }
      #debug .row { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; }
      #debug button, #debug select, #debug input { font: 11px monospace; min-height: 0; min-width: 0; padding: 2px 6px; }
      #debug input[type=number] { width: 56px; color: var(--text); background: var(--surface); border: 1px solid var(--border); }
      #debug pre { margin: 0; white-space: pre-wrap; background: var(--surface); padding: 4px; border-radius: 4px; }
      #debug .head { display: flex; justify-content: space-between; align-items: center; }`;
    document.head.appendChild(style);
    const panel = document.createElement("div");
    panel.id = "debug";
    const row = (...kids) => { const r = document.createElement("div"); r.className = "row"; kids.forEach((k) => r.appendChild(k)); return r; };
    const title = (t) => { const h = document.createElement("h4"); h.textContent = t; return h; };
    const btn = (label, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.addEventListener("click", fn); return b; };
    const num = (value, min, max) => { const i = document.createElement("input"); i.type = "number"; i.min = min; i.max = max; i.value = value; return i; };
    const select = (options, fn) => {
      const s = document.createElement("select");
      for (const [value, label] of options) { const o = document.createElement("option"); o.value = value; o.textContent = label; s.appendChild(o); }
      s.addEventListener("change", () => fn(s.value));
      return s;
    };
    const head = document.createElement("div");
    head.className = "head";
    const t = document.createElement("b");
    t.textContent = "match3 debug";
    head.append(t, btn("x", () => window.debug_window(false)));
    const out = document.createElement("pre");
    out.id = "debug-info";
    const levelInput = num(state.level || 1, 1, MAX_LEVEL);
    const chance = num(50, 0, 100);
    const scoreInput = num(500, 0, 99999);
    const freeze = document.createElement("input");
    freeze.type = "checkbox";
    freeze.addEventListener("change", () => { dbg.freezeMoves = freeze.checked; });
    const freezeLabel = document.createElement("label");
    freezeLabel.append(freeze, " infinite moves");
    const tools = [["", "off (play)"], ...[0, 1, 2, 3, 4, 5].map((n) => [`t${n}`, `gem ${n}`]),
      ["row", "special: row"], ["col", "special: column"], ["blast", "special: blast"], ["color", "special: colour"],
      ["cage1", "cage (1 hit)"], ["cage2", "cage (2 hits)"], ["uncage", "remove cage"], ["rock", "rock"], ["random", "random gem"]];
    panel.append(
      head, out,
      title("Level"),
      row(levelInput, btn("Go", () => dbg.goto(levelInput.value)), btn("Prev", () => dbg.goto((state.level || 1) - 1)), btn("Next", () => dbg.goto((state.level || 0) + 1)), btn("Endless", () => dbg.endless())),
      row(btn("Win", () => dbg.win()), btn("Lose", () => dbg.lose()), btn("Retry", () => dbg.retry()), btn("Unlock all", () => dbg.unlockAll()), btn("Reset progress", () => { if (confirm("Reset all saved progress?")) dbg.resetProgress(); })),
      title("Moves and score"),
      row(btn("+5 moves", () => dbg.addMoves(5)), btn("-1 move", () => dbg.addMoves(-1)), freezeLabel),
      row(scoreInput, btn("+ score", () => dbg.addScore(Number(scoreInput.value) || 0)), btn("- score", () => dbg.addScore(-(Number(scoreInput.value) || 0)))),
      title("Powerups"),
      ...POWERUPS.map((p) => row(btn(`${p} +1`, () => dbg.setPowerup(p, state.powerups[p] + 1)), btn("+5", () => dbg.setPowerup(p, state.powerups[p] + 5)), btn("0", () => dbg.setPowerup(p, 0)))),
      row(document.createTextNode("award chance %"), chance, btn("Set", () => dbg.setAwardChance(Number(chance.value) || 0))),
      title("Board"),
      row(btn("Shuffle", () => dbg.shuffle()), btn("Break cages", () => dbg.breakCages()), btn("Hint", showHint), btn("Resolve", () => dbg.resolve())),
      row(document.createTextNode("click-to-place"), select(tools, (v) => { dbg.placing = v || null; })),
      title("View"),
      row(document.createTextNode("anim"), select([["1", "x1"], ["0", "instant"], ["0.5", "x0.5 slow"], ["2", "x2"], ["4", "x4"]], (v) => dbg.speed(Number(v))), btn("Light", () => dbg.theme("light")), btn("Dark", () => dbg.theme("dark")), btn("Auto", () => dbg.theme("auto"))),
      row(btn("Log state", () => console.log(state)), btn("Log progress", () => console.log(progress))),
    );
    document.body.appendChild(panel);
    return panel;
  }

  window.debug_window = function debug_window(open = true) {
    if (open === false) {
      if (debugPanel) { debugPanel.remove(); debugPanel = null; }
      clearInterval(debugTimer);
      dbg.placing = null;
      return "debug window closed";
    }
    if (!debugPanel) {
      debugPanel = buildDebugPanel();
      const refresh = () => { const o = debugPanel && debugPanel.querySelector("#debug-info"); if (o) o.textContent = dbg.info(); };
      refresh();
      debugTimer = setInterval(refresh, 300);
    }
    return "debug window open - debug_window(false) closes it; actions: match3_debug";
  };

  buildGrid();
  say(goalText());
  newBoard();
  requestAnimationFrame(frame);
}
