// Zugang zum Supabase-Projekt der Koop-Werkstätten. Beide Werte sind öffentlich (der "anon"-Schlüssel ist
// für den Einsatz im Browser gedacht); geschützt werden die Daten durch die Regeln in supabase/schema.sql.
// Ist hier nichts eingetragen, bleibt der Koop-Modus im Menü ausgegraut.
const PROJECT_URL = 'https://uzmgjkcizzdpycfdgrvr.supabase.co';
const ANON_KEY = 'sb_publishable_uRF5mwEQj60cztKofPwHnw_ONYgxYAR';

// Für automatisierte Tests: ?koop=<Adresse>|<Schlüssel> zeigt auf den lokalen Nachbau (e2e/coop-server.cjs).
const override = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('koop') : null;
const [testUrl, testKey] = override ? override.split('|') : [];

export const SUPABASE_URL = testUrl || PROJECT_URL;
export const SUPABASE_KEY = testKey || ANON_KEY;
/** Der Test-Nachbau hat kein Realtime; der Abgleich läuft dann nur über die regelmäßige Abfrage. */
export const REALTIME = !override;
export const COOP_CONFIGURED = !!SUPABASE_URL && !!SUPABASE_KEY;
