import type { ActionFunctionArgs } from "react-router";
import { OrderStatus } from "@prisma/client";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { handleOrderRecovered } from "../services/cartRecovery.server";
import { logEvent } from "../services/eventLog.server";

interface OrderPayload {
  id: number;
  cart_token?: string;
  checkout_token?: string;
  total_price?: string;
  currency?: string;
  customer?: { id?: number };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "ORDERS_CREATE") {
    throw new Response("Invalid webhook", { status: 400 });
  }

  const order = payload as OrderPayload;
  const orderId = String(order.id);

  const created = await prisma.order.upsert({
    where: { id: orderId },
    update: {
      totalPrice: Number(order.total_price ?? 0),
      status: OrderStatus.PAID,
    },
    create: {
      id: orderId,
      shopId: shop,
      shopifyOrderId: orderId,
      cartId: order.cart_token ?? order.checkout_token,
      totalPrice: Number(order.total_price ?? 0),
      currency: order.currency ?? "USD",
      status: OrderStatus.PAID,
      placedAt: new Date(),
    },
    include: { cart: true },
  });

  if (created.cart) {
    await handleOrderRecovered(created.cart);
  }

  await logEvent({
    shopId: shop,
    eventType: "order_created",
    payload,
    ingestionSource: "shopify",
    customerHash: order.customer?.id ? String(order.customer.id) : undefined,
  });

  return new Response();
};
