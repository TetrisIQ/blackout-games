# Neues Spiel anlegen

1. `cp -r template <id>` (id: kebab-case, englisch, z. B. `snake`).
2. `game.yml` ausfüllen (nicht `.yaml`: kit würde die Datei als Manifest lesen): `id` (= Ordnername), `title`, `description`, `license`, `version`, `entry`, `controls`.
3. `README.md` im Spielordner: Regeln und Steuerung.
4. Logik in `game.js` getrennt von Rendering/Input halten; wenn möglich Tests in `test/` (`node --test <id>/test/*.test.js`).
5. Zeile in der Spieltabelle in `../README.md` ergänzen.
6. `node tools/check.mjs` muss grün sein.
7. Theme und Mobil: Farben nur über die CSS-Variablen/`PAL` aus der Vorlage (hell + dunkel prüfen: `document.documentElement.setAttribute('data-theme','dark')`), Bedienung per Touch (Wischen/Tippen/Buttons mit `.touch-only`) prüfen, z. B. im Responsive-Modus der Browser-Dev-Tools.
8. Im Browser prüfen: per `file://` und `python -m http.server`, keine Konsolenfehler, keine Netzwerkanfragen.
9. Commit: `add <id>`. Das kit-Manifest `games/<id>.yaml` entsteht beim Release (`node tools/update-catalog.mjs --tag <Tag>`, siehe CLAUDE.md Regel 10); bis dahin warnt `tools/check.mjs` nur.
