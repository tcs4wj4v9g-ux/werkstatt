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

## Twingo-Optik, Unterboden, Tages-Timer

- **Twingo (Renolt Twingo 1.2) realistischer**, nach Fotos des Projektinhabers:
  - Front: große runde „Froschaugen“-Scheinwerfer mit grauer Fassung und Klarglas statt der Lackhöcker darüber, drei Lüftungsschlitze vorn rechts in der Haube (schwenken mit), Raute als Emblem unter der Haubenkante, runde Blinkleuchten außen im grauen Stoßfänger.
  - Die Haube fällt stärker ab (Van-Linie).
  - Graue Schutzleiste an Tür und Seitenteil, Kennzeichen hinten in der Heckklappe.
  - Graue Stoßfänger vorn und hinten bis ganz unten.
- **Unterboden: drei neue Baugruppen**, jeweils mit Defekt, Symptomen, Ersatzteil (Fahrwerksteil, Passform je Fahrzeugklasse), Schrauben und 3D-Modell:
  - Endschalldämpfer: Defekt „Durchgerosteter Endschalldämpfer“. Symptome: Der Auspuff dröhnt hörbar lauter, und von unten sind Rost und Ruß zu sehen.
  - Querlenker vorne links und rechts: Defekt „Ausgeschlagenes Querlenkerlager“. Symptome: Poltern auf der Probefahrt, rissiges Lager von unten.
  - Spurstangenköpfe vorne links und rechts: Defekt „Ausgeschlagener Spurstangenkopf“. Symptome: Lenkspiel auf der Probefahrt, gerissene Manschette von unten.
  - Alte Spielstände und Koop-Werkstätten bekommen die Teile heil eingebaut dazu, auch an Inseraten, Auktionen und Aufträgen.
- **Tages-Timer:** Ein Spieltag dauert 3 Minuten Echtzeit. Der Feierabend-Knopf zeigt den Countdown und ist bis dahin gesperrt.
  - Der Timer zählt je Gerät (nicht im Koop geteilt). Beendet der Partner den Tag, beginnt er auch hier neu.
  - Im Testmodus (`?test`) wird nicht gewartet.
- Geprüft: Logiktests; Browser-Durchläufe `bremse` (Sichtprüfung von unten, Querlenker-Schrauben im Unterboden-Bild, Ausbau und Neuteile) und `markt` (Timer); voller Satz. Kein echter iPad-Test.

## Hosenrohr am B5, Tuning-Kundenaufträge

- **Hosenrohr ließ sich am Audy A4 (B5) nicht ausbauen:** Der B5 sitzt tiefer (Bodenfreiheit 0,26 m). Dadurch lag das Rohr im Unterboden-Blech, und ein Tipp darauf traf nichts. Das Rohr hängt jetzt immer knapp unter dem Wagenboden.
  - Bei allen 30 Modellen im Bild geprüft.
  - Dabei gefunden: Beim Diesel lag der Partikelfilter über einer Hosenrohr-Schraube. Er sitzt jetzt etwas weiter außen.
- **Tuning-Kundenaufträge:** Etwa jede fünfte Anfrage ist ein Tuningwunsch, eher an Mittelklasse- und Sportwagen. Es gibt fünf Arten:
  - Sportabgasanlage
  - Sportluftfilter
  - mindestens 12 % mehr Leistung, sauber abgestimmt
  - Felgen und Sport- oder Gewindefahrwerk
  - Sport-Frontstoßstange und Heckspoiler
- Abrechnung und Anzeige der Tuningaufträge:
  - Der Auftrag zeigt jeden Wunsch mit ✓/○.
  - Abgerechnet wird, wenn alle Wünsche verbaut sind: Arbeitslohn je Fahrzeugklasse plus Teile mit 15 % Aufschlag. Optikteile werden am Kundenauto zum vollen Preis berechnet.
- Geprüft:
  - Logiktests, darunter ein neuer Test für Tuningaufträge.
  - `bremse`: Hosenrohr bei B5 und Diesel im Unterboden-Bild ausgebaut.
  - `markt`: Tuningauftrag annehmen, Sportabgasanlage einbauen, abrechnen.
  - Kein echter iPad-Test.

## Fahrzeug 9: BMV M5 (E34) (an den BMW E34 M5 angelehnt) – freigegeben

- Neue Form `e34`: Sportliche Oberklasse-Limousine um 1990.
  - Maße: 4,70 m lang, Radstand 2,76 m.
  - Lange flache Haube, vorn angeschlagen wie beim E30 („Motor von oben“).
  - Leicht vorgeneigte Haifischnase, lange Kabine mit schmalen schwarzen Säulen, kurzer gerader Kofferraum.
- **Front (nach Fotos des Projektinhabers überarbeitet):** schwarzes Band über die ganze Breite. Darin außen die orangen Blinker, je ein großer und ein kleinerer Rundscheinwerfer mit Chromring, waagerechte Lamellen zur Mitte und eine breite flache Doppelniere. Rundes blau-weißes Emblem auf der Haubenspitze.
- Unten silbergrau abgesetzt: Stoßfängerunterteil vorn und hinten, Schweller. Der Stoßfänger ist in Wagenfarbe, mit schwarzer Leiste, Lufteinlass, Spoilerlippe und Nebelscheinwerfern.
- **Heck:** breite gerippte Rückleuchten bis in die Flanke, Emblem und Kennzeichen in der Kofferraumklappe, zwei Endrohre links.
- **Seite und Räder:** schwarze Schutzleiste an der Seite, große Turbinen-Felgen (+1 Zoll).
- **Neuer Motor `r6_36m`:** 3,6-l-Reihensechser mit Einzeldrosselklappen, 315 PS, 360 Nm. Eigene Teilefamilie „R6-M“ (teure Teile), Motorraum wie die anderen R6.
- **Im Spiel:**
  - Sportklasse, selten, Grundwert 36.000 €, Baujahre 1988–1995.
  - Farben: Dunkelblau, Schwarz, Silber, Dunkelgrün, Dunkelrot.
  - Motorraum 3 (passt auch ein V8 hinein).
- Neues Material „blau“ (Emblem).
- Geprüft:
  - Logiktests: Haubenfreiraum, Proportionen, Marktlayouts.
  - Browser-Durchläufe `markt` und `bremse`.
  - Motorraum über „Motor von oben“ angesehen.
  - Kein echter iPad-Test.

## Tuningteile im Motorraum erkennbar

- Beim Anvisieren nennt die Beschriftung das Tuningteil, z. B. „Abgaskrümmer – Fächerkrümmer (Tuning)“ oder „Turbolader – Größerer Turbolader (Tuning)“.
- Eigene Optik je Tuningteil:
  - Fächerkrümmer: Edelstahl mit blau-goldenen Anlauffarben (neues Material `heat`), dazu ein blanker Sammler mit Flansch statt braunem Guss.
  - Größerer Turbolader: blau eloxiertes Verdichtergehäuse (und größer).
  - Hochleistungs-Einspritzdüsen: rot.
  - Geschmiedete Kolben: angelaufener Kolbenboden und Stahlpleuel.
  - Schon vorher unterschiedlich: Sportluftfilter (rot), Sportabgasanlage (blank), Sportnockenwellen (gelb), Hochleistungs-Kraftstoffpumpe (rot), Ladeluftkühler-Kit.
- Geprüft: Logiktests; Browser-Durchläufe `motoren` (neuer Schritt: Tuning-Beschriftung), `schrott`, `mechanik`; Bilder des Motorraums mit und ohne Tuning angesehen. Kein echter iPad-Test.

## Kupplung und Kühler als Bauteile (auch fürs Tuning)

- Bisher gab es die verstärkte Kupplung und den größeren Kühler nur automatisch beim Motorumbau. Die Akte warnte bei mehr Ladedruck zwar „Kupplung rutscht – verstärkte Kupplung“, nachrüsten ließ sie sich aber nicht.
- **Neues Bauteil Kupplung** (`clutch`):
  - Sitzt im Kupplungsgehäuse und ist erst nach dem Getriebe erreichbar, also von unten und mit dem Getriebeheber. Drei Schrauben mit 13er Nuss.
  - Ersatzteil „Kupplungssatz“, Tuning-Ausführung „Verstärkte Kupplung“ (goldener Sinterbelag, blaue Druckplatte, „(Tuning)“ in der Beschriftung).
  - Neuer Schaden „Verschlissene Kupplung“ mit dem Symptom „Kupplung rutscht“ auf der Probefahrt und Leistungsverlust.
- **Neues Bauteil Kühler** (`radiator`):
  - Vorn im Motorraum, oberer Wasserkasten unter dem Schlossträger mit zwei 10er-Schrauben. Er liegt bewusst nicht höher, sonst verdeckt er beim Blick von vorn den Riemen. Erst den Kühlmittelschlauch abnehmen (Kühlmittel ab), danach wieder füllen und entlüften.
  - Ersatzteil „Kühler“, Tuning-Ausführung „Größerer Kühler“ (blankes Alunetz, Alu-Wasserkästen).
  - Neuer Schaden „Undichter Kühler“: Kühlmittelverlust, Motor wird zu heiß.
  - Luftgekühlte Boxer haben keinen Kühler. Beim wassergekühlten Heckmotor-Boxer (992) gibt es den Kühler vorerst nicht als Bauteil.
- **Wirkung und Shop:**
  - Die Leistungsberechnung nutzt die eingebauten Tuningteile (Kupplung hält 2,3- statt 1,35-faches Serien-Drehmoment, Kühler +25 % Kühlleistung).
  - Beide Tuningteile stehen im Teileshop unter „Tuning“.
- **Alte Spielstände und Umbauten:**
  - Bisherige Motorumbauten mit diesen Teilen werden beim Laden als eingebaute Tuningteile übernommen (Einzelspieler und Koop).
  - Ein neuer Umbau setzt sie direkt ein.
  - Der Umbauplan verlangt sie nicht doppelt, wenn sie schon verbaut sind.
- **Getriebe-Platzhalter** hängt tiefer unter dem Auto, damit darüber die Kupplung frei antippbar bleibt.
- **Geprüft:**
  - Logiktests: Wirkung ohne Umbau, Lage hinter Getriebe bzw. Schlauch, Übernahme alter Umbauten.
  - Diagnose-Test: fester Testauftrag auch ohne zufälligen Tuningwunsch.
  - Browser-Durchlauf `karriere`: Getriebe raus, Kupplung im Bild abschrauben und herausnehmen, verstärkte Kupplung einsetzen und festziehen, Austauschgetriebe wieder rein.
  - Bilder des Motorraums angesehen.
  - Kein echter iPad-Test.

## Porsche-Bremsen und Hebebühnen-Arme

- **Bremsen beim Porsche nicht erreichbar:** Die Porsche haben eine schmale Spur (bis 15 cm schmaler), dadurch sitzen Scheibe, Sattel und Beläge weiter innen. Die Radhaus-Innenwand der Karosserie lag aber bei allen Autos gleich und verdeckte sie. Die Wand richtet sich jetzt nach der Spur vorn bzw. hinten und liegt immer innen von der Bremse.
- **Tragarme griffen in die Reifen:** Die Teller der Hebebühne lagen für alle Autos an derselben Stelle, beim kurzen 356 (Radstand 2,1 m) unter dem Hinterrad. Die Arme richten sich jetzt nach Radstand und Breite des Autos: Die Teller greifen hinter dem Vorderrad und vor dem Hinterrad unter dem Schweller.
- Geprüft:
  - Logiktests: für jede Karosserie Teller mit Abstand zu beiden Rädern.
  - Browser-Durchlauf `bremse`: Beläge im Bild angetippt und herausgenommen, beim 964 vorn und hinten, beim 356 vorn und beim 992 hinten.
  - Kein echter iPad-Test.

## Fahrzeuge 10–13 (auf Wunsch ohne Zwischenfreigabe nacheinander gebaut, nach Fotos des Projektinhabers)

- **10: Volksvagen Golf GTI (Mk2)**, Form `golf2`:
  - Kantiger Dreitürer, 3,95 m, Radstand 2,47 m, kurze Haube mit stumpfer Front, steile Scheibe, hohes Dach, breite C-Säule, fast senkrechte Heckklappe.
  - Front: schwarzes Grillband mit Lamellen und rotem Zierstreifen, je ein großer und ein kleiner Rundscheinwerfer, rundes Emblem.
  - Schwarze Stoßfänger und breite Seitenleiste mit roter Linie, breite Rückleuchten, Kreuzspeichenfelgen.
  - Motor `r4_18g` (1,8 l, 112 PS). Budget, ab ca. 6.800 €.
- **11: Mercedez 190E 2.5-16 Evolution II**, Form `evo2`:
  - Kompakte Sportlimousine, 4,43 m, mit Kastenverbreiterungen (stark ausgestellte Radläufe), tief.
  - Front: breite Klarglasscheinwerfer mit Blinker außen, Chromgrill mit Stäben und Stern, großer schwarzer Frontsplitter.
  - Heck: großer Heckflügel auf zwei Stützen mit Seitenplatten und Gurney-Kante, Abrisskante, gerippte Rückleuchten, Doppelendrohr. Seitenschweller.
  - Motor `r4_25e` (2,5-l-16V, 235 PS, Teilefamilie R4-16V). Sammlerstück (blauschwarz, 165.000 €).
- **12: BMV M2 (G87)**, Form `g87`:
  - Kompaktes kantiges Sportcoupé, 4,25 m, breite Backen.
  - Front: große eckige waagerechte Niere mit Lamellen, schmale Scheinwerfer mit zwei Leuchtbalken, große schwarze Einlässe außen und in der Mitte, Kiemen hinter dem Vorderrad.
  - Heck: dunkle schmale Leuchten mit roten Balken, Diffusor mit vier Endrohren, Abrisskante.
  - Motor `r6t_30m2` (3,0-l-Biturbo, 460 PS, Teilefamilie R6-M-Turbo).
- **13: BMV M4 (G82)**, Form `g82`:
  - Großes Sportcoupé, 4,56 m, lange Haube.
  - Front: riesige hohe Niere bis in den Stoßfänger, Kennzeichen darunter, kleinere Seiteneinlässe. Rest wie M2.
  - Motor `r6t_30m4` (510 PS).
- Geprüft: Logiktests (Proportionen, Haubenfreiraum, Hebebühnen-Teller für jede neue Form), Browser-Durchläufe `markt` und `bremse`, Bilder in voller Grafik. Kein echter iPad-Test.

## M2 und M4 näher am Original (nach Recherche)

- Echte Maße übernommen (Quellen: BMW-Datenblätter über carexpert.com.au, vehiclesizes.com): M2 4,58 m lang, Radstand 2,75 m, 1,40 m hoch. M4 4,79 m lang, Radstand 2,86 m, 1,39 m hoch. Beide 1,89 m breit. Der M2 war vorher mit 4,25 m deutlich zu kurz.
- Kantigere Karosserie: eckigere Front, Heck und Draufsicht, weniger eingezogene Seitenscheiben (weniger „Blase“), längerer Kofferraum, tiefere Charakterlinie, kräftigere Backen.
- Carbondach: dunkle gewölbte Fläche, die genau dem Kabinenquerschnitt folgt.
- Ab Werk dunkle Felgen (+1 Zoll). Eckigere Scheinwerfer mit abgeknickter Spitze zur Niere. Schärfere Nierenecken, größere M2-Niere, größere M4-Seiteneinlässe.
- Geprüft: Logiktests (Proportionen, Haubenfreiraum, Hebebühnen-Teller), Browser-Durchläufe `markt` und `bremse`, Bilder in voller Grafik. Kein echter iPad-Test.

## Autohaus (Ausstellungsraum)

- Eigener begehbarer Ort, Eingang „AUTOHAUS“ am Hofrand (Zaunseite gegenüber dem Stellplatz). Heller Raum mit poliertem Boden, Lichtbändern, Glasfront und Empfangstresen.
- **Plätze:** zwei Ausstellungsplätze von Anfang an, jeder weitere einzeln kaufbar (Werkstatt-Computer → Ausbau, „Ausstellung“), bis acht. Preise: 8.000, 12.000, 18.000, 26.000, 36.000, 50.000 €. Im Raum zeigt eine Bodenmarkierung den nächsten kaufbaren Platz.
- **Drehteller** je Platz mit Leuchtring und Deckenspot. Das Auto dreht sich langsam und lässt sich anhalten.
- **Rundum-Ansicht:** Knopf am Auto. Die Kamera kreist per Wischen um das Auto, zwei Finger zoomen (Abstand 2,7 bis 4,1 m, bleibt im Raum).
- Autos kommen über „Umparken“ hinein und heraus. Ausgestellte Autos verkaufen sich wie im Showroom 4 % teurer und zählen bei der Sammlung mehr. Geschraubt wird dort nicht.
- Technik: neue Platzart `expo` (Plätze 123–130, hinten angehängt; alte Spielstände und Koop-Werkstätten werden automatisch erweitert), Ausbauten `expo3`–`expo8`. Kein neues Speicherformat, keine Schema-Änderung.
- Geprüft: Logiktests (Platzzahl je Ausbau, Preise, Reihenfolge, Lage im Raum); Browser-Durchlauf `tiefgarage` mit neuen Schritten (Umparken, Platzkauf, Eingang, Rundum-Ansicht per Wischen, Drehteller, Verkauf, Ausgang). Kein echter iPad-Test.

## Unterboden beim Veloce Stradale V8 (und allgemein)

- **Endschalldämpfer:** Die zweite Schraube saß oben auf dem Topf und war von unten verdeckt. Sie sitzt jetzt an der Gummiaufhängung unter dem Topf.
- **Kraftstoffpumpe:** Sie hing fest in 30 cm Höhe und steckte bei tiefen Autos (Veloce: Bodenfreiheit 23 cm) im Wagenboden. Jetzt hängt sie immer knapp unter dem Boden. Ihre Schrauben sitzen an den Flanschecken außen, damit die Mitte frei antippbar bleibt.
- **Herausgedrehte Schrauben** haben eine kleinere Trefferzone (2,6 statt 4,6 cm). Vorher deckten die leeren Schraubenlöcher die Pumpe fast ganz ab, und ein Tipp setzte die Schraube wieder an, statt die Pumpe herauszunehmen.
- Neuer Browser-Durchlauf `unterboden`: Bei allen 35 Modellen werden Endtopf, Kraftstoffpumpe und Hosenrohr im Bild ausgebaut. Die Kamera wird dafür auf das Teil gerichtet, getippt wird auf die sichtbaren Schraubenköpfe, den Stecker und das Teil.
- Geprüft: Logiktests, Durchläufe `unterboden`, `bremse`, `schrott`. Kein echter iPad-Test.

## Gesamtcheck: Ist alles erreichbar? (Porsche, Unterboden, Motorständer)

- **Neue Prüfskripte** (keine festen Durchläufe, dauern länger):
  - `e2e/erreichbar.cjs [Modell …]`: Für jedes Modell und jedes Bauteil wird alles davor ausgebaut. Dann wird geprüft, ob Schrauben, Stecker und das Teil selbst aus einer Arbeitsansicht antippbar sind: im Bild (etwas Wischen ist erlaubt), höchstens 4,2 m entfernt und als erster Treffer entlang des Blicks. Bei einem Fehler steht dabei, was im Weg ist. Alle 35 Modelle in drei Teilen dauern rund 35 Minuten.
  - `e2e/staender.cjs [Modell …]`: dasselbe für alle Motorbauarten am Motorständer, von Standpunkten rund um den Ständer.
  - `GK_IDS=a,b` prüft nur einzelne Bauteile.
- **Unterboden hinten:** neue Arbeitsansicht unter dem angehobenen Auto mit Blick nach hinten. Dort liegen Kraftstoffpumpe, Getriebe und Endtopf im Bild. Vorher sah man von unten nur den Motor. Die Pumpe beim M4 lag in keiner Ansicht im Bild.
- **Porsche (Heckmotor, Boxer):**
  - Die seitlichen Motoransichten schauen steil über den Kotflügel durch die Deckelöffnung, statt auf das Blech.
  - Der offene Motordeckel fängt keine Tipps mehr ab. Zum Schließen tippt man auf seine Kante.
  - Der Block beim Boxer fängt nur noch in der Mitte Tipps ab. Zündkerzen, Spulen und Schrauben an den flach liegenden Zylindern sind frei.
  - Kopf- und Nockenwellenschrauben sitzen auf der oberen Seite der Köpfe.
  - Die Tippfläche des Keilriemens liegt beim Boxer nur oben.
  - Der Endtopf sitzt beim Heckmotor außen, die Ölablassschraube ist frei.
  - Der Wagenboden ist unter dem Motor offen.
  - Die vorderste Ventildeckelschraube beim Boxer liegt nicht mehr hinter Riemen und Wasserpumpe. Der Block fängt nur in einem schmalen, niedrigen Bereich Tipps ab, die Kopfdichtungen liegen frei.
- **Weitere Modelle:**
  - Wagenboden und Unterbodenplatte sind unter dem Motor offen: Ölwanne, Dichtung und Lager liegen bei tiefen Autos nicht mehr im Blech.
  - Spurstangenköpfe sitzen hinter und unter dem Querlenker.
  - Twingo: Scheibenfuß weiter vorn, Zylinder 1 steckt nicht mehr im Armaturenbrett.
  - **Motorlager werden jetzt wie in echt von unten gelöst** (Hebebühne, Schrauben an der Unterseite der Lager). Von oben verdeckten je nach Auto Krümmer, Lichtmaschine, Ansaugschlauch oder Kotflügel mindestens eine Schraube. Zum Motorausbau also: Auto anheben, Motorlager und Hosenrohr lösen, ablassen, Rest im Motorraum.
  - Die Unteransicht steht etwas weiter unter dem Auto. Beim Twingo enden die Kunststoff-Stoßfänger knapp über dem Wagenboden; vorher zog sich ihre Fläche bis unter den Motor und verdeckte Lager und Ölwanne.
  - Heckmotor: Kabelbaum-Stecker seitlich neben der Motorabdeckung und Batterie weiter in der Öffnung. Das Motorende an der Spritzwand liegt beim Elfer unter dem Blech.
  - Der Block beim V-Motor ist niedriger, die Kopfdichtungen sind frei.
- **Ölwanne:** so lang wie der Block statt 0,5 m, deckt alle Lagerstellen ab (Urquattro-Fünfzylinder, Sechszylinder). Die Ölwannendichtung ist ein Rahmen, kein Deckel mehr: Hauptlager und Kurbelwelle darin bleiben antippbar.
- **Motorständer:** Krümmerschrauben sitzen hinter Riemen und Wasserpumpe. Die Kipphebelschraube sitzt hinter der Steuerkette.
- **Fehler behoben:** `raycast={… : undefined}` setzte die Treffererkennung eines Netzes ganz außer Kraft (Absturz bei der Strahlprüfung). Endtopf, Querlenker und Spurstangen galten als Motorteile und wären beim Motorausbau mitgewandert.
- **Tuning:**
  - Neues Teil Sport-Endschalldämpfer (+2,5 % Luftdurchsatz, eigener Klang, verchromt mit zwei großen Endrohren).
  - Fehler behoben: Sport-Nockenwellen brachten keine Leistung.
  - Im Tuningfenster steht zu jedem eingebauten Tuningteil die Mehrleistung oder der Grund, warum es (noch) nichts bringt. Beispiele: Die Pumpe hebt nur die Kraftstoffgrenze, der große Turbo braucht Stufe 2 und mehr Ladedruck.
- **Halle 2:** Werkzeugwagen (Werkzeugschrank, im Koop die gemeinsame Kiste), Computer und Teileregal. Halle 2 ist damit ohne Rückweg nutzbar.

## Koop: grauer Bildschirm behoben

- **Ursache:** Verkauft oder parkt ein Spieler ein Auto um, während der andere gleichzeitig daran schraubt, landete dessen Schritt im leeren Stellplatz. Dort entstand ein halbes Auto ohne Modell, und beim Zeichnen stürzte die ganze Ansicht ab. Übrig blieb der graue Hintergrund, bis man neu startete.
- **Behoben:** Schritte an einem Auto, das auf dem Platz nicht (mehr) steht, werden verworfen (`apply` in `src/net/diff.ts`, mit Logiktest). Halbe Autos aus älteren Fehlern werden beim Beitreten und nach jedem Abgleich entfernt.
- **Sicherheitsnetz:**
  - Stürzen 3D-Ansicht oder Bedienung doch einmal ab, bauen sie sich selbst neu auf (`src/ui/Recover.tsx`). Im Koop wird dabei der Stand frisch vom Server geholt, die Fehlermeldung erscheint kurz als Hinweis.
  - Erst bei vier Abstürzen in 15 Sekunden erscheint „Neu laden“.
  - Verliert das iPad den Grafikkontext, wird die 3D-Ansicht neu erzeugt.
  - Die Werkzeugschilder der Partnerfigur werden beim Wechsel freigegeben.
- Geprüft: Logiktests, Durchlauf `koop`, Kurztest mit eingeschleustem halbem Auto (Ansicht erholt sich, Auto entfernt). Kein echter iPad-Test.

## Absturz bei „Meine Autos“ und am Parkplatz behoben

- **Ursache:** Nach einem Motorumbau verlangt das Auto unter Umständen Teile, die es vorher nicht gab. Beim luftgekühlten Porsche mit wassergekühltem Motor ist das der Kühler, mit Dieselmotor der Partikelfilter. Für diese Teile fehlte der Eintrag. Die Prüfung „Auto komplett?“ (`isComplete`) stürzte dann ab, sobald die Verkaufskarte unter „Meine Autos“ oder das Auto am Parkplatz in der Nähe angezeigt wurde.
- **Behoben:**
  - `insertEngine` ergänzt fehlende Teile heil und eingebaut.
  - Beim Koop-Beitritt werden solche Autos ergänzt; im Einzelspiel geschah das beim Laden schon.
  - `isComplete` stürzt bei einem fehlenden Eintrag nicht mehr ab.
- Geprüft: Logiktests (neuer Test: V8 in den 911, Diesel in den 365 und den 330), Nachstellung mit allen 35 Modellen nach Umbau unter „Meine Autos“, Durchläufe `schrott` und `koop`. Kein echter iPad-Test.
- **Nachtrag (Schrottauto, Koop):** Auch ohne Motorumbau konnten Autos ohne erwartete Bauteile ankommen: aus älteren Spielständen oder über ein Gerät mit älterer App-Version. Dort zählen Endtopf und Fahrwerk noch zum Motor und fehlen bei motorlosen Schrottautos. Fehlende Bauteile werden jetzt nach jedem Koop-Abgleich ergänzt (`fixOldCars`), nicht nur beim Beitreten. Nach einem abgefangenen Absturz geschieht das auch im Einzelspiel.

## Porsche: Scheinwerfer und Schrauben im Blick

- **Scheinwerfer:** Sie stehen höher als die Nase. Auf Leuchtenhöhe gibt es dort keine Karosseriekante, deshalb landeten die Leuchten auf einem Ersatzwert weit hinten im Kotflügel und waren bei allen drei Modellen (356, 964, 992) unsichtbar. Jetzt sitzen sie an der Kotflügelspitze, wo der Kotflügel unter die Leuchtenhöhe abfällt. Das Glas ist entlang der Kotflügellinie geneigt (`fenderLamp` in `carParts.ts`), beim 992 aufrechter.
- **Motor-Seitenansichten beim Heckmotor:** schräg von hinten über die Heckecke statt steil von oben. Dort sah man vorher nur die Unterseite des offenen Motordeckels. Getippt wurde zwar hindurch, sehen konnte man aber nichts. Die Ansicht von hinten ist steiler, über die Heckkante.
- **Boxer:**
  - Die vier Ventildeckelschrauben sitzen in der Mitte des Deckels, nicht hinter Riemen, Wasserpumpe und Peilstab, mit dem Kopf zu den Seitenansichten.
  - Zündspulen-Stecker sitzen neben der Spule auf der oberen Seite. Durch die flache Bank lagen sie vorher unten.
- **356:** Der Motor sitzt 3 cm weiter vorn, die Motoröffnung ist länger. Riemen und Lichtmaschine lagen unter der Heckkante.
- **Gesamtcheck:** prüft jetzt auch, ob der Schraubenkopf zur Kamera zeigt (höchstens etwa 75° gegen die Blickrichtung). Sonst sieht man nur den Schaft.
- Geprüft: Gesamtcheck für alle drei Porsches ohne Befund, Bilder in voller Grafik (Front, Heck, Motoransichten). Kein echter iPad-Test.

## Boxer: Kopfdichtungen beider Bänke im Auto

- **Problem:** Beim Boxer (964 mit 3,6 l, 992, 356) ließen sich Zylinderkopf und Kopfdichtung von Bank 1 im Auto tauschen, die von Bank 2 nur am Motorständer. Davor saßen dort Nockenwelle sowie Ansaug- und Abgaskrümmer. Für den V-Motor ist das so gewollt (Bank 2 liegt unter Krümmern und Ansaugbrücke). Beim Boxer liegen beide Köpfe außen frei.
- **Jetzt:** Beim Boxer kommt Bank 2 wie Bank 1 im Auto heraus: Ventildeckel, Ventildeckeldichtung, Kopf, Kopfdichtung. Am Motorständer bleiben Nockenwelle und Krümmer weiterhin vor dem Kopf (`blockersOf`). Der Kopf von Bank 2 wird beim Boxer auch im Auto als eigenes Teil gezeichnet.
- Geprüft:
  - Ausbau beider Kopfdichtungen im 964 mit den Spielaktionen.
  - Gesamtcheck für Auto und Motorständer (964, 992, 356).
  - Logiktests, Durchläufe `motoren`, `schrott`, `bremse` (allein grün).
  - Kein echter iPad-Test.

## Tage laufen automatisch ab, Porsche-Scheinwerfer aufrecht

- **Tageswechsel:**
  - Ein Spieltag endet nach drei Minuten von selbst (`App.tsx`); vorher musste man danach „Feierabend“ tippen. Die Restzeit steht in der oberen Leiste neben „Tag …“.
  - Im Koop schaltet nur ein Gerät um (`isLeader`), sonst sprängen zwei Tage auf einmal. Auf Probefahrt und im Menü wartet der Wechsel.
  - War das Spiel länger als einen Tag lang zu, beginnt der Tag beim Öffnen neu, statt sofort umzuspringen.
  - Im Testmodus (Tageslänge 0) bleibt es beim Knopf.
- **Porsche-Scheinwerfer:** Sie waren entlang der Kotflügellinie bis fast 50° nach hinten gekippt („schief“), beim 992 verdeckte die Fronthaube die untere Hälfte. Jetzt stehen sie fast senkrecht (964/356: 0,12 rad, 992: 0,08 rad) zwischen den Stellen, an denen Ober- und Unterkante des Glases aus dem Kotflügel treten. Der Topf in Wagenfarbe reicht nach hinten in den Kotflügel.
- Geprüft:
  - Logiktests.
  - Tageswechsel im normalen Spielmodus (Uhr, automatischer Wechsel mit Meldung, Warten auf Probefahrt).
  - Durchläufe `markt`, `karriere`, `werkstatt`.
  - Bilder der drei Porsches aus der Nähe.
  - Kein echter iPad-Test.

## Fahrphysik und Probefahrtwelt

Vorher: flacher Rundkurs (~300 m) mit Kegelbäumen. Die „Physik“ kannte nur eine Geschwindigkeit, die mit Gas stieg und beim Bremsen fiel. Lenkung nur voll oder gar nicht, die Drehzahl war geschätzt. Leistungsdaten, Defekterkennung und die Wertung über Pylonentore blieben erhalten, alles andere ist neu aufgebaut.

**Fahrphysik** (`src/game/vehicle.ts`, reine Rechnung, getestet in `vehicle.test.ts`):
- Einspurmodell mit Längs-/Quergeschwindigkeit und Gierrate, gerechnet in Teilschritten von 1/120 s (stabil auch bei ruckelnder Bildrate).
- Gewichtsverlagerung längs: Beschleunigen entlastet die Vorderachse, Bremsen belastet sie. Reifen mit Schräglaufwinkel und Haftgrenze, Längs- und Seitenkraft teilen sich die Haftung (Reibungskreis).
- **Antriebsart je Modell** (`drivetrainOf`):
  - Frontantrieb: Twingo, Piccolo, Golf, TT, A4, S6.
  - Allrad: Sport quattro.
  - Heckantrieb: alle anderen.
  - Allrad zieht beim Anfahren am besten. Heckantrieb mit Vollgas in der Kurve drängt mit dem Heck, Frontantrieb schiebt über die Vorderräder.
- **Motor und Getriebe:**
  - Drehmoment aus der Prüfstandskurve, also mit Tuning und Leistungsverlust durch Defekte.
  - Fünf oder sechs Gänge je nach Baujahr und Klasse, Diesel länger übersetzt.
  - Achsübersetzung so, dass die Höchstgeschwindigkeit (aus Leistung und Luftwiderstand) im letzten Gang erreicht wird.
  - Automatik: bei Vollgas spät, bei Teillast früh hochschalten, Zurückschalten mit Schaltpause.
  - Anfahren mit schleifender Kupplung, Begrenzer, Motorbremse im Schub.
  - Rückwärtsgang: im Stand Bremse halten.
- **Widerstände und Gelände:** Luft- und Rollwiderstand, Steigung, Wiese (weniger Haftung, mehr Widerstand).
- **Federung:** Nicken und Wanken als Feder-Dämpfer-System. Das Sportfahrwerk ist straffer und haftet besser.
- **Tuning:** Fahrwerk, Felgengröße (Reifenbreite), Kotflügelverbreiterung und Spoiler wirken. Starke Autos fahren ab Werk breitere Reifen.
- **Defekte spürbar:**
  - Zündaussetzer: Ruckeln.
  - Verschlissene Beläge: Bremsweg deutlich länger.
  - Scheiben: Rubbeln beim Bremsen.
  - Alte Reifen: weniger Haftung.
  - Spurstange/Querlenker: Lenkung zieht, hat Spiel, klackt bei Lastwechseln.
  - Kupplung: rutscht, die Drehzahl läuft davon.
  - Getriebeschaden: langsames Schalten mit Krachen.
  - Qualm bei Undichtigkeiten.
- **Gemessene Werte** (Logiktest):
  - Twingo: 0–100 km/h in 11 s, 164 km/h.
  - 330: 6,8 s, 248 km/h.
  - M4: 4,5 s.
  - Bremswege aus 100 km/h: 37–45 m.
  - Querbeschleunigung: 1,0–1,15 g.

**Landschaft** (`src/three/driveWorld.ts`, `DriveScenery.tsx`):
- **Strecke:** Landstraßen-Rundkurs „Acht“, 2,9 km. Die beiden Hälften kreuzen sich im Ort Grünbach (Kreuzung mit Warnschild). Dazu Anstieg auf einen Hügelkamm, kurvige Talfahrt, langes Waldstück und gerade Abschnitte durch Wiesen und Felder.
- **Straße:** 7 m breit mit Bankett, Randlinien und unterbrochener Mittellinie (an der Kreuzung ausgespart). Leitplanken in engen Kurven und an Böschungen. Ortsschilder, Tempo 50/100, Kurven- und Kreuzungsschilder. Häuser und Straßenlaternen im Ort.
- **Gelände:** Hügel aus überlagerten Wellen, zur Straße hin als Böschung angeglichen. Wiesen, reife Felder, Äcker und Waldboden als Vertexfarben.
- **iPad-Leistung:**
  - Gelände in 64 Kacheln mit drei Detailstufen; die Höhen werden einmal fein berechnet und für die gröberen Stufen wiederverwendet.
  - Gut 3 000 Bäume als Instanzen in Blöcken von 410 m, unsichtbare Blöcke werden gar nicht gezeichnet.
  - Häuser, Laternen und Leitplankenpfosten ebenfalls als Instanzen, keine Schatten in der Landschaft, Dunst ab 220 m, Sichtweite 800 m.
  - Gemessen: etwa 105 000 Dreiecke und 100–140 Zeichenaufrufe pro Bild (vorher über 500 000 Dreiecke bei 12 500 Bäumen).
  - Die Welt wird einmal erzeugt (Daten etwa 60 ms) und für weitere Probefahrten zwischengespeichert.
- **Kollision:** Bodenhöhe aus Straße oder Gelände, der Wagen neigt sich mit dem Gelände. Leitplanken halten den Wagen auf der Straße (er gleitet entlang und verliert Tempo). Bäume, Häuser und Laternen sind Hindernisse (Raster-Suche). Die Straßensuche ist lokal, so bleibt man an der Kreuzung auf seinem Ast.

**Probefahrt:**
- **Instrumente:** Drehzahlmesser mit rotem Bereich ab der Abregeldrehzahl, darin Tempo und Gang (rot bei durchdrehenden Rädern), gefahrene Strecke, Warnleuchten.
- **Kameras:** Außen (mit Tempo etwas weiter), Motorhaube, Cockpit. Umschalten per Knopf oder Taste C.
- **iPad-Bedienung:**
  - Lenkfläche: Finger aufsetzen und ziehen, stufenlos und fein um die Mitte, zurück beim Loslassen.
  - Pedale dosierbar: oben voll, unten etwa 35 %.
  - Pfeiltasten am Rechner funktionieren weiter.
- **Klang:** echte Drehzahl und Last aus der Physik, Reifenquietschen, Fahrtwind, Schaltkrachen, Klacken, Anprall.
- **Direkt testen:** Knopf „Probefahrt mit diesem Stand“ im Tuningfenster und „Noch eine Runde“ im Fahrtbericht.
- **Tests:** Ein eingebauter Autopilot (`__gkDrive.sim.autopilot = m/s`) und ein Zeitraffer (`timeScale`) machen die Runde im Browser-Test von der Bildrate unabhängig.
- Keine Rennen. Werkstatt, Koop und Spielstände unverändert (Probefahrt-Wertung wie bisher).
- Geprüft:
  - Logiktests (neu: Fahrphysik).
  - Durchläufe `diagnose` (komplette Runde mit Autopilot) und `markt`.
  - Bilder aller drei Kameras und mehrerer Streckenabschnitte.
  - Kein echter iPad-Test: Die Bildrate auf dem iPad kann ich hier nicht messen.

## Chat im Koop

- **Knopf „💬 Chat“** in der oberen Leiste (nur im Koop), mit Zahl ungelesener Nachrichten. Er öffnet ein Fenster mit Verlauf, Eingabefeld (Enter sendet, höchstens 160 Zeichen) und Schnellantworten zum Antippen, damit man auf dem iPad nicht immer tippen muss.
- **Sprechblase** über der Figur des Sprechers: weiße Blase mit Spitze, Text umbrochen (bis 5 Zeilen). Sie bleibt mindestens 5 Sekunden stehen, lange Nachrichten länger (2 s + 90 ms je Zeichen), und blendet zum Ende aus.
- Neue Nachrichten erscheinen außerdem oben links gleich lange, auch die eigene, denn die eigene Figur sieht man in der Ich-Perspektive nicht.
- **Übertragung:**
  - Sofort per Realtime-Broadcast (Ereignis `chat`). Zusätzlich bleibt die letzte Nachricht etwa 30 s in der Lage (`presence.chat`), damit sie auch ohne Realtime über den Abgleich ankommt.
  - Doppelte werden über die Kennung erkannt.
  - Keine Schema-Änderung: Die Lage ist schon freies JSON.
- Tippen im Eingabefeld bewegt die Figur nicht (W/A/S/D werden dort ignoriert).
- Geprüft:
  - Logiktest (Anzeigedauer).
  - Durchlauf `koop`: Spieler 1 schreibt, Spieler 2 sieht Einblendung, Zähler und Sprechblase (mindestens 5 s); Öffnen setzt den Zähler zurück; Bild der Sprechblase.
  - Kein echter iPad-Test.

## Motorklang realistischer (Zündpulse, Auspuffanlage, Turbo)

Recherche (Quellen u. a. Wikipedia „Crossplane“, Slashgear/Jalopnik zu Boxer-Krümmern, Car Throttle/GFB zu Abblasventil und Verdichterpumpen, Fast Car zu „Pop & Bang“, Pulse-Train-Modelle der Motorklang-Synthese) – umgesetzt:

- **Puls-Synthese** (`src/game/engineWorklet.ts`, AudioWorklet):
  - Jeder Zylinder stößt bei seinem Zündwinkel einen kurzen Druckpuls ins Abgasrohr: schneller Anstieg, Abklingen, Rohrresonanz und Strömungsrauschen; unter Last kräftiger und heller.
  - Die Abgasstränge haben je eine Rohrresonanz (Kammfilter) und gehen auf links/rechts.
  - Die alten Oszillatoren bleiben als Rückfall, falls ein Browser kein AudioWorklet kann.
- **Charakter je Bauart:**
  - Reihenvierer kernig.
  - Reihenfünfer mit leichtem Trällern.
  - Reihensechser glatt und hell (zwei Krümmerstränge 1–3/4–6).
  - V6.
  - Crossplane-V8 (`v8_40`, `v8t_44`): Zündfolge 1-8-4-3-6-5-7-2, je Bank ungleichmäßige Abstände (L R L L R L R R). Dicht folgende Pulse im selben Strang verstärken sich – das Blubbern (gemessen: Nebenlinien im Abstand der halben Zündordnung).
  - Flatplane-V8 (`v8_45s`, `v8_30k`): Bänke abwechselnd, helle harte Pulse – kreischend, sauberes Spektrum.
  - Boxer-Vierer: ungleich lange Krümmer, versetzte Pulse – Grummeln. Boxer-Sechser: gleich lange Krümmer, heiser.
  - Luftgekühlte Boxer zusätzlich mit Gebläserauschen.
  - Diesel tiefer, mit Nageln (wie bisher).
- **Auspuffanlage:**
  - Endtopf als Tiefpass: Serie dumpf (gemessener Klangschwerpunkt ~830 Hz), Sportendtopf offener (~1 280 Hz), durchgerostet scharf mit Kratzen (~3 400 Hz).
  - Fächerkrümmer machen die Pulse härter und heller.
- **Turbo:**
  - Pfeifen steigt mit dem Ladedruck (1,5–5 kHz), dazu Ansaugrauschen; beides deutlich unter dem Motorklang.
  - Gas weg unter Ladedruck: Serienturbo bläst leise zurück (Schubumluft), nachgerüsteter oder großer Turbo bläst laut nach außen („Pschh“) mit kurzem Flattern.
- **Nachverbrennung im Schub:** Gas weg aus über 2 800/min. Mit Kennfeld-Tuning (Stufe 2, oder Stufe 1 mit Sportendtopf) knallt es kräftig, mit Sportendtopf oder durchgerostetem Topf knistert es leiser.
- Klangprofil (`soundProfile`) um Auspuffanlage, Fächerkrümmer, Turbo-Art, Kurbelwelle, Luftkühlung und Knallen erweitert. Gilt in der Werkstatt (Gas geben), beim Händler und auf der Probefahrt.
- Geprüft:
  - Logiktests (neu: Klangzuordnung).
  - Durchläufe `motoren`, `diagnose`, `werkstatt`.
  - Hörproben im Testbrowser aufgenommen (elf Autos bzw. Ausbaustufen) und ausgewertet: Pegel, Spitze, Ordnungen, Klangschwerpunkt.
  - Kein echter iPad-Test.

## Fahrphysik überarbeitet, Fahrzeugstatistik, Knopfsteuerung, Anlasser, „zuletzt online“

- **Problem gemessen:** Mit vollem Lenkeinschlag drehte sich bei 80 km/h selbst der frontgetriebene Twingo, und beim Bremsen in der Kurve brachen alle Autos aus. Ein Fahrer mit reinen An/Aus-Knöpfen schaffte die Runde nur mit dem Twingo, mit 34 Drehern.
- **Ursachen und Abhilfe** (`vehicle.ts`):
  - Vorder- und Hinterachse erreichten die Haftgrenze gleichzeitig (neutral im Grenzbereich, kippelig). Jetzt hat die Hinterachse Reserve (Haftung ×1,12, höhere Seitensteifigkeit): Im Grenzbereich schiebt das Auto über die Vorderräder, wie ein gutmütiges Serienauto.
  - Voller Einschlag bei Tempo überforderte die Vorderreifen. Jetzt wird der Einschlag je nach Tempo begrenzt (Kurvenradius aus der Haftgrenze plus bestem Schräglaufwinkel).
  - ABS (immer aktiv) lässt jeder Achse die Seitenkraft, die die Kurve gerade braucht. Mehr Bremskraft vorn (70 %).
  - ESP (Standard an, in der Probefahrt abschaltbar):
    - Giermomentregelung, wenn das Auto stärker dreht, als Einschlag und Haftung erlauben.
    - Gegenmoment bei zu großem Schwimmwinkel.
    - Antriebsschlupfregelung.
    - Ohne ESP lassen starke Hecktriebler mit Vollgas in der Kurve das Heck kommen – Driften für Könner.
  - Drehende Teile (Räder, Getriebe, Schwungrad) werden mitbeschleunigt. Kleine Autos sind dadurch in den kurzen Gängen nicht mehr unrealistisch flott (Twingo 0–100 in 14 s).
  - Reifenhaftung nach Baujahr (ältere Autos weniger) und Klasse (Sportreifen). Mittelmotor-Sportwagen mit 42 % Gewicht vorn.
- **Logiktests:**
  - Mit ESP kein Ausbrechen bei vollem Einschlag (50–110 km/h) und beim Bremsen in der Kurve.
  - Ein Knopf-Fahrer schafft die Runde ohne Abkommen (Twingo, M4, 964).
  - Ohne ESP driftet der M4, der Golf nicht.
- **Fahrzeugstatistik** (`carStats.ts`, Karte in Akte und Prüfstand):
  - PS, Nm, Gewicht, PS/t, Antrieb und Gänge.
  - Gemessen mit derselben Fahrphysik: 0–100 km/h, Höchstgeschwindigkeit, Bremsweg aus 100 km/h, Querbeschleunigung (Handling), dazu Noten als Balken.
  - Tuning, Fahrwerk, Reifen und Defekte zählen mit. Ergebnisse werden zwischengespeichert (alle 35 Modelle zusammen etwa 140 ms).
- **Steuerung:** Knöpfe ◀ ▶ zum Lenken, Gas und Bremse (voll an/aus). Die Lenkung baut sich weich auf und wird je nach Tempo begrenzt. Dazu der Schalter „ESP an/aus“.
- **Anlasser:**
  - Der Elektromotor surrt und bricht bei jeder Verdichtung kurz ein. Dazu das dumpfe „Tschuck“ der Verdichtungstakte bei etwa 220/min.
  - Danach zündet der Motor, die Drehzahl schießt kurz hoch und fällt auf Leerlauf.
  - Kalt, Diesel oder Zündaussetzer: länger orgeln.
- **Koop:** In der oberen Leiste steht bei Mitspielern, die nicht online sind, „zuletzt gerade eben / vor 12 min / vor 3 Std. / vor 2 Tagen“, ebenso im Chat-Fenster.
- Geprüft:
  - Logiktests.
  - Durchläufe `koop` (neu: „zuletzt online“), `diagnose`, `markt`.
  - Browser: Knöpfe (Gas, Lenken, Bremse, ESP) und die Statistik in der Akte.
  - Hörproben des Anlassers.
  - Kein echter iPad-Test.

## Halle 2 mit eigener Ausstattung, Werkzeug verkaufen

- **Motorständer Halle 2:** neuer Stellplatz (`STAND2_SLOT`, hinten an die Liste angehängt → 132 Plätze). Alte Spielstände und Koop-Stände werden beim Laden wie bisher verlängert. Den Ständer gibt es nur mit `loc_pro`.
- **Zweiter Motorkran** in Halle 2 bei (3,1 / −8,0), sobald auch der Motorheber gekauft ist. Es gibt weiterhin nur einen hängenden Motor (`crane`). Er wird an dem Kran gezeigt, dessen Fenster zuletzt offen war (`useCraneSite`, nur Anzeige).
- **Kranfenster:** `standFor(bay, upgrades)` wählt den Ständer der Halle. Hebebühnen 3 und 4 sowie Ständer 2 gehören zu Halle 2, alles andere zur Stammhalle. `craneToStand`, `standToCrane`, `flipEngine`, `testEngine` und `fitTurboKit` nehmen den Ständerplatz entgegen. Die Motorübersicht am Computer zeigt beide Ständer.
- **Spezialwerkzeugschrank Halle 2** an der Rückwand. Im Koop ist es die eigene Kiste `spezial2` (4 Plätze). Der Werkzeugwagen dort ist jetzt die Kiste `halle2` (8 Plätze) statt eines zweiten Zugangs zum Werkzeugschrank. Im Einzelspiel öffnen beide den Werkzeugschrank.
- **Werkzeug verkaufen (Koop):** Knopf „Verkaufen“ in der Kiste und für Werkzeug in der eigenen Leiste. Erstattet wird der halbe Kaufpreis. Das letzte Exemplar einer Art und Werkzeug in fremder Hand lassen sich nicht verkaufen. Serverseitig über `gk_sell_tool`, mit Buchung im Kassenbuch.
- **Schema:** `gk_box_cap` kennt `halle2` und `spezial2`, neu ist `gk_sell_tool`, und `gk_reclaim` nutzt die neuen Kisten als Ausweichplatz. **`supabase/schema.sql` muss einmal im Supabase-SQL-Editor ausgeführt werden.**
- Tests: Logiktest Slotzahl; `schrott.cjs` prüft Ständer 2 (gesperrt ohne Halle 2, Kranfenster „Halle 2“, auf/ab, drehen, Ständer 1 unberührt); `koop.cjs` prüft das Verkaufen; SQL-Test für `gk_sell_tool`.

## Motorenbau-Nische, Teilesuche, Auto auf Probefahrt nicht in der Werkstatt

- **Nische hinter Halle 2** (`NICHE` in `player.ts`, x 6,4–10,6 / z −10,8 bis −7,0), zur Halle hin ganz offen: Motorständer 2, Kran 2, Spezialwerkzeugschrank, Werkzeugwagen und Terminal stehen dort. Damit sind sie weg von Hebebühne 3. Das Teileregal steht weiter in der Halle, das Schild „HALLE 2“ hängt jetzt an der Torseite. Die Rückwand von Halle 2 hat eine Öffnung zur Nische. Die Nische ist Teil des Laufbereichs.
- **Teilesuche** im Ersatzteilregal und am Computer: Das Suchfeld oben sucht über alle Abteilungen und Betriebsflüssigkeiten. Groß- und Kleinschreibung spielen keine Rolle, Umlaute dürfen ausgeschrieben werden („zuendkerze“). Treffer, die nicht zum gewählten Auto passen, werden nur gezählt.
- **Probefahrt im Koop:** Fährt ein Mitspieler, verschwindet das Auto bei den anderen von Bühne, Hofplatz oder Tiefgaragenplatz (`useAway` aus der Anwesenheit `scene: 'track'` und `car`). Es ist dann kein Hindernis und nicht anwählbar. Im Einzelspiel ist die Werkstatt während der Fahrt ohnehin nicht sichtbar.
- Tests: `markt.cjs` prüft die Suche, `koop.cjs` das Verschwinden und Zurückkehren des Autos.

## Fahren neu: Physik wie in Rennspielen, Schieberegler, freie Probefahrt auf Zeit, Koop-Fenstererkennung

- **Reifen:** vereinfachte „Magic Formula“. Die Seitenkraft steigt bis etwa 7–8° Schräglauf und fällt beim Rutschen auf gut 85 %. Dadurch sind Drifts möglich, ohne dass das Auto schlagartig wegbricht.
- **Lenkung:** 0,62 rad Radeinschlag im Stand (Wendekreis-Radius unter 6 m). Bei Tempo hält eine Lenkhilfe die Vorderräder nahe am besten Schräglaufwinkel, gemessen an der Bewegungsrichtung der Vorderachse. Voller Ausschlag heißt damit immer: so eng, wie die Reifen es hergeben. Rutscht das Auto, richten sich die Räder von selbst in Fahrtrichtung aus (Gegenlenken), ähnlich wie bei NFS oder Forza.
- **ESP an (Standard):** Gierratenregelung, Schwimmwinkelbegrenzung, Antriebsschlupfregelung wie bisher.
- **ESP aus:** Die Drift-Hilfe dämpft ab etwa 20° nur das weitere Eindrehen, nie das Zurückdrehen, und drückt ab etwa 50° zurück. Dreher passieren nur mit Absicht. Gas weg und Lenkung gerade: Das Auto fängt sich.
- **Handbremse** (Knopf, Leertaste): blockiert die Hinterräder und dient zum Einleiten von Drifts und zum Wenden.
- **Bedienung:**
  - Links ein breiter Lenk-Schieberegler mit feinfühliger Kennlinie um die Mitte.
  - Rechts ein kleiner Gas-Schieberegler. Beide federn beim Loslassen zurück (gerade bzw. kein Gas).
  - Dazu Knöpfe für Bremse und Handbremse.
  - Mehrere Finger gleichzeitig gehen (Pointer Capture).
- **Probefahrt auf Zeit:** 2:30 Minuten freie Fahrt (`DRIVE_TIME`), gewertet ab 45 Sekunden (`DRIVE_MIN`). Danach geht es automatisch zurück. „Auf die Straße“ setzt das Auto stehend an den nächsten Straßenpunkt. Die Pylonen-Tore gibt es nicht mehr. Die Weltgrenze hält sanft zurück.
- **Welt:**
  - Testgelände (Asphalt, eben, Driftkreise, Slalomgasse) neben der Startgeraden.
  - Vier Schotter-Feldwege durch die Landschaft.
  - Vier Bauernhöfe mit Scheune und Heuballen.
  - Untergründe mit eigener Haftung: Schotter 0,78, Wiese 0,64, Waldboden 0,6, Feld 0,55.
- **Kamera:** Folgt im Drift zwischen Längsachse und Fahrtrichtung. Das Auto steht höher im Bild, der Drehzahlmesser verdeckt es nicht mehr.
- **Koop:**
  - Ein zweites Fenster mit demselben Konto (z. B. ein alter Safari-Tab) wird erkannt: Änderungen unter dem eigenen Konto, die nicht aus diesem Fenster stammen, oder eigene Positionsmeldungen mit fremder Fensterkennung.
  - Dieses Fenster pausiert dann mit Hinweis und Knopf „Hier weiterspielen“.
  - Ein Konflikt ohne anderen Spieler online meldet nicht mehr „Partner war schneller“.
  - Serverabsagen nennen ihren Grund.

## Räder drehen sich, Fahrwelt mit Sinn und schöner, Minikarte

- **Räder:** Sie rollen auf der Probefahrt mit (`spin` am `CarModel`, nur einfache Darstellung). Angetriebene Räder drehen beim Durchdrehen schneller, die Handbremse blockiert hinten.
- **Karte:**
  - Die Fahrt beginnt vor der eigenen Werkstatt (Halle „GARAGE KINGS“ mit Vorplatz am Ortsrand von Grünbach).
  - Im Ort steht eine Kirche als Orientierungspunkt.
  - Die Feldwege beginnen an Straßen (Endpunkt wird an den Straßenrand gezogen) und führen zu den vier Höfen, teils weiter zur nächsten Straße. An jeder Einmündung steht ein gelber Wegweiser.
  - Das Testgelände ist eingezäunt und hat eine Einfahrt mit Wegweiser.
  - Der Waldsee mit Sandufer ist nicht befahrbar, das Auto bleibt am Ufer stehen.
- **Optik:**
  - Grasstruktur auf dem Gelände, eigene Straßentextur (Körnung, keine Risse).
  - Berge am Horizont: ein Band um die Kamera, ohne Nebel.
  - Die Fernwiese wird zuerst und ohne Tiefe gezeichnet, Senken und der See liegen also nie darunter.
  - Der Start-/Zielbogen ist entfernt.
- **Minikarte** oben links: Fahrtrichtung zeigt nach oben, Umkreis gut 250 m. Sie zeigt Straßen, Feldwege, Wald, Felder, See, Testgelände, Häuser und Namen. Die Karte wird einmal vorgezeichnet (0,75 px/m).
- Tests: Logiktest „Karte ergibt Sinn“; `markt.cjs` prüft drehende Räder und die Minikarte.

## Tag überspringen, „zuletzt online“ nach Antippen, Probefahrt endet an der Werkstatt, Fahreffekte

- **Tag überspringen:** Knopf „⏭ Tag“ in der oberen Leiste (zweimal tippen). Er ruft `nextDay(true)` auf und geht auch vor Ablauf der drei Minuten. Der Tag endet weiterhin automatisch nach drei Minuten. Der Feierabend-Knopf am Computer bleibt bis dahin gesperrt.
- **Koop-Leiste:** Mitglieder nur noch mit Namen (offline grau). Wann jemand zuletzt online war, steht nach Antippen in der Koop-Übersicht.
- **Probefahrt ohne Zeitlimit:**
  - Gewertet ist sie ab 45 s.
  - Beendet wird sie, wenn man nach dem Wegfahren (über 60 m) zurück auf dem Werkstatt-Vorplatz anhält. Dort ist eine Markierung „Hier anhalten“.
  - Die Anzeige zeigt die gefahrene Zeit und nach 45 s die Entfernung zur Werkstatt.
  - „Abbrechen“ beendet jederzeit (ab 45 s gewertet).
- **Fahreffekte (`driveEffects.ts`):**
  - Reifenspuren beim Driften, Durchdrehen, mit Handbremse und bei Vollbremsung: dunkel auf Asphalt, braun auf Schotter, grün-braun auf Wiese.
  - Weißer Reifenqualm, abseits der Straße Staub. Alles aus festen Puffern, kein Speicherzuwachs.
- **Kollisionen:** Der Anteil der Geschwindigkeit zum Hindernis hin wird mit leichtem Rückprall aufgehoben, entlang gleitet das Auto weiter (frontal fast Stillstand, streifend nur langsamer).
- **Unebener Boden:** Abseits der Straße rüttelt der Aufbau leicht (Feld stärker als Wiese und Schotter).
- Tests: `markt.cjs` (Tag überspringen), `koop.cjs` („zuletzt online“ erst nach Antippen), `diagnose.cjs` (Fahrt endet erst auf dem Vorplatz).

## Arbeitszeit je Spieler

- Gezählt wird aktive Spielzeit (`game/playtime.ts`): Das Spiel ist sichtbar, nicht im Menü, und in den letzten 5 Minuten gab es eine Eingabe (Tippen oder Taste).
- **Einzelspiel:** `playTime` im Spielstand (gesamt und je Kalendertag). Es wird jede aktive Sekunde gezählt und alle 30 s bzw. beim Verlassen übernommen, damit nicht jede Sekunde gespeichert wird. Die Anzeige steht im Menü und unter Erfolge.
- **Koop:**
  - Der Server zählt in `gk_touch` je Mitglied (`play_seconds`, `play_today` am Kalendertag `play_day`, deutsche Zeit).
  - Es zählt der Abstand zum letzten Lebenszeichen, wenn er höchstens 60 s beträgt und der Spieler nicht als untätig gemeldet ist (`presence.idle`). Zwei Fenster desselben Kontos zählen nicht doppelt.
  - Die Anzeige steht in der Koop-Übersicht (nach Antippen der Koop-Leiste).
  - **Schema-Ergänzung nötig** (`alter table … add column if not exists`, neue `gk_touch` und `gk_members_json`). Ohne sie bleibt die Anzeige im Koop einfach leer.
- Tests: Logiktest (Konto, Tageswechsel, Anzeige), SQL-Test (aktiv, untätig, Pause, neuer Tag), `koop.cjs` (Anzeige für beide Spieler und im Menü).

## Zeitrennen

- **Rennkalender (`game/races.ts`):** An zwei von drei Tagen findet ein Zeitrennen statt, am dritten das Fahrzeugtreffen. Strecke und Klasse folgen festem Zufall aus dem Spieltag: Im Koop sehen alle dasselbe Rennen, ohne zusätzlichen gemeinsamen Zustand. Angekündigt wird es in der Tagesmeldung.
- **Strecken auf dem Straßennetz:**
  - Große Runde um Grünbach (≈ 2,9 km, Preisgeld ×1,4)
  - Bergsprint Ost (≈ 1,2 km)
  - Waldsprint West (≈ 1,2 km)
  - Dazu Start- und Zielbogen sowie 7 Kontrollpunkte (Pfostenpaare). Gezählt werden sie nur auf der Straße und der Reihe nach. Abkürzen (Sprünge im Fortschritt) zählt nicht. „Letzter Kontrollpunkt“ setzt zurück, die Uhr läuft weiter.
- **Klassen:**
  - bis 150 PS: Gold 6.000 €, Startgeld 300 €
  - bis 250 PS: Gold 10.000 €, Startgeld 500 €
  - bis 400 PS: Gold 16.000 €, Startgeld 800 €
  - offen: Gold 25.000 €, Startgeld 1.200 €
  - Silber bringt 55 %, Bronze 25 % von Gold. Zu starke Autos dürfen nicht starten (`raceBlocker`).
- **Sollzeiten:** Ein Computerfahrer (`aiTime`) fährt die Strecke mit Tempoplan (Kurvengrenze aus der Krümmung, Bremsweg bis dorthin) und einem Referenzauto genau an der Klassengrenze: 1,2 t, Klassenreifen. Gold liegt bei Referenz ×1,02, Silber bei ×1,10, Bronze bei ×1,20. Ein Serien-Twingo bekommt so Silber in der 150er-Klasse, eine Stradale Gold in der offenen. Tuning bis an die Grenze lohnt sich.
- **Auszahlung:** Je Rennen und Tag einmal das Preisgeld der besten Medaille. Eine Verbesserung zahlt die Differenz, jeder Versuch kostet Startgeld. Bestzeit, ausgezahlter Betrag und Goldsiege liegen in `career` (gemeinsam im Koop, die letzten 12 Rennen).
- **Ablauf:**
  - Start im Computer-Reiter „Rennen“ (auch aus dem Probefahrt-Fenster erreichbar).
  - Countdown 3-2-1, das Auto steht dabei, Gas lässt nur die Drehzahl steigen.
  - Anzeige: Uhr, Kontrollpunkte, Sollzeiten.
  - Danach das Ergebnisfenster mit Medaille, Auszahlung und „Nochmal“.
- **Vorbereitet für Gegner:** `Race` und die Rennszene sind so gebaut, dass NPCs als weitere Fahrzeuge mit `aiTime`-Fahrer dazukommen können.
- Tests: `races.test.ts` (Kalender, Sollzeiten, Tuning lohnt sich, Klassengrenze, Auszahlung), `karriere.cjs` (Rennen am Computer starten, Countdown, mit Autopilot ins Ziel, Konto).

## Rennstrecken und Fahrphysik mit Aerodynamik

- **Recherche:** Sims wie Gran Turismo, Assetto Corsa und RaceRoom rechnen die Reifenhaftung je Rad aus der Radlast (Lastempfindlichkeit, Gewichtsverlagerung) und fügen Abtrieb hinzu, der mit v² wächst. Serienautos haben leichten Auftrieb, Sportwagen und Flügel Abtrieb, und die Balance vorn/hinten bestimmt das Fahrverhalten. NFS setzt für Drifts auf Gasstoß und eine Drift-Hilfe; die gibt es hier schon.
- **Physik (`vehicle.ts`):**
  - **Abtrieb `clA`** je Auto: Serienlimousine −0,04 (leichter Auftrieb), Luxus 0,08, Sport 0,3, Mittelmotor-Supersportler 0,8.
  - Dazu je Spoiler: Lippe +0,12, Entenbürzel +0,3, Heckflügel +0,9. Verbreiterungen bringen +0,08. Spoiler kosten Luftwiderstand (bis +10 %).
  - Die Aufteilung `aeroFront` folgt den Teilen: Ein Heckflügel verschiebt den Abtrieb nach hinten, das Auto wird bei Tempo stabiler.
  - **Lastempfindlichkeit** (0,12): Doppelte Radlast bringt nicht doppelte Haftung.
  - **Querlastübertragung** je Achse über die Wankabstützung (`rollFront`): Serie 0,56 bzw. 0,6 bei Frontantrieb, Gewindefahrwerk ausgeglichener. Daraus ergibt sich die Haftung je Achse aus beiden Radlasten.
  - Die Seitensteifigkeit wächst mit der Radlast, mit Abtrieb lenkt das Auto bei Tempo direkter ein.
  - Ergebnis: M4 mit Flügel 1,11 g statt 1,06 g bei 220 km/h; Stradale 1,13 g bei 180 km/h gegenüber 1,05 g bei 60 km/h.
- **Rennstrecken (`three/circuits.ts`)**, eigene Welten mit derselben Schnittstelle wie die Landschaft:
  - Eifelring (4,3 km, nach der Nordschleife)
  - Motodrom Kurpfalz (3,0 km, 2 Runden, nach dem alten Hockenheim)
  - Hafenkurs Monte Azzurro (2,1 km, 2 Runden, nach Monaco, Leitplanken direkt am Rand, Hafenbecken)
  - Ardennenring (3,5 km, nach Spa, 14 % Anstieg nach der Senke)
  - Ausstattung: Kerbs in den Kurven, Kiesbetten außen (Haftung 0,45, starker Rollwiderstand), Leitplanken rundum, Tribünen und Boxengebäude an der Start-Ziel-Geraden, Wald drumherum.
- **Rennen:** Ab Tag 4 stehen auch die Rennstrecken im Kalender. Das Preisgeld richtet sich nach der Renndistanz (×1,3 bis ×2,2), Gold also bis über 50.000 €. Kontrollpunkte gibt es je Runde, die Anzeige zeigt „Runde x/y“. Die Minikarte zeigt die Strecke.
- Tests: `circuits.test.ts` (Länge, keine Überschneidung, Radien, Steigung, Computerfahrer kommt an; auf dem Motodrom zählt Leistung mehr als im Hafen). Dazu die bestehenden Physik-, Renn- und Browser-Tests.

## Rennen gegen Gegner (NPCs)

- **Rennkalender:** Etwa jedes zweite Rennen ist ein Rennen gegen fünf Gegner (`Race.kind === 'grid'`), sonst ein Zeitrennen. Gegner, Autos und Farben folgen festem Zufall aus dem Spieltag (gleich im Koop).
  - Preisgeld: Platz 1 = 115 % des Gold-Preisgelds der Klasse und Strecke, Platz 2 = 45 %, Platz 3 = 20 %.
  - Je Tag wird die beste Platzierung einmal ausgezahlt, eine Verbesserung zahlt die Differenz.
- **Gegner (`Opponent`):** Name, Auto der Klasse (fürs Aussehen) und Physik des Klassen-Referenzautos mit eigener Motorleistung (92–100 % der Grenze).
  - Das Fahrkönnen ist ein Tempo-Anteil (0,90–0,985), der jede Zielgeschwindigkeit skaliert. So ist das Feld eindeutig abgestuft; der Schnellste fährt etwa auf Gold-Niveau.
- **KI (`aiInput`):** gemeinsamer Fahrer für Sollzeiten und Gegner. Er schaut voraus, plant das Tempo nach Kurvengrenze und Bremsweg und lenkt zur Linie plus seitlichem Versatz.
  - Überholen: Ist ein Auto 2–22 m voraus auf ähnlicher Linie und langsamer, weicht der Gegner auf die freie Seite aus und kehrt danach zurück.
- **Rennszene:**
  - Startaufstellung zu zweit versetzt, der Spieler startet von Platz 4.
  - Die Gegner fahren mit derselben Fahrphysik, die Leitplanke hält sie auf.
  - Berührungen zwischen Autos: Kreise mit 1,15 m Radius, auseinanderschieben, Geschwindigkeit längs der Verbindung austauschen, leichter Dreh.
  - Live-Position „P3/6“ in der Anzeige.
  - Beim Zieleinlauf entsteht der Endstand: Gegner im Ziel mit ihrer Zeit, die übrigen werden aus ihrem Schnitt hochgerechnet.
- **Oberfläche:** Im Rennen-Reiter stehen Starterfeld und Preisgeld nach Platz. Das Ergebnisfenster zeigt Platz und Tabelle aller sechs Fahrer.
- Tests: `races.test.ts` (Anteil der Gegnerrennen, Feld fest je Tag, Spitzenfahrer auf Gold-Niveau, Preisgeld nach Platz), `karriere.cjs` (Starterfeld, Platz im Rennen, Endstand mit sechs Fahrern, Preisgeld nur für 1–3).

## Lenken beim Bremsen, mehr Kurvenhaftung mit Tuning, Werkzeugkasten, größere Motorenbau-Nische

- **Lenken beim Bremsen:** Das ABS hält jetzt Seitenführung je nach Lenkeinschlag zurück, voll gelenkt etwa zwei Drittel vorn und gut die Hälfte hinten. Vorher richtete es sich nur nach der Kurve, die schon gefahren wurde, und die ist beim Einlenken null.
  - Vorher: Vollbremsung plus voller Lenkeinschlag ergab 1° Kursänderung in 1 s.
  - Jetzt: 17–19°, und das Auto wird trotzdem deutlich langsamer.
- **Mehr Kurvenhaftung, Tuning wirkt stärker:**
  - Grundhaftung 1,0 statt 0,93 (etwas großzügiger als real, wie in Rennspielen). Felgengröße +3 % je Stufe, Verbreiterung +4 %.
  - Fahrwerk: Federn +3 %, Sportfahrwerk +7 %, Gewinde +12 %.
  - Der Heckflügel bringt einen Frontsplitter mit (35 % des Flügelabtriebs vorn): mehr Kurvenspeed, ohne dass das Auto bei Tempo nur schiebt.
  - Beispiel bei 160 km/h: Serien-330 0,97 g (Radius 186 m), 330 mit Gewinde und Flügel 1,11 g (152 m).
- **Lenkung:** Die Kennlinie des Schiebereglers ist direkter (Exponent 1,15 statt 1,35), die Lenkrate liegt bei 6/s.
- **Werkzeugkasten:** „Nehmen“/„Ablegen“ und „Verkaufen“ stehen jetzt untereinander, Name und Hinweis behalten ihren Platz (zwei Zeilen, dann gekürzt). Die Kaufknöpfe bilden ein Raster mit dem Preis in der zweiten Zeile.
- **Motorenbau-Nische:** 5,8 × 5,6 m statt 4,2 × 3,8 m.
  - Der Motorständer steht frei mit mindestens 1,4 m Platz auf jeder Seite, der Kran davor.
  - Werkzeugwagen, Terminal und Spezialschrank stehen an der Rückwand.
  - Liegt die Nische über das Ende der kurzen Halle 2 hinaus, schließt eine eigene Wand sie ab. Der Laufbereich ist sauber getrennt (Nische und Öffnung).
- Tests: Lenken beim Bremsen (≥ 10° in 1 s, trotzdem langsamer), Tuning bringt bei 160 km/h mehr als 10 % Querbeschleunigung. Rundgang um den Ständer geprüft (Skript), Werkzeugkasten in Bildern angesehen.

## Keine Überschneidungen im Rennen, Koop-Rennen gegeneinander

- **Kollision (`game/carCollision.ts`):** Jedes Auto besteht aus drei Kreisen (r 0,95 m) bei −1,45 / 0 / +1,45 m entlang der Längsachse, passend zu einem 4,5 m langen Auto.
  - Bei Berührung wird sofort getrennt (nach Masse geteilt) und ein Stoß am Berührpunkt gerechnet, mit Drehimpuls (Treffer am Heck dreht das Auto), Rückprall 0,2 und Reibung 0,25.
  - Zwei Durchgänge, damit Berührungen von drei Autos sauber aufgehen.
  - Ein „festes“ Gegenüber (Koop-Mitspieler) bewegt sich nicht.
  - Tests: Auffahren von hinten, Treffer am Heck von der Seite, festes Gegenüber – nie mehr als 5 cm Überschneidung.
- **Koop-Rennen (`net/coopRace.ts`, `ui/CoopRaceUI.tsx`):** Läuft vollständig über die Lage der Mitglieder (Presence), ohne Schema-Änderung.
  - `lobby`: Strecke und Startzeit, `join`: Teilnahme mit Auto, `rr`: eigene Fahrzeuglage im Rennen.
  - **Ablauf:**
    - Am Computer unter „Rennen“ wählt man Strecke und Auto und schreibt das Rennen aus. Mitspieler bekommen eine Ansage und fahren mit ihrem Auto mit.
    - Der Ausschreibende startet. Die Startzeit liegt 10 s voraus, die Strecke wird schon beim Ausschreiben bzw. Mitfahren vorberechnet.
    - Alle Geräte wechseln von selbst in die Startaufstellung, der Countdown läuft nach der Startzeit.
  - **Im Rennen:**
    - Jedes Gerät rechnet nur sein eigenes Auto. Die anderen werden aus ihrer Lage gezeichnet (bis 0,6 s vorausgerechnet) und sind für das eigene Auto feste Hindernisse.
    - Live-Platz unter den Teilnehmern.
  - **Ergebnis:** Tabelle live aus den Lagen; wer noch fährt, steht mit „fährt noch …“ da. Kein Startgeld, kein Preisgeld (gemeinsames Konto).
  - Grenze: Die Startzeit ist die Uhr des Ausschreibenden. Gehen die Uhren der Geräte stark auseinander, startet ein Gerät entsprechend früher oder später (Geräte mit Netzzeit liegen meist unter einer Sekunde auseinander).
- Tests: `carCollision.test.ts`, `koop.cjs` (Ausschreibung sehen, mitfahren, Start, beide auf der Strecke, Platzanzeige, beide im Ziel, gemeinsamer Endstand).

## Koop: kein Pausieren wegen „woanders offen“, gemeinsame Server-Uhr für Rennen

- **„Werkstatt läuft woanders“:** Gab Fehlalarme, obwohl keine Safari-Tabs offen waren. Das Spiel pausiert nicht mehr. Erst nach fünf Anzeichen innerhalb einer Minute (eigene Änderungen oder Positionsmeldungen aus einem fremden Fenster) erscheint einmal ein Hinweis.
- **Gleicher Start für alle im Koop-Rennen:**
  - Die Startzeit gilt jetzt in Server-Zeit. Jedes Gerät misst den Abstand seiner Uhr zum Server wie bei der Internet-Zeit: fünf Anfragen an `gk_now`, die mit der kürzesten Laufzeit zählt.
  - Gemessen wird beim Öffnen der Werkstatt sowie beim Ausschreiben und Mitfahren. `syncedNow()` ersetzt `Date.now()` für Startzeit, Countdown und Rennuhr.
  - Ohne `gk_now` auf dem Server gilt weiter die Geräteuhr.
- **Schema:** neue Funktion `gk_now()`, im Supabase-SQL-Editor ausführen.
- Tests: SQL-Test `gk_now`, Logiktest für die Auswahl der Messung, `koop.cjs`: Spieler 2 hat eine um 5 s vorgehende Uhr, nach dem Abgleich bleibt ein Rest von unter 0,6 s; das Rennen läuft trotzdem gemeinsam.

## Koop: bis zu acht Mitglieder

- `gk_join_workshop` lässt bis zu 8 statt 4 Mitglieder zu. Hintergrund: Geht die automatische Anmeldung eines Geräts verloren, tritt man mit einer neuen Kennung wieder bei, und der alte Eintrag bleibt als offline stehen.
- Schema-Änderung: neue Fassung von `gk_join_workshop`, im Supabase-SQL-Editor ausführen.

## Echte Modellnamen und bessere Grafik der Fahrwelten

- **Namen:** Alle Autos tragen jetzt echte Marken- und Modellnamen, z. B. Tanaka Piccolo 1.4 → Volkswagen Golf IV 1.4, Nordwind 245 → Volvo V70 2.0 (P80), Veloce Stradale → Ferrari 458 Italia, Kaiser 600 → Mercedes-Maybach S 580, BMV → BMW. Kennungen, Werte, Motoren und Aussehen bleiben gleich, ebenso Spielstände. Das BMW-Gesicht (Doppelniere) hängt jetzt an der Kennung statt an der Marke.
- **Recherche-Grundlage:** In Rennspielen wie Gran Turismo machen vor allem Lack mit Klarlack und Spiegelung, Kontaktschatten, Himmel und Licht sowie die Streckenausstattung den Eindruck aus: Randsteine, Kiesbetten, Reifenstapel, Banden, Gummiabrieb, Startaufstellung. Klarlack und Spiegelung gab es schon. Ergänzt wurde der Rest, mit wenigen Zeichenaufrufen fürs iPad.
- **Himmel** (`DriveSky.tsx`): Verlauf vom Dunst am Horizont zum Blau, Sonnenhof und ziehende Haufenwolken, alles in einem kleinen Shader. Nebel in Dunstfarbe.
- **Kontaktschatten** unter dem eigenen Auto, den Gegnern und den Mitspielern.
- **Rennstrecken:** Gummiabrieb auf der Ideallinie, die in Kurven zum Scheitelpunkt wandert. Reifenstapel mit rot-weißem Band außen in den Kurven, Werbebanden an den Geraden. Startampel am Startbogen: fünf Lampenpaare im Countdown, beim Start aus. Weiße Startplatz-Winkel.
- **Land:** Leitpfosten alle 50 m, sattere Wiese.
- **Bäume:** Nadelbäume aus drei Etagen, Farbe je Baum. Laubkronen feiner facettiert.
- `e2e/strecken.cjs` nimmt Bilder aller Fahrwelten in voller Grafik auf (Vorher-Nachher-Vergleich).

## Drift, Rallye, Wetter, neue Teile, Tagesablauf von Hand

- **Tagesablauf:** Standard ist wieder „von Hand“. Der Tag endet erst mit „⏭ Tag“ oder „Feierabend“. Der Knopf „✋ Manuell / ⏱ Auto“ in der Kopfleiste schaltet den automatischen Ablauf (drei Minuten) ein. Die Einstellung gilt je Gerät (`localStorage` `gk-autoday`). Im Koop schaltet nur das führende Gerät um, und nur, wenn dort „Auto“ gewählt ist.
- **Neue Teile an der Tuning-Werkbank** (bestellen, montieren, wieder abbauen wie die Optikteile, im Koop mit abgeglichen):
  - **Reifen:** Sport, Semi-Slicks, Drift (harte Mischung), Winter, Schotter, Spikes. Die Haftung je Untergrund (trocken, nass, Schnee, lose) steht in `game/grip.ts`.
  - **Differential:** Sperre (mehr Traktion, Drift mit Gas dosierbar) und verschweißt (driftet leicht, schiebt in engen langsamen Kurven).
  - **Drift & Rallye:** Lenkwinkel-Kit (mehr Einschlag, größere Driftwinkel), hydraulische Handbremse, Unterfahrschutz (weniger Rollwiderstand auf losem Untergrund).
  - **Fahrwerk:** Rallyefahrwerk (+4 cm, mehr Haftung auf losem Untergrund und Schnee).
- **Fahrphysik** (`vehicle.ts`): Die Fahrbahn hat eine Untergrundklasse, `surfaceGrip` = Oberfläche × Reifen × Rallyefahrwerk. Das Differential wirkt auf die Antriebskraft und auf den Seitenführungsverlust durchdrehender Räder. Ohne neue Teile und auf trockenem Asphalt ist alles wie bisher (Test).
- **Jahreszeiten und Wetter:** 40 Tage je Jahr, je zehn Tage Frühling, Sommer, Herbst und Winter. Das Wetter (Sonne, Wolken, Regen, Nebel, Schnee) steht fest je Tag und ist damit im Koop überall gleich.
  - Nasser Asphalt hat 78 % Haftung, Schnee 50 %. Die Sollzeiten der Rennen und die Computerfahrer richten sich danach.
  - Optik: grauer Himmel, Regen- bzw. Schneefall, kürzere Sicht, nasse oder verschneite Landschaft, Herbstlaub.
  - Das Wettersymbol steht in der Kopfleiste, das Wetter auch im Rennen-Reiter.
- **Rallye:** drei Pisten ohne Leitplanken, mit Strohballen in den Kurven. Rallye Seenland (Schotter, Vorbild Finnland), Rallye Schneewald (Schnee, Vorbild Schweden), Rallye Matschtal (Matsch, Vorbild Wales). Zeitfahren mit Medaillen. Die Pisten stehen auch für Koop-Rennen zur Auswahl.
- **Driftwettbewerb:** Punkte = Driftwinkel × Tempo / 100 je Sekunde, mal Kombo (alle 2,5 s +0,5, bis ×4). Die Kette wird nach 1,2 s ohne Drift gutgeschrieben. Wer von der Fahrbahn abkommt oder anstößt, verliert die laufende Kette. Medaillen nach Punkten (nach Streckenlänge). Das ESP ist im Wettbewerb aus.
- **Rennkalender:** An jedem dritten Tag, an dem bisher kein Rennen war, gibt es abwechselnd eine Rallye oder einen Driftwettbewerb. Die übrigen Rennen bleiben unverändert.
- **Freier Driftmodus:** In der Probefahrt mit ESP aus zählen Driftpunkte, zum Üben.
- Tests: `grip.test.ts` (Reifen je Untergrund, Drift-Teile, Wetter), Rallye und Drift in `races.test.ts`, `karriere.cjs` (Teile montieren, Rallye, Driftwettbewerb), `markt.cjs` (Tagesablauf, freier Driftmodus).

## Reifen optisch unterscheidbar

- Jede Reifenart hat ein eigenes Aussehen (`carParts.ts` `wheelGeometry` mit `TIRE_MARK`, Material in `CarModel.tsx`):
  - Serie: unverändert
  - Sport: gelbe Flankenlinie
  - Semi-Slicks: glatte Lauffläche ohne Rillen, leichter Glanz, rote Linie
  - Drift: breites weißes Flankenband, etwas abgefahren-grau
  - Winter: feine Lamellenblöcke in drei Reihen, blaue Linie
  - Schotter: grobe Stollen in zwei versetzten Reihen, staubig, orange Linie
  - Spikes: Stollen mit Metallstiften, graue Linie
- Bei niedriger Grafikstufe gibt es weniger Profilblöcke.

## Cockpit: drehendes Lenkrad, sichtbare Tuningteile

- Das Lenkrad ist ein eigenes Netz (`steeringWheelGeometry`, `steeringWheelPose`) und dreht mit der Lenkung: voller Einschlag sind etwa 140° am Lenkrad.
- Sportlenkrad: kleiner, dickerer Kranz, unten abgeflacht, rote Markierung oben, drei schmale Speichen.
- Hydraulische Handbremse: hoher Hebel mit rotem Griff rechts neben dem Lenkrad, mit Ausgleichsbehälter.
- Neues Teil **Überrollkäfig** (Drift & Rallye, 1.600 €, rein optisch): Hauptbügel, A-Säulen-, Dach- und Türstreben, Diagonale. Die Rohre folgen der Innenseite der Kabine.
- Im Cockpit sind die Scheiben von innen fast klar (vorher stark getönt).
- Sportsitze und Haubenhutze waren schon sichtbar.

## Unfallschäden

- Einschläge bei Probefahrt und Rennen werden während der Fahrt gesammelt (`game/crash.ts`) und beim Ende auf das Auto übertragen, auch bei abgebrochener Fahrt. Erfasst werden Leitplanke (Geschwindigkeit zur Planke hin), Bäume und Häuser sowie Berührungen mit Gegnern bzw. Mitspielern.
- **Beulen** (`ZoneState.dent`) ab 3 m/s Aufprallgeschwindigkeit, je Bereich (Front, Heck, links, rechts):
  - Darstellung: Die Karosserie wird weich eingedrückt, in der Mitte der Delle ist der Lack bis auf die Grundierung abgeschabt.
  - Wert: Abzug „Unfallschaden“.
  - Akte: zeigt „Beulen %“.
- **Technik** ab 8,5 m/s: vorn der Kühler, an einer vorderen Ecke Querlenker oder Spurstange, hinten der Endtopf. Das Bauteil wird defekt (unbekannt, also prüfen).
- **Reparatur** in der Lackierkabine mit dem Schleifer: ausbeulen, spachteln, schleifen und grundieren (40 € Material), danach lackieren. Lackieren geht erst, wenn die Beule weg ist.
- In der Fahrt erscheint der Hinweis „💥 Unfallschaden“ bzw. „– auch Technik prüfen“.

## Rennspiel-Gefühl

- **Kamera** (Verfolger): Leichtes Wackeln ab 90 km/h, auf unebenem Boden abseits der Straße und kurz nach einem Einschlag.
- **Geschwindigkeitsrahmen** ab 100 km/h: dunkler Rand mit feinen Streifen, der zur Mitte ausblendet. Nur ein CSS-Verlauf (iPad-freundlich).
- **Klang** (`roadAudio`):
  - Reifenquietschen als Ton (Dreieck mit Vibrato), Tonhöhe und Lautstärke wachsen mit dem Rutschen.
  - Knirschen auf losem Untergrund und auf Rallyepisten statt Quietschen.
  - Turbo-Abblasen beim Gaswegnehmen über 55 % der Höchstdrehzahl (Turbo bzw. Turbo-Nachrüstung).
  - Fehlzündungen im Schub mit Sportauspuff, Sport-Endtopf oder Fächerkrümmer bzw. ab Kennfeld Stufe 2.

## Aufgabenbuch für Einsteiger

- Elf geführte Schritte (`game/tutorial.ts`): erstes Auto kaufen, Akte lesen, Werkzeug nehmen, Motor starten und hinhören, Bauteil tauschen, Probefahrt, waschen, verkaufen, Kundenauftrag, Tuningteil, Rennen. Jeder Schritt hat eine Kurzanleitung und eine Belohnung von 100–500 €.
- Erkannt wird jeder Schritt an einer Änderung im Spielstand (vorher → nachher), nicht durch Eingriffe in die Spielaktionen.
- Der Knopf „📘 x/11“ in der Kopfleiste öffnet die Liste, der aktuelle Schritt ist markiert. „Hinweis ausblenden“ und „Von vorn beginnen“ sind möglich.
- In der Werkstatt steht oben links ein Hinweis mit dem nächsten Schritt. Er lässt sich wegtippen und ist im Testmodus ausgeblendet.
- Der Fortschritt gilt je Gerät (`gk-tutorial`). Im Koop gibt es keine Belohnung (gemeinsames Konto), und Änderungen des Partners zählen nicht.

## iPad-Leistung

- **Fahrwelt je Grafikstufe** (`gfx.ts`: `view`, `trees`, `clouds`, `precip`):
  - Niedrig: 480 m Sichtweite, halb so viele Bäume (nur Darstellung, als Hindernis bleiben alle), Himmel ohne Wolken-Shader, 45 % Niederschlag, keine Berge am Horizont.
  - Mittel und Hoch: 760 bzw. 900 m.
- **Gegner und Mitspieler** ab 14 m Abstand als vereinfachtes Auto (`CarLite.tsx`: Karosserie, Haube und Türen als ein Netz, dazu Kabine, Räder, Rückleuchten, etwa 6 statt rund 70 Zeichenaufrufe). Rennen gegen fünf Gegner in der Startaufstellung: 399 → 275 Zeichenaufrufe, 377k → 281k Dreiecke.
- **Automatik:** Läuft es lange flüssig (über 52 Bilder/s), wird die vorher abgesenkte Auflösung schrittweise wieder angehoben.
- **Messskript** `e2e/leistung.cjs`: Zeichenaufrufe, Dreiecke und Bilder/s je Stufe und Welt. Die Bildrate im Container ist nur ein Vergleichswert. Gemessen in der Fahrwelt: Niedrig etwa doppelt so schnell wie Mittel.

## Koop: Drift-Duell

- Beim Ausschreiben eines Koop-Rennens wählt man „🏁 Rennen“ oder „💨 Drift-Duell“ (`Lobby.mode`).
- Im Drift-Duell zählt jedes Gerät seine eigenen Driftpunkte (gleiche Wertung wie im Driftwettbewerb, ESP aus) und schickt sie in der Rennlage mit (`RaceCar.pts`). Am Server ändert sich nichts.
- In der Fahrt sieht man die eigenen Punkte mit Kombo und eine Live-Tabelle aller Teilnehmer, der Platz richtet sich nach Punkten. Ergebnisfenster „Drift-Duell“ mit Endstand nach Punkten.
- Test in `koop.cjs`: Einladung, gemeinsamer Start, Live-Tabelle beim Mitspieler, Endstand.
