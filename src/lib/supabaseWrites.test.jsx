import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { list, replaceAll } from './collections';
import { clearAll } from './storage';
import { supabase, writeResult } from './supabase';
import useBooking from '../hooks/useBooking';

/**
 * A Supabase write that the database refused, and what the app did about it.
 *
 * `supabase-js` resolves with `{ data, error }` and does not reject when
 * PostgREST refuses a statement. Every write in `useBooking` that sat behind a
 * `try/catch` therefore caught only network failures and reported a rejected write
 * as a success: the local copy was left uncorrected and the user was told the change
 * had been made.
 *
 * The worst of these is `confirmDelivery`. The buyer has already handed over the
 * water and the code, and the app answers "Delivery confirmed" while the order stays
 * on "En Route" on the server. Nothing downstream contradicts it — the notice is the
 * record.
 *
 * `writeResult` in `src/lib/supabase.js` is the single place that distinguishes the
 * two cases, and these tests pin that it is actually consulted at each call site
 * rather than merely existing.
 */

const ORDER = {
  id: 'AQ-1A2B3C',
  code: 'AQ-1A2B3C',
  location: 'East Legon, Accra',
  status: 'En Route',
  volume: '2,000 gal',
  volumeLitres: 7571,
  chargedMinor: 30000,
  paid: true,
  confirmCode: 'HX42',
};

let notices;

beforeEach(() => {
  clearAll();
  notices = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  clearAll();
});

/**
 * A Supabase query builder that resolves the way a refused write does.
 *
 * Chainable the way the real client is — `from().update().eq()` — and thenable, so
 * the awaited value is `{ data, error }`. Getting the chain wrong would make every
 * test below pass for the wrong reason: a builder missing `.update` throws a
 * TypeError, which the code under test reads as "the server was unreachable" and
 * reports as a failure, so an assertion about a refused write would pass without
 * ever reaching the refused-write path.
 */
function stubSupabase(result) {
  const builder = {
    update: () => builder,
    insert: () => builder,
    delete: () => builder,
    select: () => builder,
    eq: () => builder,
    single: () => builder,
    then: (resolve, reject) => { Promise.resolve(result).then(resolve, reject); },
  };
  return vi.spyOn(supabase, 'from').mockReturnValue(builder);
}

const REJECTED = { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } };
const ACCEPTED = { data: [{ id: 'AQ-1A2B3C' }], error: null };

function mountBooking() {
  return renderHook(() => useBooking({
    email: 'buyer@example.com',
    buyerPhone: '+233201234567',
    onNotice: (message) => notices.push(message),
    notify: () => {},
  }));
}

describe('writeResult tells a refused write from a request that never landed', () => {
  test('a resolved result with no error is a success', () => {
    // `try/catch` cannot see this case at all, which is why it needs a helper.
    expect(writeResult(ACCEPTED)).toEqual({ ok: true });
  });

  test('a resolved result carrying an error is a failure', () => {
    expect(writeResult(REJECTED)).toEqual({
      ok: false,
      error: { message: 'new row violates row-level security policy', code: '42501' },
    });
  });

  test('an empty error still fails, with a message that says what happened', () => {
    // A falsy but present error must not read as success.
    expect(writeResult({ data: null, error: {} })).toEqual({
      ok: false,
      error: { message: 'The database rejected that write.', code: undefined },
    });
  });
});

describe('a refused write is never reported as done', () => {
  test('confirming a delivery tells the user the server refused it', async () => {
    replaceAll('orders', [ORDER]);
    stubSupabase(REJECTED);

    const { result } = mountBooking();
    let outcome;
    await act(async () => {
      outcome = await result.current.confirmDelivery('AQ-1A2B3C', 'HX42');
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'write-rejected' });
    // The false confirmation is the whole failure. It must not be in the list.
    expect(notices.join(' ')).not.toMatch(/Delivery confirmed for AQ-1A2B3C/);
    expect(notices.join(' ')).toMatch(/server rejected/i);
    // And the local copy still reflects the delivery, so the seller board is not
    // left showing a buyer who has already received the water as still waiting.
    expect(list('orders').find((o) => o.id === 'AQ-1A2B3C').status).toBe('Delivered');
  });

  test('an accepted delivery is reported plainly', async () => {
    replaceAll('orders', [ORDER]);
    stubSupabase(ACCEPTED);

    const { result } = mountBooking();
    let outcome;
    await act(async () => {
      outcome = await result.current.confirmDelivery('AQ-1A2B3C', 'HX42');
    });

    expect(outcome).toMatchObject({ ok: true });
    expect(notices.join(' ')).toMatch(/Delivery confirmed for AQ-1A2B3C/);
  });

  test('a status change the server refuses is not announced as done', async () => {
    replaceAll('orders', [ORDER]);
    stubSupabase(REJECTED);

    const { result } = mountBooking();
    let outcome;
    await act(async () => {
      outcome = await result.current.updateOrderStatus('AQ-1A2B3C', 'Delivered', () => {});
    });

    await waitFor(() => expect(outcome).toMatchObject({ ok: false, reason: 'write-rejected' }));
    expect(notices.join(' ')).not.toMatch(/is now delivered/i);
    expect(notices.join(' ')).toMatch(/could not be saved/i);
  });

  test('claiming a job reports the refusal instead of the claim', async () => {
    // Must be claimable, or the guard returns before the write is ever attempted
    // and the test would pass without reaching the refused-write path.
    replaceAll('orders', [{ ...ORDER, status: 'Awaiting payment' }]);
    stubSupabase(REJECTED);

    const { result } = mountBooking();
    let outcome;
    await act(async () => {
      outcome = await result.current.acceptDriverJob('AQ-1A2B3C', () => {});
    });

    // A driver told their claim succeeded drives to an address where nothing is
    // waiting, so this one returns the failure instead of assuming it worked.
    await waitFor(() => expect(outcome).toMatchObject({ ok: false, reason: 'write-rejected' }));
  });

  test('a delivery code the server refuses is not handed to the buyer as usable', async () => {
    replaceAll('orders', [ORDER]);
    stubSupabase(REJECTED);

    const { result } = mountBooking();
    let outcome;
    await act(async () => {
      outcome = await result.current.issueDeliveryCode('AQ-1A2B3C');
    });

    expect(outcome).toMatchObject({ ok: false });
    expect(outcome.code).toMatch(/^DEL-/);
    expect(notices.join(' ')).not.toMatch(/Share it with the buyer at handover/);
    expect(notices.join(' ')).toMatch(/this device only/i);
  });

  test('releasing a job reports a refusal rather than a completed release', async () => {
    replaceAll('orders', [{ ...ORDER, status: 'Assigned', driverId: 'DRV-1', driverName: 'Kofi' }]);
    stubSupabase(REJECTED);

    const { result } = mountBooking();
    let outcome;
    await act(async () => {
      outcome = await result.current.releaseDriverJob('AQ-1A2B3C', () => {});
    });

    await waitFor(() => expect(outcome).toMatchObject({ ok: false, reason: 'write-rejected' }));
  });
});

describe('a request that never reached the server is reported the same way', () => {
  test('a thrown fetch does not read as success', async () => {
    replaceAll('orders', [ORDER]);
    vi.spyOn(supabase, 'from').mockReturnValue({
      eq() { return this; },
      then: (resolve, reject) => Promise.reject(new TypeError('Failed to fetch')).then(resolve, reject),
    });

    const { result } = mountBooking();
    let outcome;
    await act(async () => {
      outcome = await result.current.confirmDelivery('AQ-1A2B3C', 'HX42');
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'write-failed' });
    expect(notices.join(' ')).toMatch(/unreachable/i);
    expect(notices.join(' ')).not.toMatch(/Delivery confirmed for AQ-1A2B3C/);
  });
});
