import React, { useState, useMemo } from 'react';
import { useDriverPerformance } from '../hooks/useDriverPerformance';

export default function DriverPerformancePanel({ 
  drivers = [], 
  orders = [], 
  driverLocations = {},
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('leaderboard');
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [filterTier, setFilterTier] = useState('all');

  const {
    metrics,
    leaderboard,
    coachingAlerts,
    loading,
    lastUpdated,
    refresh,
    getDriverMetrics,
    getLeaderboard,
    getCoachingAlerts,
    getTierColor,
    formatCedi,
  } = useDriverPerformance({ drivers, orders, driverLocations, onNotice });

  const tiers = ['Elite', 'Pro', 'Standard', 'Needs Improvement', 'New'];
  const filteredLeaderboard = useMemo(() => {
    if (filterTier === 'all') return leaderboard;
    return leaderboard.filter(d => d.tier === filterTier);
  }, [leaderboard, filterTier]);

  const stats = useMemo(() => {
    const total = leaderboard.length;
    const elite = leaderboard.filter(d => d.tier === 'Elite').length;
    const needsCoaching = leaderboard.filter(d => d.tier === 'Needs Improvement').length;
    const avgScore = total > 0 ? Math.round(leaderboard.reduce((sum, d) => sum + d.efficiencyScore, 0) / total) : 0;
    const avgRating = total > 0 ? (leaderboard.reduce((sum, d) => sum + d.avgRating, 0) / total).toFixed(1) : 0;
    return { total, elite, needsCoaching, avgScore, avgRating };
  }, [leaderboard]);

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="section-kicker">DRIVER PERFORMANCE</span>
            <h2>AI-Powered Driver Analytics</h2>
          </div>
        </div>
        <div className="loading">Analyzing driver performance...</div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">DRIVER PERFORMANCE</span>
          <h2>AI-Powered Driver Analytics</h2>
        </div>
        <div className="toolbar-actions">
          <select value={filterTier} onChange={e => setFilterTier(e.target.value)} className="filter-select">
            <option value="all">All Tiers</option>
            {tiers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={refresh} disabled={loading}>
            <i data-lucide="refresh-cw" /> Refresh
          </button>
        </div>
      </div>

      <div className="performance-summary">
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="users" /></div>
          <div className="summary-content">
            <p className="summary-value">{stats.total}</p>
            <p className="summary-label">Active Drivers</p>
          </div>
        </article>
        <article className="summary-card elite">
          <div className="summary-icon"><i data-lucide="award" /></div>
          <div className="summary-content">
            <p className="summary-value">{stats.elite}</p>
            <p className="summary-label">Elite Drivers</p>
          </div>
        </article>
        <article className="summary-card warning">
          <div className="summary-icon"><i data-lucide="alert-triangle" /></div>
          <div className="summary-content">
            <p className="summary-value">{stats.needsCoaching}</p>
            <p className="summary-label">Need Coaching</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="star" /></div>
          <div className="summary-content">
            <p className="summary-value">{stats.avgScore}</p>
            <p className="summary-label">Avg Efficiency Score</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="heart" /></div>
          <div className="summary-content">
            <p className="summary-value">{stats.avgRating}/5.0</p>
            <p className="summary-label">Avg Customer Rating</p>
          </div>
        </article>
      </div>

      <div className="performance-tabs">
        <div className="tab-nav">
          {['leaderboard', 'coaching', 'details'].map(tab => (
            <button
              key={tab}
              className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'coaching' && coachingAlerts.length > 0 && (
                <span className="badge">{coachingAlerts.length}</span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'leaderboard' && (
          <div className="tab-content">
            <div className="leaderboard-table">
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Driver</th>
                    <th>Tier</th>
                    <th>Score</th>
                    <th>Orders</th>
                    <th>On-Time</th>
                    <th>Completion</th>
                    <th>Rating</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaderboard.map(driver => (
                    <tr 
                      key={driver.driverId} 
                      onClick={() => setSelectedDriver(driver.driverId)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td><span className="rank">{driver.rank}</span></td>
                      <td className="driver-name">{driver.driverName}</td>
                      <td>
                        <span 
                          className="tier-badge" 
                          style={{ background: getTierColor(driver.tier), color: 'white' }}
                        >
                          {driver.tier}
                        </span>
                      </td>
                      <td>
                        <div className="score-bar">
                          <div className="score-fill" style={{ width: `${driver.efficiencyScore}%`, background: getTierColor(driver.tier) }} />
                        </div>
                        <span>{driver.efficiencyScore}</span>
                      </td>
                      <td>{driver.completedOrders}/{driver.totalOrders}</td>
                      <td>{Math.round(driver.onTimeRate * 100)}%</td>
                      <td>{Math.round(driver.completionRate * 100)}%</td>
                      <td>{driver.avgRating.toFixed(1)}</td>
                      <td>{formatCedi(driver.totalRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'coaching' && (
          <div className="tab-content">
            {coachingAlerts.length === 0 ? (
              <div className="empty-state">
                <i data-lucide="check-circle" className="success" />
                <h3>All drivers performing well!</h3>
                <p>No coaching interventions needed at this time.</p>
              </div>
            ) : (
              <div className="coaching-alerts">
                {coachingAlerts.map(alert => (
                  <article key={alert.driverId} className="coaching-card">
                    <div className="coaching-header">
                      <div>
                        <h4>{alert.driverName}</h4>
                        <span className="driver-id">{alert.driverId}</span>
                      </div>
                      <span className="alert-count">{alert.opportunities.length} areas</span>
                    </div>
                    <div className="coaching-items">
                      {alert.opportunities.map((opp, idx) => (
                        <div key={idx} className={`coaching-item ${opp.severity}`}>
                          <div className="item-header">
                            <span className="item-type">{opp.type}</span>
                            <span className={`severity-badge ${opp.severity}`}>{opp.severity}</span>
                          </div>
                          <p className="item-message">{opp.message}</p>
                          <p className="item-action"><i data-lucide="arrow-right" /> {opp.action}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'details' && selectedDriver && (
          <div className="tab-content driver-detail">
            <button className="close-detail" onClick={() => setSelectedDriver(null)}>← Back to Leaderboard</button>
            {(() => {
              const driver = getDriverMetrics(selectedDriver);
              if (!driver) return <div>Driver not found</div>;
              
              const trends = generateWeeklyTrends(orders, selectedDriver);
              
              return (
                <div className="driver-detail-view">
                  <div className="driver-profile">
                    <div className="profile-header">
                      <div className="avatar">{driver.driverName.charAt(0)}</div>
                      <div>
                        <h3>{driver.driverName}</h3>
                        <span className="tier-badge" style={{ background: getTierColor(driver.tier), color: 'white' }}>
                          {driver.tier}
                        </span>
                      </div>
                      <div className="profile-score">
                        <div className="score-circle" style={{ background: `conic-gradient(${getTierColor(driver.tier)} ${driver.efficiencyScore * 3.6}deg, #e5e7eb 0deg)` }}>
                          <span>{driver.efficiencyScore}</span>
                        </div>
                        <p>Efficiency Score</p>
                      </div>
                    </div>
                    
                    <div className="metric-grid">
                      <div className="metric-card">
                        <span className="metric-value">{driver.completedOrders}/{driver.totalOrders}</span>
                        <span className="metric-label">Completed</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{Math.round(driver.onTimeRate * 100)}%</span>
                        <span className="metric-label">On-Time Rate</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{Math.round(driver.completionRate * 100)}%</span>
                        <span className="metric-label">Completion Rate</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{driver.avgRating.toFixed(1)}/5.0</span>
                        <span className="metric-label">Avg Rating</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{driver.avgDeliveryTime} min</span>
                        <span className="metric-label">Avg Delivery Time</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{driver.ordersPerHour.toFixed(1)}/hr</span>
                        <span className="metric-label">Orders/Hour</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{formatCedi(driver.totalRevenue)}</span>
                        <span className="metric-label">Total Revenue</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-value">{driver.fuelEfficiency} km/L</span>
                        <span className="metric-label">Fuel Efficiency</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="trends-section">
                    <h4>Weekly Trends (Last 4 Weeks)</h4>
                    <div className="trends-grid">
                      {trends.map(week => (
                        <div key={week.week} className="trend-card">
                          <div className="trend-header">{week.label}</div>
                          <div className="trend-stats">
                            <div>{week.orders} orders</div>
                            <div>{week.completed} completed</div>
                            <div>{formatCedi(week.revenue)}</div>
                            <div>★ {week.rating.toFixed(1)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
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

function generateWeeklyTrends(orders, driverId, weeks = 4) {
  const trends = [];
  const now = new Date();
  
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (i + 1) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    const weekOrders = orders.filter(o => {
      const date = new Date(o.createdAt);
      return o.driverId === driverId && date >= weekStart && date <= weekEnd;
    });
    
    const completed = weekOrders.filter(o => o.status === 'Delivered');
    const revenue = completed.reduce((sum, o) => sum + (o.total || 0), 0);
    const ratings = completed.filter(o => o.rating).map(o => o.rating);
    const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    
    trends.push({
      week: weekStart.toISOString().split('T')[0],
      label: `Week ${weeks - i}`,
      orders: weekOrders.length,
      completed: completed.length,
      revenue: Math.round(revenue),
      rating: avgRating,
    });
  }
  
  return trends;
}