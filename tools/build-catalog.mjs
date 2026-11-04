#!/usr/bin/env node
// Builds the release assets: one <id>.zip per game and a kit catalog (catalog.tar.gz + .sha256).
// Usage: node tools/build-catalog.mjs --tag v0.1.0 [--repo owner/name] [--out dist] [--base-url URL]
// Needs the `zip` and `tar` commands. No npm dependencies.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { root, parseYaml, listGames } from "./lib.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
if (!args.tag) {
  console.error("usage: build-catalog.mjs --tag <tag> [--repo owner/name] [--out dir] [--base-url url]");
  process.exit(2);
}
const repo = args.repo ?? "TetrisIQ/blackout-games";
const out = resolve(args.out ?? join(root, "dist"));
const baseUrl = args["base-url"] ?? `https://github.com/${repo}/releases/download/${args.tag}`;
const catalog = join(out, "catalog");

const q = (s) => JSON.stringify(s); // JSON strings are valid YAML double-quoted scalars
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

rmSync(out, { recursive: true, force: true });
mkdirSync(join(catalog, "games"), { recursive: true });

for (const id of listGames()) {
  const dir = join(root, id);
  const meta = parseYaml(readFileSync(join(dir, "game.yaml"), "utf8"));
  const zip = join(out, `${id}.zip`);
  // Zip root = game files, so kit unpacks them straight into <data>/media/games/<id>/.
  execFileSync("zip", ["-X", "-r", "-q", zip, ".", "-x", "test/*"], { cwd: dir });
  const manifest = [
    `id: ${id}`,
    `name: ${q(meta.title)}`,
    `description: ${q(meta.description)}`,
    "category: games",
    "type: files",
    "source:",
    `  url: ${q(`${baseUrl}/${id}.zip`)}`,
    `sha256: ${sha256(zip)}`,
    `size_bytes: ${statSync(zip).size}`,
    "license:",
    `  spdx: ${q(meta.license)}`,
    "content:",
    "  media: games",
    "  extract: zip",
    "",
  ].join("\n");
  writeFileSync(join(catalog, "games", `${id}.yaml`), manifest);
  console.log(`packed ${id}`);
}

writeFileSync(
  join(catalog, "catalog.yaml"),
  [
    "name: blackout-games",
    "description: Simple offline browser games (HTML/JS) for the Emergency Offline Kit.",
    "format: 1",
    "",
  ].join("\n"),
);

const tarball = join(out, "catalog.tar.gz");
execFileSync("tar", ["czf", tarball, "-C", catalog, "catalog.yaml", "games"]);
writeFileSync(`${tarball}.sha256`, `${sha256(tarball)}\n`);
console.log(`catalog: ${tarball}`);
