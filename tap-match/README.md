# Tap Match

Tippe freie Steine vom gestapelten Spielfeld in eine Leiste mit 7 Plätzen. Sobald drei gleiche Steine in der Leiste liegen, verschwinden sie. Das Spielfeld muss abgeräumt werden, bevor die Leiste überläuft.

## Steuerung
- Maus / Touch: freien Stein antippen
- U: Undo (letzten Stein zurücknehmen)
- H: Hint (lässt einen günstigen freien Stein leuchten)
- S: Shuffle
- +: ein Leistenplatz mehr (Steine des Feldes neu mischen)
- P: Pause
- R: Level neu starten
- L / Esc: Levelübersicht
- ?: Anleitung
- Touch: zusätzlich Buttons Pause/Neustart; nach Game over bzw. Level-Ende auf das Feld tippen

## Regeln
- Ein Stein ist frei, wenn kein anderer Stein darüberliegt; verdeckte Steine sind abgedunkelt.
- Gleiche Steine werden in der Leiste nebeneinander einsortiert. Drei gleiche verschwinden (10 Punkte).
- Leiste voll ohne Dreier: Game over, das Level kann neu versucht werden. Feld leer: Level geschafft (+50 Punkte), weiter zum nächsten.
- Schwierigkeit: Vor der Levelübersicht wählt man Einfach / Mittel / Schwer / Extreme (im Spiel: Easy / Medium / Hard / Extreme). Sie bestimmt die Dichte des Feldes, nicht die Motive: Steinzahl ×0,6 / ×1 / ×1,5 / ×2 und Ebenen −1 / 0 / +1 / +2. Easy und Medium nutzen das Standardfeld (13×14 Einheiten, max. 120 Steine), Hard ein größeres (15×16, max. 170) und Extreme ein großes (17×18, max. 230); auf größeren Feldern sind die Steine entsprechend kleiner dargestellt. Jede Stufe hat ihren eigenen Fortschritt, also 4 × 6 Welten; der Button „Change“ in der Übersicht wechselt die Stufe.
- Levelübersicht: 6 Welten (Orchard, Meadow, Market, Greenhouse, Harvest, Feast) mit je 50 Leveln, zusammen 300. Ein Level ist spielbar, wenn das vorherige geschafft ist; das erste Level jeder Welt ist immer spielbar.
- Jedes Level hat ein festes, lösbares Layout. Mit höherem Level kommen mehr Steine (Mittel: 21 bis 105), mehr Ebenen (2 bis 6) und neue Motive (4 am Anfang, in Welt 1 alle 5 Level ein neues, danach alle 10; alle 18 ab Level 101; selbst per Canvas gezeichnete Früchte). Ein neues Motiv wird über dem Feld angekündigt; die Übersicht zeigt die Motive der Welt.
- Vier Powerups, jeweils im Vorrat der gewählten Schwierigkeit (jede Stufe hat ihren eigenen, unbegrenzt, bleibt gespeichert); die Knöpfe zeigen die Anzahl. Jede Stufe startet mit 2× Undo, 2× Hint, 1× Shuffle und 0× +1:
  - **Undo** (U): nimmt den letzten Stein zurück, auch nach einem verlorenen Level.
  - **Hint** (H): lässt einen günstigen freien Stein leuchten.
  - **Shuffle** (S): mischt die Motive der Steine auf dem Feld neu.
  - **+1** (+): ein zusätzlicher Leistenplatz bis zum Ende des Levels (einmal pro Level, rettet auch eine volle Leiste).
- **Powerups verdienen (nur über die Serie):**
  - **Serie:** Ein sauberer Dreier sind drei gleiche Steine, die direkt nacheinander genommen werden (die letzten drei Züge). Drei saubere Dreier in Folge geben mit 50 % Chance ein Powerup (Undo 40 %, Hint 30 %, Shuffle 15 %, +1 15 %). Ein unsauberer Dreier setzt die Serie zurück; Undo nimmt auch den Serienstand zurück. Die Serie steht als ●○○ über dem Feld.
- Punkte zählen pro Level; „Best“ ist der Bestwert des Levels.
- Gespeichert in `localStorage`: `tap-match:difficulty` (letzte Stufe), `tap-match:cleared-<stufe>` (geschaffte Level), `tap-match:scores-<stufe>` (Bestwerte je Level) und `tap-match:stock-<stufe>` (Vorrat), `tap-match:help`.

## Anleitung
Beim ersten Öffnen erscheint eine kurze Anleitung (4 Seiten); später per Button „How to play“ oder `?`.

## Darstellung
Folgt dem hellen/dunklen Theme von kit; skaliert auf Handy-Displays und pausiert, wenn die Seite in den Hintergrund geht.

## Tests
    node --test tap-match/test/*.test.js
