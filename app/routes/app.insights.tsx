import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { getBenchmarkData, getRecoveryOptimization, getCustomerInsights } from "../services/intelligence.server";
import { useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
    include: { settings: true },
  });

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  // Get intelligence data
  const [benchmarks, optimization, customerInsights] = await Promise.all([
    getBenchmarkData(shop.id),
    getRecoveryOptimization(shop.id),
    getCustomerInsights(shop.id),
  ]);

  return { shop, benchmarks, optimization, customerInsights };
};

export default function Insights() {
  const { shop, benchmarks, optimization, customerInsights } = useLoaderData<typeof loader>();
  const [selectedTab, setSelectedTab] = useState("benchmarks");

  return (
    <s-page heading="Smart Insights">
      <s-button slot="primary-action" onClick={() => window.location.reload()}>
        Refresh Data
      </s-button>

      <s-tabs selected={selectedTab} onSelect={setSelectedTab}>
        <s-tab id="benchmarks" title="Benchmarks">
          <s-section heading="Performance Benchmarks">
            <s-text>
              See how your store compares to similar businesses in your industry.
              Data is anonymized and aggregated from stores that opted in to benchmarking.
            </s-text>

            <s-stack direction="inline" gap="loose">
              <s-card>
                <s-box padding="base">
                  <s-stack direction="block" gap="tight">
                    <s-text variant="headingMd">Recovery Rate</s-text>
                    <s-stack direction="inline" gap="tight" align="center">
                      <s-text variant="heading2xl">{benchmarks.myRecoveryRate}%</s-text>
                      <s-badge tone={benchmarks.recoveryRateRank <= 25 ? "success" : benchmarks.recoveryRateRank <= 50 ? "warning" : "critical"}>
                        {benchmarks.recoveryRateRank <= 25 ? "Top 25%" : 
                         benchmarks.recoveryRateRank <= 50 ? "Top 50%" : 
                         benchmarks.recoveryRateRank <= 75 ? "Top 75%" : "Below Average"}
                      </s-badge>
                    </s-stack>
                    <s-text variant="bodySm">
                      Industry average: {benchmarks.industryAvgRecoveryRate}%
                    </s-text>
                  </s-stack>
                </s-box>
              </s-card>

              <s-card>
                <s-box padding="base">
                  <s-stack direction="block" gap="tight">
                    <s-text variant="headingMd">Average Cart Value</s-text>
                    <s-stack direction="inline" gap="tight" align="center">
                      <s-text variant="heading2xl">${benchmarks.myAvgCartValue}</s-text>
                      <s-badge tone={benchmarks.cartValueRank <= 25 ? "success" : benchmarks.cartValueRank <= 50 ? "warning" : "critical"}>
                        {benchmarks.cartValueRank <= 25 ? "Top 25%" : 
                         benchmarks.cartValueRank <= 50 ? "Top 50%" : 
                         benchmarks.cartValueRank <= 75 ? "Top 75%" : "Below Average"}
                      </s-badge>
                    </s-stack>
                    <s-text variant="bodySm">
                      Industry average: ${benchmarks.industryAvgCartValue}
                    </s-text>
                  </s-stack>
                </s-box>
              </s-card>

              <s-card>
                <s-box padding="base">
                  <s-stack direction="block" gap="tight">
                    <s-text variant="headingMd">Message Response Rate</s-text>
                    <s-stack direction="inline" gap="tight" align="center">
                      <s-text variant="heading2xl">{benchmarks.myResponseRate}%</s-text>
                      <s-badge tone={benchmarks.responseRateRank <= 25 ? "success" : benchmarks.responseRateRank <= 50 ? "warning" : "critical"}>
                        {benchmarks.responseRateRank <= 25 ? "Top 25%" : 
                         benchmarks.responseRateRank <= 50 ? "Top 50%" : 
                         benchmarks.responseRateRank <= 75 ? "Top 75%" : "Below Average"}
                      </s-badge>
                    </s-stack>
                    <s-text variant="bodySm">
                      Industry average: {benchmarks.industryAvgResponseRate}%
                    </s-text>
                  </s-stack>
                </s-box>
              </s-card>
            </s-stack>

            {benchmarks.suggestions.length > 0 && (
              <s-section heading="Improvement Suggestions">
                <s-stack direction="block" gap="base">
                  {benchmarks.suggestions.map((suggestion: any, index: number) => (
                    <s-banner key={index} tone="info">
                      <s-text>{suggestion.title}</s-text>
                      <s-text variant="bodySm">{suggestion.description}</s-text>
                    </s-banner>
                  ))}
                </s-stack>
              </s-section>
            )}
          </s-section>
        </s-tab>

        <s-tab id="optimization" title="AI Optimization">
          <s-section heading="Recovery Optimization Recommendations">
            <s-text>
              AI-powered recommendations based on your store's data and successful patterns from similar businesses.
            </s-text>

            <s-stack direction="block" gap="loose">
              <s-card>
                <s-box padding="base">
                  <s-stack direction="block" gap="base">
                    <s-text variant="headingMd">Optimal Send Times</s-text>
                    <s-text>Based on your customers' engagement patterns:</s-text>
                    <s-stack direction="inline" gap="base">
                      <s-badge tone="success">Best: {optimization.optimalSendTime}</s-badge>
                      <s-badge>Good: {optimization.secondBestTime}</s-badge>
                      <s-badge tone="warning">Avoid: {optimization.worstTime}</s-badge>
                    </s-stack>
                    <s-text variant="bodySm">
                      Switching to optimal timing could improve recovery by {optimization.timingImprovementPotential}%
                    </s-text>
                  </s-stack>
                </s-box>
              </s-card>

              <s-card>
                <s-box padding="base">
                  <s-stack direction="block" gap="base">
                    <s-text variant="headingMd">Message Templates</s-text>
                    <s-text>Template performance and recommendations:</s-text>
                    <s-stack direction="block" gap="tight">
                      <s-text>
                        <strong>Best performing:</strong> {optimization.bestTemplate}
                        <s-badge tone="success">{optimization.bestTemplateRate}% recovery</s-badge>
                      </s-text>
                      <s-text>
                        <strong>Needs improvement:</strong> {optimization.worstTemplate}
                        <s-badge tone="warning">{optimization.worstTemplateRate}% recovery</s-badge>
                      </s-text>
                    </s-stack>
                    <s-text variant="bodySm">
                      Recommendation: {optimization.templateRecommendation}
                    </s-text>
                  </s-stack>
                </s-box>
              </s-card>

              <s-card>
                <s-box padding="base">
                  <s-stack direction="block" gap="base">
                    <s-text variant="headingMd">Incentive Strategy</s-text>
                    <s-text>Optimal discount strategy based on cart values:</s-text>
                    <s-stack direction="block" gap="tight">
                      <s-text>$0 - $50: {optimization.incentiveStrategy.lowValue}</s-text>
                      <s-text>$50 - $150: {optimization.incentiveStrategy.midValue}</s-text>
                      <s-text>$150+: {optimization.incentiveStrategy.highValue}</s-text>
                    </s-stack>
                    <s-text variant="bodySm">
                      Potential revenue impact: +${optimization.incentiveImpactPotential}/month
                    </s-text>
                  </s-stack>
                </s-box>
              </s-card>
            </s-stack>
          </s-section>
        </s-tab>

        <s-tab id="customers" title="Customer Insights">
          <s-section heading="Customer Behavior Analysis">
            <s-text>
              Predictive insights about your customers' shopping patterns and preferences.
            </s-text>

            <s-stack direction="inline" gap="loose">
              <s-card>
                <s-box padding="base">
                  <s-stack direction="block" gap="tight">
                    <s-text variant="headingMd">High-Value Customers</s-text>
                    <s-text variant="heading2xl">{customerInsights.highValueCount}</s-text>
                    <s-text variant="bodySm">
                      Customers with CLV > ${customerInsights.highValueThreshold}
                    </s-text>
                    <s-text variant="bodySm">
                      Recovery rate: {customerInsights.highValueRecoveryRate}%
                    </s-text>
                  </s-stack>
                </s-box>
              </s-card>

              <s-card>
                <s-box padding="base">
                  <s-stack direction="block" gap="tight">
                    <s-text variant="headingMd">At-Risk Customers</s-text>
                    <s-text variant="heading2xl">{customerInsights.atRiskCount}</s-text>
                    <s-text variant="bodySm">
                      Customers likely to stop purchasing
                    </s-text>
                    <s-text variant="bodySm">
                      Avg time since last purchase: {customerInsights.atRiskAvgDays} days
                    </s-text>
                  </s-stack>
                </s-box>
              </s-card>

              <s-card>
                <s-box padding="base">
                  <s-stack direction="block" gap="tight">
                    <s-text variant="headingMd">Engaged Customers</s-text>
                    <s-text variant="heading2xl">{customerInsights.engagedCount}</s-text>
                    <s-text variant="bodySm">
                      Customers who regularly open messages
                    </s-text>
                    <s-text variant="bodySm">
                      Avg response time: {customerInsights.engagedAvgResponseTime}h
                    </s-text>
                  </s-stack>
                </s-box>
              </s-card>
            </s-stack>

            <s-section heading="Seasonal Patterns">
              <s-stack direction="block" gap="base">
                <s-text>
                  <strong>Peak shopping days:</strong> {customerInsights.seasonalPatterns.peakDays.join(", ")}
                </s-text>
                <s-text>
                  <strong>Best performing hours:</strong> {customerInsights.seasonalPatterns.peakHours.join(", ")}
                </s-text>
                <s-text>
                  <strong>Seasonal trend:</strong> {customerInsights.seasonalPatterns.trend}
                </s-text>
              </s-stack>
            </s-section>

            <s-section heading="Recommended Actions">
              <s-stack direction="block" gap="base">
                {customerInsights.recommendations.map((rec: any, index: number) => (
                  <s-banner key={index} tone={rec.priority === "high" ? "critical" : rec.priority === "medium" ? "warning" : "info"}>
                    <s-text><strong>{rec.title}</strong></s-text>
                    <s-text variant="bodySm">{rec.description}</s-text>
                    {rec.action && <s-button variant="plain">{rec.action}</s-button>}
                  </s-banner>
                ))}
              </s-stack>
            </s-section>
          </s-section>
        </s-tab>
      </s-tabs>

      <s-section slot="aside" heading="Data Privacy">
        <s-card>
          <s-box padding="base">
            <s-stack direction="block" gap="base">
              <s-text variant="headingMd">How it works</s-text>
              <s-text variant="bodySm">
                • Your data is compared against anonymized industry benchmarks
                • All customer data remains private to your store
                • Only aggregated, non-identifying metrics are used for comparisons
                • You can opt out of benchmarking at any time
              </s-text>
              <s-button variant="plain" url="/app/settings#privacy">
                Privacy Settings
              </s-button>
            </s-stack>
          </s-box>
        </s-card>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};