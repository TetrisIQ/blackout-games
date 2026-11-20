// A simple shooter for the tests: aims at the head-most visible orb of the loaded colour (led by the chain's speed).
const g = require("../game.js");

function aimBot(s, rnd = null, noise = 0, lead = true) {
  const want = [s.cur, s.nxt];
  let target = null;
  let swapIt = false;
  for (let pass = 0; pass < 2 && !target; pass++) {
    for (let i = 0; i < s.balls.length; i++) {
      const b = s.balls[i];
      if (b.c !== want[pass] || g.hidden(s, b)) continue;
      target = b;
      swapIt = pass === 1;
      break;
    }
  }
  if (!target) target = s.balls.find((b) => !g.hidden(s, b));
  if (!target) return false;
  if (swapIt) g.swap(s);
  const p0 = g.pointAt(s.track, target.s);
  const t = Math.hypot(p0.x - g.FROG.x, p0.y - g.FROG.y) / 950;
  const p = g.pointAt(s.track, target.s + (lead ? 25 * t : 0));
  g.aimAt(s, p.x, p.y);
  if (noise) g.turn(s, (rnd() - 0.5) * 2 * noise);
  return true;
}

// Plays until the round ends or maxMs pass. Returns the state.
// `slow` plays like a mediocre human: a shot every `every` ms with some aim error and no lead.
function play(state, maxMs, { shoot = true, every = 0, noise = 0, rnd = seeded(99) } = {}) {
  let t = 0;
  let next = 0;
  while (!state.over && t < maxMs) {
    if (shoot && state.boss && state.boss.open && state.cool <= 0 && state.boss.flash <= 0) { g.aimAt(state, state.boss.x, state.boss.y); g.fire(state); }
    else if (shoot && t >= next && state.cool <= 0 && state.shots.length === 0 && aimBot(state, rnd, noise, !every)) { g.fire(state); next = t + every; }
    g.advance(state, 16);
    t += 16;
  }
  return state;
}

function seeded(seed = 7) {
  let x = seed;
  return () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

module.exports = { aimBot, play, seeded };
