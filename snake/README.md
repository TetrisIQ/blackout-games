# Snake

Steuere eine wachsende Schlange über ein 20×20 Feld.

## Steuerung
- Pfeiltasten / WASD: lenken
- P: Pause
- R: Neustart

## Regeln
- Jedes Futter gibt 10 Punkte, die Schlange wächst und wird schneller.
- Wände und der eigene Körper beenden das Spiel.
- Ein sofortiges Umkehren in die Gegenrichtung ist nicht möglich; schnelle Richtungswechsel werden gepuffert (max. 2).
- Füllt die Schlange das ganze Feld, ist das Spiel gewonnen.
- Highscore wird in `localStorage` (`snake:best`) gespeichert.

## Tests
    node --test snake/test/
