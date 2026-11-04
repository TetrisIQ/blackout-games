// Snake: 20x20 board, walls and tail kill, speed rises with score.
const GAME_ID = "snake";
const SIZE = 20;
const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

// --- Logic (no DOM; testable with node) ---------------------------------

function placeFood(state) {
  const taken = new Set(state.snake.map((s) => s.y * SIZE + s.x));
  const free = [];
  for (let i = 0; i < SIZE * SIZE; i++) if (!taken.has(i)) free.push(i);
  if (free.length === 0) return null;
  const i = free[Math.floor(state.random() * free.length)];
  return { x: i % SIZE, y: Math.floor(i / SIZE) };
}

function createState(random = Math.random) {
  const mid = Math.floor(SIZE / 2);
  const state = {
    snake: [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }],
    dir: DIRS.right,
    queue: [],
    food: null,
    score: 0,
    over: false,
    won: false,
    random,
  };
  state.food = placeFood(state);
  return state;
}

// Queue a turn (max 2 buffered); ignores reversing and repeating the current heading.
function setDir(state, dir) {
  const last = state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
  if (state.queue.length >= 2) return false;
  if (dir.x === last.x && dir.y === last.y) return false;
  if (dir.x === -last.x && dir.y === -last.y) return false;
  state.queue.push(dir);
  return true;
}

function step(state) {
  if (state.over) return state;
  if (state.queue.length) state.dir = state.queue.shift();
  const head = state.snake[0];
  const next = { x: head.x + state.dir.x, y: head.y + state.dir.y };
  const eats = state.food && next.x === state.food.x && next.y === state.food.y;
  // The tail cell is free again this tick unless we grow.
  const body = eats ? state.snake : state.snake.slice(0, -1);
  const hitWall = next.x < 0 || next.y < 0 || next.x >= SIZE || next.y >= SIZE;
  if (hitWall || body.some((s) => s.x === next.x && s.y === next.y)) {
    state.over = true;
    return state;
  }
  state.snake.unshift(next);
  if (eats) {
    state.score += 10;
    state.food = placeFood(state);
    if (!state.food) {
      state.over = true;
      state.won = true;
    }
  } else {
    state.snake.pop();
  }
  return state;
}

function interval(score) {
  return Math.max(60, 150 - Math.floor(score / 10) * 4);
}

if (typeof module !== "undefined") {
  module.exports = { SIZE, DIRS, createState, setDir, step, placeFood, interval };
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

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const cell = canvas.width / SIZE;
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const bestKey = `${GAME_ID}:best`;

  let state = createState();
  let paused = false;
  let best = Number(localStorage.getItem(bestKey) || 0);
  let acc = 0;
  let last = performance.now();
  bestEl.textContent = best;

  const keys = {
    ArrowUp: DIRS.up, w: DIRS.up,
    ArrowDown: DIRS.down, s: DIRS.down,
    ArrowLeft: DIRS.left, a: DIRS.left,
    ArrowRight: DIRS.right, d: DIRS.right,
  };

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
    if (state.food) {
      ctx.fillStyle = "#e74c3c";
      ctx.fillRect(state.food.x * cell + 2, state.food.y * cell + 2, cell - 4, cell - 4);
    }
    state.snake.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? "#1e8e4e" : "#2ecc71";
      ctx.fillRect(s.x * cell + 1, s.y * cell + 1, cell - 2, cell - 2);
    });
    scoreEl.textContent = state.score;
    if (state.won) overlay("You win! (R / tap)");
    else if (state.over) overlay("Game over (R / tap)");
    else if (paused) overlay("Paused (P / tap)");
  }

  function saveBest() {
    if (state.score > best) {
      best = state.score;
      localStorage.setItem(bestKey, best);
      bestEl.textContent = best;
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

  document.addEventListener("keydown", (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === "r") restart();
    else if (key === "p") togglePause();
    else if (keys[key] && !paused && !state.over) setDir(state, keys[key]);
    else return;
    e.preventDefault();
    draw();
  });

  // Touch: swipe on the board, d-pad and buttons below it, tap to continue / restart.
  let swipe = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (state.over) { restart(); draw(); return; }
    if (paused) { paused = false; return; }
    swipe = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!swipe || paused || state.over) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    setDir(state, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIRS.right : DIRS.left) : (dy > 0 ? DIRS.down : DIRS.up));
    swipe = { x: e.clientX, y: e.clientY }; // a long drag can steer again
  });
  window.addEventListener("pointerup", () => { swipe = null; });
  window.addEventListener("pointercancel", () => { swipe = null; });
  for (const b of document.querySelectorAll("[data-dir]")) {
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (!paused && !state.over) setDir(state, DIRS[b.dataset.dir]);
    });
  }
  document.getElementById("btn-pause").addEventListener("click", togglePause);
  document.getElementById("btn-restart").addEventListener("click", () => { restart(); draw(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && !state.over) paused = true; });

  function frame(now) {
    acc += now - last;
    last = now;
    if (!paused && !state.over) {
      const ms = interval(state.score);
      while (acc >= ms && !state.over) {
        step(state);
        acc -= ms;
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
