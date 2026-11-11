# Garage Kings

3D-Autowerkstattspiel als Progressive Web App, optimiert für das iPad im Querformat.
Gebrauchtwagen kaufen, Mängel finden, selbst schrauben, probefahren, mit Gewinn verkaufen.

## Spielablauf

1. **Markt** – Start mit 6.000 €. Auto untersuchen (Motor anhören, Haube, Bremsen), verhandeln, kaufen.
2. **Werkstatt** – Kamera mit einem Finger drehen, mit zwei Fingern zoomen. Werkzeug unten wählen, Teile antippen.
   - OBD-Gerät liest Fehlercodes (Zündaussetzer, Bremsbelagverschleiß).
   - Prüflampe zeigt den Zustand einzelner Teile. Bekannte Defekte leuchten rot.
   - Haube mit der Hand öffnen, Schrauben mit der Ratsche lösen, Teile mit der Hand ausbauen.
   - Grüne Platzhalter antippen = Teil einbauen. Neuteile gibt es im Teileshop.
   - Für die Bremsen: Auto anheben, Radschrauben mit dem Radkreuz lösen, Rad, Bremssattel, Beläge.
3. **Probefahrt** – eine Runde durch alle Pylonen-Tore. Defekte sind beim Fahren spürbar.
4. **Verkauf** – Bewertung mit Abzügen für offene Mängel, einmal nachverhandeln, dann nächstes Auto.

Der Spielstand wird automatisch lokal auf dem Gerät gespeichert. Das fertige Spiel braucht kein Internet und keine KI-Dienste.

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
src/three/        3D-Szenen: Fahrzeugmodell, Markt, Werkstatt, Teststrecke
src/ui/           Touch-Oberfläche
```

Erweitern:
- **Neues Auto**: Eintrag in `data/cars.ts`.
- **Neue Reparatur**: Bauteil in `data/components.ts`, Defekt in `data/defects.ts`, Ersatzteil in `data/parts.ts`,
  3D-Darstellung in `three/CarModel.tsx`.
- **Online-Multiplayer**: Die Logik in `src/game` arbeitet auf reinen Daten und kann unverändert auf einem
  Server laufen; der Store müsste Aktionen dann an den Server senden statt lokal auszuführen.

Alle 3D-Modelle sind selbst aus Grundkörpern gebaut. „Bavaria“ ist eine erfundene Marke ohne fremde Logos.
