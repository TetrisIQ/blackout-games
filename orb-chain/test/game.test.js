const test = require("node:test");
const assert = require("node:assert");
const g = require("../game.js");
const { play, seeded } = require("./bot.js");

const ball = (c, s, extra = {}) => ({ c, s, vs: s, p: null, fx: 0, fy: 0, ...extra });

// A state with a hand-made chain: colours from the head, tail behind, touching.
function chain(colors, headS = 600, cfg = null) {
  const s = g.createState(seeded(), cfg || g.levelConfig(0, 1));
  s.intro = false;
  s.spawned = 999;
  s.cfg.count = 999;
  s.balls = colors.map((c, i) => ball(c, headS - i * g.D));
  return s;
}

const aimAtBall = (s, b) => {
  const p = g.pointAt(s.track, b.s);
  g.aimAt(s, p.x, p.y);
};
const run = (s, n = 40) => { for (let i = 0; i < n; i++) g.advance(s, 16); };

test("tracks: constant arc length, inside the board, rings apart", () => {
  for (let w = 0; w < g.WORLDS.length; w++) {
    const cfgs = [g.bossConfig(w)];
    for (let n = 1; n <= g.LEVELS_PER_WORLD; n++) cfgs.push(g.levelConfig(w, n));
    for (const cfg of cfgs) {
      const t = g.makeTrack(cfg.track);
      let minSep = Infinity;
      for (let i = t.lead / g.STEP; i < t.xs.length; i += 3) {
        const r = Math.hypot(t.xs[i] - g.FROG.x, t.ys[i] - g.FROG.y);
        assert.ok(r > 90 && r < 270, `radius ${r} (world ${w} level ${cfg.level})`);
        for (let j = i + 60; j < t.xs.length; j += 3) minSep = Math.min(minSep, Math.hypot(t.xs[i] - t.xs[j], t.ys[i] - t.ys[j]));
      }
      assert.ok(minSep > 1.6 * g.D, `rings ${minSep} px apart (world ${w} level ${cfg.level})`);
      const a = g.pointAt(t, 400);
      const b = g.pointAt(t, 410);
      assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 10) < 0.5);
    }
  }
});

test("the chain enters from outside the board", () => {
  const t = g.makeTrack(g.levelConfig(0, 1).track);
  const p = g.pointAt(t, 0);
  assert.ok(p.x < 0 || p.x > g.W || p.y < 0 || p.y > g.H);
});

test("the feed keeps the chain continuous", () => {
  const s = g.createState(seeded(), g.levelConfig(0, 1));
  for (let i = 0; i < 600; i++) g.advance(s, 16);
  for (let i = 1; i < s.balls.length; i++) assert.ok(s.balls[i - 1].s - s.balls[i].s >= g.D - 0.01);
  assert.ok(s.spawned <= s.cfg.count);
  assert.ok(s.balls.length > 8);
});

test("no spawn makes three in a row", () => {
  const s = g.createState(seeded(3), g.levelConfig(0, 1));
  for (let i = 0; i < 1500; i++) g.advance(s, 16);
  for (let i = 2; i < s.balls.length; i++) assert.ok(!(s.balls[i].c === s.balls[i - 1].c && s.balls[i].c === s.balls[i - 2].c));
});

test("runAt finds the touching run only", () => {
  const s = chain([1, 2, 2, 2, 3]);
  assert.deepStrictEqual(g.runAt(s.balls, 2), [1, 3]);
  s.balls[3].s -= 5; // a gap splits it
  assert.deepStrictEqual(g.runAt(s.balls, 1), [1, 2]);
});

test("a shot that completes three pops them and scores", () => {
  const s = chain([1, 1, 2, 3], 700);
  s.cur = 1;
  aimAtBall(s, s.balls[1]);
  assert.ok(g.fire(s));
  run(s);
  assert.ok(!s.balls.some((b) => b.c === 1), "ones are gone");
  assert.strictEqual(s.score, 30);
});

test("four or more score a bonus", () => {
  const s = chain([1, 1, 1, 2, 3], 700);
  s.cur = 1;
  aimAtBall(s, s.balls[1]);
  g.fire(s);
  run(s);
  assert.strictEqual(s.score, 50); // 4 x 10 + 1 x 10 for the fourth
});

test("a shot of another colour is inserted and pushes the head side forward", () => {
  const s = chain([1, 2, 3, 2], 700);
  s.cur = 1;
  const headBefore = s.balls[0].s;
  aimAtBall(s, s.balls[1]);
  g.fire(s);
  run(s);
  assert.strictEqual(s.balls.length, 5);
  assert.strictEqual(s.balls.filter((b) => b.c === 1).length, 2);
  assert.ok(s.balls[0].s > headBefore, "the head side made room");
  for (let i = 1; i < s.balls.length; i++) assert.ok(s.balls[i - 1].s - s.balls[i].s >= g.D - 0.01);
});

test("after a pop the head side waits and the tail closes the gap; matching colours at the seam chain-react", () => {
  const s = chain([1, 1, 2, 3, 2, 1, 1], 700);
  s.balls.splice(2, 3); // the middle is gone: 1,1 | 1,1
  s.cfg.count = s.spawned = 4;
  const head = s.balls[0].s;
  for (let i = 0; i < 300 && s.balls.length === 4; i++) g.advance(s, 16);
  assert.ok(s.balls.length < 4, "the seam popped");
  assert.ok(s.stats.bestCombo >= 1);
  assert.strictEqual(head, 700);
});

test("a gap with different colours just closes, the head group stands still", () => {
  const s = chain([1, 1, 2, 3], 700);
  s.balls[2].s -= 40;
  s.balls[3].s -= 40;
  s.cfg.count = s.spawned = 4;
  let ticks = 0;
  while (s.balls[1].s - s.balls[2].s > g.D + 0.5 && ticks++ < 400) {
    g.advance(s, 16);
    assert.strictEqual(s.balls[0].s, 700, "the head group stands still while the gap is open");
  }
  assert.ok(ticks < 400, "the gap closed");
  assert.strictEqual(s.balls.length, 4);
});

test("stones do not match, and crack next to a cleared run", () => {
  const s = chain([2, g.STONE, 1, 1, 3], 700);
  s.cur = 1;
  aimAtBall(s, s.balls[3]);
  g.fire(s);
  run(s);
  assert.ok(!s.balls.some((b) => b.c === g.STONE), "stone cracked");
  assert.ok(!s.balls.some((b) => b.c === 1));
  const t = chain([g.STONE, g.STONE, g.STONE]);
  assert.deepStrictEqual(g.runAt(t.balls, 1), [1, 1]);
});

test("power-ups: slow starts a timer, bomb removes neighbours", () => {
  const u = chain([1, 1, 2], 700);
  u.balls[0].p = "slow";
  u.cur = 1;
  aimAtBall(u, u.balls[1]);
  g.fire(u);
  run(u);
  assert.ok(u.slowT > 0);
  const t = chain([5, 4, 1, 1, 2, 3, 4, 5], 700);
  t.balls[2].p = "bomb";
  t.cur = 1;
  aimAtBall(t, t.balls[3]);
  g.fire(t);
  run(t);
  assert.ok(t.balls.length <= 3, `bomb removed neighbours (${t.balls.length} left)`);
  const v = chain([1, 1, 2, 3, 4], 700);
  v.balls[0].p = "back";
  v.cur = 1;
  aimAtBall(v, v.balls[1]);
  g.fire(v);
  run(v, 20);
  assert.ok(v.backT > 0);
  const before = v.balls[0].s;
  run(v, 20);
  assert.ok(v.balls[0].s < before, "the chain rolls back");
});

test("the aim guide finds the first orb on the line", () => {
  const s = chain([1, 2, 3], 700);
  const p = g.pointAt(s.track, 700);
  const ang = Math.atan2(p.y - g.FROG.y, p.x - g.FROG.x);
  const d = g.aimTarget(s, ang);
  assert.ok(d > 50 && d < 400);
  assert.strictEqual(g.aimTarget(s, ang + Math.PI), null);
});

test("fire has a cooldown, swap exchanges the loaded orbs, gone colours are replaced", () => {
  const s = chain([1, 2, 3], 700);
  s.cur = 1;
  s.nxt = 2;
  g.swap(s);
  assert.deepStrictEqual([s.cur, s.nxt], [2, 1]);
  assert.ok(g.fire(s));
  assert.ok(!g.fire(s), "cooling down");
  s.balls = [ball(4, 500)];
  s.cur = 0;
  s.nxt = 0;
  s.cool = 0;
  g.fire(s);
  assert.strictEqual(s.shots[s.shots.length - 1].c, 4);
});

test("orbs inside a tunnel cannot be hit", () => {
  const s = g.createState(seeded(), g.levelConfig(1, 3));
  const [a, b] = s.tunnels[0];
  assert.ok(g.hidden(s, ball(1, (a + b) / 2)));
  assert.ok(!g.hidden(s, ball(1, s.track.lead + 100)));
});

test("a chain that reaches the hole loses; the chain then rushes in", () => {
  const s = chain([1, 2, 3], 0);
  s.balls[0].s = s.track.len - 5;
  g.advance(s, 16);
  assert.ok(s.over && s.lost && !s.won);
  assert.strictEqual(g.starsFor(s), 0);
  run(s, 300);
  assert.strictEqual(s.balls.length, 0);
});

test("clearing the last orb after the feed ended wins; stars follow the peak", () => {
  const s = chain([], 0);
  s.peak = 0.3;
  g.advance(s, 16);
  assert.ok(s.won && s.over);
  assert.strictEqual(g.starsFor(s), 3);
  s.peak = 0.7;
  assert.strictEqual(g.starsFor(s), 2);
  s.peak = 0.99;
  assert.strictEqual(g.starsFor(s), 1);
});

test("level configs grow harder and difficulties scale them", () => {
  for (let w = 0; w < 3; w++) {
    for (let n = 2; n <= g.LEVELS_PER_WORLD; n++) {
      const a = g.levelConfig(w, n - 1);
      const b = g.levelConfig(w, n);
      assert.ok(b.speed >= a.speed && b.count >= a.count && b.colors >= a.colors);
    }
    for (let n = 1; n <= 10; n++) {
      const e = g.levelConfig(w, n, "easy");
      const m = g.levelConfig(w, n, "normal");
      const h = g.levelConfig(w, n, "hard");
      assert.ok(e.speed < m.speed && m.speed < h.speed);
      assert.ok(e.colors <= m.colors && m.colors <= h.colors && e.colors >= 3 && h.colors <= 6);
      assert.ok(e.count < m.count && m.count < h.count);
    }
  }
  assert.strictEqual(g.levelConfig(0, 1, "bogus").difficulty, "normal");
  assert.strictEqual(g.levelConfig(0, 1).tunnels.length, 0);
  assert.strictEqual(g.levelConfig(1, 7).tunnels.length, 2);
  assert.ok(g.levelConfig(2, 5).stone > 0 && g.levelConfig(0, 5).stone === 0);
});

test("boss: a closed mouth shrugs shots off, an open one hurts, no HP ends the fight", () => {
  const s = g.createState(seeded(), g.bossConfig(0));
  const bs = s.boss;
  s.intro = false;
  s.balls = [];
  s.spawned = s.cfg.count = 0;
  const shootBoss = () => {
    s.cool = 0;
    bs.timer = 99999;
    bs.attackIn = 99999;
    g.aimAt(s, bs.x, bs.y);
    g.fire(s);
    run(s, 60);
  };
  bs.open = false;
  shootBoss();
  assert.strictEqual(bs.hp, bs.max);
  bs.open = true;
  shootBoss();
  assert.strictEqual(bs.hp, bs.max - 1);
  bs.hp = 1;
  shootBoss();
  assert.ok(s.won && s.over);
});

test("boss attacks warn first, then rush / freeze / stones apply", () => {
  const s = g.createState(seeded(), g.bossConfig(2));
  s.boss.attackIn = 1;
  s.boss.attacks = ["stones"];
  run(s, 10);
  assert.ok(s.boss.warn, "warned");
  run(s, 120);
  assert.ok(s.stoneQueue > 0 || s.balls.some((b) => b.c === g.STONE), "stones queued or spawned");
  const f = g.createState(seeded(), g.bossConfig(1));
  f.boss.attackIn = 1;
  f.boss.attacks = ["freeze"];
  run(f, 120);
  assert.ok(f.freezeT > 0);
  f.cool = 0;
  assert.strictEqual(g.fire(f), false, "a frozen frog cannot shoot");
  const r = g.createState(seeded(), g.bossConfig(0));
  r.boss.attackIn = 1;
  run(r, 120);
  assert.ok(r.rushT > 0);
});

test("endless: never won, colours grow with time", () => {
  const s = g.createState(seeded(), g.endlessConfig());
  assert.strictEqual(s.cfg.count, Infinity);
  const before = s.colorsNow;
  s.balls = [];
  s.spawned = 0;
  s.elapsed = 120000;
  g.advance(s, 16);
  assert.ok(s.colorsNow > before);
  assert.ok(!s.won);
});

test("progress: stars unlock levels, worlds and bosses", () => {
  const p = g.blankProgress();
  assert.strictEqual(g.unlockedLevel(p, 0), 1);
  assert.strictEqual(g.unlockedLevel(p, 1), 0);
  assert.ok(g.recordResult(p, 0, 1, 2, 500));
  assert.strictEqual(g.unlockedLevel(p, 0), 2);
  assert.ok(!g.recordResult(p, 0, 1, 1, 100), "a worse result unlocks nothing");
  assert.strictEqual(g.starsAt(p, 0, 1), 2);
  for (let n = 2; n <= 10; n++) g.recordResult(p, 0, n, 2, 0);
  assert.ok(g.bossUnlocked(p, 0));
  assert.ok(!g.worldUnlocked(p, 1));
  assert.ok(g.recordResult(p, 0, g.BOSS_LEVEL, 1, 0));
  assert.ok(g.worldUnlocked(p, 1));
  assert.strictEqual(g.bossStarsFor(60000, g.bossConfig(0)), 3);
  assert.strictEqual(g.bossStarsFor(500000, g.bossConfig(0)), 1);
});

test("a bot clears the first level on easy and normal; doing nothing loses", () => {
  for (const d of ["easy", "normal"]) {
    const s = play(g.createState(seeded(11), g.levelConfig(0, 1, d)), 600000);
    assert.ok(s.won, `bot wins Meadow 1 on ${d} (score ${s.score}, peak ${s.peak.toFixed(2)}, orbs ${s.balls.length})`);
  }
  const idle = play(g.createState(seeded(11), g.levelConfig(0, 1)), 600000, { shoot: false });
  assert.ok(idle.over && idle.lost);
});

test("every level ends: the bot wins or loses within ten minutes", () => {
  for (let w = 0; w < 3; w++) {
    for (const n of [1, 5, 10]) {
      const s = play(g.createState(seeded(5 + n), g.levelConfig(w, n)), 600000);
      assert.ok(s.over, `world ${w} level ${n} ended`);
    }
  }
});

test("every boss can be beaten by a shooter that aims at the open mouth", () => {
  for (let w = 0; w < 3; w++) {
    const s = play(g.createState(seeded(3), g.bossConfig(w)), 600000, { every: 650, noise: 0.05 });
    assert.ok(s.won, `boss ${w} falls (hp left ${s.boss.hp})`);
    assert.ok(g.bossStarsFor(s.elapsed, s.cfg) >= 1);
  }
});
