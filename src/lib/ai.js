/**
 * Client-side AI helper for the AquaLink assistant.
 *
 * Calls the server-side `/ai/chat` endpoint, which proxies to the Gemini API.
 * The API key stays on the server; the client only sends the question and
 * role-scoped order context.
 */

import { apiRequest } from './api';
import { getAiAnswer } from '../hooks/useAquaAi';

let lastError = null;

export function getLastAiError() {
  return lastError;
}

/**
 * Ask the Aqua AI assistant a question.
 *
 * When the server is reachable, the question is answered by a real Gemini model
 * scoped to the caller's role and orders. When the server is unreachable (offline
 * dev, local demo), the keyword matcher in `getAiAnswer` is used as a fallback so
 * the assistant panel still answers from real local order data instead of being
 * a dead box.
 */
export async function askAiQuestion({ question, role, orders, split, sellerScores, reliabilityScores, buyerId, language }) {
  lastError = null;
  if (!question || String(question).trim().length === 0) {
    return { answer: 'Ask about your orders, pricing, or delivery status.', source: 'fallback' };
  }

  try {
    const payload = await apiRequest('/ai/chat', {
      method: 'POST',
      body: { question, role, orders, split, sellerScores, reliabilityScores, buyerId, language },
    });
    lastError = null;
    return { answer: payload.answer, source: 'gemini' };
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    return {
      answer: getAiAnswer(question, { language, orders, split, sellerScores, reliabilityScores, buyerId }),
      source: 'fallback',
    };
  }
}
