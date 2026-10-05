import { readFileSync } from 'node:fs';

const env = {};
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const url = `https://${env.VITE_SUPABASE_PROJECT_REF}.supabase.co/rest/v1/notickets`;
const headers = { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` };

async function probe(label, path, init = {}) {
  try {
    const r = await fetch(url + path, { headers, ...init });
    const body = (await r.text()).slice(0, 200).replace(/\s+/g, ' ');
    console.log(`${label.padEnd(46)} ${r.status} ${body}`);
  } catch (e) {
    console.log(`${label.padEnd(46)} ERR ${e.message}`);
  }
}

console.log('--- can an unauthenticated client read every notification?');
await probe('select all rows', '?select=id,role,title,user_id&limit=5');

console.log('\n--- can it write a row addressed to nobody?');
await probe('insert with user_id null', '', {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({ role: 'buyer', title: 'probe-notification-do-not-use', body: 'x', kind: 'info', read: false }),
});

console.log('\n--- realtime: is the table in the supabase_realtime publication?');
// Realtime is served over websocket, not PostgREST, so a subscription is the only
// way to ask. An unsubscribed-but-accepted channel never yields an event.
try {
  const ws = new WebSocket(`wss://${env.VITE_SUPABASE_PROJECT_REF}.supabase.co/realtime/v1/websocket?apikey=${env.VITE_SUPABASE_ANON_KEY}&vsn=1.0.0`);
  const events = [];
  const done = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(events), 9000);
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      events.push(msg);
      if (msg.type === 'error' || (msg.type === 'phx_reply' && msg.event === 'phx_reply')) {
        clearTimeout(timer);
        resolve(events);
      }
    });
    ws.addEventListener('error', () => { clearTimeout(timer); resolve(events); });
  });

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({
      topic: 'realtime:public:notifications',
      event: 'phx_join',
      payload: {
        config: { broadcast: { ack: false }, presence: { key: '' }, postgres_changes: [{ event: '*', schema: 'public', table: 'notifications' }] },
        access_token: env.VITE_SUPABASE_ANON_KEY,
      },
      ref: '1',
    }));
  });

  const result = await done;
  for (const e of result) console.log(' ', JSON.stringify(e).slice(0, 260));
  if (!result.length) console.log('  no reply within 9s');
} catch (e) {
  console.log('  websocket error:', e.message);
}