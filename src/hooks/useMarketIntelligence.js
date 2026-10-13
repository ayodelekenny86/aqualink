import { useState, useEffect, useCallback, useMemo } from 'react';

export function useMarketIntelligence({ orders = [], customers = [], competitors = [], onNotice }) {
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [marketData, setMarketData] = useState(null);
  const [competitorAnalysis, setCompetitorAnalysis] = useState([]);
  const [pricingIntelligence, setPricingIntelligence] = useState(null);
  const [trendForecasts, setTrendForecasts] = useState([]);

  const formatCedi = (amount) => {
    const cedis = amount / 100;
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', minimumFractionDigits: 2 }).format(cedis);
  };

  const generateMarketData = useCallback(() => {
    const totalRevenue = orders.reduce((sum, o) => sum + (o.value || 0), 0);
    const totalVolume = orders.reduce((sum, o) => sum + (o.volume || 0), 0);
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
    const uniqueCustomers = new Set(orders.map(o => o.customerId)).size;
    
    const monthlyTrend = {};
    orders.forEach(o => {
      const month = o.createdAt ? new Date(o.createdAt).toISOString().slice(0, 7) : 'unknown';
      if (!monthlyTrend[month]) monthlyTrend[month] = { revenue: 0, volume: 0, orders: 0 };
      monthlyTrend[month].revenue += o.value || 0;
      monthlyTrend[month].volume += o.volume || 0;
      monthlyTrend[month].orders += 1;
    });

    const sortedMonths = Object.entries(monthlyTrend).sort(([a], [b]) => a.localeCompare(b));
    const recentMonths = sortedMonths.slice(-6);
    const growthRate = recentMonths.length >= 2 && recentMonths[recentMonths.length - 2][1].revenue > 0
      ? ((recentMonths[recentMonths.length - 1][1].revenue - recentMonths[recentMonths.length - 2][1].revenue) 
         / recentMonths[recentMonths.length - 2][1].revenue * 100).toFixed(1)
      : 0;

    return {
      totalRevenue,
      totalVolume,
      avgOrderValue,
      uniqueCustomers,
      marketShare: 35 + Math.random() * 15,
      growthRate: parseFloat(growthRate),
      monthlyTrend: recentMonths.map(([month, data]) => ({ month, ...data })),
      customerSegments: {
        'Enterprise': Math.floor(customers.length * 0.15),
        'SME': Math.floor(customers.length * 0.35),
        'Residential': Math.floor(customers.length * 0.50),
      },
      topZones: ['Accra Central', 'East Legon', 'Tema', 'Kasoa', 'Madina'].slice(0, 3),
      seasonalityIndex: 1.2,
    };
  }, [orders, customers]);

  const generateCompetitorAnalysis = useCallback(() => {
    const baseCompetitors = competitors.length > 0 ? competitors : [
      { id: 'comp_1', name: 'AquaFlow Ghana', type: 'Direct', marketShare: 28 },
      { id: 'comp_2', name: 'PureWater Express', type: 'Direct', marketShare: 22 },
      { id: 'comp_3', name: 'HydroDelivery', type: 'Indirect', marketShare: 15 },
      { id: 'comp_4', name: 'Local Vendors', type: 'Fragmented', marketShare: 35 },
    ];

    return baseCompetitors.map(comp => ({
      ...comp,
      avgPricePerGallon: 12 + Math.random() * 8,
      serviceRadius: 15 + Math.random() * 25,
      deliverySpeed: 'Same-day' + (Math.random() > 0.5 ? ' / Next-day' : ''),
      strengths: ['Wide coverage', 'Brand recognition', 'Low prices'].slice(0, 2 + Math.floor(Math.random() * 2)),
      weaknesses: ['Inconsistent quality', 'Limited support', 'No subscription'].slice(0, 1 + Math.floor(Math.random() * 2)),
      threatLevel: comp.marketShare > 25 ? 'high' : comp.marketShare > 15 ? 'medium' : 'low',
      lastPriceChange: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    }));
  }, [competitors]);

  const generatePricingIntelligence = useCallback(() => {
    const ourAvgPrice = orders.length > 0 
      ? orders.reduce((sum, o) => sum + (o.value || 0) / (o.volume || 1), 0) / orders.length 
      : 15;
    
    return {
      ourAvgPrice: ourAvgPrice / 100,
      marketAvgPrice: 14.50,
      pricePosition: ourAvgPrice / 100 > 14.50 ? 'premium' : ourAvgPrice / 100 < 13 ? 'budget' : 'competitive',
      priceElasticity: -1.3,
      optimalPriceRange: { min: 13.50, max: 16.50 },
      competitorPrices: [
        { competitor: 'AquaFlow Ghana', price: 13.80, volume: 'high' },
        { competitor: 'PureWater Express', price: 15.20, volume: 'medium' },
        { competitor: 'HydroDelivery', price: 16.50, volume: 'low' },
      ],
      recommendedActions: [
        { action: 'Maintain current pricing', confidence: 75, reason: 'Within optimal range' },
        { action: 'Test 5% premium on enterprise', confidence: 68, reason: 'Low elasticity segment' },
        { action: 'Bundle subscription discount', confidence: 82, reason: 'Increases LTV by 23%' },
      ],
      volumeDiscountTiers: [
        { tier: '1-500 gal', multiplier: 1.0 },
        { tier: '501-2000 gal', multiplier: 0.95 },
        { tier: '2001-5000 gal', multiplier: 0.90 },
        { tier: '5000+ gal', multiplier: 0.85 },
      ],
    };
  }, [orders]);

  const generateTrendForecasts = useCallback(() => {
    const trends = [
      { trend: 'Subscription adoption', direction: 'up', confidence: 88, impact: 'high', timeframe: '6 months', description: 'Enterprise customers shifting to recurring contracts' },
      { trend: 'Eco-friendly packaging', direction: 'up', confidence: 72, impact: 'medium', timeframe: '12 months', description: 'Regulatory pressure driving reusable container adoption' },
      { trend: 'Same-day delivery expectation', direction: 'up', confidence: 91, impact: 'high', timeframe: '3 months', description: 'Customer tolerance for wait times decreasing' },
      { trend: 'Digital payment preference', direction: 'up', confidence: 95, impact: 'medium', timeframe: 'ongoing', description: 'Mobile money adoption at 87% in urban areas' },
      { trend: 'Water quality transparency', direction: 'up', confidence: 79, impact: 'high', timeframe: '6 months', description: 'Customers demanding real-time quality data' },
      { trend: 'Consolidation of small vendors', direction: 'up', confidence: 65, impact: 'medium', timeframe: '18 months', description: 'Fragmented market creating acquisition opportunities' },
    ];
    return trends;
  }, []);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      setMarketData(generateMarketData());
      setCompetitorAnalysis(generateCompetitorAnalysis());
      setPricingIntelligence(generatePricingIntelligence());
      setTrendForecasts(generateTrendForecasts());
      setLastUpdated(new Date().toISOString());
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [generateMarketData, generateCompetitorAnalysis, generatePricingIntelligence, generateTrendForecasts]);

  const refresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setMarketData(generateMarketData());
      setCompetitorAnalysis(generateCompetitorAnalysis());
      setPricingIntelligence(generatePricingIntelligence());
      setTrendForecasts(generateTrendForecasts());
      setLastUpdated(new Date().toISOString());
      setLoading(false);
      onNotice?.('Market intelligence refreshed');
    }, 300);
  }, [generateMarketData, generateCompetitorAnalysis, generatePricingIntelligence, generateTrendForecasts, onNotice]);

  const summary = useMemo(() => {
    if (!marketData) return {};
    return {
      marketShare: marketData.marketShare.toFixed(1),
      growthRate: marketData.growthRate.toFixed(1),
      totalRevenue: marketData.totalRevenue,
      competitivePosition: pricingIntelligence?.pricePosition || 'unknown',
      activeTrends: trendForecasts.filter(t => t.direction === 'up').length,
      highThreatCompetitors: competitorAnalysis.filter(c => c.threatLevel === 'high').length,
    };
  }, [marketData, pricingIntelligence, trendForecasts, competitorAnalysis]);

  return {
    marketData,
    competitorAnalysis,
    pricingIntelligence,
    trendForecasts,
    summary,
    loading,
    lastUpdated,
    refresh,
    formatCedi,
  };
}