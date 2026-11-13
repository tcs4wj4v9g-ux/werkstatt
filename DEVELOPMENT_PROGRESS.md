# Entwicklungsstand – Koop-Multiplayer

Arbeitsbranch `claude/garage-kings-pwa-7nyohs`. ☑ erledigt, ◐ in Arbeit, ☐ offen. Diese Datei wird nach jeder Phase aktualisiert.

## Architektur (Phase 1)

- **Frontend** unverändert auf GitHub Pages. **Server** = Supabase (kostenloser Tarif): Anmeldung (anonyme Konten je Gerät), PostgreSQL, Realtime. Kein Host-Spieler, kein eigener Rechner.
- **Gemeinsamer Spielstand** = ein Dokument je Werkstatt (`gk_workshops.state`), dieselben Felder wie der Einzelspieler-Spielstand ohne die persönlichen (`screen`, `tool`, `carried`, `selected`, `sound`).
- **Abgleich feldweise:** Der Client vergleicht den Spielstand vor und nach jeder Aktion (`src/net/diff.ts`) und schickt kleine Schritte „Pfad, vorher, nachher“. Die Datenbankfunktion `gk_commit` übernimmt sie in einer Transaktion nur, wenn jedes „vorher“ noch stimmt. Auto-Bauteile sind einzelne Pfade → zwei Spieler können am selben Auto an verschiedenen Teilen arbeiten; dasselbe Teil, dasselbe Geld, derselbe Lagerbestand können nicht doppelt verändert werden.
- **Serverseitig geprüft:** Mitgliedschaft, Unveränderlichkeit des „vorher“, Geld nie unter null durch eine Ausgabe, Lager nie negativ, kein Auto doppelt, kein Verkauf eines Autos, an dem der Partner gerade steht, Werkzeugentnahme/-rückgabe/-kauf, Obergrenze der Werkzeugleiste, Platz in den Kisten. **Nicht** serverseitig: die Reparaturregeln selbst (ob eine Schraube lösbar ist) – die rechnet weiterhin das Spiel.
- **Werkzeuge** sind Exemplare in `gk_tools` (Kennung, Art, Heimatkiste, aktuelle Kiste oder Träger). Vier Kisten: `kiste_a` (Bühne 1), `kiste_b` (Bühne 2), `schrank` (bestehender Werkzeugschrank), `spezial` (Drehmomentschlüssel und OBD-Gerät, je genau einmal).
- **Anwesenheit:** jeder Abgleich meldet Position, Blick, Werkzeug und das Auto, an dem man steht. Wer 15 s nichts meldet, gilt als offline (Sperren fallen damit weg); nach 30 min wandern seine Werkzeuge in die Kisten zurück.
- **Echtzeit:** Der Abgleich (`gk_sync`) läuft per Abfrage und funktioniert ohne Realtime. Realtime (Broadcast) dient nur als Beschleuniger: Positionsdaten in hoher Rate und ein „es gibt Neues“-Anstoß.
- **Einzelspieler-Schutz:** Im Koop schreibt das Spiel nicht in den lokalen Spielstand; beim Verlassen wird der Einzelspielstand unverändert neu geladen.

## Dateien

- `supabase/schema.sql` – Tabellen, Zugriffsschutz, alle Funktionen. Einmalig im Supabase-SQL-Editor ausführen.
- `supabase/test/db.sh`, `supabase/test/sql-test.mjs` – lokale PostgreSQL-Instanz und 12 Datenbanktests (`npm run test:sql`).
- `e2e/coop-server.cjs` – Nachbau der Supabase-Schnittstelle (Anmeldung + Funktionsaufrufe) vor der lokalen Datenbank, damit zwei Browserfenster wirklich gegen das SQL spielen.
- `src/net/` – Abgleich im Spiel.

## Phasen

- ☑ 1 Analyse und Architektur
- ☑ 2 Online-Backend (Schema, Zugriffsschutz, Einladung, Transaktionen, Werkzeugexemplare) – 12 Datenbanktests
- ☑ 3 Gemeinsame Werkstatt im Spiel: `src/net/coop.ts` (anlegen, beitreten, öffnen, verlassen), Speicherschutz `src/game/saveGate.ts`
- ☑ 4 Spielerbewegungen und Figuren: `src/three/CoopScene.tsx` (`Avatars`), Position über Abgleich, zusätzlich Realtime-Broadcast
- ☑ 5 Gemeinsame Fahrzeuge: alle Fahrzeugfelder, Haube, Türen (`car.doors`, `toggleDoor`), Hebebühnen
- ☑ 6 Gemeinsame Reparaturen: Bauteile einzeln abgeglichen, Verkaufssperre über Anwesenheit
- ☑ 7 Werkzeugkisten (`ToolBoxes`, `CoopCabinet`) und persönliche Leisten
- ☑ 8 Geld, Lager, Kontobuch (`CoopModal`)
- ☑ 9 Menü, Statusanzeige, Wiederverbindung, Verlassen
- ☑ 10 Zwei-Spieler-Test `e2e/koop.cjs`: 59 Prüfpunkte, alle acht Pflichtszenarien, gegen das echte SQL über den Schnittstellen-Nachbau
- ☑ Echtes Supabase-Projekt eingetragen (`src/net/config.ts`) und geprüft:
  - `npm run test:live` (`supabase/test/live-check.mjs`): 16 Prüfpunkte direkt gegen den Server – Anmeldung, Anlegen, Beitreten, Zugriffsschutz, gleichzeitiger Kauf, Werkzeugexemplare, Realtime.
  - `e2e/koop-live.cjs`: zwei Spieler im Spiel gegen den Server, mit Realtime, Offline-Schalter des Browsers und Neuladen. Gemessen aus der Cloud-Testumgebung: Position des Partners 0,2–0,3 s, Spielstand-Änderungen 1,5–3 s (enthält die Trägheit der Software-Grafik im Test).

## Bekannte Grenzen

- Die Live-Tests liefen aus der Cloud-Testumgebung, nicht von einem iPad. Wie schnell der Abgleich über das WLAN des iPads ist, ist nicht gemessen.
- Spielstand-Änderungen des Partners kommen nach etwa ein bis drei Sekunden an (Abfrage nach einem Realtime-Anstoß), nicht sofort.
- Reparaturregeln prüft das Spiel, nicht der Server. Ein manipulierter Client eines Mitglieds könnte Bauteile beliebig setzen – aber weder Geld erzeugen, das die Regeln oben verletzt, noch fremde Werkstätten erreichen.
- Motorlauf, Probefahrt und Verhandlung des Partners sind nicht sichtbar (nur das Ergebnis). Waschplatz- und Lackiergeräte sind keine Exemplare.
- Die Verkaufssperre beruht auf der gemeldeten Anwesenheit (bis etwa eine Sekunde alt).
- Offline gemachte Schritte werden beim Wiederverbinden übertragen; widersprechen sie dem, was der Partner inzwischen getan hat, gilt der Serverstand und die eigenen Schritte verfallen.
- Künftige Änderungen am Spielstand-Format brauchen eine Umstellung der gespeicherten Koop-Werkstätten (noch nicht vorhanden).
- Kisten für Bühne 3 und 4 (größere Standorte) gibt es nicht; dort holt man Werkzeug aus den vorhandenen Kisten.

## Was der Projektinhaber einrichten muss

Supabase-Projekt anlegen, `supabase/schema.sql` ausführen, anonyme Anmeldung einschalten, Projekt-URL und öffentlichen Schlüssel („anon“) nennen. Genaue Anleitung: `docs/KOOP_EINRICHTUNG.md`.
