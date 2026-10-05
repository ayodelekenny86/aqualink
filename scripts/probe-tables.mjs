import { readFileSync } from 'node:fs';

/**
 * Which tables the migrations create actually exist on the server.
 *
 * `supabase db push` has never been run against this project: a table the app
 * writes to on every status change does not exist, so the write fails, and the app
 * has been quietly not delivering notifications. Everything the client subscribes
 * to via Realtime is likewise not published, so nothing arrives on a second device
 * either. Neither failure is visible from the app, which is why the app looks
 * healthy.
 */

const env = {};
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const root = `https://${env.VITE_SUPABASE_PROJECT_REF}.supabase.co/rest/v1`;
const headers = { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` };

// Every table the migrations and the client touch.
const TABLES = ['orders', 'accounts', 'fcm_tokens', 'config', 'notifications', 'sellers', 'ops', 'receipts'];

for (const table of TABLES) {
  let status = 0;
  let body = '';
  try {
    const r = await fetch(`${root}/${table}?select=*&limit=1`, { headers, signal: AbortSignal.timeout(15000) });
    status = r.status;
    const text = await r.text();
    body = text.slice(0, 90).replace(/\s+/g, ' ');
  } catch (e) {
    body = String(e.message);
  }
  const missing = status === 404;
  console.log(`${table.padEnd(22)} ${String(status).padEnd(4)} ${missing ? 'MISSING — migration never applied' : body}`);
}