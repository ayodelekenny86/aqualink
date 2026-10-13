import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatCedi } from '../lib/money';

const STORAGE_KEY = 'customer_intelligence';

function calculateRecency(lastOrderDate) {
  if (!lastOrderDate) return 999;
  const diff = Date.now() - new Date(lastOrderDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function calculateFrequency(orders) {
  return orders.length;
}

function calculateMonetary(orders) {
  return orders.reduce((sum, o) => sum + (o.chargedMinor || 0), 0);
}

function calculateRFMScore(recency, frequency, monetary) {
  const rScore = recency <= 7 ? 5 : recency <= 14 ? 4 : recency <= 30 ? 3 : recency <= 60 ? 2 : 1;
  const fScore = frequency >= 10 ? 5 : frequency >= 5 ? 4 : frequency >= 3 ? 3 : frequency >= 2 ? 2 : 1;
  const mScore = monetary >= 50000 ? 5 : monetary >= 20000 ? 4 : monetary >= 10000 ? 3 : monetary >= 5000 ? 2 : 1;
  
  return { rScore, fScore, mScore, total: rScore + fScore + mScore };
}

function segmentCustomer(rfm) {
  if (rfm.total >= 13) return 'champion';
  if (rfm.total >= 10) return 'loyal';
  if (rfm.rScore >= 4 && rfm.fScore >= 3) return 'potential_loyalist';
  if (rfm.rScore >= 3 && rfm.fScore >= 4) return 'recent_customer';
  if (rfm.rScore >= 4 && rfm.fScore <= 2) return 'new_customer';
  if (rfm.rScore <= 2 && rfm.fScore >= 3) return 'at_risk';
  if (rfm.rScore <= 2 && rfm.fScore <= 2 && rfm.mScore >= 3) return 'cannot_lose';
  if (rfm.rScore <= 2 && rfm.fScore <= 2) return 'hibernating';
  return 'promising';
}

function predictChurn(customer, orders, allCustomers) {
  const daysSinceLastOrder = calculateRecency(customer.lastOrderDate);
  const avgOrderInterval = customer.frequency > 1 
    ? (Date.now() - new Date(customer.firstOrderDate).getTime()) / (1000 * 60 * 60 * 24) / (customer.frequency - 1)
    : 999;
  const expectedNextOrder = customer.lastOrderDate 
    ? new Date(new Date(customer.lastOrderDate).getTime() + avgOrderInterval * 24 * 60 * 60 * 1000)
    : null;
  const isOverdue = expectedNextOrder && expectedNextOrder < new Date();
  const daysOverdue = isOverdue ? Math.floor((Date.now() - expectedNextOrder.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  
  const avgMonetary = customer.monetary / Math.max(1, customer.frequency);
  const monetaryTrend = orders.length >= 3 
    ? (orders.slice(-3).reduce((s, o) => s + (o.chargedMinor || 0), 0) / 3) / avgMonetary 
    : 1;
  
  let churnRisk = 0;
  if (daysSinceLastOrder > 60) churnRisk += 0.4;
  else if (daysSinceLastOrder > 30) churnRisk += 0.2;
  else if (daysSinceLastOrder > 14) churnRisk += 0.1;
  
  if (isOverdue) churnRisk += Math.min(0.3, daysOverdue * 0.02);
  if (monetaryTrend < 0.7) churnRisk += 0.2;
  if (customer.frequency === 1 && daysSinceLastOrder > 30) churnRisk += 0.3;
  
  const avgRecency = allCustomers.reduce((s, c) => s + calculateRecency(c.lastOrderDate), 0) / allCustomers.length;
  if (daysSinceLastOrder > avgRecency * 2) churnRisk += 0.1;
  
  return {
    riskScore: Math.min(1, churnRisk),
    riskLevel: churnRisk > 0.7 ? 'high' : churnRisk > 0.4 ? 'medium' : churnRisk > 0.2 ? 'low' : 'minimal',
    daysSinceLastOrder,
    daysOverdue,
    expectedNextOrder: expectedNextOrder?.toISOString().split('T')[0],
    avgOrderInterval: Math.round(avgOrderInterval),
    monetaryTrend: Math.round(monetaryTrend * 100) / 100,
    recommendedAction: churnRisk > 0.7 ? 'Immediate retention campaign' : 
                      churnRisk > 0.4 ? 'Proactive outreach' : 
                      churnRisk > 0.2 ? 'Monitor closely' : 'Standard engagement',
  };
}

function calculateLTV(customer, avgOrderValue, avgLifespanMonths = 12, discountRate = 0.1) {
  const monthlyRevenue = (customer.monetary / Math.max(1, customer.frequency)) * (12 / Math.max(1, avgLifespanMonths));
  const ltv = monthlyRevenue * avgLifespanMonths * (1 - discountRate);
  return Math.round(ltv);
}

function detectAnomalies(customers) {
  const anomalies = [];
  
  const avgFrequency = customers.reduce((s, c) => s + c.frequency, 0) / customers.length;
  const avgMonetary = customers.reduce((s, c) => s + c.monetary, 0) / customers.length;
  const avgRecency = customers.reduce((s, c) => s + calculateRecency(c.lastOrderDate), 0) / customers.length;
  
  customers.forEach(c => {
    if (c.frequency > avgFrequency * 3) {
      anomalies.push({
        type: 'high_frequency',
        customerId: c.id,
        customerName: c.name,
        description: `${c.name} orders ${c.frequency}x (avg: ${Math.round(avgFrequency)})`,
        severity: 'info',
        detectedAt: new Date().toISOString(),
      });
    }
    
    if (c.monetary > avgMonetary * 3) {
      anomalies.push({
        type: 'high_value',
        customerId: c.id,
        customerName: c.name,
        description: `${c.name} spent ${formatCedi(c.monetary)} (avg: ${formatCedi(Math.round(avgMonetary))})`,
        severity: 'info',
        detectedAt: new Date().toISOString(),
      });
    }
    
    const recency = calculateRecency(c.lastOrderDate);
    if (recency > avgRecency * 3 && c.frequency > 2) {
      anomalies.push({
        type: 'sudden_churn',
        customerId: c.id,
        customerName: c.name,
        description: `${c.name} inactive for ${recency}d after ${c.frequency} orders`,
        severity: 'critical',
        detectedAt: new Date().toISOString(),
      });
    }
    
    if (c.monetary > 0 && c.frequency > 3) {
      const recentOrders = c.recentOrders || [];
      const recentAvg = recentOrders.slice(-3).reduce((s, o) => s + (o.chargedMinor || 0), 0) / 3;
      const historicalAvg = c.monetary / c.frequency;
      if (recentAvg < historicalAvg * 0.5) {
        anomalies.push({
          type: 'spending_drop',
          customerId: c.id,
          customerName: c.name,
          description: `${c.name} spending dropped 50%+ recently`,
          severity: 'warning',
          detectedAt: new Date().toISOString(),
        });
      }
    }
  });
  
  return anomalies;
}

export function useCustomerIntelligence({ 
  orders = [], 
  customers = [], 
  driverPositions = {},
  onNotice 
}) {
  const [customerProfiles, setCustomerProfiles] = useState(() => list(STORAGE_KEY));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = list(STORAGE_KEY);
    if (saved.length === 0 && orders.length > 0) {
      const buyerOrders = orders.filter(o => o.buyerId);
      const buyerMap = new Map();
      
      buyerOrders.forEach(order => {
        const id = order.buyerId;
        if (!buyerMap.has(id)) {
          buyerMap.set(id, {
            id,
            name: order.buyerName || `Customer ${id.slice(-6)}`,
            email: order.receiptEmail,
            phone: order.whatsapp || order.buyerPhone,
            orders: [],
            firstOrderDate: order.date,
            lastOrderDate: order.date,
            totalSpent: 0,
            totalVolume: 0,
            avgOrderValue: 0,
            frequency: 0,
            recency: 0,
            segment: 'new',
            churnRisk: 'minimal',
            ltv: 0,
          });
        }
        const profile = buyerMap.get(id);
        profile.orders.push(order);
        profile.totalSpent += order.chargedMinor || 0;
        profile.totalVolume += parseInt(order.volume?.replace(/[^\d]/g, '')) || 0;
        if (new Date(order.date) < new Date(profile.firstOrderDate)) profile.firstOrderDate = order.date;
        if (new Date(order.date) > new Date(profile.lastOrderDate)) profile.lastOrderDate = order.date;
      });
      
      const profiles = Array.from(buyerMap.values()).map(p => ({
        ...p,
        frequency: p.orders.length,
        avgOrderValue: Math.round(p.totalSpent / Math.max(1, p.orders.length)),
        recency: calculateRecency(p.lastOrderDate),
      }));
      
      replaceAll(STORAGE_KEY, profiles);
      setCustomerProfiles(profiles);
    } else if (saved.length > 0) {
      setCustomerProfiles(saved);
    }
  }, [orders]);

  useEffect(() => {
    if (customerProfiles.length === 0) return;
    
    const updated = customerProfiles.map(profile => {
      const customerOrders = orders.filter(o => o.buyerId === profile.id);
      const totalSpent = customerOrders.reduce((s, o) => s + (o.chargedMinor || 0), 0);
      const frequency = customerOrders.length;
      const lastOrder = customerOrders.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      
      return {
        ...profile,
        orders: customerOrders,
        totalSpent,
        frequency,
        avgOrderValue: frequency > 0 ? Math.round(totalSpent / frequency) : 0,
        lastOrderDate: lastOrder?.date || profile.lastOrderDate,
        recency: calculateRecency(lastOrder?.date || profile.lastOrderDate),
      };
    });
    
    setCustomerProfiles(updated);
    replaceAll(STORAGE_KEY, updated);
  }, [orders, customerProfiles]);

  const enrichedCustomers = useMemo(() => {
    return customerProfiles.map(profile => {
      const rfm = calculateRFMScore(profile.recency, profile.frequency, profile.totalSpent);
      const segment = segmentCustomer(rfm);
      const churn = predictChurn(profile, profile.orders, customerProfiles);
      const ltv = calculateLTV(profile, profile.avgOrderValue);
      
      return {
        ...profile,
        rfm,
        segment,
        churn,
        ltv,
        predictedNextOrder: churn.expectedNextOrder,
        healthScore: Math.max(0, 100 - churn.riskScore * 100),
      };
    });
  }, [customerProfiles, orders]);

  const segments = useMemo(() => {
    const counts = {};
    enrichedCustomers.forEach(c => {
      counts[c.segment] = (counts[c.segment] || 0) + 1;
    });
    return counts;
  }, [enrichedCustomers]);

  const churnAnalysis = useMemo(() => {
    return enrichedCustomers
      .filter(c => c.churn.riskLevel === 'high' || c.churn.riskLevel === 'medium')
      .sort((a, b) => b.churn.riskScore - a.churn.riskScore)
      .map(c => ({
        customerId: c.id,
        customerName: c.name,
        riskLevel: c.churn.riskLevel,
        riskScore: Math.round(c.churn.riskScore * 100),
        daysSinceLastOrder: c.churn.daysSinceLastOrder,
        daysOverdue: c.churn.daysOverdue,
        totalSpent: formatCedi(c.totalSpent),
        ltv: formatCedi(c.ltv),
        segment: c.segment,
        recommendedAction: c.churn.recommendedAction,
        predictedNextOrder: c.churn.expectedNextOrder,
      }));
  }, [enrichedCustomers]);

  const ltvPredictions = useMemo(() => {
    return enrichedCustomers
      .filter(c => c.ltv > 0)
      .sort((a, b) => b.ltv - a.ltv)
      .slice(0, 20)
      .map(c => ({
        customerId: c.id,
        customerName: c.name,
        ltv: formatCedi(c.ltv),
        totalSpent: formatCedi(c.totalSpent),
        frequency: c.frequency,
        avgOrderValue: formatCedi(c.avgOrderValue),
        segment: c.segment,
        healthScore: c.healthScore,
      }));
  }, [enrichedCustomers]);

  const anomalies = useMemo(() => detectAnomalies(enrichedCustomers), [enrichedCustomers]);

  const revenueForecast = useMemo(() => {
    const activeCustomers = enrichedCustomers.filter(c => c.churn.riskLevel !== 'high');
    const next30Days = activeCustomers.reduce((sum, c) => {
      const expectedOrders = Math.max(0, 30 / Math.max(1, c.churn.avgOrderInterval || 30));
      return sum + expectedOrders * c.avgOrderValue;
    }, 0);
    return Math.round(next30Days);
  }, [enrichedCustomers]);

  const summary = {
    totalCustomers: enrichedCustomers.length,
    atRiskCustomers: enrichedCustomers.filter(c => c.churn.riskLevel === 'high' || c.churn.riskLevel === 'medium').length,
    vipCustomers: enrichedCustomers.filter(c => c.segment === 'champion' || c.segment === 'loyal').length,
    newCustomers: enrichedCustomers.filter(c => c.segment === 'new_customer').length,
    totalPredictedLTV: enrichedCustomers.reduce((s, c) => s + c.ltv, 0) / 100,
    revenueForecast30d: revenueForecast / 100,
    criticalAnomalies: anomalies.filter(a => a.severity === 'critical').length,
    avgHealthScore: Math.round(enrichedCustomers.reduce((s, c) => s + c.healthScore, 0) / Math.max(1, enrichedCustomers.length)),
    segmentDistribution: segments,
  };

  const refresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => setLoading(false), 500);
  }, []);

  return {
    customers: enrichedCustomers,
    churnAnalysis,
    ltvPredictions,
    segments,
    anomalies,
    revenueForecast,
    summary,
    loading,
    refresh,
  };
}

export default useCustomerIntelligence;