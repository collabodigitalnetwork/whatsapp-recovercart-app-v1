import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { shopifyApp } from "../shopify.server";
import { logger } from "../lib/logger.server";

/**
 * This route initiates the Shopify OAuth installation flow
 * Merchants land here when they click "Install app" or "Add app" from:
 * 1. The app listing page
 * 2. The Shopify App Store
 * 3. Direct installation links
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  if (!shop) {
    logger.warn("Installation attempted without shop parameter");
    return redirect("/?error=missing_shop");
  }

  // Validate shop domain format
  const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
  if (!shopRegex.test(shop)) {
    logger.warn("Invalid shop domain format", { shop });
    return redirect("/?error=invalid_shop");
  }

  try {
    // Initiate Shopify OAuth flow
    logger.info("Initiating Shopify OAuth flow", { shop });
    
    // The shopifyApp.authenticate.install method will:
    // 1. Generate the authorization URL with proper scopes
    // 2. Include the redirect URI back to our app
    // 3. Add necessary security parameters (state, nonce)
    await shopifyApp.authenticate.install(request);
    
    // This line typically won't be reached as authenticate.install throws a redirect
    return null;
  } catch (error) {
    logger.error("Failed to initiate Shopify OAuth", { error, shop });
    
    // If it's a redirect response, re-throw it
    if (error instanceof Response) {
      throw error;
    }
    
    // Otherwise, redirect to error page
    return redirect("/?error=oauth_failed");
  }
};