# Grafik- und Realismus-Update – Plan und Stand

Arbeitsbranch `claude/garage-kings-pwa-7nyohs`. ☑ = erledigt, ☐ = offen.

## Analyse (Phase 1)

- Technik: three.js 0.169 mit @react-three/fiber, alles prozedural, keine Bilddateien oder Fremdmodelle.
- Vorher: eine einzige Grundkarosserie mit sieben Dachvarianten, Leuchten und Grill als aufgesetzte Quader, Räder aus bis zu 20 Einzelnetzen, Motor aus Quadern, rund 150 Zeichenaufrufe je Auto.
- Entscheidung gegen fertige 3D-Modelle: frei verwendbare (CC0) Automodelle sind entweder Spielzeug-Stil oder passen nicht zu den 22 Modellen, den einzeln ausbaubaren Teilen, den Lack-/Schmutzzonen und der Haube. Stattdessen wurde der eigene Generator neu geschrieben. Keine fremden Assets, keine Lizenzpflichten.

## Stand

- ☑ Phase 2 – Karosserien: `carGeometry.ts` (Form je Karosserie: Länge, Breite, Radstand, Spur, Dachlinie, Bug/Heck als Superellipse, Charakterlinie, ausgestellte Radläufe), `carParts.ts` (Räder, Leuchten, Grill, Stoßfänger, Spiegel, Griffe, Innenraum), Vordertüren zum Öffnen.
- ☑ Phase 3 – Motoren: `engineBay.ts` (Block, Krümmer, Saugrohr, Kühlerpaket, Federbeindome, Bremskraftverstärker …), V-Motoren mit geneigten Bänken (`V_TILT`), überarbeitete Einzelteile in `CarModel.tsx`.
- ☑ Phase 4 – Werkstatt: `workshopDecor.ts` (Decke, Leitungen, Reifenregal, Fässer, Hebebühnen), neue Boden- und Wandtexturen, Schatten an den Wandfüßen, Ausbaustufen der Standorte.
- ☑ Phase 5 – Materialien: Metallic-/Uni-Lack mit Klarlack, Glas, Chrom, Gummi, Sitzbezüge je Fahrzeugklasse.
- ☑ Phase 6 – Licht: eigene Spiegelumgebungen (Halle mit Lichtbändern, Himmel), Punktlichter je Grafikstufe.
- ☑ Phase 7 – Animationen: Schrauben drehen sich heraus, Stecker gleiten, Teile werden herausgezogen/eingesetzt, Ölstrahl beim Ablassen, Türen.
- ☑ Grafikstufen Niedrig/Mittel/Hoch und Automatik (`gfx.ts`, `Env.tsx` → `Perf`).
- ☑ Phase 8 – Tests, Vorher-Nachher-Bilder (`docs/bilder/`), Messung.

## Technische Hinweise

- Alle Positionen der ausbaubaren Teile sind unverändert; nur die Bänke der V-Motoren sind um 0,2 rad geneigt (Tests rechnen das um).
- Feste Motorraumteile fangen keine Tipps ab (`raycast` aus); unsichtbare Körper an Block, Luftfilter und Kühler übernehmen das.
- Messung (Halle mit zwei Autos, eines in voller Darstellung auf der Bühne, Desktop-Chromium): vorher 669 Zeichenaufrufe und 47.000 Dreiecke, jetzt 551 Zeichenaufrufe und 168.000 Dreiecke. Unsichtbare Trefferflächen werden nicht mehr gezeichnet, Räder, Anbauteile, Innenraum und Schrauben sind je ein Netz.
- Die Bildrate auf dem iPad ist nicht gemessen – dafür gibt es die Automatik und die Anzeige der Bilder pro Sekunde neben der Grafikwahl.
- `e2e/galerie.cjs` nimmt Bilder in voller Grafik auf (`GK_TAG`, `GK_VIEWS=karosserie,motor,halle`, `GK_GFX`).

## Bekannte Grenzen

- Die Karosserien sind weiterhin erzeugte Formen, keine von Hand modellierten Fahrzeuge: Sicken, Lichtkanten und Stoßfänger sind einfacher als bei einem echten Vorbild; Fugen von Haube und Heckklappe sind nicht ausgeformt.
- Vorderwagen (Haubenhöhe, Lage der Vorderachse) ist bei allen Karosserien gleich, weil dort die ausbaubaren Motor- und Bremsenteile sitzen.
- Nur die Vordertüren öffnen sich; Heckklappe und hintere Türen nicht.
- Kein Umgebungsverdeckungs-Effekt in Echtzeit (zu teuer für das iPad) – stattdessen weiche Schatten unter den Autos und an den Wandfüßen.
- Hof, Halle 2 und Showroom haben die neuen Texturen, Hebebühnen und das neue Licht, aber weniger neue Ausstattung als die Stammhalle.
