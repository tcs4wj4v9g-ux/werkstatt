# Entwicklungsplan „Ultimate Career"

Fortschrittsdatei, damit die Arbeit nach Unterbrechungen ohne Informationsverlust weitergeht.
Status: ☐ offen · ◐ in Arbeit · ☑ fertig und getestet

## Paket A – Motoren, Fahrzeuge, Markt (ein Pull Request)

- ☑ A1 Motorsystem als Daten: `data/engines.ts` (R4, R6, V6, V8; Benzin/Diesel; Sauger/Turbo; Leistung, Füllmengen, Teilefamilie, Kostenfaktor)
- ☑ A2 Bauteile je Motor erzeugen (`engineComponents`): Spulen+Kerzen bzw. Einspritzdüsen+Glühkerzen je Zylinder, zwei Ventildeckel bei V-Motoren, Turbolader/Ladeluftrohr, AGR, DPF. `COMPONENT_MAP` global durch `defOf(car, id)` ersetzen
- ☑ A3 Defekte motorabhängig (Glühkerze, Einspritzdüse, Turbolader, Ladeluft, AGR, DPF), Symptome, OBD-Codes, Einzelzustand in % je Zündteil
- ☑ A4 Ersatzteile mit Passform (`partId@familie`), Preise nach Motor und Fahrzeugklasse; Lager-Migration
- ◐ A5 3D-Motorraum je Bauart (R6: sechs in Reihe, V6/V8: zwei Bänke), Turbo/AGR/DPF als Bauteile
- ☑ A6 Motorklang je Bauart (Zündfrequenz, V8-Charakter, Diesel-Nageln, Turbopfeifen)
- ◐ A7 Karosserien parametrisch (Limousine, Kombi, Coupé, Kompakt, Sportwagen, Luxus, Klassiker), Leuchten-/Grill-/Felgenvarianten
- ☑ A8 Neue Modelle in fünf Preisklassen (mind. 12 neue), Fahrleistung auf der Strecke je Motor
- ☑ A9 Markt: mind. 25 Angebote mit Laufzeit, Klassenverteilung, Filter/Sortierung, nur das gewählte Auto in 3D
- ☑ A10 Spielstand Version 5: Motor-Migration alter Autos (Sechszylinder bekommen Zylinder 5/6), Lager-Schlüssel, Tests
- ◐ A11 Logiktests, Browser-Durchläufe (R4, R6, V6, V8, Diesel, Turbo), Regression, Pull Request

## Paket B – Sammlung, Erfolge, Spezialgeräte, schwere Schäden

- ☐ B1 Sammlerwert, Showroom-Kennzeichnung, Privatfahrzeuge ausbauen
- ☐ B2 Erfolge mit einmaligen Belohnungen, Erfolgsmenü
- ☐ B3 Leistungsprüfstand (Messung aus Motor, Zustand, Defekten; Diagramm)
- ☐ B4 Motorheber + schwere Schäden (Zylinderkopfdichtung, Getriebe), wirtschaftlich teils unrentabel
- ☐ B5 Tests, Pull Request

## Paket C – Immobilien, Wettbewerbe, Events

- ☐ C1 Standort-/Stellplatzsystem, größere Werkstätten (3 und 4 Bühnen, Headquarters mit Showroom), Wechsel
- ☐ C2 Händler-Wettbewerbe (Restaurierung, Händler-Challenge, Sammler)
- ☐ C3 Fahrzeugtreffen mit Bewertung aus echten Fahrzeugdaten
- ☐ C4 Balancing, Gesamttests, Pull Request

## Technische Notizen

- Spielstand: `localStorage` Schlüssel `garage-kings-save-v1`, zustand-persist, aktuell Version 5 (Motoren, Lager nach Passform `teil@passform`, Markt mit Laufzeiten); `migrate` + `merge` in `src/game/store.ts`, `normalizeCar` ergänzt fehlende Felder.
- Tests: `npm test` (vitest, `src/game/game.test.ts`), `npm run build`. Browser-Durchläufe als Playwright-Skripte außerhalb des Repos (Sitzungs-Scratchpad): v3play, v3parts, v4play, bleed, eng (Motoren), shots5 (Karosserien, Markt). Test-Hooks: `__gk`, `__gkPlayer`, `__gkAudio`, `__gkLib.createCar`.
- Fahrzeug vorn (x > 0,78: Motorraum, Vorderräder bei x = 1,38) bleibt bei allen Karosserien gleich, damit Motor- und Bremsenteile überall an derselben Stelle sitzen.
- Motorsystem: `data/engines.ts` → `data/components.ts` erzeugt die Bauteile je Motor (`defsOf(car)`, `defOf(car, id)`); `COMPONENT_MAP` nur noch für Namen. Defekte lösen `coil*`-Muster über `defectComponents(car, def)` auf.
- Passform und Preise: `fitment.ts` (`partKey`, `basePartPrice`, `defectPenalty`, `defectLabor`, `migrateInventory`). Fahrleistungen und Leistungskurve: `performance.ts` (auch für den späteren Prüfstand B3).
- Markt: `fillListings(existing, money, rng, index, first, day)` hält je Klasse `CLASS_TARGETS` Inserate; `until` = letzter Tag; Filter in `marketFilter.ts`, Oberfläche `ui/MarketTab.tsx`.
- Karosserien: `BODY_SPECS` in `three/carGeometry.ts`; Markengesicht/Felgen/Auspuff in `CarModel.tsx` (`look`).
