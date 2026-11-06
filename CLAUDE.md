# games

Katalog einfacher Spiele (Tetris, Snake, ...), mit Claude nachgebaut. Vanilla HTML/JS, offline. Dieses Repo ist `games/`; schreibe nie in `../kit` oder `../katalog`.

## Commands
- `node tools/check.mjs` - validiert `template/` und alle Spiele (game.yml, Pflichtdateien, keine Netzwerk-URLs)
- `node --test <spiel>/test/*.test.js` - Logik-Tests eines Spiels (falls vorhanden)
- `node tools/build-catalog.mjs --tag v0.0.0-test --out <dir>` - baut `<id>.zip` und den kit-Katalog (`<dir>/catalog`, prüfen mit `kit catalog check <dir>/catalog`); `<dir>` muss außerhalb des Repos liegen (Standard: Temp-Ordner)
- `node tools/update-catalog.mjs --tag vX.Y.Z` - schreibt `catalog.yaml` und `games/<id>.yaml` ins Repo (vor jedem Release, siehe Regel 10); `kit catalog check .` prüft das Repo als lokalen Katalog
- `cd <spiel> && python -m http.server 8000` - Spiel lokal ansehen

## Rules
1. Neues Spiel = Kopie von `template/` nach `<id>/` (siehe `docs/new-game.md`).
2. Ordnername = `id` in `game.yml` (kebab-case, englisch). Unbekannte Keys sind ein Fehler.
3. `game.yml`: `id`, `title`, `description`, `license`, `version`, `entry` (`index.html`), `controls` (Liste).
4. Keine Dependencies, kein Build, kein npm. Nur relative Pfade; keine CDN-/Netzwerkzugriffe, keine externen Fonts oder Assets.
5. Keine urheberrechtlich geschützten Medien: Grafik per Canvas/CSS, Sound per WebAudio, alles selbst geschrieben. Eigene Regeln statt Originalnamen/-marken im Spieltitel, wo nötig.
6. Spiellogik (Zustand, Regeln) getrennt von Rendering und Input, damit sie ohne Browser testbar ist (`node --test`).
7. Highscores nur in `localStorage`, Schlüssel `<id>:<name>`.
8. Tastatursteuerung, wenn sinnvoll auch Touch; Pause-Taste; kein Autoplay-Sound.
9. Kleine, reviewbare Commits, ein Spiel pro Commit (`add <id>`). README-Spieltabelle mitpflegen.
10. Pakete und Katalog: Das Repo ist selbst ein kit-Katalog (`kit catalog add games <Ordner>` liest es an Ort und Stelle; `--catalog`/`KIT_CATALOG` geht auch). kit liest **jede** `*.yaml` im Ordner als Manifest, darum heißen die Spiel-Metadaten `game.yml`, und außer `catalog.yaml` und `games/<id>.yaml` darf es keine `.yaml` geben (auch kein `dist/` im Repo; `tools/check.mjs` prüft das). Die Manifeste (`type: files`, `content: {media: games, extract: zip}`, Zip-URL, sha256, Größe; Name, Beschreibung, Lizenz aus `game.yml`) erzeugt `tools/update-catalog.mjs --tag <Tag>`; die Zips sind reproduzierbar (`tools/zip.mjs`, unkomprimiert, feste Zeit), ihre Prüfsummen stehen also vor dem Release fest. Release: `node tools/update-catalog.mjs --tag vX.Y.Z`, committen, Tag setzen, pushen; `release.yml` baut mit `--verify` und bricht ab, wenn die eingecheckten Manifeste nicht zum Tag passen. Dafür braucht `kit` keine Änderung; `kit` selbst wird von hier aus nie verändert.
11. Theme und Mobil: Farben kommen aus CSS-Variablen (siehe `template/style.css`: `:root`, `:root[data-theme=dark]`), nie fest im Code. Das kit-Portal setzt `data-theme` (`light`/`dark`) auf die Spielseite, ohne Portal gilt `localStorage["kit-theme"]`, sonst die Systemeinstellung (`prefers-color-scheme`); der Head-Einzeiler in `index.html` und der Theme-Block in `game.js` (`PAL`) stammen aus `template/`. Canvas liest die Farben aus `PAL`. Mobil: Viewport-Meta, Canvas skaliert per CSS, `touch-action: none`, Bedienelemente (`.touch-only`) für Geräte ohne Tastatur, Tippen/Wischen statt Tasten, Pause bei `visibilitychange`.
