#!/usr/bin/env node
// Builds the release assets: one reproducible <id>.zip per game and a kit catalog (catalog.tar.gz + .sha256).
// Usage: node tools/build-catalog.mjs --tag v0.1.0 [--repo owner/name] [--out dir] [--verify]
// --verify (release): the catalog committed in this repository (catalog.yaml, games/*.yaml) must be exactly
// what this tag's build produces; otherwise run `node tools/update-catalog.mjs --tag <tag>` and commit.
// The default output is outside the repository: kit reads every *.yaml below a catalog folder.
// Needs the `tar` command. No npm dependencies.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { root, sha256, buildManifests, versionMismatches, tagVersion } from "./lib.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), a.startsWith("--verify") ? true : all[i + 1]]] : acc), []),
);
if (!args.tag) {
  console.error("usage: build-catalog.mjs --tag <tag> [--repo owner/name] [--out dir] [--verify]");
  process.exit(2);
}
const repo = args.repo ?? "TetrisIQ/blackout-games";
const out = resolve(args.out ?? join(tmpdir(), "blackout-games-dist"));
const catalog = join(out, "catalog");
if (out === root || out.startsWith(root + "/")) {
  console.error(`--out ${out} is inside the repository; kit would read its yaml files as manifests`);
  process.exit(2);
}

const { files, packs } = buildManifests(repo, args.tag);

if (args.verify) {
  const wrong = versionMismatches(args.tag);
  if (wrong.length) {
    console.error(`game.yml version != ${tagVersion(args.tag) ?? args.tag} (the release tag) in: ${wrong.join(", ")}`);
    console.error(`Run: node tools/update-catalog.mjs --tag ${args.tag}   then commit the changes and move the tag.`);
    process.exit(1);
  }
  const stale = Object.entries(files).filter(([name, text]) => !existsSync(join(root, name)) || readFileSync(join(root, name), "utf8") !== text);
  if (stale.length) {
    console.error(`The catalog in the repository does not match the ${args.tag} build:\n  ${stale.map(([n]) => n).join("\n  ")}`);
    console.error(`Run: node tools/update-catalog.mjs --tag ${args.tag}   then commit the changes and move the tag.`);
    process.exit(1);
  }
  console.log("committed catalog matches the build");
}

rmSync(out, { recursive: true, force: true });
mkdirSync(join(catalog, "games"), { recursive: true });
for (const [id, pack] of Object.entries(packs)) {
  writeFileSync(join(out, `${id}.zip`), pack.zip);
  console.log(`packed ${id} (${pack.size} bytes)`);
}
for (const [name, text] of Object.entries(files)) {
  mkdirSync(dirname(join(catalog, name)), { recursive: true });
  writeFileSync(join(catalog, name), text);
}

const tarball = join(out, "catalog.tar.gz");
execFileSync("tar", ["czf", tarball, "-C", catalog, "catalog.yaml", "games"]);
writeFileSync(`${tarball}.sha256`, `${sha256(readFileSync(tarball))}\n`);
console.log(`catalog: ${tarball}`);
