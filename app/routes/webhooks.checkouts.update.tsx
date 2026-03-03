import type { ActionFunctionArgs } from "react-router";
import { CartStatus } from "@prisma/client";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { logEvent } from "../services/eventLog.server";
import { scheduleRecoveryWorkflow } from "../services/cartRecovery.server";
import logger from "../lib/logger.server";

interface CheckoutPayload {
  id: number | string;
  token: string;
  email?: string;
  phone?: string;
  currency?: string;
  subtotal_price?: string;
  line_items?: Array<{
    product_id?: number;
    title: string;
    quantity: number;
    price: string;
  }>;
  abandoned_checkout_url?: string;
  customer?: {
    id?: number;
    email?: string;
  };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "CHECKOUTS_UPDATE") {
    throw new Response("Invalid webhook", { status: 400 });
  }

  const checkout = payload as CheckoutPayload;
  const cartId = String(checkout.token ?? checkout.id);

  if (!cartId) {
    logger.warn("Checkout payload missing id", { shop });
    return new Response();
  }

  const subtotal = checkout.subtotal_price ? Number(checkout.subtotal_price) : 0;

  const cart = await prisma.cart.upsert({
    where: { id: cartId },
    update: {
      customerEmail: checkout.email ?? checkout.customer?.email ?? undefined,
      customerPhone: checkout.phone ?? undefined,
      subtotal,
      currency: checkout.currency ?? "USD",
      status: CartStatus.OPEN,
    },
    create: {
      id: cartId,
      shopId: shop,
      checkoutId: cartId,
      customerEmail: checkout.email ?? checkout.customer?.email ?? undefined,
      customerPhone: checkout.phone ?? undefined,
      currency: checkout.currency ?? "USD",
      subtotal,
      abandonedAt: new Date(),
      items: {
        create: checkout.line_items?.map((item) => ({
          productId: item.product_id ? String(item.product_id) : item.title,
          title: item.title,
          quantity: item.quantity,
          price: Number(item.price ?? 0),
        })) ?? [],
      },
    },
    include: {
      workflow: { include: { steps: true } },
    },
  });

  await logEvent({
    shopId: shop,
    eventType: "checkout_updated",
    payload,
    customerHash: checkout.email,
    ingestionSource: "shopify",
  });

  if (checkout.abandoned_checkout_url && cart.workflow?.steps?.length) {
    await scheduleRecoveryWorkflow({ cartId: cart.id, shopId: shop });
  }

  return new Response();
};
