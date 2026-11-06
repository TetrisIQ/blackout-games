# Snake

Steuere eine wachsende Schlange über ein 20×20 Feld.

## Steuerung
- Pfeiltasten / WASD: lenken
- P: Pause
- R: Neustart
- Touch: Wischen auf dem Feld oder Pfeil-Buttons; Pause/Neustart-Buttons; Tippen auf das Feld setzt nach Game over bzw. Pause fort

## Regeln
- Jedes Futter gibt 10 Punkte, die Schlange wächst und wird schneller.
- Wände und der eigene Körper beenden das Spiel.
- Ein sofortiges Umkehren in die Gegenrichtung ist nicht möglich; schnelle Richtungswechsel werden gepuffert (max. 2).
- Füllt die Schlange das ganze Feld, ist das Spiel gewonnen.
- Highscore wird in `localStorage` (`snake:best`) gespeichert.

## Anleitung
Beim ersten Öffnen erscheint eine kurze Anleitung (3 Seiten: Ziel, Regeln/Punkte, Steuerung). Das Spiel wartet solange. „Skip“, Esc oder „Let's play“ schließen sie; danach kommt sie nicht mehr von allein (`localStorage`, Schlüssel `snake:help`). Erneut aufrufen: Button „How to play“ oder die Taste `?`; Pfeiltasten blättern.

## Darstellung
Folgt dem hellen/dunklen Theme von kit (`data-theme`, `kit-theme`, sonst Systemeinstellung); skaliert auf Handy-Displays und pausiert, wenn die Seite in den Hintergrund geht.

## Tests
    node --test snake/test/*.test.js
