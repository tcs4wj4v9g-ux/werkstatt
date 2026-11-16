# Browser-Durchläufe

Echte Tipps im laufenden Spiel (Playwright, Chromium mit Software-Grafik). Voraussetzung: `playwright` global installiert.

| Durchlauf | prüft | läuft nach Änderungen an |
|---|---|---|
| `diagnose` | Markt, Verhandlung, Symptome, OBD, Schrauben/Stecker, Probefahrt, Verkauf, Kundenauftrag | Diagnose, Reparaturlogik, Verhandlung, Aufträge |
| `mechanik` | Ansaugschlauch, Kettenspanner, Hydrostößel, Pleuellager; Übernahme eines Version-2-Spielstands | Bauteile, 3D-Motorraum, Spielstand |
| `werkstatt` | Flüssigkeiten, Ölwechsel, Hof, Waschen, Polieren, Lack, Auktionen, Scheunenfund, Ereignisse | Flüssigkeiten, Hof, Aufbereitung, Auktionen |
| `schrott` | Schrottplatz: Ausbau und Kauf, Motor ausbauen, Motorständer, Umbau, Turbo, Prüfstand, Optik, Ölschäden, Blockriss und Austauschmotor, Hebebühne am Schrottplatz, Platzhalter für fehlende Teile, alter Spielstand | Schrottplatz, Motoren, Motorständer, Flüssigkeiten |
| `bremse` | Entlüfternippel | Bremsen, Radbereich |
| `motoren` | R6, V8, Diesel, Turbo: Zylinderteile, Passform, Klangbild | Motoren, Teile, 3D-Motorraum |
| `markt` | 25 Inserate, Filter, Blättern, Teileshop je Auto, Akte, Karosserie-Bilder | Markt, Shop, Karosserien |
| `karriere` | Version-4-Spielstand, Standorte, Getriebe mit Heber, Prüfstand, Showroom, Wettbewerb, Treffen | Karriere, Standorte, Spielstand |
| `tiefgarage` | Autohaus (Plätze, Rundum-Ansicht, Drehteller, Verkauf) und Tiefgaragen: Kauf, Einparken über „Umparken“, Einfahrt im Hof, begehen (Wände), Akte, Herausholen, volle Garage, Ausfahrt, Neuladen, Luxus mit 50 Autos | Tiefgaragen, Stellplätze, Orte |
| `unterboden` | Alle Modelle: Endtopf, Kraftstoffpumpe, Hosenrohr im Unterboden-Bild ausbaubar (Schrauben, Stecker, Teil) | Unterboden, Karosserieformen, neue Modelle |
| `koop` | Zwei Spieler in getrennten Browser-Profilen gegen das echte SQL-Schema: die acht Pflichtszenarien (Zugang, Reparatur, Ratschen, Spezialwerkzeug, Geld, Verbindungsabbruch, Wiederbeitritt, Einzelspieler) und die gemeinsame Tiefgarage | Koop (`src/net`, `supabase/schema.sql`), Spielstand, Werkzeuge |

```
e2e/run.sh                  # alle, drei gleichzeitig (rund 5½ Minuten)
e2e/run.sh motoren markt    # nur betroffene Bereiche
JOBS=2 e2e/run.sh           # weniger gleichzeitig (bei weniger als vier Prozessorkernen)
TEST_DPR=0.5 e2e/run.sh     # höhere Auflösung, wenn die Bildschirmfotos der Tests gebraucht werden
```

Ergebnisse und Bildschirmfotos landen in `e2e/out/` (nicht im Repository). Die Seite läuft dabei im Testmodus
(`?test`): ein Viertel der Auflösung, keine Schatten, keine Kantenglättung. Gemessen: halbe Auflösung 11 Minuten, Viertel-Auflösung 5½ Minuten. Spiellogik und Tipp-Erkennung sind dieselben.

## Koop-Tests

- `npm run test:sql` – 12 Tests direkt gegen eine lokale PostgreSQL-Instanz mit `supabase/schema.sql` (Zugriffsschutz, gleichzeitige Käufe, Werkzeugexemplare …). Braucht ein installiertes PostgreSQL.
- `e2e/run.sh koop` startet dieselbe Datenbank und `e2e/coop-server.cjs`, einen Nachbau der Supabase-Schnittstelle (Anmeldung und Funktionsaufrufe, kein Realtime). Das Spiel wird mit `?koop=<Adresse>|<Schlüssel>` darauf gerichtet.
- Gegen das echte Supabase-Projekt: `npm run test:live` (Server direkt) und `node e2e/koop-live.cjs` (zwei Spieler im Spiel, braucht `vite preview` auf Port 4173). Beide legen eine Test-Werkstatt an und schließen danach deren Einladung. Die Cloud-Umgebung braucht dafür die Projektadresse in ihrer Netzwerkliste.

## Gesamtcheck Erreichbarkeit (eigene Skripte, nicht in `run.sh`)

Prüfen für jedes Bauteil, ob Schrauben, Stecker und das Teil selbst aus einer Arbeitsansicht antippbar sind. Bei jedem Befund steht dabei, was am häufigsten im Weg war.

```
SKIP_BUILD=1 … vite preview läuft auf Port 4173
node e2e/erreichbar.cjs bmv_m4_g82 zuffen_929        # Auto: Motorraum und Unterboden (je Modell 1–3 Minuten)
node e2e/staender.cjs zuffen_929                     # Motor am Motorständer
GK_IDS=fuel_pump,muffler node e2e/erreichbar.cjs bmv_m4_g82   # nur einzelne Bauteile
```

Ohne Modellnamen laufen alle Modelle (Auto rund 35 Minuten in drei gleichzeitigen Teilen). Nach Änderungen an Karosserieformen, Motorraum oder Arbeitsansichten mindestens die betroffenen Modelle prüfen.

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
