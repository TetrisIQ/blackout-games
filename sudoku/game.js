// Sudoku: puzzles are generated on the device (no bundled puzzle list) and kept in a small pool per difficulty.
const GAME_ID = "sudoku";

// --- Logic (no DOM; testable with node) ---------------------------------

// The generator and grader are one self-contained function, so the browser can also run its source inside a
// Blob Web Worker (no extra file, works from file://). Do not reference anything outside of it.
function sudokuCore() {
  const ALL = 511; // candidates of a cell as a 9-bit mask, bit d-1 = digit d
  const POP = new Uint8Array(512);
  for (let m = 1; m < 512; m++) POP[m] = POP[m >> 1] + (m & 1);
  const bit = (d) => 1 << (d - 1);
  const digitOf = (m) => 32 - Math.clz32(m); // for a single-bit mask

  // Units 0-8 rows, 9-17 columns, 18-26 boxes.
  const UNITS = [];
  for (let r = 0; r < 9; r++) UNITS.push(Array.from({ length: 9 }, (_, k) => r * 9 + k));
  for (let c = 0; c < 9; c++) UNITS.push(Array.from({ length: 9 }, (_, k) => k * 9 + c));
  for (let b = 0; b < 9; b++) {
    UNITS.push(Array.from({ length: 9 }, (_, k) => (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3)));
  }
  const PEERS = Array.from({ length: 81 }, (_, i) => {
    const set = new Set();
    for (const u of UNITS) if (u.includes(i)) for (const c of u) if (c !== i) set.add(c);
    return [...set];
  });

  // Hardest technique a puzzle needs (rank) and how many givens it keeps, per difficulty.
  // Ranks: 1 singles, 2 locked candidates and pairs, 3 triples, X-Wing and XY-Wing, 4 swordfish, coloring and the rest,
  // 5 not solvable with these (never handed out: every puzzle can be solved by logic).
  const LEVELS = {
    easy: { clues: [40, 46], rank: [1, 1] },
    medium: { clues: [32, 36], rank: [1, 1] },
    hard: { clues: [27, 31], rank: [2, 2] },
    extreme: { clues: [22, 26], rank: [3, 4] },
  };

  function candidates(grid) {
    const cand = new Array(81).fill(0);
    for (let i = 0; i < 81; i++) {
      if (grid[i]) continue;
      let m = ALL;
      for (const p of PEERS[i]) if (grid[p]) m &= ~bit(grid[p]);
      cand[i] = m;
    }
    return cand;
  }

  const shuffled = (list, random) => {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Backtracking with the most constrained cell first. Counts solutions up to `limit`; `random` shuffles the digit order.
  function search(start, limit, random) {
    const grid = start.slice();
    let count = 0;
    let first = null;
    for (let i = 0; i < 81; i++) if (grid[i] && PEERS[i].some((p) => grid[p] === grid[i])) return { count, first }; // equal givens in a unit
    const cand = candidates(grid);
    (function rec() {
      let best = -1;
      let bestCount = 10;
      for (let i = 0; i < 81; i++) {
        if (grid[i]) continue;
        const c = POP[cand[i]];
        if (c === 0) return;
        if (c < bestCount) { bestCount = c; best = i; if (c === 1) break; }
      }
      if (best < 0) { count++; if (!first) first = grid.slice(); return; }
      let digits = [];
      for (let d = 1; d <= 9; d++) if (cand[best] & bit(d)) digits.push(d);
      if (random) digits = shuffled(digits, random);
      for (const d of digits) {
        const saved = cand.slice();
        grid[best] = d;
        cand[best] = 0;
        for (const p of PEERS[best]) cand[p] &= ~bit(d);
        rec();
        grid[best] = 0;
        for (let i = 0; i < 81; i++) cand[i] = saved[i];
        if (count >= limit) return;
      }
    })();
    return { count, first };
  }

  const parse = (s) => Array.from(s, Number);
  const countSolutions = (puzzle, limit = 2) => search(parse(puzzle), limit).count;
  const solve = (puzzle) => { const r = search(parse(puzzle), 1); return r.first ? r.first.join("") : null; };

  // Logic solver: always uses the simplest technique that makes progress and reports the hardest one it needed.
  function grade(puzzle) {
    const g = typeof puzzle === "string" ? parse(puzzle) : puzzle.slice();
    const cand = candidates(g);
    const place = (i, d) => { g[i] = d; cand[i] = 0; for (const p of PEERS[i]) cand[p] &= ~bit(d); };
    const elim = (cells, d, skip) => {
      let changed = false;
      for (const c of cells) if (!skip.includes(c) && cand[c] & bit(d)) { cand[c] &= ~bit(d); changed = true; }
      return changed;
    };
    // calls fn(list) for every combination of n items; stops at the first truthy result
    const combos = (items, n, fn, from = 0, picked = []) => {
      if (picked.length === n) return fn(picked);
      for (let i = from; i < items.length; i++) {
        picked.push(items[i]);
        const r = combos(items, n, fn, i + 1, picked);
        picked.pop();
        if (r) return r;
      }
      return false;
    };

    const nakedSingle = () => {
      for (let i = 0; i < 81; i++) if (!g[i] && POP[cand[i]] === 1) { place(i, digitOf(cand[i])); return true; }
      return false;
    };
    const hiddenSingle = () => {
      for (const u of UNITS) {
        for (let d = 1; d <= 9; d++) {
          let n = 0;
          let at = -1;
          for (const c of u) if (cand[c] & bit(d)) { n++; at = c; }
          if (n === 1) { place(at, d); return true; }
        }
      }
      return false;
    };
    const locked = () => {
      for (let b = 18; b < 27; b++) {
        for (let d = 1; d <= 9; d++) {
          const cells = UNITS[b].filter((c) => cand[c] & bit(d));
          if (cells.length < 2) continue;
          const row = Math.floor(cells[0] / 9);
          const col = cells[0] % 9;
          if (cells.every((c) => Math.floor(c / 9) === row) && elim(UNITS[row], d, cells)) return true; // pointing
          if (cells.every((c) => c % 9 === col) && elim(UNITS[9 + col], d, cells)) return true;
        }
      }
      for (let u = 0; u < 18; u++) {
        for (let d = 1; d <= 9; d++) {
          const cells = UNITS[u].filter((c) => cand[c] & bit(d));
          if (cells.length < 2) continue;
          const box = Math.floor(cells[0] / 27) * 3 + Math.floor((cells[0] % 9) / 3);
          if (cells.every((c) => Math.floor(c / 27) * 3 + Math.floor((c % 9) / 3) === box) && elim(UNITS[18 + box], d, cells)) return true; // claiming
        }
      }
      return false;
    };
    const nakedSubset = (n) => () => {
      for (const u of UNITS) {
        const open = u.filter((c) => !g[c] && POP[cand[c]] >= 2 && POP[cand[c]] <= n);
        const hit = combos(open, n, (cells) => {
          let mask = 0;
          for (const c of cells) mask |= cand[c];
          if (POP[mask] !== n) return false;
          let changed = false;
          for (let d = 1; d <= 9; d++) if (mask & bit(d) && elim(u, d, cells)) changed = true;
          return changed;
        });
        if (hit) return true;
      }
      return false;
    };
    const hiddenSubset = (n) => () => {
      for (const u of UNITS) {
        const where = []; // per digit: bit mask of the positions inside the unit
        for (let d = 1; d <= 9; d++) {
          let m = 0;
          u.forEach((c, k) => { if (cand[c] & bit(d)) m |= 1 << k; });
          where[d] = m;
        }
        const digits = [];
        for (let d = 1; d <= 9; d++) if (POP[where[d]] >= 2 && POP[where[d]] <= n) digits.push(d);
        const hit = combos(digits, n, (ds) => {
          let pos = 0;
          let keep = 0;
          for (const d of ds) { pos |= where[d]; keep |= bit(d); }
          if (POP[pos] !== n) return false;
          let changed = false;
          u.forEach((c, k) => {
            if (pos & (1 << k) && cand[c] & ~keep) { cand[c] &= keep; changed = true; }
          });
          return changed;
        });
        if (hit) return true;
      }
      return false;
    };
    // Fish (X-Wing 2, Swordfish 3, Jellyfish 4): a digit confined to n columns in n rows leaves the rest of those columns, and vice versa.
    const fish = (n) => () => {
      for (const t of [0, 1]) {
        const at = (line, k) => (t === 0 ? line * 9 + k : k * 9 + line);
        for (let d = 1; d <= 9; d++) {
          const lines = [];
          for (let l = 0; l < 9; l++) {
            let m = 0;
            for (let k = 0; k < 9; k++) if (cand[at(l, k)] & bit(d)) m |= 1 << k;
            if (POP[m] >= 2 && POP[m] <= n) lines.push({ l, m });
          }
          const hit = combos(lines, n, (set) => {
            let cover = 0;
            for (const x of set) cover |= x.m;
            if (POP[cover] !== n) return false;
            let changed = false;
            for (let l = 0; l < 9; l++) {
              if (set.some((x) => x.l === l)) continue;
              for (let k = 0; k < 9; k++) if (cover & (1 << k) && cand[at(l, k)] & bit(d)) { cand[at(l, k)] &= ~bit(d); changed = true; }
            }
            return changed;
          });
          if (hit) return true;
        }
      }
      return false;
    };
    const sees = (a, b) => PEERS[a].includes(b);
    // XY-Wing: pivot {a,b}, pincers {a,c} and {b,c} that both see it; c leaves every cell that sees both pincers.
    const xyWing = () => {
      for (let p = 0; p < 81; p++) {
        if (g[p] || POP[cand[p]] !== 2) continue;
        const pincers = PEERS[p].filter((c) => !g[c] && POP[cand[c]] === 2 && POP[cand[c] & cand[p]] === 1);
        for (let i = 0; i < pincers.length; i++) {
          for (let j = i + 1; j < pincers.length; j++) {
            const x = pincers[i];
            const y = pincers[j];
            if ((cand[x] & cand[p]) === (cand[y] & cand[p])) continue;
            const common = cand[x] & cand[y] & ~cand[p];
            if (POP[common] !== 1 || (cand[x] | cand[y] | cand[p]) !== (cand[p] | common)) continue;
            let changed = false;
            for (const c of PEERS[x]) if (c !== p && sees(c, y) && cand[c] & common) { cand[c] &= ~common; changed = true; }
            if (changed) return true;
          }
        }
      }
      return false;
    };
    // XYZ-Wing: pivot {a,b,c}, pincers {a,c} and {b,c}; c leaves every cell that sees the pivot and both pincers.
    const xyzWing = () => {
      for (let p = 0; p < 81; p++) {
        if (g[p] || POP[cand[p]] !== 3) continue;
        const pincers = PEERS[p].filter((c) => !g[c] && POP[cand[c]] === 2 && (cand[c] & ~cand[p]) === 0);
        for (let i = 0; i < pincers.length; i++) {
          for (let j = i + 1; j < pincers.length; j++) {
            const x = pincers[i];
            const y = pincers[j];
            if ((cand[x] | cand[y]) !== cand[p]) continue;
            const z = cand[x] & cand[y];
            if (POP[z] !== 1) continue;
            let changed = false;
            for (const c of PEERS[p]) if (c !== x && c !== y && sees(c, x) && sees(c, y) && cand[c] & z) { cand[c] &= ~z; changed = true; }
            if (changed) return true;
          }
        }
      }
      return false;
    };
    // Simple coloring: a digit's strong links (two cells left in a unit) form chains with alternating colors. Two cells of
    // one color that see each other, or a cell that sees both colors, settle the digit.
    const coloring = () => {
      for (let d = 1; d <= 9; d++) {
        const links = new Map();
        const link = (a, b) => { (links.get(a) || links.set(a, []).get(a)).push(b); (links.get(b) || links.set(b, []).get(b)).push(a); };
        for (const u of UNITS) {
          const cells = u.filter((c) => cand[c] & bit(d));
          if (cells.length === 2) link(cells[0], cells[1]);
        }
        const color = new Map();
        for (const start of links.keys()) {
          if (color.has(start)) continue;
          const groups = [[], []];
          const queue = [[start, 0]];
          color.set(start, 0);
          while (queue.length) {
            const [c, k] = queue.shift();
            groups[k].push(c);
            for (const n of links.get(c)) if (!color.has(n)) { color.set(n, 1 - k); queue.push([n, 1 - k]); }
          }
          for (const k of [0, 1]) { // two of one color see each other: that color is false
            const bad = groups[k].some((a, i) => groups[k].some((b, j) => j > i && sees(a, b)));
            if (bad) { for (const c of groups[k]) cand[c] &= ~bit(d); return true; }
          }
          const members = new Set([...groups[0], ...groups[1]]);
          let changed = false; // a cell that sees both colors cannot hold the digit
          for (let c = 0; c < 81; c++) {
            if (g[c] || members.has(c) || !(cand[c] & bit(d))) continue;
            if (groups[0].some((a) => sees(a, c)) && groups[1].some((a) => sees(a, c))) { cand[c] &= ~bit(d); changed = true; }
          }
          if (changed) return true;
        }
      }
      return false;
    };

    const techniques = [
      [1, nakedSingle], [1, hiddenSingle],
      [2, locked], [2, nakedSubset(2)], [2, hiddenSubset(2)],
      [3, nakedSubset(3)], [3, hiddenSubset(3)], [3, fish(2)], [3, xyWing],
      [4, xyzWing], [4, coloring], [4, fish(3)], [4, nakedSubset(4)], [4, hiddenSubset(4)], [4, fish(4)],
    ];
    let rank = 1;
    for (;;) {
      if (g.every((v) => v)) return { rank, solved: true, grid: g.join("") };
      let progressed = false;
      for (const [r, tech] of techniques) {
        if (tech()) { rank = Math.max(rank, r); progressed = true; break; }
      }
      if (!progressed) return { rank: 5, solved: false };
    }
  }

  function removeCells(solution, target, random) {
    const grid = solution.slice();
    let clues = 81;
    for (const i of shuffled([...Array(81).keys()], random)) {
      if (clues <= target) break;
      const d = grid[i];
      grid[i] = 0;
      if (search(grid, 2).count === 1) clues--; else grid[i] = d;
    }
    return grid;
  }

  // One try: a puzzle of the difficulty as an 81-character string, or null when this try missed the target.
  function attempt(difficulty, random = Math.random) {
    const cfg = LEVELS[difficulty] || LEVELS.medium;
    const target = cfg.clues[0] + Math.floor(random() * (cfg.clues[1] - cfg.clues[0] + 1));
    const solution = search(new Array(81).fill(0), 1, random).first;
    const puzzle = removeCells(solution, target, random);
    if (puzzle.filter(Boolean).length > cfg.clues[1]) return null;
    const { rank, solved } = grade(puzzle);
    return solved && rank >= cfg.rank[0] && rank <= cfg.rank[1] ? puzzle.join("") : null;
  }

  // Tries until a puzzle fits; returns null after `maxAttempts` so a caller can stay responsive (the browser loops in chunks).
  function generate(difficulty, random = Math.random, maxAttempts = Infinity) {
    for (let i = 0; i < maxAttempts; i++) {
      const p = attempt(difficulty, random);
      if (p) return p;
    }
    return null;
  }

  return { bit, LEVELS, UNITS, PEERS, search, countSolutions, solve, grade, attempt, generate };
}

const core = sudokuCore();

const DIFFICULTIES = [
  { id: "easy", label: "Easy", text: "Plenty of givens, simple logic only" },
  { id: "medium", label: "Medium", text: "Fewer givens, still simple logic" },
  { id: "hard", label: "Hard", text: "Needs pairs and locked candidates" },
  { id: "extreme", label: "Extreme", text: "Few givens, advanced techniques" },
];
const difficultyOf = (id) => DIFFICULTIES.find((x) => x.id === id) || DIFFICULTIES[1];

const bit = core.bit;

function createGame(puzzle, difficulty = "medium") {
  const solution = core.solve(puzzle);
  if (!solution) throw new Error("puzzle has no solution");
  const cells = Array.from(puzzle, Number);
  return {
    difficulty,
    puzzle,
    solution: Array.from(solution, Number),
    givens: cells.map((v) => v !== 0),
    cells,
    notes: new Array(81).fill(0), // pencil marks as 9-bit masks
    hints: 0,
    undos: 0,
    notesUsed: 0,
    history: [],
    won: false,
    autoNotes: true, // a placed digit leaves the notes of its row, column and box
  };
}

function push(s) {
  s.history.push({ cells: s.cells.slice(), notes: s.notes.slice() });
  if (s.history.length > 500) s.history.shift();
}

function checkWon(s) {
  s.won = s.cells.every((v, i) => v === s.solution[i]);
}

function clearPeerNotes(s, i, d) {
  if (s.autoNotes) for (const p of core.PEERS[i]) s.notes[p] &= ~bit(d);
}

function erase(s, i) {
  if (s.won || s.givens[i] || (s.cells[i] === 0 && s.notes[i] === 0)) return false;
  push(s);
  s.cells[i] = 0;
  s.notes[i] = 0;
  return true;
}

// Placing the digit that is already there erases it. Any digit can be placed; only duplicates in a unit are flagged.
function setValue(s, i, d) {
  if (s.won || s.givens[i]) return false;
  if (s.cells[i] === d) return erase(s, i);
  push(s);
  s.cells[i] = d;
  s.notes[i] = 0;
  clearPeerNotes(s, i, d);
  checkWon(s);
  return true;
}

function toggleNote(s, i, d) {
  if (s.won || s.givens[i] || s.cells[i] !== 0) return false;
  push(s);
  s.notes[i] ^= bit(d);
  s.notesUsed++;
  return true;
}

function undo(s) {
  if (s.won || !s.history.length) return false;
  const h = s.history.pop();
  s.cells = h.cells;
  s.notes = h.notes;
  s.undos++;
  return true;
}

// Fills the selected cell when it is empty or wrong, otherwise a random such cell. Returns its index or -1.
function hint(s, selected = -1, random = Math.random) {
  if (s.won) return -1;
  const open = [];
  for (let i = 0; i < 81; i++) if (s.cells[i] !== s.solution[i]) open.push(i);
  if (!open.length) return -1;
  const target = open.includes(selected) ? selected : open[Math.floor(random() * open.length)];
  push(s);
  s.cells[target] = s.solution[target];
  s.notes[target] = 0;
  clearPeerNotes(s, target, s.solution[target]);
  s.hints++;
  checkWon(s);
  return target;
}

// Cells whose digit also stands in their row, column or box.
function conflicts(s) {
  const bad = new Array(81).fill(false);
  for (let i = 0; i < 81; i++) {
    if (!s.cells[i]) continue;
    if (core.PEERS[i].some((p) => s.cells[p] === s.cells[i])) bad[i] = true;
  }
  return bad;
}

// How many of a digit are still missing (every placed digit counts, right or wrong, so the pad gives nothing away).
function remaining(s, d) {
  let n = 0;
  for (let i = 0; i < 81; i++) if (s.cells[i] === d) n++;
  return Math.max(0, 9 - n);
}

const filledCount = (s) => s.cells.filter(Boolean).length;

function serialize(s) {
  const { difficulty, puzzle, cells, notes, hints, undos, notesUsed, autoNotes } = s;
  return { difficulty, puzzle, cells, notes, hints, undos, notesUsed, autoNotes };
}

function restore(data) {
  if (!data || typeof data.puzzle !== "string" || data.puzzle.length !== 81 || !Array.isArray(data.cells) || data.cells.length !== 81) return null;
  try {
    const s = createGame(data.puzzle, data.difficulty);
    s.cells = data.cells.map((v, i) => (s.givens[i] ? s.cells[i] : Math.min(9, Math.max(0, v | 0))));
    if (Array.isArray(data.notes) && data.notes.length === 81) s.notes = data.notes.map((v) => v & 511);
    for (const k of ["hints", "undos", "notesUsed"]) s[k] = Number(data[k]) || 0;
    s.autoNotes = data.autoNotes !== false;
    checkWon(s);
    return s;
  } catch (e) {
    return null;
  }
}

const formatTime = (ms) => {
  const t = Math.floor(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

if (typeof module !== "undefined") {
  module.exports = { sudokuCore, core, DIFFICULTIES, difficultyOf, createGame, setValue, toggleNote, erase, undo, hint, conflicts, remaining, filledCount, serialize, restore, formatTime };
}

// --- Browser: input, rendering ------------------------------------------

if (typeof document !== "undefined") {
  // --- Theme: follow the kit portal (data-theme on the page), else the saved kit choice, else the system ---
  const root = document.documentElement;
  const systemDark = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;

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
  if (systemDark && systemDark.addEventListener) systemDark.addEventListener("change", autoTheme);

  // --- Telemetry: opt-in through the game library (it sets kit-games:consent and uploads the queue); without it nothing is stored ---
  function track(event, props) {
    try {
      if (localStorage.getItem("kit-games:consent") !== "granted") return;
      const queue = JSON.parse(localStorage.getItem("kit-games:events") || "[]");
      queue.push({ event, properties: { game: GAME_ID, ...props }, timestamp: new Date().toISOString() });
      localStorage.setItem("kit-games:events", JSON.stringify(queue.slice(-500)));
    } catch (e) { /* storage blocked */ }
  }

  const el = (id) => document.getElementById(id);
  const diffKey = `${GAME_ID}:difficulty`; // last chosen difficulty
  const currentKey = `${GAME_ID}:current`; // the puzzle in progress
  const statsKey = (d) => `${GAME_ID}:stats-${d}`; // played, won, times per difficulty
  const poolKey = (d) => `${GAME_ID}:pool-${d}`; // generated puzzles that are ready to play
  const seenKey = (d) => `${GAME_ID}:seen-${d}`; // recently played puzzles, never served again
  const helpKey = `${GAME_ID}:help`;

  function load(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
  }
  function drop(key) {
    try { localStorage.removeItem(key); } catch (e) { /* storage blocked */ }
  }

  const loadStats = (d) => ({ played: 0, won: 0, best: 0, total: 0, streak: 0, bestStreak: 0, ...(load(statsKey(d), {}) || {}) });

  // --- Puzzle supply: a pool per difficulty, filled in the background by a worker (or in small slices without one) ---
  const POOL_TARGET = 4;
  const SEEN_KEEP = 100;
  let difficulty = difficultyOf(load(diffKey, "medium")).id;
  let wanted = null; // { diff, cb }: a puzzle the player is waiting for
  let busy = null; // the generation job in flight: { diff, done }
  let worker = null;
  let workerOk = typeof Worker !== "undefined" && typeof Blob !== "undefined" && typeof URL !== "undefined" && !!URL.createObjectURL;

  const poolOf = (d) => (load(poolKey(d), []) || []).filter((p) => typeof p === "string" && p.length === 81);
  const known = (d, p) => poolOf(d).includes(p) || (load(seenKey(d), []) || []).includes(p);
  function markSeen(d, p) { save(seenKey(d), [...(load(seenKey(d), []) || []), p].slice(-SEEN_KEEP)); }

  function nextToFill() {
    const size = {};
    const count = (d) => (size[d] = d in size ? size[d] : poolOf(d).length);
    if (wanted && !count(wanted.diff)) return wanted.diff;
    return [difficulty, ...DIFFICULTIES.map((x) => x.id)].find((d) => count(d) < POOL_TARGET) || null;
  }

  function startWorker() {
    const src = `const core=(${sudokuCore.toString()})();onmessage=function(e){postMessage({puzzle:core.generate(e.data.diff,Math.random,300)})};`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    w.onmessage = (e) => { // null: no fit within the chunk, ask again (keeps the job short and the supply responsive)
      const job = busy;
      busy = null;
      if (job) { if (e.data.puzzle) job.done(e.data.puzzle); else runJob(job.diff, job.done); }
    };
    w.onerror = () => { // blocked or broken: continue on the main thread
      workerOk = false;
      w.terminate();
      worker = null;
      const job = busy;
      busy = null;
      if (job) runJob(job.diff, job.done);
    };
    return w;
  }

  function runJob(d, done) {
    busy = { diff: d, done };
    if (workerOk) {
      try {
        worker = worker || startWorker();
        worker.postMessage({ diff: d });
        return;
      } catch (e) { workerOk = false; worker = null; }
    }
    const tick = () => {
      const end = performance.now() + 30;
      while (performance.now() < end) {
        const p = core.attempt(d, Math.random);
        if (p) { busy = null; done(p); return; }
      }
      setTimeout(tick, 0);
    };
    tick();
  }

  function pump() {
    if (busy) return;
    const d = nextToFill();
    if (!d) return;
    runJob(d, (p) => {
      if (!known(d, p)) {
        if (wanted && wanted.diff === d) { const w = wanted; wanted = null; markSeen(d, p); w.cb(p, "live"); }
        else save(poolKey(d), [...poolOf(d), p]);
      }
      pump();
    });
  }

  function takePuzzle(d, cb) {
    const pool = poolOf(d);
    if (pool.length) {
      const p = pool.shift();
      save(poolKey(d), pool);
      markSeen(d, p);
      cb(p, "pool");
      pump();
      return;
    }
    wanted = { diff: d, cb };
    el("wait").hidden = false;
    pump();
  }

  function cancelWait() {
    wanted = null;
    el("play").classList.remove("waiting");
    el("wait").hidden = true;
  }

  // --- Game state ---
  let state = null;
  let run = null; // telemetry and timing of the puzzle in play
  let selected = -1;
  let notesMode = false;
  let paused = false;
  let inMenu = true;
  let helpOpen = false;
  let lastTick = 0;

  const levelsKey = (d) => `${GAME_ID}:levels-${d}`; // solved levels: [{ p: puzzle, t: best time in ms }], level number = index + 1
  const nextKey = (d) => `${GAME_ID}:next-${d}`; // the puzzle of the one next level, so it stays the same until it is solved
  const levelsOf = (d) => (load(levelsKey(d), []) || []).filter((l) => l && typeof l.p === "string" && l.p.length === 81);

  function persist() {
    if (state && run && !state.won) save(currentKey, { state: serialize(state), active: run.active, level: run.level, replay: run.replay, source: run.source, sentLeave: !!run.sentLeave });
  }

  const props = () => ({ difficulty: state.difficulty, clues: state.givens.filter(Boolean).length });

  // --- Telemetry per level: level_start, then one level_end (won / abandoned) ---
  function endProps(outcome) {
    return {
      ...props(),
      outcome,
      level: run.level,
      replay: run.replay,
      active_s: Math.round(run.active / 100) / 10,
      hints: state.hints,
      undos: state.undos,
      notes_used: state.notesUsed,
      filled_pct: Math.round(((filledCount(state) - props().clues) / (81 - props().clues)) * 100),
    };
  }

  // Giving up a level (starting another one) counts as abandoned; for a new level it also ends the streak.
  function abandonRun() {
    if (!run || !state || state.won) return;
    if (!run.sentLeave) track("level_end", endProps("abandoned")); // closing the page already sent it
    if (!run.replay) {
      const st = loadStats(state.difficulty);
      st.streak = 0;
      save(statsKey(state.difficulty), st);
    }
    run = null;
    drop(currentKey);
  }

  // A new level joins the solved list; a replay only improves the best time of its level.
  function winRun() {
    const d = state.difficulty;
    const time = Math.round(run.active);
    const levels = levelsOf(d);
    const known = run.replay ? levels[run.level - 1] : null; // the list can have changed meanwhile (cleared, other tab)
    let record;
    let best;
    if (known) {
      record = !known.t || time < known.t;
      if (record) { known.t = time; save(levelsKey(d), levels); }
      best = known.t;
    } else {
      levels.push({ p: state.puzzle, t: time });
      save(levelsKey(d), levels);
      drop(nextKey(d));
      record = true;
      best = time;
    }
    const st = loadStats(d);
    if (!known) {
      st.won++;
      st.streak++;
      st.bestStreak = Math.max(st.bestStreak, st.streak);
      st.total += time;
      if (!st.best || time < st.best) st.best = time;
      save(statsKey(d), st);
    }
    track("level_end", { ...endProps("won"), after_leave: !!run.sentLeave });
    drop(currentKey);
    return { st, record, best };
  }

  // --- Rendering ---
  const boardEl = el("board");
  const cellEls = [];
  for (let i = 0; i < 81; i++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cell";
    b.innerHTML = '<span class="v"></span><span class="n">' + "<i></i>".repeat(9) + "</span>";
    b.addEventListener("click", () => { if (!paused) { selected = i; render(); } });
    boardEl.append(b);
    cellEls.push(b);
  }
  const LONG_PRESS_MS = 450;
  const DOUBLE_TAP_MS = 350;
  let longFired = false;
  let lastTap = null; // the previous pad tap: digit, selected cell and the state before it
  const padEl = el("pad");
  const padBtns = [];
  for (let d = 1; d <= 9; d++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "digit";
    b.innerHTML = `<b>${d}</b><small></small>`;
    // Tap or click: the digit (or a note while Notes is on). Long press or double click: the other one, so a note
    // can be taken without switching the mode.
    let press = null;
    b.addEventListener("pointerdown", () => {
      clearTimeout(press);
      longFired = false;
      press = setTimeout(() => { press = null; longFired = true; enter(d, !notesMode, !notesMode); }, LONG_PRESS_MS);
    });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => { clearTimeout(press); press = null; });
    b.addEventListener("click", () => {
      if (longFired) { longFired = false; return; }
      const now = performance.now();
      if (state && lastTap && lastTap.d === d && lastTap.sel === selected && now - lastTap.t < DOUBLE_TAP_MS && lastTap.snap) {
        state.cells = lastTap.snap.cells;
        state.notes = lastTap.snap.notes;
        state.history = lastTap.snap.history; // the first tap of the pair never happened
        state.notesUsed = lastTap.snap.notesUsed;
        lastTap = null;
        persist();
        render();
        enter(d, !notesMode, !notesMode);
        return;
      }
      lastTap = state ? { d, sel: selected, t: now, snap: { cells: state.cells.slice(), notes: state.notes.slice(), history: state.history.slice(), notesUsed: state.notesUsed } } : null;
      enter(d, notesMode);
    });
    b.addEventListener("contextmenu", (e) => e.preventDefault());
    padEl.append(b);
    padBtns.push(b);
  }

  function render() {
    if (!state) return;
    const bad = conflicts(state);
    const sel = selected;
    const selDigit = sel >= 0 ? state.cells[sel] : 0;
    for (let i = 0; i < 81; i++) {
      const c = cellEls[i];
      const v = state.cells[i];
      c.querySelector(".v").textContent = v || "";
      const marks = c.querySelectorAll(".n i");
      for (let d = 1; d <= 9; d++) marks[d - 1].textContent = !v && state.notes[i] & bit(d) ? d : "";
      c.classList.toggle("given", state.givens[i]);
      c.classList.toggle("sel", i === sel);
      c.classList.toggle("peer", sel >= 0 && i !== sel && core.PEERS[sel].includes(i));
      c.classList.toggle("same", !!selDigit && i !== sel && v === selDigit);
      c.classList.toggle("bad", !state.givens[i] && !!v && bad[i]);
      c.setAttribute("aria-label", `Row ${Math.floor(i / 9) + 1}, column ${(i % 9) + 1}, ${v ? `digit ${v}${state.givens[i] ? ", given" : ""}` : state.notes[i] ? "notes" : "empty"}`);
    }
    for (let d = 1; d <= 9; d++) {
      const left = remaining(state, d);
      padBtns[d - 1].disabled = left === 0 || state.won;
      padBtns[d - 1].querySelector("small").textContent = left;
    }
    padEl.classList.toggle("notes", notesMode);
    el("btn-notes").setAttribute("aria-pressed", String(notesMode));
    el("btn-notes").textContent = notesMode ? "Notes: on" : "Notes: off";
    el("btn-undo").disabled = !state.history.length || state.won;
    for (const id of ["btn-hint", "btn-erase", "btn-notes"]) el(id).disabled = state.won;
    el("level").textContent = run ? run.level : levelsOf(state.difficulty).length;
    el("diff-name").textContent = difficultyOf(state.difficulty).label;
    boardEl.classList.toggle("paused", paused);
    el("btn-pause").textContent = paused ? "Resume" : "Pause";
    el("time").textContent = formatTime(run ? run.active : 0);
  }

  function after() {
    persist();
    render();
    if (state.won && run) finishPuzzle();
  }

  // `noteOnly` (a gesture): never replaces a digit that stands in the cell
  function enter(d, asNote, noteOnly = false) {
    if (!state || paused || state.won || selected < 0) return;
    if (noteOnly && asNote && (state.cells[selected] !== 0 || state.givens[selected])) return;
    if (state.cells[selected] === 0 && state.givens[selected] === false && asNote) toggleNote(state, selected, d);
    else setValue(state, selected, d);
    after();
  }

  function doErase() { if (state && !paused && selected >= 0 && erase(state, selected)) after(); }
  function doUndo() { if (state && !paused && undo(state)) after(); }
  function doHint() {
    if (!state || paused || state.won) return;
    const t = hint(state, selected);
    if (t < 0) return;
    selected = t;
    track("powerup_used", { ...props(), kind: "hint", filled: filledCount(state) });
    after();
  }
  function toggleNotes() { notesMode = !notesMode; render(); }
  function togglePause() { if (state && !state.won && !inMenu) { paused = !paused; render(); } }

  el("btn-notes").addEventListener("click", toggleNotes);
  el("btn-undo").addEventListener("click", doUndo);
  el("btn-erase").addEventListener("click", doErase);
  el("btn-hint").addEventListener("click", doHint);
  el("btn-pause").addEventListener("click", togglePause);
  boardEl.addEventListener("click", () => { if (paused) togglePause(); });

  // --- Screens: difficulty -> level overview (solved levels and the one next level) -> play ---
  function show(which) {
    inMenu = which !== "play";
    el("diff").hidden = which !== "diff";
    el("menu").hidden = which !== "menu";
    el("play").hidden = which !== "play";
  }

  function beginPuzzle(puzzle, d, source, level, replay) {
    if (!replay) {
      const st = loadStats(d);
      st.played++;
      save(statsKey(d), st);
    }
    state = createGame(puzzle, d);
    run = { active: 0, level, replay, source };
    lastTap = null;
    el("play").classList.remove("waiting");
    selected = -1;
    paused = false;
    el("win").hidden = true;
    el("wait").hidden = true;
    track("level_start", { ...props(), level, replay, source });
    persist();
    show("play");
    render();
  }

  // Is this exact level the one in progress?
  const inProgress = (d, level) => !!(state && run && !state.won && state.difficulty === d && run.level === level);

  function confirmLeave(d, level) {
    if (!state || state.won || !run || inProgress(d, level)) return true;
    if (filledCount(state) - props().clues < 3) return true;
    try { return window.confirm("Leave the level in progress? Its progress is lost."); } catch (e) { return true; }
  }

  // Starts or continues a level: a solved one is replayed, the next one is made (or taken from the pool) once and then kept.
  function startLevel(d, level) {
    if (!confirmLeave(d, level)) return;
    cancelWait();
    difficulty = d;
    save(diffKey, d);
    if (inProgress(d, level)) { show("play"); render(); return; }
    abandonRun();
    const levels = levelsOf(d);
    if (level <= levels.length) { beginPuzzle(levels[level - 1].p, d, "replay", level, true); return; }
    const kept = load(nextKey(d), null);
    if (typeof kept === "string" && kept.length === 81) { beginPuzzle(kept, d, "kept", level, false); return; }
    show("play");
    state = null;
    paused = false;
    lastTap = null;
    el("play").classList.add("waiting");
    boardEl.classList.add("loading");
    takePuzzle(d, (p, source) => {
      boardEl.classList.remove("loading");
      el("play").classList.remove("waiting");
      save(nextKey(d), p);
      beginPuzzle(p, d, source, level, false);
    });
  }

  function resume(data) {
    const s = restore(data && data.state);
    if (!s || s.won) return false;
    state = s;
    difficulty = s.difficulty;
    const levels = levelsOf(s.difficulty);
    const replay = !!data.replay && Number(data.level) <= levels.length;
    run = { active: Number(data.active) || 0, level: replay ? Number(data.level) : levels.length + 1, replay, source: data.source || "pool", sentLeave: !!data.sentLeave };
    show("play");
    render();
    return true;
  }

  function finishPuzzle() {
    const { st, record, best } = winRun();
    el("win-title").textContent = run.replay ? (record ? "New best time!" : "Solved again!") : `Level ${run.level} solved!`;
    el("win-stats").innerHTML = "";
    const rows = [
      ["Time", formatTime(run.active)],
      ["Hints", state.hints],
      ["Best time", formatTime(best)],
    ];
    if (!run.replay) rows.push(["Solved in a row", st.streak]);
    for (const [k, v] of rows) {
      const li = document.createElement("li");
      li.innerHTML = `<span>${k}</span><b>${v}</b>`;
      el("win-stats").append(li);
    }
    el("win").hidden = false;
    run = null;
    el("btn-next").focus();
  }

  function showOverview(d = difficulty) {
    cancelWait();
    boardEl.classList.remove("loading");
    persist(); // a level in progress is kept; it continues from here
    difficulty = d;
    save(diffKey, d);
    show("menu");
    el("win").hidden = true;
    const levels = levelsOf(d);
    const next = levels.length + 1;
    el("menu-diff").textContent = difficultyOf(d).label;
    el("menu-sub").textContent = levels.length ? `${levels.length} level${levels.length === 1 ? "" : "s"} solved` : "No level solved yet";
    const play = el("btn-play");
    play.textContent = inProgress(d, next) ? `Continue level ${next}` : `Play level ${next}`;
    play.onclick = () => startLevel(d, next);
    const grid = el("grid");
    grid.textContent = "";
    el("grid-title").hidden = !levels.length;
    levels.forEach((l, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lvl done";
      b.textContent = i + 1;
      b.title = l.t ? `Best ${formatTime(l.t)}` : "";
      b.setAttribute("aria-label", `Level ${i + 1}, solved${l.t ? `, best ${formatTime(l.t)}` : ""}`);
      b.addEventListener("click", () => startLevel(d, i + 1));
      grid.append(b);
    });
  }

  function showDifficulty() {
    cancelWait();
    boardEl.classList.remove("loading");
    persist();
    show("diff");
    const list = el("diff-list");
    list.textContent = "";
    for (const d of DIFFICULTIES) {
      const solved = levelsOf(d.id).length;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "diffbtn";
      if (d.id === difficulty) b.classList.add("current");
      const name = document.createElement("b");
      name.textContent = d.label;
      const text = document.createElement("span");
      text.textContent = d.text;
      const prog = document.createElement("small");
      const best = loadStats(d.id).best;
      prog.textContent = solved ? `${solved} level${solved === 1 ? "" : "s"} solved${best ? ` · best ${formatTime(best)}` : ""}` : "Not played yet";
      b.append(name, text, prog);
      b.addEventListener("click", () => {
        track("difficulty_chosen", { difficulty: d.id, solved });
        showOverview(d.id);
      });
      list.append(b);
    }
    el("win").hidden = true;
  }

  el("btn-levels").addEventListener("click", () => showOverview(state ? state.difficulty : difficulty));
  el("btn-menu-diff").addEventListener("click", showDifficulty);
  el("btn-next").addEventListener("click", () => startLevel(state.difficulty, levelsOf(state.difficulty).length + 1));
  el("btn-change").addEventListener("click", () => showOverview(state ? state.difficulty : difficulty));
  el("btn-cancel").addEventListener("click", () => showOverview(difficulty));


  // --- Time: only counts while the puzzle is visible and playable ---
  setInterval(() => {
    const now = performance.now();
    if (run && state && !state.won && !inMenu && !paused && !helpOpen && !document.hidden && lastTick) {
      run.active += Math.min(now - lastTick, 1000);
      el("time").textContent = formatTime(run.active);
    }
    lastTick = now;
  }, 250);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (state && !state.won && !inMenu && !paused) { paused = true; render(); }
      persist();
    }
  });
  window.addEventListener("pagehide", () => {
    persist();
    if (run && state && !state.won && !run.sentLeave) { run.sentLeave = true; track("level_end", endProps("abandoned")); persist(); } // the level stays saved and can be resumed
  });

  // --- How to play: shown on the first visit, then from the button or with "?" ---
  const cellDemo = (cls, ch) => `<span class="dcell ${cls}">${ch}</span>`;
  const HELP = [
    {
      title: "Fill the grid",
      html: `<p>Put the digits <b>1 to 9</b> into the grid so that every <b>row</b>, every <b>column</b> and every <b>3&times;3 box</b> holds each digit exactly once.</p>
        <p>Select a cell, then tap a digit below the grid (or press <kbd>1</kbd>-<kbd>9</kbd>). Tap the same digit again to remove it.</p>
        <p>Only a digit that stands twice in a row, column or box turns red. A digit that fits for now but is not the right one is not marked, so check your logic. Every puzzle has exactly one solution and can be solved without guessing.</p>`,
    },
    {
      title: "Notes",
      html: `<p>Not sure yet? Switch <b>Notes</b> on (<kbd>N</kbd>) and the digits you enter become small <b>pencil marks</b> in the cell. Quicker: <b>double-tap or long-press</b> a digit to take a note without switching the mode (on the keyboard: hold <kbd>Shift</kbd> while typing a digit).</p>
        <p class="demo">${cellDemo("", "<span class='dn'>1&nbsp;&nbsp;3<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<br>7&nbsp;&nbsp;9</span>")}${cellDemo("user", "5")}</p>
        <p>When you place a digit, it is removed from the notes of its row, column and box by itself.</p>`,
    },
    {
      title: "Difficulty and puzzles",
      html: `<p>Pick <b>Easy, Medium, Hard or Extreme</b>. Harder puzzles give fewer digits and need smarter techniques (pairs, locked candidates, X-Wing).</p>
        <p>Levels are made on your device, so there is no end to them. Solved levels stay in the level overview and can be played again; there is always exactly one next level. Everything works offline.</p>
        <p>Your level is saved when you leave, and you pick up where you stopped.</p>`,
    },
    {
      title: "Helpers and controls",
      html: `<p><b>Undo</b> (<kbd>U</kbd>) takes back a move. <b>Erase</b> (<kbd>Backspace</kbd>) clears a cell. <b>Hint</b> (<kbd>H</kbd>) fills in a correct digit for the selected cell, or for a random one.</p>
        <p>Arrow keys or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move the selection, <kbd>P</kbd> pauses (the grid is hidden), <kbd>?</kbd> shows this guide.</p>
        <p>The game pauses when you leave the page.</p>`,
    },
  ];
  let helpIndex = 0;

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
    helpPage(0);
    el("help").hidden = false;
  }

  function closeHelp() {
    helpOpen = false;
    el("help").hidden = true;
    try { localStorage.setItem(helpKey, "1"); } catch (e) { /* storage blocked */ }
  }

  function helpNext() { if (helpIndex >= HELP.length - 1) closeHelp(); else helpPage(helpIndex + 1); }

  el("btn-help").addEventListener("click", showHelp);
  el("help-back").addEventListener("click", () => helpPage(helpIndex - 1));
  el("help-next").addEventListener("click", helpNext);
  el("help-close").addEventListener("click", closeHelp);

  // --- Keyboard ---
  const ARROWS = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1, w: -9, s: 9, a: -1, d: 1 };

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === "?") { showHelp(); e.preventDefault(); return; }
    if (helpOpen) {
      if (key === "Escape") closeHelp();
      else if (key === "ArrowRight" || key === "Enter") { if (e.target && e.target.tagName === "BUTTON") return; helpNext(); }
      else if (key === "ArrowLeft") helpPage(helpIndex - 1);
      else return;
      e.preventDefault();
      return;
    }
    if (inMenu || !state) return;
    if (state.won) { if (key === "Enter" && !el("win").hidden) { startLevel(state.difficulty, levelsOf(state.difficulty).length + 1); e.preventDefault(); } return; }
    const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit) { enter(Number(digit[2]), notesMode !== e.shiftKey); e.preventDefault(); return; }
    if (key in ARROWS && !paused) {
      const step = ARROWS[key];
      if (selected < 0) selected = 40;
      else if (Math.abs(step) === 1 && Math.floor((selected + step) / 9) !== Math.floor(selected / 9)) { /* edge of the row */ }
      else if (selected + step >= 0 && selected + step < 81) selected += step;
      render();
    } else if (key === "Backspace" || key === "Delete" || key === "0") doErase();
    else if (key === "n") toggleNotes();
    else if (key === "u") doUndo();
    else if (key === "h") doHint();
    else if (key === "p") togglePause();
    else if (key === "Escape") { selected = -1; render(); }
    else return;
    e.preventDefault();
  });

  // --- Start: resume the puzzle in progress, otherwise ask for a difficulty ---
  try { if (localStorage.getItem(helpKey) !== "1") showHelp(); } catch (e) { showHelp(); } // first visit
  const saved = load(currentKey, null);
  if (!(saved && resume(saved))) showDifficulty();
  pump();
}
