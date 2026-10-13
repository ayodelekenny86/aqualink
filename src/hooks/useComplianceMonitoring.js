import { useState, useEffect, useCallback, useMemo } from 'react';

export function useComplianceMonitoring({ 
  permits = [], 
  inspections = [], 
  regulations = [],
  facilities = [],
  onNotice 
}) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const checkCompliance = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 250));

      const now = new Date();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;

      const permitStatus = permits.map(permit => {
        const expiry = new Date(permit.expiryDate);
        const daysUntilExpiry = Math.ceil((expiry - now) / (24 * 60 * 60 * 1000));
        const isExpired = daysUntilExpiry < 0;
        const isExpiringSoon = daysUntilExpiry >= 0 && daysUntilExpiry <= 30;

        return {
          ...permit,
          daysUntilExpiry,
          status: isExpired ? 'expired' : isExpiringSoon ? 'expiring' : 'valid',
          riskLevel: isExpired ? 'critical' : isExpiringSoon ? 'high' : 'low'
        };
      });

      const inspectionStatus = inspections.map(inspection => {
        const dueDate = new Date(inspection.dueDate);
        const daysUntilDue = Math.ceil((dueDate - now) / (24 * 60 * 60 * 1000));
        const isOverdue = daysUntilDue < 0;
        const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 14;

        return {
          ...inspection,
          daysUntilDue,
          status: isOverdue ? 'overdue' : isDueSoon ? 'due_soon' : 'scheduled',
          riskLevel: isOverdue ? 'critical' : isDueSoon ? 'high' : 'low'
        };
      });

      const regulationStatus = regulations.map(reg => {
        const facilityCompliance = facilities.map(f => {
          const facilityReg = f.regulations?.find(r => r.id === reg.id);
          return {
            facilityId: f.id,
            facilityName: f.name,
            compliant: facilityReg?.compliant ?? true,
            lastChecked: facilityReg?.lastChecked,
            notes: facilityReg?.notes
          };
        });

        const nonCompliant = facilityCompliance.filter(f => !f.compliant).length;
        const total = facilityCompliance.length;
        const complianceRate = total ? (total - nonCompliant) / total : 1;

        return {
          ...reg,
          complianceRate: Math.round(complianceRate * 100),
          nonCompliantCount: nonCompliant,
          totalFacilities: total,
          status: complianceRate === 1 ? 'compliant' : complianceRate >= 0.8 ? 'mostly_compliant' : 'non_compliant',
          facilities: facilityCompliance
        };
      });

      const criticalAlerts = [
        ...permitStatus.filter(p => p.status === 'expired').map(p => ({
          type: 'permit_expired',
          severity: 'critical',
          title: `Permit Expired: ${p.name}`,
          message: `${p.name} (${p.type}) expired ${Math.abs(p.daysUntilExpiry)} days ago`,
          entityId: p.id,
          entityType: 'permit',
          action: 'Renew immediately to avoid service disruption'
        })),
        ...permitStatus.filter(p => p.status === 'expiring').map(p => ({
          type: 'permit_expiring',
          severity: 'high',
          title: `Permit Expiring Soon: ${p.name}`,
          message: `${p.name} expires in ${p.daysUntilExpiry} days`,
          entityId: p.id,
          entityType: 'permit',
          action: 'Initiate renewal process'
        })),
        ...inspectionStatus.filter(i => i.status === 'overdue').map(i => ({
          type: 'inspection_overdue',
          severity: 'critical',
          title: `Inspection Overdue: ${i.type}`,
          message: `${i.type} inspection at ${i.facilityName} was due ${Math.abs(i.daysUntilDue)} days ago`,
          entityId: i.id,
          entityType: 'inspection',
          action: 'Schedule inspection immediately'
        })),
        ...inspectionStatus.filter(i => i.status === 'due_soon').map(i => ({
          type: 'inspection_due',
          severity: 'high',
          title: `Inspection Due: ${i.type}`,
          message: `${i.type} inspection at ${i.facilityName} due in ${i.daysUntilDue} days`,
          entityId: i.id,
          entityType: 'inspection',
          action: 'Confirm inspection schedule'
        })),
        ...regulationStatus.filter(r => r.status === 'non_compliant').flatMap(r => 
          r.facilities.filter(f => !f.compliant).map(f => ({
            type: 'regulation_violation',
            severity: 'critical',
            title: `Regulation Violation: ${r.name}`,
            message: `Facility ${f.facilityName} non-compliant with ${r.name} (${r.code})`,
            entityId: r.id,
            entityType: 'regulation',
            facilityId: f.facilityId,
            action: 'Review and remediate compliance gap'
          }))
        )
      ];

      const expiringPermits = permitStatus.filter(p => p.status === 'expiring').length;
      const overdueInspections = inspectionStatus.filter(i => i.status === 'overdue').length;
      const nonCompliantRegs = regulationStatus.filter(r => r.status === 'non_compliant').length;

      const overallScore = Math.max(0, 100 - (
        permitStatus.filter(p => p.status === 'expired').length * 20 +
        permitStatus.filter(p => p.status === 'expiring').length * 5 +
        inspectionStatus.filter(i => i.status === 'overdue').length * 15 +
        inspectionStatus.filter(i => i.status === 'due_soon').length * 3 +
        nonCompliantRegs * 10
      ));

      const newStatus = {
        permits: permitStatus,
        inspections: inspectionStatus,
        regulations: regulationStatus,
        alerts: criticalAlerts.sort((a, b) => 
          (b.severity === 'critical' ? 2 : 1) - (a.severity === 'critical' ? 2 : 1)
        ),
        summary: {
          overallScore,
          totalPermits: permits.length,
          validPermits: permitStatus.filter(p => p.status === 'valid').length,
          expiringPermits,
          expiredPermits: permitStatus.filter(p => p.status === 'expired').length,
          totalInspections: inspections.length,
          overdueInspections,
          dueSoonInspections: inspectionStatus.filter(i => i.status === 'due_soon').length,
          totalRegulations: regulations.length,
          compliantRegulations: regulationStatus.filter(r => r.status === 'compliant').length,
          nonCompliantRegulations: nonCompliantRegs
        },
        lastChecked: new Date().toISOString()
      };

      setStatus(newStatus);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [permits, inspections, regulations, facilities]);

  useEffect(() => { checkCompliance(); }, [checkCompliance]);

  const acknowledgeAlert = useCallback((alertId) => {
    setStatus(prev => prev ? {
      ...prev,
      alerts: prev.alerts.filter(a => a.entityId !== alertId)
    } : null);
    onNotice?.(`Alert acknowledged`);
  }, [onNotice]);

  const getPermitStatus = useCallback((permitId) => {
    return status?.permits?.find(p => p.id === permitId) || null;
  }, [status]);

  const getInspectionStatus = useCallback((inspectionId) => {
    return status?.inspections?.find(i => i.id === inspectionId) || null;
  }, [status]);

  const getRegulationStatus = useCallback((regulationId) => {
    return status?.regulations?.find(r => r.id === regulationId) || null;
  }, [status]);

  return {
    status,
    loading,
    error,
    refresh: checkCompliance,
    acknowledgeAlert,
    getPermitStatus,
    getInspectionStatus,
    getRegulationStatus,
    overallScore: status?.summary?.overallScore || 100,
    criticalAlerts: status?.alerts?.filter(a => a.severity === 'critical') || [],
    highAlerts: status?.alerts?.filter(a => a.severity === 'high') || [],
    summary: status?.summary || {}
  };
}

export default useComplianceMonitoring;