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
e2e/run.sh                  # alle, drei gleichzeitig (rund 5½ Minuten)
e2e/run.sh motoren markt    # nur betroffene Bereiche
JOBS=2 e2e/run.sh           # weniger gleichzeitig (bei weniger als vier Prozessorkernen)
TEST_DPR=0.5 e2e/run.sh     # höhere Auflösung, wenn die Bildschirmfotos der Tests gebraucht werden
```

Ergebnisse und Bildschirmfotos landen in `e2e/out/` (nicht im Repository). Die Seite läuft dabei im Testmodus
(`?test`): ein Viertel der Auflösung, keine Schatten, keine Kantenglättung. Gemessen: halbe Auflösung 11 Minuten, Viertel-Auflösung 5½ Minuten. Spiellogik und Tipp-Erkennung sind dieselben.

## Bildergalerie in voller Grafik

`e2e/galerie.cjs` ist kein Test, sondern nimmt Bilder für den Vorher-Nachher-Vergleich auf (ohne Testmodus, deutlich langsamer):

```
SKIP_BUILD=1 … vite preview läuft auf Port 4173
GK_TAG=neu node e2e/galerie.cjs                       # alle sieben Karosserieformen rundum + Motorraum
GK_TAG=neu GK_VIEWS=halle node e2e/galerie.cjs x      # nur die Halle (gibt auch Zeichenaufrufe und Dreiecke aus)
GK_GFX=low GK_VIEWS=karosserie node e2e/galerie.cjs bavaria_330
```

Hinweis für Tipps auf V-Motoren: Die Zylinderbänke sind um 0,2 rad geneigt (Drehpunkt in 0,62 m Höhe). `motoren.cjs` rechnet Bank-Koordinaten mit `tilt()` um.
Animationen (Schrauben, Stecker, Ausbau) sind im Testmodus abgeschaltet, damit Tipps nicht in eine laufende Bewegung fallen.

Regel: Nach einer Änderung zuerst `npm test` (Sekunden), dann nur die betroffenen Durchläufe; alle zusammen einmal vor dem Pull Request.
