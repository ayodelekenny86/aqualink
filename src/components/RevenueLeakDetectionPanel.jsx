import React, { useState } from 'react';

export function RevenueLeakDetectionPanel({ 
  orders = [], 
  payments = [], 
  invoices = [],
  pricing = {},
  drivers = [],
  facilities = [],
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');

  const { 
    leaks, summary, loading, error, refresh,
    markResolved, dismissLeak,
    totalLeakAmount, netLeak, criticalCount, highCount,
    getLeaksBySeverity
  } = React.useMemo(() => {
    const detectedLeaks = [];

    const unpaidDelivered = orders.filter(o => 
      o.status === 'Delivered' && o.payment !== 'Released' && o.payment !== 'Paid'
    );
    unpaidDelivered.forEach(order => {
      const expectedRevenue = order.price || (order.volume * (pricing.perGallon || 0.02));
      detectedLeaks.push({
        id: `leak-unpaid-${order.id}`,
        type: 'unpaid_delivery',
        severity: 'high',
        title: `Unpaid Delivery: ${order.id}`,
        description: `Order delivered but payment not collected`,
        expectedRevenue: Math.round(expectedRevenue * 100) / 100,
        difference: -Math.round(expectedRevenue * 100) / 100,
        status: 'detected'
      });
    });

    const priceDiscrepancies = orders.filter(o => {
      const expectedPrice = o.volume * (pricing.perGallon || 0.02);
      return o.price && Math.abs(o.price - expectedPrice) > expectedPrice * 0.05;
    });
    priceDiscrepancies.forEach(order => {
      const expectedPrice = order.volume * (pricing.perGallon || 0.02);
      const difference = order.price - expectedPrice;
      detectedLeaks.push({
        id: `leak-price-${order.id}`,
        type: difference > 0 ? 'overcharge' : 'undercharge',
        severity: Math.abs(difference) > expectedPrice * 0.15 ? 'high' : 'medium',
        title: `${difference > 0 ? 'Overcharge' : 'Undercharge'}: ${order.id}`,
        expectedRevenue: Math.round(expectedPrice * 100) / 100,
        difference: Math.round(difference * 100) / 100,
        status: 'detected'
      });
    });

    const totalLeak = detectedLeaks.filter(l => l.difference < 0).reduce((s, l) => s + Math.abs(l.difference), 0);
    const totalOver = detectedLeaks.filter(l => l.difference > 0).reduce((s, l) => s + l.difference, 0);

    return {
      leaks: detectedLeaks,
      summary: {
        totalLeaks: detectedLeaks.length,
        totalLeakAmount: Math.round(totalLeak * 100) / 100,
        totalOverchargeAmount: Math.round(totalOver * 100) / 100,
        netLeak: Math.round((totalLeak - totalOver) * 100) / 100,
        criticalCount: detectedLeaks.filter(l => l.severity === 'critical').length,
        highCount: detectedLeaks.filter(l => l.severity === 'high').length,
        mediumCount: detectedLeaks.filter(l => l.severity === 'medium').length
      },
      loading: false, error: null, refresh: () => {},
      markResolved: (id) => onNotice?.(`Leak ${id} resolved`),
      dismissLeak: (id) => onNotice?.(`Leak ${id} dismissed`),
      totalLeakAmount: Math.round(totalLeak * 100) / 100,
      netLeak: Math.round((totalLeak - totalOver) * 100) / 100,
      criticalCount: detectedLeaks.filter(l => l.severity === 'critical').length,
      highCount: detectedLeaks.filter(l => l.severity === 'high').length,
      getLeaksBySeverity: (sev) => detectedLeaks.filter(l => l.severity === sev)
    };
  }, [orders, payments, invoices, pricing, drivers, facilities]);

  if (loading) return <div className="panel-loading">Detecting revenue leaks...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  const filteredLeaks = leaks.filter(l => {
    if (activeTab === 'resolved') return l.status === 'resolved';
    if (activeTab === 'dismissed') return l.status === 'dismissed';
    return l.status === 'detected';
  }).filter(l => filterSeverity === 'all' || l.severity === filterSeverity);

  return (
    <div className="revenue-leak-panel">
      <div className="panel-header">
        <h3>Revenue Leak Detection</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Scan</button>
      </div>

      <div className="leak-summary">
        <div className="metric-card critical">
          <h4>Total Leaks</h4>
          <div className="metric-value">GH₵{totalLeakAmount.toLocaleString()}</div>
        </div>
        <div className="metric-card">
          <h4>Net Leak</h4>
          <div className="metric-value">{netLeak >= 0 ? '+' : ''}GH₵{netLeak.toLocaleString()}</div>
        </div>
        <div className="metric-card">
          <h4>Critical</h4>
          <div className="metric-value critical">{criticalCount}</div>
        </div>
        <div className="metric-card">
          <h4>High</h4>
          <div className="metric-value warning">{highCount}</div>
        </div>
      </div>

      <div className="leak-filters">
        <div className="filter-tabs">
          <button className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>Active ({leaks.filter(l => l.status === 'detected').length})</button>
          <button className={activeTab === 'resolved' ? 'active' : ''} onClick={() => setActiveTab('resolved')}>Resolved</button>
          <button className={activeTab === 'dismissed' ? 'active' : ''} onClick={() => setActiveTab('dismissed')}>Dismissed</button>
        </div>
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} className="severity-filter">
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      <div className="leaks-table">
        {filteredLeaks.length === 0 ? (
          <div className="no-leaks">✅ No revenue leaks detected</div>
        ) : (
          <table>
            <thead>
              <tr><th>Type</th><th>Title</th><th>Severity</th><th>Expected</th><th>Difference</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filteredLeaks.map(leak => (
                <tr key={leak.id} className={leak.severity}>
                  <td><span className="type-badge">{leak.type.replace('_', ' ')}</span></td>
                  <td>{leak.title}</td>
                  <td><span className={`severity-badge ${leak.severity}`}>{leak.severity.toUpperCase()}</span></td>
                  <td>GH₵{leak.expectedRevenue?.toLocaleString() || 'N/A'}</td>
                  <td className={leak.difference < 0 ? 'negative' : 'positive'}>
                    {leak.difference < 0 ? '-' : '+'}GH₵{Math.abs(leak.difference).toLocaleString()}
                  </td>
                  <td><span className={`status-badge ${leak.status}`}>{leak.status.toUpperCase()}</span></td>
                  <td>
                    {leak.status === 'detected' && (
                      <>
                        <button className="btn-sm resolve" onClick={() => markResolved(leak.id)}>Resolve</button>
                        <button className="btn-sm dismiss" onClick={() => dismissLeak(leak.id)}>Dismiss</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="leak-by-type">
        <h4>Leaks by Type</h4>
        {Object.entries(leaks.reduce((acc, l) => {
          if (!acc[l.type]) acc[l.type] = { count: 0, amount: 0 };
          acc[l.type].count++;
          acc[l.type].amount += Math.abs(l.difference);
          return acc;
        }, {})).map(([type, data]) => (
          <div key={type} className="type-summary">
            <span>{type.replace('_', ' ')}</span>
            <span>{data.count} leaks</span>
            <span className="amount">GH₵{data.amount.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RevenueLeakDetectionPanel;