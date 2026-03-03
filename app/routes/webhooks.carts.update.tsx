import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { logEvent } from "../services/eventLog.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "CARTS_UPDATE") {
    throw new Response("Invalid webhook", { status: 400 });
  }

  await logEvent({
    shopId: shop,
    eventType: "cart_updated",
    payload,
    ingestionSource: "shopify",
  });

  return new Response();
};
