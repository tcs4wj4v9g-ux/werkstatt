# Koop-Werkstatt einrichten (einmalig)

Der Koop braucht einen kleinen Online-Server. Dafür wird **Supabase** im kostenlosen Tarif verwendet. Das Spiel selbst bleibt auf GitHub Pages.

## Schritte (auf dem iPad, etwa 10 Minuten)

1. **Konto und Projekt:** Auf supabase.com anmelden → „New project“ → Name und Datenbank-Passwort vergeben, Region Frankfurt, Tarif „Free“.
2. **Datenbank einrichten:** Den gesamten Inhalt von `supabase/schema.sql` kopieren, im Projekt „SQL Editor“ öffnen, einfügen, „Run“. Die Datei kann jederzeit erneut ausgeführt werden; bestehende Werkstätten bleiben erhalten.
3. **Anonyme Anmeldung einschalten:** „Authentication“ → Anmelde-Einstellungen („Sign In / Providers“) → „Allow anonymous sign-ins“ aktivieren.
4. **Zugangsdaten eintragen:** In den Projekteinstellungen unter „API“ / „API Keys“ stehen die **Project URL** und der öffentliche Schlüssel (**anon** / **publishable**). Beide gehören in `src/net/config.ts` (`PROJECT_URL`, `ANON_KEY`).

Der Schlüssel **service_role** / **secret** gehört **nicht** ins Spiel und wird nirgends gebraucht.

## Was der öffentliche Schlüssel darf

Er steht im ausgelieferten Spiel und ist dafür gedacht. Geschützt werden die Daten durch die Datenbank selbst:

- Alle Tabellen sind gesperrt (Row-Level-Security ohne Freigaben). Zugriff gibt es nur über die Funktionen in `schema.sql`.
- Jede Funktion prüft, dass das angemeldete Konto Mitglied der Werkstatt ist.
- Der Einladungscode dient nur zum Beitreten (höchstens vier Mitglieder). In der Werkstattübersicht lässt sich die Einladung schließen oder ein neuer Code erzeugen.

## Spieleridentität

Jedes Gerät bekommt beim ersten Koop-Start ein anonymes Konto, das im Browser-Speicher liegt. Wer die Website-Daten von Safari löscht oder das Gerät wechselt, ist für den Server ein neuer Spieler und muss mit dem Einladungscode neu beitreten (sein altes Mitglied bleibt bestehen und belegt einen der vier Plätze).

## Kosten und Grenzen des kostenlosen Tarifs

- Der Abgleich fragt den Server etwa einmal pro Sekunde je Spieler ab; das liegt weit innerhalb des kostenlosen Rahmens.
- Supabase pausiert kostenlose Projekte nach etwa einer Woche ohne Zugriffe. Die Daten bleiben erhalten; das Projekt muss dann im Supabase-Dashboard mit einem Klick wieder gestartet werden.
