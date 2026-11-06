# games

Einfache Spiele (Tetris, Snake, ...), mit Claude nachgebaut. Reines HTML/JS, keine Dependencies, kein Build, läuft komplett offline. Gedacht für das Emergency Offline Kit ([`kit`](../kit)).

## Spiel starten
Ordner eines Spiels öffnen und `index.html` im Browser öffnen, oder:

    cd <spiel> && python -m http.server 8000

## Layout
- `<id>/`: ein Spiel pro Ordner (`game.yml`, `README.md`, `index.html`, `game.js`, `style.css`, optional `test/`).
- `template/`: Kopiervorlage für neue Spiele, siehe [`docs/new-game.md`](docs/new-game.md).
- `tools/check.mjs`: prüft alle Spiele (`node tools/check.mjs`).
- `tools/build-catalog.mjs`: baut die Release-Pakete und den kit-Katalog.
- `catalog.yaml`, `games/<id>.yaml`: kit-Katalog (Metadaten und Manifeste, erzeugt von `tools/update-catalog.mjs`); das Repo ist damit selbst ein lokaler Katalog.

## Spiele
| id | Titel |
|----|-------|
| [tetris](tetris/) | Tetris |
| [snake](snake/) | Snake |
| [match3](match3/) | Match 3 |
| [tap-match](tap-match/) | Tap Match |

## Regeln
- Jedes Spiel deklariert eine Lizenz; keine urheberrechtlich geschützten Medien.
- Keine Netzwerkzugriffe, keine CDN-Links, keine externen Assets.
- Mehr in [`CLAUDE.md`](CLAUDE.md).

## Installation mit kit
Dieses Repo ist ein [`kit`](../kit)-Katalog. Jedes Spiel ist ein Paket (`type: files`, Zip), das nach `<data-dir>/media/games/<id>/` entpackt wird. Entweder von GitHub (setzt ein öffentliches Repo voraus):

    kit catalog add games https://github.com/TetrisIQ/blackout-games
    kit install --select tetris,snake,match3

oder direkt aus einem lokalen Checkout, der an Ort und Stelle gelesen wird:

    kit catalog add games /pfad/zu/games
    kit catalog check /pfad/zu/games        # prüft den Ordner
    KIT_CATALOG=/pfad/zu/games kit install --select tetris   # nur dieser Katalog

Die Manifeste im Repo (`games/<id>.yaml`) zeigen auf die Zips des jeweils letzten Releases, `catalog.yaml` ist die Katalog-Beschreibung. Heruntergeladen wird immer von der GitHub-Release-URL im Manifest; der Download braucht also ein öffentlich erreichbares Release. Danach `index.html` im Ordner `<data-dir>/media/games/<id>/` im Browser öffnen (oder über das Spiele-Hub des kit-Portals).

## Release
1. `node tools/update-catalog.mjs --tag vX.Y.Z` schreibt `catalog.yaml` und `games/<id>.yaml` mit den Prüfsummen der (reproduzierbaren) Zips.
2. Committen, `git tag vX.Y.Z`, Branch und Tag pushen.
3. Der Workflow `release.yml` prüft alles, baut `<id>.zip` je Spiel sowie `catalog.tar.gz` (+ `.sha256`) mit `--verify` (bricht ab, wenn die eingecheckten Manifeste nicht zum Tag passen), validiert den Katalog und das Repo mit dem echten `kit catalog check` und veröffentlicht alles als GitHub-Release.

Lokal: `node tools/build-catalog.mjs --tag v0.0.0-test --out <ordner-ausserhalb-des-repos>`.
