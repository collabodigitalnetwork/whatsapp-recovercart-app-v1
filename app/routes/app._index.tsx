import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, Link } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { StatCard } from "../components/StatCard";
import { EmptyState } from "../components/EmptyState";
import { CartStatus } from "@prisma/client";
import { format, startOfDay, subDays } from "date-fns";
import { getConnectionStatus } from "../services/whatsapp.server";
import { getRecoveryStats } from "../services/cartRecovery.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  // Get shop settings
  const shop = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
    include: { settings: true },
  });

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  // Get WhatsApp connection status
  let whatsappStatus = null;
  if (shop.settings?.whatsappEnabled) {
    whatsappStatus = await getConnectionStatus(shop.id);
  }

  // Get recovery stats
  const recoveryStats = await getRecoveryStats(shop.id, 30);

  // Get recent abandoned carts
  const recentCarts = await prisma.cart.findMany({
    where: {
      shopId: shop.id,
      status: CartStatus.ABANDONED,
    },
    orderBy: { abandonedAt: 'desc' },
    take: 10,
    include: {
      items: true,
      workflow: true,
    },
  });

  // Get active workflows
  const activeWorkflows = await prisma.recoveryWorkflow.count({
    where: {
      shopId: shop.id,
      status: "ACTIVE",
    },
  });

  return {
    shop,
    whatsappStatus,
    stats: recoveryStats,
    recentCarts,
    activeWorkflows,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  // Handle any dashboard actions
  return { success: true };
};

export default function Dashboard() {
  const fetcher = useFetcher();
  const { shop, whatsappStatus, stats, recentCarts, activeWorkflows } = 
    fetcher.data ?? useLoaderData<typeof loader>();
  const shopify = useAppBridge();

  const isWhatsAppConnected = whatsappStatus?.connected;

  return (
    <s-page heading="Dashboard">
      <s-button slot="primary-action" url="/app/automation">
        Create Workflow
      </s-button>

      {/* WhatsApp Connection Alert */}
      {!isWhatsAppConnected && (
        <s-layout>
          <s-layout-section>
            <s-banner tone="warning">
              <s-stack direction="inline" gap="base" align="center">
                <s-text>
                  WhatsApp is not connected. Connect your WhatsApp Business account to start recovering carts.
                </s-text>
                <s-button url="/app/onboarding">Connect WhatsApp</s-button>
              </s-stack>
            </s-banner>
          </s-layout-section>
        </s-layout>
      )}

      {/* Connection Issues Alert */}
      {isWhatsAppConnected === false && whatsappStatus?.error && (
        <s-layout>
          <s-layout-section>
            <s-banner tone="critical">
              <s-stack direction="block" gap="tight">
                <s-text>WhatsApp connection error: {whatsappStatus.error}</s-text>
                <s-stack direction="inline" gap="tight">
                  <Link to="/app/settings">
                    <s-button>Check Settings</s-button>
                  </Link>
                  <s-button variant="plain" url="/app/help/whatsapp-connection">
                    Get Help
                  </s-button>
                </s-stack>
              </s-stack>
            </s-banner>
          </s-layout-section>
        </s-layout>
      )}

      {/* Stats Cards */}
      <s-layout>
        <s-layout-section>
          <s-stack direction="inline" gap="loose" align="stretch">
            <StatCard
              title="Abandoned Carts"
              value={stats.abandoned}
              subtitle={`Last ${stats.period}`}
              tone="warning"
            />
            <StatCard
              title="Recovered Carts"
              value={stats.recovered}
              subtitle={`${stats.recoveryRate?.toFixed(1)}% recovery rate`}
              tone="success"
            />
            <StatCard
              title="Messages Sent"
              value={stats.messagesSent}
              subtitle={`${stats.readRate?.toFixed(1)}% read rate`}
              tone="info"
            />
            <StatCard
              title="Revenue Recovered"
              value={`$${stats.recoveredRevenue?.toFixed(2) ?? '0'}`}
              subtitle={`Last ${stats.period}`}
              tone="success"
            />
          </s-stack>
        </s-layout-section>
      </s-layout>

      {/* WhatsApp Status Card */}
      {isWhatsAppConnected && (
        <s-layout>
          <s-layout-section secondary>
            <s-card>
              <s-box padding="base">
                <s-stack direction="block" gap="base">
                  <s-heading>WhatsApp Status</s-heading>
                  <s-stack direction="inline" gap="tight" align="center">
                    <s-icon source="checkmark" tone="success" />
                    <s-text>Connected</s-text>
                  </s-stack>
                  <s-text variant="bodySm">
                    Phone: {whatsappStatus.phoneNumber}
                  </s-text>
                  {whatsappStatus.businessName && (
                    <s-text variant="bodySm">
                      Business: {whatsappStatus.businessName}
                    </s-text>
                  )}
                  {whatsappStatus.qualityRating && (
                    <s-stack direction="inline" gap="tight" align="center">
                      <s-text variant="bodySm">Quality:</s-text>
                      <s-badge tone={
                        whatsappStatus.qualityRating === "GREEN" ? "success" :
                        whatsappStatus.qualityRating === "YELLOW" ? "warning" :
                        "critical"
                      }>
                        {whatsappStatus.qualityRating}
                      </s-badge>
                    </s-stack>
                  )}
                  <s-button variant="plain" url="/app/settings">
                    Manage Connection
                  </s-button>
                </s-stack>
              </s-box>
            </s-card>
          </s-layout-section>
        </s-layout>
      )}

      {/* Main Content */}
      <s-layout>
        <s-layout-section>
          <s-card>
            <s-box padding="base">
              <s-heading>Recent Abandoned Carts</s-heading>
              
              {recentCarts.length === 0 ? (
                <EmptyState
                  heading="No abandoned carts yet"
                  action={{
                    content: isWhatsAppConnected ? "View all carts" : "Connect WhatsApp",
                    url: isWhatsAppConnected ? "/app/carts" : "/app/onboarding",
                  }}
                >
                  {isWhatsAppConnected 
                    ? "When customers abandon their carts, they'll appear here."
                    : "Connect WhatsApp to start recovering abandoned carts."
                  }
                </EmptyState>
              ) : (
                <s-stack direction="block" gap="base">
                  <s-data-table
                    columnContentTypes={['text', 'numeric', 'text', 'text', 'text']}
                    headings={['Customer', 'Value', 'Items', 'Status', 'Abandoned']}
                    rows={recentCarts.map(cart => [
                      cart.customerEmail || 'Guest',
                      `$${cart.subtotal.toFixed(2)}`,
                      `${cart.items.length} items`,
                      cart.workflow ? 'Workflow Active' : 'No Workflow',
                      format(new Date(cart.abandonedAt), 'MMM d, h:mm a'),
                    ])}
                  />
                  
                  <s-button variant="plain" url="/app/carts">
                    View all carts
                  </s-button>
                </s-stack>
              )}
            </s-box>
          </s-card>
        </s-layout-section>

        <s-layout-section secondary>
          <s-card>
            <s-box padding="base">
              <s-stack direction="block" gap="base">
                <s-heading>Quick Stats</s-heading>
                
                <s-stack direction="block" gap="tight">
                  <s-text>
                    <strong>Active Workflows:</strong> {activeWorkflows}
                  </s-text>
                  <s-text>
                    <strong>Messages Today:</strong> {stats.messagesSent || 0}
                  </s-text>
                  <s-text>
                    <strong>Avg Cart Value:</strong> ${stats.avgCartValue?.toFixed(2) || '0'}
                  </s-text>
                </s-stack>
                
                <s-button variant="plain" url="/app/analytics">
                  View detailed analytics
                </s-button>
              </s-stack>
            </s-box>
          </s-card>

          <s-card>
            <s-box padding="base">
              <s-stack direction="block" gap="base">
                <s-heading>Recent Activity</s-heading>
                
                <s-stack direction="block" gap="tight">
                  {/* This would show recent events */}
                  <s-text variant="bodySm">
                    • Message sent to +1234567890
                  </s-text>
                  <s-text variant="bodySm">
                    • Cart recovered - $125.00
                  </s-text>
                  <s-text variant="bodySm">
                    • New workflow created
                  </s-text>
                </s-stack>
                
                <s-button variant="plain" url="/app/activity">
                  View all activity
                </s-button>
              </s-stack>
            </s-box>
          </s-card>
        </s-layout-section>
      </s-layout>
    </s-page>
  );
}

export function useLoaderData<T>(): T {
  return {} as T;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};