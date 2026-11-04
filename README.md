# games

Einfache Spiele (Tetris, Snake, ...), mit Claude nachgebaut. Reines HTML/JS, keine Dependencies, kein Build, läuft komplett offline. Gedacht für das Emergency Offline Kit ([`kit`](../kit)).

## Spiel starten
Ordner eines Spiels öffnen und `index.html` im Browser öffnen, oder:

    cd <spiel> && python -m http.server 8000

## Layout
- `<id>/`: ein Spiel pro Ordner (`game.yaml`, `README.md`, `index.html`, `game.js`, `style.css`, optional `test/`).
- `template/`: Kopiervorlage für neue Spiele, siehe [`docs/new-game.md`](docs/new-game.md).
- `tools/check.mjs`: prüft alle Spiele (`node tools/check.mjs`).
- `tools/build-catalog.mjs`: baut die Release-Pakete und den kit-Katalog.
- `games.yaml`: Repo-Metadaten.

## Spiele
| id | Titel |
|----|-------|
| [tetris](tetris/) | Tetris |
| [snake](snake/) | Snake |

## Regeln
- Jedes Spiel deklariert eine Lizenz; keine urheberrechtlich geschützten Medien.
- Keine Netzwerkzugriffe, keine CDN-Links, keine externen Assets.
- Mehr in [`CLAUDE.md`](CLAUDE.md).

## Installation mit kit
Dieses Repo ist ein [`kit`](../kit)-Katalog. Jedes Spiel ist ein Paket (`type: files`, Zip), das nach `<data-dir>/media/games/<id>/` entpackt wird:

    kit catalog add games https://github.com/TetrisIQ/blackout-games/releases/latest/download/catalog.tar.gz
    kit install --select tetris,snake

Danach `index.html` im Ordner `<data-dir>/media/games/<id>/` im Browser öffnen.

## Release
Ein Tag `vX.Y.Z` pushen. Der Workflow `release.yml` prüft alles, baut `<id>.zip` je Spiel sowie `catalog.tar.gz` (+ `.sha256`), validiert den Katalog mit dem echten `kit catalog check` und veröffentlicht alles als GitHub-Release. Lokal: `node tools/build-catalog.mjs --tag v0.0.0-test`.
