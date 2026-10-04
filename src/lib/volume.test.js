import { describe, expect, test } from 'vitest';
import { gallonsForOrder, gallonsFromLabel, litresForOrder, litresFromLabel } from './volume';

/**
 * The regression this file exists for.
 *
 * `Number.parseInt('2,000 gallons', 10)` returns 2. Every booking option is
 * written with a thousands separator, so a 2,000 gallon order was recorded as
 * 2 gallons: 8 litres sent to the server, and a capacity check that treated a
 * full tanker as carrying two gallons.
 */
describe('gallonsFromLabel', () => {
  test('reads the thousands separator instead of stopping at it', () => {
    expect(gallonsFromLabel('2,000 gallons')).toBe(2000);
    expect(gallonsFromLabel('1,000 gallons')).toBe(1000);
    expect(gallonsFromLabel('5,000 gal')).toBe(5000);
    // The value parseInt actually produced for every one of the above.
    expect(Number.parseInt('2,000 gallons', 10)).not.toBe(2000);
  });

  test('reads plain and decimal labels', () => {
    expect(gallonsFromLabel('500 gallons')).toBe(500);
    expect(gallonsFromLabel('1,250.5 gallons')).toBe(1250.5);
    expect(gallonsFromLabel(750)).toBe(750);
  });

  test('returns zero rather than a wrong number for unusable input', () => {
    expect(gallonsFromLabel('')).toBe(0);
    expect(gallonsFromLabel(null)).toBe(0);
    expect(gallonsFromLabel('Choose a tank')).toBe(0);
    expect(gallonsFromLabel('-100')).toBe(0);
    expect(gallonsFromLabel(-5)).toBe(0);
    expect(gallonsFromLabel(Number.NaN)).toBe(0);
  });
});

describe('litresFromLabel', () => {
  test('converts a 2,000 gallon booking to about 7,570 litres', () => {
    expect(litresFromLabel('2,000 gallons')).toBe(7571);
    expect(litresFromLabel('2,000 gallons')).not.toBe(8);
  });

  test('is zero for unusable input', () => {
    expect(litresFromLabel('')).toBe(0);
    expect(litresFromLabel('nope')).toBe(0);
  });
});

describe('order volume', () => {
  test('prefers the server volume over the display string', () => {
    // Both fields are present on a real order. The display string used to win,
    // so "2,000 gal" was parsed as 2 litres and scored at about half a gallon.
    const order = { volume: '2,000 gal', volumeLitres: 7571 };
    expect(litresForOrder(order)).toBe(7571);
    expect(gallonsForOrder(order)).toBeCloseTo(2000, 0);
    expect(gallonsForOrder(order)).not.toBe(0.5);
  });

  test('falls back to the display string when the server sent no litres', () => {
    expect(litresForOrder({ volume: '1,000 gallons' })).toBe(3785);
    expect(gallonsForOrder({ volume: '1,000 gallons' })).toBe(1000);
  });

  test('is zero for an order with no volume recorded', () => {
    expect(litresForOrder({})).toBe(0);
    expect(litresForOrder(null)).toBe(0);
    expect(gallonsForOrder({})).toBe(0);
  });
});