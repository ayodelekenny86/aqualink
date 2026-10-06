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
 * It also checks the two things a build script cannot: **which build is live** and
 * **what that build contains**. Both have already gone wrong here. A production
 * URL served a bundle from 82 commits earlier â€” one with the invented GMV tiles,
 * an escrow balance this app does not have, and an admin console that granted
 * operator access for any non-empty password â€” and the deployed origin had no CSP
 * at all, so none of it was visible from the repo. A check that only asks "does
 * the site answer 200" passes on exactly that deployment.
 *
 * Reads the public anon key and the site URLs from the environment. The anon key
 * is public by design and grants no privileged access; nothing here can write data.
 */

import { execFileSync } from 'node:child_process';
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

/**
 * Every origin this project is served from. A deployment that is not listed here
 * is a deployment nobody checks, which is how a live URL went unexamined for a
 * month; `AQUALINK_SITE_URLS` (comma-separated) adds more.
 */
const sites = (
  process.env.AQUALINK_SITE_URLS
    || 'https://viviluxy-assistant.web.app'
).split(',').map((value) => value.trim()).filter(Boolean);

/**
 * Every client route, read out of the ROUTES table in src/lib/api.js.
 *
 * This used to be a hand-written list that "mirrors" that table, and it had
 * drifted: six of the twenty routes were absent, including `config/update` and
 * `sellers/review`. A function answering 405 proves the function is deployed, not
 * that every action in it exists, so checking one action per function could not
 * have caught a missing one. Reading the table removes the duplication that let it
 * drift, which is the same failure mode as the three copies of the pricing
 * arithmetic â€” one of which had already lost its range checks.
 */
const routes = readRoutes();

function readRoutes() {
  const source = readFileSync('src/lib/api.js', 'utf8');
  return [...source.matchAll(/'(\/[^']+)':\s*\{\s*fn:\s*'([^']+)',\s*action:\s*'([^']+)'\s*\}/g)]
    .map(([, clientPath, fn, action]) => ({ clientPath, fn, action }))
    .filter((route) => route.fn !== 'ai' && route.fn !== 'notifications');
}

/**
 * Strings that only ever appear in a build predating the honesty work.
 *
 * `src/honesty.test.jsx` keeps them out of the source. This checks they are also
 * out of what is *served*, which is a different file on a different machine. Each
 * one is quoted here because the checker has to be able to name what it found.
 */
const DEMO_TELLS = [
  { label: 'admin access granted by any password', pattern: /this demo workspace/ },
  { label: 'a simulated OTP notice', pattern: /simulated in this frontend/ },
  { label: 'an invented GHâ‚µ18,540 GMV figure', pattern: /18,540/ },
  { label: 'an escrow balance this app does not have', pattern: /4,820/ },
  { label: 'a fixed signed-in persona', pattern: /Alex K\./ },
];

const results = [];

/**
 * Record a check. `origin` prefixes the name when more than one site is probed,
 * so the summary can say *which* deployment failed instead of listing the same
 * check twice with no way to tell them apart.
 */
function record(name, ok, detail, origin) {
  results.push({ name: origin ? `${origin} ${name}` : name, ok, detail });
  const tag = ok ? `${GREEN}PASS${OFF}` : `${RED}FAIL${OFF}`;
  console.log(`  [${tag}] ${name}${detail ? ` ${DIM}${detail}${OFF}` : ''}`);
}

function git(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

async function probeSite(site) {
  console.log(`\n${DIM}Hosting ${site}${OFF}`);
  // Failures are labelled with the host, so a summary listing two sites does not
  // show the same check name twice with nothing to tell them apart.
  const origin = new URL(site).host;
  let html = '';

  try {
    const response = await fetch(site, { redirect: 'follow' });
    record('site reachable', response.ok, `HTTP ${response.status}`, origin);

    const csp = response.headers.get('content-security-policy') || '';
    record('a CSP is set', Boolean(csp.trim()), csp.trim() ? '' : 'No Content-Security-Policy header, so nothing restricts what the page may load or connect to', origin);
    if (csp) {
      const allowsApi = /connect-src[^;]*\.supabase\.co/.test(csp);
      const allowsFonts = /style-src[^;]*fonts\.googleapis\.com/.test(csp);
      record('CSP allows the API origin', allowsApi, allowsApi ? '' : 'Supabase is blocked, so every request fails', origin);
      record('CSP allows webfonts', allowsFonts, allowsFonts ? '' : 'Google Fonts is blocked, so text renders in a fallback face', origin);
    }

    const cache = response.headers.get('cache-control') || '';
    // `max-age=0` and `must-revalidate` are equivalent to no-store for a shell: the
    // browser revalidates every load. Only a positive max-age serves one stale
    // shell after a deploy, which is how a fixed bug stays broken for returning
    // visitors while looking correct to whoever tested it.
    const shellFresh = /no-cache|no-store|max-age\s*=\s*0/.test(cache);
    record('shell is not cached', shellFresh, cache || 'no Cache-Control header', origin);

    html = await response.text();
  } catch (error) {
    record('site reachable', false, String(error.message || error), origin);
    return;
  }

  await probeBuild(site, html, origin);
}

/** Which commit is live, and does it match this checkout? */
async function probeBuild(site, html, origin) {
  const deployed = html.match(/<meta name="aqualink-build" content="([^"]*)"/)?.[1] ?? '';
  const builtAt = html.match(/<meta name="aqualink-built" content="([^"]*)"/)?.[1] ?? '';
  const head = git('rev-parse', 'HEAD');

  if (!deployed) {
    // Pre-stamp builds cannot be dated. The bundle check below still applies.
    record('the live build reports its commit', false, 'No aqualink-build meta tag, so this build cannot be dated. Rebuild and redeploy.', origin);
  } else if (!head) {
    record('the live build matches this checkout', true, `${deployed}${builtAt ? ` built ${builtAt}` : ''} ${DIM}(no local git, so not compared)${OFF}`, origin);
  } else {
    // A commit that is no longer in this repository cannot be counted against, so
    // the count is omitted rather than reported as zero. "82 commits behind" and
    // "built from a commit I do not have" are different facts and the second is
    // the likelier one after a rebase or a shallow clone.
    const known = Boolean(git('cat-file', '-e', `${deployed}^{commit}`));
    const behind = known ? git('rev-list', '--count', `${deployed}..${head}`) : '';
    const same = deployed === head || deployed === `${head}-dirty`;
    record(
      'the live build matches this checkout',
      same,
      same
        ? `${deployed}${builtAt ? ` built ${builtAt}` : ''}`
        : `live ${deployed.slice(0, 7)}, here ${head.slice(0, 7)}${known ? (behind ? `, ${behind} commit(s) behind` : ', not an ancestor of HEAD') : ', a commit this repository does not have'}. Rebuild and redeploy.`,
    origin,
    );
  }

  const bundle = html.match(/<script[^>]+src="([^"]*index-[^"]*\.js)"/)?.[1];
  if (!bundle) {
    record('the served bundle could be read', false, 'No hashed entry bundle found in index.html', origin);
    return;
  }

  let source;
  try {
    const response = await fetch(new URL(bundle, site), { redirect: 'follow' });
    if (!response.ok) {
      record('the served bundle could be read', false, `HTTP ${response.status} for ${bundle}`, origin);
      return;
    }
    source = await response.text();
  } catch (error) {
    record('the served bundle could be read', false, String(error.message || error), origin);
    return;
  }

  record('the served bundle could be read', true, `${Math.round(source.length / 1024)} kB`, origin);

  const found = DEMO_TELLS.filter((tell) => tell.pattern.test(source)).map((tell) => tell.label);
  record(
    'the served bundle contains no fabricated claims',
    found.length === 0,
    found.length ? `Found ${found.join('; ')}. This is a build from before the honesty work.` : '',
    origin,
  );

  // A bundle with no backend in it cannot take a payment or price an order, so it
  // will happily display the offline path and look like a working checkout.
  const hasApi = projectRef ? source.includes(projectRef) : /supabase\.co|\/api\//.test(source);
  record('the served bundle is built against the server', hasApi, hasApi ? '' : `No reference to ${projectRef || 'any API origin'}, so this build makes no server calls at all`, origin);
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
  if (routes.length === 0) {
    console.log(`\n${RED}No client routes found in src/lib/api.js.${OFF} Nothing can be checked.`);
    results.push({ name: 'client routes readable', ok: false });
    return;
  }

  // One probe per client route rather than per function. A deployed function can
  // still be missing a single action, and that is invisible to a per-function
  // check: `orders/create` answering 405 says nothing about `orders/verify`. When
  // several routes share a function the repeated probes are collapsed into one
  // line listing them, so the output stays readable.
  const byFunction = new Map();
  for (const route of routes) {
    const existing = byFunction.get(route.fn);
    if (existing) existing.push(route);
    else byFunction.set(route.fn, [route]);
  }

  for (const [fn, group] of byFunction) {
    const missing = [];
    let firstDetail = '';
    for (const route of group) {
      let status = 0;
      let detail = '';
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/${fn}/${route.action}`, {
          method: 'GET',
          headers: { apikey: anonKey, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15000),
        });
        status = response.status;
        // A 404 is the only answer that means "not there". 405 and 400 both mean
        // the function is up and read the request; they are answering with a
        // complaint about the method or the payload, not refusing to exist.
        if (status === 404) detail = `${route.action}: 404`;
        else if (!firstDetail) firstDetail = `${group.length > 1 ? `${group.length} actions, ` : ''}HTTP ${status}`;
      } catch (error) {
        detail = `${route.action}: ${String(error.message || error)}`;
        status = 0;
      }
      if (status === 404 || status === 0) missing.push(detail);
    }

    record(
      `functions/v1/${fn}`,
      missing.length === 0,
      missing.length
        ? `not deployed for ${missing.join(', ')}`
        : firstDetail,
    );
  }

  for (const site of sites) await probeSite(site);
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
