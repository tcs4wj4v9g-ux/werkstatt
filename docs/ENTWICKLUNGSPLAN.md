# Entwicklungsplan „Ultimate Career"

Fortschrittsdatei, damit die Arbeit nach Unterbrechungen ohne Informationsverlust weitergeht.
Status: ☐ offen · ◐ in Arbeit · ☑ fertig und getestet

Alle drei Pakete sind umgesetzt und gehen gemeinsam in einen Pull Request.

## Paket A – Motoren, Fahrzeuge, Markt

- ☑ A1 Motorsystem als Daten: `data/engines.ts` (R4, R6, V6, V8; Benzin/Diesel; Sauger/Turbo; Leistung, Füllmengen, Teilefamilie, Kostenfaktor)
- ☑ A2 Bauteile je Motor erzeugen (`engineComponents`): Spulen+Kerzen bzw. Einspritzdüsen+Glühkerzen je Zylinder, zwei Ventildeckel bei V-Motoren, Turbolader/Ladeluftrohr, AGR, DPF. `COMPONENT_MAP` global durch `defOf(car, id)` ersetzen
- ☑ A3 Defekte motorabhängig (Glühkerze, Einspritzdüse, Turbolader, Ladeluft, AGR, DPF), Symptome, OBD-Codes, Einzelzustand in % je Zündteil
- ☑ A4 Ersatzteile mit Passform (`partId@familie`), Preise nach Motor und Fahrzeugklasse; Lager-Migration
- ☑ A5 3D-Motorraum je Bauart (R6: sechs in Reihe, V6/V8: zwei Bänke), Turbo/AGR/DPF als Bauteile
- ☑ A6 Motorklang je Bauart (Zündfrequenz, V8-Charakter, Diesel-Nageln, Turbopfeifen)
- ☑ A7 Karosserien parametrisch (Limousine, Kombi, Coupé, Kompakt, Sportwagen, Luxus, Klassiker), Leuchten-/Grill-/Felgenvarianten
- ☑ A8 Neue Modelle in fünf Preisklassen (mind. 12 neue), Fahrleistung auf der Strecke je Motor
- ☑ A9 Markt: mind. 25 Angebote mit Laufzeit, Klassenverteilung, Filter/Sortierung, nur das gewählte Auto in 3D
- ☑ A10 Spielstand Version 5: Motor-Migration alter Autos (Sechszylinder bekommen Zylinder 5/6), Lager-Schlüssel, Tests
- ☑ A11 Logiktests, Browser-Durchläufe (R4, R6, V6, V8, Diesel, Turbo), Regression, Pull Request

## Paket B – Sammlung, Erfolge, Spezialgeräte, schwere Schäden

- ☑ B1 Sammlerwert, Showroom-Kennzeichnung, Privatfahrzeuge ausbauen
- ☑ B2 Erfolge mit einmaligen Belohnungen, Erfolgsmenü
- ☑ B3 Leistungsprüfstand (Messung aus Motor, Zustand, Defekten; Diagramm)
- ☑ B4 Motorheber + schwere Schäden (Zylinderkopfdichtung, Getriebe), wirtschaftlich teils unrentabel
- ☑ B5 Tests, Pull Request

## Paket C – Immobilien, Wettbewerbe, Events

- ☑ C1 Standort-/Stellplatzsystem, größere Werkstätten (3 und 4 Bühnen, Headquarters mit Showroom), Wechsel
- ☑ C2 Händler-Wettbewerbe (Restaurierung, Händler-Challenge, Sammler)
- ☑ C3 Fahrzeugtreffen mit Bewertung aus echten Fahrzeugdaten
- ☑ C4 Balancing, Gesamttests, Pull Request

## Technische Notizen

- Spielstand: `localStorage` Schlüssel `garage-kings-save-v1`, zustand-persist, aktuell Version 5 (Motoren, Lager nach Passform `teil@passform`, Markt mit Laufzeiten); `migrate` + `merge` in `src/game/store.ts`, `normalizeCar` ergänzt fehlende Felder.
- Tests: `npm test` (vitest, `src/game/game.test.ts`), `npm run build`. Browser-Durchläufe als Playwright-Skripte außerhalb des Repos (Sitzungs-Scratchpad): v3play, v3parts, v4play, bleed, eng (Motoren), shots5 (Karosserien, Markt, Shop), career (Standorte, Getriebe, Prüfstand, Showroom, Wettbewerbe, Version-4-Spielstand). Test-Hooks: `__gk`, `__gkPlayer`, `__gkAudio`, `__gkLib.createCar`.
- Fahrzeug vorn (x > 0,78: Motorraum, Vorderräder bei x = 1,38) bleibt bei allen Karosserien gleich, damit Motor- und Bremsenteile überall an derselben Stelle sitzen.
- Motorsystem: `data/engines.ts` → `data/components.ts` erzeugt die Bauteile je Motor (`defsOf(car)`, `defOf(car, id)`); `COMPONENT_MAP` nur noch für Namen. Defekte lösen `coil*`-Muster über `defectComponents(car, def)` auf.
- Passform und Preise: `fitment.ts` (`partKey`, `basePartPrice`, `defectPenalty`, `defectLabor`, `migrateInventory`). Fahrleistungen und Leistungskurve: `performance.ts` (auch für den späteren Prüfstand B3).
- Markt: `fillListings(existing, money, rng, index, first, day)` hält je Klasse `CLASS_TARGETS` Inserate; `until` = letzter Tag; Filter in `marketFilter.ts`, Oberfläche `ui/MarketTab.tsx`.
- Karosserien: `BODY_SPECS` in `three/carGeometry.ts`; Markengesicht/Felgen/Auspuff in `CarModel.tsx` (`look`).
- Paket B: `career.ts` (Zähler, 26 Erfolge, Sammlung), Store-Abo vergibt Belohnungen genau einmal (`achieved`); `performance.ts` → Prüfstand (`runDyno`, `ui/CareerTabs.tsx` `DynoModal`); kapitale Schäden `head_gasket` (unter `cyl_head`) und `gearbox` (`equipment: 'hoist'`), selten über `weight` in `defects.ts`.
- Paket C: Standorte sind Ausbauten `loc_pro` / `loc_center` / `loc_hq` (`data/workshop.ts`), neue Stellplätze 10–14 (Bühne 3, 4, Showroom 1–3); `liftUp`/`drainPan` sind nach Stellplatz indiziert. 3D in `three/Annex.tsx`, Begehbarkeit über `site`/`setSite` in `three/player.ts`. Wettbewerbe und Treffen: `contests.ts`, Auswertung in `nextDay`.
- Bewusste Grenzen: Die Standorte sind Erweiterungen desselben Geländes (kein getrennter zweiter Ort mit eigenem Fuhrpark); Glühkerzen sitzen spielmechanisch unter der Einspritzdüse; Biturbo-Motoren haben ein Lader-Bauteil; hinten gibt es weiterhin keine demontierbaren Räder/Bremsen.
- iPad-Leistung: Auf den Hebebühnen wird nur das Auto mit Motorraum und Schrauben aufgebaut, an dem gearbeitet wird (`detailed` in `GarageScene.tsx`); im Markt nur das besichtigte Auto.
- Mögliche nächste Schritte: getrennte Standorte mit eigenem Fuhrpark, zerlegbare Hinterachse, weitere Spezialgeräte (Reifenmontage, Achsvermessung), mehr Sammlermodelle.
- Browser-Durchläufe liegen jetzt im Repository unter `e2e/` (Start: `e2e/run.sh`, Testmodus `?test` mit reduzierter Grafik). Endstand: 219 Prüfpunkte in sieben Durchläufen grün.
