#!/usr/bin/env node
// Validates template/ and every game folder. No dependencies.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { root, parseYaml, listDirs, listGames, META_FILE } from "./lib.mjs";

const REQUIRED_FILES = [META_FILE, "README.md", "index.html", "game.js", "style.css"];
const KEYS = ["id", "title", "description", "license", "version", "entry", "controls"];

function checkGame(dir) {
  const errors = [];
  const path = join(root, dir);
  for (const f of REQUIRED_FILES) if (!existsSync(join(path, f))) errors.push(`missing ${f}`);
  if (existsSync(join(path, META_FILE))) {
    try {
      const meta = parseYaml(readFileSync(join(path, META_FILE), "utf8"));
      for (const k of Object.keys(meta)) if (!KEYS.includes(k)) errors.push(`unknown key ${k}`);
      for (const k of KEYS) if (!(k in meta)) errors.push(`missing key ${k}`);
      if (meta.id !== dir) errors.push(`id "${meta.id}" != folder "${dir}"`);
      if (meta.id && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.id)) errors.push("id must be kebab-case");
      if (meta.license === "") errors.push("license must not be empty");
      if (meta.entry && !existsSync(join(path, meta.entry))) errors.push(`entry ${meta.entry} not found`);
      if (!Array.isArray(meta.controls) || meta.controls.length === 0) errors.push("controls must be a non-empty list");
    } catch (e) {
      errors.push(`${META_FILE}: ${e.message}`);
    }
  }
  for (const f of ["index.html", "game.js", "style.css"]) {
    const file = join(path, f);
    if (existsSync(file) && /https?:\/\//.test(readFileSync(file, "utf8"))) errors.push(`${f}: network URL found`);
  }
  return errors;
}

// The repository folder doubles as a local kit catalog (`kit catalog add games <this folder>`): kit reads every
// *.yaml below it as a manifest, so only catalog.yaml and games/<id>.yaml may exist.
function checkCatalog() {
  const errors = [];
  const warnings = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === ".git" || e.name === "node_modules") continue;
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else if (e.name.endsWith(".yaml")) {
        const rel = relative(root, path);
        if (rel !== "catalog.yaml" && !/^games\/[a-z0-9-]+\.yaml$/.test(rel)) errors.push(`${rel}: kit would read this as a manifest (use .yml)`);
      }
    }
  };
  walk(root);
  if (!existsSync(join(root, "catalog.yaml"))) errors.push("catalog.yaml missing (node tools/update-catalog.mjs --tag <tag>)");
  else if (!/^format: 1$/m.test(readFileSync(join(root, "catalog.yaml"), "utf8"))) errors.push("catalog.yaml: format: 1 missing");
  const games = listGames();
  for (const id of games) {
    const file = join(root, "games", `${id}.yaml`);
    if (!existsSync(file)) { warnings.push(`no kit manifest for ${id} yet (node tools/update-catalog.mjs --tag <next release>)`); continue; }
    const text = readFileSync(file, "utf8");
    const meta = parseYaml(readFileSync(join(root, id, META_FILE), "utf8"));
    const field = (re) => { const m = text.match(re); return m ? JSON.parse(m[1]) : undefined; };
    const url = field(/^  url: (".*")$/m);
    const checks = [
      [/^id: (.+)$/m, id, "id", (v) => v],
      [/^name: (".*")$/m, meta.title, "name", JSON.parse],
      [/^description: (".*")$/m, meta.description, "description", JSON.parse],
      [/^  spdx: (".*")$/m, meta.license, "license", JSON.parse],
    ];
    for (const [re, want, label, parse] of checks) {
      const m = text.match(re);
      if (!m || parse(m[1]) !== want) errors.push(`games/${id}.yaml: ${label} differs from ${id}/${META_FILE}`);
    }
    if (!url || !url.endsWith(`/${id}.zip`)) errors.push(`games/${id}.yaml: source.url should end with /${id}.zip`);
  }
  if (existsSync(join(root, "games"))) {
    for (const f of readdirSync(join(root, "games"))) {
      if (f.endsWith(".yaml") && !games.includes(f.slice(0, -5))) errors.push(`games/${f}: no such game folder`);
    }
  }
  return { errors, warnings };
}

let failed = false;
for (const dir of listDirs()) {
  const errors = checkGame(dir);
  if (errors.length) { failed = true; console.error(`FAIL ${dir}\n  - ${errors.join("\n  - ")}`); }
  else console.log(`ok   ${dir}`);
}
const cat = checkCatalog();
for (const w of cat.warnings) console.warn(`warn catalog: ${w}`);
if (cat.errors.length) { failed = true; console.error(`FAIL catalog\n  - ${cat.errors.join("\n  - ")}`); }
else console.log("ok   catalog (repository works as a local kit catalog)");
process.exit(failed ? 1 : 0);
