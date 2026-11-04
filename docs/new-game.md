# Neues Spiel anlegen

1. `cp -r template <id>` (id: kebab-case, englisch, z. B. `snake`).
2. `game.yaml` ausfüllen: `id` (= Ordnername), `title`, `description`, `license`, `version`, `entry`, `controls`.
3. `README.md` im Spielordner: Regeln und Steuerung.
4. Logik in `game.js` getrennt von Rendering/Input halten; wenn möglich Tests in `test/` (`node --test <id>/test/`).
5. Zeile in der Spieltabelle in `../README.md` ergänzen.
6. `node tools/check.mjs` muss grün sein.
7. Im Browser prüfen: per `file://` und `python -m http.server`, keine Konsolenfehler, keine Netzwerkanfragen.
8. Commit: `add <id>`.
