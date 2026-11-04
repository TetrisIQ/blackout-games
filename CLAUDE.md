# games

Katalog einfacher Spiele (Tetris, Snake, ...), mit Claude nachgebaut. Vanilla HTML/JS, offline. Dieses Repo ist `games/`; schreibe nie in `../kit` oder `../katalog`.

## Commands
- `node tools/check.mjs` - validiert `template/` und alle Spiele (game.yaml, Pflichtdateien, keine Netzwerk-URLs)
- `node --test <spiel>/test/` - Logik-Tests eines Spiels (falls vorhanden)
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
