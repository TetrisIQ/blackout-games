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
- `tools/build-site.mjs`, `site/`: baut die Spielebibliothek als statische Seite (GitHub Pages), siehe unten.
- `catalog.yaml`, `games/<id>.yaml`: kit-Katalog (Metadaten und Manifeste, erzeugt von `tools/update-catalog.mjs`); das Repo ist damit selbst ein lokaler Katalog.

## Spiele
| id | Titel |
|----|-------|
| [tetris](tetris/) | Tetris |
| [snake](snake/) | Snake |
| [match3](match3/) | Match 3 |
| [tap-match](tap-match/) | Tap Match |

## Spielebibliothek im Browser (GitHub Pages)
Dieselbe Bibliothek wie im kit-Portal (`/games/`), mit allen Spielen spielbar und als App auf dem Handy installierbar (PWA, Spiele lassen sich offline speichern; GitHub Pages ist HTTPS). Der Hub (Vorlage, Service Worker, Manifest, CSS) kommt aus dem kit-Repo (`kit/assets/games/`, `kit/assets/portal/`), die Seite sieht also immer aus wie im Portal. Nur die Icons liegen in `site/`.

    node tools/build-site.mjs --out /tmp/site        # --kit <ordner> falls kit nicht in ../kit liegt
    cd /tmp/site && python -m http.server 8000

Veröffentlicht wird nur bei Releases: `pages.yml` baut den Tag, sobald der Release-Workflow erfolgreich war (von Hand: Actions -> Pages -> Run workflow, baut `main`). Die CI (`ci.yml`) läuft unabhängig davon auf Branches und Pull Requests und prüft Spiele, Tests, Katalog und Seite; Manifest-Abweichungen von `game.yml` sind dort nur eine Warnung, der Release prüft sie strikt (`--verify`). Einmalig: Repo-Einstellungen -> Pages -> Source: **GitHub Actions**.

## Regeln
- Jedes Spiel deklariert eine Lizenz; keine urheberrechtlich geschützten Medien.
- Keine Netzwerkzugriffe, keine CDN-Links, keine externen Assets. Anonymes Tracking nur über den Hub und nur mit Einwilligung, siehe [`docs/tracking.md`](docs/tracking.md).
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
