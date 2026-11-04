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
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = "28px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.board.forEach((row, y) => row.forEach((t, x) => t && cell(ctx, t, x, y)));
    if (!state.over) {
      const p = state.piece;
      shapeCells(ctx, p.shape, p.type, p.x, ghostY(state), 0.25);
      shapeCells(ctx, p.shape, p.type, p.x, p.y, 1);
    }
    nextCtx.clearRect(0, 0, 120, 120);
    const ns = SHAPES[state.next];
    const off = (4 - ns.length) / 2;
    shapeCells(nextCtx, ns, state.next, off, off, 1);
    els.score.textContent = state.score;
    els.lines.textContent = state.lines;
    els.level.textContent = state.level;
    if (state.over) overlay("Game over (R)");
    else if (paused) overlay("Paused");
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

  document.addEventListener("keydown", (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === "r") restart();
    else if (key === "p" && !state.over) paused = !paused;
    else if (!paused && !state.over) {
      if (key === "ArrowLeft" || key === "a") move(state, -1);
      else if (key === "ArrowRight" || key === "d") move(state, 1);
      else if (key === "ArrowUp" || key === "w" || key === "x") rotate(state);
      else if (key === "ArrowDown" || key === "s") softDrop(state);
      else if (key === " ") hardDrop(state);
      else return;
    } else return;
    e.preventDefault();
    saveBest();
    draw();
  });

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
  requestAnimationFrame(frame);
}
