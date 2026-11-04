# Tetris

Klassisches Falling-Blocks-Puzzle auf einem 10×20 Feld.

## Steuerung
- ←/→ (A/D): bewegen
- ↑ (W/X): drehen
- ↓ (S): schneller fallen (+1 Punkt pro Feld)
- Leertaste: Hard Drop (+2 Punkte pro Feld)
- P: Pause, R: Neustart
- Touch: Buttons ← → (halten wiederholt), ⟳ drehen, ↓ schneller fallen (halten wiederholt), ⤓ Hard Drop; Pause/Neustart-Buttons; Tippen auf das Feld setzt fort bzw. startet neu

## Regeln
- Steine kommen in zufälliger Reihenfolge aus einem 7er-Beutel (jeder Stein einmal pro Runde).
- Volle Zeilen verschwinden: 1/2/3/4 Zeilen = 100/300/500/800 Punkte × Level.
- Alle 10 Zeilen steigt das Level, die Steine fallen schneller.
- Das Spiel endet, wenn ein neuer Stein nicht mehr passt.
- Highscore wird in `localStorage` (`tetris:best`) gespeichert.

## Darstellung
Folgt dem hellen/dunklen Theme von kit (`data-theme`, `kit-theme`, sonst Systemeinstellung); skaliert auf Handy-Displays und pausiert, wenn die Seite in den Hintergrund geht.

## Tests
    node --test tetris/test/*.test.js
