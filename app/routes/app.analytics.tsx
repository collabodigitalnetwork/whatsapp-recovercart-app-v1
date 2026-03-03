import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { CartStatus } from "@prisma/client";
import { format, startOfDay, subDays, eachDayOfInterval } from "date-fns";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
  });

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const thirtyDaysAgo = startOfDay(subDays(new Date(), 30));
  const today = startOfDay(new Date());

  // Get daily metrics
  const dailyMetrics = await prisma.cart.groupBy({
    by: ['status'],
    where: {
      shopId: shop.id,
      abandonedAt: {
        gte: thirtyDaysAgo,
        lte: today,
      },
    },
    _count: true,
    _sum: {
      subtotal: true,
    },
  });

  // Message performance
  const messagePerformance = await prisma.whatsAppMessage.groupBy({
    by: ['status', 'templateName'],
    where: {
      shopId: shop.id,
      sentAt: { gte: thirtyDaysAgo },
    },
    _count: true,
  });

  // Delivery metrics
  const deliveryMetrics = await prisma.delivery.groupBy({
    by: ['latestStatus'],
    where: {
      order: { shopId: shop.id },
      updatedAt: { gte: thirtyDaysAgo },
    },
    _count: true,
  });

  // Calculate key metrics
  const totalAbandoned = dailyMetrics.reduce((sum, m) => sum + m._count, 0);
  const totalRecovered = dailyMetrics.find(m => m.status === CartStatus.RECOVERED)?._count ?? 0;
  const totalRevenue = dailyMetrics.find(m => m.status === CartStatus.RECOVERED)?._sum.subtotal ?? 0;
  const recoveryRate = totalAbandoned > 0 ? (totalRecovered / totalAbandoned * 100).toFixed(1) : 0;

  // Get time series data for chart
  const timeSeriesData = await Promise.all(
    eachDayOfInterval({ start: thirtyDaysAgo, end: today }).map(async (date) => {
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const [abandoned, recovered] = await Promise.all([
        prisma.cart.count({
          where: {
            shopId: shop.id,
            abandonedAt: {
              gte: date,
              lt: nextDay,
            },
          },
        }),
        prisma.cart.count({
          where: {
            shopId: shop.id,
            status: CartStatus.RECOVERED,
            recoveredAt: {
              gte: date,
              lt: nextDay,
            },
          },
        }),
      ]);

      return {
        date: format(date, 'MMM dd'),
        abandoned,
        recovered,
      };
    })
  );

  return {
    metrics: {
      totalAbandoned,
      totalRecovered,
      totalRevenue: totalRevenue?.toString() ?? '0',
      recoveryRate,
      avgOrderValue: totalRecovered > 0 ? (Number(totalRevenue) / totalRecovered).toFixed(2) : '0',
    },
    messagePerformance,
    deliveryMetrics,
    timeSeriesData,
  };
};

export default function Analytics() {
  const { metrics, messagePerformance, deliveryMetrics, timeSeriesData } = useLoaderData<typeof loader>();

  const chartData = timeSeriesData.map(d => [
    d.date,
    d.abandoned.toString(),
    d.recovered.toString(),
  ]);

  return (
    <s-page heading="Analytics">
      <s-button slot="primary-action" onClick={() => window.print()}>
        Export Report
      </s-button>

      <s-section heading="Key Performance Indicators">
        <s-stack direction="inline" gap="loose">
          <s-card>
            <s-box padding="base">
              <s-stack direction="block" gap="tight">
                <s-text>Recovery Rate</s-text>
                <s-text variant="heading2xl">{metrics.recoveryRate}%</s-text>
                <s-progress-bar progress={Number(metrics.recoveryRate)} />
              </s-stack>
            </s-box>
          </s-card>

          <s-card>
            <s-box padding="base">
              <s-stack direction="block" gap="tight">
                <s-text>Total Revenue Recovered</s-text>
                <s-text variant="heading2xl">${metrics.totalRevenue}</s-text>
                <s-text variant="bodySm">
                  From {metrics.totalRecovered} recovered carts
                </s-text>
              </s-stack>
            </s-box>
          </s-card>

          <s-card>
            <s-box padding="base">
              <s-stack direction="block" gap="tight">
                <s-text>Average Order Value</s-text>
                <s-text variant="heading2xl">${metrics.avgOrderValue}</s-text>
                <s-text variant="bodySm">
                  Per recovered cart
                </s-text>
              </s-stack>
            </s-box>
          </s-card>
        </s-stack>
      </s-section>

      <s-section heading="Recovery Trend (Last 30 Days)">
        <s-card>
          <s-box padding="base">
            <s-data-table
              columnContentTypes={['text', 'numeric', 'numeric']}
              headings={['Date', 'Abandoned', 'Recovered']}
              rows={chartData.slice(-7)} // Show last 7 days
              footerContent={`Showing last 7 days of ${chartData.length} total days`}
            />
          </s-box>
        </s-card>
      </s-section>

      <s-section heading="Message Performance">
        <s-tabs>
          <s-tab id="by-status" title="By Status">
            <s-box padding="base">
              <s-stack direction="block" gap="base">
                {['SENT', 'DELIVERED', 'READ', 'FAILED'].map(status => {
                  const count = messagePerformance.filter(m => m.status === status)
                    .reduce((sum, m) => sum + m._count, 0);
                  return (
                    <s-stack key={status} direction="inline" gap="base" align="space-between">
                      <s-text>{status}</s-text>
                      <s-badge tone={status === 'FAILED' ? 'critical' : 'info'}>
                        {count}
                      </s-badge>
                    </s-stack>
                  );
                })}
              </s-stack>
            </s-box>
          </s-tab>

          <s-tab id="by-template" title="By Template">
            <s-box padding="base">
              <s-text>Template performance breakdown coming soon</s-text>
            </s-box>
          </s-tab>
        </s-tabs>
      </s-section>

      <s-section heading="Delivery Insights">
        <s-card>
          <s-box padding="base">
            <s-stack direction="block" gap="base">
              {deliveryMetrics.map(metric => (
                <s-stack key={metric.latestStatus} direction="inline" gap="base" align="space-between">
                  <s-text>{metric.latestStatus.replace(/_/g, ' ')}</s-text>
                  <s-badge>{metric._count}</s-badge>
                </s-stack>
              ))}
            </s-stack>
          </s-box>
        </s-card>
      </s-section>

      <s-section slot="aside" heading="Export Options">
        <s-card>
          <s-box padding="base">
            <s-stack direction="block" gap="base">
              <s-button url="/app/export?format=csv" variant="plain">
                Download CSV
              </s-button>
              <s-button url="/app/export?format=pdf" variant="plain">
                Generate PDF Report
              </s-button>
              <s-button onClick={() => window.print()} variant="plain">
                Print Report
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