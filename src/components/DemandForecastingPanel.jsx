import React, { useState, useMemo } from 'react';
import { useDemandForecasting } from '../hooks/useDemandForecasting';

export default function DemandForecastingPanel({ 
  orders = [], 
  weather = 'clear', 
  weatherForecast = [],
  onNotice 
}) {
  const [activeView, setActiveView] = useState('weekly');
  const [selectedZone, setSelectedZone] = useState(null);

  const {
    zones,
    heatmapData,
    weeklyForecast,
    highPotentialZones,
    loading,
    lastUpdated,
    refresh,
    getZoneForecast,
    formatCedi,
  } = useDemandForecasting({ orders, weather, weatherForecast, onNotice });

  const todayForecast = weeklyForecast[0];
  const totalWeeklyPredicted = weeklyForecast.reduce((sum, d) => sum + d.totalPredicted, 0);

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="section-kicker">DEMAND FORECASTING</span>
            <h2>AI-Powered Demand Prediction</h2>
          </div>
        </div>
        <div className="loading">Generating demand forecast...</div>
      </section>
    );
  }

  const zoneHeatmap = useMemo(() => {
    if (!heatmapData) return [];
    return zones.map(zone => {
      const stats = heatmapData.zoneStats[zone.id] || { count: 0, revenue: 0, avgOrderValue: 0 };
      return {
        ...zone,
        orders: stats.count,
        revenue: stats.revenue,
        avgOrderValue: stats.avgOrderValue,
        intensity: Math.min(1, stats.count / 50),
      };
    }).sort((a, b) => b.orders - a.orders);
  }, [heatmapData, zones]);

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">DEMAND FORECASTING</span>
          <h2>AI-Powered Demand Prediction</h2>
        </div>
        <div className="toolbar-actions">
          <select value={activeView} onChange={e => setActiveView(e.target.value)} className="view-select">
            <option value="weekly">Weekly Forecast</option>
            <option value="zones">Zone Heatmap</option>
            <option value="potential">High Potential</option>
            <option value="time">Time Analysis</option>
          </select>
          <button className="btn btn-ghost" onClick={refresh} disabled={loading}>
            <i data-lucide="refresh-cw" /> Refresh
          </button>
        </div>
      </div>

      <div className="forecast-summary">
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="trending-up" /></div>
          <div className="summary-content">
            <p className="summary-value">{todayForecast?.totalPredicted || 0}</p>
            <p className="summary-label">Orders Predicted Today</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="users" /></div>
          <div className="summary-content">
            <p className="summary-value">{todayForecast?.totalDriversNeeded || 0}</p>
            <p className="summary-label">Drivers Needed Today</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="calendar" /></div>
          <div className="summary-content">
            <p className="summary-value">{totalWeeklyPredicted}</p>
            <p className="summary-label">Weekly Predicted Orders</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="target" /></div>
          <div className="summary-content">
            <p className="summary-value">{highPotentialZones[0]?.zoneName || '—'}</p>
            <p className="summary-label">Top Opportunity Zone</p>
          </div>
        </article>
      </div>

      <div className="forecast-tabs">
        <div className="tab-nav">
          {['weekly', 'zones', 'potential', 'time'].map(view => (
            <button
              key={view}
              className={activeView === view ? 'active' : ''}
              onClick={() => setActiveView(view)}
            >
              {view.charAt(0).toUpperCase() + view.slice(1)}
            </button>
          ))}
        </div>

        {activeView === 'weekly' && (
          <div className="tab-content">
            <div className="weekly-forecast">
              {weeklyForecast.map((day, idx) => (
                <article key={day.date} className={`forecast-day ${idx === 0 ? 'today' : ''}`}>
                  <div className="day-header">
                    <span className="day-name">{day.dayName}</span>
                    <span className="day-date">{day.date}</span>
                    <span className="day-total">{day.totalPredicted} orders · {day.totalDriversNeeded} drivers</span>
                  </div>
                  <div className="day-zones">
                    {day.zones.slice(0, 4).map(zone => (
                      <div key={zone.zone} className="zone-prediction">
                        <span className="zone-name">{zone.zoneName}</span>
                        <span className="zone-pred">{zone.predictedOrders}</span>
                        <span className="zone-conf">{Math.round(zone.confidence * 100)}%</span>
                      </div>
                    ))}
                    {day.zones.length > 4 && (
                      <span className="more-zones">+{day.zones.length - 4} more zones</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeView === 'zones' && (
          <div className="tab-content">
            <div className="zone-heatmap">
              <div className="heatmap-legend">
                <span>Low</span>
                <div className="legend-bar">
                  {[0.2, 0.4, 0.6, 0.8, 1.0].map(v => (
                    <div key={v} className="legend-segment" style={{ background: `rgba(59, 130, 246, ${v})` }} />
                  ))}
                </div>
                <span>High</span>
              </div>
              <div className="zone-grid">
                {zoneHeatmap.map(zone => (
                  <article key={zone.id} className="zone-card" style={{ borderLeftColor: `rgba(59, 130, 246, ${Math.max(0.3, zone.intensity)})` }}>
                    <div className="zone-header">
                      <h4>{zone.name}</h4>
                      <span className="zone-intensity">{Math.round(zone.intensity * 100)}%</span>
                    </div>
                    <div className="zone-stats">
                      <div className="stat"><span className="stat-value">{zone.orders}</span><span className="stat-label">Orders (30d)</span></div>
                      <div className="stat"><span className="stat-value">{formatCedi(zone.revenue)}</span><span className="stat-label">Revenue</span></div>
                      <div className="stat"><span className="stat-value">{formatCedi(zone.avgOrderValue)}</span><span className="stat-label">Avg Order</span></div>
                    </div>
                    <div className="zone-bar">
                      <div className="zone-fill" style={{ width: `${zone.intensity * 100}%` }} />
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeView === 'potential' && (
          <div className="tab-content">
            <div className="potential-table">
              <table>
                <thead>
                  <tr>
                    <th>Zone</th>
                    <th>Potential Revenue</th>
                    <th>Current Orders</th>
                    <th>Avg Order Value</th>
                    <th>Market Penetration</th>
                    <th>Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {highPotentialZones.map((zone, idx) => (
                    <tr key={zone.zone}>
                      <td>
                        <span className="rank-badge">{idx + 1}</span>
                        {zone.zoneName}
                      </td>
                      <td>{formatCedi(zone.potential)}</td>
                      <td>{zone.currentOrders}</td>
                      <td>{formatCedi(zone.avgOrderValue)}</td>
                      <td>
                        <div className="penetration-bar">
                          <div className="penetration-fill" style={{ width: `${zone.penetration * 100}%` }} />
                        </div>
                        <span>{Math.round(zone.penetration * 100)}%</span>
                      </td>
                      <td><span className="recommendation">{zone.recommendation}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeView === 'time' && (
          <div className="tab-content">
            <div className="time-analysis">
              <div className="analysis-section">
                <h4>Time of Day Distribution</h4>
                {heatmapData?.timeStats && Object.entries(heatmapData.timeStats).map(([bucket, stats]) => (
                  <div key={bucket} className="time-bar">
                    <span className="bucket-label">{bucket.charAt(0).toUpperCase() + bucket.slice(1)}</span>
                    <div className="bar-container">
                      <div className="bar-fill" style={{ width: `${Math.min(100, (stats.count / Math.max(...Object.values(heatmapData.timeStats).map(s => s.count))) * 100)}%` }} />
                    </div>
                    <span className="bucket-value">{stats.count} orders</span>
                  </div>
                ))}
              </div>
              <div className="analysis-section">
                <h4>Day of Week Distribution</h4>
                {heatmapData?.dayStats && Object.entries(heatmapData.dayStats).map(([day, stats]) => {
                  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                  return (
                    <div key={day} className="time-bar">
                      <span className="bucket-label">{dayNames[parseInt(day)]}</span>
                      <div className="bar-container">
                        <div className="bar-fill" style={{ width: `${Math.min(100, (stats.count / Math.max(...Object.values(heatmapData.dayStats).map(s => s.count))) * 100)}%` }} />
                      </div>
                      <span className="bucket-value">{stats.count} orders</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {selectedZone && (
          <div className="tab-content zone-detail">
            <button className="close-detail" onClick={() => setSelectedZone(null)}>← Back</button>
            <h3>Zone Detail: {selectedZone.name}</h3>
            <div className="zone-detail-grid">
              <div className="detail-card">
                <h4>Today's Forecast</h4>
                <p className="big-number">{todayForecast?.zones.find(z => z.zone === selectedZone.id)?.predictedOrders || 0}</p>
                <p>Predicted orders</p>
              </div>
              <div className="detail-card">
                <h4>Peak Hours</h4>
                <ul>
                  {todayForecast?.zones.find(z => z.zone === selectedZone.id)?.peakHours?.map(h => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
              <div className="detail-card">
                <h4>Confidence</h4>
                <p className="big-number">{Math.round((todayForecast?.zones.find(z => z.zone === selectedZone.id)?.confidence || 0) * 100)}%</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="panel-footer">
        <span className="last-updated">Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}</span>
        <span className="data-source">Based on {orders.length} recent orders</span>
      </div>
    </section>
  );
}