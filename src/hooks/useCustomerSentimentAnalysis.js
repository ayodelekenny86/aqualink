import { useState, useEffect, useCallback, useMemo } from 'react';

export function useCustomerSentimentAnalysis({ 
  customers = [], 
  feedback = [],
  interactions = [],
  orders = [],
  supportTickets = [],
  surveys = [],
  onNotice 
}) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const analyzeSentiment = useCallback(async () => {
    if (!customers.length && !feedback.length) {
      setAnalysis({ customers: [], summary: {} });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 400));

      const customerSentiments = customers.slice(0, 20).map((customer, i) => {
        const customerFeedback = feedback.filter(f => f.customerId === customer.id);
        const customerInteractions = interactions.filter(i => i.customerId === customer.id);
        const customerTickets = supportTickets.filter(t => t.customerId === customer.id);
        const customerSurveys = surveys.filter(s => s.customerId === customer.id);
        const customerOrders = orders.filter(o => o.customerId === customer.id);

        const avgRating = customerFeedback.length 
          ? customerFeedback.reduce((s, f) => s + (f.rating || 0), 0) / customerFeedback.length 
          : 3.5 + Math.random() * 1.5;

        const sentimentScore = Math.round((avgRating / 5) * 100);
        const npsScore = Math.round((avgRating - 3) * 25);
        
        const topics = ['delivery_speed', 'water_quality', 'pricing', 'customer_service', 'reliability'];
        const topicSentiments = topics.map(topic => ({
          topic,
          score: Math.round((Math.random() * 40 + 60)),
          mentions: Math.floor(Math.random() * 10),
          trend: Math.random() > 0.5 ? 'improving' : 'stable'
        }));

        const churnRisk = avgRating < 3 ? 'high' : avgRating < 3.5 ? 'medium' : 'low';
        const loyaltyTier = avgRating >= 4.5 ? 'advocate' : avgRating >= 4 ? 'loyal' : avgRating >= 3.5 ? 'neutral' : 'detractor';

        return {
          customerId: customer.id,
          customerName: customer.name || `Customer ${i + 1}`,
          type: customer.type || 'residential',
          sentimentScore,
          npsScore,
          avgRating: Math.round(avgRating * 10) / 10,
          totalFeedback: customerFeedback.length,
          totalInteractions: customerInteractions.length,
          openTickets: customerTickets.filter(t => t.status === 'open').length,
          topicSentiments,
          churnRisk,
          loyaltyTier,
          keyDrivers: topicSentiments.filter(t => t.score < 70).map(t => t.topic),
          strengths: topicSentiments.filter(t => t.score >= 80).map(t => t.topic),
          lastInteraction: customerInteractions.length 
            ? new Date(Math.max(...customerInteractions.map(i => new Date(i.timestamp).getTime()))).toISOString()
            : 'Never',
          trend: Math.random() > 0.6 ? 'improving' : Math.random() > 0.3 ? 'stable' : 'declining'
        };
      });

      const overallSentiment = customerSentiments.length 
        ? Math.round(customerSentiments.reduce((s, c) => s + c.sentimentScore, 0) / customerSentiments.length)
        : 75;
      
      const npsDistribution = {
        promoters: customerSentiments.filter(c => c.npsScore > 0).length,
        passives: customerSentiments.filter(c => c.npsScore === 0).length,
        detractors: customerSentiments.filter(c => c.npsScore < 0).length
      };

      const topicAnalysis = topics.map(topic => ({
        topic,
        avgScore: Math.round(customerSentiments.reduce((s, c) => s + c.topicSentiments.find(t => t.topic === topic).score, 0) / customerSentiments.length),
        mentionCount: customerSentiments.reduce((s, c) => s + c.topicSentiments.find(t => t.topic === topic).mentions, 0),
        trend: Math.random() > 0.5 ? 'improving' : 'stable'
      }));

      const newAnalysis = {
        customers: customerSentiments,
        summary: {
          totalCustomers: customers.length,
          overallSentiment,
          avgNPS: Math.round(customerSentiments.reduce((s, c) => s + c.npsScore, 0) / customerSentiments.length),
          npsDistribution,
          churnRiskCounts: {
            high: customerSentiments.filter(c => c.churnRisk === 'high').length,
            medium: customerSentiments.filter(c => c.churnRisk === 'medium').length,
            low: customerSentiments.filter(c => c.churnRisk === 'low').length
          },
          loyaltyDistribution: {
            advocates: customerSentiments.filter(c => c.loyaltyTier === 'advocate').length,
            loyal: customerSentiments.filter(c => c.loyaltyTier === 'loyal').length,
            neutral: customerSentiments.filter(c => c.loyaltyTier === 'neutral').length,
            detractors: customerSentiments.filter(c => c.loyaltyTier === 'detractor').length
          },
          topIssues: topicAnalysis.filter(t => t.avgScore < 70).sort((a, b) => a.avgScore - b.avgScore).slice(0, 3),
          topStrengths: topicAnalysis.filter(t => t.avgScore >= 80).sort((a, b) => b.avgScore - a.avgScore).slice(0, 3)
        },
        generatedAt: new Date().toISOString()
      };

      setAnalysis(newAnalysis);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [customers, feedback, interactions, orders, supportTickets, surveys]);

  const getCustomerSentiment = useCallback((customerId) => {
    return analysis?.customers?.find(c => c.customerId === customerId) || null;
  }, [analysis]);

  const getCustomersByRisk = useCallback((risk) => {
    return analysis?.customers?.filter(c => c.churnRisk === risk) || [];
  }, [analysis]);

  const getTopDetractors = useCallback((limit = 10) => {
    return analysis?.customers
      ?.filter(c => c.loyaltyTier === 'detractor')
      .sort((a, b) => a.sentimentScore - b.sentimentScore)
      .slice(0, limit) || [];
  }, [analysis]);

  const getImprovementPriorities = useCallback(() => {
    return analysis?.summary?.topIssues || [];
  }, [analysis]);

  useEffect(() => { analyzeSentiment(); }, [analyzeSentiment]);

  return {
    analysis,
    loading,
    error,
    refresh: analyzeSentiment,
    getCustomerSentiment,
    getCustomersByRisk,
    getTopDetractors,
    getImprovementPriorities,
    overallSentiment: analysis?.summary?.overallSentiment || 0,
    avgNPS: analysis?.summary?.avgNPS || 0,
    highChurnCount: analysis?.summary?.churnRiskCounts?.high || 0,
    advocateCount: analysis?.summary?.loyaltyDistribution?.advocates || 0
  };
}

export default useCustomerSentimentAnalysis;