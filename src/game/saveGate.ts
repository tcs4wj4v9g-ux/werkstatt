// Schutz des Einzelspieler-Spielstands: Solange eine Koop-Werkstatt geöffnet ist, schreibt das Spiel
// nichts in den lokalen Speicher. Der Einzelspielstand bleibt dadurch genau so, wie er vor dem Koop war.
/** `remote` = gerade wird ein Stand vom Koop-Server eingespielt (keine lokale Aktion). */
export const saveGate = { blocked: false, remote: false };

const ls = () => (typeof localStorage === 'undefined' ? null : localStorage);

export const gatedStorage = {
  getItem: (name: string) => ls()?.getItem(name) ?? null,
  setItem: (name: string, value: string) => {
    if (!saveGate.blocked) ls()?.setItem(name, value);
  },
  removeItem: (name: string) => {
    if (!saveGate.blocked) ls()?.removeItem(name);
  },
};
