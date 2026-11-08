// Tap Match: tap free tiles from a stacked board into a 7-slot tray; three equal tiles vanish.
const GAME_ID = "tap-match";
const TRAY = 7; // tray slots; a full tray without a match ends the level ("+1" adds a slot for one level)
const W = 13; // standard board size in half-tile units (a tile is 2x2 units, upper layers sit offset by 1)
const H = 14;
const TYPES = 18; // tile kinds; they are introduced one by one as the levels go on
const WORLD_SIZE = 50;
const WORLDS = 6;
const LEVELS = WORLD_SIZE * WORLDS;
// Difficulty sets how densely the board is packed (more tiles, more layers); Hard and Extreme also use a larger
// board. The tile kinds stay the same. `w`/`h` are the board size in half-tile units, `max` caps the tile count.
const DIFFICULTIES = [
  { id: "easy", label: "Easy", tiles: 0.6, layers: -1, w: 13, h: 14, max: 120, text: "Airy boards with few tiles" },
  { id: "medium", label: "Medium", tiles: 1, layers: 0, w: 13, h: 14, max: 120, text: "The standard board" },
  { id: "hard", label: "Hard", tiles: 1.5, layers: 1, w: 15, h: 16, max: 170, text: "A larger board, packed with tiles" },
  { id: "extreme", label: "Extreme", tiles: 2, layers: 2, w: 17, h: 18, max: 230, text: "A huge board with deep stacks" },
];
const difficultyOf = (id) => DIFFICULTIES.find((x) => x.id === id) || DIFFICULTIES[1];
const WORLD_NAMES = ["Orchard", "Meadow", "Market", "Greenhouse", "Harvest", "Feast"];
// Powerups are only earned (series) and kept in a stock per difficulty that is never capped.
const KINDS = ["undo", "hint", "shuffle", "slot"];
// Every difficulty starts with this stock.
const START_STOCK = { undo: 2, hint: 2, shuffle: 1, slot: 0 };
const WEIGHTS = { undo: 40, hint: 30, shuffle: 15, slot: 15 }; // which powerup an award is: common to rare
const SERIES = 3; // clean triples in a row that earn a chance at a powerup
const AWARD_CHANCE = 0.5;

// --- Logic (no DOM; testable with node) ---------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Tile a covers tile b when it lies on a higher layer and overlaps it.
function covers(a, b) {
  return a.z > b.z && Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
}

function isFree(tiles, tile) {
  return !tiles.some((o) => covers(o, tile));
}

// Harder levels: more tiles, more layers and more kinds of tiles. World 1 ramps up quickly (a new kind every
// 5 levels), later worlds more slowly (every 10 levels until all kinds are in).
function levelParams(level, difficulty = "medium") {
  const types = level <= 50 ? 4 + Math.floor((level - 1) / 5) : 13 + Math.floor((level - 51) / 10);
  const count = level <= 50 ? 21 + level * 1.2 : 81 + (level - 50) * 0.1;
  const d = difficultyOf(difficulty);
  return {
    count: Math.min(d.max, Math.round(Math.min(105, count) * d.tiles)),
    types: Math.min(TYPES, types),
    layers: Math.max(2, Math.min(6, 2 + Math.floor(level / 20) + d.layers)),
  };
}

// First level on which a tile kind shows up.
function tileUnlockLevel(type) {
  if (type < 4) return 1;
  return type <= 12 ? (type - 3) * 5 + 1 : (type - 12) * 10 + 51;
}

function worldOf(level) {
  return { world: Math.floor((level - 1) / WORLD_SIZE) + 1, index: (level - 1) % WORLD_SIZE + 1 };
}

// The first level of every world is always open; any other level once the one before it is cleared.
function isUnlocked(level, cleared) {
  if (!Number.isInteger(level) || level < 1 || level > LEVELS) return false;
  return (level - 1) % WORLD_SIZE === 0 || cleared.has(level - 1);
}

// The same level number always gives the same board. Types are dealt in triples while removing
// free tiles one by one, so every board can be cleared (with an unlimited tray).
function generateLevel(level, difficulty = "medium") {
  const random = mulberry32(level * 7919 + 13 + DIFFICULTIES.findIndex((x) => x.id === difficulty) * 104729);
  const { count, types, layers } = levelParams(level, difficulty);
  const { w: W, h: H } = difficultyOf(difficulty);
  const spots = [];
  for (let z = 0; z < layers; z++) {
    const o = z % 2;
    const m = Math.floor(z / 2) * 2;
    for (let x = o + m; x + 2 <= W - m; x += 2) {
      for (let y = o + m; y + 2 <= H - m; y += 2) {
        const d = Math.hypot(x + 1 - W / 2, y + 1 - H / 2) / Math.hypot(W / 2, H / 2);
        spots.push({ x, y, z, key: random() + d * 0.7 });
      }
    }
  }
  spots.sort((a, b) => a.key - b.key);
  const n = Math.max(3, Math.floor(Math.min(count, spots.length) / 3) * 3);
  const tiles = spots.slice(0, n).map((s, id) => ({ id, type: 0, x: s.x, y: s.y, z: s.z }));
  const order = shuffled(Array.from({ length: n / 3 }, (_, i) => i % types), random);
  const left = tiles.slice();
  for (const type of order) {
    for (let k = 0; k < 3; k++) {
      const free = left.filter((t) => isFree(left, t));
      const t = free[Math.floor(random() * free.length)];
      t.type = type;
      left.splice(left.indexOf(t), 1);
    }
  }
  return tiles;
}

function emptyStock() {
  return Object.fromEntries(KINDS.map((k) => [k, 0]));
}

function startStock() {
  return { ...START_STOCK };
}

// `stock` = earned powerups carried over between levels (the object is shared and updated in place).
function createState(level = 1, random = Math.random, score = 0, difficulty = "medium", stock = emptyStock()) {
  return {
    stock,
    cap: TRAY, // tray slots of this level
    streak: 0, // clean triples in a row
    picks: 0,
    level,
    difficulty,
    tiles: generateLevel(level, difficulty),
    tray: [],
    score,
    startScore: score,
    last: null,
    over: false,
    won: false,
    random,
  };
}

// Takes a free tile into the tray. Returns { tile, index, tray, matched } or null if not allowed.
// `tray` is the tray right after inserting (before a match is removed), `matched` the vanished tiles.
function pick(state, id) {
  if (state.over || state.won) return null;
  const at = state.tiles.findIndex((t) => t.id === id);
  if (at < 0 || !isFree(state.tiles, state.tiles[at])) return null;
  const tile = state.tiles[at];
  state.last = { tile, tray: state.tray.slice(), score: state.score, streak: state.streak, picks: state.picks };
  tile.pickNo = ++state.picks;
  state.tiles.splice(at, 1);
  let index = state.tray.length;
  for (let i = state.tray.length - 1; i >= 0; i--) {
    if (state.tray[i].type === tile.type) { index = i + 1; break; }
  }
  state.tray.splice(index, 0, tile);
  const tray = state.tray.slice();
  const same = state.tray.filter((t) => t.type === tile.type);
  let matched = [];
  const awards = [];
  let clean = false;
  if (same.length >= 3) {
    matched = same.slice(0, 3);
    state.tray = state.tray.filter((t) => !matched.includes(t));
    state.score += 10;
    // A clean triple: its three tiles were the last three picks, one right after the other.
    clean = matched.every((t) => state.picks - t.pickNo < 3);
    state.streak = clean ? state.streak + 1 : 0;
    if (state.streak >= SERIES) {
      state.streak = 0;
      if (state.random() < AWARD_CHANCE) awards.push(award(state));
    }
  }
  if (state.tiles.length === 0 && state.tray.length === 0) {
    state.won = true;
    state.score += 50;
  } else if (state.tray.length >= state.cap) {
    state.over = true;
  }
  return { tile, index, tray, matched, clean, awards };
}

// Weighted random powerup kind (see WEIGHTS).
function pickPowerup(random) {
  let r = random() * KINDS.reduce((sum, k) => sum + WEIGHTS[k], 0);
  for (const k of KINDS) {
    r -= WEIGHTS[k];
    if (r < 0) return k;
  }
  return KINDS[KINDS.length - 1];
}

function award(state) {
  const kind = pickPowerup(state.random);
  state.stock[kind]++;
  return kind;
}

// How many of a powerup are in the stock.
function available(state, kind) {
  return state.stock[kind] || 0;
}

function spend(state, kind) {
  state.stock[kind]--;
}

// "+1": one more tray slot for the rest of the level (once per level; can also rescue a full tray).
function addSlot(state) {
  if (state.won || state.cap > TRAY || available(state, "slot") <= 0) return false;
  state.cap++;
  state.over = state.tray.length >= state.cap;
  spend(state, "slot");
  return true;
}

// Takes back the last pick (also after a lost level). Returns false when none is left.
function undo(state) {
  if (!state.last || state.won || available(state, "undo") <= 0) return false;
  state.tiles.push(state.last.tile);
  state.tray = state.last.tray;
  state.score = state.last.score;
  state.streak = state.last.streak;
  state.picks = state.last.picks;
  state.last = null;
  state.over = state.tray.length >= state.cap;
  spend(state, "undo");
  return true;
}

// Deals the types of the remaining board tiles anew.
function shuffleBoard(state) {
  if (available(state, "shuffle") <= 0 || state.over || state.won || state.tiles.length < 2) return false;
  const types = shuffled(state.tiles.map((t) => t.type), state.random);
  state.tiles.forEach((t, i) => { t.type = types[i]; });
  spend(state, "shuffle");
  state.last = null;
  return true;
}

// Suggests a free tile: the one that completes a triple soonest (tray tiles count), else the most common type.
function bestMove(state) {
  const free = state.tiles.filter((t) => isFree(state.tiles, t));
  let best = null;
  for (const type of new Set(free.map((t) => t.type))) {
    const ofType = free.filter((t) => t.type === type);
    const need = Math.max(1, 3 - state.tray.filter((t) => t.type === type).length);
    const score = (ofType.length >= need ? 100 : 0) - need * 10 + ofType.length;
    if (!best || score > best.score) best = { score, tile: ofType[ofType.length - 1] };
  }
  return best ? best.tile : null;
}

// Uses up a hint and returns the suggested tile (null when none is left or the level is over).
function hint(state) {
  if (available(state, "hint") <= 0 || state.over || state.won) return null;
  const tile = bestMove(state);
  if (tile) spend(state, "hint");
  return tile;
}

if (typeof module !== "undefined") {
  module.exports = { createState, generateLevel, levelParams, pick, undo, addSlot, shuffleBoard, hint, startStock, START_STOCK, bestMove, available, pickPowerup, emptyStock, KINDS, WEIGHTS, SERIES, AWARD_CHANCE, tileUnlockLevel, worldOf, isUnlocked, WORLD_SIZE, WORLDS, LEVELS, WORLD_NAMES, DIFFICULTIES, difficultyOf, isFree, covers, TRAY, W, H, TYPES };
}

// --- Browser: input, rendering, loop ------------------------------------

if (typeof document !== "undefined") {
  // --- Theme: follow the kit portal (data-theme on the page), else the saved kit choice, else the system ---
  const PAL = {};
  const root = document.documentElement;
  const systemDark = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;

  function readPalette() {
    const cs = getComputedStyle(root);
    for (const k of ["board", "line", "text", "muted", "accent", "overlay", "cell-a", "cell-b", "cage", "bg", "tile", "edge", "shade", "shadow", "surface"]) PAL[k] = cs.getPropertyValue(`--${k}`).trim();
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
  let LW = 414; // logical canvas size (set per difficulty); the backing store is scaled to the displayed size
  let LH = 566;
  const U = 30; // px per board unit
  const OY = 14; // board top margin
  const OX = 12; // board side margin
  const TS = 2 * U; // tile size on the board
  const SLOT_MAX = 50; // tray slot size (smaller when "+1" adds a slot)
  let SLOT = SLOT_MAX;
  const SLOT_GAP = 6;
  let TRAY_X = 14;
  let TRAY_Y = 490;
  // The canvas fits the board of the chosen difficulty: board, then the tray centred below it.
  function layout(id) {
    const d = difficultyOf(id);
    LW = 2 * OX + d.w * U;
    TRAY_Y = OY + d.h * U + 56;
    LH = TRAY_Y + SLOT_MAX + 26;
    canvas.style.setProperty("--ar", (LW / LH).toFixed(4));
  }
  function trayLayout() {
    const n = state.cap;
    SLOT = Math.min(SLOT_MAX, (LW - 28 - SLOT_GAP * (n - 1)) / n);
    TRAY_X = (LW - (n * SLOT + (n - 1) * SLOT_GAP)) / 2;
  }
  const FLY = 170;
  const POP = 260;
  const el = (id) => document.getElementById(id);
  const levelEl = el("level");
  const scoreEl = el("score");
  const bestEl = el("best");
  const undoBtn = el("btn-undo");
  const shuffleBtn = el("btn-shuffle");
  const hintBtn = el("btn-hint");
  const slotBtn = el("btn-slot");
  const diffKey = `${GAME_ID}:difficulty`; // last chosen difficulty
  const stockKey = (d) => `${GAME_ID}:stock-${d}`; // earned powerups per difficulty (never capped)
  const clearedKey = (d) => `${GAME_ID}:cleared-${d}`; // cleared levels per difficulty
  const scoresKey = (d) => `${GAME_ID}:scores-${d}`; // best score per level per difficulty
  const helpKey = `${GAME_ID}:help`;

  function load(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
  }
  const loadCleared = (d) => new Set((load(clearedKey(d), []) || []).filter(Number.isInteger));
  const diffInfo = (d) => DIFFICULTIES.find((x) => x.id === d) || DIFFICULTIES[1];
  let difficulty = diffInfo(load(diffKey, "medium")).id;
  let cleared = loadCleared(difficulty);
  let scores = load(scoresKey(difficulty), {}) || {};
  const stock = emptyStock();
  // `stock` is shared with the running level; switching the difficulty swaps its content.
  function loadStock(d) {
    const saved = load(stockKey(d), null) || startStock(); // a difficulty without a saved stock starts with the start stock
    for (const k of KINDS) stock[k] = Math.max(0, Math.floor(Number(saved[k])) || 0);
  }
  loadStock(difficulty);
  const saveStock = () => save(stockKey(difficulty), stock);
  const LABELS = { undo: "Undo", hint: "Hint", shuffle: "Shuffle", slot: "+1" };
  let state = createState(1, undefined, 0, difficulty, stock);
  let inMenu = true;
  let menuWorld = 1;
  let toastType = null; // new tile kind announced above the board until the first move
  let paused = false;
  let fx = []; // flying / vanishing tiles: { tile, from, slot, t0, pop }
  let hintId = null; // tile highlighted by the hint
  let denied = null; // { id, t0 } tile that could not be taken

  // --- Symbols: 12 fruits drawn in unit coordinates (-1..1) ---
  function dot(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  function ell(c, x, y, rx, ry, rot, col) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.fill(); }
  function line(c, pts, col, w) {
    c.strokeStyle = col; c.lineWidth = w; c.lineCap = "round"; c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
    c.stroke();
  }
  const GLOSS = "rgba(255,255,255,0.55)";
  const SYMBOLS = [
    (c) => { // cherry
      c.strokeStyle = "#2e7d32"; c.lineWidth = 0.1; c.lineCap = "round"; c.beginPath();
      c.moveTo(-0.4, 0.3); c.quadraticCurveTo(-0.3, -0.4, 0.2, -0.8);
      c.moveTo(0.45, 0.4); c.quadraticCurveTo(0.4, -0.3, 0.2, -0.8); c.stroke();
      dot(c, -0.4, 0.4, 0.38, "#c62828"); dot(c, 0.45, 0.5, 0.38, "#e53935");
      ell(c, 0.5, -0.72, 0.36, 0.15, -0.3, "#43a047");
      dot(c, -0.52, 0.3, 0.08, GLOSS); dot(c, 0.33, 0.4, 0.08, GLOSS);
    },
    (c) => { // lemon
      ell(c, 0, 0, 0.85, 0.58, -0.5, "#fdd835");
      dot(c, 0.76, -0.41, 0.12, "#fdd835"); dot(c, -0.76, 0.41, 0.12, "#fdd835");
      ell(c, -0.15, -0.2, 0.3, 0.1, -0.5, GLOSS);
    },
    (c) => { // grapes
      line(c, [[0, -0.7], [0.1, -0.95]], "#5d4037", 0.1);
      ell(c, 0.38, -0.8, 0.32, 0.14, -0.4, "#43a047");
      for (const [x, y] of [[-0.5, -0.4], [0, -0.4], [0.5, -0.4], [-0.25, 0.05], [0.25, 0.05], [0, 0.5]]) {
        dot(c, x, y, 0.27, "#7b1fa2"); dot(c, x - 0.08, y - 0.08, 0.06, GLOSS);
      }
    },
    (c) => { // blueberries
      for (const [x, y] of [[-0.42, 0.32], [0.42, 0.32], [0, -0.3]]) {
        dot(c, x, y, 0.43, "#1e63d6"); dot(c, x, y - 0.1, 0.11, "#0d3a8a"); dot(c, x - 0.17, y - 0.17, 0.07, GLOSS);
      }
    },
    (c) => { // carrot
      c.fillStyle = "#f57c00"; c.beginPath(); c.moveTo(-0.7, -0.2); c.lineTo(-0.2, -0.7); c.lineTo(0.85, 0.85); c.closePath(); c.fill();
      line(c, [[-0.3, -0.1], [-0.1, -0.3]], "#c25e00", 0.06); line(c, [[0.1, 0.2], [0.3, 0]], "#c25e00", 0.06);
      ell(c, -0.5, -0.62, 0.42, 0.12, -0.9, "#43a047"); ell(c, -0.62, -0.4, 0.42, 0.12, -0.2, "#2e7d32");
    },
    (c) => { // watermelon
      c.fillStyle = "#e53935"; c.beginPath(); c.arc(0, -0.5, 1, 0, Math.PI); c.closePath(); c.fill();
      c.strokeStyle = "#2e7d32"; c.lineWidth = 0.16; c.beginPath(); c.arc(0, -0.5, 0.96, 0.05, Math.PI - 0.05); c.stroke();
      for (const [x, y] of [[-0.4, 0.05], [0, 0.3], [0.4, 0.05], [0, -0.15]]) ell(c, x, y, 0.06, 0.1, 0.3, "#212121");
    },
    (c) => { // strawberry
      c.fillStyle = "#e53935"; c.beginPath(); c.moveTo(0, 0.9);
      c.bezierCurveTo(-0.95, 0.4, -0.85, -0.5, 0, -0.45); c.bezierCurveTo(0.85, -0.5, 0.95, 0.4, 0, 0.9); c.fill();
      for (const [x, y] of [[-0.3, -0.1], [0.3, -0.1], [0, 0.15], [-0.25, 0.4], [0.25, 0.4], [0, 0.65]]) ell(c, x, y, 0.05, 0.08, 0, "#ffe082");
      ell(c, 0, -0.5, 0.5, 0.16, 0, "#43a047"); line(c, [[0, -0.5], [0.05, -0.85]], "#2e7d32", 0.1);
    },
    (c) => { // eggplant
      ell(c, 0, 0.12, 0.5, 0.8, -0.6, "#7b1fa2");
      ell(c, -0.12, 0.25, 0.1, 0.4, -0.6, "rgba(255,255,255,0.28)");
      ell(c, -0.5, -0.55, 0.32, 0.2, -0.6, "#2e7d32"); line(c, [[-0.55, -0.6], [-0.72, -0.92]], "#2e7d32", 0.12);
    },
    (c) => { // apple
      dot(c, -0.3, 0.1, 0.55, "#e53935"); dot(c, 0.3, 0.1, 0.55, "#e53935"); dot(c, 0, 0.3, 0.58, "#e53935");
      line(c, [[0, -0.4], [0.1, -0.85]], "#6d4c41", 0.1); ell(c, 0.4, -0.65, 0.32, 0.14, -0.4, "#43a047");
      ell(c, -0.4, -0.05, 0.1, 0.22, 0.5, GLOSS);
    },
    (c) => { // banana
      c.lineCap = "round"; c.lineWidth = 0.55; c.strokeStyle = "#f9a825"; c.beginPath(); c.arc(0, -0.35, 0.9, 0.22 * Math.PI, 0.78 * Math.PI); c.stroke();
      c.lineWidth = 0.4; c.strokeStyle = "#fdd835"; c.beginPath(); c.arc(0, -0.35, 0.9, 0.22 * Math.PI, 0.78 * Math.PI); c.stroke();
      dot(c, 0.64, 0.33, 0.1, "#6d4c41"); dot(c, -0.64, 0.33, 0.1, "#6d4c41");
    },
    (c) => { // kiwi
      dot(c, 0, 0, 0.85, "#8d6e63"); dot(c, 0, 0, 0.72, "#7cb342"); dot(c, 0, 0, 0.28, "#e8f5c8");
      for (let k = 0; k < 10; k++) ell(c, Math.cos(k * 0.628) * 0.5, Math.sin(k * 0.628) * 0.5, 0.04, 0.08, k * 0.628, "#212121");
    },
    (c) => { // orange
      dot(c, 0, 0.1, 0.8, "#fb8c00"); ell(c, -0.3, -0.15, 0.15, 0.28, 0.6, GLOSS);
      ell(c, 0.2, -0.72, 0.36, 0.15, 0.4, "#43a047");
      for (const [x, y] of [[0.3, 0.2], [0.1, 0.5], [-0.3, 0.45], [0.4, 0.55]]) dot(c, x, y, 0.04, "#e65100");
    },
    (c) => { // tomato
      dot(c, 0, 0.15, 0.8, "#e53935"); ell(c, -0.35, -0.05, 0.12, 0.28, 0.5, GLOSS);
      ell(c, 0, -0.5, 0.45, 0.14, 0, "#43a047"); ell(c, -0.22, -0.45, 0.2, 0.1, 0.6, "#43a047"); ell(c, 0.22, -0.45, 0.2, 0.1, -0.6, "#43a047");
      line(c, [[0, -0.55], [0, -0.88]], "#2e7d32", 0.1);
    },
    (c) => { // pear
      dot(c, 0, 0.4, 0.6, "#9ccc65"); dot(c, 0, -0.2, 0.4, "#9ccc65"); ell(c, 0, 0.1, 0.46, 0.45, 0, "#9ccc65");
      ell(c, -0.25, 0.35, 0.1, 0.22, 0.3, GLOSS);
      line(c, [[0, -0.55], [0.1, -0.88]], "#6d4c41", 0.1); ell(c, 0.38, -0.72, 0.3, 0.13, -0.4, "#2e7d32");
    },
    (c) => { // plum
      dot(c, 0, 0.1, 0.76, "#4a148c"); ell(c, -0.3, -0.05, 0.14, 0.3, 0.4, "rgba(255,255,255,0.35)");
      line(c, [[0, -0.6], [0.08, -0.88]], "#6d4c41", 0.1); ell(c, 0.32, -0.72, 0.3, 0.13, 0.4, "#43a047");
    },
    (c) => { // pineapple
      ell(c, 0, 0.22, 0.5, 0.68, 0, "#fbc02d");
      for (const d of [-0.5, -0.15, 0.2, 0.55]) { line(c, [[-0.3, d - 0.3], [0.3, d + 0.3]], "#e65100", 0.05); line(c, [[0.3, d - 0.3], [-0.3, d + 0.3]], "#e65100", 0.05); }
      ell(c, 0, -0.72, 0.12, 0.38, 0, "#2e7d32"); ell(c, -0.24, -0.62, 0.12, 0.33, -0.5, "#43a047"); ell(c, 0.24, -0.62, 0.12, 0.33, 0.5, "#43a047");
    },
    (c) => { // pumpkin
      ell(c, -0.4, 0.12, 0.4, 0.62, 0, "#ef6c00"); ell(c, 0.4, 0.12, 0.4, 0.62, 0, "#ef6c00"); ell(c, 0, 0.12, 0.42, 0.68, 0, "#fb8c00");
      line(c, [[-0.2, -0.45], [-0.25, 0.65]], "#c25e00", 0.05); line(c, [[0.2, -0.45], [0.25, 0.65]], "#c25e00", 0.05);
      line(c, [[0, -0.55], [0.06, -0.88]], "#558b2f", 0.2);
    },
    (c) => { // coconut
      dot(c, 0, 0, 0.82, "#6d4c41");
      line(c, [[-0.6, 0.3], [-0.3, 0.5]], "#4e342e", 0.05); line(c, [[0.55, 0.35], [0.25, 0.55]], "#4e342e", 0.05);
      dot(c, -0.22, -0.12, 0.1, "#2b1b16"); dot(c, 0.22, -0.12, 0.1, "#2b1b16"); dot(c, 0, 0.18, 0.1, "#2b1b16");
      ell(c, -0.4, -0.42, 0.18, 0.07, -0.7, "rgba(255,255,255,0.3)");
    },
  ];

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawTile(x, y, s, type, dim, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const r = s * 0.16;
    // a faint shadow on all sides (blur is in device pixels, so scale it with the canvas)
    ctx.shadowColor = PAL.shadow;
    ctx.shadowBlur = s * 0.12 * (canvas.width / LW);
    ctx.fillStyle = PAL.tile;
    roundRect(x, y, s, s, r); ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = PAL.edge;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    ctx.translate(x + s / 2, y + s / 2);
    ctx.scale(s * 0.34, s * 0.34);
    SYMBOLS[type](ctx);
    ctx.restore();
    if (dim) { ctx.fillStyle = PAL.shade; roundRect(x, y, s, s, r); ctx.fill(); }
    ctx.restore();
  }

  const slotX = (i) => TRAY_X + i * (SLOT + SLOT_GAP);

  function overlay(title, sub) {
    ctx.fillStyle = PAL.overlay;
    ctx.fillRect(0, 0, LW, LH);
    ctx.fillStyle = PAL.text;
    ctx.textAlign = "center";
    ctx.font = "30px Georgia, serif";
    ctx.fillText(title, LW / 2, LH / 2 - 10);
    ctx.fillStyle = PAL.muted;
    ctx.font = "17px Georgia, serif";
    ctx.fillText(sub, LW / 2, LH / 2 + 22);
  }

  function draw(now = performance.now()) {
    ctx.setTransform(canvas.width / LW, 0, 0, canvas.height / LH, 0, 0);
    ctx.clearRect(0, 0, LW, LH);
    trayLayout();
    const order = state.tiles.slice().sort((a, b) => a.z - b.z);
    for (const t of order) {
      let dx = 0;
      if (denied && denied.id === t.id) {
        const p = (now - denied.t0) / 260;
        if (p < 1) dx = Math.sin(p * Math.PI * 4) * 4 * (1 - p); else denied = null;
      }
      drawTile(OX + t.x * U + dx, t.y * U + OY, TS, t.type, !isFree(state.tiles, t));
      if (t.id === hintId) {
        ctx.save();
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 160);
        ctx.strokeStyle = PAL.accent;
        ctx.lineWidth = 4;
        roundRect(OX + t.x * U - 2, t.y * U + OY - 2, TS + 4, TS + 4, TS * 0.18); ctx.stroke();
        ctx.restore();
      }
    }
    // tray
    ctx.fillStyle = PAL.surface;
    roundRect(4, TRAY_Y - 8, LW - 8, SLOT_MAX + 16, 10); ctx.fill();
    for (let i = 0; i < state.cap; i++) {
      ctx.fillStyle = PAL["cell-b"];
      roundRect(slotX(i), TRAY_Y, SLOT, SLOT, 8); ctx.fill();
    }
    const flying = new Set(fx.map((f) => f.tile.id));
    state.tray.forEach((t, i) => { if (!flying.has(t.id)) drawTile(slotX(i), TRAY_Y, SLOT, t.type, false); });
    fx = fx.filter((f) => {
      const age = now - f.t0;
      if (age < FLY) {
        const p = age / FLY;
        const e = 1 - (1 - p) * (1 - p);
        const to = slotX(f.slot);
        if (f.from) drawTile(f.from.x + (to - f.from.x) * e, f.from.y + (TRAY_Y - f.from.y) * e, TS + (SLOT - TS) * e, f.tile.type, false);
        else drawTile(to, TRAY_Y, SLOT, f.tile.type, false);
        return true;
      }
      if (!f.pop) return false;
      const q = (age - FLY) / POP;
      if (q >= 1) return false;
      const s = SLOT * (1 + 0.35 * q);
      drawTile(slotX(f.slot) - (s - SLOT) / 2, TRAY_Y - (s - SLOT) / 2, s, f.tile.type, false, 1 - q);
      return true;
    });
    // hud
    levelEl.textContent = `${state.level} (${diffInfo(state.difficulty).label})`;
    scoreEl.textContent = state.score;
    bestEl.textContent = Math.max(scores[state.level] || 0, state.score);
    const left = { undo: undoBtn, hint: hintBtn, shuffle: shuffleBtn, slot: slotBtn };
    for (const k of KINDS) left[k].textContent = `${LABELS[k]} (${available(state, k)})`;
    undoBtn.disabled = !state.last || available(state, "undo") <= 0 || state.won;
    hintBtn.disabled = available(state, "hint") <= 0 || state.over || state.won;
    shuffleBtn.disabled = available(state, "shuffle") <= 0 || state.over || state.won;
    slotBtn.disabled = available(state, "slot") <= 0 || state.cap > TRAY || state.won;
    el("series").textContent = `Series ${"\u25CF".repeat(state.streak)}${"\u25CB".repeat(SERIES - state.streak)}`;
    if (state.won) {
      overlay(`Level ${state.level} cleared!`, state.level >= LEVELS ? "All levels done! Tap for the overview" : "Tap or Enter: next level");
    }
    else if (state.over) overlay("Tray full", "Tap or R: retry · U: undo");
    else if (paused) overlay("Paused", "P or tap to continue");
  }

  function saveBest() {
    if (state.score > (scores[state.level] || 0)) {
      scores[state.level] = state.score;
      save(scoresKey(difficulty), scores);
    }
  }

  function tileIcon(type) {
    const c = document.createElement("canvas");
    const size = 34;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.height = Math.round(size * dpr);
    c.className = "icon";
    c.style.width = c.style.height = `${size}px`;
    const g = c.getContext("2d");
    g.scale(c.width / 2, c.height / 2);
    g.translate(1, 1);
    g.scale(0.68, 0.68);
    SYMBOLS[type](g);
    return c;
  }

  function showToast(type) {
    toastType = type;
    const t = el("toast-text");
    t.textContent = "";
    if (type !== null) t.append("New tile: ", tileIcon(type));
  }

  // A short message above the board; the buttons of earned powerups pop.
  let sayTimer = 0;
  function say(text) {
    const t = el("toast-text");
    t.textContent = text;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { if (toastType === null) t.textContent = ""; }, 2600);
  }

  function flash(kind) {
    const b = { undo: undoBtn, hint: hintBtn, shuffle: shuffleBtn, slot: slotBtn }[kind];
    b.classList.remove("earned");
    void b.offsetWidth;
    b.classList.add("earned");
    setTimeout(() => b.classList.remove("earned"), 1500);
  }

  // --- Telemetry per level: level_start, then one level_end (won / lost / abandoned) with what happened in between ---
  let run = null;
  const levelProps = () => ({ level: state.level, difficulty: state.difficulty, world: worldOf(state.level).world });

  function startRun() {
    const p = levelParams(state.level, state.difficulty);
    run = { active: 0, picks: 0, matches: 0, clean: 0, trayPeak: 0, traySum: 0, tray4: 0, freeSum: 0, taps: 0, denied: 0, awards: 0, used: { undo: 0, hint: 0, shuffle: 0, slot: 0 }, total: state.tiles.length };
    track("level_start", { ...levelProps(), tiles: run.total, tile_types: p.types, layers: p.layers, stock_undo: stock.undo, stock_hint: stock.hint, stock_shuffle: stock.shuffle, stock_slot: stock.slot });
  }

  // The outcome is read from the state when the level is left; a lost level stays open until then, because Undo can rescue it.
  function endRun() {
    if (!run) return;
    const r = run;
    run = null;
    track("level_end", {
      ...levelProps(),
      outcome: state.won ? "won" : state.over ? "lost" : "abandoned",
      first_clear: state.won && !cleared.has(state.level),
      active_s: Math.round(r.active / 100) / 10,
      picks: r.picks,
      tiles_total: r.total,
      tiles_left: state.tiles.length,
      tray_cap: state.cap,
      tray_peak: r.trayPeak,
      tray_avg: r.picks ? Math.round((r.traySum / r.picks) * 100) / 100 : 0,
      tray_ge4_picks: r.tray4, // picks that left 4+ tiles in the tray: the tray was actually in use
      free_avg: r.picks ? Math.round((r.freeSum / r.picks) * 10) / 10 : 0,
      matches: r.matches,
      clean_triples: r.clean,
      denied_taps: r.denied,
      awards: r.awards,
      used_undo: r.used.undo,
      used_hint: r.used.hint,
      used_shuffle: r.used.shuffle,
      used_slot: r.used.slot,
    });
  }

  function usedPowerup(kind) {
    if (run) run.used[kind]++;
    track("powerup_used", { ...levelProps(), kind, tray: state.tray.length, tiles_left: state.tiles.length });
  }

  function begin(level) {
    endRun();
    state = createState(level, undefined, 0, difficulty, stock);
    fx = [];
    denied = null;
    hintId = null;
    paused = false;
    inMenu = false;
    startRun();
    layout(difficulty);
    el("menu").hidden = true;
    el("play").hidden = false;
    const types = levelParams(level, difficulty).types;
    showToast(level > 1 && types > levelParams(level - 1, difficulty).types ? types - 1 : null);
    resize();
  }

  function nextLevel() {
    if (state.level >= LEVELS) showMenu(LEVELS);
    else begin(state.level + 1);
  }

  function retry() { begin(state.level); }

  // --- Level overview: worlds of 50 levels; the first level of each world is always open ---
  function frontier() {
    for (let l = 1; l <= LEVELS; l++) if (isUnlocked(l, cleared) && !cleared.has(l)) return l;
    return LEVELS;
  }

  function buildMenu() {
    const first = (menuWorld - 1) * WORLD_SIZE + 1;
    const last = first + WORLD_SIZE - 1;
    const next = frontier();
    el("w-title").textContent = `World ${menuWorld}: ${WORLD_NAMES[menuWorld - 1]}`;
    let done = 0;
    for (let l = first; l <= last; l++) if (cleared.has(l)) done++;
    el("w-sub").textContent = `Levels ${first}-${last} · ${done}/${WORLD_SIZE} cleared`;
    el("w-prev").disabled = menuWorld <= 1;
    el("w-next").disabled = menuWorld >= WORLDS;
    const icons = el("w-tiles");
    icons.textContent = "";
    for (let t = 0; t < TYPES; t++) {
      const at = tileUnlockLevel(t);
      if (at > last) break;
      const ic = tileIcon(t);
      if (at >= first && at > 1) { ic.classList.add("new"); ic.title = `New in this world (level ${at})`; }
      icons.append(ic);
    }
    const grid = el("grid");
    grid.textContent = "";
    for (let l = first; l <= last; l++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lvl";
      b.textContent = l;
      b.disabled = !isUnlocked(l, cleared);
      if (cleared.has(l)) { b.classList.add("done"); b.setAttribute("aria-label", `Level ${l}, cleared`); }
      if (l === next) b.classList.add("next");
      b.addEventListener("click", () => begin(l));
      grid.append(b);
    }
  }

  function showMenu(level = frontier()) {
    endRun();
    inMenu = true;
    paused = false;
    menuWorld = worldOf(level).world;
    el("play").hidden = true;
    el("diff").hidden = true;
    el("menu").hidden = false;
    el("diff-name").textContent = diffInfo(difficulty).label;
    el("stock").textContent = KINDS.map((k) => `${LABELS[k]} ${stock[k]}`).join(" \u00B7 ");
    buildMenu();
  }

  // --- Difficulty: asked before the levels are shown; every difficulty keeps its own progress ---
  function chooseDifficulty(id) {
    track("difficulty_chosen", { difficulty: id, cleared: loadCleared(id).size });
    difficulty = id;
    cleared = loadCleared(id);
    scores = load(scoresKey(id), {}) || {};
    loadStock(id);
    save(diffKey, id);
    showMenu();
  }

  function showDifficulty() {
    endRun();
    inMenu = true;
    paused = false;
    el("play").hidden = true;
    el("menu").hidden = true;
    el("diff").hidden = false;
    const list = el("diff-list");
    list.textContent = "";
    for (const d of DIFFICULTIES) {
      const done = loadCleared(d.id).size;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "diffbtn";
      if (d.id === difficulty) b.classList.add("current");
      const name = document.createElement("b");
      name.textContent = d.label;
      const text = document.createElement("span");
      text.textContent = d.text;
      const prog = document.createElement("small");
      prog.textContent = done >= LEVELS ? "All worlds cleared" : `${done}/${LEVELS} levels cleared`;
      b.append(name, text, prog);
      b.addEventListener("click", () => chooseDifficulty(d.id));
      list.append(b);
    }
  }

  el("btn-diff").addEventListener("click", showDifficulty);

  el("w-prev").addEventListener("click", () => { menuWorld = Math.max(1, menuWorld - 1); buildMenu(); });
  el("w-next").addEventListener("click", () => { menuWorld = Math.min(WORLDS, menuWorld + 1); buildMenu(); });
  el("btn-levels").addEventListener("click", () => showMenu(state.level));

  function onTap(px, py) {
    if (state.won) { nextLevel(); return; }
    if (state.over) { retry(); return; }
    if (paused) { paused = false; return; }
    const hit = state.tiles.slice().sort((a, b) => b.z - a.z)
      .find((t) => px >= OX + t.x * U && px < OX + t.x * U + TS && py >= t.y * U + OY && py < t.y * U + OY + TS);
    if (!hit) return;
    hintId = null;
    if (toastType !== null) showToast(null);
    const from = { x: OX + hit.x * U, y: hit.y * U + OY };
    const free = run ? state.tiles.filter((t) => isFree(state.tiles, t)).length : 0;
    const res = pick(state, hit.id);
    if (!res) { denied = { id: hit.id, t0: performance.now() }; if (run) run.denied++; return; }
    if (run) {
      run.picks++;
      run.freeSum += free;
      run.traySum += state.tray.length;
      run.trayPeak = Math.max(run.trayPeak, res.tray.length); // right after the pick, before a match vanishes
      if (state.tray.length >= 4) run.tray4++;
      if (res.matched.length) { run.matches++; if (res.clean) run.clean++; }
      run.awards += res.awards.length;
    }
    const now = performance.now();
    const pop = res.matched.length > 0;
    fx.push({ tile: res.tile, from, slot: res.index, t0: now, pop });
    for (const m of res.matched) {
      if (m !== res.tile) fx.push({ tile: m, from: null, slot: res.tray.indexOf(m), t0: now, pop: true });
    }
    saveBest();
    for (const k of res.awards) { flash(k); say(`Series! Powerup earned: ${LABELS[k]}`); }
    if (state.won) { endRun(); cleared.add(state.level); save(clearedKey(difficulty), [...cleared]); }
    saveStock();
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    onTap((e.clientX - r.left) * LW / r.width, (e.clientY - r.top) * LH / r.height);
  });

  function doUndo() { if (!paused && undo(state)) { fx = []; hintId = null; usedPowerup("undo"); saveStock(); } }
  function doShuffle() { if (!paused && shuffleBoard(state)) { hintId = null; usedPowerup("shuffle"); saveStock(); } }
  function doSlot() { if (!paused && addSlot(state)) { usedPowerup("slot"); saveStock(); } }
  function doHint() {
    if (paused) return;
    const t = hint(state);
    if (t) { hintId = t.id; usedPowerup("hint"); saveStock(); }
  }
  function togglePause() { if (!state.over && !state.won) paused = !paused; }

  undoBtn.addEventListener("click", doUndo);
  shuffleBtn.addEventListener("click", doShuffle);
  hintBtn.addEventListener("click", doHint);
  slotBtn.addEventListener("click", doSlot);
  el("btn-pause").addEventListener("click", togglePause);
  el("btn-restart").addEventListener("click", retry);
  document.addEventListener("visibilitychange", () => { if (document.hidden && !state.over && !state.won) paused = true; });
  window.addEventListener("pagehide", endRun);

  // --- How to play: shown on the first visit, then from the button or with "?" ---
  const demo = (html) => `<p class="demo">${html}</p>`;
  const tile = (cls, ch) => `<span class="tile ${cls}">${ch}</span>`;
  const HELP = [
    {
      title: "Take tiles",
      html: `<p>Tap a <b>free tile</b> to move it into the tray below the board. A tile is free when no other tile lies on top of it; covered tiles are dimmed.</p>
        ${demo(`${tile("", "&#9679;")}${tile("dim", "&#9679;")} <small>free / covered</small>`)}
        <p>The tray holds <b>7 tiles</b>. Equal tiles are sorted next to each other.</p>`,
    },
    {
      title: "Match three",
      html: `<p>As soon as the tray holds <b>three equal tiles</b>, they vanish and give <b>10 points</b>. Clear the whole board to finish the level (+50 points).</p>
        <p>If the tray is <b>full</b> and nothing matches, the level is lost. Think ahead: take tiles whose twins are reachable.</p>
        <p>Your progress is saved in this browser.</p>`,
    },
    {
      title: "Worlds and levels",
      html: `<p>First pick a <b>difficulty</b>: it decides how densely the board is packed with tiles, not which tiles appear. Each difficulty keeps its own progress.</p>
        <p>The levels are grouped in <b>worlds of 50</b>. A level opens once you have cleared the one before it, and the <b>first level of every world is always open</b>, so you can jump ahead.</p>
        <p>Levels get harder: more tiles, more layers and <b>new kinds of tiles</b> every few levels. A new tile is announced above the board. <kbd>L</kbd> or <kbd>Esc</kbd> opens the level overview.</p>`,
    },
    {
      title: "Helpers and controls",
      html: `<p><b>Undo</b> (<kbd>U</kbd>) takes back your last tile, also after a lost level. <b>Shuffle</b> (<kbd>S</kbd>) deals the remaining board tiles anew. <b>Hint</b> (<kbd>H</kbd>) makes a good tile glow. <b>+1</b> (<kbd>+</kbd>) adds a tray slot for the rest of the level (once per level, also works when the tray is full). Every difficulty starts with 2 Undo, 2 Hint and 1 Shuffle.</p>
        <p><b>Earn more:</b> take three equal tiles <b>one right after the other</b> (a clean triple). Three clean triples in a row (Series) give a 50 % chance of a powerup. Earned powerups are kept per difficulty and have no limit.</p>
        <p><kbd>P</kbd> pauses, <kbd>R</kbd> retries the level, <kbd>?</kbd> shows this guide. Tap or click tiles with the mouse or your finger.</p>
        <p>The game pauses when you leave the page.</p>`,
    },
  ];
  let helpOpen = false;
  let helpIndex = 0;
  let pausedByHelp = false;

  function helpPage(i) {
    helpIndex = Math.min(HELP.length - 1, Math.max(0, i));
    el("help-title").textContent = HELP[helpIndex].title;
    el("help-body").innerHTML = HELP[helpIndex].html;
    el("help-dots").innerHTML = HELP.map((_, k) => (k === helpIndex ? "<b>&#9679;</b>" : "&#9675;")).join("");
    el("help-back").disabled = helpIndex === 0;
    el("help-next").textContent = helpIndex === HELP.length - 1 ? "Let's play" : "Next";
  }

  function showHelp() {
    if (helpOpen) return;
    helpOpen = true;
    pausedByHelp = !paused;
    paused = true;
    helpPage(0);
    el("help").hidden = false;
  }

  function closeHelp() {
    helpOpen = false;
    el("help").hidden = true;
    if (pausedByHelp) paused = false;
    try { localStorage.setItem(helpKey, "1"); } catch (e) { /* storage blocked */ }
  }

  function helpNext() { if (helpIndex >= HELP.length - 1) closeHelp(); else helpPage(helpIndex + 1); }

  function helpHandleKey(e, key) {
    if (key === "?") { showHelp(); e.preventDefault(); return true; }
    if (!helpOpen) return false;
    if (key === "Escape") closeHelp();
    else if (key === "ArrowRight" || key === "Enter" || key === " ") { if (e.target && e.target.tagName === "BUTTON") return true; helpNext(); }
    else if (key === "ArrowLeft") helpPage(helpIndex - 1);
    e.preventDefault();
    return true;
  }

  el("btn-help").addEventListener("click", showHelp);
  el("help-back").addEventListener("click", () => helpPage(helpIndex - 1));
  el("help-next").addEventListener("click", helpNext);
  el("help-close").addEventListener("click", closeHelp);

  document.addEventListener("keydown", (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (helpHandleKey(e, key)) return;
    if (inMenu) return;
    if (key === "l" || key === "Escape") showMenu(state.level);
    else if (key === "r") retry();
    else if (key === "p") togglePause();
    else if (key === "u") doUndo();
    else if (key === "s") doShuffle();
    else if (key === "h") doHint();
    else if (key === "+" || key === "=") doSlot();
    else if (key === "Enter" && state.won) nextLevel();
    else return;
    e.preventDefault();
  });

  // Crisp at any size: match the backing store to the displayed size and the device pixel ratio.
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  window.addEventListener("resize", resize);
  resize();

  let lastFrame = 0;
  function frame(now) {
    // Playing time without pauses, menus and finished levels (a long gap means the tab was hidden).
    if (run && lastFrame && !inMenu && !paused && !state.over && !state.won) run.active += Math.min(now - lastFrame, 1000);
    lastFrame = now;
    if (!inMenu) {
      resize();
      draw(now);
    }
    requestAnimationFrame(frame);
  }
  try { if (localStorage.getItem(helpKey) !== "1") showHelp(); } catch (e) { showHelp(); } // first visit
  showDifficulty();
  requestAnimationFrame(frame);
}
