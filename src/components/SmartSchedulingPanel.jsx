import { useState, useMemo } from 'react';
import { formatCedi } from '../lib/money';
import useSmartScheduling from '../hooks/useSmartScheduling';

const FREQUENCY_LABELS = {
  daily: 'Daily',
  weekdays: 'Weekdays',
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  custom: 'Custom',
};

function ScheduleCard({ schedule, onToggle, onDelete, onEdit, onRecordDelivery, getNextDelivery, FREQUENCIES }) {
  const [expanded, setExpanded] = useState(false);
  const nextDelivery = getNextDelivery(schedule);
  const due = schedule.active && nextDelivery <= new Date().toISOString().split('T')[0];

  return (
    <article className={`schedule-card ${schedule.active ? 'active' : 'paused'} ${due ? 'due' : ''}`}>
      <div className="card-header" onClick={() => setExpanded(!expanded)}>
        <div className="schedule-main">
          <span className={`status-indicator ${schedule.active ? 'active' : 'inactive'}`} />
          <div className="schedule-info">
            <h4>{schedule.name || 'Unnamed Schedule'}</h4>
            <div className="schedule-meta">
              <span className="frequency-badge">{FREQUENCY_LABELS[schedule.frequency] || schedule.frequency}</span>
              <span className="volume">{schedule.volume} gal</span>
              <span className="location">📍 {schedule.location}</span>
            </div>
          </div>
        </div>
        <div className="schedule-timing">
          <div className="next-delivery">
            <span className="label">Next Delivery</span>
            <strong className={due ? 'due-today' : ''}>
              {due ? 'TODAY' : new Date(nextDelivery).toLocaleDateString()}
            </strong>
          </div>
          <div className="delivery-count">
            <span>{schedule.deliveryCount} delivered</span>
          </div>
        </div>
        <div className="card-actions">
          <button className="icon-button" onClick={() => setExpanded(!expanded)}>
            {expanded ? '▲' : '▼'}
          </button>
          <button className="icon-button" onClick={() => onToggle(schedule.id)} title={schedule.active ? 'Pause' : 'Activate'}>
            {schedule.active ? '⏸' : '▶'}
          </button>
          <button className="icon-button" onClick={() => onEdit(schedule.id)}>✎</button>
          <button className="icon-button danger" onClick={() => onDelete(schedule.id)}>🗑</button>
        </div>
      </div>

      {expanded && (
        <div className="card-expanded">
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">Customer</span>
              <span className="detail-value">{schedule.customerName || schedule.customerPhone || '—'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Start Date</span>
              <span className="detail-value">{schedule.startDate}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Last Delivery</span>
              <span className="detail-value">{schedule.lastDelivery ? new Date(schedule.lastDelivery).toLocaleDateString() : 'Never'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Created</span>
              <span className="detail-value">{new Date(schedule.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Payment Method</span>
              <span className="detail-value">{schedule.paymentMethod || 'Mobile Money'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Special Instructions</span>
              <span className="detail-value">{schedule.instructions || 'None'}</span>
            </div>
          </div>

          <div className="expanded-actions">
            {due && (
              <button className="primary-button" onClick={() => onRecordDelivery(schedule.id)}>
                ✓ Mark Delivered Today
              </button>
            )}
            {!due && schedule.active && (
              <button className="outline-button" onClick={() => onNotice?.('Manual delivery creation not implemented in demo')}>
                Create Delivery Now
              </button>
            )}
            <button className="text-button" onClick={() => onEdit(schedule.id)}>Edit Schedule</button>
          </div>
        </div>
      )}
    </article>
  );
}

function SuggestionCard({ suggestion, onCreateSchedule, onNotice }) {
  return (
    <article className="suggestion-card">
      <div className="suggestion-header">
        <span className="suggestion-icon">💡</span>
        <div>
          <h4>Smart Suggestion</h4>
          <p>{suggestion.reason}</p>
        </div>
        <span className="confidence-badge">{Math.round(suggestion.confidence)}% confidence</span>
      </div>
      <div className="suggestion-details">
        <span>Frequency: <strong>{FREQUENCY_LABELS[suggestion.frequency]}</strong></span>
        <span>Volume: <strong>{suggestion.volume}</strong></span>
      </div>
      <button className="primary-button" onClick={() => {
        onCreateSchedule({
          frequency: suggestion.frequency,
          volume: suggestion.volume.replace(' gallons', ''),
          startDate: new Date().toISOString().split('T')[0],
        });
        onNotice?.('Schedule created from suggestion');
      }}>
        Create Schedule
      </button>
    </article>
  );
}

function ScheduleForm({ onSubmit, onClose, initialData, FREQUENCIES, customers = [] }) {
  const [form, setForm] = useState({
    name: '',
    customerId: '',
    customerName: '',
    customerPhone: '',
    volume: '2000',
    location: '',
    frequency: 'weekly',
    startDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'Mobile Money',
    instructions: '',
    ...initialData,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal schedule-form" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>{initialData ? 'Edit Schedule' : 'Create New Schedule'}</h3>
          <button onClick={onClose}>×</button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <h4>Customer</h4>
            <label>
              Customer Name
              <input value={form.customerName} onChange={(e) => setForm({...form, customerName: e.target.value})} placeholder="Customer name" required />
            </label>
            <label>
              Phone Number
              <input value={form.customerPhone} onChange={(e) => setForm({...form, customerPhone: e.target.value})} placeholder="0551234567" inputMode="tel" required />
            </label>
          </div>
          <div className="form-section">
            <h4>Delivery Details</h4>
            <label>
              Schedule Name
              <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="e.g., Weekly office delivery" />
            </label>
            <label>
              Volume (gallons)
              <select value={form.volume} onChange={(e) => setForm({...form, volume: e.target.value})}>
                <option value="1000">1,000</option>
                <option value="2000">2,000</option>
                <option value="5000">5,000</option>
              </select>
            </label>
            <label>
              Location
              <input value={form.location} onChange={(e) => setForm({...form, location: e.target.value})} placeholder="Delivery address or landmark" required />
            </label>
            <label>
              Frequency
              <select value={form.frequency} onChange={(e) => setForm({...form, frequency: e.target.value})}>
                {Object.entries(FREQUENCIES).map(([key, data]) => (
                  <option key={key} value={key}>{data.label}</option>
                ))}
              </select>
            </label>
            <label>
              Start Date
              <input type="date" value={form.startDate} onChange={(e) => setForm({...form, startDate: e.target.value})} required />
            </label>
            <label>
              Payment Method
              <select value={form.paymentMethod} onChange={(e) => setForm({...form, paymentMethod: e.target.value})}>
                <option value="Mobile Money">Mobile Money</option>
                <option value="Card">Card</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cash on Delivery">Cash on Delivery</option>
              </select>
            </label>
            <label>
              Special Instructions
              <textarea value={form.instructions} onChange={(e) => setForm({...form, instructions: e.target.value})} placeholder="Any special delivery instructions..." rows={2} />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="text-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button">{initialData ? 'Update Schedule' : 'Create Schedule'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SmartSchedulingPanel({ orders = [], onNotice, customers = [] }) {
  const {
    schedules,
    stats,
    FREQUENCIES,
    createSchedule,
    updateSchedule,
    toggleSchedule,
    deleteSchedule,
    recordDelivery,
    getDueSchedules,
    getSmartSuggestions,
    processDueSchedules,
    getNextDelivery,
  } = useSmartScheduling({ orders, onNotice });

  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const suggestions = getSmartSuggestions();

  const handleCreate = (data) => createSchedule(data);
  const handleUpdate = (id, data) => updateSchedule(id, data);
  const handleEdit = (id) => {
    const schedule = schedules.find(s => s.id === id);
    if (schedule) {
      setEditingSchedule(schedule);
      setShowForm(true);
    }
  };

  const dueSchedules = getDueSchedules();

  return (
    <section className="panel smart-scheduling-panel">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">SMART SCHEDULING</span>
          <h2>Recurring Deliveries</h2>
        </div>
        <div className="toolbar-actions">
          <button className="primary-button" onClick={() => { setEditingSchedule(null); setShowForm(true); }}>
            + New Schedule
          </button>
          {dueSchedules.length > 0 && (
            <button className="primary-button urgent" onClick={() => processDueSchedules()}>
              Process {dueSchedules.length} Due Today
            </button>
          )}
        </div>
      </div>

      <div className="stats-bar">
        <article className="summary-card {stats.active > 0 ? 'good' : ''}">
          <span>Active Schedules</span>
          <strong>{stats.active}</strong>
        </article>
        <article className="summary-card {stats.dueToday > 0 ? 'critical' : 'good'}">
          <span>Due Today</span>
          <strong>{stats.dueToday}</strong>
        </article>
        <article className="summary-card">
          <span>Total Deliveries</span>
          <strong>{stats.totalDeliveries}</strong>
        </article>
        <article className="summary-card">
          <span>Total Schedules</span>
          <strong>{stats.total}</strong>
        </article>
      </div>

      {suggestions.length > 0 && (
        <div className="suggestions-section">
          <h4>💡 AI Suggestions</h4>
          <div className="suggestions-grid">
            {suggestions.map((s, i) => (
              <SuggestionCard key={i} suggestion={s} onCreateSchedule={handleCreate} onNotice={onNotice} />
            ))}
          </div>
        </div>
      )}

      <div className="schedules-list">
        {schedules.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📅</span>
            <p>No recurring schedules yet. Create your first schedule to automate regular deliveries.</p>
            <button className="primary-button" onClick={() => { setEditingSchedule(null); setShowForm(true); }}>
              Create Schedule
            </button>
          </div>
        ) : (
          schedules.map(schedule => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              onToggle={toggleSchedule}
              onDelete={deleteSchedule}
              onEdit={handleEdit}
              onRecordDelivery={recordDelivery}
              getNextDelivery={getNextDelivery}
              FREQUENCIES={FREQUENCIES}
            />
          ))
        )}
      </div>

      {showForm && (
        <ScheduleForm
          onSubmit={editingSchedule ? handleUpdate : handleCreate}
          onClose={() => { setShowForm(false); setEditingSchedule(null); }}
          initialData={editingSchedule}
          FREQUENCIES={FREQUENCIES}
          customers={customers}
        />
      )}
    </section>
  );
}