// Orb Chain: shoot orbs into a rolling chain; three or more of a colour pop. Logic first (no DOM, testable with node),
// input and rendering below.
const GAME_ID = "orb-chain";
const W = 600;
const H = 600;
const CX = 300;
const CY = 300;
const R = 13; // orb radius
const D = 26; // orb diameter = spacing in the chain
const FROG = { x: CX, y: CY };
const MUZZLE = 30;
const SHOT_SPEED = 950; // px/s
const FIRE_MS = 170;
const INTRO_SPEED = 240; // the chain rolls in fast until its head is a bit into the track
const REVERSE_SPEED = 150;
const SLOW_MS = 6000;
const BACK_MS = 2200;
const RUSH_MS = 2200;
const FREEZE_MS = 1800;
const BOSS_WARN_MS = 1500;
const STEP = 2; // track sample spacing in px
const MAX_COLORS = 6;
const STONE = -1;
const POWERS = ["slow", "bomb", "back"];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// --- Track: a spiral around the frog with a straight lead-in from outside the board -----------------------------

// spec: { r0, r1, turns, th0, dir, a, k, e, ph }. The chain enters along the tangent and spirals in to the hole.
function makeTrack(sp) {
  const lead = 330;
  const dir = sp.dir || 1;
  const N = 1200;
  const curve = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const th = sp.th0 + dir * sp.turns * 2 * Math.PI * t;
    const ramp = Math.min(1, t / 0.08);
    const r = lerp(sp.r0, sp.r1, t) * (1 + (sp.e || 0) * Math.cos(2 * th + (sp.ph || 0)) * ramp) + (sp.a || 0) * Math.sin((sp.k || 0) * th) * ramp;
    curve.push([CX + r * Math.cos(th), CY + r * Math.sin(th)]);
  }
  const dx = curve[1][0] - curve[0][0];
  const dy = curve[1][1] - curve[0][1];
  const dl = Math.hypot(dx, dy);
  const all = [];
  for (let l = lead; l > 0; l -= 4) all.push([curve[0][0] - (dx / dl) * l, curve[0][1] - (dy / dl) * l]);
  for (const p of curve) all.push(p);
  // resample at a constant spacing so s is arc length
  const xs = [all[0][0]];
  const ys = [all[0][1]];
  let acc = 0;
  for (let i = 1; i < all.length; i++) {
    const [ax, ay] = all[i - 1];
    const [bx, by] = all[i];
    const seg = Math.hypot(bx - ax, by - ay);
    let pos = 0;
    while (acc + seg - pos >= STEP) {
      pos += STEP - acc;
      acc = 0;
      xs.push(lerp(ax, bx, pos / seg));
      ys.push(lerp(ay, by, pos / seg));
    }
    acc += seg - pos;
  }
  return { xs, ys, len: (xs.length - 1) * STEP, lead, end: { x: xs[xs.length - 1], y: ys[ys.length - 1] } };
}

// Position and direction of travel at arc length s (clamped to the track).
function pointAt(track, s) {
  const n = track.xs.length - 1;
  const f = clamp(s / STEP, 0, n);
  const i = Math.min(n - 1, Math.floor(f));
  const u = f - i;
  const x = lerp(track.xs[i], track.xs[i + 1], u);
  const y = lerp(track.ys[i], track.ys[i + 1], u);
  return { x, y, a: Math.atan2(track.ys[i + 1] - track.ys[i], track.xs[i + 1] - track.xs[i]) };
}

// --- Campaign data --------------------------------------------------------------------------------------------

const LEVELS_PER_WORLD = 10;
const BOSS_LEVEL = LEVELS_PER_WORLD + 1;
const BOSS_STARS_NEEDED = 15; // of the 30 stars in a world's ten levels

const WORLDS = [
  { id: "meadow", name: "Meadow", boss: { id: "king", name: "The Swamp King", hp: 14, attacks: ["rush"] } },
  { id: "frost", name: "Frost", boss: { id: "wyrm", name: "The Ice Wyrm", hp: 18, attacks: ["rush", "freeze"] } },
  { id: "volcano", name: "Volcano", boss: { id: "maw", name: "The Magma Maw", hp: 22, attacks: ["rush", "stones"] } },
];

// Difficulty scales speed, colours, length, stones and the aim guide (2 = to the first orb, 1 = short, 0 = none).
const DIFFICULTIES = {
  easy: { name: "Easy", speed: 0.75, colors: -1, count: 0.85, stone: 0.6, hp: 0.75, guide: 2 },
  normal: { name: "Normal", speed: 1, colors: 0, count: 1, stone: 1, hp: 1, guide: 1 },
  hard: { name: "Hard", speed: 1.25, colors: 1, count: 1.15, stone: 1.4, hp: 1.25, guide: 0 },
};

const TH0 = [-1.57, 0.2, 1.1, 2.3, 3.14, 4.1, 0.7, 5.3, 2.7, 3.7];
const WOBBLE = [[0, 0, 0], [0, 0, 0.05], [8, 3, 0], [0, 0, 0.07], [12, 4, 0], [0, 0, 0.08], [10, 5, 0.05], [14, 3, 0], [10, 6, 0.07], [14, 4, 0.06]]; // a, k, e

function trackSpec(world, n) {
  const t = (n - 1) / (LEVELS_PER_WORLD - 1);
  const [a, k, e] = WOBBLE[n - 1];
  return {
    r0: 232, r1: Math.round(lerp(155, 118, t)), turns: Math.round((1.3 + 0.045 * (n - 1) + world * 0.06) * 100) / 100,
    th0: TH0[(n - 1 + world * 3) % 10], dir: (n + world) % 2 ? 1 : -1, a, k, e, ph: n,
  };
}

// The boss sits in the hole at the end of a shorter track, clear of the chain until the chain gets there.
function bossTrackSpec(world) {
  return { r0: 236, r1: 120, turns: 1.35, th0: TH0[world * 3 + 1], dir: world % 2 ? -1 : 1, a: 0, k: 0, e: 0, ph: 0 };
}

const ENDLESS_TRACK = { r0: 236, r1: 130, turns: 1.7, th0: -1.57, dir: 1, a: 0, k: 0, e: 0, ph: 0 };

const diffOf = (name) => DIFFICULTIES[name] || DIFFICULTIES.normal;
const diffName = (name) => (DIFFICULTIES[name] ? name : "normal");

function levelConfig(world, n, difficulty = "normal") {
  const t = (n - 1) / (LEVELS_PER_WORLD - 1);
  const d = diffOf(difficulty);
  const tunnels = world === 1 ? (n >= 7 ? [[0.28, 0.4], [0.62, 0.74]] : n >= 3 ? [[0.45, 0.58]] : []) : [];
  return {
    world, level: n, boss: false, endless: false, difficulty: diffName(difficulty),
    track: trackSpec(world, n),
    colors: clamp(Math.min(MAX_COLORS, 3 + world + Math.floor((n - 1) / 3.5)) + d.colors, 3, MAX_COLORS),
    count: Math.round((lerp(36, 90, t) + world * 10) * d.count),
    speed: (lerp(16, 32, t) + world * 4) * d.speed,
    stone: world === 2 && n >= 2 ? lerp(0.03, 0.07, t) * d.stone : 0,
    power: n >= 3 ? 0.05 : 0,
    tunnels,
    starPeaks: [lerp(0.85, 0.75, t), lerp(0.6, 0.45, t)], // the chain's head stays below this share of the track for the 2nd / 3rd star
    guide: d.guide,
  };
}

function bossConfig(world, difficulty = "normal") {
  const info = WORLDS[world].boss;
  const d = diffOf(difficulty);
  return {
    world, level: BOSS_LEVEL, boss: true, endless: false, difficulty: diffName(difficulty),
    track: bossTrackSpec(world),
    colors: clamp(Math.min(MAX_COLORS, 4 + world) + d.colors, 3, MAX_COLORS),
    count: 9999, // the chain keeps coming; only the boss ends the fight
    speed: (20 + world * 4) * d.speed,
    stone: world === 2 ? 0.04 * d.stone : 0,
    power: 0.06,
    tunnels: world === 1 ? [[0.5, 0.62]] : [],
    bossInfo: { ...info, hp: Math.round(info.hp * d.hp), openMs: 2400, gapMs: 3600, attack0: 11000, attackMin: 6500, attackDecay: 0.93 },
    timeStars: [180000, 120000, 70000], // win times in ms for 1 / 2 / 3 stars (3 stars = fastest)
    guide: d.guide,
  };
}

function endlessConfig(difficulty = "normal") {
  const d = diffOf(difficulty);
  return { world: 0, level: 0, boss: false, endless: true, difficulty: diffName(difficulty), track: ENDLESS_TRACK, colors: 4, count: Infinity, speed: 20 * d.speed, stone: 0, power: 0.04, tunnels: [], guide: d.guide, diff: d };
}

// --- State ----------------------------------------------------------------------------------------------------

// The chain is balls[0] (head, nearest the hole, largest s) ... balls[n-1] (tail). Gaps between neighbours are > D.
function createState(random = Math.random, cfg = null) {
  cfg = cfg || endlessConfig();
  const track = makeTrack(cfg.track);
  const state = {
    cfg, track, random, balls: [], spawned: 0, shots: [], fx: [],
    tunnels: (cfg.tunnels || []).map(([a, b]) => [track.lead + a * (track.len - track.lead), track.lead + b * (track.len - track.lead)]),
    elapsed: 0, score: 0, combo: 0, peak: 0, cool: 0, aim: -Math.PI / 2,
    slowT: 0, backT: 0, rushT: 0, freezeT: 0, stoneQueue: 0, sincePower: 0, intro: true,
    over: false, won: false, lost: false, boss: null,
    stats: { shots: 0, cleared: 0, bestCombo: 0, matches: 0 },
    cur: 0, nxt: 0, colorsNow: cfg.colors,
  };
  state.cur = pickColor(state);
  state.nxt = pickColor(state);
  if (cfg.boss) {
    const b = cfg.bossInfo;
    const pos = track.end;
    state.boss = { ...b, max: b.hp, x: pos.x, y: pos.y, r: 34, open: false, timer: 2500, attackIn: b.attack0, warn: null, flash: 0 };
  }
  return state;
}

function colorsPresent(state) {
  const set = new Set();
  for (const b of state.balls) if (b.c >= 0) set.add(b.c);
  return [...set];
}

function pickColor(state) {
  const present = colorsPresent(state);
  if (present.length) return present[Math.floor(state.random() * present.length)];
  return Math.floor(state.random() * state.colorsNow);
}

// A loaded orb whose colour is gone from the board would be wasted: swap it for one that is still there.
function refreshLoaded(state) {
  const present = colorsPresent(state);
  if (!present.length) return;
  if (!present.includes(state.cur)) state.cur = present[Math.floor(state.random() * present.length)];
  if (!present.includes(state.nxt)) state.nxt = present[Math.floor(state.random() * present.length)];
}

function introS(track) {
  return track.lead + 0.14 * (track.len - track.lead);
}

function baseSpeed(state) {
  const cfg = state.cfg;
  let v = cfg.endless ? Math.min(52, 20 + (state.elapsed / 1000) * 0.1) * cfg.diff.speed : cfg.speed;
  if (state.intro) v = INTRO_SPEED;
  if (state.slowT > 0) v *= 0.3;
  if (state.rushT > 0) v *= 2.4;
  return v;
}

const closeSpeed = (gap, v) => Math.min(320, Math.max(v * 1.6 + 50, gap * 1.5));

function hidden(state, ball) {
  for (const [a, b] of state.tunnels) if (ball.s >= a - R && ball.s <= b + R) return true;
  const p = pointAt(state.track, ball.s);
  return p.x < 2 || p.x > W - 2 || p.y < 2 || p.y > H - 2;
}

const touching = (balls, i) => balls[i].s - balls[i + 1].s <= D + 0.5; // balls[i] is ahead of balls[i + 1]

function runAt(balls, i) {
  const c = balls[i].c;
  let a = i;
  let z = i;
  if (c === STONE) return [a, z];
  while (a > 0 && balls[a - 1].c === c && touching(balls, a - 1)) a--;
  while (z < balls.length - 1 && balls[z + 1].c === c && touching(balls, z)) z++;
  return [a, z];
}

function addFx(state, fx) {
  fx.age = 0;
  state.fx.push(fx);
}

function popBall(state, b) {
  const p = pointAt(state.track, b.s);
  addFx(state, { k: "pop", x: p.x, y: p.y, c: b.c });
}

// Removes balls[a..z] (plus stones next to them), scores and triggers power-ups. `combo` is the chain-reaction level.
function clearRun(state, a, z, combo) {
  const b = state.balls;
  const colored = z - a + 1;
  const powers = [];
  for (let i = a; i <= z; i++) if (b[i].p) powers.push(b[i].p);
  // stones next to a cleared run crack
  if (a > 0 && b[a - 1].c === STONE && touching(b, a - 1)) a--;
  if (z < b.length - 1 && b[z + 1].c === STONE && touching(b, z)) z++;
  const mid = pointAt(state.track, b[Math.floor((a + z) / 2)].s);
  for (let i = a; i <= z; i++) popBall(state, b[i]);
  b.splice(a, z - a + 1);
  const gain = (colored * 10 + Math.max(0, colored - 3) * 10) * (1 + combo);
  state.score += gain;
  state.stats.cleared += z - a + 1;
  state.stats.matches++;
  state.stats.bestCombo = Math.max(state.stats.bestCombo, combo);
  addFx(state, { k: "text", x: mid.x, y: mid.y, text: combo > 0 ? `+${gain} x${combo + 1}` : `+${gain}` });
  for (const p of powers) applyPower(state, p, a);
  refreshLoaded(state);
}

function applyPower(state, kind, at) {
  if (kind === "slow") state.slowT = SLOW_MS;
  else if (kind === "back") state.backT = BACK_MS;
  else if (kind === "bomb") {
    const b = state.balls;
    const lo = Math.max(0, at - 2);
    const hi = Math.min(b.length - 1, at + 1);
    if (hi >= lo) {
      for (let i = lo; i <= hi; i++) popBall(state, b[i]);
      state.score += (hi - lo + 1) * 10;
      state.stats.cleared += hi - lo + 1;
      b.splice(lo, hi - lo + 1);
    }
  }
}

function newBall(state, s) {
  const cfg = state.cfg;
  let c;
  let p = null;
  if (state.stoneQueue > 0) { c = STONE; state.stoneQueue--; }
  else if (cfg.stone && state.random() < cfg.stone && state.spawned > 6) c = STONE;
  else {
    const n = state.colorsNow;
    const last = state.lastSpawn || [];
    do { c = Math.floor(state.random() * n); } while (last.length >= 2 && last[0] === c && last[1] === c);
    state.sincePower++;
    if (cfg.power && state.sincePower > 12 && state.random() < cfg.power) { p = POWERS[Math.floor(state.random() * POWERS.length)]; state.sincePower = 0; }
  }
  state.lastSpawn = [c, (state.lastSpawn || [])[0]];
  state.spawned++;
  return { c, s, vs: s, p, fx: 0, fy: 0 };
}

function spawnBalls(state) {
  const b = state.balls;
  if (state.backT > 0) return;
  while (state.spawned < state.cfg.count) {
    if (b.length === 0) { b.push(newBall(state, 0)); continue; }
    const last = b[b.length - 1];
    if (last.s < D) break;
    // a continuous feed lands right behind the tail; after the tail was cleared a fresh group starts at the entry
    b.push(newBall(state, last.s - D < D ? last.s - D : 0));
  }
}

function moveChain(state, dt) {
  const b = state.balls;
  const n = b.length;
  if (!n) return;
  const sec = dt / 1000;
  if (state.backT > 0) {
    const amt = Math.min(REVERSE_SPEED * sec, Math.max(0, b[n - 1].s));
    for (const x of b) x.s -= amt;
    return;
  }
  const v = baseSpeed(state);
  const groups = [];
  let start = 0;
  for (let i = 1; i <= n; i++) {
    if (i === n || b[i - 1].s - b[i].s > D + 0.01) { groups.push([start, i - 1]); start = i; }
  }
  const joined = [];
  for (let g = groups.length - 1; g >= 0; g--) {
    const [a, z] = groups[g];
    const gap = g > 0 ? b[groups[g - 1][1]].s - D - b[a].s : Infinity;
    let sp = g === groups.length - 1 ? v : 0; // only the tail group is pushed (by the feed); groups cut off ahead stand still
    if (g > 0 && gap > 0.01) sp = Math.max(sp, closeSpeed(gap, v));
    let move = sp * sec;
    if (g > 0) move = Math.min(move, gap);
    for (let i = a; i <= z; i++) b[i].s += move;
    if (g > 0 && gap - move <= 0.01 && gap > 0.01) joined.push(b[a]);
  }
  // two groups met: matching colours at the seam pop (chain reaction)
  for (const ball of joined) {
    const i = state.balls.indexOf(ball);
    if (i <= 0 || ball.c === STONE || state.balls[i - 1].c !== ball.c) continue;
    const [a, z] = runAt(state.balls, i);
    if (z - a + 1 >= 3) { state.combo++; clearRun(state, a, z, state.combo); }
  }
}

function insertShot(state, shot, i) {
  const b = state.balls;
  const hit = b[i];
  const hp = pointAt(state.track, hit.s);
  const ahead = (shot.x - hp.x) * Math.cos(hp.a) + (shot.y - hp.y) * Math.sin(hp.a) > 0;
  const k = ahead ? i : i + 1;
  const ball = { c: shot.c, s: k < b.length ? b[k].s + D : b[k - 1].s - D, vs: 0, p: null, fx: 0, fy: 0 };
  ball.vs = ball.s;
  const slot = pointAt(state.track, ball.s);
  ball.fx = shot.x - slot.x;
  ball.fy = shot.y - slot.y;
  b.splice(k, 0, ball);
  for (let j = k - 1; j >= 0; j--) if (b[j].s < b[j + 1].s + D) b[j].s = b[j + 1].s + D; // the head side makes room
  state.combo = 0;
  const [a, z] = runAt(b, k);
  if (ball.c !== STONE && z - a + 1 >= 3) clearRun(state, a, z, 0);
}

function bossHit(state, shot) {
  const bs = state.boss;
  if (bs.open && bs.flash <= 0) {
    bs.hp--;
    bs.flash = 500; // a hit makes the mouth snap shut for a moment: no rapid fire
    state.score += 200;
    addFx(state, { k: "text", x: bs.x, y: bs.y - 40, text: "+200" });
    if (bs.hp <= 0) winBoss(state);
  } else if (!bs.open) addFx(state, { k: "text", x: bs.x, y: bs.y - 40, text: "closed" });
}

function winBoss(state) {
  for (const b of state.balls) popBall(state, b);
  state.score += state.balls.length * 10;
  state.stats.cleared += state.balls.length;
  state.balls = [];
  state.won = true;
  state.over = true;
}

function moveShots(state, dt) {
  const keep = [];
  for (const s of state.shots) {
    const dist = SHOT_SPEED * (dt / 1000);
    const steps = Math.max(1, Math.ceil(dist / 6));
    let done = false;
    for (let k = 0; k < steps && !done; k++) {
      s.x += (s.vx * (dt / 1000)) / steps;
      s.y += (s.vy * (dt / 1000)) / steps;
      if (state.boss && Math.hypot(s.x - state.boss.x, s.y - state.boss.y) < state.boss.r) {
        bossHit(state, s);
        done = true;
        break;
      }
      let best = -1;
      let bestD = (D * 0.92) ** 2;
      for (let i = 0; i < state.balls.length; i++) {
        const b = state.balls[i];
        if (hidden(state, b)) continue;
        const p = pointAt(state.track, b.s);
        const d2 = (p.x - s.x) ** 2 + (p.y - s.y) ** 2;
        if (d2 < bestD) { bestD = d2; best = i; }
      }
      if (best >= 0) { insertShot(state, s, best); done = true; }
    }
    if (!done && s.x > -40 && s.x < W + 40 && s.y > -40 && s.y < H + 40) keep.push(s);
  }
  state.shots = keep;
}

function updateBoss(state, dt) {
  const bs = state.boss;
  if (!bs) return;
  bs.flash = Math.max(0, bs.flash - dt);
  bs.timer -= dt;
  if (bs.timer <= 0) {
    bs.open = !bs.open;
    bs.timer = bs.open ? bs.openMs : bs.gapMs;
  }
  if (bs.warn) {
    bs.warn.left -= dt;
    if (bs.warn.left <= 0) {
      const kind = bs.warn.kind;
      bs.warn = null;
      if (kind === "rush") state.rushT = RUSH_MS;
      else if (kind === "freeze") state.freezeT = FREEZE_MS;
      else if (kind === "stones") state.stoneQueue += 4;
    }
  } else {
    bs.attackIn -= dt;
    if (bs.attackIn <= 0) {
      bs.warn = { kind: bs.attacks[Math.floor(state.random() * bs.attacks.length)], left: BOSS_WARN_MS };
      bs.attack0 = Math.max(bs.attackMin, bs.attack0 * bs.attackDecay);
      bs.attackIn = bs.attack0;
    }
  }
}

// Advances the game by dt ms.
function advance(state, dt) {
  for (const f of state.fx) f.age += dt;
  state.fx = state.fx.filter((f) => f.age < 800);
  if (state.over) {
    if (state.lost) { // the chain rushes into the hole
      for (const b of state.balls) b.s += 0.7 * dt;
      state.balls = state.balls.filter((b) => b.s < state.track.len);
    }
    return;
  }
  state.elapsed += dt;
  state.cool = Math.max(0, state.cool - dt);
  const cfg = state.cfg;
  if (cfg.endless) state.colorsNow = Math.min(MAX_COLORS, 4 + Math.floor(state.elapsed / 50000) + (cfg.diff.colors > 0 ? 1 : 0));
  if (cfg.endless && state.elapsed > 90000) cfg.stone = 0.03;
  updateBoss(state, dt);
  state.slowT = Math.max(0, state.slowT - dt);
  state.backT = Math.max(0, state.backT - dt);
  state.rushT = Math.max(0, state.rushT - dt);
  state.freezeT = Math.max(0, state.freezeT - dt);
  if (state.intro && state.balls.length && state.balls[0].s >= introS(state.track)) state.intro = false;
  moveChain(state, dt);
  spawnBalls(state);
  moveShots(state, dt);
  const k = Math.min(1, (dt / 1000) * 16);
  for (const b of state.balls) {
    b.vs += (b.s - b.vs) * k;
    b.fx *= 1 - Math.min(1, (dt / 1000) * 14);
    b.fy *= 1 - Math.min(1, (dt / 1000) * 14);
  }
  const head = state.balls[0];
  if (head) {
    state.peak = Math.max(state.peak, head.s / state.track.len);
    if (head.s >= state.track.len - 8) { state.over = true; state.lost = true; return; }
  }
  if (!cfg.boss && !cfg.endless && state.spawned >= cfg.count && !state.balls.length) { state.won = true; state.over = true; }
}

// --- Shooter ----------------------------------------------------------------------------------------------------

function aimAt(state, x, y) {
  state.aim = Math.atan2(y - FROG.y, x - FROG.x);
}

function turn(state, da) {
  state.aim += da;
}

function fire(state) {
  if (state.over || state.cool > 0 || state.freezeT > 0) return false;
  const a = state.aim;
  refreshLoaded(state);
  state.shots.push({ x: FROG.x + Math.cos(a) * MUZZLE, y: FROG.y + Math.sin(a) * MUZZLE, vx: Math.cos(a) * SHOT_SPEED, vy: Math.sin(a) * SHOT_SPEED, c: state.cur });
  state.cur = state.nxt;
  state.nxt = pickColor(state);
  state.cool = FIRE_MS;
  state.stats.shots++;
  return true;
}

function swap(state) {
  if (state.over) return;
  [state.cur, state.nxt] = [state.nxt, state.cur];
}

// First orb on a straight line from the frog at the given angle (for the aim guide), or null.
function aimTarget(state, angle) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let best = null;
  for (const b of state.balls) {
    if (hidden(state, b)) continue;
    const p = pointAt(state.track, b.s);
    const t = (p.x - FROG.x) * ux + (p.y - FROG.y) * uy;
    if (t < 0) continue;
    const off = Math.abs((p.x - FROG.x) * uy - (p.y - FROG.y) * ux);
    if (off < D * 0.92 && (!best || t < best)) best = t;
  }
  return best;
}

// --- Stars and progress -------------------------------------------------------------------------------------------

// Win = 1 star; keeping the chain's head below the thresholds gives the 2nd and 3rd.
function starsFor(state) {
  if (!state.won) return 0;
  return 1 + state.cfg.starPeaks.filter((p) => state.peak <= p).length;
}

// Boss stars come from how fast the boss fell; every win is at least one star.
function bossStarsFor(elapsedMs, cfg) {
  return Math.max(1, cfg.timeStars.filter((ms) => elapsedMs <= ms).length);
}

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
    W, H, R, D, FROG, MUZZLE, STONE, BOSS_WARN_MS, STEP, LEVELS_PER_WORLD, BOSS_LEVEL, BOSS_STARS_NEEDED, WORLDS, DIFFICULTIES,
    makeTrack, pointAt, levelConfig, bossConfig, endlessConfig, createState, advance, aimAt, turn, fire, swap, aimTarget, hidden,
    runAt, starsFor, bossStarsFor, blankProgress, levelKey, starsAt, starsIn, worldUnlocked, unlockedLevel, bossUnlocked, recordResult,
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
    for (const k of ["board", "line", "text", "muted", "accent", "overlay", "cell-a", "cell-b", "bg", "warn", "groove", "lane", "tunnel", "frog"]) PAL[k] = cs.getPropertyValue(`--${k}`).trim();
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
  const SCALE = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const els = {
    score: document.getElementById("score"),
    best: document.getElementById("best"),
    mode: document.getElementById("mode"),
    levelsBtn: document.getElementById("btn-levels"),
    screen: document.getElementById("screen"),
    card: document.getElementById("screen-card"),
  };
  const bestKey = `${GAME_ID}:best`;
  let best = Number(localStorage.getItem(bestKey) || 0);

  const COLORS = ["#e74c3c", "#3d7be0", "#2ecc71", "#f1c40f", "#9b59b6", "#17b8b8"];
  const WARNINGS = { rush: "Rush!", freeze: "Frozen!", stones: "Stones!" };

  // --- Orb sprites: one per colour, drawn once ---
  const sprites = [];
  function glyph(g, c, k) {
    g.fillStyle = g.strokeStyle = "rgba(255,255,255,0.78)";
    g.lineWidth = 1.8;
    g.beginPath();
    if (k === 0) g.arc(c, c, 2.6, 0, 7);
    else if (k === 1) { g.arc(c, c, 3.8, 0, 7); g.fillStyle = "transparent"; }
    else if (k === 2) { g.moveTo(c, c - 4.4); g.lineTo(c + 4, c + 3); g.lineTo(c - 4, c + 3); g.closePath(); }
    else if (k === 3) g.rect(c - 3.2, c - 3.2, 6.4, 6.4);
    else if (k === 4) { g.moveTo(c, c - 4.6); g.lineTo(c + 4, c); g.lineTo(c, c + 4.6); g.lineTo(c - 4, c); g.closePath(); }
    else { g.moveTo(c - 4, c); g.lineTo(c + 4, c); g.moveTo(c, c - 4); g.lineTo(c, c + 4); g.fillStyle = "transparent"; }
    if (k === 1 || k === 5) g.stroke(); else g.fill();
  }
  function makeSprite(k) {
    const size = (2 * R + 4) * SCALE;
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const g = cv.getContext("2d");
    g.scale(SCALE, SCALE);
    const c = R + 2;
    const base = k === STONE ? "#7b8088" : COLORS[k];
    const grad = g.createRadialGradient(c - 4, c - 4, 1.5, c, c, R);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.28, base);
    grad.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = base;
    g.beginPath(); g.arc(c, c, R, 0, 7); g.fill();
    g.fillStyle = grad;
    g.globalAlpha = 0.9;
    g.beginPath(); g.arc(c, c, R, 0, 7); g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = "rgba(0,0,0,0.4)";
    g.lineWidth = 1;
    g.beginPath(); g.arc(c, c, R - 0.5, 0, 7); g.stroke();
    if (k === STONE) {
      g.strokeStyle = "rgba(0,0,0,0.45)";
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(c - 6, c - 3); g.lineTo(c - 1, c); g.lineTo(c - 3, c + 6); g.moveTo(c - 1, c); g.lineTo(c + 6, c + 2); g.stroke();
    } else glyph(g, c, k);
    return cv;
  }
  for (let k = 0; k < MAX_COLORS; k++) sprites[k] = makeSprite(k);
  sprites[MAX_COLORS] = makeSprite(STONE);
  const spriteOf = (c) => sprites[c === STONE ? MAX_COLORS : c];

  function drawOrb(x, y, c, p, scale = 1) {
    const size = 2 * R + 4;
    ctx.drawImage(spriteOf(c), x - (size * scale) / 2, y - (size * scale) / 2, size * scale, size * scale);
    if (p) {
      ctx.strokeStyle = "#ffd34d";
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, (R - 0.5) * scale, 0, 7); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle = "#1c1c1c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (p === "slow") { ctx.fillRect(x - 4.5 * scale, y - 4.5 * scale, 3.2 * scale, 9 * scale); ctx.fillRect(x + 1.3 * scale, y - 4.5 * scale, 3.2 * scale, 9 * scale); }
      else if (p === "back") { ctx.moveTo(x + 4.5 * scale, y - 5 * scale); ctx.lineTo(x - 4.5 * scale, y); ctx.lineTo(x + 4.5 * scale, y + 5 * scale); ctx.closePath(); ctx.fill(); }
      else { ctx.arc(x, y + 1, 4.8 * scale, 0, 7); ctx.fill(); ctx.moveTo(x + 2, y - 3); ctx.lineTo(x + 5, y - 6); ctx.stroke(); }
    }
  }

  // --- Round state ---
  let current = null; // { world, level, difficulty } while a campaign level is played, null in the endless game
  let state = createState(Math.random, endlessConfig());
  let paused = false;
  let finished = false; // the campaign result of this round was handled
  let roundStars = 0;
  let banner = 0; // ms the level title stays on the board
  let last = performance.now();

  // One game_start / game_end (endless) or level_start / level_end (campaign) per round; the outcome is read
  // from the state when the round is left.
  let round = null;
  function startRound() {
    round = { active: 0 };
    if (current) track("level_start", { world: WORLDS[current.world].id, level: current.level, boss: current.level === BOSS_LEVEL, difficulty: current.difficulty });
    else track("game_start", { difficulty: settings.difficulty });
  }
  function endRound() {
    if (!round) return;
    const r = round;
    round = null;
    const active_s = Math.round(r.active / 100) / 10;
    const base = { score: state.score, cleared: state.stats.cleared, shots: state.stats.shots, active_s };
    if (current) {
      track("level_end", { world: WORLDS[current.world].id, level: current.level, boss: current.level === BOSS_LEVEL, difficulty: current.difficulty, outcome: state.won ? "won" : state.over ? "lost" : "abandoned", stars: roundStars, peak: Math.round(state.peak * 100), best_combo: state.stats.bestCombo, ...base });
    } else {
      track("game_end", { difficulty: settings.difficulty, outcome: state.over ? "over" : "abandoned", best_combo: state.stats.bestCombo, ...base });
    }
  }

  // --- Campaign progress and settings: saved in this browser ---
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

  const settingsKey = `${GAME_ID}:settings`;
  const settings = { difficulty: "normal" };
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey));
    if (saved && DIFFICULTIES[saved.difficulty]) settings.difficulty = saved.difficulty;
  } catch (e) { /* no saved settings */ }
  function applySettings() {
    try { localStorage.setItem(settingsKey, JSON.stringify(settings)); } catch (e) { /* storage full or blocked */ }
  }

  // --- How to play: shown on the first visit, then from the button or with "?" ---
  const helpKey = `${GAME_ID}:help`;
  const helpEl = (id) => document.getElementById(id);
  const demo = (html) => `<p class="demo">${html}</p>`;
  const dot = (c, n = 1) => `<span style="color:${COLORS[c]}">${"&#9679;".repeat(n)}</span>`;
  const HELP = [
    {
      title: "Shoot the chain",
      html: `<p>A chain of orbs rolls along the track towards the <b>hole</b>. The frog in the middle shoots orbs: put <b>three or more of the same colour</b> together and they pop.</p>
        ${demo(`${dot(0, 2)}${dot(1)}${dot(2, 2)} <small>+</small> ${dot(2)} <small>pops!</small>`)}
        <p>The orb in the frog's mouth is the one you shoot, the small one on its back is next. <b>Swap</b> them whenever it helps. Clear the whole chain before it reaches the hole.</p>`,
    },
    {
      title: "Gaps and power-ups",
      html: `<p>When orbs pop, the part ahead of the gap <b>stops</b> while the rest rolls on. If the two ends have the same colour, they pop again: a <b>chain reaction</b> with a growing bonus.</p>
        ${demo(`${dot(1, 2)}<small>gap</small>${dot(1, 2)} <small>&rarr; pop</small>`)}
        <p>Orbs with a <b style="color:#d4a017">golden ring</b> give power-ups when they pop: <b>slow</b> (pause icon), <b>back</b> (arrow, the chain rolls back) and <b>bomb</b>.</p>`,
    },
    {
      title: "Campaign",
      html: `<p>Three worlds with <b>10 levels and a boss</b> each. Clearing a level gives one star; keep the chain's head far from the hole for a <b>second and third star</b>. One star opens the next level.</p>
        <p><b>Frost</b> has tunnels: orbs inside can't be hit. <b>Volcano</b> has grey <b>stones</b> that never match but crack when a pop happens next to them.</p>
        <p>The <b>boss</b> needs ${BOSS_STARS_NEEDED} stars from its world and sits in the hole. Shoot it while its mouth <b>glows</b>; its attacks flash at the top first. <b>Endless</b> has no goal: survive and set a score. Difficulty changes speed, colours and the aim guide.</p>`,
    },
    {
      title: "Controls",
      html: `<p><b>Mouse:</b> aim with the pointer, <b>click</b> to shoot, <b>right-click</b> or click the frog to swap.</p>
        <p><b>Keyboard:</b> <kbd>&larr;</kbd> <kbd>&rarr;</kbd> aim, <kbd>Space</kbd> shoot, <kbd>Q</kbd> swap, <kbd>P</kbd> pause, <kbd>R</kbd> restart, <kbd>Esc</kbd> menu, <kbd>?</kbd> this guide.</p>
        <p><b>Touch:</b> <b>drag</b> on the board to aim, <b>let go</b> to shoot, tap the frog or <b>Swap</b> to swap.</p>
        <p>The game pauses when you leave the page. Your progress is saved in this browser.</p>`,
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
    pausedByHelp = !paused;
    paused = true;
    helpEl("help").hidden = false;
    helpPage(0);
    helpEl("help-next").focus();
  }

  function closeHelp() {
    helpOpen = false;
    helpEl("help").hidden = true;
    try { localStorage.setItem(helpKey, "1"); } catch (e) { /* storage blocked */ }
    if (pausedByHelp && !screenName) paused = false;
  }

  function helpHandleKey(e, key) {
    if (!helpOpen) {
      if (key === "?" && !screenName) { showHelp(); e.preventDefault(); return true; }
      return false;
    }
    if (key === "Escape") closeHelp();
    else if (key === "ArrowRight") helpPage(helpIndex + 1);
    else if (key === "ArrowLeft") helpPage(helpIndex - 1);
    else return key !== "Tab" && key !== "Enter" && key !== " ";
    e.preventDefault();
    return true;
  }

  helpEl("help-next").addEventListener("click", () => { if (helpIndex === HELP.length - 1) closeHelp(); else helpPage(helpIndex + 1); });
  helpEl("help-back").addEventListener("click", () => helpPage(helpIndex - 1));
  helpEl("help-close").addEventListener("click", closeHelp);
  document.getElementById("btn-help").addEventListener("click", showHelp);

  // --- Drawing ---
  function strokeTrack(from, to, width, style) {
    const t = state.track;
    const i0 = Math.max(0, Math.floor(from / STEP));
    const i1 = Math.min(t.xs.length - 1, Math.ceil(to / STEP));
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(t.xs[i0], t.ys[i0]);
    for (let i = i0 + 1; i <= i1; i += 2) ctx.lineTo(t.xs[i], t.ys[i]);
    ctx.lineTo(t.xs[i1], t.ys[i1]);
    ctx.stroke();
  }

  function drawHole(now) {
    const e = state.track.end;
    const danger = state.balls.length ? clamp((state.balls[0].s / state.track.len - 0.7) / 0.3, 0, 1) : 0;
    const pulse = danger > 0 ? 0.5 + 0.5 * Math.sin(now / 120) : 0;
    ctx.fillStyle = PAL.text;
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(e.x, e.y, 19, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAL.board;
    ctx.beginPath(); ctx.arc(e.x, e.y, 12, 0, 7); ctx.fill();
    if (danger > 0) {
      ctx.strokeStyle = PAL.warn;
      ctx.globalAlpha = 0.35 + 0.65 * pulse * danger;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, 24 + 3 * pulse, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawFrog(now) {
    const a = state.aim;
    ctx.save();
    ctx.translate(FROG.x, FROG.y);
    ctx.rotate(a);
    ctx.fillStyle = PAL.frog;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 24, 0, 7); ctx.fill(); ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.fillStyle = "#f4f4ee";
      ctx.beginPath(); ctx.arc(8, side * 14, 6.5, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#1c1c1c";
      ctx.beginPath(); ctx.arc(10, side * 14, 3, 0, 7); ctx.fill();
    }
    ctx.restore();
    // the next orb on the back, the loaded one at the muzzle
    drawOrb(FROG.x - Math.cos(a) * 12, FROG.y - Math.sin(a) * 12, state.nxt, null, 0.62);
    if (!state.over || state.won) {
      const loaded = 0.6 + 0.4 * (1 - state.cool / FIRE_MS); // the next orb pops into the mouth after a shot
      drawOrb(FROG.x + Math.cos(a) * (MUZZLE - 2), FROG.y + Math.sin(a) * (MUZZLE - 2), state.cur, null, loaded);
    }
    if (state.freezeT > 0) {
      ctx.fillStyle = "rgba(150, 210, 255, 0.55)";
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(FROG.x, FROG.y, 34, 0, 7); ctx.fill(); ctx.stroke();
    }
  }

  function drawGuide() {
    const g = state.cfg.guide;
    if (!g || state.over || paused || screenName) return;
    const a = state.aim;
    const hit = aimTarget(state, a);
    const len = g === 2 ? (hit === null ? 360 : Math.max(0, hit - R)) : Math.min(110, hit === null ? 110 : Math.max(0, hit - R));
    if (len <= MUZZLE + 10) return;
    ctx.strokeStyle = PAL.muted;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.setLineDash([2, 9]);
    ctx.beginPath();
    ctx.moveTo(FROG.x + Math.cos(a) * (MUZZLE + 18), FROG.y + Math.sin(a) * (MUZZLE + 18));
    ctx.lineTo(FROG.x + Math.cos(a) * len, FROG.y + Math.sin(a) * len);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function drawBoss(now) {
    const bs = state.boss;
    if (!bs) return;
    const warnPulse = bs.warn ? 0.5 + 0.5 * Math.sin(now / 90) : 0;
    ctx.save();
    ctx.translate(bs.x, bs.y);
    ctx.fillStyle = PAL.tunnel;
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, bs.r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = PAL.accent;
    ctx.beginPath(); ctx.arc(-18, -22, 8, 0, 7); ctx.arc(18, -22, 8, 0, 7); ctx.fill();
    // mouth: dark and shut, or open and glowing while it can be hurt
    ctx.fillStyle = bs.open ? PAL.warn : "#222";
    ctx.beginPath(); ctx.ellipse(0, 8, 17, bs.open ? 13 : 4, 0, 0, 7); ctx.fill();
    if (bs.open) {
      ctx.strokeStyle = PAL.warn;
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(now / 110);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, bs.r + 6, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (bs.flash > 0) { ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.beginPath(); ctx.arc(0, 0, bs.r, 0, 7); ctx.fill(); }
    ctx.restore();
    if (bs.warn) {
      ctx.fillStyle = PAL.warn;
      ctx.globalAlpha = 0.5 + 0.5 * warnPulse;
      ctx.font = "bold 26px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText(WARNINGS[bs.warn.kind], W / 2, 52);
      ctx.globalAlpha = 1;
    }
  }

  function drawFx() {
    for (const f of state.fx) {
      const u = f.age / 800;
      if (f.k === "pop") {
        ctx.fillStyle = f.c === STONE ? "#7b8088" : COLORS[f.c];
        ctx.globalAlpha = 1 - u;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.4;
          const r = 6 + u * 26;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r, 4 * (1 - u * 0.6), 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = 1 - u * u;
        ctx.fillStyle = PAL.text;
        ctx.font = "bold 15px Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText(f.text, f.x, f.y - 10 - u * 26);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawBars() {
    // progress of the level (or the boss's health) as a thin bar along the top
    let share = null;
    let color = PAL.accent;
    if (state.boss) { share = state.boss.hp / state.boss.max; color = PAL.warn; }
    else if (!state.cfg.endless) share = 1 - ((state.cfg.count - state.spawned) + state.balls.length) / state.cfg.count;
    if (share === null) return;
    ctx.fillStyle = PAL.line;
    ctx.fillRect(0, 0, W, 6);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W * clamp(share, 0, 1), 6);
  }

  function overlay(text) {
    ctx.fillStyle = PAL.overlay;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = PAL.text;
    ctx.font = "30px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(text, W / 2, H / 2);
  }

  function draw(now = performance.now()) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = PAL.board;
    ctx.fillRect(0, 0, W, H);
    const t = state.track;
    strokeTrack(0, t.len, D + 14, PAL.groove);
    strokeTrack(0, t.len, D + 2, PAL.lane);
    drawHole(now);
    // orbs from the head back, so each one overlaps the next
    for (const b of state.balls) {
      const p = pointAt(t, b.vs);
      if (p.x < -R || p.x > W + R || p.y < -R || p.y > H + R) continue;
      drawOrb(p.x + b.fx, p.y + b.fy, b.c, b.p);
    }
    for (const [a, z] of state.tunnels) {
      strokeTrack(a, z, D + 18, PAL.tunnel);
      strokeTrack(a, z, D - 2, PAL.groove);
      strokeTrack(a, z, D - 10, PAL.tunnel);
    }
    drawBoss(now);
    drawGuide();
    for (const s of state.shots) drawOrb(s.x, s.y, s.c, null);
    drawFrog(now);
    drawFx();
    drawBars();
    if (banner > 0 && !screenName) {
      ctx.globalAlpha = Math.min(1, banner / 400);
      ctx.fillStyle = PAL.text;
      ctx.font = "bold 28px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText(modeText(), W / 2, 90);
      ctx.globalAlpha = 1;
    }
    if (paused && !screenName && !helpOpen && !state.over) overlay("Paused (P / tap)");
    els.score.textContent = state.score;
    els.best.textContent = state.cfg.endless ? best : (progress.best[levelKey(state.cfg.world, state.cfg.level)] || 0);
  }

  function saveBest() {
    if (current || state.score <= best) return;
    best = state.score;
    try { localStorage.setItem(bestKey, best); } catch (e) { /* storage blocked */ }
  }

  function modeText() {
    if (!current) return "Endless";
    return current.level === BOSS_LEVEL ? `${WORLDS[current.world].boss.name}` : `${WORLDS[current.world].name} · Level ${current.level}`;
  }

  function updateHud() {
    els.levelsBtn.hidden = !current;
    els.mode.textContent = `${modeText()} · ${DIFFICULTIES[current ? current.difficulty : settings.difficulty].name}`;
    root.setAttribute("data-world", current ? WORLDS[current.world].id : "meadow");
    readPalette();
  }

  function startGame(opts) {
    endRound();
    current = opts && { world: opts.world, level: opts.level, difficulty: opts.difficulty || settings.difficulty };
    const cfg = !current ? endlessConfig(settings.difficulty)
      : current.level === BOSS_LEVEL ? bossConfig(current.world, current.difficulty) : levelConfig(current.world, current.level, current.difficulty);
    state = createState(Math.random, cfg);
    finished = false;
    roundStars = 0;
    paused = false;
    banner = 1800;
    closeScreen();
    updateHud();
    startRound();
  }

  function restart() {
    if (current) startGame({ world: current.world, level: current.level, difficulty: current.difficulty });
    else startGame(null);
  }

  // --- Screens: menu, level map, settings and result (rendered into one overlay) ---
  let screenName = null; // "menu" | "worlds" | "result" | "settings"
  let viewWorld = 0;
  let lastResult = null;
  const STAR = "★";
  const NO_STAR = "☆";
  const WORLD_TIPS = [
    "Match three or more. Clear gaps to chain pops.",
    "Tunnels hide the chain: orbs inside cannot be hit.",
    "Grey stones never match. Pop next to them to crack them.",
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

  function openLevels(newest = false) {
    if (newest) {
      viewWorld = 0;
      while (viewWorld + 1 < WORLDS.length && worldUnlocked(progress, viewWorld + 1)) viewWorld++;
    } else if (current) viewWorld = current.world;
    openScreen("worlds");
  }

  const resumable = () => round && !state.over;

  function menuHtml() {
    return `<h2>Orb Chain</h2>
      <p class="sub">Three worlds, ten levels and a boss each.</p>
      <div class="col">
        ${resumable() ? '<button class="main" data-do="resume">Resume</button>' : ""}
        <button class="main" data-do="campaign">Campaign</button>
        <button data-do="endless">Endless</button>
        <button data-do="settings">Settings</button>
        <button data-do="help">How to play</button>
      </div>`;
  }

  const difficultyPicker = () => `<p class="row">${Object.keys(DIFFICULTIES).map((k) => `<button data-difficulty="${k}" aria-pressed="${settings.difficulty === k}">${DIFFICULTIES[k].name}</button>`).join("")}</p>`;

  function settingsHtml() {
    return `<h2>Settings</h2>
      <p class="sub">Difficulty (campaign and endless)</p>
      ${difficultyPicker()}
      <p class="sub" style="margin-top:10px">Easy: slower, fewer colours, long aim guide.<br>Hard: faster, more colours, no guide.</p>
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
      ${difficultyPicker()}
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
    if (r.endless) {
      return `<h2>Endless</h2>
        <p class="sub">Score ${r.score}<br>Best ${best}${r.score >= best && r.score > 0 ? " · new record!" : ""}</p>
        <div class="col">
          <button class="main" data-do="again">Play again</button>
          <button data-do="menu">Menu</button>
        </div>`;
    }
    const boss = r.level === BOSS_LEVEL;
    const name = boss ? WORLDS[r.world].boss.name : `${WORLDS[r.world].name} · Level ${r.level}`;
    let msg;
    if (boss) msg = r.won ? `${WORLDS[r.world].boss.name} falls!${r.opened ? " A new world opens." : ""}` : `${WORLDS[r.world].boss.name} stood its ground.`;
    else if (!r.won) msg = "The chain reached the hole.";
    else if (r.stars < 3) msg = `Keep the chain's head below ${Math.round(state.cfg.starPeaks[r.stars - 1] * 100)}% of the track for another star.`;
    else msg = "Perfect!";
    const next = r.stars > 0 ? nextTarget(r) : null;
    const lockedNote = r.stars === 0 && !boss ? `<p class="sub">Clear the level to open the next one.</p>` : "";
    const hint = r.stars > 0 && !boss && r.level === LEVELS_PER_WORLD && !next ? `<p class="sub">The boss opens at ${BOSS_STARS_NEEDED} ${STAR} in this world.</p>` : "";
    return `<h2>${name}</h2>
      <p class="stars">${STAR.repeat(r.stars)}${NO_STAR.repeat(3 - r.stars)}</p>
      <p class="sub">Score ${r.score}<br>${msg}</p>${hint}${lockedNote}
      <div class="col">
        ${next ? `<button class="main" data-do="next">Next level${next.level === BOSS_LEVEL ? " (boss)" : ""}</button>` : ""}
        <button ${next ? "" : 'class="main"'} data-do="retry">Play this level again</button>
        <button data-do="levels">Levels</button>
      </div>`;
  }

  // The round ended: score it, save progress and show the result.
  function finish() {
    finished = true;
    saveBest();
    if (!current) {
      lastResult = { endless: true, score: state.score };
    } else {
      const stars = current.level === BOSS_LEVEL ? (state.won ? bossStarsFor(state.elapsed, state.cfg) : 0) : starsFor(state);
      const opened = recordResult(progress, current.world, current.level, stars, state.score);
      saveProgress();
      roundStars = stars;
      lastResult = { difficulty: current.difficulty, world: current.world, level: current.level, stars, score: state.score, won: state.won, opened };
    }
    endRound();
    const shown = state;
    setTimeout(() => { if (state === shown && !screenName) openScreen("result"); }, state.won ? 900 : 1300); // let the last frame sink in
  }

  els.card.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.difficulty) { settings.difficulty = b.dataset.difficulty; applySettings(); openScreen(screenName); }
    else if (b.dataset.level) startGame({ world: viewWorld, level: Number(b.dataset.level), difficulty: settings.difficulty });
    else if (b.dataset.world) { viewWorld += Number(b.dataset.world); openScreen("worlds"); }
    else if (b.dataset.do === "resume") { closeScreen(); paused = false; }
    else if (b.dataset.do === "campaign") openLevels(true); // newest open world, not the one last played
    else if (b.dataset.do === "endless" || b.dataset.do === "again") startGame(null);
    else if (b.dataset.do === "settings") openScreen("settings");
    else if (b.dataset.do === "help") showHelp();
    else if (b.dataset.do === "menu") openScreen("menu");
    else if (b.dataset.do === "levels") { viewWorld = lastResult.world; openScreen("worlds"); }
    else if (b.dataset.do === "retry") startGame({ world: lastResult.world, level: lastResult.level, difficulty: lastResult.difficulty });
    else if (b.dataset.do === "next") startGame({ ...nextTarget(lastResult), difficulty: lastResult.difficulty });
  });

  // --- Input ---
  function togglePause() {
    if (!state.over) paused = !paused;
  }

  const held = new Set();
  const AIM_SPEED = 2.4; // rad/s with the arrow keys
  const isFiring = () => !paused && !state.over && !screenName;

  document.addEventListener("keydown", (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (helpHandleKey(e, key)) return;
    if (screenName) { // buttons in the overlay handle Enter / Space themselves
      if (key === "Escape") {
        if (screenName === "worlds" || screenName === "settings") openScreen("menu");
        else if (screenName === "result") {
          if (lastResult.endless) openScreen("menu");
          else { viewWorld = lastResult.world; openScreen("worlds"); }
        } else if (resumable()) { closeScreen(); paused = false; }
        e.preventDefault();
      }
      return;
    }
    if (key === "Escape") { openScreen("menu"); e.preventDefault(); return; }
    if (key === "r") { if (!state.over) restart(); else if (finished) openScreen("result"); }
    else if (key === "p" && !state.over) paused = !paused;
    else if (key === "ArrowLeft" || key === "a" || key === "ArrowRight" || key === "d") held.add(key.toLowerCase());
    else if (isFiring() && (key === " " || key === "ArrowUp" || key === "w")) { if (!e.repeat) fire(state); }
    else if (isFiring() && (key === "q" || key === "ArrowDown" || key === "s" || key === "e")) { if (!e.repeat) swap(state); }
    else return;
    e.preventDefault();
    saveBest();
  });
  document.addEventListener("keyup", (e) => held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase()));
  window.addEventListener("blur", () => held.clear());

  const toBoard = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
  };
  const onFrog = (p) => Math.hypot(p.x - FROG.x, p.y - FROG.y) < 34;

  // Mouse: the pointer aims, click shoots, right-click or a click on the frog swaps.
  // Touch: dragging aims, letting go shoots; a tap on the frog swaps.
  let touch = null;
  canvas.addEventListener("pointermove", (e) => {
    if (paused || state.over) return;
    if (e.pointerType === "mouse" || (touch && touch.id === e.pointerId)) { const p = toBoard(e); if (!onFrog(p) || touch) aimAt(state, p.x, p.y); }
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (state.over) {
      if (finished && !screenName) openScreen("result");
      return;
    }
    if (paused) { if (!screenName && !helpOpen) paused = false; return; }
    const p = toBoard(e);
    if (e.pointerType === "mouse") {
      if (e.button === 2 || onFrog(p)) swap(state);
      else { aimAt(state, p.x, p.y); fire(state); }
      return;
    }
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    touch = { id: e.pointerId, frog: onFrog(p), moved: false, x: e.clientX, y: e.clientY };
    if (!touch.frog) aimAt(state, p.x, p.y);
  });
  function endTouch(e) {
    if (!touch || e.pointerId !== touch.id) return;
    const t = touch;
    touch = null;
    if (e.type === "pointercancel" || paused || state.over) return;
    if (t.frog) { swap(state); return; }
    const p = toBoard(e);
    aimAt(state, p.x, p.y);
    fire(state);
  }
  canvas.addEventListener("pointerup", endTouch);
  canvas.addEventListener("pointercancel", endTouch);
  // No long-press menu or text selection while playing; right-click is the swap.
  document.querySelector("main").addEventListener("contextmenu", (e) => e.preventDefault());
  document.getElementById("btn-swap").addEventListener("click", () => { if (isFiring()) swap(state); });
  document.getElementById("btn-pause").addEventListener("click", togglePause);
  document.getElementById("btn-restart").addEventListener("click", () => { if (!screenName) restart(); });
  els.levelsBtn.addEventListener("click", () => { if (!screenName) openLevels(); });
  document.getElementById("btn-menu").addEventListener("click", () => { if (!screenName) openScreen("menu"); });
  window.addEventListener("pagehide", endRound);
  document.addEventListener("visibilitychange", () => { if (document.hidden && !state.over) paused = true; });

  function frame(now) {
    const dt = Math.min(now - last, 100);
    last = now;
    if (!paused && !state.over) {
      if (round) round.active += dt;
      banner = Math.max(0, banner - dt);
      const dir = (held.has("arrowright") || held.has("d") ? 1 : 0) - (held.has("arrowleft") || held.has("a") ? 1 : 0);
      if (dir) turn(state, dir * AIM_SPEED * (dt / 1000));
      advance(state, dt);
    } else if (state.over) advance(state, dt); // effects and the chain's last run into the hole
    if (state.over && !finished) finish();
    saveBest();
    draw(now);
    requestAnimationFrame(frame);
  }
  updateHud();
  openScreen("menu");
  try { if (localStorage.getItem(helpKey) !== "1") showHelp(); } catch (e) { showHelp(); } // first visit
  requestAnimationFrame(frame);
}
