import { modelsOfClass } from './data/cars';
import { DEFECTS } from './data/defects';
import { costFactor, defectLabor } from './fitment';
import { performance } from './performance';
import { applicableDefects, createCar, type Rng } from './market';
import { CAR_MODELS } from './data/cars';
import { fluidEngineBlocker, serviceState } from './fluids';
import { activeDefects, isAssembled } from './repair';
import type { CarInstance, DefectId, JobOffer, TuningGoal } from './types';

// Kundenaufträge: Der Kunde beschreibt nur, was ihm auffällt. Bezahlt wird,
// wenn die tatsächliche Ursache behoben und das Auto wieder komplett ist.

export const MAX_JOB_OFFERS = 3;
const pick = <T,>(arr: T[], rng: Rng) => arr[Math.floor(rng() * arr.length)];

interface JobTemplate {
  category: string;
  complaint: string;
  /** Eine dieser Ursachen steckt dahinter – welche, muss der Spieler herausfinden. */
  causes: DefectId[][];
  /** Reine Wartung statt Fehlersuche. */
  service?: 'oil_change';
}

export const JOB_TEMPLATES: JobTemplate[] = [
  { category: 'Motorproblem', complaint: 'Der Motor läuft seit ein paar Tagen unruhig. Besonders beim Beschleunigen ruckelt das Auto.', causes: [['coil'], ['plugs'], ['vacuum']] },
  { category: 'Motorgeräusch', complaint: 'Aus dem Motor kommt ein metallisches Geräusch. Morgens ist es besonders schlimm.', causes: [['chain'], ['lifters']] },
  { category: 'Bremsenreparatur', complaint: 'Beim Bremsen schleift und rubbelt es vorne. Bitte einmal die Bremse machen.', causes: [['brakes'], ['discs'], ['brakes', 'discs']] },
  { category: 'Kühlungsproblem', complaint: 'Ich muss ständig Kühlwasser nachfüllen und die Temperatur geht hoch.', causes: [['water_pump'], ['coolant_hose']] },
  { category: 'Kühlungsproblem', complaint: 'Die Heizung wird nicht mehr richtig warm und der Verbrauch ist gestiegen.', causes: [['thermostat']] },
  { category: 'Elektrischer Defekt', complaint: 'Die Batterieleuchte brennt und gestern sprang er kaum noch an.', causes: [['alternator'], ['belt']] },
  { category: 'Wartung', complaint: 'Beim Anlassen quietscht es laut. Bitte nachsehen.', causes: [['belt']] },
  { category: 'Ölwechsel', complaint: 'Der Service ist überfällig. Bitte Ölwechsel mit neuem Filter.', causes: [[]], service: 'oil_change' },
  { category: 'Dieselproblem', complaint: 'Morgens springt der Diesel ganz schlecht an und qualmt weiß.', causes: [['glow']] },
  { category: 'Dieselproblem', complaint: 'Der Motor nagelt neuerdings hart und zieht nicht mehr richtig.', causes: [['injector']] },
  { category: 'Leistungsverlust', complaint: 'Er zieht nicht mehr – als hätte jemand den Turbo abgeklemmt. Manchmal pfeift oder zischt es.', causes: [['turbo'], ['boost_leak']] },
  { category: 'Abgasproblem', complaint: 'Auf der Autobahn geht er in den Notlauf, und er rußt beim Gasgeben.', causes: [['dpf'], ['egr']] },
  { category: 'Ölverlust', complaint: 'Ich habe Ölflecken in der Einfahrt. Wo kommt das her?', causes: [['gasket'], ['oil_pan']] },
];

/** Tuningaufträge: Der Kunde sagt genau, was er will. Bezahlt werden Arbeitslohn und Teile, wenn alles verbaut ist. */
interface TuningTemplate {
  complaint: string;
  goals: TuningGoal[];
  /** Arbeitslohn für ein Mittelklasseauto. */
  fee: number;
}
export const TUNING_TEMPLATES: TuningTemplate[] = [
  { complaint: 'Ich will, dass man ihn hört! Bitte eine Sportabgasanlage einbauen.', goals: [{ kind: 'part', comp: 'downpipe', variant: 'exhaust_sport', text: 'Sportabgasanlage eingebaut' }], fee: 180 },
  { complaint: 'Er soll besser atmen – bitte einen offenen Sportluftfilter.', goals: [{ kind: 'part', comp: 'intake_hose', variant: 'intake_sport', text: 'Sportluftfilter eingebaut' }], fee: 90 },
  { complaint: 'Er soll spürbar mehr Leistung haben – mindestens 12 % mehr, aber standfest abgestimmt.', goals: [{ kind: 'power', pct: 12, text: 'Mindestens 12 % mehr Leistung, sauber abgestimmt' }], fee: 380 },
  {
    complaint: 'Neue Felgen und ein Sportfahrwerk – er soll tiefer und sportlicher dastehen.',
    goals: [
      { kind: 'visual', field: 'rim', text: 'Andere Felgen montiert' },
      { kind: 'visual', field: 'suspension', values: ['sport', 'coilover'], text: 'Sport- oder Gewindefahrwerk' },
    ],
    fee: 220,
  },
  {
    complaint: 'Mach ihn optisch scharf: Sport-Frontstoßstange und einen Heckspoiler, bitte.',
    goals: [
      { kind: 'visual', field: 'front', text: 'Sport-Frontstoßstange' },
      { kind: 'visual', field: 'spoiler', text: 'Heckspoiler (Lippe, Bürzel oder Flügel)' },
    ],
    fee: 200,
  },
];

/** Ist ein Tuningwunsch am Auto erfüllt? */
export function tuningGoalMet(car: CarInstance, g: TuningGoal): boolean {
  if (g.kind === 'part') return !!car.components[g.comp]?.installed && car.components[g.comp]?.variant === g.variant;
  if (g.kind === 'visual') {
    const v = car.visual?.[g.field];
    return g.values ? g.values.includes(v as never) : v !== undefined && v !== 0 && v !== false && v !== 'stock' && v !== 'none' && v !== '';
  }
  const p = performance(car);
  return p.ps >= p.ratedPs * (1 + g.pct / 100) && !p.output.risks.some((r) => r.level >= 0.5);
}

function createTuningOffer(rng: Rng): JobOffer {
  // Tuningkunden kommen eher mit Mittelklasse- und Sportwagen.
  const roll = rng();
  const modelId = pick(modelsOfClass(roll < 0.25 ? 'budget' : roll < 0.75 ? 'mid' : 'sport'), rng);
  const t = pick(TUNING_TEMPLATES, rng);
  const car = createCar(modelId, [], rng, { origin: 'job' });
  const fee = Math.round((t.fee * (1 + costFactor(car))) / 2 / 5) * 5;
  car.job = { id: `job-${Date.now().toString(36)}-${counter++}`, customer: pick(CUSTOMERS, rng), complaint: t.complaint, category: 'Tuning', fee, required: [], initial: [], approved: [], tuning: t.goals };
  return { id: car.job.id, car };
}

const CUSTOMERS = ['Frau Neumann', 'Herr Demir', 'Herr Schuster', 'Frau Ivanova', 'Herr Baumgartner', 'Frau Rossi', 'Herr Lang', 'Frau Hoxha'];
const DIAGNOSIS_FEE = 40;
const OIL_SERVICE_FEE = 65;
const FLUID_PRICE: Record<string, number> = { oil: 9.5, coolant: 4, brake: 12 };
const PARTS_MARKUP = 1.15;

let counter = 0;

export function createJobOffer(rng: Rng): JobOffer {
  // Etwa jede fünfte Anfrage ist ein Tuningwunsch.
  if (rng() < 0.2) return createTuningOffer(rng);
  // Kunden kommen überwiegend mit Alltagsautos, gelegentlich mit etwas Teurerem.
  const roll = rng();
  const modelId = pick(modelsOfClass(roll < 0.5 ? 'budget' : roll < 0.85 ? 'mid' : roll < 0.96 ? 'sport' : 'luxury'), rng);
  const possible = applicableDefects(modelId);
  const fits = (causes: DefectId[]) => causes.every((d) => possible.includes(d));
  // Nur Beanstandungen, die es an diesem Motor geben kann (kein Zündproblem am Diesel).
  const t = pick(JOB_TEMPLATES.filter((x) => x.causes.some(fits)), rng);
  const required = pick(t.causes.filter(fits), rng);
  const defects = [...required];
  // Manchmal steckt noch ein zweiter, nicht beanstandeter Mangel im Auto.
  if (rng() < 0.3) {
    const extra = pick(['belt', 'plugs', 'brakes', 'coolant_hose'] as DefectId[], rng);
    if (!defects.includes(extra) && possible.includes(extra)) defects.push(extra);
  }
  const car = createCar(modelId, defects, rng, { origin: 'job' });
  const fee = (t.service ? OIL_SERVICE_FEE : DIAGNOSIS_FEE) + required.reduce((s, d) => s + defectLabor(car, d), 0);
  if (t.service) car.fluids.oil.quality = Math.min(car.fluids.oil.quality, 0.3);
  car.job = { id: `job-${Date.now().toString(36)}-${counter++}`, customer: pick(CUSTOMERS, rng), complaint: t.complaint, category: t.category, fee, required, initial: defects, service: t.service, approved: [] };
  return { id: car.job.id, car };
}

export function fillJobs(existing: JobOffer[], rng: Rng): JobOffer[] {
  const out = [...existing];
  while (out.length < MAX_JOB_OFFERS) out.push(createJobOffer(rng));
  return out;
}

export function refreshJobs(existing: JobOffer[], rng: Rng): JobOffer[] {
  const keep = [...existing];
  if (keep.length) keep.splice(Math.floor(rng() * keep.length), 1);
  return fillJobs(keep, rng);
}

export interface JobBill {
  /** Beanstandung behoben und Auto komplett – Auftrag kann abgerechnet werden. */
  done: boolean;
  problems: string[];
  lines: { label: string; amount: number }[];
  total: number;
  /** Was nach Abzug der selbst bezahlten Teile übrig bleibt. */
  profit: number;
}

/** Abrechnung eines Kundenauftrags im aktuellen Zustand des Autos. */
export function billJob(car: CarInstance, day = 0): JobBill {
  const job = car.job!;
  const active = activeDefects(car);
  const problems: string[] = [];
  if (job.required.some((d) => active.includes(d))) problems.push('Die Ursache der Beanstandung ist noch nicht behoben.');
  for (const g of job.tuning ?? []) if (!tuningGoalMet(car, g)) problems.push(`Tuningwunsch noch offen: ${g.text}.`);
  if (job.service === 'oil_change' && !serviceState(car).oilChanged) problems.push('Ölwechsel noch nicht vollständig: frisches Öl der richtigen Sorte, neuer Filter, Stand in Ordnung.');
  if (fluidEngineBlocker(car)) problems.push('Im Motor fehlt Öl.');
  if (!isAssembled(car)) problems.push('Das Auto ist nicht komplett zusammengebaut.');
  if (car.lifted) problems.push('Das Auto steht noch auf der Hebebühne.');
  const lines = [{ label: `Arbeitslohn: ${job.category} (inkl. Diagnose)`, amount: job.fee }];
  // Zusatzarbeiten zahlt der Kunde nur, wenn er sie freigegeben hat.
  for (const d of job.approved ?? []) {
    if (!job.required.includes(d) && !active.includes(d)) lines.push({ label: `Zusatzarbeit: ${DEFECTS[d].name}`, amount: defectLabor(car, d) });
  }
  if (job.service === 'oil_change' && serviceState(car).oilChanged) {
    lines.push({ label: `Motoröl ${CAR_MODELS[car.modelId].oilCapacity} l`, amount: Math.round(CAR_MODELS[car.modelId].oilCapacity * FLUID_PRICE.oil * PARTS_MARKUP) });
  }
  if (job.dueDay !== undefined && day <= job.dueDay) lines.push({ label: 'Eilzuschlag (pünktlich fertig)', amount: Math.round(job.fee * 0.6) });
  if (car.partsSpent > 0) lines.push({ label: 'Ersatzteile (inkl. 15 % Aufschlag)', amount: Math.round(car.partsSpent * PARTS_MARKUP) });
  if (car.testDriven) lines.push({ label: 'Trinkgeld für die Probefahrt-Kontrolle', amount: Math.round(job.fee * 0.1) });
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { done: problems.length === 0, problems, lines, total, profit: total - car.partsSpent };
}
