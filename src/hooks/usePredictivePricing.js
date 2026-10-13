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
    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 400));

      const basePrice = pricing.perGallon || 0.02;
      const currentPrice = pricing.currentPrice || basePrice;

      const recentOrders = orders.slice(-100);
      const avgVolume = recentOrders.length 
        ? recentOrders.reduce((sum, o) => sum + (o.volume || 0), 0) / recentOrders.length 
        : 5000;

      const priceElasticity = calculateElasticity(historicalPricing, orders);
      const demandForecast = forecastDemand(orders, events, weatherData);
      const competitorPrices = competitors.map(c => c.pricePerGallon).filter(p => p > 0);
      const avgCompetitorPrice = competitorPrices.length 
        ? competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length 
        : basePrice * 1.1;

      const optimalPrice = calculateOptimalPrice({
        basePrice,
        currentPrice,
        priceElasticity,
        demandForecast,
        avgCompetitorPrice,
        competitorPrices,
        avgVolume
      });

      const priceScenarios = generatePriceScenarios(optimalPrice, priceElasticity, demandForecast, avgVolume);

      const newRecommendations = [
        {
          id: 'optimal',
          type: 'optimal_price',
          title: 'Optimal Price Point',
          recommendedPrice: optimalPrice.recommendedPrice,
          expectedVolume: optimalPrice.expectedVolume,
          expectedRevenue: optimalPrice.expectedRevenue,
          confidence: optimalPrice.confidence,
          reasoning: optimalPrice.reasoning,
          riskLevel: optimalPrice.riskLevel
        },
        {
          id: 'competitive',
          type: 'competitive_match',
          title: 'Competitive Match',
          recommendedPrice: avgCompetitorPrice * 0.98,
          expectedVolume: demandForecast.baseVolume * 1.05,
          expectedRevenue: avgCompetitorPrice * 0.98 * demandForecast.baseVolume * 1.05,
          confidence: 75,
          reasoning: `Match top competitors at 2% discount to capture price-sensitive customers`,
          riskLevel: 'low'
        },
        {
          id: 'premium',
          type: 'premium_positioning',
          title: 'Premium Positioning',
          recommendedPrice: optimalPrice.recommendedPrice * 1.15,
          expectedVolume: demandForecast.baseVolume * 0.85,
          expectedRevenue: optimalPrice.recommendedPrice * 1.15 * demandForecast.baseVolume * 0.85,
          confidence: 65,
          reasoning: 'Position as premium with quality guarantees for higher margin',
          riskLevel: 'medium'
        },
        {
          id: 'surge',
          type: 'dynamic_surge',
          title: 'Surge Pricing Rules',
          recommendedPrice: null,
          rules: generateSurgeRules(demandForecast, priceElasticity),
          confidence: 80,
          reasoning: 'Automated surge pricing for peak demand periods',
          riskLevel: 'low'
        }
      ];

      const newAnalysis = {
        currentPrice,
        basePrice,
        avgCompetitorPrice,
        priceElasticity: Math.round(priceElasticity * 100) / 100,
        demandForecast,
        optimalPrice: optimalPrice.recommendedPrice,
        priceScenarios,
        lastAnalyzed: new Date().toISOString()
      };

      setAnalysis(newAnalysis);
      setRecommendations(newRecommendations);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orders, pricing, competitors, weatherData, events, historicalPricing]);

  const calculateElasticity = (historical, orders) => {
    if (!historical.length || !orders.length) return -1.5;
    const priceChanges = historical.slice(-20).map((h, i) => {
      if (i === 0) return null;
      const prev = historical[i - 1];
      const priceChange = (h.price - prev.price) / prev.price;
      const volumeChange = (h.volume - prev.volume) / prev.volume;
      return priceChange !== 0 ? volumeChange / priceChange : null;
    }).filter(v => v !== null);
    return priceChanges.length ? priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length : -1.5;
  };

  const forecastDemand = (orders, events, weather) => {
    const baseVolume = orders.slice(-30).reduce((sum, o) => sum + (o.volume || 0), 0) / 30 || 5000;
    let multiplier = 1.0;
    
    const upcomingEvents = events.filter(e => new Date(e.date) > new Date() && new Date(e.date) < new Date(Date.now() + 7 * 86400000));
    upcomingEvents.forEach(e => {
      if (e.type === 'festival') multiplier += 0.3;
      if (e.type === 'holiday') multiplier += 0.2;
      if (e.type === 'construction') multiplier += 0.15;
    });

    const severeWeather = weather.filter(w => w.severity === 'severe' || w.severity === 'extreme').length;
    if (severeWeather > 0) multiplier += 0.25;

    return {
      baseVolume: Math.round(baseVolume),
      forecastVolume: Math.round(baseVolume * multiplier),
      multiplier: Math.round(multiplier * 100) / 100,
      factors: { events: upcomingEvents.length, severeWeather }
    };
  };

  const calculateOptimalPrice = ({ basePrice, currentPrice, priceElasticity, demandForecast, avgCompetitorPrice, competitorPrices, avgVolume }) => {
    const marginalCost = basePrice * 0.6;
    const optimalMarkup = priceElasticity / (priceElasticity + 1);
    let recommendedPrice = marginalCost / (1 + optimalMarkup);
    
    recommendedPrice = Math.max(recommendedPrice, basePrice * 0.9);
    recommendedPrice = Math.min(recommendedPrice, avgCompetitorPrice * 1.2);
    
    const expectedVolume = demandForecast.baseVolume * Math.pow(recommendedPrice / currentPrice, priceElasticity);
    const expectedRevenue = recommendedPrice * expectedVolume;
    const currentRevenue = currentPrice * demandForecast.baseVolume;

    return {
      recommendedPrice: Math.round(recommendedPrice * 10000) / 10000,
      expectedVolume: Math.round(expectedVolume),
      expectedRevenue: Math.round(expectedRevenue * 100) / 100,
      revenueChange: Math.round(((expectedRevenue - currentRevenue) / currentRevenue) * 100),
      confidence: Math.min(90, 60 + Math.abs(priceElasticity) * 10),
      reasoning: `Based on elasticity of ${priceElasticity.toFixed(2)}, optimal markup is ${(optimalMarkup * 100).toFixed(1)}% above marginal cost`,
      riskLevel: Math.abs(priceElasticity) > 2 ? 'high' : 'medium'
    };
  };

  const generatePriceScenarios = (optimal, elasticity, demand, volume) => {
    const basePrice = optimal.recommendedPrice;
    return [
      { label: 'Conservative (-5%)', price: basePrice * 0.95, volume: volume * Math.pow(0.95, elasticity), revenue: basePrice * 0.95 * volume * Math.pow(0.95, elasticity) },
      { label: 'Optimal', price: basePrice, volume: optimal.expectedVolume, revenue: optimal.expectedRevenue },
      { label: 'Aggressive (+5%)', price: basePrice * 1.05, volume: volume * Math.pow(1.05, elasticity), revenue: basePrice * 1.05 * volume * Math.pow(1.05, elasticity) },
      { label: 'Premium (+15%)', price: basePrice * 1.15, volume: volume * Math.pow(1.15, elasticity), revenue: basePrice * 1.15 * volume * Math.pow(1.15, elasticity) }
    ].map(s => ({
      ...s,
      volume: Math.round(s.volume),
      revenue: Math.round(s.revenue * 100) / 100
    }));
  };

  const generateSurgeRules = (demand, elasticity) => {
    return [
      { trigger: 'Demand > 150% of forecast', multiplier: 1.25, maxDuration: '4 hours' },
      { trigger: 'Severe weather alert', multiplier: 1.15, maxDuration: 'Duration of alert' },
      { trigger: 'Major event within 10km', multiplier: 1.20, maxDuration: 'Event hours + 2' },
      { trigger: 'Competitor stockout detected', multiplier: 1.30, maxDuration: '24 hours' },
      { trigger: 'Fleet utilization > 90%', multiplier: 1.10, maxDuration: 'Until < 80%' }
    ];
  };

  useEffect(() => { analyzePricing(); }, [analyzePricing]);

  const applyRecommendation = useCallback((recId) => {
    const rec = recommendations.find(r => r.id === recId);
    if (rec && rec.recommendedPrice) {
      onNotice?.(`Price recommendation applied: GH₵${rec.recommendedPrice.toFixed(4)}/gallon`);
      return rec.recommendedPrice;
    }
    return null;
  }, [recommendations, onNotice]);

  return {
    analysis,
    recommendations,
    loading,
    error,
    refresh: analyzePricing,
    applyRecommendation,
    currentPrice: analysis?.currentPrice || 0,
    optimalPrice: analysis?.optimalPrice || 0,
    elasticity: analysis?.priceElasticity || 0
  };
}

export default usePredictivePricing;