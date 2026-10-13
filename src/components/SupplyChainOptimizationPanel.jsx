import React, { useState, useMemo } from 'react';
import { useSupplyChainOptimization } from '../hooks/useSupplyChainOptimization';

export default function SupplyChainOptimizationPanel({ 
  suppliers = [], 
  warehouses = [], 
  orders = [], 
  onNotice 
}) {
  const [activeTab, setActiveTab] = useState('suppliers');

  const {
    supplyChain,
    warehouseStatus,
    optimizations,
    summary,
    loading,
    lastUpdated,
    refresh,
    formatCedi,
  } = useSupplyChainOptimization({ suppliers, warehouses, orders, onNotice });

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="section-kicker">SUPPLY CHAIN OPTIMIZATION</span>
            <h2>AI-Powered Supply Chain Intelligence</h2>
          </div>
        </div>
        <div className="loading">Analyzing supply chain...</div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">SUPPLY CHAIN OPTIMIZATION</span>
          <h2>AI-Powered Supply Chain Intelligence</h2>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-ghost" onClick={refresh} disabled={loading}>
            <i data-lucide="refresh-cw" /> Refresh
          </button>
        </div>
      </div>

      <div className="supply-chain-summary">
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="factory" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.totalSuppliers}</p>
            <p className="summary-label">Total Suppliers</p>
          </div>
        </article>
        <article className="summary-card success">
          <div className="summary-icon"><i data-lucide="check-circle" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.healthySuppliers}</p>
            <p className="summary-label">Healthy</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="warehouse" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.totalWarehouses}</p>
            <p className="summary-label">Warehouses</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="target" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.optimalWarehouses}</p>
            <p className="summary-label">Optimal Capacity</p>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><i data-lucide="dollar-sign" /></div>
          <div className="summary-content">
            <p className="summary-value">{formatCedi(summary.totalCost)}</p>
            <p className="summary-label">Total Procurement Cost</p>
          </div>
        </article>
        <article className="summary-card warning">
          <div className="summary-icon"><i data-lucide="alert-triangle" /></div>
          <div className="summary-content">
            <p className="summary-value">{summary.criticalOptimizations}</p>
            <p className="summary-label">Critical Actions</p>
          </div>
        </article>
      </div>

      <div className="supply-chain-tabs">
        <div className="tab-nav">
          {['suppliers', 'warehouses', 'optimizations'].map(tab => (
            <button
              key={tab}
              className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'optimizations' && optimizations.length > 0 && <span className="badge">{optimizations.length}</span>}
            </button>
          ))}
        </div>

        {activeTab === 'suppliers' && (
          <div className="tab-content">
            <div className="supplier-grid">
              {supplyChain.map(supplier => (
                <article key={supplier.id} className={`supplier-card panel ${supplier.status}`}>
                  <div className="supplier-header">
                    <div>
                      <strong>{supplier.name}</strong>
                      <small>{supplier.type.toUpperCase()} · {supplier.location}</small>
                    </div>
                    <span className={`status ${supplier.status === 'healthy' ? 'status-delivered' : supplier.status === 'warning' ? 'status-awaiting' : 'status-cancelled'}`}>
                      {supplier.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="supplier-stats">
                    <div className="stat-row">
                      <span className="stat-label">Reliability</span>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${supplier.actualReliability * 100}%` }} />
                        <span>{Math.round(supplier.actualReliability * 100)}%</span>
                      </div>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Quality Score</span>
                      <span className="stat-value">{supplier.qualityScore}/100</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Cost/Gallon</span>
                      <span className="stat-value">GH₵${supplier.costPerGallon.toFixed(3)}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Total Cost</span>
                      <span className="stat-value">{formatCedi(supplier.totalCost)}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Avg Delivery</span>
                      <span className="stat-value">{supplier.avgDeliveryTime} min</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Contract</span>
                      <span className="stat-value">{supplier.contractDaysLeft} days left</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Last Delivery</span>
                      <span className="stat-value">{supplier.daysSinceLastDelivery} days ago</span>
                    </div>
                    {supplier.riskFactors.length > 0 && (
                      <div className="risk-factors">
                        <span className="stat-label">Risk Factors:</span>
                        {supplier.riskFactors.map((factor, i) => (
                          <span key={i} className="risk-tag">{factor}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="supplier-actions">
                    {supplier.status !== 'healthy' && (
                      <button className="btn btn-sm btn-primary">Review Contract</button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'warehouses' && (
          <div className="tab-content">
            <div className="warehouse-grid">
              {warehouseStatus.map(wh => (
                <article key={wh.id} className={`warehouse-card panel ${wh.status}`}>
                  <div className="warehouse-header">
                    <div>
                      <strong>{wh.name}</strong>
                      <small>{wh.location} · {wh.type.toUpperCase()}</small>
                    </div>
                    <span className={`status ${wh.status === 'normal' ? 'status-delivered' : wh.status === 'warning' ? 'status-awaiting' : wh.status === 'critical' ? 'status-cancelled' : 'status-enroute'}`}>
                      {wh.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="warehouse-stats">
                    <div className="stat-row">
                      <span className="stat-label">Utilization</span>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${wh.utilization}%`, background: wh.utilization > 90 ? '#ef4444' : wh.utilization > 75 ? '#f59e0b' : wh.utilization < 20 ? '#3b82f6' : '#10b981' }} />
                        <span>{wh.utilization}%</span>
                      </div>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Capacity</span>
                      <span className="stat-value">{wh.currentStock.toLocaleString()} / {wh.capacity.toLocaleString()} gal</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Days of Supply</span>
                      <span className="stat-value">{wh.daysOfSupply} days</span>
                    </div>
                    {wh.reorderRecommended && (
                      <div className="stat-row warning">
                        <span className="stat-label">⚠ Reorder Recommended</span>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'optimizations' && (
          <div className="tab-content">
            {optimizations.length === 0 ? (
              <div className="empty-state success">
                <i data-lucide="check-circle" />
                <h3>Supply chain optimized</h3>
                <p>No critical optimizations needed at this time</p>
              </div>
            ) : (
              <div className="optimizations-list">
                {optimizations.map(opt => (
                  <article key={opt.id} className={`optimization-card ${opt.priority}`}>
                    <div className="optimization-header">
                      <div>
                        <h4>{opt.title}</h4>
                        <p>{opt.description}</p>
                      </div>
                      <span className={`priority-badge ${opt.priority}`}>{opt.priority.toUpperCase()}</span>
                    </div>
                    <div className="optimization-details">
                      <div><span>Potential Savings:</span> <strong>{opt.potentialSavings > 0 ? formatCedi(opt.potentialSavings) : 'N/A'}</strong></div>
                      <div><span>Recommended Action:</span> <strong>{opt.action}</strong></div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="panel-footer">
        <span className="last-updated">Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}</span>
        <span className="data-source">{suppliers.length || 'Default'} suppliers · {warehouses.length || 'Default'} warehouses</span>
      </div>
    </section>
  );
}