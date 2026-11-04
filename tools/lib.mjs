// Shared helpers for the tools in this folder. No dependencies.
import { readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["docs", "tools", "node_modules", "dist"]);

// Parses the flat subset used by game.yaml: `key: value` and `key:` + `  - item` lists.
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
