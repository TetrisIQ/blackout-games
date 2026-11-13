// Tetris: 10x20 board, 7-bag randomizer, ghost piece, next preview.
const GAME_ID = "tetris";
const COLS = 10;
const ROWS = 20;

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
const TYPES = Object.keys(SHAPES);
const LINE_POINTS = [0, 100, 300, 500, 800];

// --- Logic (no DOM; testable with node) ---------------------------------

function shuffle(items, random) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Campaign levels tilt the bag against the player: extra S/Z pieces, fewer I pieces as pressure grows.
function bagFor(state) {
  const bag = TYPES.slice();
  const bias = state.cfg ? state.cfg.bias * state.pressure : 0;
  for (let i = 0; i < Math.floor(bias * 3); i++) bag.push("S", "Z");
  if (bias > 0.6 && state.random() < 0.5) bag.splice(bag.indexOf("I"), 1); // every other bag has no I
  return shuffle(bag, state.random);
}

const isSZ = (t) => t === "S" || t === "Z";

function nextType(state) {
  if (state.bag.length === 0) state.bag = bagFor(state);
  let i = state.bag.length - 1;
  // Fairness: never a third S/Z in a row when anything else is left in the bag.
  if (state.cfg && isSZ(state.bag[i]) && state.recent.length === 2 && state.recent.every(isSZ)) {
    if (state.bag.every(isSZ)) state.bag = [...bagFor(state), ...state.bag];
    i = state.bag.findLastIndex((t) => !isSZ(t));
  }
  const type = state.bag.splice(i, 1)[0];
  state.recent = [...state.recent, type].slice(-2);
  return type;
}

function rotateShape(shape) {
  const n = shape.length;
  return shape.map((row, y) => row.map((_, x) => shape[n - 1 - x][y]));
}

function collides(board, shape, px, py) {
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape.length; x++) {
      if (!shape[y][x]) continue;
      const bx = px + x;
      const by = py + y;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && board[by][bx]) return true;
    }
  }
  return false;
}

// opts: { world, level } starts a campaign level (level BOSS_LEVEL is the boss); without opts it is the endless game.
function createState(random = Math.random, opts = null) {
  const cfg = opts ? (opts.level === BOSS_LEVEL ? bossConfig(opts.world) : levelConfig(opts.world, opts.level)) : null;
  const state = {
    board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    piece: null,
    next: null,
    bag: [],
    recent: [],
    score: 0,
    lines: 0,
    level: 1,
    over: false,
    won: false,
    random,
    cfg,
    mode: cfg ? (cfg.boss ? "boss" : "level") : "endless",
    elapsed: 0,
    acc: 0,
    pressure: 0,
    garbageRows: 0,
    nextGarbageAt: cfg && cfg.garbage ? cfg.garbage.startMs : Infinity,
    blackoutUntil: 0,
    fakeNext: null,
    boss: cfg && cfg.boss ? { hp: cfg.bossInfo.hp, maxHp: cfg.bossInfo.hp, attacks: 0, nextAttackAt: cfg.bossInfo.attack0, warning: null } : null,
  };
  state.next = nextType(state);
  spawn(state);
  return state;
}

function spawn(state) {
  const type = state.next;
  state.next = nextType(state);
  state.fakeNext = null;
  const shape = SHAPES[type].map((row) => row.slice());
  state.piece = { type, shape, x: Math.floor((COLS - shape.length) / 2), y: 0 };
  if (collides(state.board, shape, state.piece.x, state.piece.y)) state.over = true;
}

function move(state, dx) {
  if (state.over) return false;
  const p = state.piece;
  if (collides(state.board, p.shape, p.x + dx, p.y)) return false;
  p.x += dx;
  return true;
}

// Clockwise rotation with simple wall kicks (shift sideways until it fits).
function rotate(state) {
  if (state.over) return false;
  const p = state.piece;
  const shape = rotateShape(p.shape);
  for (const kick of [0, -1, 1, -2, 2]) {
    if (!collides(state.board, shape, p.x + kick, p.y)) {
      p.shape = shape;
      p.x += kick;
      return true;
    }
  }
  return false;
}

// A full row counts as cleared. A concrete block ("X") survives the first clear as a cracked block ("x") and
// keeps its row; only the second clear removes it.
function clearLines(board) {
  let cleared = 0;
  const kept = [];
  for (const row of board) {
    if (row.some((c) => !c)) { kept.push(row); continue; }
    cleared++;
    if (row.includes("X")) kept.push(row.map((c) => (c === "X" ? "x" : null)));
  }
  while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
  board.splice(0, ROWS, ...kept);
  return cleared;
}

function lock(state) {
  const p = state.piece;
  p.shape.forEach((row, y) =>
    row.forEach((v, x) => {
      const by = p.y + y;
      if (v && by >= 0) state.board[by][p.x + x] = p.type;
    }),
  );
  const cleared = clearLines(state.board);
  state.score += LINE_POINTS[cleared] * state.level;
  state.lines += cleared;
  state.level = 1 + Math.floor(state.lines / 10);
  if (state.boss && cleared) {
    state.boss.hp = Math.max(0, state.boss.hp - bossDamage(cleared));
    if (state.boss.hp === 0) {
      state.won = true;
      state.over = true;
      return cleared;
    }
  }
  spawn(state);
  return cleared;
}

// One gravity step: move down, or lock when resting.
function tick(state) {
  if (state.over) return;
  const p = state.piece;
  if (collides(state.board, p.shape, p.x, p.y + 1)) lock(state);
  else p.y += 1;
}

function softDrop(state) {
  if (state.over) return;
  const p = state.piece;
  if (!collides(state.board, p.shape, p.x, p.y + 1)) {
    p.y += 1;
    state.score += 1;
  } else {
    lock(state);
  }
}

function ghostY(state) {
  const p = state.piece;
  let y = p.y;
  while (!collides(state.board, p.shape, p.x, y + 1)) y++;
  return y;
}

function hardDrop(state) {
  if (state.over) return;
  const target = ghostY(state);
  state.score += 2 * (target - state.piece.y);
  state.piece.y = target;
  lock(state);
}

function dropInterval(level) {
  return Math.max(100, 800 - (level - 1) * 70);
}

// --- Campaign: worlds, levels, bosses -----------------------------------
// Levels have no timer. Pressure grows with play time (0..1): pieces fall faster, the bag gets nastier and
// garbage rows rise from below, faster and faster, until the stack tops out. That rising garbage is the hard
// cap that guarantees every level ends. Stars come from the final score; the boss ends when its HP is gone.

const LEVELS_PER_WORLD = 10;
const BOSS_LEVEL = LEVELS_PER_WORLD + 1;
const BOSS_STARS_NEEDED = 15; // of the 30 stars in a world's ten levels
const BOSS_DAMAGE = [0, 1, 3, 5, 8]; // by lines cleared at once
const BOSS_WARN_MS = 1500;
const BLACKOUT_MS = 3000;

const WORLDS = [
  { id: "standard", name: "Standard", lines: [[12, 25, 45], [6, 12, 22]], boss: { id: "architect", name: "The Architect", hp: 30, attacks: ["rise", "concrete"] } },
  { id: "lava", name: "Lava", lines: [[8, 16, 30], [4, 8, 14]], boss: { id: "golem", name: "The Lava Golem", hp: 36, attacks: ["rise", "fireball"] } },
  { id: "night", name: "Night", lines: [[10, 20, 38], [5, 10, 18]], boss: { id: "shadow", name: "The Shadow", hp: 42, attacks: ["blackout", "fake", "rise"] } },
];

const lerp = (a, b, t) => a + (b - a) * t;

// Points a typical player has after clearing `rows` rows: doubles at the rising level multiplier plus about
// 80 points of soft/hard drops per row. Players who clear 3-4 rows at once get there with fewer rows.
function scoreForLines(rows) {
  let score = 80 * rows;
  for (let l = 0; l < rows; l += 2) score += LINE_POINTS[2] * (1 + Math.floor(l / 10));
  return Math.round(score / 50) * 50;
}

function levelConfig(world, n) {
  const t = (n - 1) / (LEVELS_PER_WORLD - 1);
  const id = WORLDS[world].id;
  // Star goals are set in rows cleared (first level -> last level of the world) and turned into points.
  const [first, last] = WORLDS[world].lines;
  const goals = first.map((a, i) => lerp(a, last[i], t));
  const cfg = {
    world, level: n, boss: false,
    baseInterval: Math.round(lerp(800, 450, t)),
    minInterval: Math.round(lerp(350, 100, t)),
    rampMs: Math.round(lerp(150000, 90000, t)),
    bias: lerp(0.3, 1, t),
    garbage: null,
    night: null,
    stars: goals.map(scoreForLines),
  };
  const surge = { startMs: cfg.rampMs, firstMs: lerp(9000, 5000, t), minMs: 1200, decay: 0.96 };
  if (id === "lava") cfg.garbage = { startMs: lerp(25000, 15000, t), firstMs: lerp(7000, 4000, t), minMs: 1000, decay: 0.97 };
  else cfg.garbage = surge;
  if (id === "night") cfg.night = { minRows: Math.round(lerp(14, 6, t)) };
  return cfg;
}

function bossConfig(world) {
  const info = WORLDS[world].boss;
  return {
    world, level: BOSS_LEVEL, boss: true,
    bossInfo: { ...info, attack0: 12000, attackMin: 4000, attackDecay: 0.95 },
    baseInterval: 600,
    minInterval: 200,
    rampMs: 120000,
    bias: 0.6,
    garbage: { startMs: 120000, firstMs: 6000, minMs: 1200, decay: 0.96 },
    night: null,
    timeStars: [240000, 150000, 90000], // win times in ms for 1 / 2 / 3 stars (3 stars = fastest)
  };
}

function pressureAt(elapsed, cfg) {
  return Math.min(1, elapsed / cfg.rampMs);
}

function levelInterval(cfg, pressure) {
  return Math.round(cfg.baseInterval - (cfg.baseInterval - cfg.minInterval) * pressure);
}

function bossDamage(lines) {
  return BOSS_DAMAGE[lines] || 0;
}

function starsFor(score, cfg) {
  return cfg.stars.filter((s) => score >= s).length;
}

// Boss stars come from how fast the boss fell; every win is at least one star.
function bossStarsFor(elapsedMs, cfg) {
  return Math.max(1, cfg.timeStars.filter((ms) => elapsedMs <= ms).length);
}

// Pushes one garbage row (one random gap) in from below. The stack topping out ends the game.
function risingRow(state) {
  if (state.board[0].some((c) => c)) { state.over = true; return; }
  const gap = Math.floor(state.random() * COLS);
  state.board.shift();
  state.board.push(Array.from({ length: COLS }, (_, x) => (x === gap ? null : "G")));
  const p = state.piece;
  if (collides(state.board, p.shape, p.x, p.y)) {
    p.y -= 1;
    if (collides(state.board, p.shape, p.x, p.y)) state.over = true;
  }
}

// Drops a single solid block onto the top of a random column ("X" concrete, "G" fireball rubble).
function dropBlock(state, type) {
  const x = Math.floor(state.random() * COLS);
  let y = state.board.findIndex((row) => row[x]);
  y = (y < 0 ? ROWS : y) - 1;
  if (y < 0) { state.over = true; return; }
  const p = state.piece;
  const underPiece = p.shape.some((row, py) => row.some((v, px) => v && p.x + px === x && p.y + py === y));
  if (!underPiece) state.board[y][x] = type;
}

function bossAttack(state, kind) {
  if (kind === "rise") risingRow(state);
  else if (kind === "concrete") dropBlock(state, "X");
  else if (kind === "fireball") dropBlock(state, "G");
  else if (kind === "blackout") state.blackoutUntil = state.elapsed + BLACKOUT_MS;
  else if (kind === "fake") {
    const others = TYPES.filter((t) => t !== state.next);
    state.fakeNext = others[Math.floor(state.random() * others.length)];
  }
}

function runBoss(state) {
  const b = state.boss;
  const info = state.cfg.bossInfo;
  if (!b.warning && state.elapsed >= b.nextAttackAt - BOSS_WARN_MS) {
    b.warning = { kind: info.attacks[b.attacks % info.attacks.length], at: b.nextAttackAt };
  }
  if (b.warning && state.elapsed >= b.warning.at) {
    bossAttack(state, b.warning.kind);
    b.attacks += 1;
    b.warning = null;
    b.nextAttackAt = state.elapsed + Math.max(info.attackMin, info.attack0 * Math.pow(info.attackDecay, b.attacks));
  }
}

// Rows of the board the player can see. Night levels show a band that shrinks and follows the piece.
function visibleBand(state) {
  const n = state.cfg && state.cfg.night;
  if (!n) return [0, ROWS];
  const rows = Math.round(ROWS - (ROWS - n.minRows) * state.pressure);
  const from = Math.max(0, Math.min(ROWS - rows, state.piece.y - 2));
  return [from, from + rows];
}

const isBlackout = (state) => state.elapsed < state.blackoutUntil;

// The next piece the player is shown; the Shadow sometimes lies.
const previewType = (state) => state.fakeNext || state.next;

// Advances the game by dt ms: campaign mechanics first, then gravity at the current speed.
function advance(state, dt) {
  if (state.over) return;
  state.elapsed += dt;
  const cfg = state.cfg;
  if (cfg) {
    state.pressure = pressureAt(state.elapsed, cfg);
    const g = cfg.garbage;
    while (g && !state.over && state.elapsed >= state.nextGarbageAt) {
      risingRow(state);
      state.garbageRows += 1;
      state.nextGarbageAt += Math.max(g.minMs, g.firstMs * Math.pow(g.decay, state.garbageRows));
    }
    if (state.boss && !state.over) runBoss(state);
  }
  const interval = cfg ? levelInterval(cfg, state.pressure) : dropInterval(state.level);
  state.acc += dt;
  while (state.acc >= interval && !state.over) {
    tick(state);
    state.acc -= interval;
  }
}

// --- Progress: { stars: { "<world>-<level>": 1-3 }, best: { ... } }; the boss is level BOSS_LEVEL ---

const blankProgress = () => ({ stars: {}, best: {} });
const levelKey = (world, level) => `${world}-${level}`;
const starsAt = (progress, world, level) => progress.stars[levelKey(world, level)] || 0;

function starsIn(progress, world) {
  let sum = 0;
  for (let n = 1; n <= LEVELS_PER_WORLD; n++) sum += starsAt(progress, world, n);
  return sum;
}

// A world opens once the previous world's boss has fallen.
const worldUnlocked = (progress, world) => world === 0 || starsAt(progress, world - 1, BOSS_LEVEL) > 0;

// Highest level the player may start (0 = world locked): a level needs a star in the one before it.
function unlockedLevel(progress, world) {
  if (!worldUnlocked(progress, world)) return 0;
  let n = 1;
  while (n < LEVELS_PER_WORLD && starsAt(progress, world, n) > 0) n++;
  return n;
}

const bossUnlocked = (progress, world) => worldUnlocked(progress, world) && starsIn(progress, world) >= BOSS_STARS_NEEDED;

// Keeps the best stars and best score of a level. Returns true when it unlocked something new.
function recordResult(progress, world, level, stars, score) {
  const key = levelKey(world, level);
  const wasBoss = level === BOSS_LEVEL;
  const before = wasBoss ? starsAt(progress, world, level) : unlockedLevel(progress, world);
  progress.stars[key] = Math.max(starsAt(progress, world, level), stars);
  progress.best[key] = Math.max(progress.best[key] || 0, score);
  return wasBoss ? before === 0 && stars > 0 : unlockedLevel(progress, world) > before;
}

if (typeof module !== "undefined") {
  module.exports = {
    COLS, ROWS, SHAPES, createState, move, rotate, rotateShape, tick, softDrop,
    hardDrop, ghostY, clearLines, collides, dropInterval, nextType,
    LEVELS_PER_WORLD, BOSS_LEVEL, BOSS_STARS_NEEDED, BOSS_WARN_MS, BLACKOUT_MS, WORLDS,
    levelConfig, bossConfig, pressureAt, levelInterval, bossDamage, starsFor, bossStarsFor, risingRow, dropBlock,
    bossAttack, visibleBand, isBlackout, previewType, advance, blankProgress, levelKey, starsAt, starsIn,
    worldUnlocked, unlockedLevel, bossUnlocked, recordResult,
  };
}

// --- Browser: input, rendering, loop ------------------------------------

if (typeof document !== "undefined") {
  // --- Theme: follow the kit portal (data-theme on the page), else the saved kit choice, else the system ---
  const PAL = {};
  const root = document.documentElement;
  const systemDark = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;

  function readPalette() {
    const cs = getComputedStyle(root);
    for (const k of ["board", "line", "text", "muted", "accent", "overlay", "cell-a", "cell-b", "cage", "bg", "warn"]) PAL[k] = cs.getPropertyValue(`--${k}`).trim();
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
  if (typeof MutationObserver !== "undefined") new MutationObserver(readPalette).observe(root, { attributes: true, attributeFilter: ["data-theme", "data-world"] });

  const CELL = 30;
  const COLORS = {
    I: "#00bcd4", O: "#f1c40f", T: "#9b59b6", S: "#2ecc71",
    Z: "#e74c3c", J: "#3f51b5", L: "#ff9800",
    G: "#7a7f87", X: "#4a4f57", x: "#9aa0a8", // garbage, concrete, cracked concrete
  };
  const WARNINGS = { rise: "Rising!", concrete: "Concrete!", fireball: "Fireball!", blackout: "Blackout!", fake: "Liar!" };
  // --- Telemetry: opt-in through the game library (it sets kit-games:consent and uploads the queue); without it nothing is stored ---
  function track(event, props) {
    try {
      if (localStorage.getItem("kit-games:consent") !== "granted") return;
      const queue = JSON.parse(localStorage.getItem("kit-games:events") || "[]");
      queue.push({ event, properties: { game: GAME_ID, ...props }, timestamp: new Date().toISOString() });
      localStorage.setItem("kit-games:events", JSON.stringify(queue.slice(-500)));
    } catch (e) { /* storage blocked */ }
  }

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const nextCtx = document.getElementById("next").getContext("2d");
  const els = {
    score: document.getElementById("score"),
    lines: document.getElementById("lines"),
    level: document.getElementById("level"),
    best: document.getElementById("best"),
    mode: document.getElementById("mode"),
    levelRow: document.getElementById("level-row"),
    bossbox: document.getElementById("bossbox"),
    bossName: document.getElementById("boss-name"),
    bossHp: document.getElementById("boss-hp"),
    screen: document.getElementById("screen"),
    card: document.getElementById("screen-card"),
  };
  const bestKey = `${GAME_ID}:best`;

  let current = null; // { world, level } while a campaign level is played, null in the endless game
  let state = createState(Math.random, current);
  let paused = false;
  let finished = false; // the campaign result of this round was handled
  // Reaching a star threshold freezes the game for a moment while a star bursts over the board.
  const STAR_MS = 1400;
  let starsShown = 0;
  let starFreeze = false;
  let starAnim = null; // { start, n }
  let starTimer = null;
  let roundStars = 0;

  // One game_start / game_end (endless) or level_start / level_end (campaign) per round; the outcome is read
  // from the state when the round is left.
  let round = null;
  function startRound() {
    round = { active: 0 };
    if (current) track("level_start", { world: WORLDS[current.world].id, level: current.level, boss: current.level === BOSS_LEVEL });
    else track("game_start", {});
  }
  function endRound() {
    if (!round) return;
    const r = round;
    round = null;
    const active_s = Math.round(r.active / 100) / 10;
    if (current) {
      track("level_end", { world: WORLDS[current.world].id, level: current.level, boss: current.level === BOSS_LEVEL, outcome: state.won ? "won" : state.over ? "lost" : "abandoned", score: state.score, lines: state.lines, stars: roundStars, active_s });
    } else {
      track("game_end", { outcome: state.won ? "won" : state.over ? "over" : "abandoned", score: state.score, lines: state.lines, level: state.level, active_s });
    }
  }

  // --- Campaign progress: saved in this browser ---
  const progressKey = `${GAME_ID}:progress`;
  function loadProgress() {
    try {
      const p = JSON.parse(localStorage.getItem(progressKey));
      if (p && typeof p.stars === "object" && typeof p.best === "object") return p;
    } catch (e) { /* no saved progress */ }
    return blankProgress();
  }
  function saveProgress() {
    try { localStorage.setItem(progressKey, JSON.stringify(progress)); } catch (e) { /* storage full or blocked */ }
  }
  const progress = loadProgress();

  // --- Settings: saved in this browser ---
  const settingsKey = `${GAME_ID}:settings`;
  const settings = { side: "left" }; // which side of the board the preview bar (next, score, boss) sits on
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey));
    if (saved && (saved.side === "left" || saved.side === "right")) settings.side = saved.side;
  } catch (e) { /* no saved settings */ }
  function applySettings() {
    document.querySelector(".layout").dataset.side = settings.side;
    try { localStorage.setItem(settingsKey, JSON.stringify(settings)); } catch (e) { /* storage full or blocked */ }
  }
  applySettings();

  // --- How to play: shown on the first visit, then from the button or with "?" ---
  const helpKey = `${GAME_ID}:help`;
  const helpEl = (id) => document.getElementById(id);
  const demo = (html) => `<p class="demo">${html}</p>`;
  const bl = (c, n = 1) => `<span style="color:${c}">${"&#9632;".repeat(n)}</span>`;
  const HELP = [
    {
      title: "Stack the blocks",
      html: `<p>Pieces fall from the top. Move and <b>rotate</b> them so they fill a row completely: <b>full rows vanish</b> and everything above drops down.</p>
        ${demo(`${bl("#00bcd4", 4)}<small>fill the row</small>${bl("#9b59b6", 3)}${bl("#f1c40f", 1)}`)}
        <p>The faint outline shows where the piece will land. The small box shows the next piece.</p>`,
    },
    {
      title: "Points and levels",
      html: `<p>1, 2, 3 or 4 rows at once give <b>100, 300, 500 or 800 points</b> times your level. Soft drop gives 1 point per row, hard drop 2.</p>
        ${demo(`${bl("#e74c3c", 1)}${bl("#e74c3c", 1)}${bl("#e74c3c", 1)}${bl("#e74c3c", 1)} <small>4 rows = most points</small>`)}
        <p>Every <b>10 rows</b> the level goes up and the pieces fall faster. The game ends when the stack reaches the top.</p>`,
    },
    {
      title: "Campaign",
      html: `<p>Three worlds with <b>10 levels and a boss</b> each. There is no timer: the longer you survive, the faster the pieces fall and the nastier they get, until the stack tops out. Your <b>score</b> gives 1 to 3 stars: each time you reach one, it bursts over the board and the game pauses for a moment. One star opens the next level.</p>
        <p><b>Lava</b> pushes garbage rows up from below. <b>Night</b> hides most of the board: you only see a band around your piece.</p>
        <p>The <b>boss</b> needs ${BOSS_STARS_NEEDED} stars from its world. Clear rows to hurt it (4 at once hurts most) and watch its attacks: they flash at the edge before they hit. Beat it to open the next world. <b>Endless</b> keeps the classic game.</p>`,
    },
    {
      title: "Controls",
      html: `<p><b>Keyboard:</b> <kbd>&larr;</kbd> <kbd>&rarr;</kbd> move, <kbd>&uarr;</kbd> rotate, <kbd>&darr;</kbd> soft drop, <kbd>Space</kbd> hard drop, <kbd>P</kbd> pause, <kbd>R</kbd> restart, <kbd>Esc</kbd> menu, <kbd>?</kbd> this guide.</p>
        <p><b>Touch:</b> on the board, <b>tap</b> to rotate, <b>drag</b> left or right to move, drag down to soft drop and <b>flick down</b> to hard drop. Tap the board to resume after a pause; <b>Pause</b>, <b>Restart</b> and <b>Menu</b> are the buttons beside and below it.</p>
        <p>The game pauses when you leave the page. Your best score is saved in this browser.</p>`,
    },
  ];
  let helpOpen = false;
  let helpIndex = 0;
  let pausedByHelp = false;

  function helpPage(i) {
    helpIndex = Math.min(HELP.length - 1, Math.max(0, i));
    const page = HELP[helpIndex];
    helpEl("help-title").textContent = page.title;
    helpEl("help-body").innerHTML = page.html;
    helpEl("help-dots").innerHTML = HELP.map((_, k) => (k === helpIndex ? "<b>&#9679;</b>" : "&#9675;")).join("");
    helpEl("help-back").disabled = helpIndex === 0;
    helpEl("help-next").textContent = helpIndex === HELP.length - 1 ? "Let's play" : "Next";
  }

  function showHelp() {
    if (helpOpen) return;
    helpOpen = true;
    pausedByHelp = !paused; // the game waits behind the guide
    paused = true;
    helpPage(0);
    helpEl("help").hidden = false;
  }

  function helpNext() {
    if (helpIndex >= HELP.length - 1) closeHelp();
    else helpPage(helpIndex + 1);
  }

  function closeHelp() {
    helpOpen = false;
    helpEl("help").hidden = true;
    if (pausedByHelp) paused = false;
    try { localStorage.setItem(helpKey, "1"); } catch (e) { /* storage blocked */ }
  }

  // Returns true when the key was used by the guide.
  function helpHandleKey(e, key) {
    if (key === "?" ) { showHelp(); e.preventDefault(); return true; }
    if (!helpOpen) return false;
    if (key === "Escape") closeHelp();
    else if (key === "ArrowRight" || key === "Enter" || key === " ") { if (e.target && e.target.tagName === "BUTTON") return true; helpNext(); }
    else if (key === "ArrowLeft") helpPage(helpIndex - 1);
    e.preventDefault();
    return true;
  }

  helpEl("btn-help").addEventListener("click", showHelp);
  helpEl("help-back").addEventListener("click", () => helpPage(helpIndex - 1));
  helpEl("help-next").addEventListener("click", helpNext);
  helpEl("help-close").addEventListener("click", closeHelp);

  let best = Number(localStorage.getItem(bestKey) || 0);
  let last = performance.now();
  els.best.textContent = best;

  function cell(c, type, x, y, alpha = 1) {
    c.globalAlpha = alpha;
    c.fillStyle = COLORS[type];
    c.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    if (type === "X" || type === "x") {
      c.strokeStyle = PAL.board;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x * CELL + 5, y * CELL + 5);
      c.lineTo((x + 1) * CELL - 5, (y + 1) * CELL - 5);
      if (type === "X") { c.moveTo((x + 1) * CELL - 5, y * CELL + 5); c.lineTo(x * CELL + 5, (y + 1) * CELL - 5); }
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  function shapeCells(c, shape, type, ox, oy, alpha) {
    shape.forEach((row, y) => row.forEach((v, x) => v && cell(c, type, ox + x, oy + y, alpha)));
  }

  function overlay(text) {
    ctx.fillStyle = PAL.overlay;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = PAL.text;
    ctx.font = "28px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  function draw(now = performance.now()) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = PAL.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < 10; x++) { ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, canvas.height); }
    for (let y = 1; y < 20; y++) { ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(canvas.width, y * CELL + 0.5); }
    ctx.stroke();
    state.board.forEach((row, y) => row.forEach((t, x) => t && cell(ctx, t, x, y)));
    const p = state.piece;
    if (!state.over) shapeCells(ctx, p.shape, p.type, p.x, ghostY(state), 0.3);
    drawFog();
    if (!state.over) shapeCells(ctx, p.shape, p.type, p.x, p.y, 1);
    drawBossWarning(now);
    drawStarBurst(now);
    nextCtx.clearRect(0, 0, 120, 120);
    const shown = previewType(state);
    const ns = SHAPES[shown];
    const off = (4 - ns.length) / 2;
    shapeCells(nextCtx, ns, shown, off, off, 1);
    els.score.textContent = state.score;
    els.lines.textContent = state.lines;
    els.level.textContent = state.level;
    if (current) els.best.textContent = progress.best[levelKey(current.world, current.level)] || 0;
    else els.best.textContent = best;
    if (state.boss) els.bossHp.style.width = `${(100 * state.boss.hp) / state.boss.maxHp}%`;
    if (state.over) overlay(state.won ? "Victory!" : current ? "Game over" : "Game over (R / tap)");
    else if (paused && !screenName && !starFreeze) overlay("Paused (P / tap)");
  }

  // Night hides the rows outside the band around the piece, the Shadow's blackout hides the whole board.
  function drawFog() {
    const [from, to] = isBlackout(state) ? [0, 0] : visibleBand(state);
    if (from === 0 && to === ROWS) return;
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = PAL.board;
    ctx.fillRect(0, 0, canvas.width, from * CELL);
    ctx.fillRect(0, to * CELL, canvas.width, canvas.height - to * CELL);
    ctx.globalAlpha = 1;
  }

  // A boss attack flashes at the edge of the board and names itself before it lands.
  // A burst of stars over the dimmed board: the stars earned so far, the newest one pops in.
  function drawStarBurst(now) {
    if (!starAnim) return;
    const t = (now - starAnim.start) / STAR_MS;
    if (t >= 1) { starAnim = null; return; }
    const cx = canvas.width / 2;
    const cy = canvas.height / 2 - 30;
    const fade = t < 0.8 ? 1 : (1 - t) / 0.2;
    ctx.globalAlpha = 0.65 * fade;
    ctx.fillStyle = PAL.overlay;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = PAL.accent;
    const spread = 1 - Math.pow(1 - Math.min(1, t * 1.5), 3); // sparks fly out, easing off
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.3;
      const dist = spread * (100 + (i % 3) * 35);
      ctx.globalAlpha = Math.max(0, 1 - t) * fade;
      ctx.font = `${10 + (i % 3) * 5}px Georgia, serif`;
      ctx.fillText("\u2605", cx + Math.cos(a) * dist, cy + Math.sin(a) * dist);
    }
    const pop = Math.min(1, t * 2.4);
    const overshoot = 1 + 2.70158 * Math.pow(pop - 1, 3) + 1.70158 * Math.pow(pop - 1, 2); // 0 -> 1.1 -> 1
    for (let k = 0; k < 3; k++) {
      const earned = k < starAnim.n;
      const scale = k === starAnim.n - 1 ? overshoot : 1;
      ctx.save();
      ctx.translate(cx + (k - 1) * 78, cy + (k === 1 ? -14 : 8));
      ctx.scale(scale, scale);
      if (k === starAnim.n - 1) ctx.rotate((1 - pop) * 0.9);
      ctx.globalAlpha = fade;
      ctx.fillStyle = earned ? PAL.accent : PAL.muted;
      ctx.font = "78px Georgia, serif";
      ctx.fillText(earned ? "\u2605" : "\u2606", 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = fade;
    ctx.fillStyle = PAL.text;
    ctx.font = "26px Georgia, serif";
    ctx.fillText(`Star ${starAnim.n}!`, cx, cy + 85);
    ctx.globalAlpha = 1;
    ctx.textBaseline = "alphabetic";
  }

  function celebrateStar(n, now) {
    starsShown = n;
    starAnim = { start: now, n };
    starFreeze = true;
    paused = true;
    try { if (navigator.vibrate) navigator.vibrate([40, 40, 80]); } catch (e) { /* not supported */ }
    starTimer = setTimeout(() => {
      starFreeze = false;
      if (!screenName && !document.hidden) paused = false; // a menu or a hidden tab keeps the pause
    }, STAR_MS);
  }

  function drawBossWarning(now) {
    const w = state.boss && state.boss.warning;
    if (!w || state.over) return;
    ctx.globalAlpha = 0.45 + 0.4 * Math.sin(now / 90);
    ctx.strokeStyle = PAL.warn;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAL.warn;
    ctx.font = "22px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(`\u26A0 ${WARNINGS[w.kind]}`, canvas.width / 2, 34);
  }

  function saveBest() {
    if (!current && state.score > best) {
      best = state.score;
      localStorage.setItem(bestKey, best);
      els.best.textContent = best;
    }
  }

  // Starts a campaign level ({ world, level }) or, with null, the endless game.
  function startGame(opts) {
    saveBest();
    endRound();
    current = opts;
    state = createState(Math.random, current);
    finished = false;
    roundStars = 0;
    clearTimeout(starTimer);
    starsShown = 0;
    starFreeze = false;
    starAnim = null;
    closeScreen();
    startRound();
    paused = false;
    if (current && current.world > 0) document.documentElement.setAttribute("data-world", WORLDS[current.world].id);
    else document.documentElement.removeAttribute("data-world");
    updateHud();
  }

  const restart = () => startGame(current);

  function updateHud() {
    const b = state.boss;
    els.bossbox.hidden = !b;
    els.levelRow.hidden = !!current;
    if (b) els.bossName.textContent = state.cfg.bossInfo.name;
    els.mode.textContent = !current ? "Endless"
      : current.level === BOSS_LEVEL ? `${WORLDS[current.world].name} \u00b7 Boss`
        : `${WORLDS[current.world].name} \u00b7 Level ${current.level}`;
  }

  // --- Screens: menu, level map and result (rendered into one overlay) ---
  let screenName = null; // "menu" | "worlds" | "result" | "settings"
  let viewWorld = 0;
  let lastResult = null;
  const STAR = "\u2605";
  const NO_STAR = "\u2606";
  const WORLD_TIPS = [
    "Pure Tetris. Pressure builds the longer you last.",
    "Garbage rises from below. Clear rows fast.",
    "The lights go out: you only see a band around your piece.",
  ];

  function openScreen(name) {
    screenName = name;
    paused = true;
    els.screen.hidden = false;
    els.card.innerHTML = { menu: menuHtml, worlds: worldsHtml, result: resultHtml, settings: settingsHtml }[name]();
    const first = els.card.querySelector("button:not(:disabled)");
    if (first && name !== "result") first.focus(); // not on the result: hammering Space after a game over must not retry
  }

  function closeScreen() {
    screenName = null;
    els.screen.hidden = true;
  }

  const resumable = () => round && !state.over;

  function menuHtml() {
    return `<h2>Tetris</h2>
      <p class="sub">Three worlds, ten levels and a boss each.</p>
      <div class="col">
        ${resumable() ? '<button class="main" data-do="resume">Resume</button>' : ""}
        <button class="main" data-do="campaign">Campaign</button>
        <button data-do="endless">Endless</button>
        <button data-do="settings">Settings</button>
        <button data-do="help">How to play</button>
      </div>`;
  }

  function settingsHtml() {
    const side = (value, label) => `<button data-side="${value}" aria-pressed="${settings.side === value}">${label}</button>`;
    return `<h2>Settings</h2>
      <p class="sub">Preview bar (next piece, score)</p>
      <p class="row">${side("left", "Left")}${side("right", "Right")}</p>
      <p class="row"><button data-do="menu">Back</button></p>`;
  }

  function worldsHtml() {
    const w = viewWorld;
    const open = unlockedLevel(progress, w);
    const stars = starsIn(progress, w);
    const levels = [];
    for (let n = 1; n <= LEVELS_PER_WORLD; n++) {
      const got = starsAt(progress, w, n);
      const locked = n > open;
      levels.push(`<button data-level="${n}" ${locked ? "disabled" : ""}><b>${n}</b><span>${locked ? "\u{1F512}" : STAR.repeat(got) + NO_STAR.repeat(3 - got)}</span></button>`);
    }
    const bossOpen = bossUnlocked(progress, w);
    const bossGot = starsAt(progress, w, BOSS_LEVEL);
    const info = WORLDS[w].boss;
    const sub = !worldUnlocked(progress, w) ? `Beat ${WORLDS[w - 1].boss.name} to open this world.` : WORLD_TIPS[w];
    return `<div class="worldbar">
        <button data-world="-1" ${w === 0 ? "disabled" : ""} aria-label="Previous world">&larr;</button>
        <h2>${WORLDS[w].name}</h2>
        <button data-world="1" ${w === WORLDS.length - 1 ? "disabled" : ""} aria-label="Next world">&rarr;</button>
      </div>
      <p class="sub">${sub}<br>${stars}/${LEVELS_PER_WORLD * 3} ${STAR}</p>
      <div class="levels">${levels.join("")}
        <button class="boss" data-level="${BOSS_LEVEL}" ${bossOpen ? "" : "disabled"}><b>${info.name}</b><span>${bossOpen ? STAR.repeat(bossGot) + NO_STAR.repeat(3 - bossGot) : `\u{1F512} ${BOSS_STARS_NEEDED}${STAR}`}</span></button>
      </div>
      <p class="row"><button data-do="menu">Back</button></p>`;
  }

  // The level that follows a cleared one, or null at the end of the campaign.
  function nextTarget(r) {
    if (r.level < LEVELS_PER_WORLD) return { world: r.world, level: r.level + 1 };
    if (r.level === LEVELS_PER_WORLD) return bossUnlocked(progress, r.world) ? { world: r.world, level: BOSS_LEVEL } : null;
    return r.world + 1 < WORLDS.length ? { world: r.world + 1, level: 1 } : null;
  }

  function resultHtml() {
    const r = lastResult;
    const boss = r.level === BOSS_LEVEL;
    const name = boss ? WORLDS[r.world].boss.name : `${WORLDS[r.world].name} \u00b7 Level ${r.level}`;
    let msg;
    if (boss) msg = r.won ? `${WORLDS[r.world].boss.name} falls!${r.opened ? " A new world opens." : ""}` : `${WORLDS[r.world].boss.name} stood its ground.`;
    else if (r.stars === 0) msg = `Reach ${state.cfg.stars[0]} points for the first star.`;
    else if (r.stars < 3) msg = `Next star at ${state.cfg.stars[r.stars]} points.`;
    else msg = "Perfect!";
    const next = r.stars > 0 ? nextTarget(r) : null;
    const hint = r.stars > 0 && !boss && r.level === LEVELS_PER_WORLD && !next ? `<p class="sub">The boss opens at ${BOSS_STARS_NEEDED} ${STAR} in this world.</p>` : "";
    return `<h2>${name}</h2>
      <p class="stars">${STAR.repeat(r.stars)}${NO_STAR.repeat(3 - r.stars)}</p>
      <p class="sub">Score ${r.score}<br>${msg}</p>${hint}
      <div class="col">
        ${next ? '<button class="main" data-do="next">Next</button>' : ""}
        <button ${next ? "" : 'class="main"'} data-do="retry">Retry</button>
        <button data-do="levels">Levels</button>
      </div>`;
  }

  // The level or boss ended: score it, save progress and show the result.
  function finish() {
    finished = true;
    saveBest();
    if (!current) return;
    const stars = current.level === BOSS_LEVEL ? (state.won ? bossStarsFor(state.elapsed, state.cfg) : 0) : starsFor(state.score, state.cfg);
    const opened = recordResult(progress, current.world, current.level, stars, state.score);
    saveProgress();
    roundStars = stars;
    lastResult = { world: current.world, level: current.level, stars, score: state.score, won: state.won, opened };
    endRound();
    const shown = state;
    setTimeout(() => { if (state === shown && !screenName) openScreen("result"); }, 800); // let the last frame sink in
  }

  els.card.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.side) { settings.side = b.dataset.side; applySettings(); openScreen("settings"); }
    else if (b.dataset.level) startGame({ world: viewWorld, level: Number(b.dataset.level) });
    else if (b.dataset.world) { viewWorld += Number(b.dataset.world); openScreen("worlds"); }
    else if (b.dataset.do === "resume") { closeScreen(); paused = false; }
    else if (b.dataset.do === "campaign") {
      viewWorld = 0;
      while (viewWorld + 1 < WORLDS.length && worldUnlocked(progress, viewWorld + 1)) viewWorld++;
      openScreen("worlds");
    } else if (b.dataset.do === "endless") startGame(null);
    else if (b.dataset.do === "settings") openScreen("settings");
    else if (b.dataset.do === "help") showHelp();
    else if (b.dataset.do === "menu") openScreen("menu");
    else if (b.dataset.do === "levels") { viewWorld = lastResult.world; openScreen("worlds"); }
    else if (b.dataset.do === "retry") startGame({ world: lastResult.world, level: lastResult.level });
    else if (b.dataset.do === "next") startGame(nextTarget(lastResult));
  });

  function togglePause() {
    if (!state.over && !starFreeze) paused = !paused;
  }

  const actions = {
    left: () => move(state, -1),
    right: () => move(state, 1),
    rotate: () => rotate(state),
    down: () => softDrop(state),
    drop: () => hardDrop(state),
  };

  document.addEventListener("keydown", (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (helpHandleKey(e, key)) return;
    if (screenName) { // buttons in the overlay handle Enter / Space themselves
      if (key === "Escape") {
        if (screenName === "worlds" || screenName === "settings") openScreen("menu");
        else if (screenName === "result") { viewWorld = lastResult.world; openScreen("worlds"); }
        else if (resumable()) { closeScreen(); paused = false; }
        e.preventDefault();
      }
      return;
    }
    if (key === "Escape") { openScreen("menu"); e.preventDefault(); return; }
    if (key === "r") restart();
    else if (key === "p" && !state.over && !starFreeze) paused = !paused;
    else if (!paused && !state.over) {
      if (key === "ArrowLeft" || key === "a") actions.left();
      else if (key === "ArrowRight" || key === "d") actions.right();
      else if (key === "ArrowUp" || key === "w" || key === "x") actions.rotate();
      else if (key === "ArrowDown" || key === "s") actions.down();
      else if (key === " ") actions.drop();
      else return;
    } else return;
    e.preventDefault();
    saveBest();
    draw();
  });

  // Touch on the board: tap rotates, drag left/right moves, drag down soft-drops, a quick flick down hard-drops.
  // (A mouse only resumes / restarts; the keyboard plays on the desktop.)
  let swipe = null;
  // Dragging down only slides the piece; locking it is left to the flick, gravity or the keyboard.
  function touchDown() {
    const p = state.piece;
    if (!collides(state.board, p.shape, p.x, p.y + 1)) actions.down();
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (state.over) { restart(); return; }
    if (starFreeze) return;
    if (paused) { paused = false; return; }
    if (e.pointerType === "mouse") return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, ax: e.clientX, ay: e.clientY, t: performance.now(), moved: false, axis: null, piece: state.piece };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!swipe || e.pointerId !== swipe.id || paused || state.over) return;
    // A gesture belongs to the piece it started on: once that one has locked (by gravity or by sliding down
    // to the floor) the rest of the drag must not touch the next piece.
    if (state.piece !== swipe.piece) { swipe = null; return; }
    // The first clear movement picks the axis for the whole gesture: a finger drifting sideways during a
    // downward swipe must not shift the piece (and the other way round).
    if (!swipe.axis) {
      const dx = e.clientX - swipe.x;
      const dy = e.clientY - swipe.y;
      if (Math.hypot(dx, dy) < 8) return;
      swipe.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    const step = canvas.getBoundingClientRect().width / COLS; // one board cell in screen pixels
    if (swipe.axis === "x") {
      while (e.clientX - swipe.ax >= step) { actions.right(); swipe.ax += step; swipe.moved = true; }
      while (swipe.ax - e.clientX >= step) { actions.left(); swipe.ax -= step; swipe.moved = true; }
    } else {
      while (e.clientY - swipe.ay >= step) { touchDown(); swipe.ay += step; swipe.moved = true; }
      if (e.clientY < swipe.ay) swipe.ay = e.clientY; // dragging back up re-arms soft drop from there
    }
  });
  function endSwipe(e) {
    if (!swipe || e.pointerId !== swipe.id) return;
    const s = swipe;
    swipe = null;
    if (e.type === "pointercancel" || paused || state.over || state.piece !== s.piece) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const ms = performance.now() - s.t;
    if (!s.moved && Math.hypot(dx, dy) < 12 && ms < 300) actions.rotate();
    else if (ms < 300 && dy > 80 && dy > 2 * Math.abs(dx)) actions.drop();
    saveBest();
  }
  canvas.addEventListener("pointerup", endSwipe);
  canvas.addEventListener("pointercancel", endSwipe);
  // No long-press menu or text selection while playing.
  document.querySelector("main").addEventListener("contextmenu", (e) => e.preventDefault());
  document.getElementById("btn-pause").addEventListener("click", togglePause);
  document.getElementById("btn-restart").addEventListener("click", restart);
  document.getElementById("btn-menu").addEventListener("click", () => { if (!screenName) openScreen("menu"); });
  window.addEventListener("pagehide", endRound);
  document.addEventListener("visibilitychange", () => { if (document.hidden && !state.over) { paused = true; } });

  function frame(now) {
    const dt = Math.min(now - last, 1000);
    last = now;
    if (!paused && !state.over) {
      if (round) round.active += dt;
      advance(state, dt);
    }
    if (current && !state.cfg.boss && !state.over && !starFreeze) {
      const n = starsFor(state.score, state.cfg);
      if (n > starsShown) celebrateStar(n, now);
    }
    if (state.over && !finished) finish();
    saveBest();
    draw(now);
    requestAnimationFrame(frame);
  }
  openScreen("menu");
  try { if (localStorage.getItem(helpKey) !== "1") showHelp(); } catch (e) { showHelp(); } // first visit
  requestAnimationFrame(frame);
}
