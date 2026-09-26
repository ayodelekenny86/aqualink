import { expect, test } from 'vitest';
import fs from 'node:fs';
import { hashPassword, generateSalt } from './lib/secureCode';
test('benchmark', async () => {
  const salt = generateSalt();
  const t0 = Date.now();
  await hashPassword('demo-password', salt, 210000);
  const slow = Date.now() - t0;
  const t1 = Date.now();
  await hashPassword('demo-password', salt, 50000);
  const mid = Date.now() - t1;
  const t2 = Date.now();
  await hashPassword('demo-password', salt, 1000);
  const fast = Date.now() - t2;
  fs.writeFileSync('bench.json', JSON.stringify({ iterations210k: slow, iterations50k: mid, iterations1k: fast }));
  expect(true).toBe(true);
}, 60000);
