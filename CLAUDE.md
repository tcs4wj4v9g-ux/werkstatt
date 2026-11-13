# Arbeitsweise für dieses Projekt

Wünsche des Projektinhabers an Claude:

- **Zeitschätzung zu Beginn:** Bei jeder neuen Aufgabe zuerst die geschätzte Dauer nennen und bei längeren Aufgaben zwischendurch die verbleibende Zeit aktualisieren.
- **Nach Unterbrechungen weitermachen:** Bei längeren Aufgaben eine Erinnerung in die Sitzung einplanen (etwa fünf Stunden später), damit die Arbeit nach einem zurückgesetzten Nutzungslimit selbstständig fortgesetzt wird – auch wenn niemand zuschaut. Erinnerung löschen, sobald die Aufgabe erledigt ist.
- Antworten auf Deutsch. Gespielt wird auf einem iPad in Safari; es gibt keinen Computer.

## Testen

- Zuerst `npm test` (Logiktests, wenige Sekunden).
- Browser-Durchläufe: `e2e/run.sh` (alle, ca. 6 Minuten) oder nur die betroffenen Bereiche, z. B. `e2e/run.sh motoren markt` – Zuordnung in `e2e/README.md`. Nicht mehr als drei gleichzeitig (`JOBS`), sonst gibt es Zeitüberschreitungen.
- Sparsam testen: während der Arbeit nur `npm test` und die betroffenen Durchläufe; den vollen Satz genau einmal auf dem Endstand, nicht nach jedem Zwischenschritt.
- Bilder in voller Grafik (`e2e/galerie.cjs`) sind langsam: nur die betroffenen Modelle und Ansichten aufnehmen (`GK_VIEWS`, Modellnamen als Argumente).
- Alle Durchläufe einmal vor jedem Pull Request. Nie einen echten iPad-Test behaupten.
- Grafikänderungen zusätzlich ansehen: `e2e/galerie.cjs` nimmt Bilder in voller Grafik auf (siehe `e2e/README.md`). Ein grüner Build sagt nichts über das Aussehen.
