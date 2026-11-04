# Tetris

Klassisches Falling-Blocks-Puzzle auf einem 10×20 Feld.

## Steuerung
- ←/→ (A/D): bewegen
- ↑ (W/X): drehen
- ↓ (S): schneller fallen (+1 Punkt pro Feld)
- Leertaste: Hard Drop (+2 Punkte pro Feld)
- P: Pause, R: Neustart

## Regeln
- Steine kommen in zufälliger Reihenfolge aus einem 7er-Beutel (jeder Stein einmal pro Runde).
- Volle Zeilen verschwinden: 1/2/3/4 Zeilen = 100/300/500/800 Punkte × Level.
- Alle 10 Zeilen steigt das Level, die Steine fallen schneller.
- Das Spiel endet, wenn ein neuer Stein nicht mehr passt.
- Highscore wird in `localStorage` (`tetris:best`) gespeichert.

## Tests
    node --test tetris/test/*.test.js
