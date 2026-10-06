import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, findBy } from '../lib/collections';
import { summarise } from '../lib/summary';

/**
 * Predictive analytics hook: customer churn, LTV, segmentation, and revenue forecasting.
 * 
 * Uses historical order patterns to predict customer behavior and business metrics.
 * All computations run in-browser with no external dependencies.
 */
export function usePredictiveAnalytics({ orders, customers = [], driverPositions = {} }) {
  const [churnAnalysis, setChurnAnalysis] = useState([]);
  const [ltvPredictions, setLtvPredictions] = useState([]);
  const [segments, setSegments] = useState({});
  const [anomalies, setAnomalies] = useState([]);
  const [revenueForecast, setRevenueForecast] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Analyze customer order patterns
  const customerMetrics = useMemo(() => {
    const metrics = new Map();
    
    orders.forEach(order => {
      const customerId = order.customerId || order.phone || order.email || 'anonymous';
      const existing = metrics.get(customerId) || {
        orders: 0,
        totalVolume: 0,
        totalRevenue: 0,
        firstOrder: order.createdAt,
        lastOrder: order.createdAt,
        regions: new Set(),
        avgOrderValue: 0,
        frequency: 0,
      };
      
      existing.orders += 1;
      existing.totalVolume += parseFloat(order.volume?.replace(/[^0-9.]/g, '') || '0');
      existing.totalRevenue += order.chargedMinor || 0;
      existing.lastOrder = order.createdAt > existing.lastOrder ? order.createdAt : existing.lastOrder;
      existing.firstOrder = order.createdAt < existing.firstOrder ? order.createdAt : existing.firstOrder;
      if (order.region) existing.regions.add(order.region);
      
      metrics.set(customerId, existing);
    });
    
    // Calculate derived metrics
    metrics.forEach((m, id) => {
      const daysSinceFirst = (new Date(m.lastOrder) - new Date(m.firstOrder)) / (1000 * 60 * 60 * 24);
      m.avgOrderValue = m.orders > 0 ? m.totalRevenue / m.orders : 0;
      m.frequency = daysSinceFirst > 0 ? m.orders / (daysSinceFirst / 30) : m.orders; // orders per month
      m.daysSinceLastOrder = (Date.now() - new Date(m.lastOrder).getTime()) / (1000 * 60 * 60 * 24);
      m.regions = Array.from(m.regions);
    });
    
    return Array.from(metrics.entries()).map(([id, data]) => ({ customerId: id, ...data }));
  }, [orders]);

  // Segment customers
  const calculateSegments = useCallback(() => {
    const segmentCounts = {
      vip: 0,
      loyal: 0,
      regular: 0,
      at_risk: 0,
      churned: 0,
      new: 0,
    };
    
    const predictions = customerMetrics.map(m => {
      let segment = 'new';
      if (m.orders >= 10 && m.frequency >= 2 && m.daysSinceLastOrder < 30) segment = 'vip';
      else if (m.orders >= 5 && m.frequency >= 1 && m.daysSinceLastOrder < 45) segment = 'loyal';
      else if (m.orders >= 3 && m.daysSinceLastOrder < 60) segment = 'regular';
      else if (m.daysSinceLastOrder >= 60 && m.daysSinceLastOrder < 120) segment = 'at_risk';
      else if (m.daysSinceLastOrder >= 120) segment = 'churned';
      else segment = 'new';
      
      segmentCounts[segment] = (segmentCounts[segment] || 0) + 1;
      return { customerId: m.customerId, segment, ...m };
    });
    
    setSegments(segmentCounts);
    return predictions;
  }, [customerMetrics]);

  // Predict churn probability
  const calculateChurnAnalysis = useCallback(() => {
    const analysis = customerMetrics
      .filter(m => m.orders > 0)
      .map(m => {
        // Simple churn model based on recency, frequency, monetary
        const recencyScore = Math.max(0, 1 - m.daysSinceLastOrder / 180);
        const frequencyScore = Math.min(1, m.frequency / 4);
        const monetaryScore = Math.min(1, m.avgOrderValue / 50000); // 500 GHS in minor units
        
        const healthScore = (recencyScore * 0.5 + frequencyScore * 0.3 + monetaryScore * 0.2);
        const churnProbability = Math.round((1 - healthScore) * 100);
        
        return {
          customerId: m.customerId,
          churnProbability,
          healthScore: Math.round(healthScore * 100),
          daysSinceLastOrder: Math.round(m.daysSinceLastOrder),
          recommendedAction: churnProbability > 70 ? 'Urgent outreach needed' :
                           churnProbability > 40 ? 'Send re-engagement offer' : 'Monitor',
        };
      })
      .sort((a, b) => b.churnProbability - a.churnProbability);
    
    setChurnAnalysis(analysis);
    return analysis;
  }, [customerMetrics]);

  // Predict LTV
  const calculateLTV = useCallback(() => {
    const predictions = customerMetrics
      .filter(m => m.orders > 0)
      .map(m => {
        // Simple LTV = avg order value * frequency * expected lifetime (months)
        const expectedLifetimeMonths = m.segment === 'vip' ? 24 : m.segment === 'loyal' ? 18 : m.segment === 'regular' ? 12 : 6;
        const predictedLTV = m.avgOrderValue * m.frequency * expectedLifetimeMonths;
        
        return {
          customerId: m.customerId,
          predictedLTV: Math.round(predictedLTV),
          currentLTV: Math.round(m.totalRevenue),
          avgOrderValue: Math.round(m.avgOrderValue),
          monthlyValue: Math.round(m.avgOrderValue * m.frequency),
        };
      })
      .sort((a, b) => b.predictedLTV - a.predictedLTV);
    
    setLtvPredictions(predictions);
    return predictions;
  }, [customerMetrics]);

  // Detect anomalies in order patterns
  const detectAnomalies = useCallback(() => {
    if (orders.length < 20) return [];
    
    const dailyRevenue = new Map();
    orders.forEach(o => {
      const day = new Date(o.createdAt).toISOString().split('T')[0];
      dailyRevenue.set(day, (dailyRevenue.get(day) || 0) + (o.chargedMinor || 0));
    });
    
    const revenues = Array.from(dailyRevenue.values());
    const mean = revenues.reduce((a, b) => a + b, 0) / revenues.length;
    const stdDev = Math.sqrt(revenues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / revenues.length);
    
    const detected = Array.from(dailyRevenue.entries())
      .map(([date, revenue]) => ({ date, revenue }))
      .filter(d => Math.abs(d.revenue - mean) > 2.5 * stdDev)
      .map(d => ({
        date: d.date,
        type: d.revenue > mean ? 'revenue_spike' : 'revenue_drop',
        actualValue: d.revenue,
        expectedRange: `${Math.round(mean - 2*stdDev)} - ${Math.round(mean + 2*stdDev)}`,
        severity: Math.abs(d.revenue - mean) > 3 * stdDev ? 'critical' : 'warning',
        description: d.revenue > mean ? 'Unusually high revenue day' : 'Unusually low revenue day',
      }));
    
    setAnomalies(detected);
    return detected;
  }, [orders]);

  // Forecast revenue for next 30 days
  const forecastRevenue = useCallback(() => {
    if (orders.length < 10) return [];
    
    const dailyData = new Map();
    orders.forEach(o => {
      const day = new Date(o.createdAt).toISOString().split('T')[0];
      const existing = dailyData.get(day) || { orders: 0, revenue: 0 };
      existing.orders += 1;
      existing.revenue += o.chargedMinor || 0;
      dailyData.set(day, existing);
    });
    
    const sortedDays = Array.from(dailyData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30); // Last 30 days
    
    const avgDailyRevenue = sortedDays.reduce((s, [, d]) => s + d.revenue, 0) / sortedDays.length;
    const avgDailyOrders = sortedDays.reduce((s, [, d]) => s + d.orders, 0) / sortedDays.length;
    
    // Simple trend
    const recent = sortedDays.slice(-7);
    const older = sortedDays.slice(-14, -7);
    const recentAvg = recent.reduce((s, [, d]) => s + d.revenue, 0) / (recent.length || 1);
    const olderAvg = older.reduce((s, [, d]) => s + d.revenue, 0) / (older.length || 1);
    const trendFactor = olderAvg > 0 ? recentAvg / olderAvg : 1;
    
    const forecast = [];
    for (let i = 1; i <= 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const seasonalFactor = 1 + 0.1 * Math.sin((i / 30) * 2 * Math.PI); // Simple seasonality
      const predictedRevenue = Math.round(avgDailyRevenue * trendFactor * seasonalFactor);
      const predictedOrders = Math.round(avgDailyOrders * trendFactor * seasonalFactor);
      
      forecast.push({
        date: date.toISOString().split('T')[0],
        predictedRevenue,
        predictedOrders,
        lowerBound: Math.round(predictedRevenue * 0.7),
        upperBound: Math.round(predictedRevenue * 1.3),
      });
    }
    
    setRevenueForecast(forecast);
    return forecast;
  }, [orders]);

  // Main computation
  const refresh = useCallback(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      calculateSegments();
      calculateChurnAnalysis();
      calculateLTV();
      detectAnomalies();
      forecastRevenue();
      setLastUpdated(new Date().toISOString());
      setLoading(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [calculateSegments, calculateChurnAnalysis, calculateLTV, detectAnomalies, forecastRevenue]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const summary = useMemo(() => ({
    totalCustomers: customerMetrics.length,
    atRiskCustomers: churnAnalysis.filter(c => c.churnProbability > 40).length,
    vipCustomers: segments.vip || 0,
    totalPredictedLTV: ltvPredictions.reduce((s, p) => s + p.predictedLTV, 0),
    criticalAnomalies: anomalies.filter(a => a.severity === 'critical').length,
    revenueForecast30d: revenueForecast.reduce((s, f) => s + f.predictedRevenue, 0),
  }), [customerMetrics, churnAnalysis, segments, ltvPredictions, anomalies, revenueForecast]);

  return {
    churnAnalysis,
    ltvPredictions,
    segments,
    anomalies,
    revenueForecast,
    summary,
    loading,
    lastUpdated,
    refresh,
    refreshAnalytics: refresh,
  };
}

export default usePredictiveAnalytics;