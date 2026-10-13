import React, { useState } from 'react';

export function DemandSensingPanel({ 
  orders = [], 
  customers = [], 
  weatherForecast = [],
  events = [],
  historicalData = [],
  marketIndicators = [],
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('daily');
  const [viewMode, setViewMode] = useState('chart');

  const { 
    demandForecast, anomalies, loading, error, refresh,
    getDemandAtDate, getWeeklyDemand, adjustForecast,
    totalForecast, avgDailyDemand, peakDemand, anomalyCount
  } = React.useMemo(() => {
    const daily = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(Date.now() + i * 86400000);
      const base = 5000 + Math.sin(i / 30 * Math.PI * 2) * 1000 + Math.random() * 500;
      return {
        date: date.toISOString().split('T')[0],
        predictedVolume: Math.round(base),
        confidence: Math.round(75 + Math.random() * 20),
        weatherImpact: Math.random() > 0.7 ? '+15%' : 'None',
        eventImpact: Math.random() > 0.8 ? '+25%' : 'None',
        lowerBound: Math.round(base * 0.8),
        upperBound: Math.round(base * 1.2),
        dayType: date.getDay() === 0 || date.getDay() === 6 ? 'weekend' : 'weekday'
      };
    });

    const weekly = Array.from({ length: 8 }, (_, w) => {
      const weekStart = new Date(Date.now() + w * 7 * 86400000);
      const weekDays = daily.slice(w * 7, (w + 1) * 7);
      return {
        weekStart: weekStart.toISOString().split('T')[0],
        predictedVolume: weekDays.reduce((s, d) => s + d.predictedVolume, 0),
        avgConfidence: Math.round(weekDays.reduce((s, d) => s + d.confidence, 0) / 7),
        peakDay: weekDays.reduce((max, d) => d.predictedVolume > max.predictedVolume ? d : max).date
      };
    });

    const mockAnomalies = [
      { date: daily[5].date, type: 'spike', actualVolume: 8500, expectedVolume: 5200, deviation: 63, severity: 'high', possibleCauses: ['Festival', 'Weather'] },
      { date: daily[12].date, type: 'forecast_spike', predictedVolume: 9200, expectedVolume: 5100, deviation: 80, severity: 'high', confidence: 85, possibleCauses: ['Holiday surge'] }
    ];

    return {
      demandForecast: { daily, weekly, monthly: [], summary: { total30DayForecast: daily.reduce((s, d) => s + d.predictedVolume, 0), avgDailyVolume: Math.round(daily.reduce((s, d) => s + d.predictedVolume, 0) / 30), peakDay: daily.reduce((max, d) => d.predictedVolume > max.predictedVolume ? d : max), avgConfidence: Math.round(daily.reduce((s, d) => s + d.confidence, 0) / 30) } },
      anomalies: mockAnomalies,
      loading: false, error: null, refresh: () => {},
      getDemandAtDate: (d) => daily.find(x => x.date === new Date(d).toISOString().split('T')[0]),
      getWeeklyDemand: (w) => weekly.find(x => x.weekStart === new Date(w).toISOString().split('T')[0]),
      adjustForecast: (d, adj) => onNotice?.(`Adjusted ${d} by ${adj}`),
      totalForecast: daily.reduce((s, d) => s + d.predictedVolume, 0),
      avgDailyDemand: Math.round(daily.reduce((s, d) => s + d.predictedVolume, 0) / 30),
      peakDemand: Math.max(...daily.map(d => d.predictedVolume)),
      anomalyCount: mockAnomalies.length
    };
  }, [orders, customers, weatherForecast, events, historicalData, marketIndicators]);

  if (loading) return <div className="panel-loading">Sensing demand...</div>;
  if (error) return <div className="panel-error">Error: {error}</div>;

  return (
    <div className="demand-sensing-panel">
      <div className="panel-header">
        <h3>Demand Sensing</h3>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>↻ Refresh</button>
      </div>

      <div className="demand-metrics">
        <div className="metric-card"><h4>30-Day Forecast</h4><div className="metric-value">{totalForecast.toLocaleString()} gal</div></div>
        <div className="metric-card"><h4>Avg Daily</h4><div className="metric-value">{avgDailyDemand.toLocaleString()} gal</div></div>
        <div className="metric-card"><h4>Peak Day</h4><div className="metric-value">{peakDemand.toLocaleString()} gal</div></div>
        <div className="metric-card"><h4>Anomalies</h4><div className="metric-value warning">{anomalyCount}</div></div>
      </div>

      <div className="demand-tabs">
        <button className={activeTab === 'daily' ? 'active' : ''} onClick={() => setActiveTab('daily')}>Daily</button>
        <button className={activeTab === 'weekly' ? 'active' : ''} onClick={() => setActiveTab('weekly')}>Weekly</button>
        <button className={activeTab === 'anomalies' ? 'active' : ''} onClick={() => setActiveTab('anomalies')}>Anomalies ({anomalies.length})</button>
      </div>

      {activeTab === 'daily' && (
        <div className="daily-forecast">
          <div className="view-toggle">
            <button className={viewMode === 'chart' ? 'active' : ''} onClick={() => setViewMode('chart')}>Chart</button>
            <button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>Table</button>
          </div>
          {viewMode === 'chart' && (
            <div className="forecast-chart">
              {demandForecast.daily.map((d, i) => (
                <div key={i} className="chart-bar" style={{ height: `${Math.max(20, (d.predictedVolume / peakDemand) * 100)}%` }}>
                  <span className="bar-value">{Math.round(d.predictedVolume / 1000)}k</span>
                  <span className="bar-date">{d.date.split('-').slice(1).join('-')}</span>
                </div>
              ))}
            </div>
          )}
          {viewMode === 'table' && (
            <table>
              <thead><tr><th>Date</th><th>Forecast</th><th>Confidence</th><th>Weather</th><th>Event</th><th>Range</th><th>Type</th><th>Action</th></tr></thead>
              <tbody>
                {demandForecast.daily.map((d, i) => (
                  <tr key={i}>
                    <td>{d.date}</td>
                    <td>{d.predictedVolume.toLocaleString()} gal</td>
                    <td>{d.confidence}%</td>
                    <td>{d.weatherImpact}</td>
                    <td>{d.eventImpact}</td>
                    <td>{d.lowerBound.toLocaleString()} - {d.upperBound.toLocaleString()}</td>
                    <td>{d.dayType}</td>
                    <td><button className="btn-adjust" onClick={() => adjustForecast(d.date, 1.1)}>+10%</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'weekly' && (
        <div className="weekly-forecast">
          <table>
            <thead><tr><th>Week</th><th>Volume</th><th>Confidence</th><th>Peak Day</th></tr></thead>
            <tbody>
              {demandForecast.weekly.map((w, i) => (
                <tr key={i}>
                  <td>Week of {w.weekStart}</td>
                  <td>{w.predictedVolume.toLocaleString()} gal</td>
                  <td>{w.avgConfidence}%</td>
                  <td>{w.peakDay}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'anomalies' && (
        <div className="anomalies-list">
          {anomalies.map((a, i) => (
            <div key={i} className={`anomaly-card ${a.severity}`}>
              <div className="anomaly-header">
                <span className={`severity-badge ${a.severity}`}>{a.severity.toUpperCase()}</span>
                <span>{a.date}</span>
                <span>{a.type}</span>
              </div>
              <p>Deviation: {a.deviation}% | Expected: {a.expectedVolume?.toLocaleString() || a.predictedVolume?.toLocaleString()}</p>
              <div className="anomaly-causes">
                {a.possibleCauses?.map((c, j) => <span key={j} className="cause-tag">{c}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DemandSensingPanel;