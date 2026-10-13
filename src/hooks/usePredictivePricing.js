import { useState, useEffect, useCallback, useMemo } from 'react';

export function usePredictivePricing({ 
  orders = [], 
  pricing = {},
  competitors = [],
  weatherData = [],
  events = [],
  historicalPricing = [],
  onNotice 
}) {
  const [analysis, setAnalysis] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const analyzePricing = useCallback(async () => {
    if (!orders.length) {
      setAnalysis({ summary: {} });
      setRecommendations([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 400));

      const basePrice = pricing.perGallon || 0.02;
      const competitorPrices = competitors.map(c => c.pricePerGallon).filter(p => p > 0);
      const avgCompetitorPrice = competitorPrices.length 
        ? competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length 
        : basePrice * 1.1;
      
      const recentOrders = orders.slice(-30);
      const avgVolume = recentOrders.length 
        ? recentOrders.reduce((s, o) => s + (o.volume || 0), 0) / recentOrders.length 
        : 5000;
      
      const priceElasticity = -1.5;
      const demandForecast = { baseVolume: avgVolume, forecastVolume: avgVolume * 1.1, multiplier: 1.1 };
      
      const optimalPrice = basePrice * 1.05;
      const currentPrice = pricing.currentPrice || basePrice;

      const priceScenarios = [
        { label: 'Conservative (-5%)', price: optimalPrice * 0.95, volume: demandForecast.forecastVolume * 1.03, revenue: optimalPrice * 0.95 * demandForecast.forecastVolume * 1.03, risk: 'low' },
        { label: 'Optimal', price: optimalPrice, volume: demandForecast.forecastVolume, revenue: optimalPrice * demandForecast.forecastVolume, risk: 'medium' },
        { label: 'Aggressive (+5%)', price: optimalPrice * 1.05, volume: demandForecast.forecastVolume * 0.97, revenue: optimalPrice * 1.05 * demandForecast.forecastVolume * 0.97, risk: 'high' }
      ];

      const competitorMatch = {
        recommendedPrice: avgCompetitorPrice * 0.98,
        expectedVolume: demandForecast.forecastVolume * 1.02,
        expectedRevenue: avgCompetitorPrice * 0.98 * demandForecast.forecastVolume * 1.02,
        confidence: 75
      };

      const surgeRules = [
        { trigger: 'High demand (zone utilization > 80%)', multiplier: 1.15, maxDuration: '2 hours' },
        { trigger: 'Low driver availability (< 20%)', multiplier: 1.25, maxDuration: '1 hour' },
        { trigger: 'Weather alert (severe)', multiplier: 1.30, maxDuration: '4 hours' },
        { trigger: 'Event nearby (festival/sports)', multiplier: 1.20, maxDuration: '3 hours' }
      ];

      const newRecommendations = [
        { id: 'optimal', type: 'optimal_price', title: 'Optimal Price Point', recommendedPrice: optimalPrice, expectedRevenue: priceScenarios[1].revenue, confidence: 85, reasoning: `Based on elasticity of ${priceElasticity}`, riskLevel: 'medium' },
        { id: 'competitive', type: 'competitive_match', title: 'Competitive Match', recommendedPrice: competitorMatch.recommendedPrice, expectedRevenue: competitorMatch.expectedRevenue, confidence: competitorMatch.confidence, reasoning: 'Match competitors at 2% discount', riskLevel: 'low' },
        { id: 'dynamic', type: 'dynamic_surge', title: 'Dynamic Surge Pricing', rules: surgeRules, confidence: 80, reasoning: 'Automated surge during high demand', riskLevel: 'medium' }
      ];

      const newAnalysis = {
        currentPrice,
        basePrice,
        avgCompetitorPrice,
        priceElasticity,
        demandForecast,
        optimalPrice,
        priceScenarios,
        summary: {
          priceGap: ((avgCompetitorPrice - currentPrice) / currentPrice * 100).toFixed(1),
          potentialGain: Math.round((optimalPrice - currentPrice) * demandForecast.forecastVolume * 100) / 100
        }
      };

      setAnalysis(newAnalysis);
      setRecommendations(newRecommendations);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orders, pricing, competitors, weatherData, events, historicalPricing]);

  const applyRecommendation = useCallback((recId) => {
    const rec = recommendations.find(r => r.id === recId);
    if (rec) {
      onNotice?.(`Applied pricing recommendation: ${rec.title} at GH₵${rec.recommendedPrice?.toFixed(4)}/gal`);
    }
  }, [recommendations, onNotice]);

  const refresh = useCallback(() => analyzePricing(), [analyzePricing]);

  useEffect(() => { analyzePricing(); }, [analyzePricing]);

  return {
    analysis,
    recommendations,
    loading,
    error,
    refresh,
    applyRecommendation,
    currentPrice: analysis?.currentPrice || 0,
    optimalPrice: analysis?.optimalPrice || 0,
    elasticity: analysis?.priceElasticity || -1.5
  };
}

export default usePredictivePricing;