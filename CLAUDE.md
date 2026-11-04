# games

Katalog einfacher Spiele (Tetris, Snake, ...), mit Claude nachgebaut. Vanilla HTML/JS, offline. Dieses Repo ist `games/`; schreibe nie in `../kit` oder `../katalog`.

## Commands
- `node tools/check.mjs` - validiert `template/` und alle Spiele (game.yaml, Pflichtdateien, keine Netzwerk-URLs)
- `node --test <spiel>/test/*.test.js` - Logik-Tests eines Spiels (falls vorhanden)
- `node tools/build-catalog.mjs --tag v0.0.0-test --out <dir>` - baut `<id>.zip` und den kit-Katalog (`<dir>/catalog`, prüfen mit `kit catalog check <dir>/catalog`)
- `cd <spiel> && python -m http.server 8000` - Spiel lokal ansehen

## Rules
1. Neues Spiel = Kopie von `template/` nach `<id>/` (siehe `docs/new-game.md`).
2. Ordnername = `id` in `game.yaml` (kebab-case, englisch). Unbekannte Keys sind ein Fehler.
3. `game.yaml`: `id`, `title`, `description`, `license`, `version`, `entry` (`index.html`), `controls` (Liste).
4. Keine Dependencies, kein Build, kein npm. Nur relative Pfade; keine CDN-/Netzwerkzugriffe, keine externen Fonts oder Assets.
5. Keine urheberrechtlich geschützten Medien: Grafik per Canvas/CSS, Sound per WebAudio, alles selbst geschrieben. Eigene Regeln statt Originalnamen/-marken im Spieltitel, wo nötig.
6. Spiellogik (Zustand, Regeln) getrennt von Rendering und Input, damit sie ohne Browser testbar ist (`node --test`).
7. Highscores nur in `localStorage`, Schlüssel `<id>:<name>`.
8. Tastatursteuerung, wenn sinnvoll auch Touch; Pause-Taste; kein Autoplay-Sound.
9. Kleine, reviewbare Commits, ein Spiel pro Commit (`add <id>`). README-Spieltabelle mitpflegen.
10. Pakete: `release.yml` baut pro Tag je Spiel ein Zip (ohne `test/`) und einen kit-Katalog (`type: files`, `content: {media: games, extract: zip}`); Manifest-Felder kommen aus `game.yaml`. Dafür braucht `kit` keine Änderung; `kit` selbst wird von hier aus nie verändert.
