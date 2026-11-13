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
- ☐ Phase 8 – Abschlusstests, Vorher-Nachher-Bilder, Pull Request.

## Technische Hinweise

- Alle Positionen der ausbaubaren Teile sind unverändert; nur die Bänke der V-Motoren sind um 0,2 rad geneigt (Tests rechnen das um).
- Feste Motorraumteile fangen keine Tipps ab (`raycast` aus); unsichtbare Körper an Block, Luftfilter und Kühler übernehmen das.
- Ein Auto besteht in der einfachen Darstellung aus rund 25 Zeichenaufrufen (vorher rund 150).
- `e2e/galerie.cjs` nimmt Bilder in voller Grafik auf (`GK_TAG`, `GK_VIEWS=karosserie,motor,halle`, `GK_GFX`).
