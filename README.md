# games

Einfache Spiele (Tetris, Snake, ...), mit Claude nachgebaut. Reines HTML/JS, keine Dependencies, kein Build, läuft komplett offline. Gedacht für das Emergency Offline Kit ([`kit`](../kit)).

## Spiel starten
Ordner eines Spiels öffnen und `index.html` im Browser öffnen, oder:

    cd <spiel> && python -m http.server 8000

## Layout
- `<id>/`: ein Spiel pro Ordner (`game.yaml`, `README.md`, `index.html`, `game.js`, `style.css`, optional `test/`).
- `template/`: Kopiervorlage für neue Spiele, siehe [`docs/new-game.md`](docs/new-game.md).
- `tools/check.mjs`: prüft alle Spiele (`node tools/check.mjs`).
- `games.yaml`: Repo-Metadaten.

## Spiele
| id | Titel |
|----|-------|
| _noch keine_ | |

## Regeln
- Jedes Spiel deklariert eine Lizenz; keine urheberrechtlich geschützten Medien.
- Keine Netzwerkzugriffe, keine CDN-Links, keine externen Assets.
- Mehr in [`CLAUDE.md`](CLAUDE.md).
