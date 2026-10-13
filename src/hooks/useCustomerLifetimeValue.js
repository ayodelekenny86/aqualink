import { useState, useEffect, useCallback, useMemo } from 'react';

export function useCustomerLifetimeValue({ 
  customers = [], 
  orders = [], 
  payments = [],
  ratings = [],
  subscriptions = [],
  churnPredictions = [],
  onNotice 
}) {
  const [clvAnalysis, setClvAnalysis] = useState(null);
  const [segments, setSegments] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const calculateCLV = useCallback(async () => {
    if (!customers.length || !orders.length) {
      setClvAnalysis({ customers: [], summary: {} });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 450));

      const customerCLV = customers.map(customer => {
        const customerOrders = orders.filter(o => o.customerId === customer.id);
        const customerPayments = payments.filter(p => p.customerId === customer.id);
        const customerRatings = ratings.filter(r => r.customerId === customer.id);
        const customerSubscription = subscriptions.find(s => s.customerId === customer.id);
        const churnPrediction = churnPredictions.find(c => c.customerId === customer.id);

        const totalOrders = customerOrders.length;
        const completedOrders = customerOrders.filter(o => o.status === 'Delivered').length;
        const cancelledOrders = customerOrders.filter(o => o.status === 'Cancelled').length;
        const totalRevenue = customerPayments
          .filter(p => p.status === 'completed')
          .reduce((sum, p) => sum + (p.amount || 0), 0);
        const avgOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0;
        const avgOrderVolume = completedOrders > 0 
          ? customerOrders.filter(o => o.status === 'Delivered').reduce((sum, o) => sum + (o.volume || 0), 0) / completedOrders 
          : 0;

        const firstOrderDate = customerOrders.length 
          ? new Date(Math.min(...customerOrders.map(o => new Date(o.date).getTime()))) 
          : new Date(customer.createdAt || Date.now());
        const lastOrderDate = customerOrders.length 
          ? new Date(Math.max(...customerOrders.map(o => new Date(o.date).getTime()))) 
          : null;
        const customerAgeDays = (Date.now() - firstOrderDate.getTime()) / (1000 * 60 * 60 * 24);
        const daysSinceLastOrder = lastOrderDate ? (Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24) : customerAgeDays;

        const orderFrequency = customerAgeDays > 0 ? (completedOrders / customerAgeDays) * 30 : 0;
        const avgRating = customerRatings.length 
          ? customerRatings.reduce((sum, r) => sum + (r.rating || 0), 0) / customerRatings.length 
          : 3.5;

        const hasSubscription = !!customerSubscription;
        const subscriptionValue = hasSubscription ? (customerSubscription.monthlyValue || 0) * 12 : 0;
        const subscriptionMonthsRemaining = hasSubscription ? (customerSubscription.monthsRemaining || 12) : 0;

        const churnRisk = churnPrediction?.riskLevel || 
          (daysSinceLastOrder > 90 ? 'high' : daysSinceLastOrder > 60 ? 'medium' : 'low');
        const churnProbability = churnPrediction?.probability || 
          (churnRisk === 'high' ? 0.7 : churnRisk === 'medium' ? 0.3 : 0.1);

        const grossMargin = 0.35;
        const discountRate = 0.1;
        const projectedLifespanMonths = churnProbability > 0 ? (1 / churnProbability) * 12 : 36;
        const monthlyRevenue = orderFrequency * avgOrderValue + (hasSubscription ? customerSubscription.monthlyValue || 0 : 0);
        const monthlyProfit = monthlyRevenue * grossMargin;

        const historicalCLV = totalRevenue * grossMargin;
        const projectedCLV = monthlyProfit * (1 - Math.pow(1 / (1 + discountRate / 12), projectedLifespanMonths)) / (discountRate / 12);
        const totalCLV = historicalCLV + projectedCLV;

        const segment = determineSegment(totalCLV, orderFrequency, avgRating, hasSubscription, churnRisk);

        const upsellOpportunities = identifyUpsellOpportunities({
          customer,
          segment,
          avgOrderVolume,
          hasSubscription,
          orderFrequency,
          totalRevenue
        });

        const retentionActions = generateRetentionActions({
          segment,
          churnRisk,
          daysSinceLastOrder,
          avgRating,
          hasSubscription
        });

        return {
          customerId: customer.id,
          customerName: customer.name,
          email: customer.email,
          phone: customer.phone,
          segment,
          churnRisk,
          churnProbability: Math.round(churnProbability * 100),
          metrics: {
            totalOrders,
            completedOrders,
            cancelledOrders,
            cancellationRate: totalOrders > 0 ? Math.round((cancelledOrders / totalOrders) * 100) : 0,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            avgOrderValue: Math.round(avgOrderValue * 100) / 100,
            avgOrderVolume: Math.round(avgOrderVolume),
            orderFrequency: Math.round(orderFrequency * 10) / 10,
            avgRating: Math.round(avgRating * 10) / 10,
            customerAgeDays: Math.round(customerAgeDays),
            daysSinceLastOrder: Math.round(daysSinceLastOrder)
          },
          subscription: hasSubscription ? {
            plan: customerSubscription.plan,
            monthlyValue: customerSubscription.monthlyValue,
            monthsRemaining: subscriptionMonthsRemaining,
            annualValue: subscriptionValue
          } : null,
          clv: {
            historical: Math.round(historicalCLV * 100) / 100,
            projected: Math.round(projectedCLV * 100) / 100,
            total: Math.round(totalCLV * 100) / 100,
            projectedLifespanMonths: Math.round(projectedLifespanMonths),
            monthlyProfit: Math.round(monthlyProfit * 100) / 100
          },
          upsellOpportunities,
          retentionActions,
          lastAnalyzed: new Date().toISOString()
        };
      });

      const segmentGroups = groupBySegment(customerCLV);
      const segmentSummary = Object.entries(segmentGroups).map(([segment, customers]) => ({
        segment,
        count: customers.length,
        percentage: Math.round((customers.length / customerCLV.length) * 100),
        avgCLV: Math.round(customers.reduce((sum, c) => sum + c.clv.total, 0) / customers.length),
        totalCLV: Math.round(customers.reduce((sum, c) => sum + c.clv.total, 0)),
        avgOrderFrequency: Math.round(customers.reduce((sum, c) => sum + c.metrics.orderFrequency, 0) / customers.length * 10) / 10,
        churnRate: Math.round(customers.filter(c => c.churnRisk === 'high').length / customers.length * 100)
      }));

      const globalRecommendations = generateGlobalRecommendations(customerCLV, segmentSummary);

      const summary = {
        totalCustomers: customers.length,
        totalHistoricalCLV: Math.round(customerCLV.reduce((sum, c) => sum + c.clv.historical, 0) * 100) / 100,
        totalProjectedCLV: Math.round(customerCLV.reduce((sum, c) => sum + c.clv.projected, 0) * 100) / 100,
        totalCLV: Math.round(customerCLV.reduce((sum, c) => sum + c.clv.total, 0) * 100) / 100,
        avgCLV: Math.round(customerCLV.reduce((sum, c) => sum + c.clv.total, 0) / customerCLV.length * 100) / 100,
        highValueCustomers: customerCLV.filter(c => c.segment === 'champion' || c.segment === 'loyal').length,
        atRiskCustomers: customerCLV.filter(c => c.churnRisk === 'high').length,
        subscriptionCustomers: customerCLV.filter(c => c.subscription).length,
        subscriptionRevenue: Math.round(customerCLV.filter(c => c.subscription).reduce((sum, c) => sum + (c.subscription?.annualValue || 0), 0) * 100) / 100
      };

      setClvAnalysis({ customers: customerCLV, summary });
      setSegments(segmentSummary);
      setRecommendations(globalRecommendations);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [customers, orders, payments, ratings, subscriptions, churnPredictions]);

  const determineSegment = (clv, frequency, rating, hasSubscription, churnRisk) => {
    if (clv > 5000 && frequency > 4 && rating >= 4.5) return 'champion';
    if (clv > 2000 && frequency > 2 && rating >= 4) return 'loyal';
    if (clv > 1000 && frequency > 1) return 'potential';
    if (hasSubscription && frequency > 0.5) return 'subscriber';
    if (churnRisk === 'high' || frequency < 0.5) return 'at_risk';
    if (customerAgeDays < 30) return 'new';
    return 'dormant';
  };

  const identifyUpsellOpportunities = ({ segment, avgOrderVolume, hasSubscription, orderFrequency, totalRevenue }) => {
    const opportunities = [];
    if (!hasSubscription && orderFrequency > 2) {
      opportunities.push({ type: 'subscription', value: avgOrderVolume * 30 * 0.02 * 12, description: 'Convert to monthly subscription plan' });
    }
    if (avgOrderVolume < 5000 && segment !== 'at_risk') {
      opportunities.push({ type: 'volume_increase', value: (5000 - avgOrderVolume) * 0.02 * orderFrequency * 12, description: 'Increase order volume to 5000+ gallons' });
    }
    if (segment === 'potential' || segment === 'loyal') {
      opportunities.push({ type: 'premium_upgrade', value: totalRevenue * 0.15, description: 'Premium water quality tier upgrade' });
    }
    return opportunities;
  };

  const generateRetentionActions = ({ segment, churnRisk, daysSinceLastOrder, avgRating, hasSubscription }) => {
    const actions = [];
    if (churnRisk === 'high') {
      actions.push('Immediate win-back call with 20% discount offer');
      actions.push('Free water quality test at their location');
      if (!hasSubscription) actions.push('Offer 3-month free subscription trial');
    } else if (churnRisk === 'medium') {
      actions.push('Proactive check-in call within 2 weeks');
      actions.push('Personalized volume discount for next 3 orders');
    } else if (segment === 'new') {
      actions.push('Welcome call and onboarding support');
      actions.push('First-order satisfaction survey');
    } else if (segment === 'dormant') {
      actions.push('Re-engagement campaign with special offer');
      actions.push('Referral bonus for next order');
    }
    if (avgRating < 3.5) actions.unshift('Address quality concerns from recent ratings');
    return actions;
  };

  const groupBySegment = (customers) => {
    return customers.reduce((acc, c) => {
      if (!acc[c.segment]) acc[c.segment] = [];
      acc[c.segment].push(c);
      return acc;
    }, {});
  };

  const generateGlobalRecommendations = (customers, segments) => {
    const recs = [];
    const atRiskCount = customers.filter(c => c.churnRisk === 'high').length;
    if (atRiskCount > customers.length * 0.15) {
      recs.push({ priority: 'critical', title: 'High Churn Risk', description: `${atRiskCount} customers at high churn risk`, action: 'Launch retention campaign' });
    }
    const subscriberSegment = segments.find(s => s.segment === 'subscriber');
    if (subscriberSegment && subscriberSegment.count < customers.length * 0.2) {
      recs.push({ priority: 'high', title: 'Low Subscription Rate', description: `Only ${subscriberSegment.percentage}% on subscriptions`, action: 'Promote subscription benefits' });
    }
    const championSegment = segments.find(s => s.segment === 'champion');
    if (championSegment && championSegment.count < customers.length * 0.1) {
      recs.push({ priority: 'medium', title: 'Few Champions', description: `Only ${championSegment.percentage}% are champions`, action: 'Implement loyalty program' });
    }
    return recs;
  };

  const getCustomerCLV = useCallback((customerId) => {
    return clvAnalysis?.customers?.find(c => c.customerId === customerId) || null;
  }, [clvAnalysis]);

  const getSegmentCustomers = useCallback((segment) => {
    return clvAnalysis?.customers?.filter(c => c.segment === segment) || [];
  }, [clvAnalysis]);

  const getTopCustomers = useCallback((limit = 10) => {
    return clvAnalysis?.customers?.sort((a, b) => b.clv.total - a.clv.total).slice(0, limit) || [];
  }, [clvAnalysis]);

  useEffect(() => { calculateCLV(); }, [calculateCLV]);

  return {
    clvAnalysis,
    segments,
    recommendations,
    loading,
    error,
    refresh: calculateCLV,
    getCustomerCLV,
    getSegmentCustomers,
    getTopCustomers,
    summary: clvAnalysis?.summary || {},
    totalCLV: clvAnalysis?.summary?.totalCLV || 0,
    avgCLV: clvAnalysis?.summary?.avgCLV || 0
  };
}

export default useCustomerLifetimeValue;