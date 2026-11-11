# Garage Kings

3D-Autowerkstattspiel als Progressive Web App, optimiert für das iPad im Querformat.
Gebrauchtwagen kaufen, Mängel finden, selbst schrauben, probefahren, mit Gewinn verkaufen.

## Spielablauf

Garage Kings ist eine kleine offene Wirtschaftssimulation: Es gibt keine feste Reihenfolge.
Du läufst in der Ego-Perspektive durch deine Werkstatt und entscheidest selbst, wann du kaufst, schraubst, fährst und verkaufst.

**Steuerung:** Joystick links unten zum Laufen, überall sonst wischen zum Umsehen. 🔍 zoomt für Feinarbeit.
Was du ansiehst, wird gelb hervorgehoben – antippen oder „Benutzen“ drücken.

**Stationen in der Werkstatt**

- **Computer am Schreibtisch** – Gebrauchtwagenmarkt (besichtigen, verhandeln, kaufen), eigene Autos jederzeit verkaufen,
  Teile bestellen, „Feierabend“ (nächster Tag: neue Angebote, neue Marktlage).
- **Zwei Hebebühnen** – je ein Auto, unabhängig per Bedienkasten an der Säule. Räder, Bremsen und Ölwanne gehen nur angehoben,
  der Motorraum nur abgelassen.
- **Werkzeugschrank** – du trägst höchstens drei Werkzeuge. Ratsche und Drehmomentschlüssel brauchen die passende Stecknuss.
- **Ersatzteilregal / Werkbank** – Lagerbestand, Bestellung, Übersicht der Befunde beider Autos.
- **Garagentor** – Probefahrt mit einem fahrbereiten Auto.

**Diagnose:** Nicht jeder Defekt ist sofort bekannt. Die Prüflampe zeigt sichtbare Schäden (Lecks, Riemen, Bremsen),
das OBD-Gerät elektronische Fehler (Zündung, Lichtmaschine, Thermostat, Belagverschleiß). Flecken unter dem Auto und
Symptome bei der Probefahrt geben weitere Hinweise.

**Defekte und Reparaturen**

| Defekt | Finden | Arbeitsschritte | Werkzeug |
| --- | --- | --- | --- |
| Zündspule | OBD, Probefahrt | Schraube lösen, Spule ziehen, neue einsetzen | Ratsche + 10er Nuss |
| Zündkerzen | OBD, Ausbau | Spule ab, Kerze heraus, neue hinein, Spule drauf | Ratsche + Kerzennuss 16 |
| Ventildeckeldichtung | Prüflampe | 4 Spulen, 6 Schrauben, Deckel, Dichtung | Ratsche + 10er Nuss |
| Keilrippenriemen | Prüflampe | Spanner entlasten, Riemen tauschen | Schraubenschlüssel |
| Lichtmaschine | OBD | Riemen ab, 2 Schrauben, tauschen | Ratsche + 13er Nuss |
| Wasserpumpe | Prüflampe, Kühlmittelfleck | Riemen ab, 4 Schrauben, tauschen | Ratsche + 10er Nuss |
| Thermostat | OBD | Schlauchschelle, Schlauch ab, 2 Schrauben | Schraubendreher, Ratsche + 10er Nuss |
| Bremsbeläge | OBD, Prüflampe | Rad ab, Sattel ab, Beläge tauschen | Ratsche + 17er Nuss, Drehmomentschlüssel |
| Bremsscheiben | Prüflampe | wie Beläge, dazu Halteschraube und Scheibe | zusätzlich Schraubendreher |
| Ölwannendichtung | Ölfleck, Prüflampe von unten | Bühne hoch, 4 Schrauben, Wanne, Dichtung | Ratsche + 10er Nuss |

Radschrauben werden mit der Ratsche gelöst, aber nur mit dem Drehmomentschlüssel angezogen.

**Preise** hängen von Modell, Baujahr, Laufleistung, offenen Schäden, Probefahrt und der täglichen Marktlage ab.
Der Spielstand (beide Autos, Reparaturfortschritt, Werkzeuge, Lager, Markt) wird automatisch lokal gespeichert.
Das fertige Spiel braucht kein Internet und keine KI-Dienste.

## Auf dem iPad veröffentlichen (GitHub Pages)

1. In Safari `github.com` öffnen, anmelden, dieses Repository öffnen.
2. **Settings → Pages → Build and deployment → Source: „GitHub Actions“** wählen.
3. Den Entwicklungs-Branch per Pull Request in `main` übernehmen (**Pull requests → New pull request → Merge**).
4. Unter **Actions** warten, bis „Deploy Garage Kings“ einen grünen Haken hat (ca. 1–2 Minuten).
5. Das Spiel liegt dann unter `https://<benutzername>.github.io/<repository>/`.
6. Diese Adresse in **Safari** öffnen → **Teilen-Symbol → „Zum Home-Bildschirm“ → Hinzufügen**.
7. Über das neue Icon starten: Vollbild, ohne Adressleiste, auch offline.

Hinweis: GitHub Pages ist bei kostenlosen Konten nur für **öffentliche** Repositories verfügbar.
Bei einem privaten Repository entweder unter Settings → General → „Change visibility“ auf Public stellen
oder Netlify nutzen: `app.netlify.com` → mit GitHub anmelden → „Import from Git“ → Repository wählen →
Build command `npm run build`, Publish directory `dist`.

## Entwicklung

```
npm install
npm run dev      # Entwicklungsserver
npm test         # Logiktests (Reparatur, Markt, Verhandlung)
npm run build    # Typprüfung + Produktionsbuild nach dist/
```

## Architektur

```
src/game/         reine Spiellogik, ohne React/Three.js – serialisierbar und testbar
  data/           Autos, Bauteile, Defekte, Ersatzteile, Werkzeuge (nur Daten)
  repair.ts       Regeln für Schrauben, Aus-/Einbau, Diagnose
  market.ts       Angebote, Verhandlung, Bewertung
  store.ts        Spielstand (zustand + localStorage)
src/three/        3D: Karosserie-Generator, Fahrzeugmodell, begehbare Werkstatt, Händlerhof, Teststrecke
src/ui/           Touch-Oberfläche
```

Erweitern:
- **Neues Auto**: Eintrag in `data/cars.ts`.
- **Neue Reparatur**: Bauteil in `data/components.ts`, Defekt in `data/defects.ts`, Ersatzteil in `data/parts.ts`,
  3D-Darstellung in `three/CarModel.tsx`.
- **Online-Multiplayer**: Die Logik in `src/game` arbeitet auf reinen Daten und kann unverändert auf einem
  Server laufen; der Store müsste Aktionen dann an den Server senden statt lokal auszuführen.

Alle 3D-Modelle und Texturen werden im Code erzeugt (`three/carGeometry.ts`, `three/textures.ts`) – es werden keine
fremden Modelle oder Bilddateien verwendet. „Bavaria“ ist eine erfundene Marke ohne fremde Logos.
