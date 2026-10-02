/**
 * Client-side AI helper for the AquaLink assistant.
 *
 * Calls the server-side `/ai/chat` endpoint, which proxies to the Gemini API.
 * The API key stays on the server; the client only sends the question and
 * role-scoped order context.
 *
 * Throws when the server is unreachable; the caller (useAquaAi hook) is
 * responsible for falling back to the keyword matcher in that case.
 */

import { apiRequest } from './api';

let lastError = null;

export function getLastAiError() {
  return lastError;
}

/**
 * Ask the Aqua AI assistant a question.
 *
 * Throws if the server is unreachable — the hook wraps this in try/catch
 * and falls back to the local keyword matcher so the assistant still works
 * offline.
 */
export async function askAiQuestion({ question, role, orders, split, sellerScores, reliabilityScores, buyerId, language }) {
  lastError = null;
  if (!question || String(question).trim().length === 0) {
    throw new Error('No question provided');
  }

  const payload = await apiRequest('/ai/chat', {
    method: 'POST',
    body: { question, role, orders, split, sellerScores, reliabilityScores, buyerId, language },
  });

  return { answer: payload.answer, source: 'gemini', role: payload.role };
}
