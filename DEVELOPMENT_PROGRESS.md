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

---

# Mega-Update: Schrottplatz, Motorrevision, Motorumbauten, Tuning

## Datenmodell (Phase 1)

- **Motor mit Identität:** `CarInstance.motor` (`MotorMeta`: uid, engineId, km, Spender, Turbo-Nachrüstung, Historie). `undefined` = Werksmotor, `null` = kein Motor. `engineOf(car)` liest den eingebauten Motor – dadurch zeigen Motorraum, Diagnose, Klang, Teile-Passform und Leistung automatisch den getauschten Motor.
- **Bauteile:** `components.ts` erzeugt je Motor alle Teile; neu sind die Anschlüsse am Fahrzeug (`harness`, `mounts`, `downpipe`, `fuel_pump`) und das Motorinnere mit Zugang `stand` (Krümmer, Steuerkette, Nockenwellen, zweiter Zylinderkopf beim V-Motor, Ölpumpe, Hauptlager, Kolben je Zylinder, Kurbelwelle). `def.engine` sagt, was beim Ausbau mit dem Motor wandert.
- **Motor ausgebaut:** `EngineUnit` (motor + Bauteilzustände + Öl) in `engines` (Motorlager, Paletten) bzw. `crane` (am Kran).
- **Motorständer:** Stellplatz 15 (`kind: 'stand'`) hält den Motor als Objekt mit `bare: true`. Die normale Reparaturlogik gilt; `lifted` heißt dort „gedreht, Unterseite oben“.
- **Schrottplatz:** Stellplätze 16–21 (`kind: 'junk'`), Autos mit `junk`-Info, fehlenden Teilen (`missing`), manchmal ohne Motor, selten mit Tuningteilen. Ausgebaute Teile werden sofort gekauft und als `UsedPart` mit eigener Kennung gelagert (`used`).
- **Tuningteile** sind Varianten eines Bauteils (`ComponentState.variant`), eingebaut wie jedes Ersatzteil. Steuergerät: `car.ecu`. Optik: `car.visual`, Lager `visualStock`.
- **Leistung:** `performance.ts` → `engineOutput` (Luft × Ladedruck, begrenzt durch Kraftstoff, Kühlung, Steuergerät; Risiken Klopfen, Hitze, Mechanik, Kupplung), Gewicht mit Motorgewicht, Fahrwerk, Traktion.

## Stand

- ☑ Phase 1 Datenmodell, Migration (alte Spielstände: neue Teile eingebaut ergänzt, Schrottplatz beim ersten Laden gefüllt; 15 → 22 Stellplätze)
- ☑ Phase 2 Schrottplatz: eigener Ort (Lieferwagen im Hof), sechs Wracks mit fehlenden Teilen, Rost, Preisschildern; Ausbau mit eigenem Werkzeug, Kauf beim Ausbau, eindeutige Teilekennung, keine Doppelentnahme; Wrack- und Motorkauf; Erneuerung nach Ablauf
- ☑ Phase 3 Gebrauchtteile: Zustand, versteckte Mängel, Prüfung an der Werkbank, Verkauf, Auswahl beim Einbau (neu oder gebraucht)
- ☑ Phase 4 Motorausbau: Checkliste, Kran (Fenster), Ständer drehbar, Motorlager (8 Paletten, 3D)
- ☑ Phase 5 Revision bis zur Kurbelwelle mit Abhängigkeiten und Schrauben, Verschleiß mit Symptomen, Motorprüfstand (Kompression, Öldruck)
- ☑ Phase 6 Motorumbau: Motorraumgröße, Umbauteile je Kombination, Teileshop-Abteilung „Umbau“, Einbau sichtbar, Diagnose/Klang/Leistung folgen dem Motor
- ☑ Phase 7 Leistungstuning: Luft, Ladedruck, Kraftstoff, Kühlung, Steuergerät, mechanische Grenzen; Risiken und Schäden auf Prüfstand und Probefahrt; Sportauspuff/-ansaugung lauter, nachgerüsteter Turbo pfeift
- ☑ Phase 8 Optisches Tuning in 3D (siehe README), Lager `visualStock`, Wertung im Verkaufspreis
- ☑ Phase 9 Wert: Originalität für Sammler, unsauberes Tuning, Leistungssteigerung, Motorumbau
- ☑ Phase 10 Koop: `engines`, `crane`, `used`, `visualStock` im SQL; Kennungsprüfung gegen Duplikate; Werkzeugkiste am Schrottplatz; alte Koop-Werkstätten werden beim Laden ergänzt
- ☑ Phase 11 Tests: 9 neue Logiktests (`motor.test.ts`), SQL-Test, Browser-Durchlauf `e2e/schrott.cjs` (21 Prüfungen), Koop-Durchlauf um gemeinsame Motorarbeit, gemeinsames Tuning und Wiederbeitritt mit halb zerlegtem Motor erweitert

### Grenzen (ehrlich)

- Der Kran wird über sein Fenster bedient, nicht frei durch die Halle geschoben; der Motor hängt sichtbar am Haken.
- Motoren am Schrottplatz baut der Händler aus (Aufpreis), nicht der Spieler.
- Optikteile werden im Tuningfenster montiert, nicht Schraube für Schraube.
- Motorumbau ändert weder Getriebe noch Antriebsart.
- Klang: Bauart, Turbo und Anzahl der Sportteile; keine eigene Klangfarbe je Auspuffmarke.
- Das neue `supabase/schema.sql` muss vor dem Mergen im Supabase-SQL-Editor ausgeführt werden, sonst lehnt der Server die neuen Felder ab.
- Kein echter iPad-Test – geprüft wurde in Chromium (Playwright).

## Kleine Wünsche (nach dem Mega-Update)

- ☑ Schrauben zeigen ihr Werkzeug: Beschriftung beim Anvisieren („🔧 Ratsche + 17er Nuss, festziehen mit 📏 Drehmomentschlüssel“) und Kopfform (Sechskant, Kreuzschlitz, Mutter mit Bund)
- ☑ Motor am Motorständer lässt sich wieder zurückdrehen (3D-Drehung wurde nicht zurückgesetzt)
- ☑ Schrauben drehen beim Lösen gegen, beim Eindrehen und Festziehen im Uhrzeigersinn; neu eingesetzte Schrauben werden sichtbar hineingedreht
- ☑ Hinterräder und Hinterbremsen (Rad, Sattel, Beläge, Scheibe) zerlegbar, eigene Arbeitsansichten, eigene Defekte und OBD-Code; alte Spielstände und Koop-Werkstätten werden ergänzt. Entlüften bleibt an der Vorderachse.
- ☑ Motor ohne Öl startet mit Öldruckwarnung, nach 4 s Lagerschaden (Pleuel-, Hauptlager, Nockenwelle); falsches Öl nach 15 s Laufzeit Hydrostößel defekt. Losfahren ohne Öl bleibt gesperrt.

# Fahrzeug-, Grafik- und Tiefgaragen-Update (Branch `claude/garage-kings-fahrzeuge`)

Ablauf mit verpflichtender Freigabe je Fahrzeug („Fahrzeug freigegeben“). Tiefgaragen erst nach den Fahrzeugen.

## Fahrzeug 1: Renolt Twingo 1.2 (an den Renault Twingo I angelehnt) – freigegeben

- Neue Karosserieform `mono`: 3,47 m, Radstand 2,35 m, schmale Spur, kurze gewölbte Haube, flach geneigte lange Windschutzscheibe weit vorn, gewölbtes Dach, steile Heckklappe, kastiges Heck.
- Vorderwagen je Karosserie einstellbar (`cowlX/Y`, `hoodSlope`, `hoodCurve`, `hoodX0/1`, `cabinX1`, `aBase`, `dome`, `cabinK`, `roofArc`, `planPR`); alle bisherigen Formen unverändert (Standardwerte).
- Front: runde Scheinwerfer mit Lidern, schmaler Einlass mit Rundemblem, grauer Kunststoff-Stoßfänger mit durchgehendem „Lächeln“. Heck: hohe Eckleuchten, Griffleiste, Kennzeichenmulde, grauer Stoßfänger.
- Innenraum: weit vorn liegendes Armaturenbrett mit mittiger Digitalanzeige, runde Luftdüsen, blaue Sitze.
- Technik: 1,2-l-Vierzylinder (58 PS, Teilefamilie R4), Motorraum mit allen Reparaturen; Test sichert Freiraum unter der Haube über die ganze Motorlänge für alle Karosserien.
- Geprüft: Logiktests, alle Browser-Durchläufe; am Kleinwagen Radschrauben vorn/hinten und Motorabdeckung im Bild angetippt. Kein echter iPad-Test.
- Grenzen: Raddurchmesser ist bei allen Autos gleich (für einen Kleinwagen eher groß); Lider sind feste Anbauteile und öffnen nicht mit der Haube.

## Fahrzeug 2: BMV 323i (E30) (an den BMW E30 angelehnt) – freigegeben

- Neue Karosserieform `box`: 4,33 m, Radstand 2,57 m, flache leicht abfallende Haube, stumpfe Front, steile Scheiben, schmale Säulen mit B-Säule, kurzer flacher Kofferraum, scharfe Seitenkante, eckige Draufsicht.
- Front: glänzend schwarzes Frontband mit vier runden Scheinwerfern, schmale Doppelniere mit Chromrahmen und Stäben, schwarzer Stoßfänger mit Chromleiste, Blinker im Stoßfänger, Nebelscheinwerfer im Spoiler.
- Heck: waagerechte Rückleuchten mit Rippen (rot oben, Blinker und Rückfahrlicht unten), schwarze Heckblende mit Kennzeichen, Stoßfänger mit Chromleiste. Seiten: schwarze Schutzleiste mit Chromstreifen, Chrom-Fensterrahmen, Kreuzspeichenfelgen.
- Technik: 2,3-l-Reihensechszylinder (150 PS, Teilefamilie R6), Standard-Motorraum mit allen Reparaturen, Innenraum mit Instrumentenhutze vor dem Fahrer.
- Geprüft: Logiktests, alle Browser-Durchläufe (karriere einmal zeitbedingt, Wiederholung grün). Kein echter iPad-Test.
- Motorhaube vorn angeschlagen (öffnet von hinten nach vorn, wie beim Vorbild); Arbeitsansicht „Motor von oben“ statt „von vorn“.
- Grenzen: kein Knick an der hinteren Fensterkante (die Seitenscheibe endet gerade); Front steht senkrecht statt leicht nach vorn geneigt.

## Fahrzeug 3: Porshe 356 Coupé (an den Porsche 356 angelehnt) – freigegeben

- Neue Motorbauart **Boxer** (`B4`): zwei fast waagerecht liegende Zylinderbänke (Neigung je Motor, `bankTilt`), verrippte Zylinder, flaches Kurbelgehäuse, Gebläsegehäuse; eigener Klang. Alle Bauteile wie beim V-Motor je Bank (Ventildeckel, Köpfe, Spulen, Kolben).
- **Luftgekühlt** (`air`): keine Wasserpumpe, kein Thermostat, kein Kühlmittelschlauch; Kühlmittel wird weder angezeigt noch geprüft.
- **Heckmotor** (`REAR_ENGINE`, Form `tub`): derselbe Motorraum gedreht hinter der Hinterachse und abgesenkt (`REAR_BAY`), Motordeckel mit Lüftungsgitter oben angeschlagen, Kofferraum vorn (Fuge), Spritzwand hinter den Sitzen. Arbeitsansichten „Motor von hinten“, links, rechts und Unterboden gespiegelt.
- **Umbau:** Heckmotor-Autos nehmen nur einen Boxer, Frontmotor-Autos keinen. Dabei korrigiert: Twingle und 323i hatten noch keine Motorraumgröße (hätten jeden Motor genommen).
- **Karosserie `tub`:** 3,95 m, Radstand 2,10 m, flache Fronthaube zwischen hochgezogenen Kotflügeln (`haunch`), gewölbtes Dach, langes Fließheck, runde Scheinwerfertöpfe, Hupengitter, schlanke Stoßstangen in Wagenfarbe mit Chromleiste und Hörnern, kleine runde Rückleuchten, Doppelendrohre, Chromradkappen, rote Sitze.
- Armaturenbrett und Spritzwand passen sich der Höhe der Karosserie an (vorher ragten sie beim niedrigen Coupé heraus).
- Geprüft: Logiktests (Boxer am Ständer zerlegen/zusammenbauen, Umbauregeln, Freiraum unter dem Motordeckel), alle Browser-Durchläufe; am Heckmotor die Motorabdeckung im Bild angetippt. Kein echter iPad-Test.
- Grenzen: Der Heckmotor nutzt den gemeinsamen Motorraum (Batterie und Bremsflüssigkeitsbehälter sitzen mit im Heck, Motorabdeckung wie bei den anderen Motoren); die Zündspulen liegen seitlich an den Zylinderköpfen und sind im Auto nur aus den Seitenansichten gut erreichbar.

## Fahrzeug 4: Porshe 911 Carrera (964) (an den Porsche 964 angelehnt) – freigegeben

- Neue Motorbauart **Sechszylinder-Boxer** (`B6`, 3,6 l, 250 PS, luftgekühlt) mit eigenem Klang; Teilefamilie „Boxer-6“.
- Neue Form `nine`: 4,25 m, Radstand 2,27 m, abfallende Fronthaube zwischen aufrechten ovalen Scheinwerfern, Dachlinie in einem Bogen bis zum Heck, ansteigende Gürtellinie, breite Hinterkotflügel, glatte Stoßfänger in Wagenfarbe mit schwarzer Gummileiste.
- Heck: durchgehendes rotes Leuchtenband mit Blinkern und Rückfahrlicht, breites schwarzes Lüftungsgitter auf dem Motordeckel, ovales Endrohr. Scheibenfelgen.
- Heckmotor weiter hinten als beim 365 (Motorlage je Karosserie: `bayX`); Arbeitsansichten folgen automatisch.
- Nebenbei: Grundwert des 365 auf 125.000 € (Sammlerklasse liegt im Spiel über 100.000 €); Markttest erlaubt jetzt mehr als vier Motorbauarten.
- Geprüft: Logiktests, alle Browser-Durchläufe; am Sechszylinder-Heckmotor die Motorabdeckung im Bild angetippt. Kein echter iPad-Test.
- Grenzen: Spoiler ist nicht ausfahrbar; Instrumente innen wie bei den anderen Autos (zwei Rundinstrumente statt fünf).

## Fahrzeug 5: Porshe 911 Carrera (992) (an den Porsche 992 angelehnt) – freigegeben

- Neuer Motor: 3,0-l-Sechszylinder-Boxer Biturbo (385 PS, wassergekühlt): mit Kühlkreislauf und Turbolader; der Boxer zeigt bei Wasserkühlung glatte Zylinder statt Kühlrippen und kein Gebläsegehäuse.
- Neue Form `nine2`: 4,52 m, Radstand 2,45 m, 1,80 m breit, kräftige Hinterkotflügel, Motor noch etwas weiter hinten (`bayX`).
- Front: aufrechte LED-Scheinwerfer mit vier Tagfahrlicht-Punkten, große seitliche Lufteinlässe mit Lamellen, schmale Blinkerstreifen. Heck: schmales durchgehendes LED-Band, Eckleuchten, breites Motordeckelgitter mit Senkrechtlamellen und dritter Bremsleuchte, Diffusor, zwei ovale Endrohre. Silberne Doppelspeichenfelgen eine Nummer größer.
- Geprüft: Logiktests, alle Browser-Durchläufe; am Biturbo-Heckmotor die Motorabdeckung im Bild angetippt. Kein echter iPad-Test.
- Grenzen: Spoiler fährt nicht aus; Kühler sitzen nicht wie beim Vorbild vorn, sondern gehören mit zum Heckmotorraum.

## Fahrzeug 6: Audy TT Coupé 1.8T (8N) (an den Audi TT der ersten Generation angelehnt) – freigegeben

Weitere Modelle über die fünf Startmodelle hinaus (Wunsch: auch Audis). Geplante Reihenfolge, je mit Freigabe: Audi TT, Audi Ur-quattro, VW Golf 4, Mercedes W124, BMW E36, BMW E46, Audi 80/90, Porsche 944, BMW E90, BMW F30, Porsche 997.

- Neue Form `tt`: 4,04 m, Radstand 2,42 m, kurze gewölbte Haube, Dachbogen von der Scheibe bis zum kurzen Heck, schmales stark eingezogenes Glashaus, kräftig ausgestellte runde Radhäuser.
- Front: breiter Trapezgrill mit Chromrahmen, Querstreben und rundem Emblem (kein Original-Logo), Scheinwerfer mit je zwei runden Projektoren, Nebelscheinwerfer in seitlichen Einlässen. Heck: waagerechte ovale Leuchten, Abrisslippe, zwei Endrohre, runder Alu-Tankdeckel mit Schrauben rechts hinten. Leder in Cognac.
- Neuer Motor: 1,8-l-Vierzylinder-Turbo (180 PS, Teilefamilie „R4-Turbo“), Frontmotor mit allen Reparaturen.
- Geprüft: Logiktests, Browser-Durchläufe Markt und Bremse. Kein echter iPad-Test.

## Namen und Embleme

- Nachgebildete Autos tragen leicht abgewandelte Originalnamen (privates Spiel): Renolt Twingo, BMV 323i (E30), Porshe 356, Porshe 911 Carrera (964/992), Audy TT (8N); alle bisherigen Bavaria-Modelle heißen BMV. Modellkennungen bleiben gleich – Spielstände sind nicht betroffen.
- Audy TT: Emblem aus drei verschlungenen Chromringen vorn und hinten.

## Fahrzeug 7: Audy Sport quattro S1 (an den Audi Sport quattro S1 in Rallye-Optik angelehnt) – freigegeben

- Auf Wunsch umgebaut zur Rallye-Optik nach Vorlagebild: kürzer und kastiger (Radstand 2,22 m), großer Frontsplitter, sechs runde Zusatzscheinwerfer, kleine Rechteckscheinwerfer, großer Heckflügel, Lufteinlässe mit Gitter hinter den Türen, weiße Grundfarbe mit gelbem Unterteil und Zierstreifen (feste Lackierung, ohne Sponsoren), weiße Sechsspeichenfelgen. Modellkennung unverändert.


- Neue Motorbauart **Reihenfünfzylinder** (`R5`): 2,2-l-Turbo, 220 PS, Teilefamilie „R5-Turbo“, fünf Spulen und Kerzen, eigener Klang (2,5. Ordnung). Füllmengen für fünf Zylinder ergänzt.
- Neue Form `quattro`: 4,40 m, Radstand 2,52 m, flache lange Haube, steile Scheibe, schräge Heckscheibe mit kurzem Kofferraum, eckige Draufsicht, ausgestellte Radläufe, scharfe Seitenkante.
- Front: große rechteckige Scheinwerfer mit Blinker, Grill mit Chrom-Querlamellen und drei Ringen, schwarzer Stoßfänger mit Nebelscheinwerfern. Heck: schwarze Leuchtenblende über die ganze Breite mit gerippten Rückleuchten, Kennzeichen in der Blende, Ringe, schwarzer Stoßfänger, ein Endrohr. Seiten: schwarze Schutzleiste. Silberne Scheibenfelgen.
- Nebenbei korrigiert: Die Akte nannte Boxermotoren „V-Motor“ – jetzt „Boxer“.
- Geprüft: Logiktests, Browser-Durchlauf Bremse (inkl. Fünfzylinder: fünf Spulen, Motorabdeckung im Bild angetippt). Kein echter iPad-Test.

## Fahrzeug 8: Audy A4 1.8T (B5) (an den Audi A4 B5 Limousine angelehnt) – freigegeben

- Neue Form `b5`: viertürige Limousine, 4,48 m, Radstand 2,62 m, runde Front, sanft gewölbte Haube, schwarze B-Säulen, Fondsitzbank, kurzer Kofferraum mit runder Heckkante.
- Front: Chromrahmen-Grill mit vier Lamellen und drei Ringen, Klarglas-Scheinwerfer mit zwei Reflektoren und Blinker, Nebelscheinwerfer im Stoßfänger. Heck: breite Rückleuchten, Chromleiste, Ringe, Kennzeichen in der Kofferraummulde, schwarze Stoßfängerleisten, ein Endrohr links. Silberne Speichenfelgen.
- Neuer Motor `r4t_18l`: 1,8-l-Turbo-Vierzylinder mit 150 PS (Teilefamilie R4-Turbo, wie im TT), Frontmotor, Haube hinten angeschlagen.
- Günstiger Alltagswagen (ab ca. 4.200 €), Farben Schwarz, Silber, Dunkelblau, Dunkelrot, Dunkelgrün.
- Geprüft: Logiktests, Browser-Durchläufe Bremse und Markt. Kein echter iPad-Test.

## Kleine Wünsche nach Fahrzeug 8

- **Gerissener Motorblock:** Läuft ein Motor trotz Öldruckwarnung rund 15 Sekunden ohne Öl weiter, reißt ein Pleuel ab und schlägt durch den Block. Auch extremes Drehmoment-Tuning kann das auslösen, und Schrottautos mit „Motorschaden gemeldet“ haben meist einen gerissenen Block. Ein solcher Motor startet nicht mehr und ist nicht reparabel. Die Akte, das Motorlager und der Schrottplatz zeigen das an. Der Motor ist nur noch Teileträger (Schrottwert), und das Auto verliert beim Verkauf 45 %. Abhilfe ist ein Motortausch.
- **Austauschmotor:** Im Werkstatt-Computer → Teile → Umbau gibt es jetzt fabrikneue Motoren (Original- bzw. eingebauter Motor, 0 km, ohne Öl). Sie werden ins Motorlager geliefert und sind deutlich teurer als ein Motor vom Schrottplatz.
- **Hebebühne am Schrottplatz:** Jedes Spenderauto lässt sich mit mobilen Säulenhebern anheben („▲ Auf die Hebebühne“). Dann gibt es dort die Rad- und Unterbodenansichten, Räder, Bremsen, Hosenrohr, Kraftstoffpumpe usw. lassen sich ausbauen. Abgelassen wird auch ohne Räder.
- **Fehlende Teile an gekauften Schrottautos:** Teile, die schon am Schrottplatz fehlten, zeigen jetzt den grünen Platzhalter und lassen sich mit Neu- oder Gebrauchtteil einbauen.
- Geprüft: Logiktests (inkl. neuer Tests für Blockriss, Motortausch und fehlende Teile), Browser-Durchlauf Schrott mit neuen Schritten (Blockriss, Austauschmotor, Hebebühne mit Radansicht und Ausbau von unten, Platzhalter). Kein echter iPad-Test.

## Tiefgaragen

- **Daten:** `GARAGES` in `src/game/data/workshop.ts` legt vier Garagen an (6/15/30/50 Plätze, 25.000/65.000/150.000/350.000 €). Sie sind Ausbauten (`tg_klein` … `tg_luxus`) im Werkstatt-Computer.
  - Die Stellplätze hängen als neue Platzart `garage` hinten an die bestehende Liste an (Plätze 22–122), mit eigenem Ort (`place`).
  - Werkstatt- und Schrottplatz-Plätze behalten ihre Nummern. Alte Spielstände und Koop-Werkstätten bekommen die neuen Plätze automatisch dazu, denn die Stellplatzliste darf auf dem Server wachsen.
- **Aufteilung:** Bis 15 Plätze gibt es eine Fahrgasse mit zwei Reihen, darüber zwei Fahrgassen mit vier Reihen. Die Buchten sind 2,7 × 5,4 m groß, alle drei Buchten steht eine Säule. Jede Garage hat ihren eigenen Koordinatenbereich (x ab 200/350/500/650).
- **3D (`src/three/UnderGarage.tsx`):**
  - Betonboden, Decke in 2,8 m Höhe, Wände mit gelbem Sockel, Säulen mit Warnanstrich, Radstopper, Buchtlinien und Nummern, Leuchtbänder, Rampe mit Leuchtleisten, Schilder.
  - Wände, Säulen und Linien sind je ein zusammengefasstes Netz. Je nach Grafikstufe gibt es ein bis zwei Punktlichter. Die Autos sind vereinfacht und werden nur bis 30 m Entfernung gezeichnet.
  - Im Hof gibt es eine Einfahrt mit abfallender Rampe, Portal und Schild. Die Wiese hat dort eine Aussparung.
- **Bedienung:**
  - Die Einfahrt öffnet die Garagenliste mit Belegung, „Hinunterfahren“ oder dem Kaufhinweis. Die Rampe in der Garage führt zurück in den Hof.
  - „Umparken“ bietet jede Garage als eine Zeile an (nächster freier Platz). Am eingelagerten Auto gibt es Akte, Umparken, Tuning und Probefahrt. Geschraubt wird dort nicht.
- **Geprüft:**
  - Logiktests: Platzanzahl, Buchten innerhalb der Wände und frei von Säulen, Nummern der alten Plätze.
  - Neuer Browser-Durchlauf `tiefgarage`.
  - Koop-Szenario: Einparken sichtbar beim Partner, gleichzeitiges Umparken ohne doppeltes Auto.
  - Kein echter iPad-Test.

## Platzhalter am Motor

- **Innenteile wurden als Platzhalter nicht grün:** Kolben, Kurbelwelle, Nockenwellen, Steuerkette, Ölpumpe, Hauptlager sowie Ansaug- und Abgaskrümmer behielten nach dem Ausbau ihr normales Aussehen. Es sah aus, als wären sie noch eingebaut. Diese Teile nutzen jetzt `BayMesh`: als Platzhalter grün durchsichtig, bei bekanntem Defekt rot.
  - Systematisch geprüft: Jedes Bauteil einzeln ausgebaut, am Motorständer und im Auto, bei R4, V8, R5, Diesel, Heckmotor-Boxer und Twingo. Alle Platzhalter sind grün.
- **Platzhalter über tieferen Teilen:** Ein Platzhalter (z. B. Zylinderkopfdichtung über den Kolben) ließ ein Teil darunter bisher nur vor, wenn gerade das passende Werkzeug in der Hand war. Mit der Ratsche vom Pleuellager noch in der Hand baute ein Tipp auf den Kolben deshalb unbemerkt die Kopfdichtung wieder ein. Jetzt geht ein Teil darunter vor, sobald es herausnehmbar ist, egal mit welchem Werkzeug. Der Tipp sagt dann, womit es geht. Beim Wiedereinbau, wenn das Teil darunter noch nicht heraus kann, bleibt der Platzhalter vorn.
- Geprüft: neue Schritte im Durchlauf `schrott` (Kolben mit Ratsche durch den Platzhalter antippen, dann mit der Hand herausnehmen, ausgebauter Kolben als grüner Platzhalter). Voller Satz grün. Kein echter iPad-Test.
