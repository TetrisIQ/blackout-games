// Match 3: 8x8 board, swap neighbours to line up 3+, special gems, cascades, levels with a move limit.
const GAME_ID = "match3";
const W = 8;
const H = 8;
const TYPES = 6; // most gem types a level can use
const COLOR = -1; // type of a colour gem; it never matches on its own
const MAX_LEVEL = 100;
const BONUS_PER_MOVE = 50;
const POWERUPS = ["hammer", "bomb", "rainbow"]; // earned in endless mode, usable everywhere
const AWARD_CHANCE = 0.5; // per combo of 4+ gems in endless mode
const POWERUP_WEIGHTS = { hammer: 60, bomb: 30, rainbow: 10 }; // which powerup an award is: common to rare
const TARGET_BASE = 1100;
const TARGET_STEP = 18;
const TARGET_CURVE = 0;

// --- Logic (no DOM; testable with node) ---------------------------------
// A gem is { t: type 0..TYPES-1 (or COLOR), s: null | "row" | "col" | "blast" | "color" }.
// Cells are addressed as flat indexes y * W + x inside sets; positions are { x, y }.

const gem = (t, s = null) => ({ t, s });
const idx = (x, y) => y * W + x;
const at = (i) => ({ x: i % W, y: Math.floor(i / W) });
const inBoard = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const cloneBoard = (b) => b.map((r) => r.map((c) => c && { t: c.t, s: c.s }));

// Difficulty grows with the level: fewer moves, higher goal.
function levelConfig(level) {
  const n = Math.min(MAX_LEVEL, Math.max(1, Math.round(level)));
  const types = TYPES;
  const moves = 22 - Math.floor((n - 1) / 16);
  const target = Math.round((TARGET_BASE + TARGET_STEP * (n - 1) + TARGET_CURVE * (n - 1) * (n - 1)) / 50) * 50;
  return { level: n, types, moves, target };
}

// 3 stars with at least half the moves left, 2 with a quarter, else 1.
const starsFor = (movesLeft, moves) => (movesLeft * 2 >= moves ? 3 : movesLeft * 4 >= moves ? 2 : 1);

// Runs of 3+ in a row/column, merged into groups when they share a cell (L/T shapes).
function findGroups(board) {
  const runs = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; ) {
      const c = board[y][x];
      if (!c || c.t === COLOR) { x++; continue; }
      let e = x + 1;
      while (e < W && board[y][e] && board[y][e].t === c.t) e++;
      if (e - x >= 3) runs.push({ dir: "h", t: c.t, cells: Array.from({ length: e - x }, (_, k) => idx(x + k, y)) });
      x = e;
    }
  }
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; ) {
      const c = board[y][x];
      if (!c || c.t === COLOR) { y++; continue; }
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
    if (!c || !c.s) continue;
    if (c.s === "row") for (let k = 0; k < W; k++) add(k, y);
    else if (c.s === "col") for (let k = 0; k < H; k++) add(x, k);
    else if (c.s === "blast") for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) add(x + dx, y + dy);
    else if (c.s === "color") {
      // Hit by another special instead of swapped: clears a random colour present on the board.
      const present = [...new Set(board.flat().filter((g) => g && g.t !== COLOR).map((g) => g.t))];
      if (present.length) {
        const t = present[Math.floor(state.random() * present.length)];
        for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (board[yy][xx] && board[yy][xx].t === t) add(xx, yy);
      }
    }
  }
}

// Gravity: gems fall down, new random gems fill the top.
function settle(state) {
  for (let x = 0; x < W; x++) {
    const col = [];
    for (let y = H - 1; y >= 0; y--) if (state.board[y][x]) col.push(state.board[y][x]);
    for (let y = H - 1, k = 0; y >= 0; y--, k++) {
      state.board[y][x] = k < col.length ? col[k] : gem(Math.floor(state.random() * state.types));
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
      if (sp) creates.push(sp);
    }
    if (!clear.size) break;
    expand(state, clear);
    for (const c of creates) clear.delete(c.idx); // new specials survive
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
  if (!ga || !gb) return { valid: false };
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
function createBoard(random = Math.random, types = TYPES) {
  for (;;) {
    const b = [];
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < W; x++) {
        const bad = new Set();
        if (x >= 2 && row[x - 1].t === row[x - 2].t) bad.add(row[x - 1].t);
        if (y >= 2 && b[y - 1][x].t === b[y - 2][x].t) bad.add(b[y - 1][x].t);
        const ok = [...Array(types).keys()].filter((t) => !bad.has(t));
        row.push(gem(ok[Math.floor(random() * ok.length)]));
      }
      b.push(row);
    }
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
  state.board = createBoard(state.random, cfg.types);
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
  for (let n = 0; n < 200; n++) {
    const gems = state.board.flat();
    for (let i = gems.length - 1; i > 0; i--) {
      const j = Math.floor(state.random() * (i + 1));
      [gems[i], gems[j]] = [gems[j], gems[i]];
    }
    const b = Array.from({ length: H }, (_, y) => gems.slice(y * W, (y + 1) * W));
    if (!findGroups(b).length && findMove(b)) { state.board = b; return; }
  }
  state.board = createBoard(state.random, state.types);
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
      if (state.random() >= AWARD_CHANCE) continue;
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
  if (state.score >= state.target) {
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
  if (!inBoard(pos.x, pos.y) || !state.board[pos.y][pos.x]) return none;
  const target = state.board[pos.y][pos.x];
  if (type === "rainbow" && target.t === COLOR) return none;
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
    W, H, TYPES, COLOR, MAX_LEVEL, gem, idx, levelConfig, starsFor, POWERUPS, POWERUP_WEIGHTS, AWARD_CHANCE, pickPowerup, usePowerup, startLevel, startEndless, ensurePlayable, cloneBoard, findGroups, evaluateSwap, isValidSwap,
    findMove, createBoard, createState, shuffle, trySwap, nextLevel,
  };
}

// --- Browser: input, rendering, animation -------------------------------
// The logic above is already final when an animation starts; the browser only replays the steps.
// Gems are sprites ({ g, x, y, sc, al, flash }, positions in cell units) that tweens move around.

if (typeof document !== "undefined") {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const cell = canvas.width / W;
  const el = (id) => document.getElementById(id);
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
      if (reduced) { fn(1); resolve(); return; }
      const t0 = performance.now();
      const tick = () => {
        const t = Math.min(1, (performance.now() - t0) / ms);
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
    const start = new Map(sprites.map((s) => [s, s.y]));
    for (const s of sprites) s.y -= H + 1 + s.x * 0.6 + Math.random();
    const from = new Map(sprites.map((s) => [s, s.y]));
    await tween(700, (t) => { for (const s of sprites) s.y = from.get(s) + (start.get(s) - from.get(s)) * t; }, easeBack);
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
    const cx = step.cleared.reduce((a, p) => a + p.x, 0) / step.cleared.length;
    const cy = step.cleared.reduce((a, p) => a + p.y, 0) / step.cleared.length;
    popup(cx, cy, `+${step.points}`, 18 + Math.min(14, step.cascade * 3));
    if (step.cascade > 1) popup(W / 2 - 0.5, H / 2 - 0.5, `Cascade x${step.cascade}!`, 26);
    if (step.cleared.length >= 8) shake = Math.max(shake, Math.min(10, step.cleared.length / 2));
    targetScore += step.points;

    await tween(230, (t) => {
      for (const s of doomed) { s.sc = 1 - t; s.al = 1 - t * 0.6; s.flash = Math.sin(Math.min(1, t * 2) * Math.PI / 2) * (1 - t); }
      for (const s of born) s.sc = 1.6 - 0.6 * t;
    }, easeOut);
    sprites = sprites.filter((s) => !doomed.includes(s));

    // Gravity: survivors keep their order and drop to the bottom, new gems enter from above.
    const moves = [];
    let far = 1;
    for (let x = 0; x < W; x++) {
      const col = sprites.filter((s) => Math.round(s.x) === x).sort((a, b) => b.y - a.y);
      col.forEach((s, k) => { moves.push({ s, from: s.y, to: H - 1 - k }); far = Math.max(far, H - 1 - k - s.y); });
      const missing = H - col.length;
      for (let r = 0; r < missing; r++) {
        const s = { g: step.board[r][x], x, y: r - missing, sc: 1, al: 1, flash: 0 };
        sprites.push(s);
        moves.push({ s, from: s.y, to: r });
        far = Math.max(far, missing);
      }
    }
    await tween(140 + 55 * far, (t) => { for (const m of moves) m.s.y = m.from + (m.to - m.from) * t; }, easeBack);
    setBoard(step.board);
    await tween(90, () => {});
  }

  async function shuffleAnim() {
    say("No moves left - board shuffled");
    await tween(220, (t) => { for (const s of sprites) s.sc = 1 - t; }, easeOut);
    setBoard(state.board);
    for (const s of sprites) s.sc = 0;
    await tween(300, (t) => { for (const s of sprites) s.sc = t; }, easeBack);
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
      shape(s.g.t === COLOR ? 5 : s.g.t, r * 1.1);
    }
    ctx.restore();
  }

  function outline(p, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeRect(p.x * cell + 2, p.y * cell + 2, cell - 4, cell - 4);
  }

  function overlay(text) {
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = "28px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  function draw(now) {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake * 2, (Math.random() - 0.5) * shake * 2);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        ctx.fillStyle = (x + y) % 2 ? "#161616" : "#1d1d1d";
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
      ctx.font = `bold ${p.size}px system-ui`;
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#000";
      ctx.strokeText(p.text, p.x, p.y - t * 40);
      ctx.fillStyle = "#fff";
      ctx.fillText(p.text, p.x, p.y - t * 40);
    }
    ctx.globalAlpha = 1;
    if (hint) { outline(hint[0], "#2ecc71", 3); outline(hint[1], "#2ecc71", 3); }
    if (selected) outline(selected, "#fff", 4);
    if (armed && !busy) {
      for (const p of previewCells()) {
        ctx.fillStyle = "rgba(255,140,0,0.25)";
        ctx.fillRect(p.x * cell, p.y * cell, cell, cell);
        outline(p, "#ff8c00", 2);
      }
    }
    outline(cursor, "rgba(255,255,255,0.35)", 1);
    ctx.restore();

    if (state.status === "levelclear" && !busy) overlay(state.level >= MAX_LEVEL ? "All 100 levels cleared!" : `Level clear! ${"\u2605".repeat(state.stars)} (Enter)`);
    else if (state.status === "over" && !busy) overlay("Out of moves (R retry)");
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
    POWERUPS.forEach((p, i) => {
      const b = el(`pu-${p}`);
      b.textContent = `${LABELS[p]} x${state.powerups[p]} (${i + 1})`;
      b.disabled = !(state.powerups[p] > 0);
      b.className = armed === p ? "armed" : "";
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
    : `Goal: ${state.target} points in ${state.moves} moves (${levelConfig(state.level).types} colours)`;

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
    const res = trySwap(state, a, b);
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
    }
    if (res.bonus) {
      popup(W / 2 - 0.5, H / 2 - 0.5, `+${res.bonus} bonus`, 28);
      say(`Level clear! +${res.bonus} bonus for unused moves`);
    }
    targetScore = state.score;
    if (state.status !== "play" || state.endless || res.powerup || res.awards.length) recordResult();
    busy = false;
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
    if (armed === "hammer") return [cursor];
    if (armed === "bomb") {
      const out = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inBoard(cursor.x + dx, cursor.y + dy)) out.push({ x: cursor.x + dx, y: cursor.y + dy });
      return out;
    }
    const t = state.board[cursor.y][cursor.x].t;
    const out = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (state.board[y][x].t === t) out.push({ x, y });
    return t === COLOR ? [] : out;
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

  document.addEventListener("keydown", (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === "l") { togglePanel(); }
    else if (key === "Escape" && panelOpen) togglePanel(false);
    else if (panelOpen || busy) return;
    else if (key === "r") { paused = false; if (state.endless) startEndless(state); else startLevel(state, state.level); newBoard(); }
    else if (key === "p" && state.status === "play") paused = !paused;
    else if (key === "Enter" && state.status === "levelclear") { if (nextLevel(state)) newBoard(); }
    else if (paused) return;
    else if (key === "Escape" && armed) { armed = null; say(goalText()); }
    else if (armed && (key === " " || key === "Enter")) usePower(cursor);
    else if (key === "1" || key === "2" || key === "3") arm(POWERUPS[Number(key) - 1]);
    else if (key === "h" && state.status === "play") { hint = findMove(state.board); selected = null; }
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
  const grid = el("grid");

  function buildGrid() {
    grid.textContent = "";
    el("endless").className = state.endless ? "current" : "";
    el("endless").textContent = `\u221e Endless (best ${progress.endlessBest})`;
    for (let n = 1; n <= MAX_LEVEL; n++) {
      const cfg = levelConfig(n);
      const b = document.createElement("button");
      const locked = n > progress.unlocked;
      b.className = "lvl" + (locked ? " locked" : "") + (n === state.level ? " current" : "");
      b.disabled = locked;
      b.title = `Level ${n}: ${cfg.target} points in ${cfg.moves} moves, ${cfg.types} colours` + (progress.best[n] ? ` (best ${progress.best[n]})` : "");
      const stars = progress.stars[n] || 0;
      b.innerHTML = `<b>${n}</b><span>${locked ? "\u{1F512}" : "\u2605".repeat(stars) + "\u2606".repeat(3 - stars)}</span>`;
      b.addEventListener("click", () => { if (!busy) { startLevel(state, n); paused = false; togglePanel(false); newBoard(); } });
      grid.appendChild(b);
    }
  }

  function togglePanel(open = !panelOpen) {
    if (open && busy) return;
    panelOpen = open;
    armed = null;
    el("levels").hidden = !open;
    el("board").hidden = open;
    if (open) { buildGrid(); const cur = grid.querySelector(".current"); if (cur && cur.focus) cur.focus(); }
  }

  el("endless").addEventListener("click", () => { if (!busy) { startEndless(state); paused = false; togglePanel(false); newBoard(); } });
  for (const p of POWERUPS) el(`pu-${p}`).addEventListener("click", () => arm(p));
  el("levels-btn").addEventListener("click", () => togglePanel());
  el("levels-close").addEventListener("click", () => togglePanel(false));

  buildGrid();
  say(goalText());
  newBoard();
  requestAnimationFrame(frame);
}
