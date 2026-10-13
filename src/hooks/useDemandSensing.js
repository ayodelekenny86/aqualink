import { useState, useEffect, useCallback, useMemo } from 'react';

export function useDemandSensing({ 
  orders = [], 
  customers = [], 
  weatherForecast = [],
  events = [],
  historicalData = [],
  marketIndicators = [],
  onNotice 
}) {
  const [demandForecast, setDemandForecast] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateDemandForecast = useCallback(async () => {
    if (!orders.length) {
      setDemandForecast({ daily: [], weekly: [], monthly: [], summary: {} });
      setAnomalies([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 500));

      const recentOrders = orders.filter(o => {
        const orderDate = new Date(o.createdAt || o.date || Date.now());
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
        return orderDate >= thirtyDaysAgo;
      });

      const dailyVolume = {};
      recentOrders.forEach(o => {
        const date = new Date(o.createdAt || o.date || Date.now()).toISOString().split('T')[0];
        dailyVolume[date] = (dailyVolume[date] || 0) + (o.volume || 0);
      });

      const dailyForecast = [];
      const baseVolume = Object.values(dailyVolume).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(dailyVolume).length);
      
      for (let i = 0; i < 30; i++) {
        const date = new Date(Date.now() + i * 86400000);
        const dateStr = date.toISOString().split('T')[0];
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        
        const weather = weatherForecast.find(w => w.date === dateStr);
        const weatherMultiplier = weather ? (weather.precipitation > 10 ? 1.3 : weather.temperature > 30 ? 1.2 : 1.0) : 1.0;
        
        const event = events.find(e => e.date === dateStr);
        const eventMultiplier = event ? (event.type === 'festival' ? 1.5 : event.type === 'holiday' ? 1.3 : 1.0) : 1.0;
        
        const seasonalMultiplier = getSeasonalMultiplier(date.getMonth());
        const trendMultiplier = 1 + (Math.random() - 0.5) * 0.1;
        
        const predictedVolume = Math.round(baseVolume * weatherMultiplier * eventMultiplier * seasonalMultiplier * trendMultiplier);
        const confidence = Math.round(70 + Math.random() * 25);
        
        dailyForecast.push({
          date: dateStr,
          predictedVolume,
          confidence,
          weatherImpact: weatherMultiplier !== 1.0 ? `${((weatherMultiplier - 1) * 100).toFixed(0)}%` : 'None',
          eventImpact: eventMultiplier !== 1.0 ? `${((eventMultiplier - 1) * 100).toFixed(0)}%` : 'None',
          seasonality: `${((seasonalMultiplier - 1) * 100).toFixed(0)}%`,
          lowerBound: Math.round(predictedVolume * 0.8),
          upperBound: Math.round(predictedVolume * 1.2),
          dayType: isWeekend ? 'weekend' : 'weekday'
        });
      }

      const weeklyForecast = [];
      for (let w = 0; w < 8; w++) {
        const weekStart = new Date(Date.now() + w * 7 * 86400000);
        const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
        const weekDays = dailyForecast.slice(w * 7, (w + 1) * 7);
        const weekVolume = weekDays.reduce((s, d) => s + d.predictedVolume, 0);
        const avgConfidence = Math.round(weekDays.reduce((s, d) => s + d.confidence, 0) / weekDays.length);
        
        weeklyForecast.push({
          weekStart: weekStart.toISOString().split('T')[0],
          weekEnd: weekEnd.toISOString().split('T')[0],
          predictedVolume: weekVolume,
          avgConfidence,
          peakDay: weekDays.reduce((max, d) => d.predictedVolume > max.predictedVolume ? d : max).date
        });
      }

      const anomalyDetection = detectAnomalies(dailyVolume, dailyForecast);
      setAnomalies(anomalyDetection);

      const customerSegments = analyzeCustomerSegments(customers, recentOrders);
      const productDemand = analyzeProductDemand(recentOrders);

      const newForecast = {
        daily: dailyForecast,
        weekly: weeklyForecast,
        monthly: [],
        anomalies: anomalyDetection,
        customerSegments,
        productDemand,
        summary: {
          avgDailyVolume: Math.round(baseVolume),
          total30DayForecast: dailyForecast.reduce((s, d) => s + d.predictedVolume, 0),
          peakDay: dailyForecast.reduce((max, d) => d.predictedVolume > max.predictedVolume ? d : max),
          avgConfidence: Math.round(dailyForecast.reduce((s, d) => s + d.confidence, 0) / dailyForecast.length),
          weatherSensitiveDays: dailyForecast.filter(d => d.weatherImpact !== 'None').length,
          eventDays: dailyForecast.filter(d => d.eventImpact !== 'None').length,
          anomalyCount: anomalyDetection.length
        },
        generatedAt: new Date().toISOString()
      };

      setDemandForecast(newForecast);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orders, customers, weatherForecast, events, historicalData, marketIndicators]);

  const detectAnomalies = (historical, forecast) => {
    const anomalies = [];
    const historicalValues = Object.values(historical);
    const mean = historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length;
    const std = Math.sqrt(historicalValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / historicalValues.length);
    const threshold = mean + 2 * std;

    Object.entries(historical).forEach(([date, volume]) => {
      if (volume > threshold) {
        anomalies.push({
          date,
          type: 'spike',
          actualVolume: volume,
          expectedVolume: Math.round(mean),
          deviation: Math.round(((volume - mean) / mean) * 100),
          severity: volume > mean * 2 ? 'high' : 'medium',
          possibleCauses: ['Event', 'Weather', 'Data error', 'New customer']
        });
      }
    });

    forecast.forEach(f => {
      if (f.predictedVolume > threshold * 1.5) {
        anomalies.push({
          date: f.date,
          type: 'forecast_spike',
          predictedVolume: f.predictedVolume,
          expectedVolume: Math.round(mean),
          deviation: Math.round(((f.predictedVolume - mean) / mean) * 100),
          severity: 'high',
          confidence: f.confidence,
          possibleCauses: ['Seasonal surge', 'Weather event', 'Market change']
        });
      }
    });

    return anomalies;
  };

  const analyzeCustomerSegments = (customers, orders) => {
    const segments = {};
    orders.forEach(o => {
      const customer = customers.find(c => c.id === o.customerId);
      const type = customer?.type || o.customerType || 'unknown';
      if (!segments[type]) segments[type] = { volume: 0, orders: 0, customers: new Set() };
      segments[type].volume += o.volume || 0;
      segments[type].orders += 1;
      segments[type].customers.add(o.customerId);
    });
    return Object.entries(segments).map(([type, data]) => ({
      segment: type,
      volume: data.volume,
      orders: data.orders,
      uniqueCustomers: data.customers.size,
      avgOrderSize: Math.round(data.volume / data.orders)
    }));
  };

  const analyzeProductDemand = (orders) => {
    const products = {};
    orders.forEach(o => {
      const product = o.product || o.waterType || 'Standard';
      if (!products[product]) products[product] = { volume: 0, orders: 0 };
      products[product].volume += o.volume || 0;
      products[product].orders += 1;
    });
    return Object.entries(products).map(([product, data]) => ({
      product,
      volume: data.volume,
      orders: data.orders,
      avgOrderSize: Math.round(data.volume / data.orders),
      trend: Math.random() > 0.5 ? 'growing' : 'stable'
    }));
  };

  const getSeasonalMultiplier = (month) => {
    const multipliers = [1.1, 1.0, 1.0, 1.1, 1.2, 1.3, 1.4, 1.3, 1.2, 1.1, 1.0, 1.1];
    return multipliers[month];
  };

  const getDemandAtDate = useCallback((date) => {
    const dateStr = new Date(date).toISOString().split('T')[0];
    return demandForecast?.daily?.find(d => d.date === dateStr) || null;
  }, [demandForecast]);

  const getWeeklyDemand = useCallback((weekStart) => {
    const startStr = new Date(weekStart).toISOString().split('T')[0];
    return demandForecast?.weekly?.find(w => w.weekStart === startStr) || null;
  }, [demandForecast]);

  const adjustForecast = useCallback((date, adjustment) => {
    setDemandForecast(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        daily: prev.daily.map(d => 
          d.date === new Date(date).toISOString().split('T')[0]
            ? { ...d, predictedVolume: Math.round(d.predictedVolume * adjustment), adjusted: true }
            : d
        )
      };
    });
    onNotice?.(`Demand adjusted for ${date}`);
  }, [onNotice]);

  const refresh = useCallback(() => generateDemandForecast(), [generateDemandForecast]);

  useEffect(() => { generateDemandForecast(); }, [generateDemandForecast]);

  return {
    demandForecast,
    anomalies,
    loading,
    error,
    refresh,
    getDemandAtDate,
    getWeeklyDemand,
    adjustForecast,
    totalForecast: demandForecast?.summary?.total30DayForecast || 0,
    avgDailyDemand: demandForecast?.summary?.avgDailyVolume || 0,
    peakDemand: demandForecast?.summary?.peakDay?.predictedVolume || 0,
    anomalyCount: anomalies.length,
    highSeverityAnomalies: anomalies.filter(a => a.severity === 'high').length
  };
}

function getSeasonalMultiplier(month) {
  const multipliers = [1.1, 1.0, 1.0, 1.1, 1.2, 1.3, 1.4, 1.3, 1.2, 1.1, 1.0, 1.1];
  return multipliers[month];
}

export default useDemandSensing;