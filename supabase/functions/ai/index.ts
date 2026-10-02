import { applyCors, fail, json, readJson } from '../_lib/utils.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

function formatCedi(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const major = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${sign}GH₵${major.toLocaleString('en-GB')}.${String(rest).padStart(2, '0')}`;
}

const SYSTEM_PROMPTS = {
  buyer: `You are Aqua, the AI assistant for AquaLink, a water delivery service in Ghana. You answer questions about the buyer's orders, pricing, delivery status, and loyalty rewards. You read the buyer's real order history from the data provided. If you don't know something, say so rather than inventing an answer. Never invent phone numbers, emails, order references, or prices. Always quote GH₵ amounts in the format GH₵XX.XX.`,
  seller: `You are Aqua, the AI assistant for AquaLink's seller dashboard. You answer questions about seller performance, order payouts, delivery reliability, and pricing. You read the seller's real order data from the provided context. If you don't know something, say so.`,
  driver: `You are Aqua, the AI assistant for AquaLink's driver app. You answer questions about a driver's deliveries, earnings, and route information. You read the driver's real delivery data from the provided context. If you don't know something, say so.`,
  ops: `You are Aqua, the AI operations copilot for AquaLink. You answer questions about revenue, seller performance, delivery reliability, order status, and pricing configuration. You read real order data from the provided context. If you don't know something, say so.`,
  institution: `You are Aqua, the AI assistant for AquaLink's institutional dashboard. You answer questions about supply schedules, budgets, and delivery volumes. You read real data from the provided context. If you don't know something, say so.`,
};

function buildContextPayload(body: Record<string, unknown>): { role: string; question: string; context: string } {
  const role = String(body.role ?? 'buyer');
  const question = String(body.question ?? '').trim();
  const orders = Array.isArray(body.orders) ? body.orders : [];
  const split = body.split;
  const sellerScores = Array.isArray(body.sellerScores) ? body.sellerScores : [];
  const reliabilityScores = Array.isArray(body.reliabilityScores) ? body.reliabilityScores : [];
  const buyerId = body.buyerId ?? null;

  let context = '';
  if (orders.length > 0) {
    context += `Recent orders:\n${orders.slice(0, 5).map((o: any) =>
      `- ${o.code || o.id}: ${o.location || 'unknown'}, ${o.volume || o.volumeLitres + 'L'}, status=${o.status}, charged=${o.chargedMinor ? formatCedi(o.chargedMinor) : 'unknown'}, driver=${o.driverName || 'unassigned'}, seller=${o.sellerName || 'unassigned'}`
    ).join('\n')}\n`;
  }
  if (split) {
    context += `\nRevenue split: ${split.seller || 0}% seller, ${split.driver || 0}% driver, ${split.platformCommission || 0}% platform, ${split.buyerServiceCharge || 0}% buyer fee.`;
  }
  if (sellerScores.length > 0) {
    context += `\n\nSeller performance:\n${sellerScores.slice(0, 10).map((s: any) =>
      `- ${s.sellerId}: score=${s.score} (${s.band?.label || 'unranked'}), ${s.slaHours || 0}h avg`
    ).join('\n')}\n`;
  }
  if (reliabilityScores.length > 0) {
    context += `\nDelivery reliability:\n${reliabilityScores.slice(0, 10).map((s: any) =>
      `- ${s.sellerId}: ${s.slaHours || 0}h average, ${s.slaMeasured ? 'timed' : 'untimed'}`
    ).join('\n')}\n`;
  }
  if (buyerId) {
    context += `\nBuyer ID: ${buyerId}`;
  }

  return { role, question, context };
}

async function callGemini(apiKey: string, role: string, question: string, context: string): Promise<string> {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const systemPrompt = SYSTEM_PROMPTS[role as keyof typeof SYSTEM_PROMPTS] ?? SYSTEM_PROMPTS.buyer;
  const userPrompt = `${systemPrompt}\n\nContext:\n${context}\n\nQuestion: ${question}\n\nAnswer concisely in plain text, no markdown formatting.`;

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.3,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!answer) throw new Error('Gemini returned an empty response.');
  return answer;
}

Deno.serve(async (req: Request) => {
  const init = applyCors(req);
  if (req.method === 'OPTIONS') return new Response('', init);

  const url = new URL(req.url);
  const path = url.pathname.split('/').pop() ?? '';

  if (path === 'chat') {
    if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

    const body = await readJson(req);
    const { role, question, context } = buildContextPayload(body);

    if (!question) return fail(400, 'missing_question', 'A question is required.');

    try {
      const answer = await callGemini(GEMINI_API_KEY, role, question, context);
      return json({ answer, role });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(500, 'ai_error', message);
    }
  }

  return fail(404, 'not_found', 'No such AI endpoint.');
});
