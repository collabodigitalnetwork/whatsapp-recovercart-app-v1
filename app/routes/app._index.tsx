import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { StatCard } from "../components/StatCard";
import { EmptyState } from "../components/EmptyState";
import { CartStatus } from "@prisma/client";
import { format, startOfDay, subDays } from "date-fns";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  // Get shop settings
  const shop = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
    include: { settings: true },
  });

  // Get stats for the last 30 days
  const thirtyDaysAgo = subDays(new Date(), 30);
  
  const [
    totalCarts,
    recoveredCarts,
    totalMessages,
    deliveredMessages,
    totalRevenue,
    recentCarts
  ] = await Promise.all([
    // Total abandoned carts
    prisma.cart.count({
      where: {
        shopId: shop?.id ?? session.shop,
        abandonedAt: { gte: thirtyDaysAgo },
      },
    }),
    // Recovered carts
    prisma.cart.count({
      where: {
        shopId: shop?.id ?? session.shop,
        status: CartStatus.RECOVERED,
        recoveredAt: { gte: thirtyDaysAgo },
      },
    }),
    // Total messages sent
    prisma.whatsAppMessage.count({
      where: {
        shopId: shop?.id ?? session.shop,
        sentAt: { gte: thirtyDaysAgo },
      },
    }),
    // Successfully delivered messages
    prisma.whatsAppMessage.count({
      where: {
        shopId: shop?.id ?? session.shop,
        status: { in: ["DELIVERED", "READ"] },
        sentAt: { gte: thirtyDaysAgo },
      },
    }),
    // Total recovered revenue
    prisma.cart.aggregate({
      where: {
        shopId: shop?.id ?? session.shop,
        status: CartStatus.RECOVERED,
        recoveredAt: { gte: thirtyDaysAgo },
      },
      _sum: { subtotal: true },
    }),
    // Recent abandoned carts
    prisma.cart.findMany({
      where: {
        shopId: shop?.id ?? session.shop,
        status: CartStatus.OPEN,
      },
      orderBy: { abandonedAt: 'desc' },
      take: 10,
      include: {
        items: true,
        workflow: true,
      },
    }),
  ]);

  const recoveryRate = totalCarts > 0 ? (recoveredCarts / totalCarts * 100).toFixed(1) : 0;
  const messageDeliveryRate = totalMessages > 0 ? (deliveredMessages / totalMessages * 100).toFixed(1) : 0;

  return {
    shop,
    stats: {
      totalCarts,
      recoveredCarts,
      recoveryRate,
      totalRevenue: totalRevenue._sum.subtotal?.toFixed(2) ?? '0',
      totalMessages,
      messageDeliveryRate,
    },
    recentCarts,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  
  // This could be used for quick actions from the dashboard
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "enable_whatsapp") {
    // Enable WhatsApp integration
  }

  return null;
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();
  const { shop, stats, recentCarts } = useFetcher<typeof loader>().data ?? {};
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Action completed successfully");
    }
  }, [fetcher.data, shopify]);

  const navigateToSettings = () => {
    window.location.href = "/app/settings";
  };

  const navigateToAnalytics = () => {
    window.location.href = "/app/analytics";
  };

  if (!shop?.settings?.whatsappEnabled) {
    return (
      <s-page heading="WhatsApp RecoverCart">
        <EmptyState
          heading="Get started with WhatsApp Recovery"
          action={{
            content: "Configure WhatsApp",
            onAction: navigateToSettings,
          }}
        >
          Connect your WhatsApp Business account to start recovering abandoned carts
          and sending delivery updates to your customers.
        </EmptyState>
      </s-page>
    );
  }

  return (
    <s-page heading="WhatsApp RecoverCart">
      <s-button slot="primary-action" onClick={navigateToAnalytics}>
        View Analytics
      </s-button>

      <s-section heading="Performance Overview">
        <s-stack direction="inline" gap="loose">
          <StatCard
            title="Recovery Rate"
            value={stats?.recoveryRate ?? 0}
            suffix="%"
            trend={{ value: 5.2, positive: true }}
          />
          <StatCard
            title="Recovered Revenue"
            value={`$${stats?.totalRevenue ?? 0}`}
            trend={{ value: 12.8, positive: true }}
          />
          <StatCard
            title="Messages Sent"
            value={stats?.totalMessages ?? 0}
          />
          <StatCard
            title="Delivery Rate"
            value={stats?.messageDeliveryRate ?? 0}
            suffix="%"
          />
        </s-stack>
      </s-section>

      <s-section heading="Recent Abandoned Carts">
        {recentCarts?.length === 0 ? (
          <s-card>
            <s-box padding="loose">
              <s-text>No abandoned carts yet. When customers leave items in their cart, they'll appear here.</s-text>
            </s-box>
          </s-card>
        ) : (
          <s-data-table
            columnContentTypes={['text', 'text', 'numeric', 'text', 'text']}
            headings={['Customer', 'Abandoned', 'Value', 'Status', 'Actions']}
            rows={recentCarts?.map(cart => [
              cart.customerEmail || 'Guest',
              format(new Date(cart.abandonedAt), 'MMM dd, HH:mm'),
              `$${cart.subtotal}`,
              cart.workflow ? (
                <s-badge tone="success">Workflow Active</s-badge>
              ) : (
                <s-badge tone="warning">No Workflow</s-badge>
              ),
              <s-button size="slim">View</s-button>
            ]) ?? []}
          />
        )}
      </s-section>

      <s-section slot="aside" heading="Quick Actions">
        <s-stack direction="block" gap="base">
          <s-card>
            <s-box padding="base">
              <s-stack direction="block" gap="base">
                <s-heading>Need help?</s-heading>
                <s-paragraph>
                  Check our guide on setting up effective cart recovery workflows.
                </s-paragraph>
                <s-button url="https://help.shopify.com">View Guide</s-button>
              </s-stack>
            </s-box>
          </s-card>
          
          <s-card>
            <s-box padding="base">
              <s-stack direction="block" gap="base">
                <s-heading>WhatsApp Status</s-heading>
                <s-badge tone="success">Connected</s-badge>
                <s-text>{stats?.totalMessages ?? 0} messages sent today</s-text>
              </s-stack>
            </s-box>
          </s-card>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};