const test = require("node:test");
const assert = require("node:assert");
const g = require("../game.js");

const seeded = () => {
  let s = 7;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
};

const STOCK = () => ({ undo: 5, hint: 5, shuffle: 5, slot: 0 });

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

test("undo restores the last pick (also after a match and after losing) and costs one from the stock", () => {
  const s = g.createState(1, seeded(), 0, "medium", { undo: 2, hint: 0, shuffle: 0 });
  s.tiles = [0, 1, 2, 3, 4, 5].map((i) => ({ id: i, type: i < 3 ? 0 : 1, x: i * 2, y: 0, z: 0 }));
  g.pick(s, 0); g.pick(s, 1); g.pick(s, 2);
  assert.ok(g.undo(s));
  assert.strictEqual(s.tray.length, 2);
  assert.strictEqual(s.score, 0);
  assert.strictEqual(s.tiles.length, 4);
  assert.strictEqual(s.stock.undo, 1);
  assert.strictEqual(g.undo(s), false); // nothing to take back twice in a row
  const l = g.createState(1, seeded(), 0, "medium", STOCK());
  l.tiles = Array.from({ length: 9 }, (_, i) => ({ id: i, type: i % 8, x: (i % 6) * 2, y: Math.floor(i / 6) * 2, z: 0 }));
  for (let i = 0; i < 7; i++) g.pick(l, i);
  assert.ok(g.undo(l));
  assert.strictEqual(l.over, false);
  assert.strictEqual(l.tray.length, 6);
});

test("shuffle keeps the tile multiset and is used up with the stock", () => {
  const s = g.createState(6, seeded(), 0, "medium", { undo: 0, hint: 0, shuffle: 1 });
  const before = s.tiles.map((t) => t.type).sort();
  assert.ok(g.shuffleBoard(s));
  assert.deepStrictEqual(s.tiles.map((t) => t.type).sort(), before);
  assert.strictEqual(g.shuffleBoard(s), false);
});

test("hint suggests a free tile that completes a tray pair, and is used up", () => {
  const s = g.createState(1, seeded(), 0, "medium", { undo: 0, hint: 1, shuffle: 0 });
  s.tiles = [
    { id: 0, type: 0, x: 0, y: 0, z: 0 }, { id: 1, type: 0, x: 2, y: 0, z: 0 }, { id: 2, type: 0, x: 4, y: 0, z: 0 },
    { id: 3, type: 1, x: 6, y: 0, z: 0 }, { id: 4, type: 1, x: 8, y: 0, z: 0 }, { id: 5, type: 1, x: 10, y: 0, z: 0 },
  ];
  g.pick(s, 3); g.pick(s, 4);
  const h = g.hint(s);
  assert.strictEqual(h.id, 5);
  assert.strictEqual(s.stock.hint, 0);
  assert.strictEqual(g.hint(s), null);
});

test("hint only suggests free tiles", () => {
  const s = g.createState(8, seeded(), 0, "medium", STOCK());
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

test("difficulty changes only the density: tile kinds stay, tiles and layers grow with the difficulty", () => {
  const ids = g.DIFFICULTIES.map((d) => d.id);
  assert.deepStrictEqual(ids, ["easy", "medium", "hard", "extreme"]);
  for (const l of [1, 10, 25, 50, 51, 100, 200, 300]) {
    const ps = ids.map((d) => g.levelParams(l, d));
    for (let i = 1; i < ps.length; i++) {
      assert.ok(ps[i].count >= ps[i - 1].count && ps[i].layers >= ps[i - 1].layers, `level ${l}`);
      assert.strictEqual(ps[i].types, ps[0].types);
    }
    assert.ok(ps[3].count > ps[0].count, `level ${l}`);
  }
  assert.deepStrictEqual(g.levelParams(7), g.levelParams(7, "medium"));
});

test("every level can be generated on every difficulty", () => {
  for (const { id } of g.DIFFICULTIES) {
    for (let l = 1; l <= g.LEVELS; l += 7) {
      const tiles = g.generateLevel(l, id);
      const p = g.levelParams(l, id);
      assert.strictEqual(tiles.length % 3, 0, `${id} ${l}`);
      assert.ok(tiles.length >= 9 && tiles.length <= g.difficultyOf(id).max, `${id} ${l}: ${tiles.length}`);
      assert.ok(tiles.every((t) => t.type < p.types && t.z < p.layers), `${id} ${l}`);
      const counts = {};
      for (const t of tiles) counts[t.type] = (counts[t.type] || 0) + 1;
      assert.ok(Object.values(counts).every((c) => c % 3 === 0), `${id} ${l}`);
    }
  }
  assert.strictEqual(g.createState(5, seeded(), 0, "hard").difficulty, "hard");
  assert.deepStrictEqual(g.generateLevel(5, "hard"), g.generateLevel(5, "hard"));
});

// Boards with `sets` full triples of consecutive types in a row (all free), ids 3t..3t+2 have type t.
const sets = (n, stock, random = seeded()) => {
  const s = g.createState(1, random, 0, "medium", stock);
  s.tiles = Array.from({ length: n * 3 }, (_, i) => ({ id: i, type: Math.floor(i / 3), x: (i % 6) * 2, y: Math.floor(i / 6) * 2, z: 0 }));
  return s;
};

test("without a stock there are no powerups; the stock has no cap", () => {
  const none = g.createState(8, seeded());
  assert.deepStrictEqual(none.stock, { undo: 0, hint: 0, shuffle: 0, slot: 0 });
  assert.strictEqual(g.hint(none), null);
  assert.strictEqual(g.shuffleBoard(none), false);
  const s = g.createState(8, seeded(), 0, "medium", { undo: 0, hint: 2, shuffle: 25 });
  assert.ok(g.hint(s)); assert.ok(g.hint(s));
  assert.strictEqual(s.stock.hint, 0);
  assert.strictEqual(g.hint(s), null);
  assert.strictEqual(g.available(s, "shuffle"), 25);
});

test("three clean triples in a row can earn a powerup, a messy triple resets the series", () => {
  const s = sets(3, undefined, () => 0); // random() = 0 always wins the 50 % chance
  for (let t = 0; t < 3; t++) {
    for (let k = 0; k < 3; k++) {
      const res = g.pick(s, t * 3 + k);
      if (k === 2) assert.strictEqual(res.clean, true);
      if (t < 2) assert.strictEqual(res.awards.length, 0);
      else if (k === 2) assert.strictEqual(res.awards.length, 1);
    }
    if (t < 2) assert.strictEqual(s.streak, t + 1);
  }
  assert.strictEqual(s.streak, 0);
  assert.strictEqual(g.KINDS.reduce((n, k) => n + s.stock[k], 0), 1);

  const m = sets(2, undefined, () => 0);
  g.pick(m, 0); g.pick(m, 1); g.pick(m, 2); // clean
  assert.strictEqual(m.streak, 1);
  g.pick(m, 3); g.pick(m, 0 + 100); // 100 does not exist (ignored)
  g.pick(m, 4); g.pick(m, 5);
  assert.strictEqual(m.streak, 2);
  const x = sets(2, undefined, () => 0);
  g.pick(x, 0); g.pick(x, 3); g.pick(x, 1); const r = g.pick(x, 2); // other tile in between
  assert.strictEqual(r.clean, false);
  assert.strictEqual(x.streak, 0);
});

test("the series chance is a coin flip: no award when the roll fails", () => {
  const s = sets(3, undefined, () => 0.99);
  for (let i = 0; i < 9; i++) g.pick(s, i);
  assert.strictEqual(g.KINDS.reduce((n, k) => n + s.stock[k], 0), 0);
  assert.strictEqual(s.streak, 0);
});

test("undo also takes back the series progress", () => {
  const s = sets(2, { undo: 3, hint: 0, shuffle: 0 }, () => 0);
  g.pick(s, 0); g.pick(s, 1); g.pick(s, 2);
  assert.strictEqual(s.streak, 1);
  g.pick(s, 3);
  assert.ok(g.undo(s));
  assert.strictEqual(g.undo(s), false); // only the last pick can be taken back
  assert.strictEqual(s.streak, 1);
  g.pick(s, 3); g.pick(s, 4); g.pick(s, 5);
  assert.strictEqual(s.streak, 2);
});

test("powerup kinds are weighted from common to rare", () => {
  assert.strictEqual(g.pickPowerup(() => 0), "undo");
  assert.strictEqual(g.pickPowerup(() => 0.8), "shuffle");
  assert.strictEqual(g.pickPowerup(() => 0.99), "slot");
  assert.deepStrictEqual(g.KINDS, ["undo", "hint", "shuffle", "slot"]);
});

test("every difficulty starts with 2 undo, 2 hint, 1 shuffle and no +1", () => {
  assert.deepStrictEqual(g.startStock(), { undo: 2, hint: 2, shuffle: 1, slot: 0 });
  assert.notStrictEqual(g.startStock(), g.startStock()); // a fresh copy each time
});

test("+1 adds a tray slot once per level and can rescue a full tray", () => {
  const s = g.createState(1, seeded(), 0, "medium", { undo: 0, hint: 0, shuffle: 0, slot: 3 });
  s.tiles = Array.from({ length: 12 }, (_, i) => ({ id: i, type: i % 9, x: (i % 6) * 2, y: Math.floor(i / 6) * 2, z: 0 }));
  assert.strictEqual(s.cap, g.TRAY);
  for (let i = 0; i < 7; i++) g.pick(s, i);
  assert.strictEqual(s.over, true);
  assert.ok(g.addSlot(s));
  assert.strictEqual(s.cap, g.TRAY + 1);
  assert.strictEqual(s.over, false);
  assert.strictEqual(s.stock.slot, 2);
  assert.strictEqual(g.addSlot(s), false); // once per level
  assert.ok(g.pick(s, 7)); // the 8th slot is usable
  assert.strictEqual(s.tray.length, 8);
  assert.strictEqual(s.over, true);
  assert.strictEqual(g.addSlot(g.createState(1, seeded())), false); // none in stock
});
