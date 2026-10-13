import { useState, useEffect, useCallback, useMemo } from 'react';

export function useComplianceMonitoring({ 
  sources = [], 
  qualityTests = [],
  facilities = [],
  permits = [],
  regulations = [],
  inspections = [],
  onNotice 
}) {
  const [complianceStatus, setComplianceStatus] = useState(null);
  const [violations, setViolations] = useState([]);
  const [upcomingDeadlines, setUpcomingDeadlines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runComplianceCheck = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 400));

      const sourceCompliance = sources.filter(s => s.status === 'active').map(source => {
        const recentTests = qualityTests.filter(t => t.sourceId === source.id).slice(-5);
        const latestTest = recentTests[recentTests.length - 1];
        
        const checks = {
          ph: latestTest ? (latestTest.ph >= 6.5 && latestTest.ph <= 8.5) : true,
          turbidity: latestTest ? (latestTest.turbidity <= 4) : true,
          chlorine: latestTest ? (latestTest.chlorine >= 0.2 && latestTest.chlorine <= 4) : true,
          tds: latestTest ? (latestTest.tds <= 500) : true,
          bacteria: latestTest ? (latestTest.bacteria === 0) : true,
          testingFrequency: recentTests.length >= 4,
          permitValid: permits.find(p => p.sourceId === source.id)?.status === 'valid'
        };

        const passed = Object.values(checks).filter(v => v).length;
        const total = Object.keys(checks).length;
        const score = Math.round((passed / total) * 100);
        
        const sourceViolations = Object.entries(checks)
          .filter(([k, v]) => !v)
          .map(([check]) => ({
            sourceId: source.id,
            sourceName: source.name,
            regulation: check,
            severity: check === 'bacteria' ? 'critical' : check === 'permitValid' ? 'high' : 'medium',
            description: `Non-compliant: ${check}`,
            detectedAt: new Date().toISOString(),
            status: 'open'
          }));

        return {
          sourceId: source.id,
          sourceName: source.name,
          complianceScore: score,
          checks,
          status: score === 100 ? 'compliant' : score >= 80 ? 'minor_issues' : score >= 60 ? 'major_issues' : 'non_compliant',
          violations: sourceViolations,
          lastInspection: inspections.find(i => i.sourceId === source.id)?.date || 'Never',
          nextInspectionDue: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]
        };
      });

      const facilityCompliance = facilities.map(facility => {
        const facilityPermits = permits.filter(p => p.facilityId === facility.id);
        const facilityInspections = inspections.filter(i => i.facilityId === facility.id);
        
        const checks = {
          operatingPermit: facilityPermits.some(p => p.type === 'operating' && p.status === 'valid'),
          environmentalPermit: facilityPermits.some(p => p.type === 'environmental' && p.status === 'valid'),
          dischargePermit: facilityPermits.some(p => p.type === 'discharge' && p.status === 'valid'),
          recentInspection: facilityInspections.length > 0 && 
            (Date.now() - new Date(facilityInspections[0].date).getTime()) < 365 * 86400000,
          safetyCompliance: Math.random() > 0.1,
          recordKeeping: Math.random() > 0.15
        };

        const passed = Object.values(checks).filter(v => v).length;
        const score = Math.round((passed / Object.keys(checks).length) * 100);

        const facilityViolations = Object.entries(checks)
          .filter(([k, v]) => !v)
          .map(([check]) => ({
            facilityId: facility.id,
            facilityName: facility.name,
            regulation: check,
            severity: check.includes('Permit') ? 'high' : 'medium',
            description: `Missing or expired: ${check}`,
            detectedAt: new Date().toISOString(),
            status: 'open'
          }));

        return {
          facilityId: facility.id,
          facilityName: facility.name,
          complianceScore: score,
          checks,
          status: score === 100 ? 'compliant' : score >= 80 ? 'minor_issues' : 'major_issues',
          violations: facilityViolations,
          permits: facilityPermits,
          lastInspection: facilityInspections[0]?.date || 'Never'
        };
      });

      const allViolations = [
        ...sourceCompliance.flatMap(s => s.violations),
        ...facilityCompliance.flatMap(f => f.violations)
      ];

      const deadlines = [
        ...permits.filter(p => p.expiryDate && new Date(p.expiryDate) > new Date() && new Date(p.expiryDate) < new Date(Date.now() + 60 * 86400000))
          .map(p => ({
            id: p.id,
            type: 'permit_renewal',
            entity: p.sourceId ? 'source' : 'facility',
            entityId: p.sourceId || p.facilityId,
            entityName: sources.find(s => s.id === p.sourceId)?.name || facilities.find(f => f.id === p.facilityId)?.name,
            permitType: p.type,
            dueDate: p.expiryDate,
            daysUntilDue: Math.ceil((new Date(p.expiryDate).getTime() - Date.now()) / 86400000),
            priority: Math.ceil((new Date(p.expiryDate).getTime() - Date.now()) / 86400000) < 30 ? 'high' : 'medium'
          })),
        ...sourceCompliance.filter(s => s.nextInspectionDue && new Date(s.nextInspectionDue) < new Date(Date.now() + 30 * 86400000))
          .map(s => ({
            id: `inspection-${s.sourceId}`,
            type: 'inspection_due',
            entity: 'source',
            entityId: s.sourceId,
            entityName: s.sourceName,
            dueDate: s.nextInspectionDue,
            daysUntilDue: Math.ceil((new Date(s.nextInspectionDue).getTime() - Date.now()) / 86400000),
            priority: 'medium'
          }))
      ].sort((a, b) => a.daysUntilDue - b.daysUntilDue);

      const overallScore = [...sourceCompliance, ...facilityCompliance].length > 0
        ? Math.round([...sourceCompliance, ...facilityCompliance].reduce((s, c) => s + c.complianceScore, 0) / [...sourceCompliance, ...facilityCompliance].length)
        : 100;

      const newStatus = {
        sources: sourceCompliance,
        facilities: facilityCompliance,
        overallScore,
        summary: {
          totalSources: sources.filter(s => s.status === 'active').length,
          totalFacilities: facilities.length,
          compliantSources: sourceCompliance.filter(s => s.status === 'compliant').length,
          compliantFacilities: facilityCompliance.filter(f => f.status === 'compliant').length,
          sourcesWithIssues: sourceCompliance.filter(s => s.status !== 'compliant').length,
          facilitiesWithIssues: facilityCompliance.filter(f => f.status !== 'compliant').length,
          totalViolations: allViolations.length,
          criticalViolations: allViolations.filter(v => v.severity === 'critical').length,
          highViolations: allViolations.filter(v => v.severity === 'high').length,
          upcomingDeadlines: deadlines.length,
          overdueDeadlines: deadlines.filter(d => d.daysUntilDue < 0).length
        }
      };

      setComplianceStatus(newStatus);
      setViolations(allViolations);
      setUpcomingDeadlines(deadlines);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sources, qualityTests, facilities, permits, regulations, inspections]);

  const resolveViolation = useCallback((violationId) => {
    setViolations(prev => prev.map(v => 
      `${v.sourceId || v.facilityId}-${v.regulation}` === violationId 
        ? { ...v, status: 'resolved', resolvedAt: new Date().toISOString() } 
        : v
    ));
    onNotice?.(`Violation ${violationId} marked resolved`);
  }, [onNotice]);

  const getSourceCompliance = useCallback((sourceId) => {
    return complianceStatus?.sources?.find(s => s.sourceId === sourceId) || null;
  }, [complianceStatus]);

  const getFacilityCompliance = useCallback((facilityId) => {
    return complianceStatus?.facilities?.find(f => f.facilityId === facilityId) || null;
  }, [complianceStatus]);

  const getViolationsBySeverity = useCallback((severity) => {
    return violations.filter(v => v.severity === severity);
  }, [violations]);

  const getUpcomingDeadlines = useCallback((days = 30) => {
    return upcomingDeadlines.filter(d => d.daysUntilDue <= days && d.daysUntilDue >= 0);
  }, [upcomingDeadlines]);

  useEffect(() => { runComplianceCheck(); }, [runComplianceCheck]);

  return {
    complianceStatus,
    violations,
    upcomingDeadlines,
    loading,
    error,
    refresh: runComplianceCheck,
    resolveViolation,
    getSourceCompliance,
    getFacilityCompliance,
    getViolationsBySeverity,
    getUpcomingDeadlines,
    overallScore: complianceStatus?.overallScore || 0,
    totalViolations: violations.length,
    criticalViolations: violations.filter(v => v.severity === 'critical').length,
    highViolations: violations.filter(v => v.severity === 'high').length,
    upcomingDeadlinesCount: upcomingDeadlines.length
  };
}

export default useComplianceMonitoring;