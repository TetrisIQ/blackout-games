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
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fff";
      ctx.font = "24px system-ui";
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

  document.addEventListener("keydown", (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === "p") paused = !paused;
    else if (key === "r") { saveBest(); state = createState(); }
    else if (keys[key] && !paused) { e.preventDefault(); step(state, keys[key]); saveBest(); }
    draw();
  });

  draw();
}
