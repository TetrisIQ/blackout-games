# Anonymes Tracking (PostHog)

Ziel: verstehen, wie die Level wirklich gespielt werden (zu leicht? zu schwer? wo bricht jemand ab?), um die Spiele besser auszubalancieren. Alles ist opt-in, alles oder nichts, und läuft offline.

## Ablauf
1. **Hub** (`site/tracking.js`, von `tools/build-site.mjs` in die GitHub-Pages-Seite eingebaut) fragt beim ersten Besuch per Banner. Antwort in `localStorage["kit-games:consent"]` (`granted` / `denied`); im unteren Teil der Seitenleiste lässt sie sich ändern. Bei "Nein" wird die Warteschlange gelöscht, nichts wird aufgezeichnet.
2. **Spiele** rufen `track(event, props)` auf. Das schreibt nur in die Warteschlange `localStorage["kit-games:events"]` (max. 500 Einträge), und nur wenn `consent === "granted"`. Spiele haben **keinen** Netzwerkzugriff; ohne Hub (Datei, kit-Portal) wird nichts gespeichert.
3. Der **Hub** schickt die Warteschlange an `https://eu.i.posthog.com/batch/`, sobald der Browser online ist (beim Laden, bei `online`, beim Zurückkehren in den Tab, alle 30 s). Die Original-Zeitstempel bleiben erhalten, Offline-Spielen geht also nicht verloren. Gesendet wird, wenn der Hub geöffnet ist: also beim Zurückkehren aus einem Spiel.

Anonym: zufällige `distinct_id` (`kit-games:anon-id`), `$process_person_profile: false`, `$geoip_disable: true`, keine Cookies, keine Texte, keine Namen. PostHog-Projekt: "Blackout Tool" (EU). Der Token im Hub ist ein öffentlicher Schreib-Token.

## Events
Jedes Event trägt `game` (= `GAME_ID`).

| Event | Spiele | Wichtige Properties |
|-------|--------|---------------------|
| `difficulty_chosen` | tap-match, match3 | `difficulty`, Fortschritt |
| `level_start` | tap-match, match3 | `level`, `difficulty`, `world`, Level-Parameter (`tiles`, `tile_types`, `layers` bzw. `moves`, `target`), Powerup-Bestand |
| `level_end` | tap-match, match3 | `outcome` (`won` / `lost` / `abandoned`), `active_s`, `picks` / `swaps`, Helfer-Nutzung, siehe unten |
| `powerup_used` | tap-match, match3 | `kind`, `level`, Kontext (Ablage / Restzüge) |
| `game_start`, `game_end` | tetris, snake | `outcome` (`over` / `won` / `abandoned`), `score`, `active_s`, `lines`+`level` bzw. `length` |

`level_end` bei **tap-match** (für "ist es zu leicht?"): `tray_peak` (höchster Ablagestand), `tray_avg` (Ø Tiles in der Ablage nach einem Zug), `tray_ge4_picks` (Züge mit ≥4 Tiles in der Ablage: ohne die Leiste zu brauchen bleibt das bei 0), `free_avg` (Ø freie Tiles zur Auswahl), `matches`, `clean_triples`, `denied_taps`, `picks` vs `tiles_total`, `used_undo|hint|shuffle|slot`, `first_clear`. Ein verlorenes Level bleibt offen, bis man es verlässt, weil Undo es noch retten kann.

`level_end` bei **match3**: `moves` / `moves_used`, `score` vs `target`, `stars`, `cause` (`moves` / `bomb`) bei Niederlage, `invalid_swaps`, `hints`, `auto_shuffles`, `used_hammer|bomb|rainbow`.

`active_s` zählt nur echte Spielzeit (ohne Pause, Menü, versteckten Tab). `abandoned` wird beim Verlassen des Levels oder Schließen der Seite (`pagehide`) gesendet; stirbt der Browser vorher (Handy im Hintergrund beendet), geht dieses Event verloren.

## Neues Spiel
`track()` aus einem bestehenden Spiel (Block "Telemetry" in `game.js`, steht auch in `template/`) übernehmen, `*_start` / `*_end` an den Stellen aufrufen, an denen eine Runde beginnt und endet, Events hier ergänzen. Neue Properties nur mit Zahlen, Booleans und kurzen festen Strings.

## Auswerten
In PostHog: Events filtern nach `game`, Verteilungen von `level_end` pro `level` / `difficulty` (Abschlussquote `outcome`, Median `active_s`, `tray_ge4_picks`).
