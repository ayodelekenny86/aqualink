import { useCallback, useState } from 'react';
import { translations } from '../data/translations';
import { formatCedi } from '../lib/money';
import { tierFor, computePoints, TIERS } from './useLoyalty';
import { askAiQuestion, aiFallbackMessage, classifyAiFailure } from '../lib/ai';

/**
 * The Aqua panel.
 *
 * This is a keyword matcher, not a model, and it used to pretend otherwise. It
 * answered "the price is GH₵300, discounted to GH₵250 with a 15% commission" and
 * "hold 6 trucks in East Legon tomorrow" as if it knew, described a specific
 * order that no user had, and offered a phone number and an email address that
 * were invented. A panel that answers confidently with fiction is worse than one
 * that admits its limits, because a seller can act on it.
 *
 * So the rules now are:
 *   - anything about money is read from the caller's own orders;
 *   - anything that would need a forecasting model or live telemetry says so;
 *   - no invented phone numbers, emails, order references or prices.
 */

const greeting = { from: 'ai', text: 'I can explain your orders and what they cost. I read your real order data, so if I do not know something I will say so rather than guess.' };

export const aiQuickActions = (role) => (role === 'ops'
  ? ['Explain an order', 'Summarise revenue', 'List unpaid orders', 'Check revenue split', 'Score sellers', 'How long do deliveries take']
  : ['Explain my order', 'Check delivery price', 'Find my receipt', 'Request a refund', 'My loyalty tier']);

const FALLBACK_ANSWER = 'I can explain your orders, their cost, and how the revenue split works. I cannot forecast demand or track drivers, because that data is not available to me. Try asking about an order or its price.';

/** The newest order the caller actually has, or null. */
function newestOrder(orders) {
  if (!Array.isArray(orders) || orders.length === 0) return null;
  return orders[0];
}

export const SUPPORT_CHANNELS = {
  // Kept as configuration rather than baked into answer strings, so these are
  // clearly the values a deployment sets rather than invented suggestions.
  phone: import.meta.env?.VITE_SUPPORT_PHONE ?? '',
  email: import.meta.env?.VITE_SUPPORT_EMAIL ?? '',
};

function supportAnswer() {
  const { phone, email } = SUPPORT_CHANNELS;
  if (!phone && !email) {
    return 'No support contact details are configured for this deployment, so I have nothing to give you here rather than a number that would not work.';
  }
  return [phone && `Call ${phone}.`, email && `Email ${email}.`].filter(Boolean).join(' ');
}

/**
 * Answer from real order data. Kept pure and exported so the behaviour can be
 * tested without rendering the panel.
 */
export function getAiAnswer(question, { language = 'en', orders = [], split, sellerScores = [], reliabilityScores = [], buyerId = null } = {}) {
  const lower = String(question ?? '').toLowerCase();
  const latest = newestOrder(orders);

  const totalShare = split
    ? `${split.seller}% seller, ${split.driver}% driver, ${split.platformCommission}% platform`
    : null;

  const table = [
    {
      keywords: ['price', 'cost', 'how much', 'charge'],
      answer: () => {
        if (!latest) return 'You have no orders yet, so there is no price to quote. The amount you will be charged is calculated on the server when you book, and shown before you pay.';
        return `Your most recent order, ${latest.code}, was ${formatCedi(latest.chargedMinor ?? latest.grossMinor ?? 0)} in total. That order is currently ${latest.status}.`;
      },
    },
    {
      keywords: ['status', 'order', 'progress'],
      answer: () => {
        if (!latest) return 'You have no orders yet. Once you book one, its status will appear here and in your delivery list.';
        return `Your most recent order ${latest.code} for ${formatCedi(latest.chargedMinor ?? 0)} is currently "${latest.status}". ${latest.status === 'Paid' ? 'Payment is confirmed by Paystack.' : 'It is not paid yet.'}`;
      },
    },
    {
      keywords: ['receipt'],
      answer: () => {
        if (!latest) return 'There is no receipt because there are no paid orders. A receipt is generated once Paystack confirms payment.';
        return latest.status === 'Paid'
          ? 'Your receipt is on the paid order in your checkout panel, and can be downloaded from there.'
          : `Order ${latest.code} is not paid yet, so there is no receipt to download. A receipt appears once Paystack confirms the payment.`;
      },
    },
    {
      keywords: ['split', 'payout', 'commission', 'revenue', 'share'],
      answer: () => {
        if (!latest) return 'There are no orders to break down yet.';
        const parts = [
          `water seller ${formatCedi(latest.sellerReceives ?? 0)}`,
          `driver ${formatCedi(latest.driverReceives ?? 0)}`,
          `AquaLink ${formatCedi(latest.platformCommission ?? 0)}`,
        ].join(', ');
        return `For ${latest.code}: ${parts}.${totalShare ? ` The configured split is ${totalShare}.` : ''}`;
      },
    },
    {
      keywords: ['unpaid', 'pending', 'awaiting', 'owe'],
      answer: () => {
        const unpaid = (orders ?? []).filter((order) => order.status !== 'Paid' && order.status !== 'Delivered');
        if (unpaid.length === 0) return 'Nothing is outstanding. Every order you have is paid or delivered.';
        return `Outstanding: ${unpaid.map((order) => `${order.code} (${formatCedi(order.chargedMinor ?? 0)})`).join(', ')}.`;
      },
    },
    {
      keywords: ['loyalty', 'tier', 'points', 'rewards', 'cashback', 'wallet'],
      answer: () => {
        if (!buyerId) return 'I do not know which buyer you are, so I cannot read your loyalty balance. Sign in and I will sum it from your paid orders.';
        const points = computePoints(orders, buyerId);
        const tier = tierFor(points);
        const next = TIERS.find((t) => t.minPoints > points);
        const cashback = Math.round(points * 0.02 * 100);
        const base = `You are in the ${tier.name} tier with ${points} points, which is worth ${formatCedi(cashback)} in cashback.`;
        return next ? `${base} ${next.minPoints - points} points away from ${next.name}.` : `${base} You are at the top of the ladder.`;
      },
    },
    {
      keywords: ['forecast', 'demand', 'predict', 'truck', 'dispatch', 'driver', 'eta', 'position', 'track'],
      // The old answers invented tomorrow's demand and told ops to stage six
      // trucks in a named district. Nothing here can support that.
      answer: () => 'I cannot forecast demand or track drivers. That needs a forecasting model and live vehicle telemetry, and neither is connected to this app. I will not invent a number for it.',
    },
    {
      keywords: ['seller', 'score', 'performance', 'rank', 'flagged'],
      answer: () => {
        if (!Array.isArray(sellerScores) || sellerScores.length === 0) {
          return 'No seller has a completed order yet, so there is nothing to score. Every score here is summed from real orders and nothing is invented.';
        }
        const ranked = [...sellerScores].sort((a, b) => b.score - a.score);
        const top = ranked[0];
        const flagged = ranked.filter((s) => s.score < 60);
        const head = `Top seller is ${top.sellerId} with a score of ${top.score} (${top.band.label}).`;
        return flagged.length
          ? `${head} ${flagged.length} seller(s) are below the watch threshold: ${flagged.map((s) => `${s.sellerId} (${s.score})`).join(', ')}.`
          : `${head} No seller is below the watch threshold.`;
      },
    },
    {
      keywords: ['sla', 'how long', 'delivery time', 'dependable', 'dependability', 'reliability', 'how fast'],
      answer: () => {
        const ranked = Array.isArray(reliabilityScores) ? reliabilityScores : [];
        if (!ranked.length) {
          return 'No seller has a completed order yet, so there is no delivery time to estimate. Timing is recorded when an order is marked Assigned and then Delivered.';
        }
        const timed = ranked.filter((s) => s.slaMeasured);
        if (!timed.length) {
          return 'No seller has a timed delivery yet, so no delivery window can be estimated. The median of observed windows is used once timing exists, and it is always labelled as an estimate.';
        }
        const fastest = timed.reduce((a, b) => (a.slaHours < b.slaHours ? a : b));
        const slowest = timed.reduce((a, b) => (a.slaHours > b.slaHours ? a : b));
        return `Based on ${timed.length} seller(s) with timed deliveries: fastest observed window is ${fastest.sellerId} at about ${fastest.slaHours}h, slowest is ${slowest.sellerId} at about ${slowest.slaHours}h. These are medians of real delivery windows, not promises.`;
      },
    },
    {
      keywords: ['support', 'agent', 'help', 'contact'],
      answer: supportAnswer,
    },
    {
      keywords: ['refund'],
      answer: () => {
        if (!latest) return 'There is no order to request a refund for.';
        return `You can request a refund for ${latest.code} from its order details. Operations reviews it against the delivery record; note that Paystack charges and settlement are handled on Paystack's side and are not reversed by this app.`;
      },
    },
  ];

  const match = table.find((entry) => entry.keywords.some((keyword) => lower.includes(keyword)));
  const answer = match ? match.answer() : FALLBACK_ANSWER;

  const support = translations[language]?.support;
  return language !== 'en' && support ? `${support} · ${answer}` : answer;
}

export function useAquaAi({ language, orders = [], split, sellerScores = [], reliabilityScores = [], buyerId = null, role = 'buyer' } = {}) {
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState([greeting]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSource, setAiSource] = useState(null);
  // Why the last answer came from the local matcher. This is a separate piece of
  // state rather than part of `aiSource` because it changes the meaning of what the
  // user is reading: "your device is offline" and "this server was never
  // configured" produce the same answer and need different words under it.
  const [aiFallbackReason, setAiFallbackReason] = useState(null);

  const askAi = useCallback(async (event) => {
    event.preventDefault();
    const question = aiInput.trim();
    if (!question) return;

    setAiLoading(true);
    setAiMessages((messages) => [...messages, { from: 'user', text: question }]);
    setAiInput('');

    try {
      const { answer, source } = await askAiQuestion({
        question,
        role,
        orders,
        split,
        sellerScores,
        reliabilityScores,
        buyerId,
        language,
      });
      setAiSource(source);
      setAiFallbackReason(null);
      setAiMessages((messages) => [...messages, { from: 'ai', text: answer }]);
    } catch (error) {
      // Read the actual failure rather than swallowing it. The local matcher is a
      // fair answer — it is summed from real orders — but on this deployment it is
      // what every answer is, because the `ai` function was never deployed, and
      // saying so is the only way a reader can tell the difference between an
      // assistant and a keyword table.
      const reason = classifyAiFailure(error);
      setAiSource('fallback');
      setAiFallbackReason(reason);
      const answer = getAiAnswer(question, { language, orders, split, sellerScores, reliabilityScores, buyerId });
      setAiMessages((messages) => [...messages, { from: 'ai', text: answer }]);
    }
    setAiLoading(false);
  }, [aiInput, language, orders, split, sellerScores, reliabilityScores, buyerId, role]);

  const toggleAi = useCallback(() => setAiOpen((open) => !open), []);
  const closeAi = useCallback(() => setAiOpen(false), []);

  return { aiOpen, toggleAi, closeAi, aiInput, setAiInput, aiMessages, askAi, aiLoading, aiSource, aiFallbackReason };
}

export default useAquaAi;
