import { useState, useEffect, useCallback, useMemo } from 'react';

export function useCustomerLifetimeValue({ 
  customers = [], 
  orders = [], 
  payments = [],
  subscriptions = [],
  interactions = [],
  onNotice 
}) {
  const [segments, setSegments] = useState([]);
  const [clvAnalysis, setClvAnalysis] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const analyzeCLV = useCallback(async () => {
    if (!customers.length && !orders.length) {
      setSegments([]);
      setClvAnalysis([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 400));

      const mockCustomers = customers.slice(0, 20).map((c, i) => {
        const customerOrders = orders.filter(o => o.customerId === c.id);
        const totalOrders = customerOrders.length || Math.floor(5 + Math.random() * 50);
        const avgOrderValue = Math.round((50 + Math.random() * 300) * 100) / 100;
        const frequency = Math.round((0.5 + Math.random() * 3) * 10) / 10;
        const tenureMonths = Math.floor(1 + Math.random() * 36);
        const clv = avgOrderValue * frequency * 12 * (1 + tenureMonths / 12);
        const churnProbability = Math.random() * 0.4;
        
        return {
          customerId: c.id || `cust-${i}`,
          customerName: c.name || `Customer ${i + 1}`,
          type: c.type || ['residential', 'commercial', 'industrial'][Math.floor(Math.random() * 3)],
          segment: clv > 50000 ? 'champion' : clv > 20000 ? 'loyal' : clv > 5000 ? 'potential' : 'at_risk',
          totalOrders,
          totalSpent: Math.round(totalOrders * avgOrderValue * 100) / 100,
          avgOrderValue,
          frequency,
          tenureMonths,
          clv: Math.round(clv * 100) / 100,
          predictedCLV: Math.round(clv * (1.1 + Math.random() * 0.3) * 100) / 100,
          churnProbability: Math.round(churnProbability * 100) / 100,
          churnRisk: churnProbability > 0.3 ? 'high' : churnProbability > 0.15 ? 'medium' : 'low',
          lastOrderDate: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString().split('T')[0],
          preferredProducts: ['Bulk Water', 'Express Delivery'].slice(0, Math.floor(1 + Math.random() * 2)),
          paymentReliability: Math.round((0.7 + Math.random() * 0.3) * 100),
          engagementScore: Math.floor(30 + Math.random() * 70)
        };
      });

      const totalRevenue = mockCustomers.reduce((s, c) => s + c.totalSpent, 0);
      mockCustomers.forEach(c => { c.revenueContribution = Math.round((c.totalSpent / totalRevenue) * 10000) / 100; });

      const segmentCounts = {};
      mockCustomers.forEach(c => { segmentCounts[c.segment] = (segmentCounts[c.segment] || 0) + 1; });

      const segmentList = Object.entries(segmentCounts).map(([segment, count]) => ({
        segment,
        count,
        avgCLV: Math.round(mockCustomers.filter(c => c.segment === segment).reduce((s, c) => s + c.clv, 0) / count),
        totalRevenue: Math.round(mockCustomers.filter(c => c.segment === segment).reduce((s, c) => s + c.totalSpent, 0))
      }));

      const retentionRecommendations = mockCustomers
        .filter(c => c.churnRisk === 'high' || c.segment === 'at_risk')
        .slice(0, 10)
        .map(c => ({
          customerId: c.customerId,
          customerName: c.customerName,
          priority: c.churnRisk === 'high' ? 'immediate' : 'soon',
          actions: ['Personal outreach', 'Loyalty discount', 'Service review', 'Contract renewal'].slice(0, 3),
          expectedRetentionGain: Math.round((c.clv * 0.3) * 100) / 100,
          cost: Math.round((c.clv * 0.05) * 100) / 100
        }));

      const summary = {
        totalCustomers: mockCustomers.length,
        avgCLV: Math.round(mockCustomers.reduce((s, c) => s + c.clv, 0) / mockCustomers.length),
        totalCLV: Math.round(mockCustomers.reduce((s, c) => s + c.clv, 0)),
        totalRevenue,
        champions: segmentCounts.champion || 0,
        loyal: segmentCounts.loyal || 0,
        potential: segmentCounts.potential || 0,
        atRisk: segmentCounts.at_risk || 0
      };

      setSegments(segmentList);
      setClvAnalysis(mockCustomers);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [customers, orders, payments, subscriptions, interactions]);

  const getCustomerCLV = useCallback((customerId) => {
    return clvAnalysis.find(c => c.customerId === customerId) || null;
  }, [clvAnalysis]);

  const getHighValueCustomers = useCallback(() => {
    return clvAnalysis.filter(c => c.segment === 'champion' || c.segment === 'loyal');
  }, [clvAnalysis]);

  const getChurnRiskCustomers = useCallback(() => {
    return clvAnalysis.filter(c => c.churnRisk === 'high' || c.churnRisk === 'medium');
  }, [clvAnalysis]);

  const getRetentionRecommendations = useCallback(() => {
    return clvAnalysis
      .filter(c => c.churnRisk === 'high' || c.segment === 'at_risk')
      .slice(0, 10)
      .map(c => ({
        customerId: c.customerId,
        customerName: c.customerName,
        priority: c.churnRisk === 'high' ? 'immediate' : 'soon',
        actions: ['Personal outreach', 'Loyalty discount', 'Service review', 'Contract renewal'].slice(0, 3),
        expectedRetentionGain: Math.round((c.clv * 0.3) * 100) / 100,
        cost: Math.round((c.clv * 0.05) * 100) / 100
      }));
  }, [clvAnalysis]);

  const refresh = useCallback(() => analyzeCLV(), [analyzeCLV]);

  useEffect(() => { analyzeCLV(); }, [analyzeCLV]);

  return {
    segments,
    clvAnalysis,
    loading,
    error,
    refresh,
    getCustomerCLV,
    getHighValueCustomers,
    getChurnRiskCustomers,
    getRetentionRecommendations,
    summary,
    topCustomers: clvAnalysis.sort((a, b) => b.clv - a.clv).slice(0, 10),
    churnRiskCount: clvAnalysis.filter(c => c.churnRisk === 'high').length
  };
}

export default useCustomerLifetimeValue;