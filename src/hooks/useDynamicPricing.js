import { useCallback, useEffect, useMemo, useState } from 'react';
import { list, replaceAll } from '../lib/collections';
import { formatCedi } from '../lib/money';

const STORAGE_KEY = 'dynamic_pricing_rules';

/**
 * Dynamic Pricing hook: manages demand-based, time-based, and supply-based
 * pricing adjustments. Includes surge pricing, volume discounts, loyalty pricing,
 * and regional adjustments.
 */
export function useDynamicPricing({ orders = [], sellerRanked = [], onNotice }) {
  const [rules, setRules] = useState(() => list(STORAGE_KEY));
  const [activeSurge, setActiveSurge] = useState(null);
  const [loading, setLoading] = useState(false);

  // Default pricing rules
  const DEFAULT_RULES = [
    {
      id: 'base',
      name: 'Base Pricing',
      type: 'base',
      priority: 0,
      active: true,
      config: {
        pricePer1000Gal: 15000, // 150 GHS per 1000 gallons in minor units
        minOrder: 1000,
        maxOrder: 5000,
      },
    },
    {
      id: 'volume_discount',
      name: 'Volume Discount',
      type: 'volume_discount',
      priority: 10,
      active: true,
      config: {
        tiers: [
          { minVolume: 1000, maxVolume: 1999, discount: 0 },
          { minVolume: 2000, maxVolume: 2999, discount: 5 }, // 5%
          { minVolume: 3000, maxVolume: 3999, discount: 8 }, // 8%
          { minVolume: 4000, maxVolume: 5000, discount: 12 }, // 12%
        ],
      },
    },
    {
      id: 'loyalty_pricing',
      name: 'Loyalty Tier Pricing',
      type: 'loyalty',
      priority: 20,
      active: true,
      config: {
        Bronze: { discount: 0, cashback: 1 },
        Silver: { discount: 3, cashback: 2 },
        Gold: { discount: 5, cashback: 3 },
        Platinum: { discount: 8, cashback: 5 },
      },
    },
    {
      id: 'time_of_day',
      name: 'Time-of-Day Pricing',
      type: 'time_based',
      priority: 30,
      active: true,
      config: {
        peakHours: { start: 6, end: 10, multiplier: 1.15 }, // 6-10 AM
        offPeakHours: { start: 22, end: 5, multiplier: 0.9 }, // 10 PM - 5 AM
        normalMultiplier: 1.0,
      },
    },
    {
      id: 'demand_surge',
      name: 'Demand Surge Pricing',
      type: 'surge',
      priority: 100,
      active: false, // Activated manually or by load balancing
      config: {
        triggerThreshold: 2.5, // orders per available driver
        maxMultiplier: 2.0,
        rampUpMinutes: 15,
        rampDownMinutes: 30,
      },
    },
    {
      id: 'regional_adjustment',
      name: 'Regional Adjustment',
      type: 'regional',
      priority: 40,
      active: true,
      config: {
        Accra: { multiplier: 1.0 },
        Kumasi: { multiplier: 0.95 },
        Takoradi: { multiplier: 0.92 },
        Tema: { multiplier: 1.05 },
        Lagos: { multiplier: 1.1 },
        Abidjan: { multiplier: 1.08 },
      },
    },
    {
      id: 'seller_performance',
      name: 'Seller Performance Pricing',
      type: 'seller_performance',
      priority: 50,
      active: true,
      config: {
        // Top performers get preferential pricing (lower platform fee)
        topPerformerDiscount: 2, // 2% platform fee reduction
        thresholdScore: 80,
      },
    },
  ];

  // Initialize with defaults if empty
  useEffect(() => {
    if (rules.length === 0) {
      const withDefaults = DEFAULT_RULES.map((r, i) => ({
        ...r,
        id: r.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      setRules(withDefaults);
      replaceAll(STORAGE_KEY, withDefaults);
    }
  }, [rules.length]);

  // Calculate base price for volume
  const calculateBasePrice = useCallback((volumeGallons) => {
    const baseRule = rules.find(r => r.type === 'base' && r.active);
    if (!baseRule) return { price: 0, breakdown: [] };

    const pricePer1000 = baseRule.config.pricePer1000Gal || 15000;
    const basePrice = Math.round((volumeGallons / 1000) * pricePer1000);
    
    return {
      price: basePrice,
      breakdown: [{
        rule: 'Base Pricing',
        amount: basePrice,
        description: `${volumeGallons} gal × ${formatCedi(pricePer1000)}/1000 gal`,
      }],
    };
  }, [rules]);

  // Apply volume discount
  const applyVolumeDiscount = useCallback((basePrice, volumeGallons) => {
    const rule = rules.find(r => r.type === 'volume_discount' && r.active);
    if (!rule) return { discount: 0, discountedPrice: basePrice, breakdown: [] };

    const tier = rule.config.tiers.find(t => 
      volumeGallons >= t.minVolume && volumeGallons <= t.maxVolume
    );
    
    if (!tier || tier.discount === 0) {
      return { discount: 0, discountedPrice: basePrice, breakdown: [] };
    }

    const discountAmount = Math.round(basePrice * tier.discount / 100);
    return {
      discount: tier.discount,
      discountAmount,
      discountedPrice: basePrice - discountAmount,
      breakdown: [{
        rule: 'Volume Discount',
        amount: -discountAmount,
        description: `${tier.discount}% off for ${volumeGallons} gal order`,
      }],
    };
  }, [rules]);

  // Apply loyalty pricing
  const applyLoyaltyPricing = useCallback((price, tier) => {
    const rule = rules.find(r => r.type === 'loyalty' && r.active);
    if (!rule || !tier) return { discount: 0, cashback: 0, finalPrice: price, breakdown: [] };

    const tierConfig = rule.config[tier];
    if (!tierConfig) return { discount: 0, cashback: 0, finalPrice: price, breakdown: [] };

    const discountAmount = Math.round(price * (tierConfig.discount || 0) / 100);
    const cashbackAmount = Math.round(price * (tierConfig.cashback || 0) / 100);
    
    return {
      discount: tierConfig.discount || 0,
      discountAmount,
      cashback: tierConfig.cashback || 0,
      cashbackAmount,
      finalPrice: price - discountAmount,
      breakdown: [
        tierConfig.discount > 0 && {
          rule: `Loyalty Discount (${tier})`,
          amount: -discountAmount,
          description: `${tierConfig.discount}% loyalty discount`,
        },
        tierConfig.cashback > 0 && {
          rule: `Cashback (${tier})`,
          amount: -cashbackAmount,
          description: `${tierConfig.cashback}% cashback to wallet`,
        },
      ].filter(Boolean),
    };
  }, [rules]);

  // Apply time-of-day pricing
  const applyTimePricing = useCallback((price) => {
    const rule = rules.find(r => r.type === 'time_based' && r.active);
    if (!rule) return { multiplier: 1.0, finalPrice: price, breakdown: [] };

    const hour = new Date().getHours();
    const { peakHours, offPeakHours, normalMultiplier } = rule.config;
    
    let multiplier = normalMultiplier;
    let period = 'normal';
    
    if (hour >= peakHours.start && hour < peakHours.end) {
      multiplier = peakHours.multiplier;
      period = 'peak';
    } else if (hour >= offPeakHours.start || hour < offPeakHours.end) {
      multiplier = offPeakHours.multiplier;
      period = 'off_peak';
    }

    const adjustedPrice = Math.round(price * multiplier);
    const adjustment = adjustedPrice - price;

    return {
      multiplier,
      period,
      finalPrice: adjustedPrice,
      breakdown: adjustment !== 0 ? [{
        rule: `Time-of-Day (${period})`,
        amount: adjustment,
        description: `${period === 'peak' ? 'Peak hours' : period === 'off_peak' ? 'Off-peak hours' : 'Normal'} pricing (${multiplier}x)`,
      }] : [],
    };
  }, [rules]);

  // Apply regional pricing
  const applyRegionalPricing = useCallback((price, region) => {
    const rule = rules.find(r => r.type === 'regional' && r.active);
    if (!rule || !region) return { multiplier: 1.0, finalPrice: price, breakdown: [] };

    const config = rule.config[region] || rule.config.Accra || { multiplier: 1.0 };
    const multiplier = config.multiplier;
    const adjustedPrice = Math.round(price * multiplier);
    const adjustment = adjustedPrice - price;

    return {
      multiplier,
      finalPrice: adjustedPrice,
      breakdown: adjustment !== 0 ? [{
        rule: `Regional Adjustment (${region})`,
        amount: adjustment,
        description: `${region} pricing (${multiplier}x)`,
      }] : [],
    };
  }, [rules]);

  // Apply seller performance pricing
  const applySellerPricing = useCallback((price, sellerId) => {
    const rule = rules.find(r => r.type === 'seller_performance' && r.active);
    if (!rule || !sellerId) return { discount: 0, finalPrice: price, breakdown: [] };

    const seller = sellerRanked.find(s => s.sellerId === sellerId);
    if (!seller || (seller.score || 0) < rule.config.thresholdScore) {
      return { discount: 0, finalPrice: price, breakdown: [] };
    }

    const discount = rule.config.topPerformerDiscount || 0;
    const discountAmount = Math.round(price * discount / 100);

    return {
      discount,
      discountAmount,
      finalPrice: price - discountAmount,
      breakdown: discount > 0 ? [{
        rule: 'Top Seller Discount',
        amount: -discountAmount,
        description: `${discount}% platform fee reduction (score: ${seller.score})`,
      }] : [],
    };
  }, [rules, sellerRanked]);

  // Calculate surge multiplier based on demand/supply
  const calculateSurgeMultiplier = useCallback(() => {
    const rule = rules.find(r => r.type === 'surge');
    if (!rule || !rule.active) return { active: false, multiplier: 1.0 };

    // Calculate current demand/supply ratio
    const pendingOrders = orders.filter(o => o.status === 'Awaiting payment').length;
    const availableDrivers = sellerRanked.filter(s => s.status === 'online' && s.activeJobs < 3).length;
    
    const ratio = availableDrivers > 0 ? pendingOrders / availableDrivers : 999;
    const { triggerThreshold, maxMultiplier } = rule.config;

    if (ratio < triggerThreshold) {
      if (activeSurge) setActiveSurge(null);
      return { active: false, multiplier: 1.0, ratio };
    }

    // Calculate surge multiplier (linear ramp from threshold to max)
    const surgeMultiplier = Math.min(
      1 + (ratio - triggerThreshold) / triggerThreshold * (maxMultiplier - 1),
      maxMultiplier
    );

    if (!activeSurge) setActiveSurge({ ratio, multiplier: surgeMultiplier });

    return {
      active: true,
      multiplier: surgeMultiplier,
      ratio,
      triggerThreshold,
      maxMultiplier,
    };
  }, [rules, orders, sellerRanked, activeSurge]);

  // Main pricing calculator
  const calculatePrice = useCallback((params) => {
    const {
      volumeGallons = 1000,
      region = 'Accra',
      loyaltyTier = null,
      sellerId = null,
      includeSurge = true,
    } = params;

    const surge = includeSurge ? calculateSurgeMultiplier() : { active: false, multiplier: 1.0 };
    const allBreakdown = [];

    // Base price
    let { price, breakdown } = calculateBasePrice(volumeGallons);
    allBreakdown.push(...breakdown);

    // Volume discount
    const vol = applyVolumeDiscount(price, volumeGallons);
    price = vol.discountedPrice;
    allBreakdown.push(...vol.breakdown);

    // Loyalty
    const loy = applyLoyaltyPricing(price, loyaltyTier);
    price = loy.finalPrice;
    allBreakdown.push(...loy.breakdown);

    // Time of day
    const time = applyTimePricing(price);
    price = time.finalPrice;
    allBreakdown.push(...time.breakdown);

    // Regional
    const regional = applyRegionalPricing(price, region);
    price = regional.finalPrice;
    allBreakdown.push(...regional.breakdown);

    // Seller performance
    const seller = applySellerPricing(price, sellerId);
    price = seller.finalPrice;
    allBreakdown.push(...seller.breakdown);

    // Surge
    let surgeAmount = 0;
    if (surge.active) {
      const preSurgePrice = price;
      price = Math.round(price * surge.multiplier);
      surgeAmount = price - preSurgePrice;
      allBreakdown.push({
        rule: 'Demand Surge',
        amount: surgeAmount,
        description: `Surge pricing active (${surge.multiplier.toFixed(2)}x)`,
      });
    }

    return {
      finalPrice: price,
      basePrice: calculateBasePrice(volumeGallons).price,
      surgeActive: surge.active,
      surgeMultiplier: surge.multiplier,
      surgeAmount,
      breakdown: allBreakdown,
      formatted: formatCedi(price),
    };
  }, [
    calculateBasePrice, 
    applyVolumeDiscount, 
    applyLoyaltyPricing, 
    applyTimePricing, 
    applyRegionalPricing, 
    applySellerPricing, 
    calculateSurgeMultiplier
  ]);

  // Get price preview for UI
  const getPricePreview = useCallback((volumeGallons, region, loyaltyTier) => {
    return calculatePrice({ volumeGallons, region, loyaltyTier });
  }, [calculatePrice]);

  const getPriceForVolume = getPricePreview;

  const getPriceExplanation = useCallback((volume) => {
    const volumeNum = parseInt(volume) || 0;
    const price = calculatePrice({ volumeGallons: volumeNum, region: 'ACCRA' });
    return price.breakdown?.map(b => b.description).join(', ') || 'Standard pricing';
  }, [calculatePrice]);

  const pricing = useMemo(() => {
    const result = {};
    const tiers = ['1,000', '2,000', '5,000', '10,000'];
    tiers.forEach(tier => {
      const vol = parseInt(tier.replace(/,/g, ''));
      const price = calculatePrice({ volumeGallons: vol, region: 'ACCRA' });
      result[tier] = {
        basePrice: price.basePrice,
        multiplier: price.surgeMultiplier || 1,
        finalPrice: price.finalPrice,
      };
    });
    return result;
  }, [calculatePrice]);

  const pricingSummary = useMemo(() => {
    const surge = activeSurge;
    const avgMultiplier = surge ? surge.multiplier : 1;
    const discountRule = rules.find(r => r.type === 'volume_discount' && r.active);
    return {
      avgMultiplier,
      surgeActive: !!surge?.active,
      discountActive: !!discountRule,
    };
  }, [activeSurge, rules]);

  const customerProfile = useMemo(() => ({
    tier: 'standard',
    loyaltyPoints: 0,
    discountRate: 0,
  }), []);

  const experiments = useMemo(() => [], []);

  const refresh = useCallback(() => {
    const saved = list(STORAGE_KEY);
    setRules(saved);
  }, []);

  // Toggle rule
  const toggleRule = useCallback((ruleId) => {
    const updated = rules.map(r => 
      r.id === ruleId ? { ...r, active: !r.active, updatedAt: new Date().toISOString() } : r
    );
    setRules(updated);
    replaceAll(STORAGE_KEY, updated);
    onNotice?.(`Pricing rule ${updated.find(r => r.id === ruleId).active ? 'activated' : 'deactivated'}`);
  }, [rules, onNotice]);

  // Update rule config
  const updateRule = useCallback((ruleId, config) => {
    const updated = rules.map(r => 
      r.id === ruleId ? { ...r, config: { ...r.config, ...config }, updatedAt: new Date().toISOString() } : r
    );
    setRules(updated);
    replaceAll(STORAGE_KEY, updated);
    onNotice?.('Pricing rule updated');
  }, [rules, onNotice]);

  // Add custom rule
  const addRule = useCallback((rule) => {
    const newRule = {
      ...rule,
      id: `rule-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [...rules, newRule];
    setRules(updated);
    replaceAll(STORAGE_KEY, updated);
    onNotice?.('Custom pricing rule added');
    return newRule;
  }, [rules, onNotice]);

  return {
    rules,
    activeSurge,
    loading,
    DEFAULT_RULES,
    calculatePrice,
    getPricePreview,
    getPriceForVolume,
    getPriceExplanation,
    pricing,
    pricingSummary,
    customerProfile,
    experiments,
    refresh,
    calculateSurgeMultiplier,
    toggleRule,
    updateRule,
    addRule,
    applyVolumeDiscount,
    applyLoyaltyPricing,
    applyTimePricing,
    applyRegionalPricing,
    applySellerPricing,
  };
}

export default useDynamicPricing;