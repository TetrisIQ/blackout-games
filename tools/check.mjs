#!/usr/bin/env node
// Validates template/ and every game folder. No dependencies.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { root, parseYaml, listDirs } from "./lib.mjs";

const REQUIRED_FILES = ["game.yaml", "README.md", "index.html", "game.js", "style.css"];
const KEYS = ["id", "title", "description", "license", "version", "entry", "controls"];

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

let failed = false;
for (const dir of listDirs()) {
  const errors = checkGame(dir);
  if (errors.length) { failed = true; console.error(`FAIL ${dir}\n  - ${errors.join("\n  - ")}`); }
  else console.log(`ok   ${dir}`);
}
process.exit(failed ? 1 : 0);
