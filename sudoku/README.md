# Sudoku

Klassisches Sudoku: die Ziffern 1 bis 9 so eintragen, dass jede Zeile, jede Spalte und jedes 3×3-Feld jede Ziffer genau einmal enthält. Keine Welten, keine festen Rätsel: Die Level werden auf dem Gerät erzeugt, es gibt also unbegrenzt viele.

## Level
Jede Schwierigkeit hat ihre eigene Levelzählung. Die Levelübersicht zeigt alle gelösten Level (mit ✓, Antippen spielt das Level erneut, die Bestzeit des Levels wird verbessert) und **genau ein nächstes Level** („Play level N“ / „Continue level N“). Das nächste Level bleibt dasselbe, bis es gelöst ist, auch nach dem Verlassen; erst dann entsteht das folgende. Ein angefangenes Level bleibt beim Wechsel in die Übersicht erhalten, solange man nicht ein anderes Level startet (dann Rückfrage).

## Steuerung
- Maus / Touch: Zelle antippen, dann Ziffer in der Leiste unter dem Feld (dieselbe Ziffer nochmal entfernt sie)
- Doppelklick / Doppeltipp oder langes Drücken (0,45 s) auf eine Ziffer der Leiste: Notiz setzen, ohne den Notiz-Modus umzuschalten (bei eingeschaltetem Modus umgekehrt: die Ziffer)
- 1-9: Ziffer eintragen; Umschalt+Ziffer: Notiz
- N: Notizen an/aus (Button „Notes“)
- Rücktaste / Entf / 0: Zelle leeren
- Pfeiltasten / WASD: Auswahl bewegen; Esc: Auswahl aufheben
- U: Undo
- H: Hint (trägt die richtige Ziffer in die gewählte Zelle ein, sonst in eine zufällige offene)
- P: Pause (das Feld wird verdeckt)
- ?: Anleitung
- Touch: Buttons für alles; „Levels“ führt zur Übersicht

## Regeln
- Rot wird nur eine Ziffer, die in Zeile, Spalte oder Feld doppelt steht. Eine Ziffer, die aktuell passt, aber nicht die richtige ist, wird nicht markiert, und es gibt keinen Fehlerzähler (auch die Anzahl-Anzeige der Ziffernleiste zählt alle gesetzten Ziffern). Gewonnen ist, sobald das Feld vollständig und richtig gefüllt ist.
- Notizen: Bleistiftmarken (kleine Ziffern) in einer leeren Zelle. Wird eine Ziffer gesetzt, verschwindet sie aus den Notizen von Zeile, Spalte und Feld.
- Jedes Rätsel hat genau eine Lösung und lässt sich ohne Raten lösen.
- Schwierigkeit (wie in den anderen Spielen: Easy / Medium / Hard / Extreme) bestimmt Vorgaben und nötige Technik, Welten gibt es nicht:

  | Stufe | Vorgaben | Nötige Technik |
  |-------|----------|----------------|
  | Easy | 40-46 | nur Einzelkandidaten (Naked/Hidden Single) |
  | Medium | 32-36 | nur Einzelkandidaten |
  | Hard | 27-31 | zusätzlich Locked Candidates, Paare (Naked/Hidden Pair) |
  | Extreme | 22-26 | zusätzlich Tripel, X-Wing, XY-Wing (Rang 3) bzw. Swordfish, XYZ-Wing, Coloring, Quadrupel, Jellyfish (Rang 4) |

## Rätsel-Generator
Alles läuft im Browser, offline, ohne mitgelieferte Rätselliste (`sudokuCore()` in `game.js`):
1. Zufällig gefülltes, vollständiges Gitter per Backtracking.
2. Zellen in zufälliger Reihenfolge entfernen, solange die Lösung eindeutig bleibt, bis die Zielzahl an Vorgaben erreicht ist.
3. Ein Logik-Löser bewertet das Rätsel (einfachste anwendbare Technik zuerst, merkt sich die schwerste nötige). Es wird nur ausgegeben, was er **vollständig ohne Raten** löst und was zur Stufe passt; sonst wird neu versucht. Die Tests prüfen, dass seine Schritte zur eindeutigen Lösung passen.

Ein Web Worker (aus dem Quelltext der Funktion per Blob gebaut, läuft auch von `file://`; ohne Worker in kleinen Zeitscheiben) füllt im Hintergrund pro Stufe einen Vorrat von 4 Rätseln in `localStorage` (`sudoku:pool-<stufe>`). Das nächste Level ist so meist sofort da; ist der Vorrat leer, erscheint kurz „Making a level…“. Ausgegebene Rätsel (`sudoku:seen-<stufe>`, die letzten 100) werden nicht erneut erzeugt.

## Speicherstand und Statistik
Gespeichert in `localStorage`: `sudoku:current` (Level in Arbeit, wird beim Öffnen fortgesetzt), `sudoku:levels-<stufe>` (gelöste Level: Rätsel + Bestzeit), `sudoku:next-<stufe>` (Rätsel des nächsten Levels), `sudoku:difficulty`, `sudoku:stats-<stufe>` (gespielt, gelöst, Bestzeit, Gesamtzeit, Serie), `sudoku:pool-<stufe>`, `sudoku:seen-<stufe>`, `sudoku:help`. Die Statistik steht in der Schwierigkeitsauswahl und im Sieg-Dialog.

Tracking (nur mit Einwilligung über den Hub): `difficulty_chosen`, `level_start`, `level_end`, `powerup_used`, siehe [`../docs/tracking.md`](../docs/tracking.md).

## Darstellung
Folgt dem hellen/dunklen Theme von kit; das Feld skaliert auf Handy-Displays, pausiert beim Verlassen der Seite und die Zeit zählt nur, solange gespielt wird.

## Tests
    node --test sudoku/test/*.test.js
