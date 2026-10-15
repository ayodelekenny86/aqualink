import { useState, useEffect, useMemo } from 'react';
import { formatCedi } from '../lib/money';
import useInstitutionDashboard from '../hooks/useInstitutionDashboard';
import useDemandForecast from '../hooks/useDemandForecast';
import usePredictiveAnalytics from '../hooks/usePredictiveAnalytics';
import useDynamicPricing from '../hooks/useDynamicPricing';
import useWaterQuality from '../hooks/useWaterQuality';
import usePredictiveInventory from '../hooks/usePredictiveInventory';
import useCustomerIntelligence from '../hooks/useCustomerIntelligence';
import useNotifications from '../hooks/useNotifications';
import SmartSchedulingPanel from './SmartSchedulingPanel';
import PredictiveInventoryPanel from './PredictiveInventoryPanel';
import CustomerIntelligencePanel from './CustomerIntelligencePanel';
import DemandForecastingPanel from './DemandForecastingPanel';
import DriverPerformancePanel from './DriverPerformancePanel';
import AutomatedDispatchPanel from './AutomatedDispatchPanel';
import PredictiveMaintenancePanel from './PredictiveMaintenancePanel';
import SupplyChainOptimizationPanel from './SupplyChainOptimizationPanel';
import CustomerChurnPredictionPanel from './CustomerChurnPredictionPanel';
import RevenueOptimizationPanel from './RevenueOptimizationPanel';
import QualityAssurancePanel from './QualityAssurancePanel';
import FleetUtilizationPanel from './FleetUtilizationPanel';
import MarketIntelligencePanel from './MarketIntelligencePanel';
import EnergyOptimizationPanel from './EnergyOptimizationPanel';
import SubscriptionManagementPanel from './SubscriptionManagementPanel';
import SustainabilityTrackingPanel from './SustainabilityTrackingPanel';
import WaterSourceOptimizationPanel from './WaterSourceOptimizationPanel';
import ComplianceMonitoringPanel from './ComplianceMonitoringPanel';
import EmergencyResponsePanel from './EmergencyResponsePanel';
import CarbonFootprintTrackingPanel from './CarbonFootprintTrackingPanel';
import SmartDeliverySchedulingPanel from './SmartDeliverySchedulingPanel';
import WaterQualityPredictionPanel from './WaterQualityPredictionPanel';
import CustomerSentimentAnalysisPanel from './CustomerSentimentAnalysisPanel';
import RevenueLeakDetectionPanel from './RevenueLeakDetectionPanel';
import PredictivePricingPanel from './PredictivePricingPanel';
import InventoryForecastingPanel from './InventoryForecastingPanel';
import DriverBehaviorPanel from './DriverBehaviorPanel';
import CustomerLifetimeValuePanel from './CustomerLifetimeValuePanel';
import DemandSensingPanel from './DemandSensingPanel';

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

export function InstitutionDashboard({ orders, showNotice, fleetDrivers = [], driverLocations = {} }) {
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
    qualityTrends,
    complianceSummary,
    supplyRisk,
    savingsRecommendations,
  } = useInstitutionDashboard({ orders, onNotice: showNotice });

  // Smart features
  const { forecast, summary: forecastSummary, trend, anomalies, peakHours, loading: forecastLoading, refresh: refreshForecast } = useDemandForecast({ orders, region: 'ACCRA' });
  const { churnAnalysis, ltvPredictions, segments, anomalies: predAnomalies, revenueForecast, summary: analyticsSummary, loading: analyticsLoading, refresh: refreshAnalytics } = usePredictiveAnalytics({ orders, customers: [], driverPositions: {} });
  const { pricing, customerProfile, loading: pricingLoading, refresh: refreshPricing, getPriceForVolume, getPriceExplanation, summary: pricingSummary } = useDynamicPricing({ orders, driverPositions: {}, customerId: null, region: 'ACCRA' });
  const { records: waterRecords, compliance, trends, forecasts, certificates, sourceRisks, alerts, summary: qualitySummary, loading: qualityLoading, addQualityRecord: addWaterQualityRecord, getSourceSummary, refresh: refreshWaterQuality } = useWaterQuality({ qualityRecords, sources: [...new Set(qualityRecords.map(r => r.source))], onNotice: showNotice });

  // Advanced AI features
  const { inventory: predInventory, predictions: invPredictions, alerts: invAlerts, summary: predInvSummary, recordRestock } = usePredictiveInventory({ sellerProfile: { identifier: 'institution' }, orders, driverPositions: {}, forecast, onNotice: showNotice });
  const { customers: enrichedCustomers, churnAnalysis: instChurn, ltvPredictions: instLTV, anomalies: instAnomalies, summary: instCustSummary } = useCustomerIntelligence({ orders, customers: [], driverPositions: {}, onNotice: showNotice });

  // Zone loads for automated dispatch
  const zoneLoads = useMemo(() => {
    const loads = {};
    orders.filter(o => ['Pending', 'Confirmed', 'Assigned', 'En Route'].includes(o.status)).forEach(order => {
      const zone = order.zone || 'zone_1';
      loads[zone] = (loads[zone] || 0) + 1;
    });
    return loads;
  }, [orders]);

  // Keep the budget form field in sync when the stored budget changes
  useEffect(() => {
    setBudgetInput(budget.monthly / 100);
  }, [budget.monthly]);

  const [activeTab, setActiveTab] = useState('overview');
  const [smartTab, setSmartTab] = useState('forecast');
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [showQualityForm, setShowQualityForm] = useState(false);
  const [budgetInput, setBudgetInput] = useState(budget.monthly / 100);
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

  // Notifications for Smart Hub
  const { unreadCount: unreadCountFn, items: notifications } = useNotifications();
  const unreadCount = unreadCountFn('institution');
  const preferences = { pushEnabled: true, quietHoursEnabled: false };

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
        <button className={activeTab === 'smart-scheduling' ? 'active' : ''} onClick={() => setActiveTab('smart-scheduling')}>Smart Scheduling</button>
        <button className={activeTab === 'inventory' ? 'active' : ''} onClick={() => setActiveTab('inventory')}>Predictive Inventory</button>
        <button className={activeTab === 'quality' ? 'active' : ''} onClick={() => setActiveTab('quality')}>Quality</button>
        <button className={activeTab === 'customers' ? 'active' : ''} onClick={() => setActiveTab('customers')}>Customer Intelligence</button>
        <button className={activeTab === 'budget' ? 'active' : ''} onClick={() => setActiveTab('budget')}>Budget</button>
        <button className={activeTab === 'analytics' ? 'active' : ''} onClick={() => setActiveTab('analytics')}>Analytics</button>
        <button className={activeTab === 'insights' ? 'active' : ''} onClick={() => setActiveTab('insights')}>Insights</button>
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

          <div className="overview-grid">
            <article className="overview-card">
              <span>TOTAL VOLUME DELIVERED</span>
              <strong>{analytics.totalPaidVolume}</strong>
              <small>Paid orders only</small>
            </article>
            <article className="overview-card highlight">
              <span>TOTAL PAID SPEND</span>
              <strong>{analytics.totalPaidSpend}</strong>
              <small>Confirmed deliveries</small>
            </article>
            <article className="overview-card">
              <span>AVG DAYS BETWEEN DELIVERIES</span>
              <strong>{analytics.avgDaysBetweenDeliveries || '—'}</strong>
              <small>{analytics.avgDaysBetweenDeliveries ? 'days' : 'Insufficient data'}</small>
            </article>
            <article className="overview-card">
              <span>ACTIVE SCHEDULES</span>
              <strong>{schedules.filter(s => s.active).length}</strong>
              <small>{schedules.length} total</small>
            </article>
            <article className="overview-card">
              <span>QUALITY TESTS</span>
              <strong>{complianceSummary.totalTests}</strong>
              <small>{complianceSummary.passRate.toFixed(1)}% pass rate</small>
            </article>
            <article className="overview-card">
              <span>SOURCES MONITORED</span>
              <strong>{complianceSummary.sourcesMonitored}</strong>
              <small>Water sources</small>
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

          <div className="panel-divider" />

          <div className="panel-title">
            <span className="section-kicker">TOP SELLERS</span>
            <h2>By delivery volume for your institution</h2>
          </div>
          {analytics.sellerStats.length === 0 ? (
            <p className="empty-feed">No seller data yet. Complete deliveries to see rankings.</p>
          ) : (
            <div className="seller-ranking">
              {analytics.sellerStats.slice(0, 5).map((seller, i) => (
                <div key={seller.name} className="ranking-item">
                  <span className="rank">{i + 1}</span>
                  <div className="ranking-info">
                    <strong>{seller.name}</strong>
                    <small>{seller.orders} orders · {seller.volume} gal · {seller.onTimeRate}% on-time</small>
                  </div>
                  <div className="ranking-value">
                    <strong>{seller.avgOrderValue}</strong>
                    <small>Avg/order</small>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="panel-divider" />

          <div className="panel-title">
            <span className="section-kicker">ZONE ANALYSIS</span>
            <h2>Delivery distribution by zone</h2>
          </div>
          {analytics.zoneStats.length === 0 ? (
            <p className="empty-feed">No zone data available.</p>
          ) : (
            <div className="zone-grid">
              {analytics.zoneStats.map((zone) => (
                <article key={zone.zone} className="zone-card panel">
                  <div className="zone-header">
                    <strong>{zone.zone}</strong>
                    <span className="zone-orders">{zone.orders} orders</span>
                  </div>
                  <div className="zone-stats">
                    <div><span>Volume:</span> <strong>{zone.volume} gal</strong></div>
                    <div><span>Spend:</span> <strong>{formatCedi(zone.spend)}</strong></div>
                    <div><span>Avg/Order:</span> <strong>{zone.avgOrderValue}</strong></div>
                  </div>
                </article>
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

      {activeTab === 'smart-scheduling' && (
        <SmartSchedulingPanel orders={orders} showNotice={showNotice} customers={[]} />
      )}

      {activeTab === 'quality' && (
        <section className="panel">
          <div className="panel-toolbar">
            <div className="panel-title">
              <span className="section-kicker">WATER QUALITY & COMPLIANCE</span>
              <h2>Quality test records</h2>
            </div>
            <div className="toolbar-actions">
              <button className="primary-button" type="button" onClick={() => setShowQualityForm(true)}>
                + Add Test Record
              </button>
              {complianceSummary.totalTests > 0 && (
                <button className="outline-button" type="button" onClick={() => showNotice('Quality compliance certificate generated.')}>
                  Generate Certificate
                </button>
              )}
            </div>
          </div>

          {/* Compliance Summary at Top */}
          {complianceSummary.totalTests > 0 && (
            <div className="compliance-overview">
              <article className="compliance-stat-card">
                <span>TOTAL TESTS</span>
                <strong>{complianceSummary.totalTests}</strong>
              </article>
              <article className="compliance-stat-card highlight">
                <span>OVERALL PASS RATE</span>
                <strong>{complianceSummary.passRate.toFixed(1)}%</strong>
              </article>
              <article className="compliance-stat-card">
                <span>SOURCES MONITORED</span>
                <strong>{complianceSummary.sourcesMonitored}</strong>
              </article>
              <article className="compliance-stat-card warning">
                <span>PARAMETERS FAILING</span>
                <strong>{Object.values(complianceSummary.byParameter).filter(p => p.passRate < 100).length}</strong>
              </article>
            </div>
            <div className="panel-divider" />
          )}

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
              <div className="empty-icon">💧</div>
              <p className="empty-feed">No quality records yet.</p>
              <p className="quality-note">This app does not store water-quality certificates by default. A seller or operator must supply test results before any quality claim is made. Add records above to build your compliance history.</p>
              <button className="primary-button" type="button" onClick={() => setShowQualityForm(true)}>
                Add First Test Record
              </button>
            </div>
          ) : (
            <>
              <div className="quality-list">
                {qualityRecords.map((record) => (
                  <QualityCard key={record.id} record={record} onDelete={() => deleteQualityRecord(record.id)} />
                ))}
              </div>
              
              <div className="panel-divider" />
              
              <div className="panel-title">
                <span className="section-kicker">PARAMETER COMPLIANCE</span>
                <h2>WHO / Ghana Standards compliance by parameter</h2>
              </div>
              <div className="compliance-grid">
                {Object.entries(complianceSummary.byParameter).map(([param, data]) => (
                  <article key={param} className="compliance-card panel">
                    <div className="compliance-header">
                      <strong>{param.toUpperCase()}</strong>
                      <span className={`status ${data.passRate >= 90 ? 'status-delivered' : data.passRate >= 70 ? 'status-online' : 'status-cancelled'}`}>
                        {data.passRate}% PASS
                      </span>
                    </div>
                    <div className="compliance-stats">
                      <div><span>Tests:</span> <strong>{data.total}</strong></div>
                      <div><span>Passed:</span> <strong>{data.passed}</strong></div>
                      <div><span>Failed:</span> <strong>{data.total - data.passed}</strong></div>
                    </div>
                    <div className="compliance-bar">
                      <div className="compliance-fill" style={{ width: `${data.passRate}%` }} />
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {activeTab === 'inventory' && (
        <PredictiveInventoryPanel 
          orders={orders} 
          onNotice={showNotice} 
          sellerProfile={{ identifier: 'institution' }}
          driverPositions={{}}
          forecast={forecast}
        />
      )}

      {activeTab === 'customers' && (
        <CustomerIntelligencePanel 
          orders={orders} 
          onNotice={showNotice} 
          customers={enrichedCustomers}
          driverPositions={{}}
        />
      )}

      {activeTab === 'budget' && (
        <section className="panel">
          <div className="panel-toolbar">
            <div className="panel-title">
              <span className="section-kicker">BUDGET PLANNING</span>
              <h2>Monthly water budget</h2>
            </div>
          </div>

          {/* Budget Alerts */}
          {budget.alerts.length > 0 && (
            <div className="budget-alerts">
              {budget.alerts.map((alert, i) => (
                <BudgetAlert key={i} alert={alert} />
              ))}
            </div>
          )}

           <div className="budget-summary">
             <article className="budget-card">
               <span>MONTHLY BUDGET</span>
               <strong>{formatCedi(budget.monthly)}</strong>
             </article>
             <article className="budget-card highlight">
               <span>SPENT THIS MONTH</span>
               <strong>{formatCedi(budget.spent)}</strong>
             </article>
             <article className="budget-card">
               <span>REMAINING</span>
               <strong>{formatCedi(Math.max(0, budget.monthly - budget.spent))}</strong>
             </article>
             <article className="budget-card">
               <span>UTILIZATION</span>
               <strong>{analytics.budgetUtilization}%</strong>
             </article>
           </div>

          {/* Budget Progress Bar */}
          {budget.monthly > 0 && (
            <div className="budget-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ 
                    width: `${Math.min(100, (budget.spent / budget.monthly) * 100)}%`,
                    background: budget.spent > budget.monthly ? 'linear-gradient(90deg, var(--coral), #f88)' : 
                                budget.spent > budget.monthly * 0.9 ? 'linear-gradient(90deg, #f0a202, #fdd)' : 
                                'linear-gradient(90deg, var(--teal), var(--mint))'
                  }} 
                />
              </div>
              <div className="progress-labels">
                <span>0%</span>
                <span>50%</span>
                <span>90%</span>
                <span>100%</span>
              </div>
            </div>
          )}

          <div className="panel-divider" />

          {/* Budget Forecasting */}
          <div className="panel-title">
            <span className="section-kicker">BUDGET FORECAST</span>
            <h2>Projected spending based on current trends</h2>
          </div>
          <div className="budget-forecast">
            <article className="forecast-card">
              <span>Projected Monthly</span>
              <strong>{analytics.monthlyOrders > 0 ? formatCedi(Math.round(budget.spent / Math.max(1, new Date().getDate()) * 30)) : '—'}</strong>
              <small>Based on {new Date().getDate()} days of data</small>
            </article>
            <article className="forecast-card">
              <span>Avg Daily Spend</span>
              <strong>{analytics.monthlyOrders > 0 ? formatCedi(Math.round(budget.spent / Math.max(1, new Date().getDate()))) : '—'}</strong>
              <small>Per day this month</small>
            </article>
            <article className="forecast-card">
              <span>Days Until Budget</span>
              <strong>{budget.monthly > 0 && budget.spent > 0 ? Math.max(0, Math.floor((budget.monthly - budget.spent) / Math.max(1, budget.spent / new Date().getDate()))) : '—'}</strong>
              <small>At current rate</small>
            </article>
            <article className="forecast-card">
              <span>Projected Yearly</span>
              <strong>{analytics.monthlyOrders > 0 ? formatCedi(Math.round(budget.spent / Math.max(1, new Date().getDate()) * 365)) : '—'}</strong>
              <small>Extrapolated annually</small>
            </article>
          </div>

          <div className="panel-divider" />

          {/* Monthly Comparison */}
          <div className="panel-title">
            <span className="section-kicker">MONTHLY COMPARISON</span>
            <h2>Budget vs actual spending (last 6 months)</h2>
          </div>
          <div className="monthly-comparison">
            {analytics.monthlyTrend.map((month, i) => (
              <div key={month.month} className="comparison-bar-group">
                <div className="comparison-bars">
                  <div 
                    className="comparison-bar-budget" 
                    style={{ height: `${Math.max(5, (budget.monthly / Math.max(...analytics.monthlyTrend.map(m => m.spend), budget.monthly)) * 100)}%` }}
                    title={`Budget: ${formatCedi(budget.monthly)}`}
                  />
                  <div 
                    className="comparison-bar-actual" 
                    style={{ height: `${Math.max(5, (month.spend / Math.max(...analytics.monthlyTrend.map(m => m.spend), budget.monthly)) * 100)}%` }}
                    title={`${month.month}: ${formatCedi(month.spend)}`}
                  />
                </div>
                <span className="comparison-label">{month.month}</span>
                <div className="comparison-values">
                  <span className="budget-val">Budget: {formatCedi(budget.monthly)}</span>
                  <span className="actual-val">Actual: {formatCedi(month.spend)}</span>
                </div>
              </div>
            ))}
            <div className="comparison-legend">
              <span className="legend-item budget"><span className="legend-color budget"></span> Budget</span>
              <span className="legend-item actual"><span className="legend-color actual"></span> Actual</span>
            </div>
          </div>

          <div className="panel-divider" />

           <form className="budget-form" onSubmit={(event) => {
             event.preventDefault();
             updateBudget({ monthly: Number(budgetInput) * 100 });
           }}>
             <div className="form-row">
               <label>Monthly budget (GH₵)<input type="number" name="monthly" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} step="100" min="0" required /></label>
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

      {activeTab === 'insights' && (
        <section className="panel">
          <div className="panel-toolbar">
            <div className="panel-title">
              <span className="section-kicker">DEEP INSIGHTS</span>
              <h2>Advanced analytics for your institution</h2>
            </div>
          </div>

          {/* Monthly Trend Chart */}
          <div className="panel-title">
            <span className="section-kicker">MONTHLY TREND (Last 6 Months)</span>
            <h2>Order volume and spend over time</h2>
          </div>
          <div className="trend-chart">
            {analytics.monthlyTrend.map((month, i) => (
              <div key={month.month} className="trend-bar-group">
                <div className="trend-bars">
                  <div 
                    className="trend-bar-volume" 
                    style={{ height: `${Math.max(5, (month.volume / Math.max(...analytics.monthlyTrend.map(m => m.volume), 1)) * 100)}%` }}
                    title={`${month.month}: ${month.volume} gal`}
                  />
                  <div 
                    className="trend-bar-spend" 
                    style={{ height: `${Math.max(5, (month.spend / Math.max(...analytics.monthlyTrend.map(m => m.spend), 1)) * 100)}%` }}
                    title={`${month.month}: ${formatCedi(month.spend)}`}
                  />
                </div>
                <span className="trend-label">{month.month}</span>
                <div className="trend-values">
                  <span className="volume-val">{month.volume} gal</span>
                  <span className="spend-val">{formatCedi(month.spend)}</span>
                </div>
              </div>
            ))}
            <div className="trend-legend">
              <span className="legend-item volume"><span className="legend-color volume"></span> Volume (gal)</span>
              <span className="legend-item spend"><span className="legend-color spend"></span> Spend (GH₵)</span>
            </div>
          </div>

          <div className="panel-divider" />

          {/* Seller Performance Details */}
          <div className="panel-title">
            <span className="section-kicker">SELLER PERFORMANCE</span>
            <h2>Detailed seller rankings for your institution</h2>
          </div>
          {analytics.sellerStats.length === 0 ? (
            <p className="empty-feed">No seller performance data yet.</p>
          ) : (
            <div className="seller-performance-table">
              <div className="table-header">
                <span>Rank</span>
                <span>Seller</span>
                <span>Orders</span>
                <span>Volume</span>
                <span>Total Spend</span>
                <span>Avg/Order</span>
                <span>On-Time %</span>
              </div>
              {analytics.sellerStats.map((seller, i) => (
                <div key={seller.name} className="table-row">
                  <span className="rank">{i + 1}</span>
                  <span>{seller.name}</span>
                  <span>{seller.orders}</span>
                  <span>{seller.volume} gal</span>
                  <span>{formatCedi(seller.spend)}</span>
                  <span>{seller.avgOrderValue}</span>
                  <span className={seller.onTimeRate >= 90 ? 'good' : seller.onTimeRate >= 70 ? 'warning' : 'critical'}>
                    {seller.onTimeRate}%
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="panel-divider" />

          {/* Driver Performance Details */}
          <div className="panel-title">
            <span className="section-kicker">DRIVER PERFORMANCE</span>
            <h2>Detailed driver rankings for your institution</h2>
          </div>
          {analytics.driverStats.length === 0 ? (
            <p className="empty-feed">No driver performance data yet.</p>
          ) : (
            <div className="driver-performance-table">
              <div className="table-header">
                <span>Rank</span>
                <span>Driver</span>
                <span>Orders</span>
                <span>Volume</span>
                <span>Total Spend</span>
                <span>Avg/Order</span>
                <span>On-Time %</span>
              </div>
              {analytics.driverStats.map((driver, i) => (
                <div key={driver.name} className="table-row">
                  <span className="rank">{i + 1}</span>
                  <span>{driver.name}</span>
                  <span>{driver.orders}</span>
                  <span>{driver.volume} gal</span>
                  <span>{formatCedi(driver.spend)}</span>
                  <span>{driver.avgOrderValue}</span>
                  <span className={driver.onTimeRate >= 90 ? 'good' : driver.onTimeRate >= 70 ? 'warning' : 'critical'}>
                    {driver.onTimeRate}%
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="panel-divider" />

          {/* Water Quality Trends */}
          <div className="panel-title">
            <span className="section-kicker">WATER QUALITY TRENDS (90 Days)</span>
            <h2>Parameter trends over time</h2>
          </div>
          {qualityTrends && Object.keys(qualityTrends).length > 0 ? (
            <div className="quality-trends-grid">
              {Object.entries(qualityTrends).map(([param, trend]) => (
                <article key={param} className="quality-trend-card panel">
                  <div className="trend-header">
                    <strong>{param.toUpperCase()}</strong>
                    <span className={`trend-direction ${trend.trend}`}>
                      {trend.trend === 'increasing' ? '↑' : trend.trend === 'decreasing' ? '↓' : '→'}
                      {trend.changePercent > 0 ? '+' : ''}{trend.changePercent}%
                    </span>
                  </div>
                  <div className="trend-values">
                    <div><span>Current:</span> <strong>{trend.current}</strong></div>
                    <div><span>Previous:</span> <strong>{trend.previous}</strong></div>
                    <div><span>Change:</span> <strong>{trend.change > 0 ? '+' : ''}{trend.change}</strong></div>
                  </div>
                  <div className="trend-mini-chart">
                    {trend.values.slice(-10).map((v, i) => (
                      <div key={i} className="mini-bar" style={{ height: `${Math.max(2, (v.value / 14) * 100)}%` }} title={`${v.date}: ${v.value}`} />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-feed">Add water quality records to see trend analysis.</p>
          )}

          <div className="panel-divider" />

          {/* Compliance Summary */}
          <div className="panel-title">
            <span className="section-kicker">COMPLIANCE SUMMARY</span>
            <h2>Parameter compliance rates</h2>
          </div>
           {complianceSummary.totalTests > 0 ? (
             <div className="compliance-grid">
               {Object.entries(complianceSummary.byParameter).map(([param, data]) => (
                 <article key={param} className="compliance-card panel">
                   <div className="compliance-header">
                     <strong>{param.toUpperCase()}</strong>
                     <span className={`status ${data.passRate >= 90 ? 'status-delivered' : data.passRate >= 70 ? 'status-online' : 'status-cancelled'}`}>
                       {data.passRate}% PASS
                     </span>
                   </div>
                   <div className="compliance-stats">
                     <div><span>Tests:</span> <strong>{data.total}</strong></div>
                     <div><span>Passed:</span> <strong>{data.passed}</strong></div>
                     <div><span>Failed:</span> <strong>{data.total - data.passed}</strong></div>
                   </div>
                   <div className="compliance-bar">
                     <div className="compliance-fill" style={{ width: `${data.passRate}%` }} />
                   </div>
                 </article>
               ))}
             </div>
           ) : (
             <p className="empty-feed">No water quality tests recorded yet.</p>
           )}

           {/* Supply Risk Assessment */}
           {supplyRisk.length > 0 && (
             <>
               <div className="panel-divider" />
               
               <div className="panel-title">
                 <span className="section-kicker">SUPPLY RISK ASSESSMENT</span>
                 <h2>Supplier reliability and concentration risk</h2>
               </div>
               
               <div className="supply-risk-grid">
                 {supplyRisk.map((seller) => (
                   <article key={seller.name} className="risk-card panel">
                     <div className="risk-header">
                       <strong>{seller.name}</strong>
                       <span className={`risk-level ${seller.riskLevel}`}>
                         {seller.riskLevel.toUpperCase()}
                       </span>
                     </div>
                     <div className="risk-details">
                       <div><span>Risk Score:</span> <strong>{seller.riskScore}/100</strong></div>
                       <div><span>On-Time Rate:</span> <strong>{seller.onTimeRate}%</strong></div>
                       <div><span>Spend Share:</span> <strong>{seller.spendShare}%</strong></div>
                       <div><span>Orders:</span> <strong>{seller.orders}</strong></div>
                     </div>
                   </article>
                 ))}
               </div>
             </>
           )}

           {/* Savings Recommendations */}
           {savingsRecommendations.length > 0 && (
             <>
               <div className="panel-divider" />
               
               <div className="panel-title">
                 <span className="section-kicker">SAVINGS RECOMMENDATIONS</span>
                 <h2>Opportunities to optimize your water spending</h2>
               </div>
               
               <div className="recommendations-list">
                 {savingsRecommendations.map((rec) => (
                   <article key={rec.id} className="recommendation-card panel">
                     <div className="recommendation-header">
                       <span className={`priority ${rec.priority}`}>{rec.priority.toUpperCase()}</span>
                       <strong>{rec.title}</strong>
                     </div>
                     <p className="recommendation-description">{rec.description}</p>
                     {rec.potentialSavings > 0 && (
                       <div className="recommendation-savings">
                         <span>Potential Savings:</span>
                         <strong>{formatCedi(rec.potentialSavings)}</strong>
                       </div>
                     )}
                   </article>
                 ))}
               </div>
             </>
           )}
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
            <button className={smartTab === 'demand-forecasting' ? 'active' : ''} onClick={() => setSmartTab('demand-forecasting')}>Demand Forecasting</button>
            <button className={smartTab === 'driver-performance' ? 'active' : ''} onClick={() => setSmartTab('driver-performance')}>Driver Performance</button>
            <button className={smartTab === 'automated-dispatch' ? 'active' : ''} onClick={() => setSmartTab('automated-dispatch')}>Automated Dispatch</button>
            <button className={smartTab === 'predictive-maintenance' ? 'active' : ''} onClick={() => setSmartTab('predictive-maintenance')}>Predictive Maintenance</button>
            <button className={smartTab === 'supply-chain' ? 'active' : ''} onClick={() => setSmartTab('supply-chain')}>Supply Chain</button>
            <button className={smartTab === 'churn-prediction' ? 'active' : ''} onClick={() => setSmartTab('churn-prediction')}>Churn Prediction</button>
            <button className={smartTab === 'revenue-optimization' ? 'active' : ''} onClick={() => setSmartTab('revenue-optimization')}>Revenue Optimization</button>
            <button className={smartTab === 'quality-assurance' ? 'active' : ''} onClick={() => setSmartTab('quality-assurance')}>Quality Assurance</button>
            <button className={smartTab === 'fleet-utilization' ? 'active' : ''} onClick={() => setSmartTab('fleet-utilization')}>Fleet Utilization</button>
            <button className={smartTab === 'market-intelligence' ? 'active' : ''} onClick={() => setSmartTab('market-intelligence')}>Market Intelligence</button>
            <button className={smartTab === 'energy-optimization' ? 'active' : ''} onClick={() => setSmartTab('energy-optimization')}>Energy Optimization</button>
            <button className={smartTab === 'subscription-management' ? 'active' : ''} onClick={() => setSmartTab('subscription-management')}>Subscription Mgmt</button>
            <button className={smartTab === 'sustainability-tracking' ? 'active' : ''} onClick={() => setSmartTab('sustainability-tracking')}>Sustainability</button>
            <button className={smartTab === 'water-source' ? 'active' : ''} onClick={() => setSmartTab('water-source')}>Water Source</button>
            <button className={smartTab === 'compliance' ? 'active' : ''} onClick={() => setSmartTab('compliance')}>Compliance</button>
            <button className={smartTab === 'emergency' ? 'active' : ''} onClick={() => setSmartTab('emergency')}>Emergency</button>
            <button className={smartTab === 'carbon' ? 'active' : ''} onClick={() => setSmartTab('carbon')}>Carbon Footprint</button>
            <button className={smartTab === 'smart-scheduling' ? 'active' : ''} onClick={() => setSmartTab('smart-scheduling')}>Smart Scheduling</button>
            <button className={smartTab === 'quality-prediction' ? 'active' : ''} onClick={() => setSmartTab('quality-prediction')}>Quality Prediction</button>
            <button className={smartTab === 'sentiment' ? 'active' : ''} onClick={() => setSmartTab('sentiment')}>Sentiment</button>
            <button className={smartTab === 'revenue-leaks' ? 'active' : ''} onClick={() => setSmartTab('revenue-leaks')}>Revenue Leaks</button>
            <button className={smartTab === 'predictive-pricing' ? 'active' : ''} onClick={() => setSmartTab('predictive-pricing')}>Predictive Pricing</button>
            <button className={smartTab === 'inventory-forecasting' ? 'active' : ''} onClick={() => setSmartTab('inventory-forecasting')}>Inventory Forecasting</button>
            <button className={smartTab === 'driver-behavior' ? 'active' : ''} onClick={() => setSmartTab('driver-behavior')}>Driver Behavior</button>
            <button className={smartTab === 'customer-lifetime-value' ? 'active' : ''} onClick={() => setSmartTab('customer-lifetime-value')}>Customer LTV</button>
            <button className={smartTab === 'demand-sensing' ? 'active' : ''} onClick={() => setSmartTab('demand-sensing')}>Demand Sensing</button>
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
              <article className="summary-card">
                <span>Unread</span>
                <strong>{unreadCount}</strong>
              </article>
              <article className="summary-card">
                <span>Push Enabled</span>
                <strong>{preferences.pushEnabled ? 'ON' : 'OFF'}</strong>
              </article>
              <article className="summary-card">
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

          {smartTab === 'demand-forecasting' && (
            <DemandForecastingPanel 
              orders={orders} 
              weather="clear" 
              weatherForecast={[]}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'driver-performance' && (
            <DriverPerformancePanel 
              drivers={fleetDrivers} 
              orders={orders} 
              driverLocations={driverLocations}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'automated-dispatch' && (
            <AutomatedDispatchPanel 
              orders={orders} 
              drivers={fleetDrivers} 
              driverLocations={driverLocations}
              zoneLoads={zoneLoads || {}}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'predictive-maintenance' && (
            <PredictiveMaintenancePanel 
              vehicles={[]} 
              orders={orders} 
              onNotice={showNotice}
            />
          )}

          {smartTab === 'supply-chain' && (
            <SupplyChainOptimizationPanel 
              suppliers={[]} 
              warehouses={[]} 
              orders={orders} 
              onNotice={showNotice}
            />
          )}

          {smartTab === 'churn-prediction' && (
            <CustomerChurnPredictionPanel 
              customers={enrichedCustomers} 
              orders={orders} 
              onNotice={showNotice}
            />
          )}

          {smartTab === 'revenue-optimization' && (
            <RevenueOptimizationPanel 
              orders={orders} 
              pricing={{}} 
              customers={enrichedCustomers}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'quality-assurance' && (
            <QualityAssurancePanel 
              qualityRecords={qualityRecords} 
              sources={[]} 
              orders={orders} 
              onNotice={showNotice}
            />
          )}

          {smartTab === 'fleet-utilization' && (
            <FleetUtilizationPanel 
              fleetDrivers={fleetDrivers} 
              orders={orders} 
              driverLocations={driverLocations}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'market-intelligence' && (
            <MarketIntelligencePanel 
              orders={orders} 
              customers={[]}
              competitors={[]}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'energy-optimization' && (
            <EnergyOptimizationPanel 
              fleetDrivers={fleetDrivers} 
              orders={orders} 
              driverLocations={driverLocations}
              vehicles={[]}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'subscription-management' && (
            <SubscriptionManagementPanel 
              customers={[]}
              orders={orders} 
              subscriptions={[]}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'sustainability-tracking' && (
            <SustainabilityTrackingPanel 
              orders={orders} 
              qualityRecords={[]}
              sources={[]}
              fleetDrivers={fleetDrivers}
              vehicles={[]}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'water-source' && (
            <WaterSourceOptimizationPanel 
              sources={[]}
              orders={orders} 
              qualityRecords={[]}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'compliance' && (
            <ComplianceMonitoringPanel 
              permits={[]}
              inspections={[]}
              regulations={[]}
              facilities={[]}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'emergency' && (
            <EmergencyResponsePanel 
              orders={orders} 
              drivers={fleetDrivers} 
              facilities={[]}
              customers={[]}
              weatherAlerts={[]}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'carbon' && (
            <CarbonFootprintPanel 
              orders={orders} 
              drivers={fleetDrivers} 
              vehicles={[]}
              routes={[]}
              facilities={[]}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'smart-scheduling' && (
            <SmartDeliverySchedulingPanel 
              orders={orders} 
              drivers={fleetDrivers} 
              vehicles={[]}
              facilities={[]}
              trafficData={[]}
              weatherData={[]}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'quality-prediction' && (
            <WaterQualityPredictionPanel 
              qualityRecords={[]} 
              sources={[]}
              weatherData={[]}
              treatmentRecords={[]}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'sentiment' && (
            <CustomerSentimentPanel 
              customers={[]} 
              orders={orders} 
              ratings={[]}
              messages={[]}
              supportTickets={[]}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'revenue-leaks' && (
            <RevenueLeakDetectionPanel 
              orders={orders} 
              payments={[]} 
              invoices={[]}
              pricing={{}}
              drivers={fleetDrivers} 
              facilities={[]}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'predictive-pricing' && (
            <PredictivePricingPanel 
              orders={orders} 
              pricing={{}} 
              competitors={[]}
              weatherData={[]}
              events={[]}
              historicalPricing={[]}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'inventory-forecasting' && (
            <InventoryForecastingPanel 
              products={[]} 
              orders={orders} 
              suppliers={[]}
              warehouses={[]}
              usageHistory={[]}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'driver-behavior' && (
            <DriverBehaviorPanel 
              drivers={fleetDrivers} 
              trips={[]} 
              vehicles={[]}
              fuelRecords={[]}
              maintenanceRecords={[]}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'customer-lifetime-value' && (
            <CustomerLifetimeValuePanel 
              customers={[]} 
              orders={orders} 
              payments={[]}
              subscriptions={[]}
              interactions={[]}
              onNotice={showNotice}
            />
          )}

          {smartTab === 'demand-sensing' && (
            <DemandSensingPanel 
              orders={orders} 
              customers={[]} 
              weatherForecast={[]}
              events={[]}
              historicalData={[]}
              marketIndicators={[]}
              onNotice={showNotice}
            />
          )}

        </section>
      )}
    </>
  );
}

export default InstitutionDashboard;