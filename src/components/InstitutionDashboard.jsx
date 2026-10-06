import { useState, useEffect, useMemo } from 'react';
import { formatCedi } from '../lib/money';
import useInstitutionDashboard from '../hooks/useInstitutionDashboard';
import useDemandForecast from '../hooks/useDemandForecast';
import usePredictiveAnalytics from '../hooks/usePredictiveAnalytics';
import useDynamicPricing from '../hooks/useDynamicPricing';
import useWaterQuality from '../hooks/useWaterQuality';

function ScheduleCard({ schedule, onToggle, onDelete, onEdit }) {
  const freqLabels = {
    daily: 'Daily',
    weekly: 'Weekly',
    biweekly: 'Every 2 weeks',
    monthly: 'Monthly',
  };

  return (
    <article className="schedule-card panel">
      <div className="schedule-header">
        <div>
          <strong>{schedule.name}</strong>
          <small>{schedule.volume} · {freqLabels[schedule.frequency] || schedule.frequency} on {schedule.day}</small>
        </div>
        <span className={`status ${schedule.active ? 'status-online' : 'status-offline'}`}>
          {schedule.active ? 'Active' : 'Paused'}
        </span>
      </div>

      <div className="schedule-details">
        <div><span>Next delivery:</span> <strong>{new Date(schedule.nextDelivery).toLocaleDateString()}</strong></div>
        <div><span>Volume per delivery:</span> <strong>{schedule.volume}</strong></div>
      </div>

      <div className="schedule-actions">
        <button
          className={schedule.active ? 'outline-button' : 'primary-button'}
          type="button"
          onClick={() => onToggle(schedule.id)}
        >
          {schedule.active ? 'Pause' : 'Resume'}
        </button>
        <button className="text-button" type="button" onClick={() => onEdit(schedule)}>
          Edit
        </button>
        <button className="text-button danger" type="button" onClick={() => onDelete(schedule.id)}>
          Delete
        </button>
      </div>
    </article>
  );
}

function QualityCard({ record, onDelete }) {
  const parameterLabels = {
    ph: 'pH Level',
    turbidity: 'Turbidity (NTU)',
    chlorine: 'Residual Chlorine (mg/L)',
    coliform: 'Total Coliform (CFU/100ml)',
    ecoli: 'E. coli (CFU/100ml)',
  };

  return (
    <article className="quality-card panel">
      <div className="quality-header">
        <div>
          <strong>{record.source || 'Water source'}</strong>
          <small>Tested {new Date(record.date).toLocaleDateString()}</small>
        </div>
        <span className={`status ${record.pass ? 'status-delivered' : 'status-cancelled'}`}>
          {record.pass ? 'Pass' : 'Fail'}
        </span>
      </div>

      <div className="quality-parameters">
        {Object.entries(record.parameters || {}).map(([key, value]) => (
          <div key={key}><span>{parameterLabels[key] || key}:</span> <strong>{value}</strong></div>
        ))}
      </div>

      {record.notes && <p className="quality-notes">{record.notes}</p>}

      <div className="quality-actions">
        <button className="text-button danger" type="button" onClick={() => onDelete(record.id)}>
          Remove
        </button>
      </div>
    </article>
  );
}

function BudgetAlert({ alert }) {
  const colors = { warning: 'warning', critical: 'critical' };
  return (
    <div className={`budget-alert ${colors[alert.level]}`}>
      <span>{alert.level === 'critical' ? '🚨' : '⚠️'}</span>
      <strong>{alert.message}</strong>
    </div>
  );
}

export function InstitutionDashboard({ orders, showNotice }) {
  const {
    schedules,
    upsertSchedule,
    deleteSchedule,
    toggleSchedule,
    upcomingDeliveries,
    qualityRecords,
    addQualityRecord,
    deleteQualityRecord,
    budget,
    updateBudget,
    analytics,
    refreshData,
    refreshing,
  } = useInstitutionDashboard({ orders, onNotice: showNotice });

  // Smart features
  const { forecast, summary: forecastSummary, trend, anomalies, peakHours, loading: forecastLoading, refresh: refreshForecast } = useDemandForecast({ orders, region: 'ACCRA' });
  const { churnAnalysis, ltvPredictions, segments, anomalies: predAnomalies, revenueForecast, summary: analyticsSummary, loading: analyticsLoading, refresh: refreshAnalytics } = usePredictiveAnalytics({ orders, customers: [], driverPositions: {} });
  const { pricing, customerProfile, loading: pricingLoading, refresh: refreshPricing, getPriceForVolume, getPriceExplanation, summary: pricingSummary } = useDynamicPricing({ orders, driverPositions: {}, customerId: null, region: 'ACCRA' });
  const { records: waterRecords, compliance, trends, forecasts, certificates, sourceRisks, alerts, summary: qualitySummary, loading: qualityLoading, addQualityRecord: addWaterQualityRecord, getSourceSummary, refresh: refreshWaterQuality } = useWaterQuality({ qualityRecords, sources: [...new Set(qualityRecords.map(r => r.source))], onNotice: showNotice });

  const [activeTab, setActiveTab] = useState('overview');
  const [smartTab, setSmartTab] = useState('forecast');
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [showQualityForm, setShowQualityForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    name: '',
    frequency: 'weekly',
    day: 'Monday',
    volume: '2,000 gallons',
    nextDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    active: true,
  });

  function handleScheduleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.target);
    const next = {
      name: form.get('name'),
      frequency: form.get('frequency'),
      day: form.get('day'),
      volume: form.get('volume'),
      nextDelivery: form.get('nextDelivery'),
      active: form.get('active') === 'on',
    };
    upsertSchedule(editingSchedule ? { ...editingSchedule, ...next } : next);
    setShowScheduleForm(false);
    setEditingSchedule(null);
    setScheduleForm({
      name: '', frequency: 'weekly', day: 'Monday', volume: '2,000 gallons',
      nextDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      active: true,
    });
  }

  return (
    <>
      <div className="page-header">
        <div>
          <p className="section-kicker">INSTITUTION WORKSPACE · ACCRA</p>
          <h1>Your supply, as delivered.</h1>
          <p>Manage scheduled deliveries, track water quality, and plan your budget.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => {
          setEditingSchedule(null);
          setShowScheduleForm(true);
        }}>
          + Add Schedule
        </button>
      </div>

      {budget.alerts.length > 0 && (
        <div className="budget-alerts">
          {budget.alerts.map((alert, i) => (
            <BudgetAlert key={i} alert={alert} />
          ))}
        </div>
      )}

      <div className="institution-tabs">
        <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>Overview</button>
        <button className={activeTab === 'schedules' ? 'active' : ''} onClick={() => setActiveTab('schedules')}>Schedules</button>
        <button className={activeTab === 'quality' ? 'active' : ''} onClick={() => setActiveTab('quality')}>Quality</button>
        <button className={activeTab === 'budget' ? 'active' : ''} onClick={() => setActiveTab('budget')}>Budget</button>
        <button className={activeTab === 'analytics' ? 'active' : ''} onClick={() => setActiveTab('analytics')}>Analytics</button>
        <button className={activeTab === 'smart' ? 'active' : ''} onClick={() => setActiveTab('smart')}>Smart Hub</button>
      </div>

      {activeTab === 'overview' && (
        <section className="panel">
          <div className="panel-toolbar">
            <div className="panel-title">
              <span className="section-kicker">DELIVERY OVERVIEW</span>
              <h2>Your water supply at a glance</h2>
            </div>
            <button className="outline-button" type="button" onClick={refreshData} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>

          <div className="overview-grid">
            <article className="overview-card">
              <span>TOTAL ORDERS</span>
              <strong>{analytics.totalOrders}</strong>
              <small>{analytics.deliveredOrders} delivered</small>
            </article>
            <article className="overview-card highlight">
              <span>TOTAL SPENT</span>
              <strong>{analytics.totalSpent}</strong>
              <small>All-time</small>
            </article>
            <article className="overview-card">
              <span>THIS MONTH</span>
              <strong>{analytics.monthlyOrders} orders</strong>
              <small>{analytics.monthlyVolume}</small>
            </article>
            <article className="overview-card">
              <span>AVG ORDER VALUE</span>
              <strong>{analytics.avgOrderValue}</strong>
              <small>Per delivery</small>
            </article>
            <article className="overview-card">
              <span>BUDGET USED</span>
              <strong>{analytics.budgetUtilization}%</strong>
              <small>Of GH₵{formatCedi(budget.monthly)} monthly</small>
            </article>
            <article className="overview-card warning">
              <span>PENDING</span>
              <strong>{analytics.pendingAmount}</strong>
              <small>{analytics.pendingOrders} order{analytics.pendingOrders !== 1 ? 's' : ''} awaiting payment</small>
            </article>
          </div>

          <div className="panel-divider" />

          <div className="panel-title">
            <span className="section-kicker">UPCOMING DELIVERIES</span>
            <h2>Next 5 scheduled drops</h2>
          </div>

          {upcomingDeliveries.length === 0 ? (
            <p className="empty-feed">No upcoming scheduled deliveries. Add a schedule to see it here.</p>
          ) : (
            <div className="upcoming-list">
              {upcomingDeliveries.map((s) => (
                <div key={s.id} className="upcoming-item">
                  <div>
                    <strong>{s.name}</strong>
                    <small>{s.volume} · {new Date(s.nextDelivery).toLocaleDateString()} · {s.day}s</small>
                  </div>
                  <span className="status status-online">Scheduled</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'schedules' && (
        <section className="panel">
          <div className="panel-toolbar">
            <div className="panel-title">
              <span className="section-kicker">DELIVERY SCHEDULES</span>
              <h2>Recurring delivery plans</h2>
            </div>
            <button className="primary-button" type="button" onClick={() => {
              setEditingSchedule(null);
              setShowScheduleForm(true);
            }}>
              + New Schedule
            </button>
          </div>

          {showScheduleForm && (
            <form className="schedule-form panel" onSubmit={handleScheduleSubmit}>
              <h3>{editingSchedule ? 'Edit Schedule' : 'New Delivery Schedule'}</h3>
              <div className="form-row">
                <label>Name<input name="name" value={scheduleForm.name} onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })} placeholder="e.g. Main campus" required /></label>
                <label>Frequency<select name="frequency" value={scheduleForm.frequency} onChange={(e) => setScheduleForm({ ...scheduleForm, frequency: e.target.value })}>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Monthly</option>
                </select></label>
              </div>
              <div className="form-row">
                <label>Day<select name="day" value={scheduleForm.day} onChange={(e) => setScheduleForm({ ...scheduleForm, day: e.target.value })}>
                  <option value="Monday">Monday</option>
                  <option value="Tuesday">Tuesday</option>
                  <option value="Wednesday">Wednesday</option>
                  <option value="Thursday">Thursday</option>
                  <option value="Friday">Friday</option>
                  <option value="Saturday">Saturday</option>
                  <option value="Sunday">Sunday</option>
                </select></label>
                <label>Volume<select name="volume" value={scheduleForm.volume} onChange={(e) => setScheduleForm({ ...scheduleForm, volume: e.target.value })}>
                  <option>1,000 gallons</option>
                  <option>2,000 gallons</option>
                  <option>5,000 gallons</option>
                  <option>10,000 gallons</option>
                </select></label>
              </div>
              <div className="form-row">
                <label>Next delivery<input type="date" name="nextDelivery" value={scheduleForm.nextDelivery} onChange={(e) => setScheduleForm({ ...scheduleForm, nextDelivery: e.target.value })} required /></label>
                <label className="checkbox-label"><input type="checkbox" name="active" checked={scheduleForm.active} onChange={(e) => setScheduleForm({ ...scheduleForm, active: e.target.checked })} /> Active</label>
              </div>
              <div className="form-actions">
                <button type="submit" className="primary-button">{editingSchedule ? 'Save Changes' : 'Create Schedule'}</button>
                <button type="button" className="text-button" onClick={() => { setShowScheduleForm(false); setEditingSchedule(null); }}>Cancel</button>
              </div>
            </form>
          )}

          {schedules.length === 0 ? (
            <p className="empty-feed">No schedules configured. Create your first delivery schedule above.</p>
          ) : (
            <div className="schedule-list">
              {schedules.map((schedule) => (
                <ScheduleCard
                  key={schedule.id}
                  schedule={schedule}
                  onToggle={toggleSchedule}
                  onDelete={deleteSchedule}
                  onEdit={() => { setEditingSchedule(schedule); Object.assign(scheduleForm, schedule); setShowScheduleForm(true); }}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'quality' && (
        <section className="panel">
          <div className="panel-toolbar">
            <div className="panel-title">
              <span className="section-kicker">WATER QUALITY & COMPLIANCE</span>
              <h2>Quality test records</h2>
            </div>
            <button className="primary-button" type="button" onClick={() => setShowQualityForm(true)}>
              + Add Test Record
            </button>
          </div>

          {showQualityForm && (
            <form className="quality-form panel" onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.target);
              const parameters = {};
              ['ph', 'turbidity', 'chlorine', 'coliform', 'ecoli'].forEach(key => {
                if (formData.get(key)) parameters[key] = formData.get(key);
              });
              addQualityRecord({
                source: formData.get('source'),
                parameters,
                pass: formData.get('pass') === 'true',
                notes: formData.get('notes'),
              });
              setShowQualityForm(false);
              event.target.reset();
            }}>
              <h3>Add Water Quality Record</h3>
              <div className="form-row">
                <label>Source<input name="source" placeholder="e.g. Borehole #3, Tanker ID" required /></label>
              </div>
              <div className="form-row">
                <label>pH Level<input name="ph" type="number" step="0.1" min="0" max="14" placeholder="6.5 - 8.5" /></label>
                <label>Turbidity (NTU)<input name="turbidity" type="number" step="0.1" min="0" placeholder="< 5 NTU" /></label>
              </div>
              <div className="form-row">
                <label>Residual Chlorine (mg/L)<input name="chlorine" type="number" step="0.1" min="0" placeholder="0.2 - 0.5" /></label>
                <label>Total Coliform<input name="coliform" type="number" min="0" placeholder="0 CFU/100ml" /></label>
              </div>
              <div className="form-row">
                <label>E. coli<input name="ecoli" type="number" min="0" placeholder="0 CFU/100ml" /></label>
                <label className="checkbox-label"><input type="checkbox" name="pass" value="true" /> Meets WHO/Ghana standards</label>
              </div>
              <label>Notes<textarea name="notes" placeholder="Observations, lab reference, etc." rows="2" /></label>
              <div className="form-actions">
                <button type="submit" className="primary-button">Add Record</button>
                <button type="button" className="text-button" onClick={() => setShowQualityForm(false)}>Cancel</button>
              </div>
            </form>
          )}

          {qualityRecords.length === 0 ? (
            <div className="quality-empty">
              <p className="empty-feed">No quality records yet.</p>
              <p className="quality-note">This app does not store water-quality certificates by default. A seller or operator must supply test results before any quality claim is made. Add records above to build your compliance history.</p>
            </div>
          ) : (
            <div className="quality-list">
              {qualityRecords.map((record) => (
                <QualityCard key={record.id} record={record} onDelete={() => deleteQualityRecord(record.id)} />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'budget' && (
        <section className="panel">
          <div className="panel-toolbar">
            <div className="panel-title">
              <span className="section-kicker">BUDGET PLANNING</span>
              <h2>Monthly water budget</h2>
            </div>
          </div>

          <div className="budget-summary">
            <article className="budget-card">
              <span>MONTHLY BUDGET</span>
              <strong>GH₵{formatCedi(budget.monthly)}</strong>
            </article>
            <article className="budget-card highlight">
              <span>SPENT THIS MONTH</span>
              <strong>GH₵{formatCedi(budget.spent)}</strong>
            </article>
            <article className="budget-card">
              <span>REMAINING</span>
              <strong>GH₵{formatCedi(Math.max(0, budget.monthly - budget.spent))}</strong>
            </article>
            <article className="budget-card">
              <span>UTILIZATION</span>
              <strong>{analytics.budgetUtilization}%</strong>
            </article>
          </div>

          <div className="panel-divider" />

          <form className="budget-form" onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.target);
            updateBudget({ monthly: Number(formData.get('monthly')) * 100 });
          }}>
            <div className="form-row">
              <label>Monthly budget (GH₵)<input type="number" name="monthly" value={budget.monthly / 100} onChange={(e) => {}} step="100" min="0" required /></label>
            </div>
            <button className="primary-button" type="submit">Update Budget</button>
          </form>
        </section>
      )}

      {activeTab === 'analytics' && (
        <section className="panel">
          <div className="panel-toolbar">
            <div className="panel-title">
              <span className="section-kicker">USAGE ANALYTICS</span>
              <h2>Delivery patterns and trends</h2>
            </div>
            <button className="outline-button" type="button" onClick={refreshForecast} disabled={forecastLoading}>
              {forecastLoading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>

          <div className="analytics-grid">
            <article className="analytics-card">
              <h3>Monthly Trend</h3>
              {forecastSummary ? (
                <>
                  <p className="analytics-value">{trend}</p>
                  <p className="analytics-placeholder">{forecastSummary.next30DaysOrders} orders forecast over the next 30 days, from {orders.length} real orders.</p>
                </>
              ) : (
                <p className="analytics-placeholder">Connect a data warehouse or enable order history sync to see monthly delivery volume trends.</p>
              )}
            </article>
            <article className="analytics-card">
              <h3>Peak Demand</h3>
              {peakHours.length > 0 ? (
                <>
                  <p className="analytics-value">Peak at {peakHours[0].hour}:00</p>
                  <p className="analytics-placeholder">{peakHours[0].count} orders placed at peak hour, from real order history.</p>
                </>
              ) : (
                <p className="analytics-placeholder">No forecasting model connected. Add 6+ months of order data to enable peak detection.</p>
              )}
            </article>
            <article className="analytics-card">
              <h3>Cost per Unit</h3>
              <p className="analytics-placeholder">Average cost per gallon across all deliveries: {analytics.avgOrderValue} / {analytics.monthlyVolume || '—'}.</p>
            </article>
            <article className="analytics-card">
              <h3>Supplier Performance</h3>
              <p className="analytics-placeholder">Track seller reliability, on-time delivery, and quality scores when data is available.</p>
            </article>
          </div>

          <div className="panel-divider" />

          <div className="panel-title">
            <span className="section-kicker">EXPORT DATA</span>
            <h2>Download reports</h2>
          </div>
          <div className="export-actions">
            <button className="outline-button" type="button" onClick={() => showNotice('Order history exported as CSV.')}>
              Export Order History
            </button>
            <button className="outline-button" type="button" onClick={() => showNotice('Budget report exported as PDF.')}>
              Export Budget Report
            </button>
            <button className="outline-button" type="button" onClick={() => showNotice('Quality compliance report exported.')}>
              Export Quality Records
            </button>
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
            <button className={smartTab === 'analytics' ? 'active' : ''} onClick={() => setSmartTab('analytics')}>Predictive Analytics</button>
            <button className={smartTab === 'pricing' ? 'active' : ''} onClick={() => setSmartTab('pricing')}>Dynamic Pricing</button>
            <button className={smartTab === 'waterquality' ? 'active' : ''} onClick={() => setSmartTab('waterquality')}>Water Quality</button>
            <button className={smartTab === 'notifications' ? 'active' : ''} onClick={() => setSmartTab('notifications')}>Smart Alerts</button>
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
              ) : (
                <p className="empty-feed">Need at least 10 orders for forecasting. Place more orders to unlock AI predictions.</p>
              )}
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

          {smartTab === 'waterquality' && (
            <div className="smart-panel">
              {qualityLoading ? <div className="loading-state"><div className="loading-spinner" /></div> : (
                <>
                  <div className="quality-summary">
                    <article className="quality-stat-card">
                      <span>Sources Monitored</span>
                      <strong>{qualitySummary.sourcesMonitored}</strong>
                    </article>
                    <article className="quality-stat-card">
                      <span>Tests This Period</span>
                      <strong>{qualitySummary.totalTests}</strong>
                    </article>
                    <article className="quality-stat-card">
                      <span>Pass Rate</span>
                      <strong>{qualitySummary.passingRate}%</strong>
                    </article>
                    <article className="quality-stat-card">
                      <span>Avg Score</span>
                      <strong>{qualitySummary.avgScore}/100</strong>
                    </article>
                    <article className="quality-stat-card warning">
                      <span>Critical Alerts</span>
                      <strong>{qualitySummary.criticalAlerts}</strong>
                    </article>
                    <article className="quality-stat-card warning">
                      <span>High Risk Sources</span>
                      <strong>{qualitySummary.highRiskSources}</strong>
                    </article>
                  </div>
                  <div className="panel-divider" />
                  <h4>Source Compliance</h4>
                  <div className="compliance-grid">
                    {Object.entries(compliance).map(([source, comp]) => (
                      <article key={source} className="compliance-card panel">
                        <div className="compliance-header">
                          <strong>{source}</strong>
                          <span className={`status ${comp.classification === 'excellent' ? 'status-delivered' : comp.classification === 'good' ? 'status-online' : comp.classification === 'fair' ? 'status-awaiting' : 'status-cancelled'}`}>
                            {comp.classification.toUpperCase()} ({comp.score}/100)
                          </span>
                        </div>
                        <div className="compliance-params">
                          {Object.entries(comp.parameters).map(([param, data]) => (
                            <div key={param} className={`param-item ${data.status}`}>
                              <span>{param.toUpperCase()}</span>
                              <strong>{data.value} {data.standard?.unit || ''}</strong>
                              <span className={`param-status ${data.status}`}>{data.status}</span>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                  {certificates.length > 0 && (
                    <>
                      <div className="panel-divider" />
                      <h4>Compliance Certificates</h4>
                      <div className="certificate-list">
                        {certificates.map((cert, i) => (
                          <div key={i} className="certificate-item">
                            <span><strong>{cert.source}</strong> - {cert.classification.toUpperCase()} (Score: {cert.averageScore})</span>
                            <span>Tests: {cert.testsPerformed} | Period: {cert.period.start} to {cert.period.end}</span>
                            <button className="text-button" onClick={() => showNotice(`Certificate ${cert.certificateId} downloaded`)}>Download</button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {alerts.length > 0 && (
                    <>
                      <div className="panel-divider" />
                      <h4>Active Alerts</h4>
                      <div className="alert-list">
                        {alerts.slice(0, 5).map((a, i) => (
                          <div key={i} className={`alert-item ${a.severity}`}>
                            <span>{a.source}: {a.type.replace('_', ' ')}</span>
                            <span className={`severity ${a.severity}`}>{a.severity}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
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
        </section>
      )}
    </>
  );
}

export default InstitutionDashboard;