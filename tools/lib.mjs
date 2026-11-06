// Shared helpers for the tools in this folder. No dependencies.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createZip } from "./zip.mjs";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Folders that are not games. `games/` holds the kit manifests (see update-catalog.mjs).
const SKIP = new Set(["docs", "tools", "node_modules", "dist", "games", "site"]);
export const META_FILE = "game.yml"; // not .yaml: kit reads every *.yaml in a catalog folder as a manifest

// Parses the flat subset used by game.yml: `key: value` and `key:` + `  - item` lists.
export function parseYaml(text) {
  const out = {};
  let list = null;
  for (const raw of text.split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const item = raw.match(/^\s+-\s+(.*)$/);
    if (item && list) { out[list].push(item[1].replace(/^"(.*)"$/, "$1")); continue; }
    const kv = raw.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!kv) throw new Error(`unparsable line: ${raw}`);
    if (kv[2] === "") { out[kv[1]] = []; list = kv[1]; }
    else { out[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1"); list = null; }
  }
  return out;
}

// Folder names of template/ and all games.
export function listDirs() {
  return readdirSync(root).filter(
    (d) => !d.startsWith(".") && !SKIP.has(d) && statSync(join(root, d)).isDirectory(),
  );
}

// Folder names of real games (everything except template/).
export function listGames() {
  return listDirs().filter((d) => d !== "template");
}

// --- Packages and kit manifests --------------------------------------------

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const q = (v) => JSON.stringify(v); // JSON strings are valid YAML double-quoted scalars

// The files of a game as they go into its zip: everything except test/, at the top of the game folder.
export function gameFiles(id) {
  const dir = join(root, id);
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const path = join(d, e.name);
      if (e.isDirectory()) walk(path);
      else out.push({ name: relative(dir, path).split("\\").join("/"), data: readFileSync(path) });
    }
  };
  walk(dir);
  return out.filter((f) => !f.name.startsWith("test/"));
}

// Reproducible zip of a game plus its checksum and size.
export function packGame(id) {
  const zip = createZip(gameFiles(id));
  return { zip, sha256: sha256(zip), size: zip.length };
}

export const releaseBase = (repo, tag) => `https://github.com/${repo}/releases/download/${tag}`;

export function catalogYaml() {
  return [
    "name: blackout-games",
    "description: Simple offline browser games (HTML/JS) for the Emergency Offline Kit.",
    "format: 1",
    "",
  ].join("\n");
}

// The kit manifest (`games/<id>.yaml`): a `files` package unpacked into <data>/media/games/<id>/.
export function manifestText(id, meta, pack, baseUrl) {
  return [
    `id: ${id}`,
    `name: ${q(meta.title)}`,
    `description: ${q(meta.description)}`,
    "category: games",
    "type: files",
    "source:",
    `  url: ${q(`${baseUrl}/${id}.zip`)}`,
    `sha256: ${pack.sha256}`,
    `size_bytes: ${pack.size}`,
    "license:",
    `  spdx: ${q(meta.license)}`,
    "content:",
    "  media: games",
    "  extract: zip",
    "",
  ].join("\n");
}

// All manifests for a release tag: { "games/<id>.yaml": text, ... } plus catalog.yaml.
export function buildManifests(repo, tag) {
  const base = releaseBase(repo, tag);
  const files = { "catalog.yaml": catalogYaml() };
  const packs = {};
  for (const id of listGames()) {
    const meta = parseYaml(readFileSync(join(root, id, META_FILE), "utf8"));
    packs[id] = packGame(id);
    files[`games/${id}.yaml`] = manifestText(id, meta, packs[id], base);
  }
  return { files, packs };
}
