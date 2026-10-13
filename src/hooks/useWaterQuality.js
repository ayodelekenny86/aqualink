import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, insert, update, remove, replaceAll } from '../lib/collections';

const STORAGE_KEY = 'waterQualityRecords';

/**
 * Water Quality Tracking hook: manages water quality certificates, test results,
 * and compliance reporting for sellers and institutional customers.
 */
export function useWaterQuality({ orders = [], onNotice }) {
  const [records, setRecords] = useState(() => list(STORAGE_KEY));
  const [loading, setLoading] = useState(false);

  // Water quality parameters tracked
  const PARAMETERS = [
    { key: 'ph', label: 'pH Level', unit: '', min: 6.5, max: 8.5, critical: true },
    { key: 'turbidity', label: 'Turbidity', unit: 'NTU', min: 0, max: 5, critical: true },
    { key: 'chlorine', label: 'Free Chlorine', unit: 'mg/L', min: 0.2, max: 4.0, critical: true },
    { key: 'tds', label: 'Total Dissolved Solids', unit: 'mg/L', min: 0, max: 1000, critical: false },
    { key: 'hardness', label: 'Hardness (CaCO3)', unit: 'mg/L', min: 0, max: 300, critical: false },
    { key: 'iron', label: 'Iron', unit: 'mg/L', min: 0, max: 0.3, critical: false },
    { key: 'manganese', label: 'Manganese', unit: 'mg/L', min: 0, max: 0.05, critical: false },
    { key: 'coliform', label: 'Total Coliform', unit: 'CFU/100ml', min: 0, max: 0, critical: true },
    { key: 'ecoli', label: 'E. Coli', unit: 'CFU/100ml', min: 0, max: 0, critical: true },
  ];

  // Add a new water quality test record
  const addRecord = useCallback((recordData) => {
    const record = {
      id: `wq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...recordData,
      testedAt: recordData.testedAt || new Date().toISOString(),
      testedBy: recordData.testedBy || 'Unknown',
      certified: recordData.certified || false,
      certificateNumber: recordData.certificateNumber || `CERT-${Date.now()}`,
      expiresAt: recordData.expiresAt || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    };

    const updated = [record, ...records];
    setRecords(updated);
    replaceAll(STORAGE_KEY, updated);
    onNotice?.(`Water quality record added: ${record.source || 'Source'} - ${record.certified ? 'Certified' : 'Pending'}`);
    return record;
  }, [records, onNotice]);

  // Update record
  const updateRecord = useCallback((id, updates) => {
    const updated = records.map(r => r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r);
    setRecords(updated);
    replaceAll(STORAGE_KEY, updated);
    onNotice?.('Water quality record updated');
  }, [records, onNotice]);

  // Certify a record
  const certifyRecord = useCallback((id) => {
    updateRecord(id, { certified: true, certifiedAt: new Date().toISOString() });
    onNotice?.('Record certified and compliance updated');
  }, [updateRecord, onNotice]);

  // Delete record
  const deleteRecord = useCallback((id) => {
    const updated = records.filter(r => r.id !== id);
    setRecords(updated);
    replaceAll(STORAGE_KEY, updated);
    onNotice?.('Water quality record deleted');
  }, [records, onNotice]);

  // Check compliance for a record
  const checkCompliance = useCallback((record) => {
    const results = [];
    let allPass = true;

    PARAMETERS.forEach(param => {
      const value = record[param.key];
      if (value === undefined || value === null || value === '') {
        results.push({ parameter: param.label, status: 'not_tested', value: null });
        return;
      }

      const numValue = parseFloat(value);
      const pass = numValue >= param.min && numValue <= param.max;
      if (!pass) allPass = false;

      results.push({
        parameter: param.label,
        status: pass ? 'pass' : 'fail',
        value: numValue,
        unit: param.unit,
        expected: `${param.min} - ${param.max} ${param.unit}`,
        critical: param.critical,
      });
    });

    return { compliant: allPass, results };
  }, []);

  // Get compliance summary for a seller/source
  const getComplianceSummary = useCallback((sourceId) => {
    const sourceRecords = records.filter(r => r.sourceId === sourceId || r.sellerId === sourceId);
    if (sourceRecords.length === 0) return { compliant: null, latestTest: null, expiryStatus: 'no_data' };

    const latest = sourceRecords[0]; // Records are sorted newest first
    const compliance = checkCompliance(latest);
    const daysToExpiry = latest.expiresAt 
      ? Math.round((new Date(latest.expiresAt) - new Date()) / (1000 * 60 * 60 * 24))
      : -1;

    let expiryStatus = 'valid';
    if (daysToExpiry < 0) expiryStatus = 'expired';
    else if (daysToExpiry < 30) expiryStatus = 'expiring_soon';

    return {
      compliant: compliance.compliant,
      latestTest: latest.testedAt,
      certificateNumber: latest.certificateNumber,
      certified: latest.certified,
      expiryStatus,
      daysToExpiry,
      failedParameters: compliance.results.filter(r => r.status === 'fail'),
    };
  }, [records, checkCompliance]);

  // Get all sources with their compliance status
  const getAllSourcesCompliance = useCallback(() => {
    const sources = new Map();
    records.forEach(r => {
      const key = r.sourceId || r.sellerId || r.source || 'unknown';
      if (!sources.has(key)) sources.set(key, r);
    });

    return Array.from(sources.values()).map(r => getComplianceSummary(r.sourceId || r.sellerId || r.source));
  }, [records, getComplianceSummary]);

  // Get expiring certificates
  const getExpiringCertificates = useCallback((days = 30) => {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + days);

    return records
      .filter(r => r.expiresAt && new Date(r.expiresAt) <= threshold && new Date(r.expiresAt) >= new Date())
      .map(r => ({
        ...r,
        daysRemaining: Math.round((new Date(r.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)),
        compliance: checkCompliance(r),
      }));
  }, [records, checkCompliance]);

  // Generate compliance report
  const generateComplianceReport = useCallback(() => {
    const allSources = getAllSourcesCompliance();
    const total = allSources.length;
    const compliant = allSources.filter(s => s.compliant === true).length;
    const nonCompliant = allSources.filter(s => s.compliant === false).length;
    const noData = allSources.filter(s => s.compliant === null).length;
    const expiring = allSources.filter(s => s.expiryStatus === 'expiring_soon').length;
    const expired = allSources.filter(s => s.expiryStatus === 'expired').length;

    return {
      totalSources: total,
      compliant,
      nonCompliant,
      noData,
      expiringSoon: expiring,
      expired,
      complianceRate: total > 0 ? Math.round((compliant / total) * 100) : 0,
      generatedAt: new Date().toISOString(),
      details: allSources,
    };
  }, [getAllSourcesCompliance]);

  return {
    records,
    loading,
    PARAMETERS,
    addRecord,
    updateRecord,
    certifyRecord,
    deleteRecord,
    checkCompliance,
    getComplianceSummary,
    getAllSourcesCompliance,
    getExpiringCertificates,
    generateComplianceReport,
  };
}

export default useWaterQuality;