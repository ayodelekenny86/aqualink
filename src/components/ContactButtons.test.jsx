import { afterEach, expect, test } from 'vitest';
import { whatsappHref, telHref, internationalPhone, orderMessage } from './ContactButtons';
import { clearAll } from '../lib/storage';

afterEach(() => clearAll());

/** All three ways a Ghanaian number gets typed in the UI must agree. */
test('normalises 0-prefixed, spaced and +233 forms to the same digits', () => {
  expect(internationalPhone('0545009046')).toBe('233545009046');
  expect(internationalPhone('054 500 9046')).toBe('233545009046');
  expect(internationalPhone('+233545009046')).toBe('233545009046');
});

test('builds a wa.me link that carries a pre-filled message', () => {
  const href = whatsappHref('0545009046', 'Your order AQ-1051 is en route');
  expect(href).toContain('https://wa.me/233545009046?text=');
  expect(decodeURIComponent(href)).toContain('AQ-1051 is en route');
});

test('omits the query string when there is no message to pre-fill', () => {
  expect(whatsappHref('0545009046')).toBe('https://wa.me/233545009046');
});

test('builds a tel: link from the same international digits', () => {
  expect(telHref('0545009046')).toBe('tel:+233545009046');
});

test('the order message includes the details the recipient needs', () => {
  const message = orderMessage({ code: 'AQ-1051', location: 'Osu, Accra', volume: '5,000 gal', status: 'En Route' });
  expect(message).toContain('AQ-1051');
  expect(message).toContain('Osu, Accra');
  expect(message).toContain('5,000 gal');
  expect(message).toContain('En Route');
});

test('an order message with no optional details still names the order', () => {
  const message = orderMessage({});
  expect(message).toContain('Order: your order');
});
