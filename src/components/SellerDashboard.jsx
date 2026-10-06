import { useState, useEffect, useMemo } from 'react';
import { formatCedi } from '../lib/money';
import useSellerDashboard from '../hooks/useSellerDashboard';
import useDemandForecast from '../hooks/useDemandForecast';
import useSmartAssignment from '../hooks/useSmartAssignment';
import usePredictiveAnalytics from '../hooks/usePredictiveAnalytics';
import useDynamicPricing from '../hooks/useDynamicPricing';
import useSellerInventory from '../hooks/useSellerInventory';
import useLoadBalancing from '../hooks/useLoadBalancing';

function JobCard({ order, driver, onAccept, onStart, onComplete, onView }) {
  const statusColors = {
    'Awaiting payment': 'status-awaiting',
    'Assigned': 'status-assigned',
    'En Route': 'status-enroute',
    'Delivered': 'status-delivered',
    'Cancelled': 'status-cancelled',
  };

  return (
    <article className="job-card panel">
      <div className="job-header">
        <div>
          <strong>{order.code}</strong>
          <small>{order.location}</small>
        </div>
        <span className={`status ${statusColors[order.status] || ''}`}>{order.status}</span>
      </div>

      <div className="job-details">
        <div><span>Volume:</span> <strong>{order.volume}</strong></div>
        <div><span>Value:</span> <strong>{formatCedi(order.chargedMinor ?? 0)}</strong></div>
        <div><span>Your share:</span> <strong>{formatCedi(order.sellerReceives ?? 0)}</strong></div>
        {driver && (
          <div className="driver-assignment">
            <span>Driver:</span> <strong>{driver.name}</strong>
            <small>({driver.base.split(',')[0]}) · {driver.vehicle}</small>
          </div>
        )}
      </div>

      <div className="job-actions">
        {order.status === 'Awaiting payment' && (
          <button className="primary-button" type="button" onClick={() => onAccept(order.id)}>
            Accept Job
          </button>
        )}
        {order.status === 'Assigned' && (
          <button className="primary-button" type="button" onClick={() => onStart(order.id)}>
            Start Delivery
          </button>
        )}
        {order.status === 'En Route' && (
          <button className="outline-button" type="button" onClick={() => onComplete(order.id)}>
            Issue Delivery Code
          </button>
        )}
        {order.status === 'Delivered' && (
          <button className="text-button" type="button" onClick={() => onView(order.id)}>
            View Receipt
          </button>
        )}
      </div>
    </article>
  );
}

function DriverCard({ driver, location, onUpdateLocation }) {
  const [open, setOpen] = useState(false);
  const [loc, setLoc] = useState('');
  const [eta, setEta] = useState('');

  // There is no driver-side app feeding this dashboard, so the only honest
  // source of a driver's live position is the seller typing it. The old
  // "Simulate Move" button injected an invented "8 min" ETA; that is gone.
  function submit(event) {
    event.preventDefault();
    if (!loc.trim()) return;
    onUpdateLocation(driver.id, loc.trim(), eta.trim() || 'ETA unknown');
    setLoc('');
    setEta('');
    setOpen(false);
  }

  return (
    <article className="driver-card panel">
      <div className="driver-header">
        <div>
          <strong>{driver.name}</strong>
          <small>{driver.base.split(',')[0]} · {driver.vehicle}</small>
        </div>
        <span className={`status ${driver.status === 'online' ? 'status-online' : 'status-offline'}`}>
          {driver.status === 'online' ? 'Online' : 'Offline'}
        </span>
      </div>

      <div className="driver-stats">
        <div><span>Rating:</span> <strong>{driver.rating}★</strong></div>
        <div><span>Capacity:</span> <strong>{driver.capacityGallons} gal</strong></div>
        <div><span>Active jobs:</span> <strong>{driver.activeJobs}</strong></div>
      </div>

      {location && (
        <div className="driver-location">
          <span>📍</span>
          <strong>{location.location}</strong>
          <small>ETA: {location.eta}</small>
          <small className="last-update">Updated: {new Date(location.updatedAt).toLocaleTimeString()}</small>
        </div>
      )}

      <div className="driver-actions">
        {!open ? (
          <button type="button" onClick={() => setOpen(true)}>Update location</button>
        ) : (
          <form className="driver-location-form" onSubmit={submit}>
            <input
              aria-label={`Current location for ${driver.name}`}
              value={loc}
              onChange={(event) => setLoc(event.target.value)}
              placeholder="e.g. Labone, Accra"
            />
            <input
              aria-label={`ETA for ${driver.name}`}
              value={eta}
              onChange={(event) => setEta(event.target.value)}
              placeholder="ETA (e.g. 12 min)"
            />
            <button type="submit">Save</button>
            <button type="button" onClick={() => setOpen(false)}>Cancel</button>
          </form>
        )}
      </div>
    </article>
  );
}

function PayoutRow({ payout }) {
  return (
    <div className="payout-row">
      <div>
        <strong>{payout.orderId}</strong>
        <small>{new Date(payout.date).toLocaleDateString()}</small>
      </div>
      <strong>{payout.amount}</strong>
      <span className={`payout-status ${payout.status === 'Paid out' ? 'paid' : 'pending'}`}>
        {payout.status}
      </span>
    </div>
  );
}

export function SellerDashboard({
  available,
  setAvailable,
  showNotice,
  orders,
  updateOrderStatus,
  issueDeliveryCode,
  sellerProfile,
  setSellerProfile,
}) {
  const {
    activeJobs,
    completedJobs,
    refreshJobs,
    acceptJob,
    startJob,
    completeJob,
    refreshing,
    driverLocations,
    getAssignedDriver,
    updateDriverLocation,
    earnings,
    payoutHistory,
    vehicleInfo,
  } = useSellerDashboard({
    sellerProfile,
    orders,
    onNotice: showNotice,
    updateOrderStatus,
    issueDeliveryCode,
  });

  // Smart features
  const { forecast, summary: forecastSummary, trend, anomalies, peakHours, loading: forecastLoading, refresh: refreshForecast } = useDemandForecast({ orders, region: sellerProfile?.region });
  const { assignments, optimizationQueue, autoAssignEnabled, setAutoAssignEnabled, fleetStats, assignOrder, autoAssignAll, optimizeRoutes, applyOptimization, lastOptimization } = useSmartAssignment({ orders, driverPositions: driverLocations, onNotice: showNotice, updateOrderStatus });
  const { churnAnalysis, ltvPredictions, segments, anomalies: predAnomalies, revenueForecast, summary: analyticsSummary, loading: analyticsLoading, refresh: refreshAnalytics } = usePredictiveAnalytics({ orders, customers: [], driverPositions: driverLocations });
  const { pricing, experiments, customerProfile, loading: pricingLoading, refresh: refreshPricing, getPriceForVolume, getPriceExplanation, summary: pricingSummary } = useDynamicPricing({ orders, driverPositions: driverLocations, customerId: sellerProfile?.identifier, region: sellerProfile?.region });
  const { inventory, equipment, lowInventory, pendingMaintenance, reorderRecommendations, summary: inventorySummary, loading: inventoryLoading, recordDelivery, recordRestock, recordMaintenance } = useSellerInventory({ sellerProfile, orders, driverPositions: driverLocations, forecast });
  const { zoneLoads, driverWorkloads, rebalancingSuggestions, autoRebalanceEnabled, setAutoRebalanceEnabled, surgeMode, activateSurge, fleetSummary, refreshLoads } = useLoadBalancing({ orders, driverPositions: driverLocations, onNotice: showNotice });

  const [activeTab, setActiveTab] = useState('jobs');
  const [smartTab, setSmartTab] = useState('forecast');

  // Record deliveries for inventory tracking
  useEffect(() => {
    completedJobs.forEach(job => {
      if (job.status === 'Delivered' && !job.inventoryRecorded) {
        recordDelivery(job);
      }
    });
  }, [completedJobs, recordDelivery]);

  return (
    <>
      <div className="page-header">
        <div>
          <p className="section-kicker">SELLER WORKSPACE · {sellerProfile?.business?.split(' ')[0]?.toUpperCase() || 'ACCRA'}</p>
          <h1>Ready for the next job?</h1>
          <p>Keep your status current and turn more deliveries into income.</p>
        </div>
        <button
          className={`availability ${available ? 'online' : ''}`}
          type="button"
          onClick={() => {
            setAvailable(!available);
            showNotice(available ? 'You are now offline.' : 'You are back online and visible to buyers.');
          }}
        >
          <i />{available ? 'Online and accepting jobs' : 'Offline'}
        </button>
      </div>

      <div className="seller-tabs">
        <button className={activeTab === 'jobs' ? 'active' : ''} onClick={() => setActiveTab('jobs')}>Job Queue</button>
        <button className={activeTab === 'drivers' ? 'active' : ''} onClick={() => setActiveTab('drivers')}>Drivers</button>
        <button className={activeTab === 'earnings' ? 'active' : ''} onClick={() => setActiveTab('earnings')}>Earnings</button>
        <button className={activeTab === 'inventory' ? 'active' : ''} onClick={() => setActiveTab('inventory')}>Inventory</button>
        <button className={activeTab === 'smart' ? 'active' : ''} onClick={() => setActiveTab('smart')}>Smart Hub</button>
        <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>Profile</button>
      </div>

      {activeTab === 'jobs' && (
        <section className="panel">
          <div className="panel-toolbar">
            <div className="panel-title">
              <span className="section-kicker">JOB QUEUE</span>
              <h2>{activeJobs.length} active · {completedJobs.length} completed</h2>
            </div>
            <button className="outline-button" type="button" onClick={refreshJobs} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>

          {activeJobs.length === 0 ? (
            <p className="empty-feed">No active jobs. New orders will appear here when buyers book.</p>
          ) : (
            <div className="job-list">
              {activeJobs.map((order) => (
                <JobCard
                  key={order.id}
                  order={order}
                  driver={getAssignedDriver(order.id)}
                  onAccept={acceptJob}
                  onStart={startJob}
                  onComplete={completeJob}
                  onView={() => showNotice(`Receipt for ${order.id} ready.`)}
                />
              ))}
            </div>
          )}

          <details className="completed-section">
            <summary>Completed jobs ({completedJobs.length})</summary>
            {completedJobs.length === 0 ? (
              <p className="empty-feed">No completed jobs yet.</p>
            ) : (
              <div className="job-list compact">
                {completedJobs.slice(0, 10).map((order) => (
                  <JobCard
                    key={order.id}
                    order={order}
                    driver={getAssignedDriver(order.id)}
                    onAccept={() => {}}
                    onStart={() => {}}
                    onComplete={() => {}}
                    onView={() => showNotice(`Receipt for ${order.id} ready.`)}
                  />
                ))}
              </div>
            )}
          </details>
        </section>
      )}

      {activeTab === 'drivers' && (
        <section className="panel">
          <div className="panel-title">
            <span className="section-kicker">ASSIGNED DRIVERS</span>
            <h2>Track your fleet in real time</h2>
          </div>
          <p className="panel-copy">Drivers assigned to your orders. Update their location manually or via the driver app (when connected).</p>

          <div className="driver-grid">
            {activeJobs
              .map((order) => getAssignedDriver(order.id))
              .filter(Boolean)
              .map((driver) => (
                <DriverCard
                  key={driver.id}
                  driver={driver}
                  location={driverLocations[driver.id]}
                  onUpdateLocation={updateDriverLocation}
                />
              ))}
          </div>

          {activeJobs.length === 0 && (
            <p className="empty-feed">No drivers currently assigned. Accept a job to see driver details.</p>
          )}
        </section>
      )}

      {activeTab === 'earnings' && (
        <section className="panel">
          <div className="earnings-summary">
            <article className="earnings-card highlight">
              <span>TOTAL EARNED</span>
              <strong>{earnings.totalEarned}</strong>
              <small>From {earnings.ordersCompleted} completed delivery{earnings.ordersCompleted !== 1 ? 's' : ''}</small>
            </article>
            <article className="earnings-card">
              <span>AVG ORDER VALUE</span>
              <strong>{earnings.avgOrderValue}</strong>
              <small>Per delivered order</small>
            </article>
            <article className="earnings-card">
              <span>TOTAL VOLUME</span>
              <strong>{earnings.totalVolume} deliveries</strong>
              <small>Gallons delivered</small>
            </article>
            <article className="earnings-card warning">
              <span>PENDING PAYOUT</span>
              <strong>{earnings.pendingPayout}</strong>
              <small>Awaiting buyer payment</small>
            </article>
          </div>

          <div className="panel-divider" />

          <div className="panel-title">
            <span className="section-kicker">PAYOUT HISTORY</span>
            <h2>Recent payouts</h2>
          </div>

          {payoutHistory.length === 0 ? (
            <p className="empty-feed">No payouts yet. Complete deliveries to see history.</p>
          ) : (
            <div className="payout-table">
              <div className="payout-header">
                <span>Order</span>
                <span>Amount</span>
                <span>Status</span>
              </div>
              {payoutHistory.map((payout, index) => (
                <PayoutRow key={payout.orderId + index} payout={payout} />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'inventory' && (
        <section className="panel">
          <div className="panel-toolbar">
            <div className="panel-title">
              <span className="section-kicker">INVENTORY & MAINTENANCE</span>
              <h2>{inventorySummary.itemsTracked} items · {lowInventory.length} low stock · {pendingMaintenance.length} maintenance due</h2>
            </div>
            <button className="outline-button" type="button" onClick={() => {}} disabled={inventoryLoading}>
              {inventoryLoading ? 'Loading…' : '↻ Refresh'}
            </button>
          </div>

          <div className="inventory-alerts">
            {lowInventory.length > 0 && (
              <div className="alert-banner warning">
                <strong>{lowInventory.length} items need attention</strong>
                <button className="text-button" onClick={() => {}}>View Reorders</button>
              </div>
            )}
            {pendingMaintenance.length > 0 && (
              <div className="alert-banner critical">
                <strong>{pendingMaintenance.length} equipment items need maintenance</strong>
                <button className="text-button" onClick={() => {}}>Schedule Service</button>
              </div>
            )}
          </div>

          <div className="inventory-grid">
            {inventory.map(item => (
              <article key={item.id} className="inventory-card panel">
                <div className="inventory-header">
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.type.replace('_', ' ').toUpperCase()}</small>
                  </div>
                  <span className={`status ${item.health === 'healthy' ? 'status-delivered' : item.health === 'warning' ? 'status-awaiting' : item.health === 'low' ? 'status-enroute' : 'status-cancelled'}`}>
                    {item.health.toUpperCase()}
                  </span>
                </div>
                <div className="inventory-stats">
                  <div><span>Current:</span> <strong>{item.current.toLocaleString()} {item.unit}</strong></div>
                  <div><span>Daily Usage:</span> <strong>{item.dailyUsage?.toFixed(1) || 0} {item.unit}/day</strong></div>
                  <div><span>Days Remaining:</span> <strong>{item.daysRemaining}</strong></div>
                  <div><span>Value:</span> <strong>{formatCedi(item.current * item.costPerUnit * 100)}</strong></div>
                </div>
                {item.reorderQty > 0 && (
                  <div className="reorder-info">
                    <span className="reorder-badge">Reorder: {item.reorderQty} {item.unit}</span>
                    <span className="reorder-cost">Est. {formatCedi(item.reorderCost * 100)}</span>
                    <span className="reorder-supplier">Supplier: {item.supplier}</span>
                    <span className="reorder-lead">Lead: {item.leadTime} days</span>
                  </div>
                )}
              </article>
            ))}
          </div>

          <div className="panel-divider" />

          <div className="panel-title">
            <span className="section-kicker">EQUIPMENT HEALTH</span>
            <h2>{equipment.length} assets · {pendingMaintenance.filter(e => e.maintenance.urgency === 'overdue').length} overdue</h2>
          </div>
          <div className="equipment-grid">
            {equipment.map(eq => (
              <article key={eq.id} className="equipment-card panel">
                <div className="equipment-header">
                  <div>
                    <strong>{eq.name}</strong>
                    <small>{eq.assetTag} · {eq.type.toUpperCase()}</small>
                  </div>
                  <span className={`status ${eq.maintenance.urgency === 'overdue' ? 'status-cancelled' : eq.maintenance.urgency === 'due_soon' ? 'status-enroute' : 'status-delivered'}`}>
                    {eq.maintenance.urgency.toUpperCase()}
                  </span>
                </div>
                <div className="equipment-stats">
                  {eq.type === 'vehicle' && (
                    <>
                      <div><span>KM:</span> <strong>{eq.usage.km?.toLocaleString() || 0}</strong></div>
                      <div><span>Hours:</span> <strong>{eq.usage.hours?.toLocaleString() || 0}</strong></div>
                      <div><span>KM to Service:</span> <strong>{eq.maintenance.kmRemaining?.toLocaleString() || 'N/A'}</strong></div>
                    </>
                  )}
                  {eq.type === 'pump' && (
                    <>
                      <div><span>Hours:</span> <strong>{eq.usage.hours?.toLocaleString() || 0}</strong></div>
                      <div><span>Hours to Service:</span> <strong>{eq.maintenance.hoursRemaining?.toLocaleString() || 'N/A'}</strong></div>
                    </>
                  )}
                  {eq.type === 'filter' && (
                    <>
                      <div><span>Volume Processed:</span> <strong>{eq.usage.volume?.toLocaleString() || 0} gal</strong></div>
                      <div><span>Volume to Replace:</span> <strong>{eq.maintenance.daysRemaining || 'N/A'} days</strong></div>
                    </>
                  )}
                  <div><span>Total Maint. Cost:</span> <strong>{formatCedi(eq.totalMaintenanceCost * 100)}</strong></div>
                </div>
                {eq.maintenance.urgency !== 'ok' && (
                  <button className="primary-button" type="button" onClick={() => recordMaintenance(eq.id, 'scheduled', 'Routine service', 0, 'internal')}>
                    Schedule Maintenance
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'smart' && (
        <section className="panel">
          <div className="panel-toolbar">
            <div className="panel-title">
              <span className="section-kicker">SMART HUB</span>
              <h2>AI-Powered Insights & Automation</h2>
            </div>
          </div>

          <div className="smart-tabs">
            <button className={smartTab === 'forecast' ? 'active' : ''} onClick={() => setSmartTab('forecast')}>Demand Forecast</button>
            <button className={smartTab === 'assignment' ? 'active' : ''} onClick={() => setSmartTab('assignment')}>Auto-Assignment</button>
            <button className={smartTab === 'analytics' ? 'active' : ''} onClick={() => setSmartTab('analytics')}>Predictive Analytics</button>
            <button className={smartTab === 'pricing' ? 'active' : ''} onClick={() => setSmartTab('pricing')}>Dynamic Pricing</button>
            <button className={smartTab === 'notifications' ? 'active' : ''} onClick={() => setSmartTab('notifications')}>Smart Alerts</button>
            <button className={smartTab === 'loadbalance' ? 'active' : ''} onClick={() => setSmartTab('loadbalance')}>Load Balancing</button>
          </div>

          {smartTab === 'forecast' && (
            <div className="smart-panel">
              {forecastLoading ? <div className="loading-state"><div className="loading-spinner" /></div> : forecast?.error ? (
                <div className="empty-feed">{forecast.error} ({forecast.ordersCount} orders)</div>
              ) : forecast && forecast.length > 0 ? (
                <>
                  <div className="forecast-summary">
                    <article className="forecast-card">
                      <span>Next 7 Days</span>
                      <strong>{forecastSummary?.next7DaysOrders || 0} orders</strong>
                    </article>
                    <article className="forecast-card">
                      <span>Next 30 Days</span>
                      <strong>{forecastSummary?.next30DaysOrders || 0} orders</strong>
                    </article>
                    <article className="forecast-card">
                      <span>Avg Daily</span>
                      <strong>{forecastSummary?.avgDailyOrders || 0}</strong>
                    </article>
                    <article className="forecast-card">
                      <span>Trend</span>
                      <strong>{trend}</strong>
                    </article>
                    <article className="forecast-card warning">
                      <span>Anomalies</span>
                      <strong>{anomalies?.length || 0}</strong>
                    </article>
                  </div>
                  <div className="forecast-chart">
                    {forecast.slice(0, 14).map((day, i) => (
                      <div key={day.date} className="forecast-day" title={day.date}>
                        <div className="forecast-bar" style={{ height: `${Math.max(5, (day.predictedOrders / (forecastSummary?.avgDailyOrders || 1)) * 100)}%` }} />
                        <span className="forecast-label">{day.dayOfWeek.slice(0,3)}</span>
                        <span className="forecast-value">{day.predictedOrders}</span>
                      </div>
                    ))}
                  </div>
                  <>
                    {anomalies?.length > 0 && (
                      <>
                        <div className="panel-divider" />
                        <h4>⚠ Detected Anomalies</h4>
                        <div className="anomaly-list">
                          {anomalies.slice(0, 5).map((a, i) => (
                            <div key={i} className="anomaly-item">
                              <span>{a.date}</span>
                              <span>{a.actualOrders} vs expected {a.expectedRange}</span>
                              <span className={`severity ${a.severity}`}>{a.severity}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                </>
              ) : (
                <p className="empty-feed">Need at least 10 orders for forecasting. Complete more deliveries to unlock AI predictions.</p>
              )}
            </div>
          )}

          {smartTab === 'assignment' && (
            <div className="smart-panel">
              <div className="assignment-stats">
                <article className="stat-card">
                  <span>Pending Assignment</span>
                  <strong>{fleetStats.unassignedOrders}</strong>
                </article>
                <article className="stat-card">
                  <span>Available Drivers</span>
                  <strong>{fleetStats.availableDrivers}</strong>
                </article>
                <article className="stat-card">
                  <span>Auto-Assign</span>
                  <strong>{autoAssignEnabled ? 'ON' : 'OFF'}</strong>
                </article>
                <article className="stat-card">
                  <span>Pending Optimizations</span>
                  <strong>{fleetStats.pendingOptimizations}</strong>
                </article>
              </div>
              <div className="assignment-controls">
                <label className="toggle-label">
                  <input type="checkbox" checked={autoAssignEnabled} onChange={e => setAutoAssignEnabled(e.target.checked)} />
                  <span>Enable Auto-Assignment</span>
                </label>
                <button className="primary-button" onClick={autoAssignAll} disabled={fleetStats.unassignedOrders === 0 || fleetStats.availableDrivers === 0}>
                  Assign All Now
                </button>
                <button className="outline-button" onClick={optimizeRoutes} disabled={fleetStats.pendingOptimizations === 0}>
                  Optimize Routes
                </button>
              </div>
              <>
                {optimizationQueue.length > 0 && (
                  <>
                    <div className="panel-divider" />
                    <h4>Route Optimizations</h4>
                    <div className="optimization-list">
                      {optimizationQueue.map((opt, i) => (
                        <div key={i} className="optimization-item">
                          <span>Driver {opt.driverId}</span>
                          <span>{opt.optimizedOrders.length} stops optimized</span>
                          <button className="text-button" onClick={() => applyOptimization(opt.id)}>Apply</button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            </div>
          )}

          {smartTab === 'analytics' && (
            <div className="smart-panel">
              {analyticsLoading ? <div className="loading-state"><div className="loading-spinner" /></div> : (
                <>
                  <div className="analytics-summary">
                    <article className="analytics-card">
                      <span>Total Customers</span>
                      <strong>{analyticsSummary.totalCustomers}</strong>
                    </article>
                    <article className="analytics-card warning">
                      <span>At Risk</span>
                      <strong>{analyticsSummary.atRiskCustomers}</strong>
                    </article>
                    <article className="analytics-card highlight">
                      <span>VIP Customers</span>
                      <strong>{analyticsSummary.vipCustomers}</strong>
                    </article>
                    <article className="analytics-card">
                      <span>Predicted LTV</span>
                      <strong>{formatCedi(analyticsSummary.totalPredictedLTV * 100)}</strong>
                    </article>
                    <article className="analytics-card critical">
                      <span>Critical Anomalies</span>
                      <strong>{analyticsSummary.criticalAnomalies}</strong>
                    </article>
                    <article className="analytics-card">
                      <span>30-Day Revenue Forecast</span>
                      <strong>{formatCedi((analyticsSummary.revenueForecast30d || 0) * 100)}</strong>
                    </article>
                  </div>
                  <div className="panel-divider" />
                  <h4>Customer Segments</h4>
                  <div className="segment-list">
                    {Object.entries(segments).map(([segment, count]) => (
                      <div key={segment} className="segment-item">
                        <span className="segment-name">{segment.replace('_', ' ').toUpperCase()}</span>
                        <span className="segment-count">{count} customers</span>
                      </div>
                    ))}
                  </div>
                  <div className="panel-divider" />
                  <h4>Recent Anomalies</h4>
                  <div className="anomaly-list">
                    {predAnomalies?.slice(0, 5).map((a, i) => (
                      <div key={i} className="anomaly-item">
                        <span>{a.type}</span>
                        <span>{a.description}</span>
                        <span className={`severity ${a.severity}`}>{a.severity}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {smartTab === 'pricing' && (
            <div className="smart-panel">
              {pricingLoading ? <div className="loading-state"><div className="loading-spinner" /></div> : (
                <>
                  <div className="pricing-summary">
                    <article className="pricing-card">
                      <span>Avg Multiplier</span>
                      <strong>{pricingSummary.avgMultiplier}x</strong>
                    </article>
                    <article className={pricingSummary.surgeActive ? 'pricing-card warning' : 'pricing-card'}>
                      <span>Surge Active</span>
                      <strong>{pricingSummary.surgeActive ? 'YES' : 'NO'}</strong>
                    </article>
                    <article className={pricingSummary.discountActive ? 'pricing-card highlight' : 'pricing-card'}>
                      <span>Discount Active</span>
                      <strong>{pricingSummary.discountActive ? 'YES' : 'NO'}</strong>
                    </article>
                  </div>
                  <div className="panel-divider" />
                  <h4>Current Prices by Volume</h4>
                  <div className="pricing-table">
                    <div className="pricing-header">
                      <span>Volume</span>
                      <span>Base Price</span>
                      <span>Current Price</span>
                      <span>Multiplier</span>
                      <span>Explanation</span>
                    </div>
                    {Object.entries(pricing).map(([volume, price]) => (
                      <div key={volume} className="pricing-row">
                        <span>{volume}</span>
                        <span>{formatCedi((price.basePrice || 0) * 100)}</span>
                        <span className={price.multiplier > 1.1 ? 'surge' : price.multiplier < 0.95 ? 'discount' : ''}>
                          {formatCedi((price.finalPrice || 0) * 100)}
                        </span>
                        <span>{price.multiplier.toFixed(2)}x</span>
                        <span className="pricing-explanation">{getPriceExplanation(volume)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {smartTab === 'notifications' && (
            <div className="smart-panel">
              <div className="notification-stats">
                <article className="stat-card">
                  <span>Unread</span>
                  <strong>{unreadCount}</strong>
                </article>
                <article className="stat-card">
                  <span>Push Enabled</span>
                  <strong>{preferences.pushEnabled ? 'ON' : 'OFF'}</strong>
                </article>
                <article className="stat-card">
                  <span>Quiet Hours</span>
                  <strong>{preferences.quietHoursEnabled ? 'ON' : 'OFF'}</strong>
                </article>
              </div>
              <div className="panel-divider" />
              <h4>Recent Notifications</h4>
              <div className="notification-list">
                {notifications.slice(0, 10).map(n => (
                  <div key={n.id} className={`notification-item ${n.readAt ? 'read' : 'unread'}`}>
                    <div className="notification-content">
                      <strong>{n.title}</strong>
                      <span>{n.body}</span>
                      <small>{new Date(n.createdAt).toLocaleString()}</small>
                    </div>
                    {!n.readAt && <button className="text-button" onClick={() => {}}>Mark Read</button>}
                  </div>
                ))}
              </div>
              <div className="panel-divider" />
              <h4>Preferences</h4>
              <div className="preference-grid">
                {Object.entries(preferences).filter(([k]) => k !== 'quietHoursStart' && k !== 'quietHoursEnd').map(([key, value]) => (
                  <label key={key} className="preference-item">
                    <input type="checkbox" checked={value} onChange={e => {}} />
                    <span>{key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {smartTab === 'loadbalance' && (
            <div className="smart-panel">
              <div className="loadbalance-summary">
                <article className="stat-card">
                  <span>Online Drivers</span>
                  <strong>{fleetSummary.onlineDrivers}</strong>
                </article>
                <article className="stat-card">
                  <span>On Job</span>
                  <strong>{fleetSummary.onJobDrivers}</strong>
                </article>
                <article className="stat-card">
                  <span>Pending Orders</span>
                  <strong>{fleetSummary.totalPendingOrders}</strong>
                </article>
                <article className="stat-card">
                  <span>Avg Utilization</span>
                  <strong>{fleetSummary.avgZoneUtilization}%</strong>
                </article>
                <article className={fleetSummary.surgeActive ? 'stat-card warning' : 'stat-card'}>
                  <span>Surge Mode</span>
                  <strong>{fleetSummary.surgeActive ? 'ACTIVE' : 'OFF'}</strong>
                </article>
              </div>
              <div className="loadbalance-controls">
                <label className="toggle-label">
                  <input type="checkbox" checked={autoRebalanceEnabled} onChange={e => setAutoRebalanceEnabled(e.target.checked)} />
                  <span>Auto Rebalance</span>
                </label>
                <label className="toggle-label">
                  <input type="checkbox" checked={surgeMode} onChange={e => activateSurge(e.target.checked)} />
                  <span>Surge Pricing</span>
                </label>
                <button className="outline-button" onClick={refreshLoads}>Refresh Zones</button>
              </div>
              <div className="panel-divider" />
              <h4>Zone Load</h4>
              <div className="zone-grid">
                {zoneLoads.map(zone => (
                  <article key={zone.zoneId} className="zone-card panel">
                    <div className="zone-header">
                      <strong>{zone.zoneName}</strong>
                      <span className={`pressure ${zone.pressure}`}>{zone.pressure.toUpperCase()}</span>
                    </div>
                    <div className="zone-stats">
                      <div><span>Pending:</span> <strong>{zone.pendingOrders}</strong></div>
                      <div><span>Active:</span> <strong>{zone.activeOrders}</strong></div>
                      <div><span>Drivers:</span> <strong>{zone.availableDrivers} avail / {zone.busyDrivers} busy</strong></div>
                      <div><span>Utilization:</span> <strong>{zone.utilization.toFixed(0)}%</strong></div>
                    </div>
                  </article>
                ))}
              </div>
              {rebalancingSuggestions.length > 0 && (
                <>
                  <div className="panel-divider" />
                  <h4>Rebalancing Suggestions</h4>
                  <div className="suggestion-list">
                    {rebalancingSuggestions.map((s, i) => (
                      <div key={i} className="suggestion-item">
                        <span className="suggestion-type">{s.type}</span>
                        <span>{s.reason}</span>
                        <button className="text-button" onClick={() => applyRebalancing(s)}>Apply</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === 'profile' && (
        <section className="panel">
          <div className="panel-title">
            <span className="section-kicker">SELLER PROFILE</span>
            <h2>Your business and vehicle details</h2>
          </div>

          <form className="seller-form" onSubmit={(event) => {
            event.preventDefault();
            showNotice('Profile updated. Ops will review changes within one business day.');
          }}>
            <div className="form-row">
              <label>Business name<input name="business" value={sellerProfile.business} onChange={(e) => setSellerProfile({ ...sellerProfile, business: e.target.value })} placeholder="Business name" /></label>
              <label>Phone<input name="phone" value={sellerProfile.phone} onChange={(e) => setSellerProfile({ ...sellerProfile, phone: e.target.value })} placeholder="Phone number" inputMode="tel" /></label>
            </div>
            <div className="form-row">
              <label>Vehicle registration<input name="vehicle" value={sellerProfile.vehicle} onChange={(e) => setSellerProfile({ ...sellerProfile, vehicle: e.target.value })} placeholder="Vehicle registration" /></label>
              <label>Tank capacity<select name="capacity" value={sellerProfile.capacity} onChange={(e) => setSellerProfile({ ...sellerProfile, capacity: e.target.value })}>
                <option>1,000 gallons</option>
                <option>2,000 gallons</option>
                <option>5,000 gallons</option>
                <option>10,000 gallons</option>
              </select></label>
            </div>
            <div className="form-row">
              <label>Verification documents<select name="document" value={sellerProfile.document} onChange={(e) => setSellerProfile({ ...sellerProfile, document: e.target.value })}>
                <option>ID document not uploaded</option>
                <option>ID document uploaded</option>
                <option>ID + vehicle documents uploaded</option>
                <option>All documents verified</option>
              </select></label>
            </div>
            <button className="primary-button" type="submit">Save Changes →</button>
          </form>

          <div className="panel-divider" />
          <div className="vehicle-summary">
            <h3>Current Setup</h3>
            <dl>
              <div><dt>Business</dt><dd>{vehicleInfo.business}</dd></div>
              <div><dt>Phone</dt><dd>{vehicleInfo.phone}</dd></div>
              <div><dt>Vehicle</dt><dd>{vehicleInfo.vehicle}</dd></div>
              <div><dt>Capacity</dt><dd>{vehicleInfo.capacity}</dd></div>
              <div><dt>Documents</dt><dd>{vehicleInfo.document}</dd></div>
            </dl>
          </div>
        </section>
      )}
    </>
  );
}

export default SellerDashboard;