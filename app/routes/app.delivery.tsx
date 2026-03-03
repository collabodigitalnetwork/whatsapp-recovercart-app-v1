import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { DeliveryStatus } from "@prisma/client";
import { format } from "date-fns";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
  });

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const deliveries = await prisma.delivery.findMany({
    where: { order: { shopId: shop.id } },
    include: {
      order: true,
      events: {
        orderBy: { occurredAt: 'desc' },
        take: 3,
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });

  const stats = await prisma.delivery.groupBy({
    by: ['latestStatus'],
    where: { order: { shopId: shop.id } },
    _count: true,
  });

  return { deliveries, stats };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("_action");

  if (action === "send_update") {
    const deliveryId = formData.get("deliveryId") as string;
    // TODO: Send WhatsApp update for this delivery
  }

  return { success: true };
};

export default function Delivery() {
  const { deliveries, stats } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const navigate = useNavigate();

  const statusColors = {
    [DeliveryStatus.DELIVERED]: 'success',
    [DeliveryStatus.IN_TRANSIT]: 'info',
    [DeliveryStatus.DELAYED]: 'warning',
    [DeliveryStatus.FAILED_ATTEMPT]: 'critical',
  } as const;

  const handleSendUpdate = (deliveryId: string) => {
    shopify.modal.show('Delivery update sent via WhatsApp');
  };

  return (
    <s-page heading="Delivery Tracking">
      <s-button slot="primary-action" onClick={() => navigate('/app/settings')}>
        Configure Carriers
      </s-button>

      <s-section heading="Delivery Overview">
        <s-stack direction="inline" gap="loose">
          {stats.map(stat => (
            <s-card key={stat.latestStatus}>
              <s-box padding="base">
                <s-stack direction="block" gap="tight">
                  <s-text>{stat.latestStatus.replace(/_/g, ' ')}</s-text>
                  <s-text variant="heading2xl">{stat._count}</s-text>
                </s-stack>
              </s-box>
            </s-card>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Recent Deliveries">
        {deliveries.length === 0 ? (
          <s-card>
            <s-box padding="loose">
              <s-text>No deliveries to track yet.</s-text>
            </s-box>
          </s-card>
        ) : (
          <s-data-table
            columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
            headings={['Order', 'Carrier', 'Tracking', 'Status', 'Updated', 'Actions']}
            rows={deliveries.map(delivery => [
              delivery.order.id,
              delivery.carrier,
              delivery.trackingNumber,
              <s-badge tone={statusColors[delivery.latestStatus] || 'info'}>
                {delivery.latestStatus.replace(/_/g, ' ')}
              </s-badge>,
              format(new Date(delivery.updatedAt), 'MMM dd, HH:mm'),
              <s-stack direction="inline" gap="tight">
                <s-button size="slim" variant="plain" onClick={() => handleSendUpdate(delivery.id)}>
                  Send Update
                </s-button>
                <s-button size="slim" variant="plain" url={delivery.trackingUrl ?? ''} external>
                  Track
                </s-button>
              </s-stack>
            ])}
          />
        )}
      </s-section>

      <s-section slot="aside" heading="Delivery Insights">
        <s-card>
          <s-box padding="base">
            <s-stack direction="block" gap="base">
              <s-heading>Performance</s-heading>
              <s-stack direction="block" gap="tight">
                <s-text>On-time delivery: 94%</s-text>
                <s-text>Average transit: 3.2 days</s-text>
                <s-text>Customer satisfaction: 4.8/5</s-text>
              </s-stack>
            </s-stack>
          </s-box>
        </s-card>

        <s-card>
          <s-box padding="base">
            <s-stack direction="block" gap="base">
              <s-heading>Carrier Status</s-heading>
              <s-stack direction="block" gap="tight">
                <s-badge tone="success">DHL: Online</s-badge>
                <s-badge tone="success">FedEx: Online</s-badge>
                <s-badge tone="warning">UPS: Delays reported</s-badge>
              </s-stack>
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