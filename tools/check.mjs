#!/usr/bin/env node
// Validates template/ and every game folder. No dependencies.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_FILES = ["game.yaml", "README.md", "index.html", "game.js", "style.css"];
const KEYS = ["id", "title", "description", "license", "version", "entry", "controls"];
const SKIP = new Set(["docs", "tools", "node_modules"]);

// Parses the flat subset used by game.yaml: `key: value` and `key:` + `  - item` lists.
function parseYaml(text) {
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

function checkGame(dir) {
  const errors = [];
  const path = join(root, dir);
  for (const f of REQUIRED_FILES) if (!existsSync(join(path, f))) errors.push(`missing ${f}`);
  if (existsSync(join(path, "game.yaml"))) {
    try {
      const meta = parseYaml(readFileSync(join(path, "game.yaml"), "utf8"));
      for (const k of Object.keys(meta)) if (!KEYS.includes(k)) errors.push(`unknown key ${k}`);
      for (const k of KEYS) if (!(k in meta)) errors.push(`missing key ${k}`);
      if (meta.id !== dir) errors.push(`id "${meta.id}" != folder "${dir}"`);
      if (meta.id && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.id)) errors.push("id must be kebab-case");
      if (meta.license === "") errors.push("license must not be empty");
      if (meta.entry && !existsSync(join(path, meta.entry))) errors.push(`entry ${meta.entry} not found`);
      if (!Array.isArray(meta.controls) || meta.controls.length === 0) errors.push("controls must be a non-empty list");
    } catch (e) {
      errors.push(`game.yaml: ${e.message}`);
    }
  }
  for (const f of ["index.html", "game.js", "style.css"]) {
    const file = join(path, f);
    if (existsSync(file) && /https?:\/\//.test(readFileSync(file, "utf8"))) errors.push(`${f}: network URL found`);
  }
  return errors;
}

const dirs = readdirSync(root).filter(
  (d) => !d.startsWith(".") && !SKIP.has(d) && statSync(join(root, d)).isDirectory(),
);
let failed = false;
for (const dir of dirs) {
  const errors = checkGame(dir);
  if (errors.length) { failed = true; console.error(`FAIL ${dir}\n  - ${errors.join("\n  - ")}`); }
  else console.log(`ok   ${dir}`);
}
process.exit(failed ? 1 : 0);
