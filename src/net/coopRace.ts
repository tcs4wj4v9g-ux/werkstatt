/**
 * Koop-Rennen gegeneinander. Läuft vollständig über die Lage (Presence) der Mitglieder – keine Änderung am Spielstand
 * und am Server-Schema nötig:
 *  - `lobby`: Wer ein Rennen ausschreibt, trägt Strecke und (nach „Start“) die Startzeit in seine Lage ein.
 *  - `join`: Wer mitfährt, trägt die Kennung des Rennens und sein Auto (Modell, Farbe) ein.
 *  - `rr`: Während des Rennens die eigene Fahrzeuglage (Position, Kurs, Tempo, Fortschritt, Zielzeit).
 * Jedes Gerät rechnet nur das eigene Auto; die anderen werden aus ihrer Lage gezeichnet (kurz vorausgerechnet) und
 * sind für das eigene Auto feste Hindernisse. Preisgeld gibt es nicht (gemeinsames Konto) – es geht um die Ehre.
 */
import { create } from 'zustand';
import { courseOf, type CourseId } from '../game/races';
import { worldFor } from '../three/circuits';

export interface Lobby {
  id: string;
  course: CourseId;
  /** Startzeit (ms, Uhr des Ausschreibenden) – null, solange noch Teilnehmer dazukommen. */
  startAt: number | null;
}
export interface Join {
  id: string;
  modelId: string;
  color: string;
  car: string;
}
export interface RaceCar {
  id: string;
  x: number;
  z: number;
  h: number;
  vx: number;
  vy: number;
  yr: number;
  /** Fortschritt in Streckenpunkten (2 m) und Zielzeit (s) oder null. */
  p: number;
  fin: number | null;
}

/** Eigene Einträge (gehen mit der Lage hinaus). */
export const useCoopRace = create<{ lobby: Lobby | null; join: Join | null; bay: number }>(() => ({ lobby: null, join: null, bay: -1 }));
/** Eigene Fahrzeuglage während eines Koop-Rennens (schreibt die Rennszene, liest `presence()`). */
export const coopRaceOut: { car: RaceCar | null } = { car: null };

/** Kleiner Ausschnitt einer Mitgliederlage, den diese Datei braucht. */
export interface RaceMember {
  id: string;
  name: string;
  online: boolean;
  presence: { lobby?: Lobby | null; join?: Join | null; rr?: RaceCar | null };
}

/** Offene oder laufende Koop-Rennen (eins je Ausschreibendem, nur von Mitgliedern, die online sind). */
export function lobbiesOf(members: RaceMember[], me: string | null) {
  const out: { host: RaceMember; lobby: Lobby }[] = [];
  for (const m of members) {
    const l = m.id === me ? useCoopRace.getState().lobby : m.presence.lobby;
    if (l && (m.online || m.id === me)) out.push({ host: m, lobby: l });
  }
  return out;
}

/** Teilnehmer eines Rennens in fester Reihenfolge (Ausschreibender zuerst, dann nach Kennung) – bestimmt die Startplätze. */
export function participantsOf(members: RaceMember[], me: string | null, lobbyId: string) {
  return members
    .filter((m) => {
      const j = m.id === me ? useCoopRace.getState().join : m.presence.join;
      return j?.id === lobbyId && (m.online || m.id === me);
    })
    .map((m) => ({ member: m, join: (m.id === me ? useCoopRace.getState().join : m.presence.join)! }))
    .sort((a, b) => {
      const ha = lobbiesOf([a.member], me).some((l) => l.lobby.id === lobbyId) ? 0 : 1;
      const hb = lobbiesOf([b.member], me).some((l) => l.lobby.id === lobbyId) ? 0 : 1;
      return ha - hb || a.member.id.localeCompare(b.member.id);
    });
}

const newId = () => Math.random().toString(36).slice(2, 10);

/** Strecke schon vorab berechnen (beim Ausschreiben/Mitfahren), damit der Wechsel zum Start schnell geht. */
function prepare(course: CourseId) {
  setTimeout(() => worldFor(courseOf(course).world), 50);
}
/** Rennen ausschreiben und selbst mit Auto `bay` teilnehmen. */
export function hostRace(course: CourseId, bay: number, car: { modelId: string; color: string; name: string }) {
  const id = newId();
  useCoopRace.setState({ lobby: { id, course, startAt: null }, join: { id, modelId: car.modelId, color: car.color, car: car.name }, bay });
  prepare(course);
}
/** Bei einem ausgeschriebenen Rennen mitfahren. */
export function joinRace(id: string, bay: number, car: { modelId: string; color: string; name: string }, course?: CourseId) {
  useCoopRace.setState({ join: { id, modelId: car.modelId, color: car.color, car: car.name }, bay });
  if (course) prepare(course);
}
/** Start (nur der Ausschreibende): in 10 s – genug Zeit, dass alle Geräte die Startzeit bekommen und die Strecke aufbauen. */
export const START_LEAD_MS = 10000;
export function startCoopRace() {
  const l = useCoopRace.getState().lobby;
  if (l && l.startAt === null) useCoopRace.setState({ lobby: { ...l, startAt: Date.now() + START_LEAD_MS } });
}
/** Aussteigen bzw. Ausschreibung zurückziehen. */
export function leaveCoopRace() {
  useCoopRace.setState({ lobby: null, join: null, bay: -1 });
  coopRaceOut.car = null;
}
