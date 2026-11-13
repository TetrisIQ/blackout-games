#!/usr/bin/env node
// Writes the kit catalog into this repository (catalog.yaml + games/<id>.yaml), so the repository folder
// itself works as a local catalog (`kit catalog add games /path/to/this/repo`).
// It also sets `version` in every game.yml to the tag (v0.3.1 -> 0.3.1), so game versions match the release.
// Run it for the release you are about to tag, commit the result, then tag:
//   node tools/update-catalog.mjs --tag v0.1.2 && git commit -am "catalog v0.1.2" && git tag v0.1.2
// The manifests point at that release's zips; the zips are reproducible, so their checksums are known
// before the release exists. The release workflow refuses to publish if they do not match.
// Usage: node tools/update-catalog.mjs --tag v0.1.2 [--repo owner/name]
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { root, buildManifests, stampVersions, tagVersion } from "./lib.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
if (!args.tag) {
  console.error("usage: update-catalog.mjs --tag <tag> [--repo owner/name]");
  process.exit(2);
}
if (!tagVersion(args.tag)) {
  console.error(`tag "${args.tag}" must look like vX.Y.Z`);
  process.exit(2);
}
// The game versions follow the release tag; stamp them first, the zips (and checksums) contain game.yml.
for (const id of stampVersions(args.tag)) console.log(`${id}/game.yml: version ${tagVersion(args.tag)}`);
const { files } = buildManifests(args.repo ?? "TetrisIQ/blackout-games", args.tag);

mkdirSync(join(root, "games"), { recursive: true });
for (const old of readdirSync(join(root, "games"))) {
  if (old.endsWith(".yaml") && !(`games/${old}` in files)) rmSync(join(root, "games", old)); // removed game
}
for (const [name, text] of Object.entries(files)) {
  writeFileSync(join(root, name), text);
  console.log(`wrote ${name}`);
}
