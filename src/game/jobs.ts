import { COMMON_MODELS } from './data/cars';
import { DEFECTS } from './data/defects';
import { createCar, type Rng } from './market';
import { CAR_MODELS } from './data/cars';
import { fluidEngineBlocker, serviceState } from './fluids';
import { activeDefects, isAssembled } from './repair';
import type { CarInstance, DefectId, JobOffer } from './types';

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
  { category: 'Ölverlust', complaint: 'Ich habe Ölflecken in der Einfahrt. Wo kommt das her?', causes: [['gasket'], ['oil_pan']] },
];

const CUSTOMERS = ['Frau Neumann', 'Herr Demir', 'Herr Schuster', 'Frau Ivanova', 'Herr Baumgartner', 'Frau Rossi', 'Herr Lang', 'Frau Hoxha'];
const DIAGNOSIS_FEE = 40;
const OIL_SERVICE_FEE = 65;
const FLUID_PRICE: Record<string, number> = { oil: 9.5, coolant: 4, brake: 12 };
const PARTS_MARKUP = 1.15;

let counter = 0;

export function createJobOffer(rng: Rng): JobOffer {
  const t = pick(JOB_TEMPLATES, rng);
  const required = pick(t.causes, rng);
  const defects = [...required];
  // Manchmal steckt noch ein zweiter, nicht beanstandeter Mangel im Auto.
  if (rng() < 0.3) {
    const extra = pick(['belt', 'plugs', 'brakes', 'coolant_hose'] as DefectId[], rng);
    if (!defects.includes(extra)) defects.push(extra);
  }
  const car = createCar(pick(COMMON_MODELS, rng), defects, rng, { origin: 'job' });
  const fee = (t.service ? OIL_SERVICE_FEE : DIAGNOSIS_FEE) + required.reduce((s, d) => s + DEFECTS[d].labor, 0);
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
  if (job.service === 'oil_change' && !serviceState(car).oilChanged) problems.push('Ölwechsel noch nicht vollständig: frisches Öl der richtigen Sorte, neuer Filter, Stand in Ordnung.');
  if (fluidEngineBlocker(car)) problems.push('Im Motor fehlt Öl.');
  if (!isAssembled(car)) problems.push('Das Auto ist nicht komplett zusammengebaut.');
  if (car.lifted) problems.push('Das Auto steht noch auf der Hebebühne.');
  const lines = [{ label: `Arbeitslohn: ${job.category} (inkl. Diagnose)`, amount: job.fee }];
  // Zusatzarbeiten zahlt der Kunde nur, wenn er sie freigegeben hat.
  for (const d of job.approved ?? []) {
    if (!job.required.includes(d) && !active.includes(d)) lines.push({ label: `Zusatzarbeit: ${DEFECTS[d].name}`, amount: DEFECTS[d].labor });
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
