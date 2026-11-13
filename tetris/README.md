# Tetris

Falling-Blocks-Puzzle auf einem 10×20 Feld: Kampagne mit drei Welten und ein klassischer Endlos-Modus.

## Steuerung
- ←/→ (A/D): bewegen
- ↑ (W/X): drehen
- ↓ (S): schneller fallen (+1 Punkt pro Feld)
- Leertaste: Hard Drop (+2 Punkte pro Feld)
- P: Pause, R: Neustart, Esc: Menü
- Touch auf dem Feld: Tippen dreht, Ziehen nach links/rechts bewegt, Ziehen nach unten fällt schneller, schnelles Wischen nach unten ist Hard Drop; Tippen setzt nach Pause fort bzw. startet nach Game Over neu
- Touch hat keine Pfeil-Tasten, nur die Gesten; Buttons für Pause, Neustart und Menü

## Kampagne
Drei Welten (Standard, Lava, Nacht) mit je **10 Leveln und einem Endboss**. Es gibt kein Zeitlimit und keine Anzeige der Steigerung: Mit der Spielzeit steigt der Druck (0 bis 1) und die Steine fallen schneller, der Beutel enthält mehr S/Z und seltener I (nie drei S/Z in Folge), und ab einem Zeitpunkt steigen Garbage-Reihen von unten auf, immer schneller. Das ist die harte Obergrenze: jedes Level endet, wenn die Steine oben anstoßen.

- **Sterne:** 1 bis 3 nach der Endpunktzahl (Schwellen pro Level in `levelConfig`, aus Bot-Läufen kalibriert). Mindestens 1 Stern schaltet das nächste Level frei. Sobald eine Schwelle erreicht ist, platzt ein Stern über dem Feld auf und das Spiel pausiert kurz (1,4 s, auf dem Handy mit kurzem Vibrieren). Im Bosskampf gibt es das nicht, dort zählt die Siegzeit.
- **Standard:** reines Tetris; Garbage ab dem Ende der Rampe.
- **Lava:** Garbage-Reihen steigen früh und häufig auf.
- **Nacht:** sichtbar ist nur ein Band um den Stein, das mit dem Druck schrumpft.
- **Boss:** braucht 15 Sterne aus den 10 Leveln der Welt. Linien machen Schaden (1/2/3/4 Linien = 1/3/5/8), der HP-Balken ist sichtbar. Angriffe blinken 1,5 s vorher am Rand: Architekt (Garbage, Betonblöcke, die zwei Linien brauchen), Lavagolem (Garbage, Feuerbälle), Schatten (Blackout, falsche Vorschau, Garbage). Sterne nach Siegzeit. Der Sieg öffnet die nächste Welt.
- Fortschritt in `localStorage` (`tetris:progress`), Endlos-Highscore weiter in `tetris:best`.

## Regeln (Endlos)
- Steine kommen in zufälliger Reihenfolge aus einem 7er-Beutel (jeder Stein einmal pro Runde).
- Volle Zeilen verschwinden: 1/2/3/4 Zeilen = 100/300/500/800 Punkte × Level.
- Alle 10 Zeilen steigt das Level, die Steine fallen schneller.
- Das Spiel endet, wenn ein neuer Stein nicht mehr passt.
- Highscore wird in `localStorage` (`tetris:best`) gespeichert.

## Anleitung
Beim ersten Öffnen erscheint eine kurze Anleitung (4 Seiten: Ziel, Regeln/Punkte, Kampagne, Steuerung). Das Spiel wartet solange. „Skip“, Esc oder „Let's play“ schließen sie; danach kommt sie nicht mehr von allein (`localStorage`, Schlüssel `tetris:help`). Erneut aufrufen: Button „How to play“ oder die Taste `?`; Pfeiltasten blättern.

## Einstellungen
Menü → Settings: Seite der Vorschau-Leiste (Next, Punkte, Boss-Balken) links (Standard) oder rechts. Gespeichert in `localStorage` (`tetris:settings`).

## Darstellung
Folgt dem hellen/dunklen Theme von kit (`data-theme`, `kit-theme`, sonst Systemeinstellung); skaliert auf Handy-Displays und pausiert, wenn die Seite in den Hintergrund geht.

## Tests
    node --test tetris/test/*.test.js

`test/bot.js` ist ein Greedy-Bot für die Tests (jedes Level endet) und zum Kalibrieren der Sternschwellen.
