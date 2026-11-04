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
- **200 Levels in zwei Welten.** Welt 1 (Level 1–100, klassisch) und Welt 2 (Level 101–200, Wände und Käfige); Welt 2 wird mit Level 100 freigeschaltet.
- **Level.** Jedes Level hat Züge und ein Punkteziel; Punkte zählen pro Level ab 0. Das Level ist geschafft, sobald das Ziel erreicht ist; übrige Züge geben 50 Punkte Bonus und Sterne (3 Sterne: mindestens die Hälfte der Züge übrig, 2 Sterne: ein Viertel, sonst 1). Sind die Züge weg, bevor das Ziel erreicht ist, ist das Level verloren (R: nochmal).
- **Schwierigkeit Welt 1:** Alle Level nutzen 6 Farben. Die Züge sinken von 22 auf 16, das Ziel steigt von 1100 auf 2900 Punkte (`levelConfig`).
- **Welt 2 – Wände und Käfige.** Jedes Level hat ein eigenes Spielfeld:
  - **Felsen** sind gesperrte Felder: Sie lassen sich nicht tauschen, nichts fällt durch sie hindurch, und sie werden nie gelöscht (auch nicht von Spezialsteinen oder Powerups). Steine fallen innerhalb der Spalte zwischen Felsen und werden von oben im jeweiligen Abschnitt nachgefüllt.
  - **Käfige** sperren einen Stein: Ein eingesperrter Stein lässt sich nicht tauschen und fällt nicht. Ein Käfig bekommt einen Treffer, wenn der Stein selbst oder ein Nachbarfeld (oben, unten, links, rechts) in einem Schritt gelöscht wird (Reihe, Spezialstein, Powerup). Graue Käfige halten einen Treffer aus, goldene zwei (je Schritt höchstens ein Treffer). Ist der Käfig weg, ist der Stein ein normaler Stein.
  - Ein Level ist geschafft, wenn das Punkteziel erreicht **und** alle Käfige zerstört sind. Die Anzahl der Käfige (2 bis 20) und Felsen (4 bis 20) wächst über die Level; Level 101–105 haben nur Felsen. Die Layouts sind fest, aber nicht handgezeichnet: 12 Felsmuster, ab Level 151 zwei kombiniert, Käfige per festem Zufall (jeder Käfig bleibt erreichbar). Mehr Käfige geben mehr Züge.
- **Endlos-Modus** (Button in der Level-Übersicht): kein Ziel, kein Zuglimit, die Punkte zählen einfach weiter. Der Bestwert wird laufend gespeichert; R startet neu.
- **Powerups** gewinnst du im Endlos-Modus: Löst du eine Kombi aus mehr als 3 Steinen auf (4er-Reihe, L-/T-Form oder größer), gibt es mit 50 % Wahrscheinlichkeit ein Powerup (Hammer 60 %, Bombe 30 %, Regenbogen 10 %) (pro Kombi, auch in Kaskaden). Genutzt werden können sie in jedem Modus, also auch in den normalen Leveln. Sie kosten keinen Zug, und der Vorrat bleibt gespeichert.
  - **Hammer:** löscht einen Stein.
  - **Bombe:** löscht das 3×3 Feld um einen Stein.
  - **Regenbogen:** löscht alle Steine der Farbe des gewählten Steins.
  - Benutzen: Button oder Taste 1/2/3 wählt das Powerup, danach den Zielstein anklicken (Tastatur: Cursor + Leertaste/Enter). Eine Vorschau markiert, was getroffen wird; Esc bricht ab. Getroffene Spezialsteine lösen wie gewohnt aus.
- Gibt es nach einem Zug keinen gültigen Zug mehr, wird das Feld automatisch neu gemischt (in allen Modi); neue Felder haben immer mindestens einen Zug.
- **Fortschritt** wird in `localStorage` (`match3:progress`) gespeichert: höchstes freigeschaltetes Level, Sterne und Bestpunkte je Level sowie den Endlos-Bestwert und den Powerup-Vorrat. Beim Start geht es im höchsten erreichten Level weiter. Die Level-Übersicht (L) zeigt beide Welten mit Sternen; freigeschaltete Level lassen sich wiederholen.

## Animationen
Tauschen (ungültige Züge federn zurück), Auflösen mit Partikeln und Punkte-Popups, Nachfallen und Nachrutschen, Kaskaden-Hinweis, Bildschirmwackeln bei großen Räumungen, Mischen und Level-Start. Bei `prefers-reduced-motion` werden die Animationen übersprungen.

## Tests
    node --test match3/test/*.test.js
