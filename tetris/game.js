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

function nextType(state) {
  if (state.bag.length === 0) state.bag = shuffle(TYPES, state.random);
  return state.bag.pop();
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

function createState(random = Math.random) {
  const state = {
    board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    piece: null,
    next: null,
    bag: [],
    score: 0,
    lines: 0,
    level: 1,
    over: false,
    random,
  };
  state.next = nextType(state);
  spawn(state);
  return state;
}

function spawn(state) {
  const type = state.next;
  state.next = nextType(state);
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

function clearLines(board) {
  const kept = board.filter((row) => row.some((c) => !c));
  const cleared = ROWS - kept.length;
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

if (typeof module !== "undefined") {
  module.exports = {
    COLS, ROWS, SHAPES, createState, move, rotate, rotateShape, tick, softDrop,
    hardDrop, ghostY, clearLines, collides, dropInterval,
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

  const CELL = 30;
  const COLORS = {
    I: "#00bcd4", O: "#f1c40f", T: "#9b59b6", S: "#2ecc71",
    Z: "#e74c3c", J: "#3f51b5", L: "#ff9800",
  };
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const nextCtx = document.getElementById("next").getContext("2d");
  const els = {
    score: document.getElementById("score"),
    lines: document.getElementById("lines"),
    level: document.getElementById("level"),
    best: document.getElementById("best"),
  };
  const bestKey = `${GAME_ID}:best`;

  let state = createState();
  let paused = false;

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
      title: "Controls",
      html: `<p><b>Keyboard:</b> <kbd>&larr;</kbd> <kbd>&rarr;</kbd> move, <kbd>&uarr;</kbd> rotate, <kbd>&darr;</kbd> soft drop, <kbd>Space</kbd> hard drop, <kbd>P</kbd> pause, <kbd>R</kbd> restart, <kbd>?</kbd> this guide.</p>
        <p><b>Touch:</b> use the buttons below the board (hold &larr; &rarr; &darr; to repeat). Tap the board after a game over to start again.</p>
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
  let acc = 0;
  let last = performance.now();
  els.best.textContent = best;

  function cell(c, type, x, y, alpha = 1) {
    c.globalAlpha = alpha;
    c.fillStyle = COLORS[type];
    c.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
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

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = PAL.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < 10; x++) { ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, canvas.height); }
    for (let y = 1; y < 20; y++) { ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(canvas.width, y * CELL + 0.5); }
    ctx.stroke();
    state.board.forEach((row, y) => row.forEach((t, x) => t && cell(ctx, t, x, y)));
    if (!state.over) {
      const p = state.piece;
      shapeCells(ctx, p.shape, p.type, p.x, ghostY(state), 0.3);
      shapeCells(ctx, p.shape, p.type, p.x, p.y, 1);
    }
    nextCtx.clearRect(0, 0, 120, 120);
    const ns = SHAPES[state.next];
    const off = (4 - ns.length) / 2;
    shapeCells(nextCtx, ns, state.next, off, off, 1);
    els.score.textContent = state.score;
    els.lines.textContent = state.lines;
    els.level.textContent = state.level;
    if (state.over) overlay("Game over (R / tap)");
    else if (paused) overlay("Paused (P / tap)");
  }

  function saveBest() {
    if (state.score > best) {
      best = state.score;
      localStorage.setItem(bestKey, best);
      els.best.textContent = best;
    }
  }

  function restart() {
    saveBest();
    state = createState();
    paused = false;
    acc = 0;
  }

  function togglePause() {
    if (!state.over) paused = !paused;
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
    if (key === "r") restart();
    else if (key === "p" && !state.over) paused = !paused;
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

  // Touch: on-screen buttons (move and soft drop repeat while held), tap the board to resume / restart.
  let hold = null;
  function stopHold() {
    if (hold) { clearTimeout(hold.first); clearInterval(hold.timer); hold = null; }
  }
  for (const b of document.querySelectorAll("[data-act]")) {
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (paused || state.over) return;
      const act = actions[b.dataset.act];
      act();
      saveBest();
      stopHold();
      if (b.hasAttribute("data-repeat")) {
        hold = { first: setTimeout(() => { hold.timer = setInterval(() => { if (!paused && !state.over) act(); }, 70); }, 220) };
      }
    });
  }
  window.addEventListener("pointerup", stopHold);
  window.addEventListener("pointercancel", stopHold);
  canvas.addEventListener("pointerdown", () => {
    if (state.over) restart();
    else if (paused) paused = false;
  });
  document.getElementById("btn-pause").addEventListener("click", togglePause);
  document.getElementById("btn-restart").addEventListener("click", restart);
  document.addEventListener("visibilitychange", () => { if (document.hidden && !state.over) { paused = true; stopHold(); } });

  function frame(now) {
    acc += now - last;
    last = now;
    if (!paused && !state.over) {
      const interval = dropInterval(state.level);
      while (acc >= interval) {
        tick(state);
        acc -= interval;
      }
    } else {
      acc = 0;
    }
    saveBest();
    draw();
    requestAnimationFrame(frame);
  }
  try { if (localStorage.getItem(helpKey) !== "1") showHelp(); } catch (e) { showHelp(); } // first visit
  requestAnimationFrame(frame);
}
