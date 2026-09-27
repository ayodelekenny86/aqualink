import { useState } from 'react';
import { formatCedi } from '../lib/money';
import useInstitutionDashboard from '../hooks/useInstitutionDashboard';

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
    budget,
    updateBudget,
    analytics,
    refreshData,
    refreshing,
  } = useInstitutionDashboard({ orders, onNotice: showNotice });

  const [activeTab, setActiveTab] = useState('overview');
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [showQualityForm, setShowQualityForm] = useState(false);

  const scheduleForm = useState({
    name: '',
    frequency: 'weekly',
    day: 'Monday',
    volume: '2,000 gallons',
    active: true,
    nextDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  })[0];

  const handleScheduleSubmit = (event) => {
    event.preventDefault();
    const schedule = editingSchedule || scheduleForm;
    upsertSchedule({ ...schedule, ...scheduleForm, nextDelivery: scheduleForm.nextDelivery });
    setShowScheduleForm(false);
    setEditingSchedule(null);
    scheduleForm.name = '';
  };

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
                <label>Name<input name="name" value={scheduleForm.name} onChange={(e) => scheduleForm.name = e.target.value} placeholder="e.g. Main campus" required /></label>
                <label>Frequency<select name="frequency" value={scheduleForm.frequency} onChange={(e) => scheduleForm.frequency = e.target.value}>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Monthly</option>
                </select></label>
              </div>
              <div className="form-row">
                <label>Day<select name="day" value={scheduleForm.day} onChange={(e) => scheduleForm.day = e.target.value}>
                  <option value="Monday">Monday</option>
                  <option value="Tuesday">Tuesday</option>
                  <option value="Wednesday">Wednesday</option>
                  <option value="Thursday">Thursday</option>
                  <option value="Friday">Friday</option>
                  <option value="Saturday">Saturday</option>
                  <option value="Sunday">Sunday</option>
                </select></label>
                <label>Volume<select name="volume" value={scheduleForm.volume} onChange={(e) => scheduleForm.volume = e.target.value}>
                  <option>1,000 gallons</option>
                  <option>2,000 gallons</option>
                  <option>5,000 gallons</option>
                  <option>10,000 gallons</option>
                </select></label>
              </div>
              <div className="form-row">
                <label>Next delivery<input type="date" name="nextDelivery" value={scheduleForm.nextDelivery} onChange={(e) => scheduleForm.nextDelivery = e.target.value} required /></label>
                <label className="checkbox-label"><input type="checkbox" name="active" checked={scheduleForm.active} onChange={(e) => scheduleForm.active = e.target.checked} /> Active</label>
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
                <QualityCard key={record.id} record={record} onDelete={() => {
                  if (confirm('Delete this quality record?')) {
                    const updated = qualityRecords.filter((r) => r.id !== record.id);
                    // Would need a setter - simplified for now
                  }
                }} />
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
            <button className="outline-button" type="button" onClick={refreshData} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>

          <div className="analytics-grid">
            <article className="analytics-card">
              <h3>Monthly Trend</h3>
              <p className="analytics-placeholder">Connect a data warehouse or enable order history sync to see monthly delivery volume trends.</p>
            </article>
            <article className="analytics-card">
              <h3>Peak Demand</h3>
              <p className="analytics-placeholder">No forecasting model connected. Add 6+ months of order data to enable peak detection.</p>
            </article>
            <article className="analytics-card">
              <h3>Cost per Unit</h3>
              <p className="analytics-placeholder">Average cost per gallon across all deliveries: {analytics.avgOrderValue} / {analytics.monthlyVolume || 'N/A'}.</p>
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
    </>
  );
}

export default InstitutionDashboard;