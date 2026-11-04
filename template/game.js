// Template: move a square, collect the dot. Replace the logic, keep the structure.
const GAME_ID = "template";
const SIZE = 16; // grid cells per side

// --- Logic (no DOM; testable with node) ---------------------------------

function createState(random = Math.random) {
  return { player: { x: 8, y: 8 }, dot: randomCell(random), score: 0, random };
}

function randomCell(random) {
  return { x: Math.floor(random() * SIZE), y: Math.floor(random() * SIZE) };
}

function step(state, dir) {
  const x = Math.min(SIZE - 1, Math.max(0, state.player.x + dir.x));
  const y = Math.min(SIZE - 1, Math.max(0, state.player.y + dir.y));
  state.player = { x, y };
  if (x === state.dot.x && y === state.dot.y) {
    state.score += 1;
    state.dot = randomCell(state.random);
  }
  return state;
}

if (typeof module !== "undefined") {
  module.exports = { createState, step, SIZE };
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
  bestEl.textContent = best;

  const keys = {
    ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 },
  };

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#e74c3c";
    ctx.fillRect(state.dot.x * cell, state.dot.y * cell, cell, cell);
    ctx.fillStyle = "#2ecc71";
    ctx.fillRect(state.player.x * cell, state.player.y * cell, cell, cell);
    if (paused) {
      ctx.fillStyle = PAL.overlay;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = PAL.text;
      ctx.font = "24px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText("Paused", canvas.width / 2, canvas.height / 2);
    }
    scoreEl.textContent = state.score;
  }

  function saveBest() {
    if (state.score > best) {
      best = state.score;
      localStorage.setItem(bestKey, best);
      bestEl.textContent = best;
    }
  }

  function move(dir) {
    if (paused) return;
    step(state, dir);
    saveBest();
    draw();
  }

  document.addEventListener("keydown", (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === "p") paused = !paused;
    else if (key === "r") { saveBest(); state = createState(); }
    else if (keys[key] && !paused) { e.preventDefault(); move(keys[key]); return; }
    draw();
  });

  // Touch: swipe on the board moves one cell, buttons below pause / restart.
  let swipe = null;
  canvas.addEventListener("pointerdown", (e) => { swipe = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener("pointermove", (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    move(Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) });
    swipe = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("pointerup", () => { swipe = null; });
  window.addEventListener("pointercancel", () => { swipe = null; });
  document.getElementById("btn-pause").addEventListener("click", () => { paused = !paused; draw(); });
  document.getElementById("btn-restart").addEventListener("click", () => { saveBest(); state = createState(); draw(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) paused = true; });

  draw();
  // Redraw when the theme changes (a game with a loop draws every frame anyway).
  if (typeof MutationObserver !== "undefined") new MutationObserver(draw).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
}
