import { useState, useEffect, useCallback, useMemo } from 'react';

export function useCustomerSentimentAnalysis({ 
  customers = [], 
  orders = [], 
  ratings = [],
  messages = [],
  supportTickets = [],
  onNotice 
}) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const analyzeSentiment = useCallback(async () => {
    if (!customers.length) {
      setAnalysis({ overall: {}, segments: [], insights: [], alerts: [] });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 400));

      const customerSentiments = customers.map(customer => {
        const customerOrders = orders.filter(o => o.customerId === customer.id);
        const customerRatings = ratings.filter(r => r.customerId === customer.id);
        const customerMessages = messages.filter(m => m.customerId === customer.id);
        const customerTickets = supportTickets.filter(t => t.customerId === customer.id);

        const ratingScores = customerRatings.map(r => r.rating).filter(v => v != null);
        const avgRating = ratingScores.length 
          ? ratingScores.reduce((a, b) => a + b, 0) / ratingScores.length 
          : 3.5;

        const sentimentScore = calculateSentimentScore({
          avgRating,
          orderCount: customerOrders.length,
          completedOrders: customerOrders.filter(o => o.status === 'Delivered').length,
          cancelledOrders: customerOrders.filter(o => o.status === 'Cancelled').length,
          messageCount: customerMessages.length,
          ticketCount: customerTickets.length,
          unresolvedTickets: customerTickets.filter(t => t.status === 'open').length,
          lastOrderDate: customerOrders.length ? Math.max(...customerOrders.map(o => new Date(o.date).getTime())) : 0,
          tenureDays: customer.createdAt ? (Date.now() - new Date(customer.createdAt).getTime()) / (1000 * 60 * 60 * 24) : 0
        });

        const sentimentLabel = sentimentScore >= 80 ? 'promoter' : sentimentScore >= 60 ? 'passive' : sentimentScore >= 40 ? 'detractor' : 'churn_risk';

        const topics = extractTopics(customerMessages, customerTickets);
        const keyDrivers = identifyKeyDrivers({
          avgRating,
          sentimentScore,
          orderCount: customerOrders.length,
          ticketCount: customerTickets.length,
          topics
        });

        return {
          customerId: customer.id,
          customerName: customer.name,
          sentimentScore: Math.round(sentimentScore),
          sentimentLabel,
          avgRating: Math.round(avgRating * 10) / 10,
          orderCount: customerOrders.length,
          completedRate: customerOrders.length 
            ? Math.round((customerOrders.filter(o => o.status === 'Delivered').length / customerOrders.length) * 100)
            : 0,
          topics,
          keyDrivers,
          riskFactors: identifyRiskFactors({
            sentimentScore,
            avgRating,
            unresolvedTickets: customerTickets.filter(t => t.status === 'open').length,
            daysSinceLastOrder: customerOrders.length 
              ? (Date.now() - Math.max(...customerOrders.map(o => new Date(o.date).getTime()))) / (1000 * 60 * 60 * 24)
              : 999
          }),
          recommendedActions: generateActions(sentimentLabel, {
            avgRating,
            unresolvedTickets: customerTickets.filter(t => t.status === 'open').length,
            daysSinceLastOrder: customerOrders.length 
              ? (Date.now() - Math.max(...customerOrders.map(o => new Date(o.date).getTime()))) / (1000 * 60 * 60 * 24)
              : 999,
            orderCount: customerOrders.length
          })
        };
      });

      const segments = [
        { name: 'Promoters', customers: customerSentiments.filter(c => c.sentimentLabel === 'promoter'), color: '#10b981' },
        { name: 'Passive', customers: customerSentiments.filter(c => c.sentimentLabel === 'passive'), color: '#f59e0b' },
        { name: 'Detractors', customers: customerSentiments.filter(c => c.sentimentLabel === 'detractor'), color: '#ef4444' },
        { name: 'Churn Risk', customers: customerSentiments.filter(c => c.sentimentLabel === 'churn_risk'), color: '#7c2d12' }
      ];

      const overallSentiment = customerSentiments.length
        ? Math.round(customerSentiments.reduce((sum, c) => sum + c.sentimentScore, 0) / customerSentiments.length)
        : 75;

      const nps = calculateNPS(customerSentiments);

      const insights = generateInsights(customerSentiments, segments, nps, ratings, supportTickets);
      const alerts = generateAlerts(customerSentiments);

      const newAnalysis = {
        overall: {
          sentimentScore: overallSentiment,
          nps,
          totalCustomers: customers.length,
          promoters: segments[0].customers.length,
          passive: segments[1].customers.length,
          detractors: segments[2].customers.length,
          churnRisk: segments[3].customers.length,
          avgRating: customerSentiments.length 
            ? Math.round(customerSentiments.reduce((sum, c) => sum + c.avgRating, 0) / customerSentiments.length * 10) / 10
            : 0
        },
        segments: segments.map(s => ({
          name: s.name,
          count: s.customers.length,
          percentage: customers.length ? Math.round((s.customers.length / customers.length) * 100) : 0,
          color: s.color,
          avgSentiment: s.customers.length 
            ? Math.round(s.customers.reduce((sum, c) => sum + c.sentimentScore, 0) / s.customers.length)
            : 0
        })),
        customers: customerSentiments.sort((a, b) => a.sentimentScore - b.sentimentScore),
        insights,
        alerts: alerts.sort((a, b) => 
          (b.severity === 'critical' ? 3 : b.severity === 'high' ? 2 : 1) - 
          (a.severity === 'critical' ? 3 : a.severity === 'high' ? 2 : 1)
        ),
        topicAnalysis: analyzeTopics(customerSentiments),
        generatedAt: new Date().toISOString()
      };

      setAnalysis(newAnalysis);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [customers, orders, ratings, messages, supportTickets]);

  const calculateSentimentScore = ({ 
    avgRating, orderCount, completedOrders, cancelledOrders, 
    messageCount, ticketCount, unresolvedTickets, lastOrderDate, tenureDays 
  }) => {
    let score = 50;
    
    score += (avgRating - 3) * 10;
    score += Math.min(orderCount * 2, 20);
    score += completedOrders * 1.5;
    score -= cancelledOrders * 5;
    score -= unresolvedTickets * 8;
    score -= ticketCount * 1.5;
    
    const daysSinceLastOrder = lastOrderDate ? (Date.now() - lastOrderDate) / (1000 * 60 * 60 * 24) : 999;
    if (daysSinceLastOrder > 60) score -= 15;
    else if (daysSinceLastOrder > 30) score -= 5;
    
    if (tenureDays > 365) score += 10;
    else if (tenureDays > 180) score += 5;
    
    return Math.max(0, Math.min(100, score));
  };

  const extractTopics = (messages, tickets) => {
    const topics = {};
    const keywords = {
      'delivery_time': ['late', 'delay', 'slow', 'time', 'schedule', 'early', 'on time'],
      'water_quality': ['quality', 'taste', 'smell', 'color', 'clean', 'dirty', 'contaminat'],
      'price': ['price', 'cost', 'expensive', 'cheap', 'charge', 'bill', 'fee'],
      'customer_service': ['service', 'support', 'help', 'rude', 'friendly', 'response', 'answer'],
      'billing': ['bill', 'invoice', 'payment', 'charge', 'receipt', 'refund'],
      'app_experience': ['app', 'website', 'login', 'bug', 'crash', 'slow', 'easy', 'hard']
    };

    [...messages, ...tickets].forEach(item => {
      const text = (item.message || item.subject || item.description || '').toLowerCase();
      Object.entries(keywords).forEach(([topic, words]) => {
        if (words.some(w => text.includes(w))) {
          topics[topic] = (topics[topic] || 0) + 1;
        }
      });
    });

    return Object.entries(topics)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => ({ topic, count }));
  };

  const identifyKeyDrivers = ({ avgRating, sentimentScore, orderCount, ticketCount, topics }) => {
    const drivers = [];
    if (avgRating >= 4.5) drivers.push({ driver: 'Excellent water quality', impact: 'positive', strength: 'high' });
    if (avgRating <= 2.5) drivers.push({ driver: 'Poor water quality', impact: 'negative', strength: 'high' });
    if (orderCount > 20) drivers.push({ driver: 'High order frequency', impact: 'positive', strength: 'medium' });
    if (ticketCount > 5) drivers.push({ driver: 'Frequent support issues', impact: 'negative', strength: 'high' });
    if (topics.some(t => t.topic === 'delivery_time' && t.count > 3)) {
      drivers.push({ driver: 'Delivery timing concerns', impact: 'negative', strength: 'medium' });
    }
    if (topics.some(t => t.topic === 'price' && t.count > 3)) {
      drivers.push({ driver: 'Price sensitivity', impact: 'negative', strength: 'medium' });
    }
    return drivers;
  };

  const identifyRiskFactors = ({ sentimentScore, avgRating, unresolvedTickets, daysSinceLastOrder }) => {
    const risks = [];
    if (sentimentScore < 40) risks.push({ factor: 'Very low sentiment', severity: 'critical' });
    if (avgRating < 2.5) risks.push({ factor: 'Poor ratings', severity: 'high' });
    if (unresolvedTickets > 2) risks.push({ factor: 'Multiple unresolved tickets', severity: 'high' });
    if (daysSinceLastOrder > 90) risks.push({ factor: 'Long inactivity', severity: 'critical' });
    else if (daysSinceLastOrder > 60) risks.push({ factor: 'Extended inactivity', severity: 'high' });
    else if (daysSinceLastOrder > 30) risks.push({ factor: 'Recent inactivity', severity: 'medium' });
    return risks;
  };

  const generateActions = (label, { avgRating, unresolvedTickets, daysSinceLastOrder, orderCount }) => {
    const actions = [];
    if (label === 'churn_risk') {
      actions.push('Immediate retention call from account manager');
      actions.push('Offer 20% discount on next 3 orders');
      actions.push('Schedule water quality test at their location');
    } else if (label === 'detractor') {
      actions.push('Proactive check-in call within 48 hours');
      actions.push('Address specific complaints from recent tickets');
      if (avgRating < 3) actions.push('Offer free water quality upgrade');
    } else if (label === 'passive') {
      actions.push('Send satisfaction survey with incentive');
      actions.push('Introduce loyalty program benefits');
      if (orderCount < 5) actions.push('Offer referral bonus for next order');
    } else if (label === 'promoter') {
      actions.push('Request testimonial or case study');
      actions.push('Invite to VIP customer program');
      actions.push('Offer referral rewards');
    }
    if (unresolvedTickets > 0) actions.unshift('Resolve all open tickets immediately');
    if (daysSinceLastOrder > 60) actions.unshift('Win-back campaign with special offer');
    return actions;
  };

  const calculateNPS = (sentiments) => {
    if (!sentiments.length) return 0;
    const promoters = sentiments.filter(s => s.sentimentLabel === 'promoter').length;
    const detractors = sentiments.filter(s => s.sentimentLabel === 'detractor').length + sentiments.filter(s => s.sentimentLabel === 'churn_risk').length;
    return Math.round(((promoters - detractors) / sentiments.length) * 100);
  };

  const generateInsights = (sentiments, segments, nps, ratings, tickets) => {
    const insights = [];
    
    if (nps > 50) insights.push({
      type: 'strength',
      title: 'Strong Customer Loyalty',
      description: `NPS of ${nps} indicates excellent customer advocacy`,
      metric: nps
    });
    else if (nps < 0) insights.push({
      type: 'concern',
      title: 'Negative NPS',
      description: `NPS of ${nps} - more detractors than promoters`,
      metric: nps
    });

    const churnRiskCount = segments[3].customers.length;
    if (churnRiskCount > sentiments.length * 0.15) {
      insights.push({
        type: 'concern',
        title: 'High Churn Risk',
        description: `${churnRiskCount} customers (${Math.round(churnRiskCount/sentiments.length*100)}%) at immediate churn risk`,
        metric: churnRiskCount
      });
    }

    const avgRating = ratings.length ? ratings.reduce((sum, r) => sum + (r.rating || 0), 0) / ratings.length : 0;
    if (avgRating < 3.5) {
      insights.push({
        type: 'concern',
        title: 'Below Target Ratings',
        description: `Average rating of ${avgRating.toFixed(1)} below 4.0 target`,
        metric: Math.round(avgRating * 10) / 10
      });
    }

    const openTickets = tickets.filter(t => t.status === 'open').length;
    if (openTickets > customers.length * 0.1) {
      insights.push({
        type: 'concern',
        title: 'Support Backlog',
        description: `${openTickets} open tickets - ${Math.round(openTickets/customers.length*100)}% of customers have unresolved issues`,
        metric: openTickets
      });
    }

    return insights;
  };

  const generateAlerts = (sentiments) => {
    const alerts = [];
    sentiments.forEach(c => {
      if (c.sentimentLabel === 'churn_risk') {
        alerts.push({
          severity: 'critical',
          customerId: c.customerId,
          customerName: c.customerName,
          type: 'churn_imminent',
          message: `${c.customerName} at immediate churn risk (sentiment: ${c.sentimentScore})`,
          actions: c.recommendedActions
        });
      } else if (c.sentimentLabel === 'detractor' && c.riskFactors.some(r => r.severity === 'high')) {
        alerts.push({
          severity: 'high',
          customerId: c.customerId,
          customerName: c.customerName,
          type: 'detractor_with_risk',
          message: `${c.customerName} is a detractor with high-risk factors`,
          actions: c.recommendedActions
        });
      }
    });
    return alerts;
  };

  const analyzeTopics = (sentiments) => {
    const topicCounts = {};
    sentiments.forEach(c => {
      c.topics.forEach(t => {
        topicCounts[t.topic] = (topicCounts[t.topic] || 0) + t.count;
      });
    });
    return Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([topic, count]) => ({ topic, count }));
  };

  const getCustomerSentiment = useCallback((customerId) => {
    return analysis?.customers?.find(c => c.customerId === customerId) || null;
  }, [analysis]);

  const getSegmentCustomers = useCallback((segmentName) => {
    return analysis?.customers?.filter(c => c.sentimentLabel === segmentName.toLowerCase().replace(' ', '_')) || [];
  }, [analysis]);

  useEffect(() => { analyzeSentiment(); }, [analyzeSentiment]);

  return {
    analysis,
    loading,
    error,
    refresh: analyzeSentiment,
    getCustomerSentiment,
    getSegmentCustomers,
    overallSentiment: analysis?.overall?.sentimentScore || 0,
    nps: analysis?.overall?.nps || 0,
    churnRiskCount: analysis?.overall?.churnRisk || 0,
    criticalAlerts: analysis?.alerts?.filter(a => a.severity === 'critical') || [],
    insights: analysis?.insights || [],
    segments: analysis?.segments || []
  };
}

export default useCustomerSentimentAnalysis;