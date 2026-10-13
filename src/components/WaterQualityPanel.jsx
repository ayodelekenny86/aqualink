import { useState, useMemo } from 'react';
import { formatCedi } from '../lib/money';
import useWaterQuality from '../hooks/useWaterQuality';

const PARAMETER_DISPLAY = {
  ph: { label: 'pH Level', unit: '', icon: '🧪' },
  turbidity: { label: 'Turbidity', unit: 'NTU', icon: '💧' },
  chlorine: { label: 'Free Chlorine', unit: 'mg/L', icon: '⚗️' },
  tds: { label: 'Total Dissolved Solids', unit: 'mg/L', icon: '🧂' },
  hardness: { label: 'Hardness (CaCO₃)', unit: 'mg/L', icon: '🪨' },
  iron: { label: 'Iron', unit: 'mg/L', icon: '⚙️' },
  manganese: { label: 'Manganese', unit: 'mg/L', icon: '⚙️' },
  coliform: { label: 'Total Coliform', unit: 'CFU/100ml', icon: '🦠' },
  ecoli: { label: 'E. Coli', unit: 'CFU/100ml', icon: '☣️' },
};

function ParameterBadge({ param, value, status, critical }) {
  const display = PARAMETER_DISPLAY[param] || { label: param, unit: '', icon: '📊' };
  const isFail = status === 'fail';
  const notTested = status === 'not_tested';
  
  return (
    <div className={`parameter-badge ${isFail ? 'fail' : notTested ? 'not-tested' : 'pass'} ${critical ? 'critical' : ''}`}>
      <div className="param-header">
        <span className="param-icon">{display.icon}</span>
        <span className="param-label">{display.label}</span>
        {critical && <span className="critical-tag">CRITICAL</span>}
      </div>
      <div className="param-value">
        {notTested ? (
          <span className="not-tested">Not Tested</span>
        ) : (
          <>
            <strong>{value} {display.unit}</strong>
            <span className={isFail ? 'fail-text' : 'pass-text'}>
              {isFail ? 'FAIL' : 'PASS'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function ComplianceCard({ summary, onViewDetails, onNotice }) {
  const statusColor = summary.compliant === true ? 'compliant' : 
                     summary.compliant === false ? 'non-compliant' : 'no-data';
  const statusText = summary.compliant === true ? 'COMPLIANT' : 
                    summary.compliant === false ? 'NON-COMPLIANT' : 'NO DATA';

  return (
    <article className={`compliance-card ${statusColor}`}>
      <div className="card-header">
        <div className="source-info">
          <h4>{summary.sourceName || 'Water Source'}</h4>
          <span className="source-id">{summary.sourceId}</span>
        </div>
        <div className={`compliance-status ${statusColor}`}>
          <span className="status-badge">{statusText}</span>
        </div>
      </div>
      <div className="card-details">
        <div className="detail-row">
          <span>Latest Test</span>
          <strong>{summary.latestTest ? new Date(summary.latestTest).toLocaleDateString() : 'Never'}</strong>
        </div>
        <div className="detail-row">
          <span>Certificate</span>
          <strong>{summary.certificateNumber || 'None'}</strong>
        </div>
        <div className="detail-row expiry {summary.expiryStatus}">
          <span>Expires</span>
          <strong>
            {summary.daysToExpiry > 0 ? `${summary.daysToExpiry} days` : 
             summary.daysToExpiry === 0 ? 'Today' : 'Expired'}
          </strong>
        </div>
        {summary.failedParameters?.length > 0 && (
          <div className="failed-params">
            <span className="fail-count">{summary.failedParameters.length} failed parameter(s)</span>
            <ul>
              {summary.failedParameters.map((p, i) => (
                <li key={i}>{p.parameter}: {p.value} {p.unit} (expected {p.expected})</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="card-actions">
        <button className="outline-button" onClick={() => onViewDetails?.(summary.sourceId)}>
          View Details
        </button>
        {summary.compliant === false && (
          <button className="primary-button" onClick={() => onNotice?.('Compliance remediation workflow started')}>
            Remediate
          </button>
        )}
      </div>
    </article>
  );
}

function AddRecordModal({ onClose, onAdd, sources, sellers }) {
  const [form, setForm] = useState({
    source: '',
    sourceId: '',
    sellerId: '',
    testedBy: '',
    certified: false,
    ph: '',
    turbidity: '',
    chlorine: '',
    tds: '',
    hardness: '',
    iron: '',
    manganese: '',
    coliform: '',
    ecoli: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd(form);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>Add Water Quality Record</h3>
          <button onClick={onClose}>×</button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <h4>Source Information</h4>
            <label>
              Source Name
              <input value={form.source} onChange={(e) => setForm({...form, source: e.target.value})} placeholder="e.g., Main Treatment Plant" required />
            </label>
            <label>
              Source ID
              <input value={form.sourceId} onChange={(e) => setForm({...form, sourceId: e.target.value})} placeholder="e.g., SRC-001" />
            </label>
            <label>
              Seller
              <select value={form.sellerId} onChange={(e) => setForm({...form, sellerId: e.target.value})}>
                <option value="">Select seller...</option>
                {sellers?.map(s => <option key={s.sellerId} value={s.sellerId}>{s.sellerName || s.sellerId}</option>)}
              </select>
            </label>
            <label>
              Tested By
              <input value={form.testedBy} onChange={(e) => setForm({...form, testedBy: e.target.value})} placeholder="Lab technician name" required />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.certified} onChange={(e) => setForm({...form, certified: e.target.checked})} />
              Certified (official certificate issued)
            </label>
          </div>
          <div className="form-section">
            <h4>Test Parameters</h4>
            <div className="parameter-grid">
              {Object.keys(PARAMETER_DISPLAY).map(param => (
                <label key={param}>
                  {PARAMETER_DISPLAY[param].label} ({PARAMETER_DISPLAY[param].unit})
                  <input 
                    type="number" 
                    step="any" 
                    value={form[param]} 
                    onChange={(e) => setForm({...form, [param]: e.target.value})}
                    placeholder={param}
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="text-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button">Add Record</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function WaterQualityPanel({ orders = [], onNotice, sellers = [] }) {
  const {
    records,
    addRecord,
    updateRecord,
    certifyRecord,
    deleteRecord,
    checkCompliance,
    getComplianceSummary,
    getAllSourcesCompliance,
    getExpiringCertificates,
    generateComplianceReport,
    PARAMETERS,
  } = useWaterQuality({ orders, onNotice });

  const [showModal, setShowModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [viewMode, setViewMode] = useState('compliance'); // 'compliance', 'records', 'report'

  const complianceData = useMemo(() => getAllSourcesCompliance(), [getAllSourcesCompliance]);
  const expiring = useMemo(() => getExpiringCertificates(30), [getExpiringCertificates]);
  const report = useMemo(() => generateComplianceReport(), [generateComplianceReport]);

  const handleViewDetails = (sourceId) => {
    const record = records.find(r => r.sourceId === sourceId || r.sellerId === sourceId);
    if (record) setSelectedRecord(record);
  };

  return (
    <section className="panel water-quality-panel">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">WATER QUALITY</span>
          <h2>Compliance & Testing</h2>
        </div>
        <div className="toolbar-actions">
          <select value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
            <option value="compliance">Compliance Overview</option>
            <option value="records">All Records</option>
            <option value="report">Compliance Report</option>
          </select>
          <button className="primary-button" onClick={() => setShowModal(true)}>
            + Add Test Record
          </button>
        </div>
      </div>

      {viewMode === 'compliance' && (
        <>
          {expiring.length > 0 && (
            <div className="alert-banner warning">
              <span className="alert-icon">⚠</span>
              <div>
                <strong>{expiring.length} certificate{expiring.length !== 1 ? 's' : ''} expiring within 30 days</strong>
                <span>{expiring.map(e => `${e.source || e.sourceId} (${e.daysRemaining}d)`).join(', ')}</span>
              </div>
            </div>
          )}

          <div className="compliance-summary">
            <article className="stat-card {report.complianceRate >= 80 ? 'good' : report.complianceRate >= 50 ? 'warning' : 'critical'}">
              <span>Compliance Rate</span>
              <strong>{report.complianceRate}%</strong>
            </article>
            <article className="stat-card good">
              <span>Compliant Sources</span>
              <strong>{report.compliant}</strong>
            </article>
            <article className="stat-card critical">
              <span>Non-Compliant</span>
              <strong>{report.nonCompliant}</strong>
            </article>
            <article className="stat-card warning">
              <span>Expiring Soon</span>
              <strong>{report.expiringSoon}</strong>
            </article>
            <article className="stat-card">
              <span>Expired</span>
              <strong>{report.expired}</strong>
            </article>
            <article className="stat-card">
              <span>No Data</span>
              <strong>{report.noData}</strong>
            </article>
          </div>

          <div className="compliance-grid">
            {complianceData.map((summary, i) => (
              <ComplianceCard 
                key={i} 
                summary={{ ...summary, sourceName: summary.sourceName || summary.sourceId }} 
                onViewDetails={handleViewDetails}
                onNotice={onNotice}
              />
            ))}
            {complianceData.length === 0 && (
              <div className="empty-state">
                <span className="empty-icon">🧪</span>
                <p>No water quality records yet. Add your first test record to start tracking compliance.</p>
                <button className="primary-button" onClick={() => setShowModal(true)}>
                  Add First Record
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {viewMode === 'records' && (
        <div className="records-table">
          <div className="table-header">
            <span>Source</span>
            <span>Tested</span>
            <span>Tested By</span>
            <span>Certified</span>
            <span>Expires</span>
            <span>Actions</span>
          </div>
          {records.map(record => (
            <div key={record.id} className="record-row">
              <span>{record.source || record.sourceId || 'Unknown'}</span>
              <span>{new Date(record.testedAt).toLocaleDateString()}</span>
              <span>{record.testedBy}</span>
              <span className={record.certified ? 'certified' : 'pending'}>
                {record.certified ? '✓ Certified' : 'Pending'}
              </span>
              <span className={record.expiresAt && new Date(record.expiresAt) < new Date() ? 'expired' : ''}>
                {record.expiresAt ? new Date(record.expiresAt).toLocaleDateString() : '—'}
              </span>
              <div className="record-actions">
                <button className="icon-button" onClick={() => setSelectedRecord(record)}>View</button>
                {!record.certified && (
                  <button className="icon-button" onClick={() => { certifyRecord(record.id); onNotice?.('Record certified'); }}>
                    Certify
                  </button>
                )}
                <button className="icon-button danger" onClick={() => deleteRecord(record.id)}>Delete</button>
              </div>
            </div>
          ))}
          {records.length === 0 && (
            <div className="empty-row">No records found</div>
          )}
        </div>
      )}

      {viewMode === 'report' && (
        <div className="compliance-report">
          <div className="report-header">
            <h3>Water Quality Compliance Report</h3>
            <small>Generated: {new Date(report.generatedAt).toLocaleString()}</small>
            <button className="outline-button" onClick={() => onNotice?.('Report downloaded')}>Download PDF</button>
          </div>
          <div className="report-summary">
            <div className="summary-stats">
              <div className="stat">Total Sources: <strong>{report.totalSources}</strong></div>
              <div className="stat">Compliant: <strong className="good">{report.compliant}</strong></div>
              <div className="stat">Non-Compliant: <strong className="critical">{report.nonCompliant}</strong></div>
              <div className="stat">No Data: <strong>{report.noData}</strong></div>
              <div className="stat">Compliance Rate: <strong>{report.complianceRate}%</strong></div>
            </div>
          </div>
          <div className="report-details">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Latest Test</th>
                  <th>Certificate</th>
                  <th>Expires</th>
                  <th>Failed Params</th>
                </tr>
              </thead>
              <tbody>
                {report.details.map((d, i) => (
                  <tr key={i}>
                    <td>{d.sourceName || d.sourceId}</td>
                    <td className={d.compliant === true ? 'good' : d.compliant === false ? 'critical' : ''}>
                      {d.compliant === true ? '✓' : d.compliant === false ? '✗' : '—'}
                    </td>
                    <td>{d.latestTest ? new Date(d.latestTest).toLocaleDateString() : 'Never'}</td>
                    <td>{d.certificateNumber || 'None'}</td>
                    <td className={d.expiryStatus === 'expired' ? 'critical' : d.expiryStatus === 'expiring_soon' ? 'warning' : ''}>
                      {d.daysToExpiry > 0 ? `${d.daysToExpiry}d` : d.daysToExpiry === 0 ? 'Today' : 'Expired'}
                    </td>
                    <td>{d.failedParameters?.length || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedRecord && (
        <div className="modal-backdrop" onClick={() => setSelectedRecord(null)}>
          <div className="modal record-detail" onClick={(e) => e.stopPropagation()}>
            <header className="modal-head">
              <h3>Water Quality Detail</h3>
              <button onClick={() => setSelectedRecord(null)}>×</button>
            </header>
            <div className="record-detail-content">
              <div className="detail-header">
                <h4>{selectedRecord.source || selectedRecord.sourceId}</h4>
                <div className="detail-meta">
                  <span>Tested: {new Date(selectedRecord.testedAt).toLocaleString()}</span>
                  <span>By: {selectedRecord.testedBy}</span>
                  <span className={selectedRecord.certified ? 'certified' : 'pending'}>
                    {selectedRecord.certified ? '✓ Certified' : 'Pending'}
                  </span>
                  <span>Certificate: {selectedRecord.certificateNumber}</span>
                  <span>Expires: {selectedRecord.expiresAt ? new Date(selectedRecord.expiresAt).toLocaleDateString() : 'Never'}</span>
                </div>
              </div>
              <div className="parameters-grid">
                {PARAMETERS.map(param => {
                  const value = selectedRecord[param.key];
                  const compliance = checkCompliance(selectedRecord);
                  const result = compliance.results.find(r => r.parameter === param.label);
                  return (
                    <ParameterBadge 
                      key={param.key} 
                      param={param.key} 
                      value={value ?? '—'} 
                      status={result?.status || 'not_tested'} 
                      critical={param.critical}
                    />
                  );
                })}
              </div>
              <div className="detail-actions">
                {!selectedRecord.certified && (
                  <button className="primary-button" onClick={() => { certifyRecord(selectedRecord.id); setSelectedRecord(null); onNotice?.('Record certified'); }}>
                    Certify Record
                  </button>
                )}
                <button className="outline-button" onClick={() => setSelectedRecord(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <AddRecordModal 
          onClose={() => setShowModal(false)} 
          onAdd={addRecord} 
          sources={[]} 
          sellers={sellers} 
        />
      )}
    </section>
  );
}