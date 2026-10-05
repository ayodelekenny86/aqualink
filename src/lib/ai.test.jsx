import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AI_FALLBACK_REASONS, aiFallbackMessage, askAiQuestion, classifyAiFailure, getLastAiError } from './ai';
import { clearAll } from './storage';
import { AiPanel } from '../App';

/**
 * The Aqua panel's fallback, and what it tells the user about it.
 *
 * `ai/chat` is not deployed on this server, so every answer the assistant gives
 * in production comes from the local keyword matcher. That is not a failure — the
 * matcher reads real orders and says so when it cannot answer — but it is a very
 * different thing from an AI answering, and the user has to be able to tell which
 * one they are reading.
 *
 * Previously the failure reason was thrown away (`catch {}`), the badge said
 * "Local", and the panel's own disclaimer asserted the fallback happened "when
 * offline". On this deployment the device is online and the server simply has no
 * AI on it, so that sentence was false and the badge did not contradict it. These
 * pin the classification that replaces it.
 */

const ORDER = {
  code: 'AQ-1A2B3C',
  id: 'AQ-1A2B3C',
  status: 'Paid',
  chargedMinor: 30000,
  sellerReceives: 13500,
  driverReceives: 4500,
  platformCommission: 12000,
};

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

let fetchMock;

beforeEach(() => {
  clearAll();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearAll();
});

describe('telling an undeployed server apart from a device that is offline', () => {
  test('a 404 means the function was never deployed', () => {
    // This is the state this project is in: the client asks for a path the server
    // does not have, and every answer silently becomes a local one.
    fetchMock.mockResolvedValue(jsonResponse({ code: 'NOT_FOUND', message: 'Requested function was not found' }, 404));

    return expect(askAiQuestion({ question: 'what did my last order cost?', role: 'buyer', orders: [ORDER] }))
      .rejects.toThrow()
      .then(() => {
        expect(classifyAiFailure(getLastAiError())).toBe('notDeployed');
        expect(aiFallbackMessage('notDeployed')).toMatch(/not deployed/i);
      });
  });

  test('a 503 means the function is there with no key', () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'ai_error', message: 'GEMINI_API_KEY is not configured' }, 503));

    return expect(askAiQuestion({ question: 'explain my order', role: 'buyer', orders: [ORDER] }))
      .rejects.toThrow()
      .then(() => {
        expect(classifyAiFailure(getLastAiError())).toBe('unconfigured');
        expect(aiFallbackMessage('unconfigured')).toMatch(/no ai key/i);
      });
  });

  test('a request that never leaves the device is the offline case', () => {
    // `fetch` rejects with a TypeError when there is no network at all, which is
    // the only situation the old "when offline" wording actually described.
    fetchMock.mockRejectedValue(Object.assign(new TypeError('Failed to fetch'), { name: 'TypeError' }));

    return expect(askAiQuestion({ question: 'what is my tier?', role: 'buyer', orders: [ORDER] }))
      .rejects.toThrow()
      .then(() => {
        expect(classifyAiFailure(getLastAiError())).toBe('offline');
      });
  });

  test('the failure is kept rather than discarded', () => {
    // `getLastAiError` used to be permanently null because nothing ever wrote to
    // it, so the one piece of evidence was thrown away before anyone could read it.
    fetchMock.mockResolvedValue(jsonResponse({ message: 'boom' }, 500));
    return expect(askAiQuestion({ question: 'q', role: 'buyer', orders: [] }))
      .rejects.toThrow()
      .then(() => {
        expect(getLastAiError()).not.toBeNull();
        expect(getLastAiError().status).toBe(500);
      });
  });

  test('a successful answer clears the previous failure', () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ answer: 'a', role: 'buyer' }, 200));
    return askAiQuestion({ question: 'q', role: 'buyer', orders: [] }).then(() => {
      expect(getLastAiError()).toBeNull();
    });
  });

  test('every reason has its own sentence', () => {
    // Two reasons sharing one sentence would defeat the point of classifying them.
    const sentences = Object.keys(AI_FALLBACK_REASONS).map((key) => AI_FALLBACK_REASONS[key]);
    expect(new Set(sentences).size).toBe(sentences.length);
    // And none of them may claim the fallback is only an offline condition, which
    // is what made the previous wording wrong.
    for (const sentence of sentences) expect(sentence).not.toMatch(/when offline/i);
  });
});

describe('the panel shows which one the reader is talking to', () => {
  // The real component, driven through the real hook, so the wording asserted here
  // is the wording a user reads rather than a copy of it.
  function Harness({ hook: useAquaAi, ...panel }) {
    const ai = useAquaAi({ role: 'buyer', orders: [ORDER] });
    return (
      <AiPanel
        role="buyer"
        input={ai.aiInput}
        setInput={ai.setAiInput}
        messages={ai.aiMessages}
        askAi={ai.askAi}
        close={() => {}}
        aiLoading={ai.aiLoading}
        aiSource={ai.aiSource}
        aiFallbackReason={ai.aiFallbackReason}
        {...panel}
      />
    );
  }

  async function askSomething() {
    const { default: useAquaAi } = await import('../hooks/useAquaAi');
    const user = userEvent.setup();
    render(<Harness hook={useAquaAi} />);
    await user.type(screen.getByRole('textbox', { name: /ask aqua ai/i }), 'what did my last order cost?');
    await user.click(screen.getByRole('button', { name: /^ask/i }));
  }

  test('an undeployed server is named, not described as offline', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'NOT_FOUND', message: 'Requested function was not found' }, 404));
    await askSomething();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/not deployed/i));
    // The one thing it must not say is the thing that was wrong before.
    expect(screen.getByRole('status')).not.toHaveTextContent(/offline/i);
    // And the answer itself is still the honest local one, read from the order.
    expect(screen.getByText(/AQ-1A2B3C/)).toBeInTheDocument();
  });

  test('the panel does not claim the fallback is only an offline case', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'NOT_FOUND' }, 404));
    await askSomething();

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(document.body.textContent).not.toMatch(/falls back to local rules when offline/i);
  });

  test('no fallback note is shown when Gemini answered', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ answer: 'It cost GH₵300.00.', role: 'buyer' }, 200));
    await askSomething();

    await waitFor(() => expect(screen.getByText(/GH₵300\.00/)).toBeInTheDocument());
    // Nothing to apologise for, so nothing is claimed.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/read from real orders on this device/i);
  });
});