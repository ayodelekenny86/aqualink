/**
 * Client-side AI helper for the AquaLink assistant.
 *
 * Calls the server-side `/ai/chat` endpoint, which proxies to the Gemini API.
 * The API key stays on the server; the client only sends the question and
 * role-scoped order context.
 *
 * Throws when the server is unreachable; the caller (useAquaAi hook) is
 * responsible for falling back to the keyword matcher in that case.
 *
 * The failure is kept rather than discarded, because "the assistant answered
 * differently" and "the assistant could not reach the server" are different facts
 * and only the user can fix the second one. `lastError` used to be assigned
 * `null` and nothing else, so `getLastAiError` always reported no error and the
 * hook's bare `catch {}` threw away the only clue there was.
 */

import { apiRequest } from './api';

let lastError = null;

export function getLastAiError() {
  return lastError;
}

/**
 * What went wrong, in the terms a user can act on.
 *
 * The important distinction is between "this device is offline" and "this server
 * has no AI". Both end in the local matcher, so both were previously shown as a
 * small "Local" badge, and the panel's own text claimed the fallback only happens
 * offline. On a server where the `ai` function was never deployed — which is the
 * state this project is in — that statement is false and the user is told their
 * device is offline when the device is fine.
 */
export const AI_FALLBACK_REASONS = {
  offline: 'This device could not reach the server.',
  notDeployed: 'The AI function is not deployed on this server.',
  unconfigured: 'The server has no AI key set, so the assistant cannot answer.',
  failed: 'The AI request did not succeed.',
};

/**
 * Classify a failure so the panel can say which one it was.
 *
 * A 404 means the function itself is missing, which is a deployment problem and
 * the single most likely cause in practice: the client asks for a path that does
 * not exist and every answer silently becomes a local one. A 503 means the
 * function is there but has no key. Anything else — including the bare network
 * failure a `fetch` throws when the device is genuinely offline — is `failed` or
 * `offline` as below.
 */
export function classifyAiFailure(error) {
  if (!error) return 'failed';
  // `fetch` rejects with a TypeError when the request never leaves the device, so
  // that is the signal for "offline" rather than a server that answered badly.
  if (error.name === 'TypeError') return 'offline';
  if (error.status === 404) return 'notDeployed';
  if (error.status === 503) return 'unconfigured';
  return 'failed';
}

/** The sentence shown to the user for a fallback. */
export function aiFallbackMessage(reason) {
  const cause = AI_FALLBACK_REASONS[reason] ?? AI_FALLBACK_REASONS.failed;
  return `${cause} This answer was read from real orders on this device instead.`;
}

/**
 * Ask the Aqua AI assistant a question.
 *
 * Throws if the server is unreachable — the hook wraps this in try/catch
 * and falls back to the local keyword matcher so the assistant still works
 * without the server.
 */
export async function askAiQuestion({ question, role, orders, split, sellerScores, reliabilityScores, buyerId, language }) {
  lastError = null;
  if (!question || String(question).trim().length === 0) {
    throw new Error('No question provided');
  }

  try {
    const payload = await apiRequest('/ai/chat', {
      method: 'POST',
      body: { question, role, orders, split, sellerScores, reliabilityScores, buyerId, language },
    });

    return { answer: payload.answer, source: 'gemini', role: payload.role };
  } catch (error) {
    lastError = error;
    throw error;
  }
}