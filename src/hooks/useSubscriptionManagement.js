import { useState, useEffect, useCallback, useMemo } from 'react';

export function useSubscriptionManagement({ customers = [], orders = [], subscriptions = [], onNotice }) {
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [churnRisk, setChurnRisk] = useState([]);
  const [upsellOpportunities, setUpsellOpportunities] = useState([]);
  const [revenueForecast, setRevenueForecast] = useState(null);
  const [lifecycleMetrics, setLifecycleMetrics] = useState(null);

  const formatCedi = (amount) => {
    const cedis = amount / 100;
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', minimumFractionDigits: 2 }).format(cedis);
  };

  const generateSubscriptionData = useCallback(() => {
    const activeSubs = subscriptions.filter(s => s.status === 'active').length;
    const pausedSubs = subscriptions.filter(s => s.status === 'paused').length;
    const cancelledSubs = subscriptions.filter(s => s.status === 'cancelled').length;
    const totalMRR = subscriptions
      .filter(s => s.status === 'active')
      .reduce((sum, s) => sum + (s.monthlyValue || 0), 0);
    const avgSubscriptionValue = activeSubs > 0 ? totalMRR / activeSubs : 0;
    
    const plans = [
      { id: 'plan_basic', name: 'Basic Delivery', price: 15000, subscribers: Math.floor(activeSubs * 0.4), frequency: 'weekly', volume: 2000 },
      { id: 'plan_pro', name: 'Pro Delivery', price: 35000, subscribers: Math.floor(activeSubs * 0.35), frequency: '2x weekly', volume: 5000 },
      { id: 'plan_enterprise', name: 'Enterprise', price: 85000, subscribers: Math.floor(activeSubs * 0.15), frequency: 'daily', volume: 20000 },
      { id: 'plan_custom', name: 'Custom', price: 120000, subscribers: Math.floor(activeSubs * 0.1), frequency: 'custom', volume: 50000 },
    ];

    const monthlyTrend = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      monthlyTrend.push({
        month: date.toISOString().slice(0, 7),
        mrr: totalMRR * (0.7 + Math.random() * 0.6),
        newSubs: Math.floor(Math.random() * 8) + 2,
        churnedSubs: Math.floor(Math.random() * 5) + 1,
        netNew: Math.floor(Math.random() * 5) - 2,
      });
    }

    return {
      totalSubscriptions: subscriptions.length,
      activeSubscriptions: activeSubs,
      pausedSubscriptions: pausedSubs,
      cancelledSubscriptions: cancelledSubs,
      totalMRR,
      avgSubscriptionValue,
      plans,
      monthlyTrend,
      churnRate: cancelledSubs / Math.max(1, subscriptions.length) * 100,
      netGrowthRate: monthlyTrend[monthlyTrend.length - 1]?.netNew || 0,
    };
  }, [subscriptions]);

  const generateChurnRisk = useCallback(() => {
    const riskCustomers = customers
      .filter(c => c.subscriptionStatus === 'active' || c.subscriptionStatus === 'at_risk')
      .map(c => {
        const daysSinceOrder = c.daysSinceLastOrder || Math.floor(Math.random() * 60);
        const orderFrequency = c.orderFrequency || Math.random() * 4 + 1;
        const satisfactionScore = c.satisfactionScore || 3 + Math.random() * 2;
        const paymentIssues = c.paymentIssues || Math.floor(Math.random() * 3);
        
        let riskScore = 0;
        if (daysSinceOrder > 30) riskScore += 40;
        else if (daysSinceOrder > 14) riskScore += 20;
        if (orderFrequency < 2) riskScore += 25;
        if (satisfactionScore < 3.5) riskScore += 20;
        if (paymentIssues > 0) riskScore += 15 * paymentIssues;
        
        riskScore = Math.min(100, Math.max(0, riskScore + (Math.random() * 20 - 10)));
        
        return {
          customerId: c.id,
          customerName: c.name || `Customer ${c.id}`,
          segment: c.segment || 'Regular',
          currentPlan: c.currentPlan || 'Basic Delivery',
          monthlyValue: c.monthlyValue || 15000 + Math.random() * 70000,
          riskScore: Math.round(riskScore),
          riskLevel: riskScore >= 70 ? 'critical' : riskScore >= 40 ? 'high' : riskScore >= 20 ? 'medium' : 'low',
          daysSinceOrder,
          orderFrequency,
          satisfactionScore: Math.round(satisfactionScore * 10) / 10,
          paymentIssues,
          lastOrderDate: c.lastOrderDate || new Date(Date.now() - daysSinceOrder * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          recommendedActions: riskScore >= 70 
            ? ['Immediate outreach', 'Offer 20% discount', 'Assign account manager']
            : riskScore >= 40
            ? ['Proactive check-in', 'Offer plan upgrade', 'Schedule delivery review']
            : ['Monitor', 'Send satisfaction survey'],
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore);
    
    return riskCustomers;
  }, [customers]);

  const generateUpsellOpportunities = useCallback(() => {
    const opportunities = customers
      .filter(c => c.subscriptionStatus === 'active')
      .map(c => {
        const currentPlanValue = c.monthlyValue || 15000;
        const usageRatio = (c.avgMonthlyVolume || 3000) / (c.planVolume || 5000);
        const satisfactionScore = c.satisfactionScore || 4;
        
        let score = 0;
        if (usageRatio > 0.9) score += 40;
        else if (usageRatio > 0.7) score += 20;
        if (satisfactionScore >= 4.5) score += 30;
        else if (satisfactionScore >= 4) score += 15;
        if (c.tenureMonths > 6) score += 20;
        else if (c.tenureMonths > 3) score += 10;
        
        score = Math.min(100, score + Math.random() * 15);
        
        const nextPlans = [
          { name: 'Pro Delivery', price: 35000, volume: 5000 },
          { name: 'Enterprise', price: 85000, volume: 20000 },
          { name: 'Custom', price: 120000, volume: 50000 },
        ].filter(p => p.price > currentPlanValue);
        
        const recommendedPlan = nextPlans[Math.floor(Math.random() * nextPlans.length)] || nextPlans[0];
        
        return {
          customerId: c.id,
          customerName: c.name || `Customer ${c.id}`,
          currentPlan: c.currentPlan || 'Basic Delivery',
          currentValue: currentPlanValue,
          recommendedPlan: recommendedPlan?.name || 'Pro Delivery',
          recommendedValue: recommendedPlan?.price || 35000,
          upliftValue: (recommendedPlan?.price || 35000) - currentPlanValue,
          upliftPercent: (((recommendedPlan?.price || 35000) - currentPlanValue) / currentPlanValue * 100).toFixed(0),
          score: Math.round(score),
          priority: score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low',
          reasons: usageRatio > 0.9 ? ['Exceeds plan volume consistently'] : 
                   satisfactionScore >= 4.5 ? ['High satisfaction, ready for upgrade'] : ['Growing usage pattern'],
          tenureMonths: c.tenureMonths || Math.floor(Math.random() * 24),
        };
      })
      .filter(o => o.score >= 50)
      .sort((a, b) => b.score - a.score);
    
    return opportunities;
  }, [customers]);

  const generateRevenueForecast = useCallback((data) => {
    const currentMRR = data.totalMRR;
    const monthlyGrowth = data.monthlyTrend.slice(-3).reduce((sum, m) => sum + m.netNew, 0) / 3;
    const avgPlanValue = data.avgSubscriptionValue;
    
    const forecast = [];
    for (let i = 1; i <= 12; i++) {
      const projectedSubs = data.activeSubscriptions + monthlyGrowth * i;
      const projectedMRR = projectedSubs * avgPlanValue * (1 + 0.02 * i); // 2% monthly price increase
      forecast.push({
        month: i,
        projectedSubscribers: Math.round(projectedSubs),
        projectedMRR: Math.round(projectedMRR),
        projectedARR: Math.round(projectedMRR * 12),
      });
    }
    
    return {
      currentMRR,
      currentARR: currentMRR * 12,
      forecast,
      growthAssumptions: {
        monthlyNetNew: monthlyGrowth,
        annualPriceIncrease: 0.02,
        churnRate: data.churnRate,
        expansionRate: 0.05,
      },
      scenarios: {
        conservative: forecast.map(f => ({ ...f, projectedMRR: Math.round(f.projectedMRR * 0.85) })),
        realistic: forecast,
        optimistic: forecast.map(f => ({ ...f, projectedMRR: Math.round(f.projectedMRR * 1.25) })),
      },
    };
  }, []);

  const generateLifecycleMetrics = useCallback(() => {
    return {
      acquisition: {
        cac: 25000,
        cacPaybackMonths: 4.2,
        ltvCacRatio: 5.8,
        newSubsThisMonth: Math.floor(Math.random() * 10) + 5,
      },
      activation: {
        timeToFirstValue: 2.3,
        activationRate: 78,
        onboardingCompletion: 85,
      },
      retention: {
        monthlyChurnRate: 3.2,
        annualChurnRate: 32,
        netRevenueRetention: 112,
        grossRevenueRetention: 94,
      },
      expansion: {
        upsellRate: 18,
        crossSellRate: 12,
        expansionMRR: Math.random() * 500000 + 200000,
      },
      advocacy: {
        nps: 62,
        referralRate: 23,
        reviewScore: 4.6,
      },
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      const data = generateSubscriptionData();
      setSubscriptionData(data);
      setChurnRisk(generateChurnRisk());
      setUpsellOpportunities(generateUpsellOpportunities());
      setRevenueForecast(generateRevenueForecast(data));
      setLifecycleMetrics(generateLifecycleMetrics());
      setLastUpdated(new Date().toISOString());
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [generateSubscriptionData, generateChurnRisk, generateUpsellOpportunities, generateRevenueForecast, generateLifecycleMetrics]);

  const refresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      const data = generateSubscriptionData();
      setSubscriptionData(data);
      setChurnRisk(generateChurnRisk());
      setUpsellOpportunities(generateUpsellOpportunities());
      setRevenueForecast(generateRevenueForecast(data));
      setLifecycleMetrics(generateLifecycleMetrics());
      setLastUpdated(new Date().toISOString());
      setLoading(false);
      onNotice?.('Subscription data refreshed');
    }, 300);
  }, [generateSubscriptionData, generateChurnRisk, generateUpsellOpportunities, generateRevenueForecast, generateLifecycleMetrics, onNotice]);

  const summary = useMemo(() => {
    if (!subscriptionData) return {};
    const criticalChurn = churnRisk.filter(c => c.riskLevel === 'critical').length;
    const highUpsell = upsellOpportunities.filter(o => o.priority === 'high').length;
    return {
      totalSubscriptions: subscriptionData.totalSubscriptions,
      activeSubscriptions: subscriptionData.activeSubscriptions,
      totalMRR: subscriptionData.totalMRR,
      churnRate: subscriptionData.churnRate.toFixed(1),
      netGrowth: subscriptionData.netGrowthRate,
      criticalChurnRisk: criticalChurn,
      highUpsellOpportunities: highUpsell,
      projectedARR: revenueForecast?.scenarios?.realistic?.[11]?.projectedARR || 0,
    };
  }, [subscriptionData, churnRisk, upsellOpportunities, revenueForecast]);

  return {
    subscriptionData,
    churnRisk,
    upsellOpportunities,
    revenueForecast,
    lifecycleMetrics,
    summary,
    loading,
    lastUpdated,
    refresh,
    formatCedi,
  };
}