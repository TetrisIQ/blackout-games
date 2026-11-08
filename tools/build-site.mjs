#!/usr/bin/env node
// Builds the game library as a static site (GitHub Pages): the same hub the kit shows under /games/, with all
// games playable and installable as an offline app (PWA). The hub template, service worker, manifest, CSS and
// theme script come from the kit repository (default ../kit, in CI the checkout in ./kit), so there is one hub.
// Usage: node tools/build-site.mjs [--out dir] [--kit dir] [--repo owner/name]
// The output is outside the repository (default: a temp folder). No npm dependencies.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { root, parseYaml, listGames, sha256, META_FILE } from "./lib.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const repo = args.repo ?? "TetrisIQ/blackout-games";
const out = resolve(args.out ?? join(tmpdir(), "blackout-games-site"));
const kit = resolve(args.kit ?? join(root, "..", "kit"));
if (out === root || out.startsWith(root + "/")) {
  console.error(`--out ${out} is inside the repository (kit would read its yaml files as manifests)`);
  process.exit(2);
}
const asset = (...p) => {
  const file = join(kit, ...p);
  if (!existsSync(file)) {
    console.error(`${file} not found; pass --kit <checkout of the kit repository>`);
    process.exit(2);
  }
  return readFileSync(file, "utf8");
};
const hub = asset("assets", "games", "hub.html");
const sw = asset("assets", "games", "sw.js");
const manifest = asset("assets", "games", "manifest.webmanifest");
const css = asset("assets", "portal", "portal.css");
const theme = asset("assets", "portal", "theme.js");
const fill = (tpl, values) => tpl.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in values ? values[k] : m));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// What the browser needs of a game (same rules as kit: no tests, docs or hidden files).
function siteFiles(id) {
  const dir = join(root, id);
  const found = [];
  const walk = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const skip = e.name.startsWith(".") || ["test", "tests", "node_modules", "README.md", "game.yml", "game.yaml"].includes(e.name) || e.name.endsWith(".test.js");
      if (skip || e.isSymbolicLink()) continue;
      const path = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(d, e.name), path);
      else found.push(path);
    }
  };
  walk(dir, "");
  return found;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const data = [];
let allRevs = "";
for (const id of listGames()) {
  const meta = parseYaml(readFileSync(join(root, id, META_FILE), "utf8"));
  const files = siteFiles(id);
  let size = 0;
  const h = [];
  for (const f of files) {
    const bytes = readFileSync(join(root, id, f));
    size += bytes.length;
    h.push(Buffer.from(f), bytes);
    mkdirSync(dirname(join(out, "play", id, f)), { recursive: true });
    copyFileSync(join(root, id, f), join(out, "play", id, f));
  }
  const rev = sha256(Buffer.concat(h)).slice(0, 12);
  allRevs += rev;
  data.push({ id, name: meta.title, description: meta.description, controls: meta.controls, version: meta.version ?? null, license: meta.license, size, entry: meta.entry, rev, files });
  console.log(`game ${id} (${files.length} files, ${size} bytes)`);
}

const json = JSON.stringify(data).replaceAll("</", "<\\/").replaceAll("<!--", "<\\!--");
const cards = data.map((g) => `<li><a href="play/${encodeURIComponent(g.id)}/${esc(g.entry)}">${esc(g.name)}</a></li>\n`).join("");
// No kit portal here: link to the repository instead.
const page = fill(hub, { CSS: css, THEME_JS: theme, CARDS: cards, DATA: json }).replace(
  /<a class="g-portal-link[^>]*>[^<]*<\/a>/,
  `<a class="g-portal-link install-only-browser" id="portal-link" href="https://github.com/${repo}">‹ Source on GitHub</a>`,
);
// Anonymous play data (opt-in banner + upload of the queue the games fill); the games themselves stay offline.
const tracking = readFileSync(join(root, "site", "tracking.js"), "utf8");
writeFileSync(join(out, "index.html"), page.replace("</body>", () => `<script>\n${tracking}</script>\n</body>`));
writeFileSync(join(out, "sw.js"), fill(sw, { REV: sha256(Buffer.from(allRevs + hub + tracking)).slice(0, 12) }));
writeFileSync(join(out, "manifest.webmanifest"), manifest);
for (const icon of ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"]) copyFileSync(join(root, "site", icon), join(out, icon));
writeFileSync(join(out, ".nojekyll"), "");
console.log(`site: ${out}`);
