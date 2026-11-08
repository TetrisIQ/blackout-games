# Match 3

Tausche benachbarte Steine auf einem 8×8 Feld, bilde Reihen aus mindestens drei gleichen Steinen und erreiche das Punkteziel des Levels.

## Steuerung
- Maus/Touch: zwei benachbarte Steine nacheinander anklicken oder einen Stein in Richtung des Nachbarn ziehen
- Pfeiltasten: Cursor bewegen, Leertaste/Enter: auswählen, danach Pfeiltaste: tauschen
- H: Hinweis, T: zum Partner-Portal springen, ?: Anleitung, 1/2/3: Powerup, L: Level-Übersicht, Enter: nächstes Level, P: Pause, R: Level neu starten

## Regeln
- Ein Zug tauscht zwei benachbarte Steine. Er ist nur gültig, wenn dadurch mindestens eine Reihe aus 3+ gleichen Steinen entsteht; ungültige Züge kosten nichts und werden nicht ausgeführt.
- Gelöschte Steine lassen die darüber fallen, oben kommen neue nach. Entstehen dabei neue Reihen (Kaskade), zählen sie mit steigendem Faktor: 10 Punkte × Steine × Kaskadenstufe.
- Spezialsteine entstehen am getauschten Stein (sonst in der Mitte der Reihe):
  - 4 in einer Reihe: **Zeile** (waagerecht) bzw. **Spalte** (senkrecht) – löscht beim Auflösen die ganze Zeile/Spalte.
  - 5 oder mehr in einer Reihe: **Farbstein** – nach dem Tausch mit einem beliebigen Nachbarn verschwinden alle Steine dessen Farbe.
  - L-/T-Form (waagerecht und senkrecht ≥ 3): **Bombe** – löscht beim Auflösen das 3×3 Feld um sich.
- Spezialsteine lösen sich auch aus, wenn sie in einer Reihe stehen oder von einem anderen Spezialstein getroffen werden (Kettenreaktion).
- Zwei Spezialsteine tauschen ist immer gültig und löst beide aus. Farbstein + Spezialstein: alle Steine der Farbe des Partners werden zu diesem Spezialstein und lösen aus. Zwei Farbsteine räumen das ganze Feld.
- **Schwierigkeit** (wie bei Tap Match): Beim Start und über „Change“ in der Level-Übersicht wählt man Easy / Medium / Hard / Extreme. Sie bestimmt Farben, Züge, Ziel und Hindernisse; jede Stufe hat ihren **eigenen Fortschritt und eigene Powerups** (4 × 300 Level):

  | Stufe | Farben | Züge | Punkteziel | Hindernisse |
  |---|---|---|---|---|
  | Easy | 5 | ×1,2 | ×0,8 | ×0,7 |
  | Medium | 6 | ×1 | ×1 | ×1 |
  | Hard | 7 | ×1,2 | ×0,85 | ×1,1 |
  | Extreme | 8 bis 10: jede Welt startet mit 8, das letzte Level hat 10 | ×1,5 | ×0,7 | ×1,2 |

- **300 Levels in 10 Welten à 30 Level.** Jede Welt nach der ersten bringt genau ein neues Element (nur dieses), Level werden freigeschaltet, wenn das vorherige geschafft ist. Die Level-Übersicht zeigt eine Welt nach der anderen (‹ ›). Pro Level gibt es Züge und ein Punkteziel (`levelConfig`); Hindernisse geben extra Züge, die Layouts sind fest (Zufall mit festem Seed).
  1. **Classic:** kein Hindernis.
  2. **Rocks:** Felsen sind gesperrte Felder: nicht tauschbar, nichts fällt hindurch, sie werden nie gelöscht (auch nicht von Spezialsteinen oder Powerups). Gravitation und Nachfüllen laufen pro Spaltenabschnitt.
  3. **Cages:** Ein Käfig sperrt einen Stein (nicht tauschbar, fällt nicht). Er bekommt einen Treffer, wenn der Stein oder ein Nachbarfeld in einem Schritt gelöscht wird; graue halten 1 Treffer aus, goldene 2. **Alle Käfige müssen weg.**
  4. **Ice:** Eis liegt unter Steinen. Wird ein Stein darauf gelöscht, bekommt das Eis einen Treffer (dickes Eis hält 2 aus). **Alles Eis muss weg.**
  5. **Conveyors:** Förderband-Zeilen (Pfeile) rutschen nach jedem Zug um ein Feld (am Rand umlaufend); dabei entstehende Reihen lösen sich auf.
  6. **Slime:** Schleim liegt auf Feldern und verschwindet, wenn dort ein Stein gelöscht wird. Räumt ein Zug keinen Schleim, wächst er mit 50 % Wahrscheinlichkeit auf ein Nachbarfeld (nie auf Felsen). **Aller Schleim muss weg.**
  7. **Portals:** Die Steine auf zwei verbundenen Portalen (gleiche Farbe) lassen sich miteinander tauschen, auch weit voneinander entfernt (erst das eine, dann das andere antippen; T springt zum Partner). Der Tausch ist wie jeder andere nur bei einer Reihe gültig. Auch Hinweis und Neumischen kennen Portale.
  8. **Countdown:** Bomben-Steine tragen einen Zähler, der mit jedem Zug um 1 sinkt. Er bleibt ein normaler Stein (man kann ihn matchen und so entschärfen); erreicht ein Zähler 0, ist das Level verloren. **Alle Bomben müssen entschärft sein.**
  9. **Fruit:** Früchte fallen wie Steine, werden aber nie gelöscht (auch nicht von Powerups) und lassen sich nicht mit dem Farbstein tauschen. Erreicht eine die unterste Zeile, wird sie eingesammelt (100 Punkte). Weitere Früchte kommen nach und nach von oben nach. **Alle Früchte müssen unten ankommen.**
  10. **Fog:** Nebel verdeckt Steine (nur die Sicht, nicht die Regeln). Er verschwindet, wenn ein Stein auf oder neben dem Feld gelöscht wird.
- Ein Level ist geschafft, sobald das Punkteziel erreicht **und** das Element der Welt erledigt ist (Käfige, Eis, Schleim, Bomben, Früchte). Übrige Züge geben 50 Punkte Bonus und Sterne (3 Sterne: mindestens die Hälfte der Züge übrig, 2 Sterne: ein Viertel, sonst 1). Sind die Züge weg (oder explodiert eine Bombe), bevor das Ziel erreicht ist, ist das Level verloren (R: nochmal).
- **Finale:** Endet ein Level (geschafft oder verloren), lösen alle Spezialsteine auf dem Feld nacheinander aus (oben links zuerst, jeder pulsiert kurz). Jeder bringt 100 Extrapunkte plus die Punkte für alles, was er räumt. Entstehen dabei durch Kaskaden neue Spezialsteine, werden auch diese ausgelöst, bis keiner mehr da ist. Reichen die Finale-Punkte, um ein Level ohne Züge doch noch zu schaffen (und ist alles andere erledigt), gilt es als geschafft (1 Stern). Im Endlos-Modus gibt es kein Finale.
- **Endlos-Modus** (Button in der Level-Übersicht): kein Ziel, kein Zuglimit, die Punkte zählen einfach weiter. Der Bestwert wird laufend gespeichert; R startet neu.
- **Powerups** gewinnst du im Endlos-Modus (jede Schwierigkeitsstufe hat ihren eigenen Vorrat): Löst du eine Kombi aus mehr als 3 Steinen auf (4er-Reihe, L-/T-Form oder größer), gibt es mit 50 % Wahrscheinlichkeit ein Powerup (Hammer 55 %, Bombe 30 %, Regenbogen 15 %) (pro Kombi, auch in Kaskaden). Genutzt werden können sie in jedem Modus der jeweiligen Stufe, also auch in den normalen Leveln. Früchte lassen sich nicht mit Powerups treffen. Der passende Button leuchtet und poppt kurz auf, wenn du eines bekommst. Sie kosten keinen Zug, und der Vorrat bleibt gespeichert.
  - **Hammer:** löscht einen Stein.
  - **Bombe:** löscht das 3×3 Feld um einen Stein.
  - **Regenbogen:** löscht alle Steine der Farbe des gewählten Steins.
  - Benutzen: Button oder Taste 1/2/3 wählt das Powerup, danach den Zielstein anklicken (Tastatur: Cursor + Leertaste/Enter). Eine Vorschau markiert, was getroffen wird; Esc bricht ab. Getroffene Spezialsteine lösen wie gewohnt aus.
- Gibt es nach einem Zug keinen gültigen Zug mehr, wird das Feld automatisch neu gemischt (in allen Modi); neue Felder haben immer mindestens einen Zug.
- **Fortschritt** wird je Schwierigkeitsstufe in `localStorage` (`match3:progress`, Version 2) gespeichert: höchstes freigeschaltetes Level, Sterne und Bestpunkte je Level, Endlos-Bestwert und Powerup-Vorrat, dazu die zuletzt gewählte Stufe. Gespeicherter Fortschritt aus der alten Version (2 Welten, ohne Stufen) wird nicht übernommen. Beim Start wählt man zuerst die Stufe und landet in der Level-Übersicht.

## Animationen
Tauschen (ungültige Züge federn zurück), Förderbänder, Auflösen mit Partikeln und Punkte-Popups, Nachfallen und Nachrutschen, Kaskaden-Hinweis, Bildschirmwackeln bei großen Räumungen, Mischen und Level-Start. Bei `prefers-reduced-motion` werden die Animationen übersprungen.

## Anleitung
Beim ersten Öffnen erscheint eine kurze Anleitung in fünf Seiten (Match-Regel, Spezialsteine, Hindernisse, weitere Elemente, Schwierigkeit/Powerups/Endlos); „Skip“, Esc oder „Let's play“ schließen sie, und danach kommt sie nicht mehr von allein (`helpSeen` im gespeicherten Fortschritt). Erneut aufrufen: Button „How to play“ in der Level-Übersicht oder die Taste `?`. Pfeiltasten blättern, Esc schließt.

## Darstellung
Folgt dem hellen/dunklen Theme von kit (`data-theme`, `kit-theme`, sonst Systemeinstellung). Für Handys: Das Feld skaliert, Hinweis/Neustart/Level-Buttons und Powerup-Buttons sind groß genug, Tippen auf das Feld setzt nach einem Level fort, die Level-Übersicht zeigt 6 Spalten pro Welt.

## Debug-Fenster
In der Browser-Konsole `debug_window()` eingeben (`debug_window(false)` schließt es). Das Fenster zeigt live den Zustand (Level, Stufe, Züge, Punkte, offene Ziele, gültige Züge, Powerups) und bietet:
- **Level:** Schwierigkeit wechseln, Level direkt starten (auch gesperrte), Vor/Zurück, Endlos, Gewinnen, Verlieren, Neu starten, alle freischalten, Fortschritt zurücksetzen.
- **Züge/Punkte:** Züge ± , unendliche Züge, Punkte ±.
- **Powerups:** je Typ +1, +5 oder auf 0; die Vergabe-Wahrscheinlichkeit für Kombis einstellen (z. B. 100 %).
- **Feld:** mischen, alle Käfige brechen, Hinweis, Feld auflösen; „click-to-place“ setzt per Klick Steine, Spezialsteine (Zeile, Spalte, Bombe, Farbstein), Käfige, Felsen, Eis, Schleim, Nebel, Bomben-Steine, Früchte oder zufällige Steine.
- **Ansicht:** Animationsgeschwindigkeit (auch sofort), Theme hell/dunkel/auto, Zustand in die Konsole loggen.

Dieselben Aktionen gibt es in der Konsole als `match3_debug` (z. B. `match3_debug.goto(150)`, `match3_debug.setPowerup("bomb", 9)`, `match3_debug.state`).

## Tests
    node --test match3/test/*.test.js
