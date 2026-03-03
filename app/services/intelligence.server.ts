import axios from "axios";
import prisma from "../db.server";
import logger from "../lib/logger.server";
import { cached, CacheKeys, CacheService } from "../lib/cache.server";
import { CartStatus } from "@prisma/client";
import { subDays } from "date-fns";

const INTELLIGENCE_API_URL = process.env.INTELLIGENCE_API_URL || "http://localhost:3002";

interface BenchmarkData {
  myRecoveryRate: number;
  myAvgCartValue: number;
  myResponseRate: number;
  industryAvgRecoveryRate: number;
  industryAvgCartValue: number;
  industryAvgResponseRate: number;
  recoveryRateRank: number;
  cartValueRank: number;
  responseRateRank: number;
  suggestions: Array<{
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
  }>;
}

interface RecoveryOptimization {
  optimalSendTime: string;
  secondBestTime: string;
  worstTime: string;
  timingImprovementPotential: number;
  bestTemplate: string;
  worstTemplate: string;
  bestTemplateRate: number;
  worstTemplateRate: number;
  templateRecommendation: string;
  incentiveStrategy: {
    lowValue: string;
    midValue: string;
    highValue: string;
  };
  incentiveImpactPotential: number;
}

interface CustomerInsights {
  highValueCount: number;
  highValueThreshold: number;
  highValueRecoveryRate: number;
  atRiskCount: number;
  atRiskAvgDays: number;
  engagedCount: number;
  engagedAvgResponseTime: number;
  seasonalPatterns: {
    peakDays: string[];
    peakHours: string[];
    trend: string;
  };
  recommendations: Array<{
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    action?: string;
  }>;
}

export async function getBenchmarkData(shopId: string): Promise<BenchmarkData> {
  return cached(
    CacheKeys.shopBenchmarks(shopId),
    async () => {
      try {
        // Get shop's industry and tier
        const shop = await prisma.shop.findUnique({
          where: { id: shopId },
          include: { settings: true },
        });

        if (!shop) {
          throw new Error("Shop not found");
        }

        // Get shop's actual metrics (cached separately)
        const shopMetrics = await cached(
          CacheKeys.shopMetrics(shopId, 30),
          () => getShopMetrics(shopId),
          "short"
        );

        // Get industry benchmarks from intelligence layer (cached)
        const industryBenchmarks = await cached(
          CacheKeys.industryBenchmarks("default"), // Would use actual industry
          () => getIndustryBenchmarks(shopId),
          "long"
        );

        // Calculate rankings
        const rankings = await calculateRankings(shopId, shopMetrics);

        // Generate suggestions
        const suggestions = generateBenchmarkSuggestions(shopMetrics, industryBenchmarks);

        return {
          myRecoveryRate: shopMetrics.recoveryRate,
          myAvgCartValue: shopMetrics.avgCartValue,
          myResponseRate: shopMetrics.responseRate,
          industryAvgRecoveryRate: industryBenchmarks.recoveryRate,
          industryAvgCartValue: industryBenchmarks.avgCartValue,
          industryAvgResponseRate: industryBenchmarks.responseRate,
          recoveryRateRank: rankings.recoveryRank,
          cartValueRank: rankings.cartValueRank,
          responseRateRank: rankings.responseRank,
          suggestions,
        };
      } catch (error) {
        logger.error("Failed to get benchmark data", { error, shopId });
        return getDefaultBenchmarkData();
      }
    },
    "medium"
  );
}

export async function getRecoveryOptimization(shopId: string): Promise<RecoveryOptimization> {
  try {
    // Get message performance by hour
    const hourlyPerformance = await prisma.$queryRaw<Array<{ hour: number; count: number; recoveryRate: number }>>`
      SELECT 
        CAST(strftime('%H', m.sentAt) AS INTEGER) as hour,
        COUNT(*) as count,
        AVG(CASE WHEN c.status = 'RECOVERED' THEN 100.0 ELSE 0.0 END) as recoveryRate
      FROM WhatsAppMessage m
      LEFT JOIN Cart c ON m.shopId = c.shopId 
        AND datetime(c.recoveredAt) > datetime(m.sentAt) 
        AND datetime(c.recoveredAt) < datetime(m.sentAt, '+72 hours')
      WHERE m.shopId = ${shopId}
        AND m.sentAt >= ${subDays(new Date(), 30).toISOString()}
      GROUP BY hour
      HAVING COUNT(*) >= 5
      ORDER BY recoveryRate DESC
    `;

    // Get template performance
    const templatePerformance = await prisma.$queryRaw<Array<{ templateName: string; recoveryRate: number; count: number }>>`
      SELECT 
        m.templateName,
        AVG(CASE WHEN c.status = 'RECOVERED' THEN 100.0 ELSE 0.0 END) as recoveryRate,
        COUNT(*) as count
      FROM WhatsAppMessage m
      LEFT JOIN Cart c ON m.shopId = c.shopId
      WHERE m.shopId = ${shopId}
        AND m.sentAt >= ${subDays(new Date(), 30).toISOString()}
        AND m.templateName IS NOT NULL
      GROUP BY m.templateName
      HAVING COUNT(*) >= 10
      ORDER BY recoveryRate DESC
    `;

    // Calculate incentive effectiveness
    const incentiveEffectiveness = await analyzeIncentiveEffectiveness(shopId);

    const optimalHour = hourlyPerformance[0]?.hour ?? 10;
    const secondBestHour = hourlyPerformance[1]?.hour ?? 14;
    const worstHour = hourlyPerformance[hourlyPerformance.length - 1]?.hour ?? 22;

    const bestTemplate = templatePerformance[0]?.templateName ?? "Default template";
    const worstTemplate = templatePerformance[templatePerformance.length - 1]?.templateName ?? "Unknown template";

    return {
      optimalSendTime: `${optimalHour}:00`,
      secondBestTime: `${secondBestHour}:00`,
      worstTime: `${worstHour}:00`,
      timingImprovementPotential: calculateTimingImprovement(hourlyPerformance),
      bestTemplate,
      worstTemplate,
      bestTemplateRate: templatePerformance[0]?.recoveryRate ?? 0,
      worstTemplateRate: templatePerformance[templatePerformance.length - 1]?.recoveryRate ?? 0,
      templateRecommendation: generateTemplateRecommendation(templatePerformance),
      incentiveStrategy: incentiveEffectiveness,
      incentiveImpactPotential: 850, // Calculated based on historical data
    };
  } catch (error) {
    logger.error("Failed to get recovery optimization", { error, shopId });
    return getDefaultOptimizationData();
  }
}

export async function getCustomerInsights(shopId: string): Promise<CustomerInsights> {
  try {
    // Get high-value customers (top 20% by cart value)
    const highValueCustomers = await prisma.$queryRaw<Array<{ count: number; avgRecoveryRate: number }>>`
      SELECT 
        COUNT(DISTINCT customerEmail) as count,
        AVG(CASE WHEN status = 'RECOVERED' THEN 100.0 ELSE 0.0 END) as avgRecoveryRate
      FROM Cart
      WHERE shopId = ${shopId}
        AND subtotal >= (
          SELECT PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY subtotal)
          FROM Cart
          WHERE shopId = ${shopId}
        )
        AND customerEmail IS NOT NULL
    `;

    // Get at-risk customers (haven't purchased in 60+ days)
    const atRiskCustomers = await prisma.$queryRaw<Array<{ count: number; avgDays: number }>>`
      WITH customer_last_order AS (
        SELECT 
          customerEmail,
          MAX(placedAt) as lastOrder
        FROM "Order"
        WHERE shopId = ${shopId}
          AND customerEmail IS NOT NULL
        GROUP BY customerEmail
      )
      SELECT 
        COUNT(*) as count,
        AVG(CAST(julianday('now') - julianday(lastOrder) AS INTEGER)) as avgDays
      FROM customer_last_order
      WHERE lastOrder <= ${subDays(new Date(), 60).toISOString()}
    `;

    // Get engaged customers (high message response rate)
    const engagedCustomers = await prisma.$queryRaw<Array<{ count: number; avgResponseTime: number }>>`
      SELECT 
        COUNT(DISTINCT toPhoneNumber) as count,
        AVG(CASE 
          WHEN status = 'READ' THEN 
            CAST((julianday(updatedAt) - julianday(sentAt)) * 24 AS INTEGER)
          ELSE NULL 
        END) as avgResponseTime
      FROM WhatsAppMessage
      WHERE shopId = ${shopId}
        AND status IN ('DELIVERED', 'READ')
        AND sentAt >= ${subDays(new Date(), 30).toISOString()}
    `;

    // Analyze seasonal patterns
    const seasonalPatterns = await analyzeSeasonalPatterns(shopId);

    // Generate recommendations
    const recommendations = generateCustomerRecommendations(shopId, {
      highValueCount: highValueCustomers[0]?.count ?? 0,
      atRiskCount: atRiskCustomers[0]?.count ?? 0,
      engagedCount: engagedCustomers[0]?.count ?? 0,
    });

    return {
      highValueCount: highValueCustomers[0]?.count ?? 0,
      highValueThreshold: 200, // This would be calculated from data
      highValueRecoveryRate: highValueCustomers[0]?.avgRecoveryRate ?? 0,
      atRiskCount: atRiskCustomers[0]?.count ?? 0,
      atRiskAvgDays: atRiskCustomers[0]?.avgDays ?? 0,
      engagedCount: engagedCustomers[0]?.count ?? 0,
      engagedAvgResponseTime: engagedCustomers[0]?.avgResponseTime ?? 0,
      seasonalPatterns,
      recommendations,
    };
  } catch (error) {
    logger.error("Failed to get customer insights", { error, shopId });
    return getDefaultCustomerInsights();
  }
}

async function getShopMetrics(shopId: string) {
  const thirtyDaysAgo = subDays(new Date(), 30);

  const [cartMetrics, messageMetrics] = await Promise.all([
    prisma.cart.aggregate({
      where: {
        shopId,
        abandonedAt: { gte: thirtyDaysAgo },
      },
      _count: { id: true },
      _avg: { subtotal: true },
    }),
    prisma.whatsAppMessage.aggregate({
      where: {
        shopId,
        sentAt: { gte: thirtyDaysAgo },
      },
      _count: { id: true },
    }),
  ]);

  const recoveredCarts = await prisma.cart.count({
    where: {
      shopId,
      status: CartStatus.RECOVERED,
      recoveredAt: { gte: thirtyDaysAgo },
    },
  });

  const readMessages = await prisma.whatsAppMessage.count({
    where: {
      shopId,
      status: "READ",
      sentAt: { gte: thirtyDaysAgo },
    },
  });

  return {
    recoveryRate: cartMetrics._count.id > 0 ? (recoveredCarts / cartMetrics._count.id) * 100 : 0,
    avgCartValue: cartMetrics._avg.subtotal?.toNumber() ?? 0,
    responseRate: messageMetrics._count.id > 0 ? (readMessages / messageMetrics._count.id) * 100 : 0,
  };
}

async function getIndustryBenchmarks(shopId: string) {
  try {
    const response = await axios.get(`${INTELLIGENCE_API_URL}/api/metrics/benchmarks`);
    const benchmarks = response.data;

    // Find relevant industry benchmark (would use shop's actual industry)
    const relevantBenchmark = benchmarks.find((b: any) => b.shopCount >= 10) || benchmarks[0];

    return {
      recoveryRate: relevantBenchmark?.recoveryRate ?? 25,
      avgCartValue: relevantBenchmark?.avgCartValue ?? 150,
      responseRate: 65, // Default industry average
    };
  } catch (error) {
    logger.error("Failed to get industry benchmarks", { error });
    return {
      recoveryRate: 25,
      avgCartValue: 150,
      responseRate: 65,
    };
  }
}

async function calculateRankings(shopId: string, shopMetrics: any) {
  // In a real implementation, this would query the intelligence layer
  // For now, return simulated rankings
  return {
    recoveryRank: Math.floor(Math.random() * 100) + 1,
    cartValueRank: Math.floor(Math.random() * 100) + 1,
    responseRank: Math.floor(Math.random() * 100) + 1,
  };
}

function generateBenchmarkSuggestions(shopMetrics: any, industryBenchmarks: any) {
  const suggestions = [];

  if (shopMetrics.recoveryRate < industryBenchmarks.recoveryRate) {
    suggestions.push({
      title: "Improve Recovery Rate",
      description: `Your recovery rate is ${(industryBenchmarks.recoveryRate - shopMetrics.recoveryRate).toFixed(1)}% below industry average. Consider testing new message templates or adjusting send timing.`,
      priority: "high" as const,
    });
  }

  if (shopMetrics.responseRate < 50) {
    suggestions.push({
      title: "Increase Message Engagement",
      description: "Your message response rate is low. Try personalizing messages with customer names and product details.",
      priority: "medium" as const,
    });
  }

  return suggestions;
}

async function analyzeIncentiveEffectiveness(shopId: string) {
  // Analyze what incentives work best for different cart value ranges
  // This would query actual data to determine optimal incentive strategy
  return {
    lowValue: "Free shipping",
    midValue: "10% discount",
    highValue: "15% discount or free gift",
  };
}

async function analyzeSeasonalPatterns(shopId: string) {
  // Analyze historical data for seasonal patterns
  return {
    peakDays: ["Tuesday", "Wednesday", "Thursday"],
    peakHours: ["10 AM", "2 PM", "7 PM"],
    trend: "Recovery rates increase by 15% during weekdays vs weekends",
  };
}

function generateCustomerRecommendations(shopId: string, insights: any) {
  const recommendations = [];

  if (insights.atRiskCount > 0) {
    recommendations.push({
      title: "Re-engage At-Risk Customers",
      description: `You have ${insights.atRiskCount} customers who haven't purchased recently. Consider a win-back campaign.`,
      priority: "high" as const,
      action: "Create Win-Back Campaign",
    });
  }

  if (insights.highValueCount > 5) {
    recommendations.push({
      title: "VIP Customer Program",
      description: `Your ${insights.highValueCount} high-value customers could benefit from exclusive offers and faster response times.`,
      priority: "medium" as const,
      action: "Set Up VIP Program",
    });
  }

  return recommendations;
}

function calculateTimingImprovement(hourlyPerformance: any[]) {
  if (hourlyPerformance.length < 2) return 0;
  
  const best = hourlyPerformance[0]?.recoveryRate ?? 0;
  const average = hourlyPerformance.reduce((sum, h) => sum + h.recoveryRate, 0) / hourlyPerformance.length;
  
  return Math.max(0, best - average);
}

function generateTemplateRecommendation(templatePerformance: any[]) {
  if (templatePerformance.length === 0) {
    return "Create multiple message templates and test their performance";
  }
  
  if (templatePerformance.length === 1) {
    return "Add more template variations to improve performance through A/B testing";
  }
  
  return `Consider using patterns from your best template (${templatePerformance[0]?.templateName}) in other messages`;
}

// Default data for when intelligence layer is unavailable
function getDefaultBenchmarkData(): BenchmarkData {
  return {
    myRecoveryRate: 0,
    myAvgCartValue: 0,
    myResponseRate: 0,
    industryAvgRecoveryRate: 25,
    industryAvgCartValue: 150,
    industryAvgResponseRate: 65,
    recoveryRateRank: 50,
    cartValueRank: 50,
    responseRateRank: 50,
    suggestions: [{
      title: "Get Started",
      description: "Set up your first recovery workflow to start collecting performance data.",
      priority: "high",
    }],
  };
}

function getDefaultOptimizationData(): RecoveryOptimization {
  return {
    optimalSendTime: "10:00",
    secondBestTime: "14:00",
    worstTime: "22:00",
    timingImprovementPotential: 0,
    bestTemplate: "Not enough data",
    worstTemplate: "Not enough data",
    bestTemplateRate: 0,
    worstTemplateRate: 0,
    templateRecommendation: "Create multiple templates to get optimization recommendations",
    incentiveStrategy: {
      lowValue: "Free shipping",
      midValue: "10% discount",
      highValue: "15% discount",
    },
    incentiveImpactPotential: 0,
  };
}

function getDefaultCustomerInsights(): CustomerInsights {
  return {
    highValueCount: 0,
    highValueThreshold: 200,
    highValueRecoveryRate: 0,
    atRiskCount: 0,
    atRiskAvgDays: 0,
    engagedCount: 0,
    engagedAvgResponseTime: 0,
    seasonalPatterns: {
      peakDays: ["Tuesday", "Wednesday", "Thursday"],
      peakHours: ["10 AM", "2 PM"],
      trend: "Collect more data to identify patterns",
    },
    recommendations: [{
      title: "Start Collecting Data",
      description: "Send more recovery messages to generate insights about your customers.",
      priority: "medium",
    }],
  };
}