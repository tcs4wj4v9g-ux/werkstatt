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

**Fehlersuche:** Das Spiel verrät keine Ursache. Jedes Auto hat gespeicherte Defekte, von denen du zunächst nichts weißt.
Du sammelst Symptome und grenzt ein:

- 🔑 Motor starten, warm laufen lassen, Gas geben – und hinhören (unrunder Lauf, Klackern, Tickern, Rasseln, Quietschen, Zischen).
- 🔦 Prüflampe: Auto antippen für die Sichtprüfung (Motorraum, Unterboden, Bremsen), einzelne Bauteile antippen für den Zustand.
- OBD-Gerät: nur elektronisch erfassbare Fehler, nur als Code. Ein Zündaussetzer-Code nennt den Zylinder, nicht ob Spule oder Kerze schuld ist. Mechanische Schäden erzeugen keinen Code.
- Probefahrt: Leistung, Bremsen, Temperatur.
- 📋 Fahrzeugakte: beobachtete Symptome, alle denkbaren Ursachen und was du davon schon geprüft, bestätigt oder ausgeschlossen hast.

**Fehlerbilder**

| Symptome | Mögliche Ursachen |
| --- | --- |
| Unrunder Leerlauf, Fehlzündungen, Ruckeln | Zündspule, Zündkerze, Falschluft (Ansaugschlauch) |
| Metallisches Motorgeräusch | Pleuellager (klackert unter Last), Hydrostößel (tickert), Kettenspanner (rasselt beim Start) |
| Kühlmittelverlust, zu heiß | Wasserpumpe, Kühlmittelschlauch |
| Motor wird nicht warm | Thermostat |
| Ölfeuchter Motor, Öltropfen | Ventildeckeldichtung, Ölwannendichtung |
| Batterieleuchte, Quietschen | Lichtmaschine, Keilrippenriemen |
| Bremse schleift, rubbelt | Bremsbeläge, Bremsscheiben |

**Schrauben und Stecker:** Jede Schraube ist ein eigener Tipp-Punkt mit drei Zuständen: fest → mit Werkzeug gelöst (steht gelb heraus) →
mit der Hand herausgedreht. Beim Einbau umgekehrt: mit der Hand ansetzen, mit Werkzeug festziehen. Radschrauben werden nur mit dem
Drehmomentschlüssel fest. Zündspulen und Lichtmaschine haben einen Stecker; über den Zündspulen sitzt eine Motorabdeckung.
Bauteile kommen erst heraus, wenn alles davor gelöst ist. 🎯-Knöpfe fahren die Kamera nah an Motor, Rad oder Unterboden.

**Verhandeln:** Jeder Verkäufer hat einen Typ (Privatverkäufer, Schrauber, Händler, Eiliger, Rentner) mit eigenem Spielraum, eigener Geduld
und eigenem Wissen über den Wagen. Nur Auffälligkeiten, die du bei der Besichtigung selbst bemerkt hast, zählen als Argument – jedes
einmal, und nur soweit der Verkäufer den Mangel nicht schon eingepreist hat. Wer zu frech bietet, steht ohne Auto da.

**Kundenaufträge:** Am Computer unter „Aufträge". Der Kunde beschreibt nur, was ihm auffällt. Bezahlt wird (Arbeitslohn, Teile mit Aufschlag,
Zusatzarbeiten), wenn die tatsächliche Ursache behoben und das Auto komplett ist. Kundenfahrzeuge können nicht verkauft werden.

**Ton:** Alle Geräusche werden im Browser synthetisch erzeugt – es sind keine Aufnahmen echter Fahrzeuge. Der Motorklang hängt am
technischen Zustand. 🔊 in der Kopfzeile schaltet den Ton ein oder aus.

**Betriebsflüssigkeiten:** Jedes Auto hat eigenen Ölstand, Ölzustand und vorgeschriebene Ölsorte, dazu Kühlmittel und
Bremsflüssigkeit. Füllmengen hängen vom Motor ab (Vierzylinder 4,5 l, Sechszylinder 6,5 l). Flüssigkeiten werden gekauft, gelagert
und beim Einfüllen verbraucht. Der angezeigte Stand ist immer nur der zuletzt selbst abgelesene.

- Ölwechsel: anheben, Auffangwanne unterstellen, Ablassschraube lösen und wieder eindrehen, ablassen, Ölfilter tauschen,
  richtiges Öl einfüllen, Stand prüfen. Die Ölwanne lässt sich erst abnehmen, wenn das Öl abgelassen ist.
- Kühlmittel: Arbeiten an Wasserpumpe, Thermostat oder Schlauch öffnen das System – danach auffüllen und bei laufendem Motor entlüften.
- Bremsflüssigkeit: beide Vorderräder ab, je Seite mit dem Schraubenschlüssel entlüften.
- Undichte Autos verlieren über Nacht Flüssigkeit; wer mit fast leerem Ölstand fährt, ruiniert die Lager.

Die Abläufe sind spielgerecht vereinfacht und keine Werkstattanleitung.

**Hof und Ausbau:** Durch die offenen Hallentore geht es in den Hof. Am Computer unter „Ausbau" kaufst du
Stufe 2 Außenbereich (drei Stellplätze, Flutlicht), Stufe 3 Fahrzeugaufbereitung (Waschplatz), Stufe 4 Lackierkabine und
Stufe 5 größere Werkstatt (Lageranbau, 10 % Rabatt auf Teile und Flüssigkeiten, zwei Stellplätze). Alles erscheint sichtbar im Hof.
🅿 Umparken stellt ein Auto auf einen anderen freien Platz; reparieren und warten geht nur auf den Hebebühnen.

**Aufbereitung:** Am Waschplatz Gerät wählen und die Karosseriebereiche antippen: vorspülen, einschäumen (Felgen: bürsten),
abspülen, trocknen. Danach polieren; Innenraum mit Sauger, Polsterreiniger und Cockpitpflege. Schmutz, Schaum, Glanz und Rost
sind am Auto sichtbar. In der Lackierkabine erst Rost abschleifen, dann Bereich für Bereich lackieren (neun Farben).
Der Verkaufspreis steigt dadurch begrenzt – ein defektes Auto wird durch Waschen nicht wertvoll.

**Scheunenfunde:** Seltene Sechszylinder, die nur über einen Hinweis unter „Neuigkeiten" auftauchen. Verdreckt, rostig,
Batterie tot, Reifen überaltert, Teile fehlen, Flüssigkeiten am Ende. Keine Probefahrt, Transport kostet extra. Restauriert
sind sie ein Vielfaches wert – aber nur Schritt für Schritt.

**Auktionen:** Am Computer. Simulierte Händler bieten mit, jeder nur bis zu seinem eigenen Limit und mit eigener Taktik.
Auktionen laufen in Echtzeit und werden beim nächsten Start nachgeholt, wenn das Spiel zwischendurch geschlossen war.
Geld in eigenen Höchstgeboten ist so lange gebunden.

**Ereignisse:** Ab und zu gibt es Neuigkeiten – Eilauftrag, Sonderangebot, Teile-Rabatt, seltene Auktion, Scheunenfund,
Zusatzbefund am Kundenauto. Nichts davon ist Pflicht; was du liegen lässt, verfällt.

**Privatfahrzeuge:** Unter „Meine Autos" lässt sich jedes eigene Auto als Privatfahrzeug markieren und ist dann vor Verkauf geschützt.

**Preise** hängen von Modell, Baujahr, Laufleistung, offenen Schäden, Probefahrt und der täglichen Marktlage ab.
Der Spielstand (beide Autos mit jeder einzelnen Schraube, Werkzeuge, Lager, Markt, Aufträge) wird automatisch lokal gespeichert;
ältere Spielstände werden beim Laden übernommen. Das fertige Spiel braucht kein Internet und keine KI-Dienste.

## Karriere-Update: Motoren, Fuhrpark, Markt, Standorte

- **Motoren:** 15 Motoren in vier Bauarten (R4, R6, V6, V8), Benziner und Diesel, Sauger und Turbo. Jeder Zylinder hat eigene Teile:
  Benziner Zündspule + Zündkerze, Diesel Einspritzdüse + Glühkerze. V-Motoren haben zwei Bänke mit je eigenem Ventildeckel.
  Turbomotoren haben Ladeluftrohr und Turbolader, Diesel zusätzlich AGR-Ventil und Partikelfilter. Zünd- und Einspritzteile haben
  einen Restzustand in Prozent. Jede Bauart klingt anders (Zündfrequenz, V8-Blubbern, Diesel-Nageln, Turbopfeifen).
- **Ersatzteile mit Passform:** Motorteile passen nur zur Motorfamilie, Fahrwerksteile nur zur Fahrzeugklasse. Preise und Schäden
  skalieren mit dem Fahrzeugwert.
- **22 Fahrzeuge in fünf Preisklassen** (rund 3.000 € bis knapp 1 Mio. €) mit sieben Karosserieformen, eigenen Fronten, Felgen und
  Auspuffanlagen. Fahrleistungen ergeben sich aus Leistung, Gewicht und Zustand.
- **Markt:** 25 Inserate gleichzeitig, mehrere Tage Laufzeit, Filter (Klasse, Marke, Motor, bezahlbar, mit Mängeln, selten) und
  Sortierung (Preis, Kilometer, Baujahr, Leistung, Zustand). In 3D wird nur das besichtigte Auto geladen.
- **Kapitale Schäden:** Zylinderkopfdichtung (Kopf muss runter) und Getriebe (nur mit Motor- und Getriebeheber).
- **Leistungsprüfstand:** misst Leistung und Drehmoment im aktuellen Zustand und zeigt die Kurve – verrät aber nicht die Ursache.
- **Karriere:** 26 Erfolge mit einmaliger Prämie, private Sammlung mit Wert und Ansehen, Händler-Wettbewerbe gegen simulierte
  Konkurrenten, Fahrzeugtreffen mit Wertung aus den echten Fahrzeugdaten.
- **Standorte:** Profi-Werkstatt (Halle 2, dritte Hebebühne), Performance-Center (vierte Hebebühne, Prüfstand, Lackierkabine),
  Headquarters mit Showroom (ausgestellte Autos verkaufen sich teurer). Die Gebäude sind begehbar und schließen an die Stammhalle an.

Bewusste Grenzen: Die Standorte erweitern dasselbe Gelände (kein getrennter zweiter Ort). Hinterachse und Hinterradbremsen sind nicht
zerlegbar. Biturbo-Motoren haben ein Lader-Bauteil. Die Glühkerze sitzt spielmechanisch unter der Einspritzdüse. Alle Fahrzeuge,
Marken und Motoren sind frei erfunden.

## Grafik-Update

- **Karosserien:** Jede der sieben Formen (Limousine, Kombi, Kompakt, Coupé, Sportwagen, Oberklasse, Klassiker) hat eigene Länge, Breite, Radstand, Spur, Dachlinie, Bug- und Heckform. Die Außenhaut ist durchgehend gerundet, mit Charakterlinie und ausgestellten Radläufen. Leuchten, Grill, Kennzeichen und Stoßfänger folgen der Karosserieform.
- **Türen und Innenraum:** Die Vordertüren öffnen sich mit der ✋ Hand am Türgriff. Innen: Sitze mit Wangen und Kopfstützen, Armaturenbrett mit Instrumenten und Bildschirm, Lenkrad, Mittelkonsole, Pedale, Türverkleidungen.
- **Motorraum:** Motorblock, Ansaugbrücke, Abgaskrümmer, Kühlerpaket mit Lüfter, Federbeindome, Bremskraftverstärker, Klimakompressor, Schläuche. V-Motoren haben zwei geneigte Zylinderbänke mit der Ansaugbrücke im V. Alle ausbaubaren Teile sitzen an derselben Stelle wie bisher.
- **Werkstatt:** Beschichteter Boden, gemauerte Wände, Kabelpritschen, Lüftungsrohr, Abgasabsaugung, Druckluftleitung mit Schlauchaufrollern, Reifenregal, Fässer, Hebebühnen mit Fußplatten, Tragarmen und Hydraulikaggregat. Größere Standorte haben einen glänzenderen Boden und mehr Ausstattung.
- **Material und Licht:** Metallic- und Uni-Lack mit Klarlack, Spiegelungen der Hallenbeleuchtung bzw. des Himmels, Chrom, Glas, Gummi. Schmutz, Waschen und Polieren bleiben sichtbar.
- **Animationen:** Schrauben drehen sich heraus, Stecker gleiten ab, Teile werden herausgezogen und eingesetzt, beim Ölablassen läuft ein Strahl in die Wanne.
- **Grafikstufen:** Niedrig, Mittel, Hoch und Automatisch – im Menü und oben in der Hilfe. Die Automatik senkt bei dauerhaft unter 27 Bildern pro Sekunde zuerst die Auflösung, dann die Stufe. Die Wahl wird getrennt vom Spielstand gemerkt.

Alles ist weiterhin prozedural erzeugt – keine fremden 3D-Modelle, keine Bilddateien, keine Lizenzpflichten. Einzelheiten: `docs/GRAFIKPLAN.md`.

## Koop – gemeinsame Online-Werkstatt

- Im Menü: **Koop-Werkstatt erstellen** (Einladungscode entsteht), **beitreten** (Code eingeben), **bestehende öffnen**. Bis zu vier Mitglieder; niemand muss online sein, damit die anderen spielen können.
- Gemeinsam: Autos, Reparaturstand, Hebebühnen, Lager, Flüssigkeiten, Geld, Markt, Aufträge, Ausbau. Persönlich: Figur, Kamera, Werkzeugleiste.
- Werkzeuge sind einzelne Exemplare in vier Kisten (Kiste A und B an den Hebebühnen, Werkzeugschrank, Spezialwerkzeugschrank mit Drehmomentschlüssel und OBD-Gerät, die es nur einmal gibt).
- Der Einzelspielstand bleibt unberührt; im Koop wird nichts lokal gespeichert.
- Server: Supabase (kostenloser Tarif). Einrichtung: `docs/KOOP_EINRICHTUNG.md`. Architektur, Stand und Grenzen: `DEVELOPMENT_PROGRESS.md`.

## Mega-Update: Schrottplatz, Motorrevision, Motorumbau, Tuning

- **Schrottplatz:** eigener begehbarer Ort, erreichbar mit dem Lieferwagen im Hof. Sechs ausgeschlachtete Autos (Rost, fehlende Teile, manchmal ohne Motor, selten mit Tuningteilen), die sich mit der Zeit erneuern. Teile werden mit dem eigenen Werkzeug ausgebaut; jedes ausgebaute Teil hat eine eigene Kennung, kann nicht doppelt entnommen werden und kann versteckte Mängel haben. Ganze Motoren und ganze Wracks können gekauft werden.
- **Motor als Objekt:** Jeder Motor hat eine eigene Kennung und behält Typ, Kilometer, Verschleiß, Defekte, eingebaute Teile, Tuning und Historie – im Auto, am Kran, auf dem Ständer und im Motorlager.
- **Motorkran, Motorständer, Motorlager:** Ausbau nach Checkliste, Kran mit hängendem Motor, drehbarer Ständer, acht Paletten im Hof.
- **Motorrevision:** Krümmer, Steuerkette, Nockenwellen, Zylinderköpfe, Kopfdichtung, Ölwanne, Ölpumpe, Hauptlager, Kolben mit Pleuel je Zylinder, Kurbelwelle – mit Schrauben und richtiger Reihenfolge. Neue Verschleißschäden (Kolbenringe, Hauptlager, Ölpumpe, Nockenwelle, Steuerkette) mit Symptomen. Motorprüfstand für Kompression und Öldruck.
- **Motorumbau:** Kompatibilität nach Motorraumgröße, benötigte Umbauteile je Kombination, sichtbar neuer Motor, Diagnose, Klang, Leistung und Teile richten sich nach dem eingebauten Motor.
- **Leistungstuning:** Luft, Ladedruck, Kraftstoff, Kühlung, Steuergerät und mechanische Grenzen begrenzen sich gegenseitig; Überforderung führt zu Schäden. Wirkt auf Leistung, Gewicht, Traktion, Fahrverhalten, Wert und Klang.
- **Optisches Tuning in 3D:** Felgen (Form, Größe, Farbe), Fahrwerk/Tieferlegung, Front- und Heckschürze mit Diffusor, Schweller, Spoiler bis Heckflügel, Hauben, Verbreiterungen, Lackart, Folien, Leuchten, Endrohre, Sportsitze und -lenkrad.
- **Koop:** Schrottplatz, Motoren, Kran, Lager und Tuning sind gemeinsam; Werkzeug am Schrottplatz liegt in einer eigenen Kiste. **Vor dem Mergen muss `supabase/schema.sql` einmal im Supabase-SQL-Editor ausgeführt werden.**

Bewusste Grenzen: Der Kran wird über sein Bedienfenster gesteuert, nicht von Hand geschoben. Den Motor am Schrottplatz baut der Händler aus. Der Weg zum Schrottplatz ist eine Fahrt mit dem Lieferwagen (Ortswechsel), keine Fahrstrecke. Getriebe und Achsen werden nicht getauscht; Motorumbauten ändern den Antrieb nicht.

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
  repair.ts       Regeln für Schrauben, Stecker, Aus-/Einbau
  diagnosis.ts    Symptome, mögliche Ursachen, OBD, Klangbild
  market.ts       Angebote, Verkäuferprofile, Verhandlung, Bewertung
  jobs.ts         Kundenaufträge und Abrechnung
  fluids.ts       Motoröl, Kühlmittel, Bremsflüssigkeit
  detail.ts       Waschen, Polieren, Innenraum, Rost und Lack je Karosseriebereich
  auctions.ts     Auktionen mit simulierten Händlern (reproduzierbar über Startwert)
  events.ts       Zufallsereignisse
  audio.ts        synthetischer Motor und Effekte
  store.ts        Spielstand (zustand + localStorage)
src/three/        3D: Karosserie-Generator, Fahrzeugmodell, begehbare Werkstatt, Händlerhof, Teststrecke
src/ui/           Touch-Oberfläche
```

Erweitern:
- **Neues Auto**: Eintrag in `data/cars.ts`.
- **Neuer Defekt**: Bauteil in `data/components.ts`, Defekt samt Symptomen in `data/defects.ts` / `data/symptoms.ts`, Ersatzteil in `data/parts.ts`,
  3D-Darstellung in `three/CarModel.tsx`.
- **Online-Multiplayer**: Die Logik in `src/game` arbeitet auf reinen Daten und kann unverändert auf einem
  Server laufen; der Store müsste Aktionen dann an den Server senden statt lokal auszuführen.

Alle 3D-Modelle und Texturen werden im Code erzeugt (`three/carGeometry.ts`, `three/textures.ts`) – es werden keine
fremden Modelle oder Bilddateien verwendet. „Bavaria“ ist eine erfundene Marke ohne fremde Logos.
