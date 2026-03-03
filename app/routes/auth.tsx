import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { shopifyApp } from "../shopify.server";
import prisma from "../db.server";
import { logger } from "../lib/logger.server";

/**
 * OAuth callback route - handles Shopify app installation
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { session, searchParams } = await shopifyApp.authenticate.callback(request);
    
    if (!session) {
      logger.error("No session found after OAuth callback");
      return redirect("/auth/error?error=no_session");
    }

    // Save or update shop in database
    await prisma.shop.upsert({
      where: { myshopifyDomain: session.shop },
      update: {
        accessToken: session.accessToken,
        lastSeenAt: new Date(),
      },
      create: {
        id: session.shop.replace(".myshopify.com", ""),
        myshopifyDomain: session.shop,
        accessToken: session.accessToken,
        plan: "BASIC",
      },
    });

    // Create default settings for new shop
    await prisma.shopSettings.upsert({
      where: { 
        shopId: session.shop.replace(".myshopify.com", "") 
      },
      update: {},
      create: {
        shopId: session.shop.replace(".myshopify.com", ""),
        whatsappEnabled: false, // Disabled until WhatsApp is configured
        messageLimitPerDay: 3,
        timezone: "UTC",
        defaultLanguage: "en",
      },
    });

    logger.info("Shop authenticated successfully", { shop: session.shop });

    // Redirect to onboarding if new installation
    const isNewInstall = searchParams.get("new") === "true";
    if (isNewInstall) {
      return redirect("/app/onboarding");
    }

    return redirect("/app");
  } catch (error) {
    logger.error("OAuth callback error", { error });
    return redirect("/auth/error?error=callback_failed");
  }
}