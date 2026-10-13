import { useState, useEffect, useMemo } from 'react';
import { formatCedi } from '../lib/money';
import useDynamicPricing from '../hooks/useDynamicPricing';

function PricingRuleCard({ rule, onToggle, onUpdate, sellerRanked }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [config, setConfig] = useState(rule.config);

  const isSurge = rule.type === 'surge';
  const isActive = rule.active;

  if (isSurge) {
    // Special rendering for surge rule - show current status
    const [surgeData, setSurgeData] = useState({ active: false, multiplier: 1.0 });
    
    useEffect(() => {
      // This would be connected to the hook's calculateSurgeMultiplier
      const interval = setInterval(() => {
        // In real app, this comes from the hook
        setSurgeData({ active: false, multiplier: 1.0 });
      }, 5000);
      return () => clearInterval(interval);
    }, []);

    return (
      <article className={`pricing-rule-card ${isActive ? 'active' : 'inactive'} ${surgeData.active ? 'surge-active' : ''}`}>
        <div className="rule-header" onClick={() => setExpanded(!expanded)}>
          <div className="rule-info">
            <span className={`rule-type ${rule.type}`}>{rule.type.toUpperCase()}</span>
            <h4>{rule.name}</h4>
            <p className="rule-description">{surgeData.active ? `ACTIVE: ${surgeData.multiplier.toFixed(2)}x multiplier` : 'Surge pricing monitors demand/supply ratio'}</p>
          </div>
          <div className="rule-toggle">
            <label className="switch">
              <input type="checkbox" checked={isActive} onChange={() => onToggle(rule.id)} />
              <span className="slider" />
            </label>
            {expanded && <span className="expand-icon">▼</span>}
          </div>
        </div>
        
        {expanded && (
          <div className="rule-details">
            <div className="surge-config">
              <label>
                Trigger Threshold (orders/driver)
                <input 
                  type="number" 
                  step="0.1" 
                  value={config.triggerThreshold} 
                  onChange={(e) => setConfig({...config, triggerThreshold: parseFloat(e.target.value)})}
                />
              </label>
              <label>
                Max Multiplier
                <input 
                  type="number" 
                  step="0.1" 
                  value={config.maxMultiplier} 
                  onChange={(e) => setConfig({...config, maxMultiplier: parseFloat(e.target.value)})}
                />
              </label>
              <button className="text-button" onClick={() => onUpdate(rule.id, config)}>
                Save Changes
              </button>
            </div>
          </div>
        )}
      </article>
    );
  }

  // Standard rule card
  return (
    <article className={`pricing-rule-card ${isActive ? 'active' : 'inactive'}`}>
      <div className="rule-header" onClick={() => setExpanded(!expanded)}>
        <div className="rule-info">
          <span className={`rule-type ${rule.type}`}>{rule.type.toUpperCase()}</span>
          <h4>{rule.name}</h4>
          <p className="rule-description">{getRuleDescription(rule)}</p>
        </div>
        <div className="rule-toggle">
          <label className="switch">
            <input type="checkbox" checked={isActive} onChange={() => onToggle(rule.id)} />
            <span className="slider" />
          </label>
          {expanded && <span className="expand-icon">▼</span>}
        </div>
      </div>
      
      {expanded && (
        <div className="rule-details">
          {editing ? (
            <RuleEditor rule={rule} config={config} onConfigChange={setConfig} onSave={() => { onUpdate(rule.id, config); setEditing(false); }} onCancel={() => { setConfig(rule.config); setEditing(false); }} />
          ) : (
            <RulePreview rule={rule} config={config} onEdit={() => setEditing(true)} sellerRanked={sellerRanked} />
          )}
        </div>
      )}
    </article>
  );
}

function RulePreview({ rule, config, onEdit, sellerRanked }) {
  switch (rule.type) {
    case 'volume_discount':
      return (
        <div className="config-preview">
          <h5>Volume Tiers</h5>
          <div className="tier-list">
            {config.tiers?.map((tier, i) => (
              <div key={i} className="tier-row">
                <span>{tier.minVolume}-{tier.maxVolume} gal</span>
                <span className={tier.discount > 0 ? 'discount' : ''}>
                  {tier.discount > 0 ? `-${tier.discount}%` : 'Standard'}
                </span>
              </div>
            ))}
          </div>
          <button className="text-button" onClick={onEdit}>Edit tiers</button>
        </div>
      );
    case 'loyalty':
      return (
        <div className="config-preview">
          <h5>Tier Benefits</h5>
          <div className="tier-list">
            {Object.entries(config).map(([tier, benefits]) => (
              <div key={tier} className="tier-row">
                <span className={`tier-badge ${tier.toLowerCase()}`}>{tier}</span>
                <span>Discount: {benefits.discount || 0}%</span>
                <span>Cashback: {benefits.cashback || 0}%</span>
              </div>
            ))}
          </div>
          <button className="text-button" onClick={onEdit}>Edit benefits</button>
        </div>
      );
    case 'time_based':
      return (
        <div className="config-preview">
          <h5>Time-based Multipliers</h5>
          <div className="config-row">
            <label>Peak: {config.peakHours?.start}:00-{config.peakHours?.end}:00 ×{config.peakHours?.multiplier}</label>
          </div>
          <div className="config-row">
            <label>Off-peak: {config.offPeakHours?.start}:00-{config.offPeakHours?.end}:00 ×{config.offPeakHours?.multiplier}</label>
          </div>
          <button className="text-button" onClick={onEdit}>Edit hours</button>
        </div>
      );
    case 'regional':
      return (
        <div className="config-preview">
          <h5>Regional Multipliers</h5>
          <div className="tier-list">
            {Object.entries(config).map(([region, data]) => (
              <div key={region} className="tier-row">
                <span>{region}</span>
                <span>×{data.multiplier}</span>
              </div>
            ))}
          </div>
          <button className="text-button" onClick={onEdit}>Edit regions</button>
        </div>
      );
    case 'seller_performance':
      const topSellers = sellerRanked?.filter(s => (s.score || 0) >= (config.thresholdScore || 80)) || [];
      return (
        <div className="config-preview">
          <h5>Top Performer Discount</h5>
          <div className="config-row">
            <label>Threshold Score: {config.thresholdScore || 80}</label>
          </div>
          <div className="config-row">
            <label>Platform Fee Reduction: {config.topPerformerDiscount || 0}%</label>
          </div>
          <p className="config-note">{topSellers.length} sellers qualify</p>
          <button className="text-button" onClick={onEdit}>Edit thresholds</button>
        </div>
      );
    default:
      return (
        <div className="config-preview">
          <pre>{JSON.stringify(config, null, 2)}</pre>
          <button className="text-button" onClick={onEdit}>Edit</button>
        </div>
      );
  }
}

function RuleEditor({ rule, config, onConfigChange, onSave, onCancel }) {
  // Simplified editor - in real app would have proper forms per rule type
  return (
    <div className="rule-editor">
      <pre>{JSON.stringify(config, null, 2)}</pre>
      <div className="editor-actions">
        <button className="primary-button" onClick={onSave}>Save</button>
        <button className="text-button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function getRuleDescription(rule) {
  switch (rule.type) {
    case 'base': return `Base rate: ${formatCedi(rule.config.pricePer1000Gal || 15000)}/1000 gal`;
    case 'volume_discount': return 'Tiered discounts for larger orders';
    case 'loyalty': return 'Tier-based discounts and cashback';
    case 'time_based': return `Peak: ${rule.config.peakHours?.multiplier}x, Off-peak: ${rule.config.offPeakHours?.multiplier}x`;
    case 'regional': return Object.entries(rule.config).map(([r, d]) => `${r}: ×${d.multiplier}`).join(', ');
    case 'seller_performance': return `Top sellers (≥${rule.config.thresholdScore} score): -${rule.config.topPerformerDiscount}% platform fee`;
    case 'surge': return 'Automatic surge when demand exceeds supply';
    default: return '';
  }
}

function PriceCalculator({ calculatePrice, onNotice }) {
  const [params, setParams] = useState({
    volumeGallons: 2000,
    region: 'Accra',
    loyaltyTier: 'Silver',
    sellerId: null,
  });
  const [result, setResult] = useState(null);

  useEffect(() => {
    const r = calculatePrice(params);
    setResult(r);
  }, [calculatePrice, params]);

  if (!result) return <div>Calculating...</div>;

  return (
    <section className="panel price-calculator">
      <div className="panel-title">
        <span className="section-kicker">PRICE CALCULATOR</span>
        <h3>Test Dynamic Pricing</h3>
      </div>
      <div className="calculator-inputs">
        <label>
          Volume (gallons)
          <input 
            type="number" 
            value={params.volumeGallons} 
            onChange={(e) => setParams({...params, volumeGallons: parseInt(e.target.value)})}
            min={1000} max={5000} step={1000}
          />
        </label>
        <label>
          Region
          <select value={params.region} onChange={(e) => setParams({...params, region: e.target.value})}>
            <option value="Accra">Accra</option>
            <option value="Kumasi">Kumasi</option>
            <option value="Takoradi">Takoradi</option>
            <option value="Tema">Tema</option>
            <option value="Lagos">Lagos</option>
            <option value="Abidjan">Abidjan</option>
          </select>
        </label>
        <label>
          Loyalty Tier
          <select value={params.loyaltyTier} onChange={(e) => setParams({...params, loyaltyTier: e.target.value})}>
            <option value="">None</option>
            <option value="Bronze">Bronze</option>
            <option value="Silver">Silver</option>
            <option value="Gold">Gold</option>
            <option value="Platinum">Platinum</option>
          </select>
        </label>
      </div>
      <div className="calculator-result">
        <div className="price-display">
          <span className="price-label">Final Price</span>
          <span className="price-value">{result.formatted}</span>
          {result.surgeActive && (
            <span className="surge-badge">Surge ×{result.surgeMultiplier.toFixed(2)}</span>
          )}
        </div>
        <div className="price-breakdown">
          {result.breakdown.map((item, i) => (
            <div key={i} className={`breakdown-row ${item.amount < 0 ? 'discount' : item.amount > 0 ? 'surcharge' : ''}`}>
              <span>{item.rule}</span>
              <span>{item.description}</span>
              <span className="amount">{item.amount >= 0 ? '+' : ''}{formatCedi(item.amount)}</span>
            </div>
          ))}
          <div className="breakdown-total">
            <span>Total</span>
            <span>{result.formatted}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function DynamicPricingConsole({ orders = [], sellerRanked = [], onNotice }) {
  const {
    rules,
    activeSurge,
    calculatePrice,
    calculateSurgeMultiplier,
    toggleRule,
    updateRule,
    addRule,
  } = useDynamicPricing({ orders, sellerRanked, onNotice });

  const [showCalculator, setShowCalculator] = useState(true);

  const surge = calculateSurgeMultiplier();

  return (
    <section className="panel dynamic-pricing-console">
      <div className="panel-toolbar">
        <div className="panel-title">
          <span className="section-kicker">DYNAMIC PRICING</span>
          <h2>Smart Pricing Engine</h2>
        </div>
        <div className="toolbar-actions">
          {surge.active && (
            <span className="surge-indicator active">
              ⚡ SURGE ACTIVE: {surge.multiplier.toFixed(2)}x (ratio: {surge.ratio.toFixed(1)})
            </span>
          )}
          <button className="outline-button" onClick={() => setShowCalculator(!showCalculator)}>
            {showCalculator ? 'Hide Calculator' : 'Show Calculator'}
          </button>
        </div>
      </div>

      <div className="pricing-grid">
        <div className="rules-section">
          <h4>Active Pricing Rules</h4>
          <div className="rules-list">
            {rules.map(rule => (
              <PricingRuleCard 
                key={rule.id} 
                rule={rule} 
                onToggle={toggleRule} 
                onUpdate={updateRule} 
                sellerRanked={sellerRanked}
              />
            ))}
          </div>
        </div>

        {showCalculator && (
          <div className="calculator-section">
            <PriceCalculator calculatePrice={calculatePrice} onNotice={onNotice} />
          </div>
        )}
      </div>

      <div className="pricing-insights">
        <h4>Pricing Insights</h4>
        <div className="insights-grid">
          <article className="insight-card">
            <span className="insight-label">Active Rules</span>
            <strong>{rules.filter(r => r.active).length} / {rules.length}</strong>
          </article>
          <article className="insight-card">
            <span className="insight-label">Surge Status</span>
            <strong>{surge.active ? 'ACTIVE' : 'Normal'}</strong>
          </article>
          <article className="insight-card">
            <span className="insight-label">Demand Ratio</span>
            <strong>{surge.ratio?.toFixed(1) || 'N/A'}</strong>
          </article>
          <article className="insight-card">
            <span className="insight-label">Top Sellers</span>
            <strong>{sellerRanked?.filter(s => (s.score || 0) >= 80).length || 0}</strong>
          </article>
        </div>
      </div>
    </section>
  );
}