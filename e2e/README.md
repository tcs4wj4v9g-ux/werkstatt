# Browser-Durchläufe

Echte Tipps im laufenden Spiel (Playwright, Chromium mit Software-Grafik). Voraussetzung: `playwright` global installiert.

| Durchlauf | prüft | läuft nach Änderungen an |
|---|---|---|
| `diagnose` | Markt, Verhandlung, Symptome, OBD, Schrauben/Stecker, Probefahrt, Verkauf, Kundenauftrag | Diagnose, Reparaturlogik, Verhandlung, Aufträge |
| `mechanik` | Ansaugschlauch, Kettenspanner, Hydrostößel, Pleuellager; Übernahme eines Version-2-Spielstands | Bauteile, 3D-Motorraum, Spielstand |
| `werkstatt` | Flüssigkeiten, Ölwechsel, Hof, Waschen, Polieren, Lack, Auktionen, Scheunenfund, Ereignisse | Flüssigkeiten, Hof, Aufbereitung, Auktionen |
| `bremse` | Entlüfternippel | Bremsen, Radbereich |
| `motoren` | R6, V8, Diesel, Turbo: Zylinderteile, Passform, Klangbild | Motoren, Teile, 3D-Motorraum |
| `markt` | 25 Inserate, Filter, Blättern, Teileshop je Auto, Akte, Karosserie-Bilder | Markt, Shop, Karosserien |
| `karriere` | Version-4-Spielstand, Standorte, Getriebe mit Heber, Prüfstand, Showroom, Wettbewerb, Treffen | Karriere, Standorte, Spielstand |

```
e2e/run.sh                  # alle, zwei gleichzeitig
e2e/run.sh motoren markt    # nur betroffene Bereiche
JOBS=3 e2e/run.sh           # mehr gleichzeitig (ab vier Prozessorkernen)
```

Ergebnisse und Bildschirmfotos landen in `e2e/out/` (nicht im Repository). Die Seite läuft dabei im Testmodus
(`?test`): halbe Auflösung, keine Schatten, keine Kantenglättung. Spiellogik und Tipp-Erkennung sind dieselben.

Regel: Nach einer Änderung zuerst `npm test` (Sekunden), dann nur die betroffenen Durchläufe; alle zusammen einmal vor dem Pull Request.
