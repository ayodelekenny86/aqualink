import { useState, useEffect, useMemo, useCallback } from 'react';

const USE_MOCK = typeof window !== 'undefined' && (!window.__SUPABASE_URL__ || !window.__SUPABASE_ANON_KEY__);

export function useCustomerChurnPrediction({ customers = [], orders = [], onNotice }) {
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const churnPredictions = useMemo(() => {
    return customers.map(customer => {
      const customerOrders = orders.filter(o => o.customerId === customer.id || o.customer === customer.name);
      const totalOrders = customerOrders.length;
      const totalSpent = customerOrders.reduce((sum, o) => sum + (o.chargedMinor || o.total || 0), 0);
      
      const now = new Date();
      const lastOrder = customerOrders.length > 0 ? new Date(Math.max(...customerOrders.map(o => new Date(o.createdAt).getTime()))) : null;
      const daysSinceLastOrder = lastOrder ? Math.floor((now - lastOrder) / (1000 * 60 * 60 * 24)) : 999;
      
      const avgOrderInterval = customerOrders.length > 1 ? 
        customerOrders.slice(1).reduce((sum, o, i) => {
          const prev = new Date(customerOrders[i].createdAt);
          const curr = new Date(o.createdAt);
          return sum + (curr - prev) / (1000 * 60 * 60 * 24);
        }, 0) / (customerOrders.length - 1) : 30;
      
      const expectedNextOrder = lastOrder ? new Date(lastOrder.getTime() + avgOrderInterval * 24 * 60 * 60 * 1000) : null;
      const isOverdue = expectedNextOrder && now > expectedNextOrder;
      const daysOverdue = isOverdue ? Math.floor((now - expectedNextOrder) / (1000 * 60 * 60 * 24)) : 0;

      const orderFrequency = totalOrders / Math.max(1, (now - new Date(customer.createdAt || now)) / (1000 * 60 * 60 * 24 * 30));
      const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;
      
      const supportTickets = customer.supportTickets || 0;
      const complaints = customer.complaints || 0;
      const satisfactionScore = customer.satisfactionScore || (5 - complaints * 0.5);
      
      let churnRisk = 0;
      churnRisk += Math.min(40, daysSinceLastOrder * 1.5);
      churnRisk += Math.min(25, (1 - (satisfactionScore / 5)) * 25);
      churnRisk += Math.min(20, supportTickets * 5);
      churnRisk += isOverdue ? 15 : 0;
      churnRisk += orderFrequency < 0.5 ? 10 : 0;
      
      churnRisk = Math.min(95, Math.max(5, churnRisk));

      let riskLevel = 'low';
      if (churnRisk >= 70) riskLevel = 'critical';
      else if (churnRisk >= 45) riskLevel = 'high';
      else if (churnRisk >= 25) riskLevel = 'medium';

      const ltv = avgOrderValue * orderFrequency * 12 * 3;
      const retentionActions = getRetentionActions(riskLevel, customer, daysSinceLastOrder, satisfactionScore);

      return {
        customerId: customer.id,
        customerName: customer.name,
        email: customer.email,
        phone: customer.phone,
        totalOrders,
        totalSpent,
        avgOrderValue: Math.round(avgOrderValue),
        daysSinceLastOrder,
        lastOrderDate: lastOrder?.toISOString().split('T')[0] || null,
        expectedNextOrder: expectedNextOrder?.toISOString().split('T')[0] || null,
        isOverdue,
        daysOverdue,
        orderFrequency: Math.round(orderFrequency * 10) / 10,
        satisfactionScore: Math.round(satisfactionScore * 10) / 10,
        churnRisk: Math.round(churnRisk),
        riskLevel,
        ltv: Math.round(ltv),
        retentionActions,
        segment: getSegment(churnRisk, totalSpent, orderFrequency),
      };
    });
  }, [customers, orders]);

  const atRiskCustomers = useMemo(() => 
    churnPredictions.filter(c => c.riskLevel === 'critical' || c.riskLevel === 'high').sort((a, b) => b.churnRisk - a.churnRisk),
  [churnPredictions]);

  const summary = useMemo(() => {
    const total = churnPredictions.length;
    const critical = churnPredictions.filter(c => c.riskLevel === 'critical').length;
    const high = churnPredictions.filter(c => c.riskLevel === 'high').length;
    const medium = churnPredictions.filter(c => c.riskLevel === 'medium').length;
    const low = churnPredictions.filter(c => c.riskLevel === 'low').length;
    const avgChurnRisk = total > 0 ? Math.round(churnPredictions.reduce((sum, c) => sum + c.churnRisk, 0) / total) : 0;
    const atRiskRevenue = atRiskCustomers.reduce((sum, c) => sum + c.ltv, 0);

    return { total, critical, high, medium, low, avgChurnRisk, atRiskRevenue };
  }, [churnPredictions, atRiskCustomers]);

  const refresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setLastUpdated(new Date().toISOString());
      setLoading(false);
      onNotice?.('Churn predictions updated');
    }, 500);
  }, [onNotice]);

  const recordRetentionAction = useCallback((customerId, action, notes) => {
    const record = {
      id: `ret_${Date.now()}`,
      customerId,
      action,
      notes,
      date: new Date().toISOString(),
    };
    onNotice?.(`Retention action recorded: ${action}`);
    return { ok: true, record };
  }, [onNotice]);

  const formatCedi = useCallback((amount) => {
    return `GH₵${(amount / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, []);

  return {
    churnPredictions,
    atRiskCustomers,
    summary,
    loading,
    lastUpdated,
    refresh,
    recordRetentionAction,
    formatCedi,
  };
}

function getRetentionActions(riskLevel, customer, daysSinceLastOrder, satisfactionScore) {
  const actions = [];
  
  if (riskLevel === 'critical') {
    actions.push('Immediate personal outreach call');
    actions.push('Offer 20% discount on next 3 orders');
    actions.push('Assign dedicated account manager');
    actions.push('Schedule service quality review');
  } else if (riskLevel === 'high') {
    actions.push('Send personalized check-in message');
    actions.push('Offer 15% discount on next order');
    actions.push('Share new service features');
  } else if (riskLevel === 'medium') {
    actions.push('Send automated re-engagement email');
    actions.push('Offer loyalty bonus');
    if (daysSinceLastOrder > 30) actions.push('Promote subscription plan');
  } else {
    actions.push('Continue standard engagement');
    actions.push('Request feedback survey');
  }
  
  if (satisfactionScore < 3.5) {
    actions.unshift('URGENT: Address satisfaction issues first');
  }
  
  return actions;
}

function getSegment(churnRisk, totalSpent, orderFrequency) {
  if (churnRisk >= 70) return 'At Risk';
  if (totalSpent > 10000 && orderFrequency > 2) return 'VIP';
  if (totalSpent > 5000) return 'High Value';
  if (orderFrequency > 1) return 'Regular';
  return 'New/Low Activity';
}

export default useCustomerChurnPrediction;