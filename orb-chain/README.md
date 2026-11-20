# Orb Chain

Eine Kette bunter Kugeln rollt auf ein Loch zu. Der Frosch in der Mitte schießt Kugeln in die Kette: drei oder mehr gleiche Farben platzen. Räume die Kette ab, bevor sie das Loch erreicht. Kampagne mit drei Welten, drei Schwierigkeiten und ein Endlos-Modus.

## Steuerung
- Maus: zielen mit dem Zeiger, Klick schießt, Rechtsklick oder Klick auf den Frosch tauscht die Kugeln
- Tastatur: ←/→ (A/D) zielen, Leertaste (↑/W) schießen, Q (↓/S/E) tauschen
- P: Pause, R: neu starten, Esc: Menü, ?: Anleitung
- Touch: auf dem Feld ziehen zielt, Loslassen schießt, Tippen auf den Frosch oder „Swap“ tauscht; Buttons für Pause, Neustart und Menü

## Regeln
- Die Kugel im Maul des Frosches wird geschossen, die kleine auf seinem Rücken ist die nächste. Geschossen werden nur Farben, die noch in der Kette liegen.
- Fügt ein Schuss drei oder mehr gleiche Kugeln zusammen, platzen sie: 10 Punkte je Kugel, ab der vierten +10 extra. Die Kugeln auf der Lochseite machen beim Einfügen Platz.
- **Lücken:** Nach dem Platzen bleibt der Teil vor der Lücke stehen, der hintere rollt weiter und schließt sie. Treffen dabei zwei gleiche Farben aufeinander und sind zusammen mindestens drei, platzen sie erneut (**Kettenreaktion**, Punkte mal Stufe).
- **Power-ups:** Kugeln mit goldenem Ring lösen beim Platzen aus: *Slow* (Pause-Symbol, Kette 6 s langsam), *Back* (Pfeil, Kette rollt 2 s zurück), *Bomb* (räumt vier Kugeln um die Lücke).
- Ein Level ist geschafft, wenn alle Kugeln der Kette abgeräumt sind (der Balken oben zeigt den Fortschritt). Erreicht die Spitze der Kette das Loch, ist es verloren.
- **Schwierigkeit** (Easy / Normal / Hard, im Menü unter Settings und auf der Level-Übersicht; der Fortschritt gilt für alle Stufen):

  | Stufe | Tempo | Farben | Kettenlänge | Steine | Boss-HP | Zielhilfe |
  |---|---|---|---|---|---|---|
  | Easy | ×0,75 | −1 (min. 3) | ×0,85 | ×0,6 | ×0,75 | lang bis zur ersten Kugel |
  | Normal | ×1 | Welt/Level | ×1 | ×1 | ×1 | kurz |
  | Hard | ×1,25 | +1 (max. 6) | ×1,15 | ×1,4 | ×1,25 | keine |

## Kampagne
Drei Welten mit je **10 Leveln und einem Boss**, Level werden freigeschaltet, wenn das vorherige mindestens einen Stern hat. Bahnen sind Spiralen um den Frosch mit je eigener Form pro Level (`trackSpec`); Tempo, Farben (3 bis 6) und Länge steigen mit dem Level und der Welt (`levelConfig`).

- **Sterne:** ★ Level geschafft, ★★ die Spitze der Kette blieb unter 85 → 75 % der Bahn (je nach Level), ★★★ unter 60 → 45 %.
- **Meadow:** reine Bahn, ab Level 3 Power-ups.
- **Frost:** Tunnel verdecken die Kette; Kugeln im Tunnel können nicht getroffen werden.
- **Volcano:** graue **Steine** passen zu keiner Farbe und platzen erst, wenn direkt neben ihnen eine Gruppe platzt.
- **Boss:** braucht 15 Sterne aus den 10 Leveln der Welt und sitzt im Loch am Ende der Bahn. Er ist nur verwundbar, solange sein Maul **glüht**; ein Treffer schließt es kurz. Die Kette rollt dabei endlos weiter. Angriffe blinken 1,5 s oben auf dem Feld, bevor sie wirken: Sumpfkönig (*Rush*: Kette 2 s schnell), Eiswurm (Rush, *Frozen*: der Frosch kann 1,8 s nicht schießen), Magmaschlund (Rush, *Stones*: vier Steine kommen nach). Sterne nach der Siegzeit. Der Sieg öffnet die nächste Welt.
- Fortschritt in `localStorage` (`orb-chain:progress`).

## Endlos
Ein Spiel ohne Ziel auf einer langen Spirale: die Kette wird mit der Zeit schneller, mehr Farben kommen dazu, später auch Steine. Highscore in `localStorage` (`orb-chain:best`).

## Anleitung
Beim ersten Öffnen erscheint eine kurze Anleitung (4 Seiten), das Spiel wartet solange. „Skip“, Esc oder „Let's play“ schließen sie (`localStorage`, Schlüssel `orb-chain:help`). Erneut aufrufen: Button „How to play“ oder die Taste `?`.

## Darstellung
Folgt dem hellen/dunklen Theme von kit (`data-theme`, `kit-theme`, sonst Systemeinstellung); jede Welt färbt die Seite anders ein. Die Kugeln tragen zusätzlich Symbole (Punkt, Ring, Dreieck, Viereck, Raute, Kreuz), damit die Farben auch ohne Farbsehen unterscheidbar sind. Das Feld skaliert auf Handy-Displays (Hoch- und Querformat) und pausiert, wenn die Seite in den Hintergrund geht.

## Tests
    node --test orb-chain/test/*.test.js

`test/bot.js` ist ein Schütze für die Tests: er zielt auf die vorderste Kugel der geladenen Farbe (ein Mensch-Modus mit Schussabstand und Zielfehler zum Kalibrieren der Schwierigkeit) und auf das offene Boss-Maul.
