import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { logger } from "../lib/logger.server";
import { encrypt } from "../lib/encryption.server";

/**
 * WhatsApp Business API OAuth callback handler
 * This receives the authorization code from Facebook/WhatsApp
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Handle OAuth errors
  if (error) {
    logger.error("WhatsApp OAuth error", { 
      error, 
      errorDescription,
      shop: session.shop 
    });
    return redirect(`/app/onboarding?error=${encodeURIComponent(errorDescription || error)}`);
  }

  if (!code || !state) {
    return redirect("/app/onboarding?error=missing_oauth_params");
  }

  try {
    // Decode and verify state
    const stateData = JSON.parse(Buffer.from(state, "base64").toString());
    const shop = await prisma.shop.findUnique({
      where: { id: stateData.shopId },
    });

    if (!shop || shop.myshopifyDomain !== session.shop) {
      throw new Error("Shop mismatch in OAuth callback");
    }

    // Exchange authorization code for access token
    const tokenResponse = await exchangeCodeForToken(code);

    if (!tokenResponse.access_token) {
      throw new Error("Failed to obtain access token");
    }

    // Get WhatsApp Business Account details
    const whatsappAccounts = await getWhatsAppBusinessAccounts(tokenResponse.access_token);
    
    if (!whatsappAccounts || whatsappAccounts.length === 0) {
      return redirect("/app/onboarding?error=no_whatsapp_accounts");
    }

    // For simplicity, use the first account (in production, let user choose)
    const whatsappAccount = whatsappAccounts[0];

    // Get phone numbers for the account
    const phoneNumbers = await getPhoneNumbers(
      tokenResponse.access_token,
      whatsappAccount.id
    );

    if (!phoneNumbers || phoneNumbers.length === 0) {
      return redirect("/app/onboarding?error=no_phone_numbers");
    }

    // Store the configuration (encrypt sensitive data)
    const encryptedToken = encrypt(tokenResponse.access_token);
    
    await prisma.shopSettings.update({
      where: { shopId: shop.id },
      data: {
        whatsappEnabled: true,
        businessAccountId: whatsappAccount.id,
        whatsappPhoneNumberId: phoneNumbers[0].id,
        features: {
          whatsapp: {
            accessToken: encryptedToken,
            tokenExpiresAt: tokenResponse.expires_in 
              ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
              : null,
            refreshToken: tokenResponse.refresh_token 
              ? encrypt(tokenResponse.refresh_token) 
              : null,
            accountName: whatsappAccount.name,
            phoneNumber: phoneNumbers[0].display_phone_number,
            phoneNumberName: phoneNumbers[0].verified_name,
            connectedAt: new Date().toISOString(),
          },
        },
      },
    });

    logger.info("WhatsApp connected successfully", {
      shop: shop.myshopifyDomain,
      accountId: whatsappAccount.id,
      phoneNumberId: phoneNumbers[0].id,
    });

    // Subscribe to webhooks
    await subscribeToWebhooks(
      tokenResponse.access_token,
      whatsappAccount.id,
      `${process.env.APP_URL}/webhooks/whatsapp`
    );

    return redirect("/app/onboarding?step=test&success=whatsapp_connected");

  } catch (error) {
    logger.error("WhatsApp OAuth callback error", { error, shop: session.shop });
    return redirect(`/app/onboarding?error=${encodeURIComponent(error.message || "connection_failed")}`);
  }
};

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(code: string) {
  const response = await fetch("https://graph.facebook.com/v18.0/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.FACEBOOK_APP_ID,
      client_secret: process.env.FACEBOOK_APP_SECRET,
      code,
      redirect_uri: `${process.env.APP_URL}/app/whatsapp/callback`,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Token exchange failed");
  }

  return response.json();
}

/**
 * Get WhatsApp Business Accounts associated with the token
 */
async function getWhatsAppBusinessAccounts(accessToken: string) {
  const response = await fetch(
    `https://graph.facebook.com/v18.0/me/businesses?fields=id,name,whatsapp_business_accounts{id,name,currency,timezone_id}&access_token=${accessToken}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to fetch WhatsApp accounts");
  }

  const data = await response.json();
  const whatsappAccounts = [];

  // Extract WhatsApp Business Accounts from businesses
  for (const business of data.data || []) {
    if (business.whatsapp_business_accounts?.data) {
      whatsappAccounts.push(...business.whatsapp_business_accounts.data);
    }
  }

  return whatsappAccounts;
}

/**
 * Get phone numbers for a WhatsApp Business Account
 */
async function getPhoneNumbers(accessToken: string, accountId: string) {
  const response = await fetch(
    `https://graph.facebook.com/v18.0/${accountId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating&access_token=${accessToken}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to fetch phone numbers");
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Subscribe to WhatsApp webhooks for message status updates
 */
async function subscribeToWebhooks(accessToken: string, accountId: string, callbackUrl: string) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${accountId}/subscribed_apps`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          callback_url: callbackUrl,
          verify_token: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
          fields: ["messages", "message_status", "message_template_status"],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      logger.error("Failed to subscribe to WhatsApp webhooks", { error });
    } else {
      logger.info("WhatsApp webhooks subscribed successfully", { accountId });
    }
  } catch (error) {
    logger.error("Webhook subscription error", { error });
  }
}