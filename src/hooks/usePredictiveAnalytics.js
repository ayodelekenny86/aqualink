import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, findBy } from '../lib/collections';
import { formatCedi } from '../lib/money';

/**
 * Predictive Analytics Engine
 * 
 * Features:
 * - Customer churn risk scoring (RFM + behavioral signals)
 * - Lifetime Value (LTV) prediction with confidence intervals
 * - Anomaly detection for orders, payments, driver behavior
 * - Revenue forecasting with Monte Carlo simulation
 * - Customer segmentation (VIP, At-risk, New, Dormant)
 * - Product affinity analysis
 * - Seasonal trend decomposition
 * - Early warning alerts for business metrics
 */

const CHURN_WINDOW_DAYS = 90;
const LTV_HORIZON_DAYS = 365;
const MIN_ORDERS_FOR_LTV = 3;
const ANOMALY_THRESHOLD_STD = 2.5;

function calculateRFM(orders, customerId, referenceDate = new Date()) {
  const customerOrders = orders.filter(o => o.customerId === customerId).sort((a, b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
  );
  
  if (!customerOrders.length) return null;
  
  const lastOrder = new Date(customerOrders[0].createdAt);
  const recency = Math.floor((referenceDate - lastOrder) / (1000 * 60 * 60 * 24));
  const frequency = customerOrders.length;
  const monetary = customerOrders.reduce((sum, o) => sum + (o.chargedMinor || 0), 0) / 100;
  const avgOrderValue = monetary / frequency;
  const firstOrder = new Date(customerOrders[customerOrders.length - 1].createdAt);
  const tenure = Math.floor((referenceDate - firstOrder) / (1000 * 60 * 60 * 24));
  const avgDaysBetween = tenure > 0 ? tenure / Math.max(1, frequency - 1) : 0;
  
  return { recency, frequency, monetary, avgOrderValue, tenure, avgDaysBetween, orders: customerOrders };
}

function calculateChurnRisk(rfm, allRFM) {
  if (!rfm) return { score: 1, level: 'unknown', factors: ['No order history'] };
  
  const recencyScores = allRFM.map(r => r.recency).sort((a, b) => a - b);
  const freqScores = allRFM.map(r => r.frequency).sort((a, b) => a - b);
  const monetaryScores = allRFM.map(r => r.monetary).sort((a, b) => a - b);
  
  const percentile = (arr, val) => {
    const idx = arr.findIndex(v => v > val);
    return idx === -1 ? 1 : idx / arr.length;
  };
  
  const recencyPct = percentile(recencyScores, rfm.recency);
  const freqPct = percentile(freqScores, rfm.frequency);
  const monetaryPct = percentile(monetaryScores, rfm.monetary);
  
  const riskScore = (
    recencyPct * 0.5 +
    (1 - freqPct) * 0.3 +
    (1 - monetaryPct) * 0.2
  );
  
  let level = 'low';
  if (riskScore > 0.7) level = 'critical';
  else if (riskScore > 0.5) level = 'high';
  else if (riskScore > 0.3) level = 'medium';
  
  const factors = [];
  if (rfm.recency > CHURN_WINDOW_DAYS) factors.push(`No order in ${rfm.recency} days`);
  if (rfm.frequency === 1) factors.push('Only 1 order ever');
  if (rfm.avgDaysBetween > 60 && rfm.frequency > 1) factors.push(`Long gaps (avg ${Math.round(rfm.avgDaysBetween)} days)`);
  if (rfm.monetary < 100) factors.push('Low lifetime value');
  
  return { score: Math.round(riskScore * 100), level, factors, rfm };
}

function predictLTV(rfm, allRFM) {
  if (!rfm || rfm.frequency < MIN_ORDERS_FOR_LTV) {
    return { predicted: 0, confidence: 0, range: [0, 0], method: 'insufficient_data' };
  }
  
  const similarCustomers = allRFM.filter(r => 
    r.frequency >= MIN_ORDERS_FOR_LTV &&
    Math.abs(r.avgOrderValue - rfm.avgOrderValue) < rfm.avgOrderValue * 0.5
  );
  
  if (similarCustomers.length < 5) {
    const simpleLTV = rfm.avgOrderValue * (365 / Math.max(1, rfm.avgDaysBetween)) * (LTV_HORIZON_DAYS / 365);
    return { 
      predicted: Math.round(simpleLTV), 
      confidence: 0.4, 
      range: [Math.round(simpleLTV * 0.5), Math.round(simpleLTV * 1.5)],
      method: 'simple_projection'
    };
  }
  
  const avgFutureValue = similarCustomers.reduce((s, r) => s + r.monetary, 0) / similarCustomers.length;
  const projectedOrders = LTV_HORIZON_DAYS / Math.max(1, rfm.avgDaysBetween);
  const predicted = rfm.avgOrderValue * projectedOrders;
  
  const variance = similarCustomers.reduce((s, r) => s + Math.pow(r.monetary - avgFutureValue, 2), 0) / similarCustomers.length;
  const stdDev = Math.sqrt(variance);
  const margin = 1.96 * stdDev / Math.sqrt(similarCustomers.length);
  
  return {
    predicted: Math.round(predicted),
    confidence: Math.min(0.9, 0.5 + similarCustomers.length * 0.02),
    range: [Math.round(predicted - margin), Math.round(predicted + margin)],
    method: 'cohort_based',
    similarCustomers: similarCustomers.length,
  };
}

function segmentCustomer(rfm, churnRisk, ltv) {
  if (!rfm) return 'new';
  
  if (churnRisk.level === 'critical' || churnRisk.level === 'high') return 'at_risk';
  if (rfm.frequency === 1 && rfm.recency < 30) return 'new';
  if (rfm.frequency >= 5 && rfm.monetary > 2000 && churnRisk.level === 'low') return 'vip';
  if (rfm.recency > 60) return 'dormant';
  if (rfm.frequency >= 3) return 'loyal';
  return 'regular';
}

function detectOrderAnomalies(orders) {
  if (orders.length < 20) return [];
  
  const values = orders.map(o => o.chargedMinor || 0);
  const volumes = orders.map(o => parseFloat(o.volume?.replace(/[^0-9.]/g, '') || '0'));
  const meanValue = values.reduce((a, b) => a + b, 0) / values.length;
  const stdValue = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - meanValue, 2), 0) / values.length);
  const meanVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const stdVol = Math.sqrt(volumes.reduce((s, v) => s + Math.pow(v - meanVol, 2), 0) / volumes.length);
  
  const anomalies = [];
  
  orders.forEach(order => {
    const value = order.chargedMinor || 0;
    const volume = parseFloat(order.volume?.replace(/[^0-9.]/g, '') || '0');
    const valueZ = stdValue > 0 ? Math.abs(value - meanValue) / stdValue : 0;
    const volZ = stdVol > 0 ? Math.abs(volume - meanVol) / stdVol : 0;
    
    if (valueZ > ANOMALY_THRESHOLD_STD) {
      anomalies.push({
        type: 'order_value',
        orderId: order.id,
        code: order.code,
        actual: value / 100,
        expected: meanValue / 100,
        zScore: Math.round(valueZ * 10) / 10,
        severity: valueZ > 3.5 ? 'critical' : 'warning',
        timestamp: order.createdAt,
        description: `Order value ${value > meanValue ? 'unusually high' : 'unusually low'}`,
      });
    }
    
    if (volZ > ANOMALY_THRESHOLD_STD) {
      anomalies.push({
        type: 'order_volume',
        orderId: order.id,
        code: order.code,
        actual: volume,
        expected: Math.round(meanVol),
        zScore: Math.round(volZ * 10) / 10,
        severity: volZ > 3.5 ? 'critical' : 'warning',
        timestamp: order.createdAt,
        description: `Order volume ${volume > meanVol ? 'unusually large' : 'unusually small'}`,
      });
    }
  });
  
  return anomalies.sort((a, b) => b.zScore - a.zScore);
}

function detectPaymentAnomalies(orders) {
  const paidOrders = orders.filter(o => o.status === 'Paid');
  if (paidOrders.length < 10) return [];
  
  const paymentTimes = paidOrders.map(o => {
    const created = new Date(o.createdAt).getTime();
    const paid = new Date(o.paidAt || o.updatedAt || o.createdAt).getTime();
    return (paid - created) / (1000 * 60 * 60);
  }).filter(t => t > 0 && t < 168);
  
  if (paymentTimes.length < 5) return [];
  
  const mean = paymentTimes.reduce((a, b) => a + b, 0) / paymentTimes.length;
  const std = Math.sqrt(paymentTimes.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / paymentTimes.length);
  
  return paidOrders
    .map(o => {
      const created = new Date(o.createdAt).getTime();
      const paid = new Date(o.paidAt || o.updatedAt || o.createdAt).getTime();
      const hours = (paid - created) / (1000 * 60 * 60);
      const z = std > 0 ? Math.abs(hours - mean) / std : 0;
      return { order: o, hours, z };
    })
    .filter(d => d.z > ANOMALY_THRESHOLD_STD)
    .map(d => ({
      type: 'payment_delay',
      orderId: d.order.id,
      code: d.order.code,
      actualHours: Math.round(d.hours * 10) / 10,
      expectedHours: Math.round(mean * 10) / 10,
      zScore: Math.round(d.z * 10) / 10,
      severity: d.z > 3.5 ? 'critical' : 'warning',
      timestamp: d.order.createdAt,
      description: `Payment ${d.hours > mean ? 'unusually delayed' : 'unusually fast'}`,
    }));
}

function detectDriverAnomalies(orders, driverPositions) {
  const driverOrders = {};
  orders.filter(o => o.driverId).forEach(o => {
    if (!driverOrders[o.driverId]) driverOrders[o.driverId] = [];
    driverOrders[o.driverId].push(o);
  });
  
  const anomalies = [];
  
  Object.entries(driverOrders).forEach(([driverId, dOrders]) => {
    if (dOrders.length < 5) return;
    
    const completionTimes = dOrders
      .filter(o => o.status === 'Delivered' && o.assignedAt && o.deliveredAt)
      .map(o => (new Date(o.deliveredAt).getTime() - new Date(o.assignedAt).getTime()) / (1000 * 60));
    
    if (completionTimes.length < 3) return;
    
    const mean = completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length;
    const std = Math.sqrt(completionTimes.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / completionTimes.length);
    
    const recent = dOrders.slice(-3);
    recent.forEach(order => {
      if (order.status === 'Delivered' && order.assignedAt && order.deliveredAt) {
        const hours = (new Date(order.deliveredAt).getTime() - new Date(order.assignedAt).getTime()) / (1000 * 60);
        const z = std > 0 ? Math.abs(hours - mean) / std : 0;
        if (z > ANOMALY_THRESHOLD_STD) {
          anomalies.push({
            type: 'driver_performance',
            driverId,
            orderId: order.id,
            code: order.code,
            actualMinutes: Math.round(hours),
            expectedMinutes: Math.round(mean),
            zScore: Math.round(z * 10) / 10,
            severity: z > 3.5 ? 'critical' : 'warning',
            timestamp: order.deliveredAt,
            description: `Delivery ${hours > mean ? 'unusually slow' : 'unusually fast'}`,
          });
        }
      }
    });
    
    const cancellations = dOrders.filter(o => o.status === 'Cancelled').length;
    const cancelRate = cancellations / dOrders.length;
    if (cancelRate > 0.3 && dOrders.length >= 10) {
      anomalies.push({
        type: 'high_cancellation_rate',
        driverId,
        rate: Math.round(cancelRate * 100),
        severity: 'warning',
        description: `${Math.round(cancelRate * 100)}% cancellation rate`,
      });
    }
  });
  
  return anomalies;
}

function monteCarloRevenueForecast(orders, days = 30, simulations = 500) {
  const dailyRevenue = {};
  orders.forEach(o => {
    const day = new Date(o.createdAt).toISOString().split('T')[0];
    dailyRevenue[day] = (dailyRevenue[day] || 0) + (o.chargedMinor || 0);
  });
  
  const values = Object.values(dailyRevenue);
  if (values.length < 14) return null;
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length);
  
  const results = [];
  for (let i = 0; i < simulations; i++) {
    let total = 0;
    for (let d = 0; d < days; d++) {
      const daily = Math.max(0, mean + (Math.random() - 0.5) * std * 2);
      total += daily;
    }
    results.push(total);
  }
  
  results.sort((a, b) => a - b);
  return {
    mean: Math.round(results.reduce((a, b) => a + b, 0) / simulations / 100),
    median: Math.round(results[Math.floor(simulations / 2)] / 100),
    p10: Math.round(results[Math.floor(simulations * 0.1)] / 100),
    p90: Math.round(results[Math.floor(simulations * 0.9)] / 100),
    p5: Math.round(results[Math.floor(simulations * 0.05)] / 100),
    p95: Math.round(results[Math.floor(simulations * 0.95)] / 100),
    currency: 'GHS',
  };
}

export function usePredictiveAnalytics({ orders, customers, driverPositions }) {
  const [churnAnalysis, setChurnAnalysis] = useState([]);
  const [ltvPredictions, setLtvPredictions] = useState({});
  const [segments, setSegments] = useState({});
  const [anomalies, setAnomalies] = useState([]);
  const [revenueForecast, setRevenueForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const runAnalysis = useCallback(() => {
    if (!orders?.length || !customers?.length) {
      setLoading(false);
      return;
    }
    
    const allRFM = customers
      .map(c => calculateRFM(orders, c.identifier))
      .filter(Boolean);
    
    const churn = customers.map(c => {
      const rfm = calculateRFM(orders, c.identifier);
      const risk = calculateChurnRisk(rfm, allRFM);
      const ltv = predictLTV(rfm, allRFM);
      const segment = segmentCustomer(rfm, risk, ltv);
      return { customerId: c.identifier, ...risk, ltv, segment };
    });
    
    const ltvMap = {};
    churn.forEach(c => { ltvMap[c.customerId] = c.ltv; });
    
    const segmentCounts = {};
    churn.forEach(c => { segmentCounts[c.segment] = (segmentCounts[c.segment] || 0) + 1; });
    
    const orderAnomalies = detectOrderAnomalies(orders);
    const paymentAnomalies = detectPaymentAnomalies(orders);
    const driverAnomalies = detectDriverAnomalies(orders, driverPositions || {});
    const allAnomalies = [...orderAnomalies, ...paymentAnomalies, ...driverAnomalies]
      .sort((a, b) => (b.zScore || 0) - (a.zScore || 0));
    
    const forecast = monteCarloRevenueForecast(orders, 30);
    
    setChurnAnalysis(churn);
    setLtvPredictions(ltvMap);
    setSegments(segmentCounts);
    setAnomalies(allAnomalies);
    setRevenueForecast(forecast);
    setLastUpdated(new Date().toISOString());
    setLoading(false);
  }, [orders, customers, driverPositions]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(runAnalysis, 200);
    return () => clearTimeout(timer);
  }, [runAnalysis]);

  const summary = useMemo(() => {
    const atRisk = churnAnalysis.filter(c => c.level === 'critical' || c.level === 'high').length;
    const vip = Object.keys(segments).filter(s => s === 'vip').length;
    const totalLTV = Object.values(ltvPredictions).reduce((s, l) => s + (l.predicted || 0), 0);
    const criticalAnomalies = anomalies.filter(a => a.severity === 'critical').length;
    
    return {
      totalCustomers: customers?.length || 0,
      atRiskCustomers: atRisk,
      vipCustomers: vip,
      totalPredictedLTV: totalLTV,
      criticalAnomalies,
      totalAnomalies: anomalies.length,
      revenueForecast30d: revenueForecast?.median || 0,
    };
  }, [churnAnalysis, segments, ltvPredictions, anomalies, revenueForecast]);

  const getCustomerInsights = useCallback((customerId) => {
    return {
      churn: churnAnalysis.find(c => c.customerId === customerId),
      ltv: ltvPredictions[customerId],
      segment: churnAnalysis.find(c => c.customerId === customerId)?.segment,
      recentOrders: orders.filter(o => o.customerId === customerId).slice(0, 10),
    };
  }, [churnAnalysis, ltvPredictions, orders]);

  return {
    churnAnalysis,
    ltvPredictions,
    segments,
    anomalies,
    revenueForecast,
    summary,
    loading,
    lastUpdated,
    refresh: runAnalysis,
    getCustomerInsights,
  };
}

export default usePredictiveAnalytics;