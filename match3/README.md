# Match 3

Tausche benachbarte Steine auf einem 8×8 Feld, bilde Reihen aus mindestens drei gleichen Steinen und erreiche das Punkteziel des Levels.

## Steuerung
- Maus/Touch: zwei benachbarte Steine nacheinander anklicken oder einen Stein in Richtung des Nachbarn ziehen
- Pfeiltasten: Cursor bewegen, Leertaste/Enter: auswählen, danach Pfeiltaste: tauschen
- H: Hinweis, 1/2/3: Powerup, L: Level-Übersicht, Enter: nächstes Level, P: Pause, R: Level neu starten

## Regeln
- Ein Zug tauscht zwei benachbarte Steine. Er ist nur gültig, wenn dadurch mindestens eine Reihe aus 3+ gleichen Steinen entsteht; ungültige Züge kosten nichts und werden nicht ausgeführt.
- Gelöschte Steine lassen die darüber fallen, oben kommen neue nach. Entstehen dabei neue Reihen (Kaskade), zählen sie mit steigendem Faktor: 10 Punkte × Steine × Kaskadenstufe.
- Spezialsteine entstehen am getauschten Stein (sonst in der Mitte der Reihe):
  - 4 in einer Reihe: **Zeile** (waagerecht) bzw. **Spalte** (senkrecht) – löscht beim Auflösen die ganze Zeile/Spalte.
  - 5 oder mehr in einer Reihe: **Farbstein** – nach dem Tausch mit einem beliebigen Nachbarn verschwinden alle Steine dessen Farbe.
  - L-/T-Form (waagerecht und senkrecht ≥ 3): **Bombe** – löscht beim Auflösen das 3×3 Feld um sich.
- Spezialsteine lösen sich auch aus, wenn sie in einer Reihe stehen oder von einem anderen Spezialstein getroffen werden (Kettenreaktion).
- Zwei Spezialsteine tauschen ist immer gültig und löst beide aus. Farbstein + Spezialstein: alle Steine der Farbe des Partners werden zu diesem Spezialstein und lösen aus. Zwei Farbsteine räumen das ganze Feld.
- **100 Levels.** Jedes Level hat Züge und ein Punkteziel; Punkte zählen pro Level ab 0. Das Level ist geschafft, sobald das Ziel erreicht ist; übrige Züge geben 50 Punkte Bonus und Sterne (3 Sterne: mindestens die Hälfte der Züge übrig, 2 Sterne: ein Viertel, sonst 1). Sind die Züge weg, bevor das Ziel erreicht ist, ist das Level verloren (R: nochmal).
- **Schwierigkeit:** Alle Level nutzen 6 Farben. Die Züge sinken von 22 auf 16, das Ziel steigt von 1100 auf 2900 Punkte (`levelConfig`).
- **Endlos-Modus** (Button in der Level-Übersicht): kein Ziel, kein Zuglimit, die Punkte zählen einfach weiter. Der Bestwert wird laufend gespeichert; R startet neu.
- **Powerups** gewinnst du im Endlos-Modus: Löst du eine Kombi aus mehr als 3 Steinen auf (4er-Reihe, L-/T-Form oder größer), gibt es mit 50 % Wahrscheinlichkeit ein Powerup (Hammer 60 %, Bombe 30 %, Regenbogen 10 %) (pro Kombi, auch in Kaskaden). Genutzt werden können sie in jedem Modus, also auch in den normalen Leveln. Sie kosten keinen Zug, und der Vorrat bleibt gespeichert.
  - **Hammer:** löscht einen Stein.
  - **Bombe:** löscht das 3×3 Feld um einen Stein.
  - **Regenbogen:** löscht alle Steine der Farbe des gewählten Steins.
  - Benutzen: Button oder Taste 1/2/3 wählt das Powerup, danach den Zielstein anklicken (Tastatur: Cursor + Leertaste/Enter). Eine Vorschau markiert, was getroffen wird; Esc bricht ab. Getroffene Spezialsteine lösen wie gewohnt aus.
- Gibt es nach einem Zug keinen gültigen Zug mehr, wird das Feld automatisch neu gemischt (in allen Modi); neue Felder haben immer mindestens einen Zug.
- **Fortschritt** wird in `localStorage` (`match3:progress`) gespeichert: höchstes freigeschaltetes Level, Sterne und Bestpunkte je Level sowie den Endlos-Bestwert und den Powerup-Vorrat. Beim Start geht es im höchsten erreichten Level weiter. Die Level-Übersicht (L) zeigt alle 100 Level mit Sternen; freigeschaltete Level lassen sich wiederholen.

## Animationen
Tauschen (ungültige Züge federn zurück), Auflösen mit Partikeln und Punkte-Popups, Nachfallen und Nachrutschen, Kaskaden-Hinweis, Bildschirmwackeln bei großen Räumungen, Mischen und Level-Start. Bei `prefers-reduced-motion` werden die Animationen übersprungen.

## Tests
    node --test match3/test/*.test.js
