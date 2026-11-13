// Greedy test bot: picks the placement with the best heuristic and hard-drops it. Used to check that
// campaign levels always end and to calibrate star thresholds (not shipped with the game).
const g = require("../game.js");

function evaluate(board) {
  const heights = Array(g.COLS).fill(0);
  let holes = 0;
  for (let x = 0; x < g.COLS; x++) {
    let seen = false;
    for (let y = 0; y < g.ROWS; y++) {
      if (board[y][x]) {
        if (!seen) { heights[x] = g.ROWS - y; seen = true; }
      } else if (seen) holes++;
    }
  }
  let bump = 0;
  for (let x = 1; x < g.COLS; x++) bump += Math.abs(heights[x] - heights[x - 1]);
  const lines = board.filter((row) => row.every((c) => c)).length;
  return -0.51 * heights.reduce((a, b) => a + b, 0) + 0.76 * lines - 0.36 * holes - 0.18 * bump;
}

function bestPlacement(state) {
  const p = state.piece;
  let best = null;
  let shape = p.shape;
  for (let r = 0; r < 4; r++) {
    for (let x = -2; x < g.COLS; x++) {
      if (g.collides(state.board, shape, x, p.y)) continue;
      let y = p.y;
      while (!g.collides(state.board, shape, x, y + 1)) y++;
      const board = state.board.map((row) => row.slice());
      shape.forEach((row, sy) => row.forEach((v, sx) => { if (v && y + sy >= 0) board[y + sy][x + sx] = p.type; }));
      const score = evaluate(board);
      if (!best || score > best.score) best = { score, shape, x };
    }
    shape = g.rotateShape(shape);
  }
  return best;
}

// Plays one campaign level (or endless when opts is null). `delay` is the bot's think time per piece in ms.
// Returns { ms, score, lines, won, stars } once the game is over or maxMs is reached.
function play(seed, opts, { delay = 500, step = 50, maxMs = 20 * 60 * 1000 } = {}) {
  let s = seed;
  const random = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const state = g.createState(random, opts);
  let piece = state.piece;
  let waited = 0;
  while (!state.over && state.elapsed < maxMs) {
    g.advance(state, step);
    if (state.over) break;
    if (state.piece !== piece) { piece = state.piece; waited = 0; }
    waited += step;
    if (waited >= delay) {
      const best = bestPlacement(state);
      if (best) { state.piece.shape = best.shape; state.piece.x = best.x; }
      g.hardDrop(state);
      waited = 0;
    }
  }
  return { ms: state.elapsed, score: state.score, lines: state.lines, won: state.won, over: state.over, cfg: state.cfg };
}

module.exports = { play, bestPlacement };
