#!/usr/bin/env node
/**
 * Check what the deployed AquaLink actually answers.
 *
 * `npm run build` passing says nothing about the deployment. A function that was
 * never deployed returns 404 from the browser and shows up as a CORS failure on a
 * preflight, which reads like a network problem rather than a missing deploy.
 * This probes each surface directly and prints what is live and what is not, so
 * "the AI does not answer" resolves to a specific line instead of a guess.
 *
 * Reads the public anon key and the site URL from the environment. The anon key is
 * public by design and grants no privileged access; nothing here can write data.
 */

import { readFileSync } from 'node:fs';

const GREEN = '\u001b[32m';
const RED = '\u001b[31m';
const YELLOW = '\u001b[33m';
const DIM = '\u001b[2m';
const OFF = '\u001b[0m';

function readEnvFile(path = '.env') {
  const values = {};
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return values;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return values;
}

const env = { ...readEnvFile(), ...process.env };
const projectRef = env.VITE_SUPABASE_PROJECT_REF || '';
const supabaseUrl = env.VITE_SUPABASE_URL || (projectRef ? `https://${projectRef}.supabase.co` : '');
const anonKey = env.VITE_SUPABASE_ANON_KEY || '';
const site = process.env.AQUALINK_SITE_URL || 'https://viviluxy-assistant.web.app';

/**
 * Every function the client can call, as (function, action) pairs. This mirrors
 * the ROUTES table in src/lib/api.js. A pair is only live if BOTH the function
 * and its action answer, because an undeployed function 404s before the action
 * is ever read.
 */
const FUNCTIONS = [
  ['pricing', 'price'],
  ['orders', 'create'],
  ['orders', 'verify'],
  ['payments', 'initialize'],
  ['payments', 'verify'],
  ['sellers', 'apply'],
  ['sellers', 'status'],
  ['ops', 'login'],
  ['config', 'get'],
  ['fcm', 'fcmToken'],
  ['notifications', 'list'],
  ['ai', 'chat'],
];

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const tag = ok ? `${GREEN}PASS${OFF}` : `${RED}FAIL${OFF}`;
  console.log(`  [${tag}] ${name}${detail ? ` ${DIM}${detail}${OFF}` : ''}`);
}

/** A 401/405 still means the function is deployed; only a 404 means it is not. */
function isDeployed(status) {
  return status !== 404 && status !== 0;
}

async function probeHeaders() {
  console.log(`\n${DIM}Hosting ${site}${OFF}`);
  try {
    const response = await fetch(site, { redirect: 'follow' });
    record('site reachable', response.ok, `HTTP ${response.status}`);

    const csp = response.headers.get('content-security-policy') || '';
    const allowsApi = /connect-src[^;]*\.supabase\.co/.test(csp);
    const allowsFonts = /style-src[^;]*fonts\.googleapis\.com/.test(csp);
    record('CSP allows the API origin', allowsApi, allowsApi ? '' : 'Supabase is blocked, so every request fails');
    record('CSP allows webfonts', allowsFonts, allowsFonts ? '' : 'Google Fonts is blocked, so text renders in a fallback face');

    const cache = response.headers.get('cache-control') || '';
    record('shell is not cached', /no-cache|no-store/.test(cache), cache || 'no Cache-Control header');
  } catch (error) {
    record('site reachable', false, String(error.message || error));
  }
}

async function probeFunctions() {
  if (!supabaseUrl) {
    console.log(`\n${RED}No Supabase project configured.${OFF} Set VITE_SUPABASE_PROJECT_REF or VITE_SUPABASE_URL in .env.`);
    results.push({ name: 'supabase configured', ok: false });
    return;
  }
  if (!anonKey) {
    console.log(`\n${RED}No anon key.${OFF} Set VITE_SUPABASE_ANON_KEY in .env.`);
    results.push({ name: 'anon key configured', ok: false });
    return;
  }

  console.log(`\n${DIM}Edge functions on ${supabaseUrl}${OFF}`);
  const seen = new Map();
  for (const [fn, action] of FUNCTIONS) {
    if (seen.has(fn)) continue;
    seen.set(fn, true);
    let status = 0;
    let detail = '';
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/${fn}/${action}`, {
        method: 'GET',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      status = response.status;
      detail = `HTTP ${status}${response.status === 404 ? ' (not deployed)' : ''}`;
    } catch (error) {
      detail = String(error.message || error);
    }
    record(`functions/v1/${fn}`, isDeployed(status), detail);
  }

  // A separate check for the AI key, because a deployed function with no key is
  // still broken: it answers 503 and the client quietly uses local rules instead.
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ai/chat`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'ping', role: 'buyer', orders: [] }),
      signal: AbortSignal.timeout(20000),
    });
    const body = (await response.text()).slice(0, 160);
    if (response.status === 503) {
      record('ai/chat has a usable key', false, 'GEMINI_API_KEY is not set on the server');
    } else if (!response.ok) {
      record('ai/chat has a usable key', false, `HTTP ${response.status} ${DIM}${body}${OFF}`);
    } else {
      record('ai/chat has a usable key', true, 'Gemini answered');
    }
  } catch (error) {
    record('ai/chat has a usable key', false, String(error.message || error));
  }
}

await probeHeaders();
await probeFunctions();

const failed = results.filter((r) => !r.ok);
console.log('');
if (failed.length === 0) {
  console.log(`${GREEN}Everything checked is live.${OFF}`);
  process.exit(0);
}
console.log(`${YELLOW}${failed.length} of ${results.length} checks failed:${OFF}`);
for (const item of failed) console.log(`  - ${item.name}${item.detail ? `: ${item.detail}` : ''}`);
console.log(`\n${DIM}See DEPLOY.md for the command that fixes each one.${OFF}`);
process.exit(1);
