# Tap Match

Tippe freie Steine vom gestapelten Spielfeld in eine Leiste mit 7 Plätzen. Sobald drei gleiche Steine in der Leiste liegen, verschwinden sie. Das Spielfeld muss abgeräumt werden, bevor die Leiste überläuft.

## Steuerung
- Maus / Touch: freien Stein antippen
- U: Undo (letzten Stein zurücknehmen)
- H: Hint (lässt einen günstigen freien Stein leuchten)
- S: Shuffle (Steine des Feldes neu mischen)
- P: Pause
- R: Level neu starten
- L / Esc: Levelübersicht
- ?: Anleitung
- Touch: zusätzlich Buttons Pause/Neustart; nach Game over bzw. Level-Ende auf das Feld tippen

## Regeln
- Ein Stein ist frei, wenn kein anderer Stein darüberliegt; verdeckte Steine sind abgedunkelt.
- Gleiche Steine werden in der Leiste nebeneinander einsortiert. Drei gleiche verschwinden (10 Punkte).
- Leiste voll ohne Dreier: Game over, das Level kann neu versucht werden. Feld leer: Level geschafft (+50 Punkte), weiter zum nächsten.
- Levelübersicht: 6 Welten (Orchard, Meadow, Market, Greenhouse, Harvest, Feast) mit je 50 Leveln, zusammen 300. Ein Level ist spielbar, wenn das vorherige geschafft ist; das erste Level jeder Welt ist immer spielbar.
- Jedes Level hat ein festes, lösbares Layout. Mit höherem Level kommen mehr Steine (21 bis 105), mehr Ebenen (2 bis 6) und neue Motive (4 am Anfang, in Welt 1 alle 5 Level ein neues, danach alle 10; alle 18 ab Level 101; selbst per Canvas gezeichnete Früchte). Ein neues Motiv wird über dem Feld angekündigt; die Übersicht zeigt die Motive der Welt.
- Pro Level: 2× Undo, 1× Shuffle, 1× Hint.
- Punkte zählen pro Level; „Best“ ist der Bestwert des Levels.
- Gespeichert in `localStorage`: `tap-match:cleared` (geschaffte Level), `tap-match:scores` (Bestwerte je Level), `tap-match:help`.

## Anleitung
Beim ersten Öffnen erscheint eine kurze Anleitung (4 Seiten); später per Button „How to play“ oder `?`.

## Darstellung
Folgt dem hellen/dunklen Theme von kit; skaliert auf Handy-Displays und pausiert, wenn die Seite in den Hintergrund geht.

## Tests
    node --test tap-match/test/*.test.js
