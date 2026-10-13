import { useState, useEffect, useCallback, useMemo } from 'react';

export function useSustainabilityTracking({ orders = [], qualityRecords = [], sources = [], fleetDrivers = [], vehicles = [], onNotice }) {
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [sustainabilityData, setSustainabilityData] = useState(null);
  const [waterFootprint, setWaterFootprint] = useState(null);
  const [circularEconomy, setCircularEconomy] = useState(null);
  const [sdgAlignment, setSdgAlignment] = useState(null);
  const [certifications, setCertifications] = useState([]);

  const formatCedi = (amount) => {
    const cedis = amount / 100;
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', minimumFractionDigits: 2 }).format(cedis);
  };

  const generateSustainabilityData = useCallback(() => {
    const totalVolume = orders.reduce((sum, o) => sum + (o.volume || 0), 0);
    const totalDistance = fleetDrivers.reduce((sum, d) => sum + (d.totalDistance || Math.random() * 5000), 0);
    
    return {
      totalVolumeDelivered: totalVolume,
      totalDistance,
      waterSaved: totalVolume * 0.15, // 15% less waste vs traditional
      plasticBottlesAvoided: Math.round(totalVolume / 20 * 0.8), // 20L per bottle, 80% reuse
      co2Reduced: totalDistance * 0.12, // kg CO2 vs individual trips
      communitiesServed: new Set(orders.map(o => o.zone).filter(Boolean)).size,
      qualityCompliance: qualityRecords.length > 0 
        ? qualityRecords.filter(r => r.compliant).length / qualityRecords.length * 100 
        : 95,
      operationalEfficiency: 78 + Math.random() * 15,
    };
  }, [orders, qualityRecords, fleetDrivers]);

  const generateWaterFootprint = useCallback(() => {
    const totalVolume = orders.reduce((sum, o) => sum + (o.volume || 0), 0);
    const sourcesList = sources.length > 0 ? sources : ['Weija Dam', 'Kpong Intake', 'Accra East', 'Tema Booster'];
    
    return {
      totalWithdrawn: Math.round(totalVolume * 1.08), // 8% loss
      totalDelivered: totalVolume,
      lossRate: 8.2,
      sourceBreakdown: sourcesList.map((source, i) => ({
        source,
        withdrawn: Math.round(totalVolume * (0.3 + Math.random() * 0.4) / sourcesList.length),
        delivered: Math.round(totalVolume * (0.28 + Math.random() * 0.38) / sourcesList.length),
        qualityScore: 85 + Math.random() * 15,
        sustainabilityIndex: 70 + Math.random() * 25,
      })),
      conservationInitiatives: [
        { name: 'Leak Detection Program', status: 'active', savings: Math.round(totalVolume * 0.03), investment: 2500000 },
        { name: 'Smart Metering Rollout', status: 'pilot', savings: Math.round(totalVolume * 0.02), investment: 5000000 },
        { name: 'Pressure Management', status: 'planned', savings: Math.round(totalVolume * 0.015), investment: 1800000 },
        { name: 'Rainwater Harvesting', status: 'active', savings: Math.round(totalVolume * 0.01), investment: 3200000 },
      ],
      monthlyTrend: Array.from({ length: 6 }, (_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() - (5 - i));
        return {
          month: date.toISOString().slice(0, 7),
          withdrawn: Math.round(totalVolume * (0.95 + Math.random() * 0.15)),
          delivered: Math.round(totalVolume * (0.88 + Math.random() * 0.1)),
          lossRate: 7 + Math.random() * 3,
        };
      }),
    };
  }, [orders, sources]);

  const generateCircularEconomy = useCallback(() => {
    const totalVolume = orders.reduce((sum, o) => sum + (o.volume || 0), 0);
    
    return {
      containerReuse: {
        totalContainers: Math.round(totalVolume / 20),
        reuseRate: 78,
        targetReuseRate: 90,
        containersInCirculation: Math.round(totalVolume / 20 * 0.78),
        containersRecycled: Math.round(totalVolume / 20 * 0.15),
        containersLost: Math.round(totalVolume / 20 * 0.07),
      },
      wasteManagement: {
        plasticWaste: Math.round(totalVolume / 20 * 0.07 * 500), // grams per lost container
        recyclingRate: 65,
        landfillDiversion: 72,
        wastePerDelivery: 2.3, // kg
      },
      initiatives: [
        { name: 'Container Deposit Scheme', status: 'active', impact: 'high', participation: 78 },
        { name: 'Bulk Refill Stations', status: 'expanding', impact: 'medium', participation: 34 },
        { name: 'Biodegradable Packaging Pilot', status: 'pilot', impact: 'high', participation: 12 },
        { name: 'Reverse Logistics Optimization', status: 'active', impact: 'medium', participation: 89 },
      ],
      materialFlow: {
        virginPlastic: 28,
        recycledContent: 45,
        bioBased: 12,
        reused: 15,
      },
    };
  }, [orders]);

  const generateSDGAlignment = useCallback(() => {
    const sdgs = [
      { goal: 6, name: 'Clean Water & Sanitation', target: 'Universal access to safe water', progress: 87, status: 'on-track', keyMetrics: ['95% quality compliance', '12 communities served', '24/7 monitoring'] },
      { goal: 8, name: 'Decent Work & Economic Growth', target: 'Sustainable employment', progress: 72, status: 'on-track', keyMetrics: ['45 drivers employed', 'Skills training program', 'Fair wage policy'] },
      { goal: 9, name: 'Industry, Innovation & Infrastructure', target: 'Resilient infrastructure', progress: 68, status: 'accelerating', keyMetrics: ['Smart routing AI', 'IoT quality sensors', 'Digital payments'] },
      { goal: 11, name: 'Sustainable Cities', target: 'Urban water security', progress: 75, status: 'on-track', keyMetrics: ['Reduced tanker traffic', 'Emergency reserves', 'Equitable access'] },
      { goal: 12, name: 'Responsible Consumption', target: 'Circular water economy', progress: 62, status: 'needs-attention', keyMetrics: ['78% container reuse', 'Plastic reduction', 'Waste tracking'] },
      { goal: 13, name: 'Climate Action', target: 'Carbon neutral operations', progress: 58, status: 'accelerating', keyMetrics: ['EV transition started', 'Route optimization', 'Solar pumping'] },
      { goal: 17, name: 'Partnerships', target: 'Multi-stakeholder collaboration', progress: 81, status: 'on-track', keyMetrics: ['Gov partnerships', 'NGO collaboration', 'Academic research'] },
    ];
    return sdgs;
  }, []);

  const generateCertifications = useCallback(() => {
    return [
      { name: 'ISO 14001:2015', category: 'Environmental Management', status: 'certified', expiry: '2027-03-15', auditor: 'SGS Ghana', scope: 'Water delivery operations' },
      { name: 'ISO 9001:2015', category: 'Quality Management', status: 'certified', expiry: '2026-11-20', auditor: 'Bureau Veritas', scope: 'Customer service & delivery' },
      { name: 'GSA Water Quality', category: 'Regulatory Compliance', status: 'certified', expiry: '2026-12-31', auditor: 'Ghana Standards Authority', scope: 'Drinking water standards' },
      { name: 'Carbon Trust Standard', category: 'Carbon Management', status: 'in-progress', expiry: '2026-06-30', auditor: 'Carbon Trust', scope: 'Fleet emissions' },
      { name: 'B Corp Certification', category: 'Social & Environmental', status: 'assessment', expiry: '2026-09-01', auditor: 'B Lab', scope: 'Full business operations' },
      { name: 'Water Stewardship (AWS)', category: 'Water Management', status: 'planned', expiry: '2027-01-01', auditor: 'Alliance for Water Stewardship', scope: 'Catchment-level' },
    ];
  }, []);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      setSustainabilityData(generateSustainabilityData());
      setWaterFootprint(generateWaterFootprint());
      setCircularEconomy(generateCircularEconomy());
      setSdgAlignment(generateSDGAlignment());
      setCertifications(generateCertifications());
      setLastUpdated(new Date().toISOString());
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [generateSustainabilityData, generateWaterFootprint, generateCircularEconomy, generateSDGAlignment, generateCertifications]);

  const refresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setSustainabilityData(generateSustainabilityData());
      setWaterFootprint(generateWaterFootprint());
      setCircularEconomy(generateCircularEconomy());
      setSdgAlignment(generateSDGAlignment());
      setCertifications(generateCertifications());
      setLastUpdated(new Date().toISOString());
      setLoading(false);
      onNotice?.('Sustainability data refreshed');
    }, 300);
  }, [generateSustainabilityData, generateWaterFootprint, generateCircularEconomy, generateSDGAlignment, generateCertifications, onNotice]);

  const summary = useMemo(() => {
    if (!sustainabilityData) return {};
    const onTrackSDGs = sdgAlignment?.filter(s => s.status === 'on-track').length || 0;
    const certifiedCount = certifications?.filter(c => c.status === 'certified').length || 0;
    return {
      waterSaved: sustainabilityData.waterSaved,
      plasticAvoided: sustainabilityData.plasticBottlesAvoided,
      co2Reduced: Math.round(sustainabilityData.co2Reduced),
      qualityCompliance: sustainabilityData.qualityCompliance.toFixed(1),
      containerReuseRate: circularEconomy?.containerReuse?.reuseRate || 0,
      sdgProgress: Math.round(sdgAlignment?.reduce((sum, s) => sum + s.progress, 0) / (sdgAlignment?.length || 1) || 0),
      certifiedStandards: certifiedCount,
      onTrackGoals: onTrackSDGs,
      totalSDGs: sdgAlignment?.length || 0,
    };
  }, [sustainabilityData, circularEconomy, sdgAlignment, certifications]);

  return {
    sustainabilityData,
    waterFootprint,
    circularEconomy,
    sdgAlignment,
    certifications,
    summary,
    loading,
    lastUpdated,
    refresh,
    formatCedi,
  };
}