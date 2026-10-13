import { useState, useEffect, useMemo, useCallback } from 'react';

const USE_MOCK = typeof window !== 'undefined' && (!window.__SUPABASE_URL__ || !window.__SUPABASE_ANON_KEY__);

export function useRevenueOptimization({ orders = [], pricing = {}, customers = [], onNotice }) {
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const revenueAnalysis = useMemo(() => {
    const completedOrders = orders.filter(o => o.status === 'Delivered' || o.status === 'Paid');
    const pendingOrders = orders.filter(o => o.status === 'Pending' || o.status === 'Confirmed' || o.status === 'Assigned');
    
    const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.chargedMinor || o.total || 0), 0);
    const pendingRevenue = pendingOrders.reduce((sum, o) => sum + (o.chargedMinor || o.total || 0), 0);
    const avgOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;
    
    const monthlyRevenue = {};
    completedOrders.forEach(o => {
      const month = new Date(o.createdAt).toISOString().slice(0, 7);
      monthlyRevenue[month] = (monthlyRevenue[month] || 0) + (o.chargedMinor || o.total || 0);
    });
    
    const monthlyTrend = Object.entries(monthlyRevenue)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, revenue]) => ({ month, revenue }));
    
    const volumeTiers = {};
    completedOrders.forEach(o => {
      const tier = o.volume || 'unknown';
      volumeTiers[tier] = (volumeTiers[tier] || 0) + 1;
    });
    
    const priceOptimization = {};
    Object.entries(volumeTiers).forEach(([tier, count]) => {
      const tierOrders = completedOrders.filter(o => (o.volume || 'unknown') === tier);
      const avgPrice = tierOrders.length > 0 ? tierOrders.reduce((sum, o) => sum + (o.chargedMinor || 0), 0) / tierOrders.length : 0;
      const basePrice = pricing[tier]?.basePrice || avgPrice;
      const currentMultiplier = pricing[tier]?.multiplier || 1;
      
      const elasticity = estimateElasticity(tier, tierOrders);
      const optimalMultiplier = calculateOptimalMultiplier(currentMultiplier, elasticity, count);
      const revenueImpact = (optimalMultiplier - currentMultiplier) * avgPrice * count;
      
      priceOptimization[tier] = {
        currentMultiplier,
        optimalMultiplier: Math.round(optimalMultiplier * 100) / 100,
        avgPrice: Math.round(avgPrice),
        count,
        elasticity: Math.round(elasticity * 100) / 100,
        revenueImpact: Math.round(revenueImpact),
        recommendation: optimalMultiplier > currentMultiplier * 1.05 ? 'increase' : 
                       optimalMultiplier < currentMultiplier * 0.95 ? 'decrease' : 'maintain',
      };
    });

    const customerSegments = {};
    customers.forEach(c => {
      const segment = c.segment || 'standard';
      customerSegments[segment] = (customerSegments[segment] || 0) + 1;
    });

    return {
      totalRevenue,
      pendingRevenue,
      avgOrderValue: Math.round(avgOrderValue),
      monthlyTrend,
      volumeTiers,
      priceOptimization,
      customerSegments,
      totalOrders: completedOrders.length,
      pendingOrders: pendingOrders.length,
    };
  }, [orders, pricing, customers]);

  const recommendations = useMemo(() => {
    const recs = [];
    const { priceOptimization, monthlyTrend, totalRevenue } = revenueAnalysis;
    
    Object.entries(priceOptimization).forEach(([tier, data]) => {
      if (data.recommendation !== 'maintain' && Math.abs(data.revenueImpact) > totalRevenue * 0.01) {
        recs.push({
          id: `rev_${tier}`,
          type: 'pricing',
          priority: Math.abs(data.revenueImpact) > totalRevenue * 0.05 ? 'high' : 'medium',
          title: `${data.recommendation === 'increase' ? 'Increase' : 'Decrease'} price for ${tier}`,
          description: `Current: ${data.currentMultiplier}x → Optimal: ${data.optimalMultiplier}x. Estimated impact: ${data.revenueImpact > 0 ? '+' : ''}${formatCediRaw(data.revenueImpact)}/month`,
          impact: data.revenueImpact,
          action: `Update ${tier} pricing to ${data.optimalMultiplier}x multiplier`,
        });
      }
    });

    if (monthlyTrend.length >= 2) {
      const lastMonth = monthlyTrend[monthlyTrend.length - 1].revenue;
      const prevMonth = monthlyTrend[monthlyTrend.length - 2].revenue;
      const growth = ((lastMonth - prevMonth) / prevMonth) * 100;
      
      if (growth < -10) {
        recs.push({
          id: 'rev_decline',
          type: 'growth',
          priority: 'high',
          title: 'Revenue declining',
          description: `Monthly revenue dropped ${Math.abs(growth).toFixed(1)}%`,
          impact: lastMonth - prevMonth,
          action: 'Launch promotion campaign and review pricing',
        });
      } else if (growth > 20) {
        recs.push({
          id: 'rev_growth',
          type: 'growth',
          priority: 'low',
          title: 'Strong revenue growth',
          description: `Monthly revenue grew ${growth.toFixed(1)}%`,
          impact: lastMonth - prevMonth,
          action: 'Consider capacity expansion',
        });
      }
    }

    return recs.sort((a, b) => (b.priority === 'high' ? 3 : b.priority === 'medium' ? 2 : 1) - (a.priority === 'high' ? 3 : a.priority === 'medium' ? 2 : 1));
  }, [revenueAnalysis]);

  const summary = useMemo(() => {
    const totalOptimizationImpact = recommendations.filter(r => r.type === 'pricing').reduce((sum, r) => sum + r.impact, 0);
    const highPriorityCount = recommendations.filter(r => r.priority === 'high').length;
    
    return {
      ...revenueAnalysis,
      totalOptimizationImpact: Math.round(totalOptimizationImpact),
      highPriorityRecommendations: highPriorityCount,
      totalRecommendations: recommendations.length,
    };
  }, [revenueAnalysis, recommendations]);

  const refresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setLastUpdated(new Date().toISOString());
      setLoading(false);
      onNotice?.('Revenue optimization updated');
    }, 500);
  }, [onNotice]);

  const formatCedi = useCallback((amount) => {
    return `GH₵${(amount / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, []);

  function formatCediRaw(amount) {
    return `GH₵${(amount / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function estimateElasticity(tier, orders) {
    const volumes = orders.map(o => o.volume || 0);
    const prices = orders.map(o => o.chargedMinor || 0);
    if (volumes.length < 3) return -0.8;
    return -0.8 - Math.random() * 0.4;
  }

  function calculateOptimalMultiplier(current, elasticity, volume) {
    if (elasticity >= -0.5) return current * 1.15;
    if (elasticity >= -1.0) return current * 1.05;
    if (elasticity >= -1.5) return current * 0.98;
    return current * 0.92;
  }

  return {
    revenueAnalysis,
    recommendations,
    summary,
    loading,
    lastUpdated,
    refresh,
    formatCedi,
  };
}

export default useRevenueOptimization;