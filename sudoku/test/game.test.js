const test = require("node:test");
const assert = require("node:assert");
const g = require("../game.js");

const seeded = (seed = 7) => {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
};

const PUZZLE = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

const clues = (p) => [...p].filter((c) => c !== "0").length;

test("the solver finds the solution and counts solutions", () => {
  assert.strictEqual(g.core.solve(PUZZLE), SOLUTION);
  assert.strictEqual(g.core.countSolutions(PUZZLE, 2), 1);
  assert.strictEqual(g.core.countSolutions("0".repeat(81), 2), 2); // an empty grid has many
  assert.strictEqual(g.core.solve("11" + "0".repeat(79)), null); // two equal digits in a row
});

test("the grader rates the classic example as singles only", () => {
  const r = g.core.grade(PUZZLE);
  assert.deepStrictEqual({ rank: r.rank, solved: r.solved, grid: r.grid }, { rank: 1, solved: true, grid: SOLUTION });
});

test("the grader needs more than singles for a hard puzzle", () => {
  // Needs locked candidates / pairs (generated and graded, then pinned here).
  const p = g.core.generate("hard", seeded(3));
  assert.strictEqual(g.core.grade(p).rank, 2);
});

for (const d of ["easy", "medium", "hard", "extreme"]) {
  test(`${d}: generated puzzles are unique, in the clue band and graded as asked`, () => {
    const random = seeded(d.length * 11);
    const cfg = g.core.LEVELS[d];
    for (let n = 0; n < 5; n++) {
      const p = g.core.generate(d, random);
      assert.strictEqual(p.length, 81);
      assert.strictEqual(g.core.countSolutions(p, 2), 1);
      assert.ok(clues(p) >= cfg.clues[0] && clues(p) <= cfg.clues[1], `${clues(p)} clues`);
      const { rank, solved, grid } = g.core.grade(p);
      assert.ok(solved, "the logic solver must finish: no guessing needed");
      assert.strictEqual(grid, g.core.solve(p), "the techniques only make sound steps");
      assert.ok(rank >= cfg.rank[0] && rank <= cfg.rank[1], `rank ${rank}`);
    }
  });
}

test("extreme puzzles are solved by logic, and some need the advanced techniques", () => {
  const random = seeded(99);
  const ranks = new Set();
  for (let n = 0; n < 12; n++) {
    const p = g.core.generate("extreme", random);
    const r = g.core.grade(p);
    assert.ok(r.solved);
    assert.strictEqual(r.grid, g.core.solve(p));
    ranks.add(r.rank);
  }
  assert.ok(!ranks.has(5));
  assert.ok(ranks.has(3) || ranks.has(4));
});

test("generate gives up after the attempt limit instead of looping", () => {
  assert.strictEqual(g.core.generate("extreme", seeded(1), 0), null);
});

test("generation is deterministic for a seeded random", () => {
  assert.strictEqual(g.core.generate("easy", seeded(5)), g.core.generate("easy", seeded(5)));
});

test("setValue, erase and the same digit twice", () => {
  const s = g.createGame(PUZZLE, "easy");
  const empty = s.cells.indexOf(0);
  assert.ok(g.setValue(s, empty, s.solution[empty]));
  assert.ok(g.setValue(s, empty, s.solution[empty])); // again: erases
  assert.strictEqual(s.cells[empty], 0);
  const wrong = (s.solution[empty] % 9) + 1;
  g.setValue(s, empty, wrong);
  assert.strictEqual(s.cells[empty], wrong); // a wrong digit is accepted
  assert.ok(g.erase(s, empty));
  assert.strictEqual(s.cells[empty], 0);
});

test("givens cannot be changed", () => {
  const s = g.createGame(PUZZLE, "easy");
  const given = s.cells.findIndex((v) => v !== 0);
  assert.strictEqual(g.setValue(s, given, 1), false);
  assert.strictEqual(g.erase(s, given), false);
  assert.strictEqual(g.toggleNote(s, given, 1), false);
});

test("notes toggle, count, and leave the peers when the digit is placed", () => {
  const s = g.createGame(PUZZLE, "easy");
  const a = s.cells.indexOf(0);
  const peer = g.core.PEERS[a].find((p) => s.cells[p] === 0);
  const d = s.solution[a];
  assert.ok(g.toggleNote(s, a, 4));
  assert.strictEqual(s.notes[a], 1 << 3);
  assert.ok(g.toggleNote(s, a, 4));
  assert.strictEqual(s.notes[a], 0);
  g.toggleNote(s, peer, d);
  g.toggleNote(s, a, d);
  assert.strictEqual(s.notesUsed, 4);
  g.setValue(s, a, d);
  assert.strictEqual(s.notes[a], 0);
  assert.strictEqual(s.notes[peer] & (1 << (d - 1)), 0);
  assert.strictEqual(g.toggleNote(s, a, 1), false); // a filled cell takes no notes
});

test("undo restores digits and notes", () => {
  const s = g.createGame(PUZZLE, "easy");
  const a = s.cells.indexOf(0);
  const peer = g.core.PEERS[a].find((p) => s.cells[p] === 0);
  const d = s.solution[a];
  g.toggleNote(s, peer, d);
  g.setValue(s, a, d);
  assert.strictEqual(s.notes[peer] & (1 << (d - 1)), 0);
  assert.ok(g.undo(s));
  assert.strictEqual(s.cells[a], 0);
  assert.ok(s.notes[peer] & (1 << (d - 1)));
  assert.ok(g.undo(s));
  assert.strictEqual(s.notes[peer], 0);
  assert.strictEqual(g.undo(s), false);
  assert.strictEqual(s.undos, 2);
});

test("hint fills the selected empty or wrong cell, else any open cell", () => {
  const s = g.createGame(PUZZLE, "easy");
  const empties = s.cells.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
  assert.strictEqual(g.hint(s, empties[3]), empties[3]);
  assert.strictEqual(s.cells[empties[3]], s.solution[empties[3]]);
  const other = g.hint(s, empties[3], seeded()); // selected is done: some other open cell
  assert.notStrictEqual(other, empties[3]);
  assert.strictEqual(s.hints, 2);
  g.setValue(s, empties[5], (s.solution[empties[5]] % 9) + 1); // a wrong digit
  assert.strictEqual(g.hint(s, empties[5]), empties[5]);
  assert.strictEqual(s.cells[empties[5]], s.solution[empties[5]]);
});

test("finishing the grid wins, and a won game is locked", () => {
  const s = g.createGame(PUZZLE, "easy");
  for (let i = 0; i < 81; i++) if (!s.givens[i]) g.setValue(s, i, s.solution[i]);
  assert.ok(s.won);
  const i = s.givens.indexOf(false);
  assert.strictEqual(g.setValue(s, i, 1), false);
  assert.strictEqual(g.undo(s), false);
});

test("remaining counts every placed digit, wrong ones too", () => {
  const s = g.createGame(PUZZLE, "easy");
  const before = g.remaining(s, 4);
  const i = s.solution.findIndex((v, k) => v === 4 && !s.givens[k]);
  g.setValue(s, i, 4);
  assert.strictEqual(g.remaining(s, 4), before - 1);
  const j = s.cells.findIndex((v, k) => v === 0 && s.solution[k] !== 4);
  g.setValue(s, j, 4); // wrong
  assert.strictEqual(g.remaining(s, 4), before - 2);
});

test("a game survives serialize / restore", () => {
  const s = g.createGame(PUZZLE, "hard");
  const a = s.cells.indexOf(0);
  g.setValue(s, a, s.solution[a]);
  g.toggleNote(s, s.cells.indexOf(0), 2);
  const r = g.restore(JSON.parse(JSON.stringify(g.serialize(s))));
  assert.deepStrictEqual(r.cells, s.cells);
  assert.deepStrictEqual(r.notes, s.notes);
  assert.strictEqual(r.difficulty, "hard");
  assert.strictEqual(g.restore({ puzzle: "123" }), null);
  assert.strictEqual(g.restore(null), null);
});

test("formatTime", () => {
  assert.strictEqual(g.formatTime(0), "0:00");
  assert.strictEqual(g.formatTime(65000), "1:05");
  assert.strictEqual(g.formatTime(3600000), "60:00");
});
