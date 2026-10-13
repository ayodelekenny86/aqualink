import { afterEach, expect, test } from 'vitest';
import { list, insert, update, remove, replaceAll, createBookingCode, seedProducts, createId } from './collections';
import { clearAll } from './storage';

afterEach(() => clearAll());

test('insert assigns an id and timestamp when the caller omits them', () => {
  const row = insert('notifications', { title: 'Order accepted' });
  expect(row.id).toMatch(/^notifications_/);
  expect(row.createdAt).toBeTruthy();
});

test('an explicit id is preserved so callers can keep references stable', () => {
  const row = insert('orders', { id: 'NAUT-1', location: 'Osu' });
  expect(row.id).toBe('NAUT-1');
});

test('update writes the change and reports a miss as null', () => {
  insert('orders', { id: 'NAUT-1', status: 'Placed' });
  expect(update('orders', 'NAUT-1', { status: 'En Route' }).status).toBe('En Route');
  expect(update('orders', 'nope', { status: 'Delivered' })).toBeNull();
  expect(list('orders')[0].status).toBe('En Route');
});

test('update cannot change a row id, which would break references', () => {
  insert('orders', { id: 'NAUT-1', status: 'Placed' });
  const updated = update('orders', 'NAUT-1', { id: 'NAUT-2', status: 'En Route' });
  expect(updated.id).toBe('NAUT-1');
});

test('remove deletes only the matching row', () => {
  replaceAll('orders', [{ id: 'a' }, { id: 'b' }]);
  remove('orders', 'a');
  expect(list('orders').map((row) => row.id)).toEqual(['b']);
});

test('an unknown collection name is rejected rather than silently ignored', () => {
  expect(() => list('secrets')).toThrow(/unknown collection/i);
});

test('createBookingCode skips numbers already in use', () => {
  const used = [{ code: 'NAUT-1000' }, { code: 'NAUT-1001' }];
  expect(createBookingCode(used)).toBe('NAUT-1002');
});

test('createBookingCode starts at 1000 on an empty table', () => {
  expect(createBookingCode([])).toBe('NAUT-1000');
});

test('createId is unique across calls', () => {
  const ids = new Set(Array.from({ length: 200 }, () => createId('row')));
  expect(ids.size).toBe(200);
});

test('seeding products is idempotent and never overwrites later edits', () => {
  const first = seedProducts();
  expect(first.length).toBeGreaterThan(0);
  const edited = update('products', first[0].id, { price: 999 });
  expect(edited.price).toBe(999);

  const second = seedProducts();
  expect(second).toHaveLength(first.length);
  expect(second[0].price).toBe(999);
});

