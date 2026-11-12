# Arbeitsweise für dieses Projekt

Wünsche des Projektinhabers an Claude:

- **Zeitschätzung zu Beginn:** Bei jeder neuen Aufgabe zuerst die geschätzte Dauer nennen und bei längeren Aufgaben zwischendurch die verbleibende Zeit aktualisieren.
- **Nach Unterbrechungen weitermachen:** Bei längeren Aufgaben eine Erinnerung in die Sitzung einplanen (etwa fünf Stunden später), damit die Arbeit nach einem zurückgesetzten Nutzungslimit selbstständig fortgesetzt wird – auch wenn niemand zuschaut. Erinnerung löschen, sobald die Aufgabe erledigt ist.
- Antworten auf Deutsch. Gespielt wird auf einem iPad in Safari; es gibt keinen Computer.

## Testen

- Zuerst `npm test` (Logiktests, wenige Sekunden).
- Browser-Durchläufe: `e2e/run.sh` (alle, ca. 12 Minuten) oder nur die betroffenen Bereiche, z. B. `e2e/run.sh motoren markt` – Zuordnung in `e2e/README.md`. Nicht mehr als zwei bis drei gleichzeitig (`JOBS`), sonst gibt es Zeitüberschreitungen.
- Alle Durchläufe einmal vor jedem Pull Request. Nie einen echten iPad-Test behaupten.
