const test = require("node:test");
const assert = require("node:assert");
const g = require("../game.js");

const seeded = () => {
  let s = 7;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
};

// Picks any free tile of the given type (or any type when omitted).
const free = (s, type) => s.tiles.find((t) => g.isFree(s.tiles, t) && (type === undefined || t.type === type));

test("levels are deterministic, sized in triples, and every type count divides by 3", () => {
  for (const level of [1, 2, 5, 12, 30, 80]) {
    const a = g.generateLevel(level);
    assert.deepStrictEqual(a, g.generateLevel(level));
    assert.strictEqual(a.length % 3, 0);
    const counts = {};
    for (const t of a) counts[t.type] = (counts[t.type] || 0) + 1;
    for (const c of Object.values(counts)) assert.strictEqual(c % 3, 0);
    assert.ok(Object.keys(counts).length <= g.levelParams(level).types);
  }
});

test("no two tiles share a position on the same layer or overlap on one layer", () => {
  const a = g.generateLevel(40);
  for (const t of a) for (const o of a) {
    if (t !== o && t.z === o.z) assert.ok(Math.abs(t.x - o.x) >= 2 || Math.abs(t.y - o.y) >= 2);
  }
});

test("a covered tile cannot be picked, a free one can", () => {
  const s = g.createState(4, seeded());
  s.tiles = [
    { id: 0, type: 0, x: 0, y: 0, z: 0 }, { id: 1, type: 0, x: 1, y: 1, z: 1 }, { id: 2, type: 0, x: 6, y: 0, z: 0 },
  ];
  assert.strictEqual(g.pick(s, 0), null); // covered by tile 1
  assert.ok(g.pick(s, 1));
  assert.ok(g.pick(s, 0)); // free now
  assert.strictEqual(g.pick(s, 1), null); // already taken
  assert.strictEqual(s.tray.length, 2);
});

test("equal tiles are grouped in the tray", () => {
  const s = g.createState(1, seeded());
  s.tiles = [
    { id: 1, type: 0, x: 0, y: 0, z: 0 }, { id: 2, type: 1, x: 2, y: 0, z: 0 }, { id: 3, type: 0, x: 4, y: 0, z: 0 },
    { id: 4, type: 1, x: 6, y: 0, z: 0 }, { id: 5, type: 0, x: 8, y: 0, z: 0 }, { id: 6, type: 1, x: 10, y: 0, z: 0 },
  ];
  g.pick(s, 1); g.pick(s, 2); g.pick(s, 3);
  assert.deepStrictEqual(s.tray.map((t) => t.type), [0, 0, 1]);
});

test("three equal tiles vanish and score 10", () => {
  const s = g.createState(1, seeded());
  s.tiles = [0, 1, 2, 3, 4, 5].map((i) => ({ id: i, type: i < 3 ? 0 : 1, x: i * 2, y: 0, z: 0 }));
  g.pick(s, 0); g.pick(s, 1);
  const res = g.pick(s, 2);
  assert.strictEqual(res.matched.length, 3);
  assert.strictEqual(s.tray.length, 0);
  assert.strictEqual(s.score, 10);
});

test("generated boards are solvable: some order of triples clears them", () => {
  // Removes `need` more tiles of one type (any free ones, trying every choice), then continues with the rest.
  const take = (tiles, type, need) => {
    if (need === 0) return solve(tiles);
    return tiles.some((t) => t.type === type && g.isFree(tiles, t) && take(tiles.filter((x) => x !== t), type, need - 1));
  };
  const solve = (tiles) => {
    if (tiles.length === 0) return true;
    const types = new Set(tiles.filter((t) => g.isFree(tiles, t)).map((t) => t.type));
    return [...types].some((type) => take(tiles, type, 3));
  };
  for (const level of [1, 2]) assert.ok(solve(g.generateLevel(level)), `level ${level}`);
});

test("clearing the board wins with a bonus", () => {
  const s = g.createState(1, seeded());
  s.tiles = [0, 1, 2].map((i) => ({ id: i, type: 3, x: i * 2, y: 0, z: 0 }));
  for (let i = 0; i < 3; i++) g.pick(s, i);
  assert.strictEqual(s.won, true);
  assert.strictEqual(s.score, 60);
  assert.strictEqual(g.pick(s, 0), null);
});

test("a full tray without a match ends the level", () => {
  const s = g.createState(1, seeded());
  s.tiles = Array.from({ length: 9 }, (_, i) => ({ id: i, type: i % 8, x: (i % 6) * 2, y: Math.floor(i / 6) * 2, z: 0 }));
  for (let i = 0; i < 7; i++) g.pick(s, i);
  assert.strictEqual(s.over, true);
  assert.strictEqual(g.pick(s, 7), null);
});

test("undo restores the last pick (also after a match and after losing), limited uses", () => {
  const s = g.createState(1, seeded());
  s.tiles = [0, 1, 2, 3, 4, 5].map((i) => ({ id: i, type: i < 3 ? 0 : 1, x: i * 2, y: 0, z: 0 }));
  g.pick(s, 0); g.pick(s, 1); g.pick(s, 2);
  assert.ok(g.undo(s));
  assert.strictEqual(s.tray.length, 2);
  assert.strictEqual(s.score, 0);
  assert.strictEqual(s.tiles.length, 4);
  assert.strictEqual(g.undo(s), false); // nothing to take back twice in a row
  const l = g.createState(1, seeded());
  l.tiles = Array.from({ length: 9 }, (_, i) => ({ id: i, type: i % 8, x: (i % 6) * 2, y: Math.floor(i / 6) * 2, z: 0 }));
  for (let i = 0; i < 7; i++) g.pick(l, i);
  assert.ok(g.undo(l));
  assert.strictEqual(l.over, false);
  assert.strictEqual(l.tray.length, 6);
});

test("shuffle keeps the tile multiset and is used up after one use", () => {
  const s = g.createState(6, seeded());
  const before = s.tiles.map((t) => t.type).sort();
  assert.ok(g.shuffleBoard(s));
  assert.deepStrictEqual(s.tiles.map((t) => t.type).sort(), before);
  assert.strictEqual(g.shuffleBoard(s), false);
});

test("hint suggests a free tile that completes a tray pair, and is used up", () => {
  const s = g.createState(1, seeded());
  s.tiles = [
    { id: 0, type: 0, x: 0, y: 0, z: 0 }, { id: 1, type: 0, x: 2, y: 0, z: 0 }, { id: 2, type: 0, x: 4, y: 0, z: 0 },
    { id: 3, type: 1, x: 6, y: 0, z: 0 }, { id: 4, type: 1, x: 8, y: 0, z: 0 }, { id: 5, type: 1, x: 10, y: 0, z: 0 },
  ];
  g.pick(s, 3); g.pick(s, 4);
  const h = g.hint(s);
  assert.strictEqual(h.id, 5);
  assert.strictEqual(s.hints, 0);
  assert.strictEqual(g.hint(s), null);
});

test("hint only suggests free tiles", () => {
  const s = g.createState(8, seeded());
  const h = g.hint(s);
  assert.ok(g.isFree(s.tiles, h));
});

test("worlds have 50 levels, the first level of each world is always open, others need the one before", () => {
  assert.strictEqual(g.LEVELS, g.WORLD_SIZE * g.WORLDS);
  assert.deepStrictEqual(g.worldOf(1), { world: 1, index: 1 });
  assert.deepStrictEqual(g.worldOf(50), { world: 1, index: 50 });
  assert.deepStrictEqual(g.worldOf(51), { world: 2, index: 1 });
  const none = new Set();
  for (let w = 0; w < g.WORLDS; w++) assert.ok(g.isUnlocked(w * 50 + 1, none), `world ${w + 1}`);
  assert.strictEqual(g.isUnlocked(2, none), false);
  assert.strictEqual(g.isUnlocked(52, none), false);
  assert.ok(g.isUnlocked(2, new Set([1])));
  assert.ok(g.isUnlocked(52, new Set([51])));
  assert.strictEqual(g.isUnlocked(51, new Set()), true);
  assert.strictEqual(g.isUnlocked(g.LEVELS + 1, new Set([g.LEVELS])), false);
  assert.strictEqual(g.WORLD_NAMES.length, g.WORLDS);
});

test("levels get harder: tiles and layers never shrink, new tile kinds appear over time", () => {
  let prev = g.levelParams(1);
  assert.strictEqual(prev.types, 4);
  for (let l = 2; l <= g.LEVELS; l++) {
    const p = g.levelParams(l);
    assert.ok(p.count >= prev.count && p.types >= prev.types && p.layers >= prev.layers, `level ${l}`);
    if (p.types > prev.types) assert.strictEqual(g.tileUnlockLevel(p.types - 1), l);
    prev = p;
  }
  assert.strictEqual(prev.types, g.TYPES);
  assert.ok(g.levelParams(11).types > g.levelParams(10).types);
});

test("every level of every world can be generated, in triples, with its tile kinds", () => {
  for (let l = 1; l <= g.LEVELS; l++) {
    const tiles = g.generateLevel(l);
    const p = g.levelParams(l);
    assert.strictEqual(tiles.length % 3, 0, `level ${l}`);
    assert.ok(tiles.length >= 12 && tiles.length <= 105, `level ${l}: ${tiles.length}`);
    assert.ok(tiles.every((t) => t.type < p.types), `level ${l}`);
    const counts = {};
    for (const t of tiles) counts[t.type] = (counts[t.type] || 0) + 1;
    assert.ok(Object.values(counts).every((c) => c % 3 === 0), `level ${l}`);
  }
});
