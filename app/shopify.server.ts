import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  DeliveryMethod,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { runStartupMigrations } from "./lib/migration.server";
import { logger } from "./lib/logger.server";

// Run migrations on startup (non-blocking)
if (process.env.NODE_ENV === "production" || process.env.RUN_MIGRATIONS === "true") {
  runStartupMigrations().catch((error) => {
    logger.error("Failed to run startup migrations", { error });
  });
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    CARTS_UPDATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    CARTS_CREATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    CHECKOUTS_UPDATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    ORDERS_CREATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    ORDERS_FULFILLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      try {
        logger.info("Shop authenticated", { 
          shop: session.shop,
          isNewInstall: session.isOnline,
        });

        // Ensure shop exists in database
        const shop = await prisma.shop.upsert({
          where: { myshopifyDomain: session.shop },
          update: { 
            accessToken: session.accessToken,
            lastSeenAt: new Date(),
          },
          create: {
            id: session.shop.replace(".myshopify.com", ""),
            myshopifyDomain: session.shop,
            accessToken: session.accessToken,
            installedAt: new Date(),
          },
        });

        // Create default settings if they don't exist
        await prisma.shopSettings.upsert({
          where: { shopId: shop.id },
          update: {},
          create: {
            shopId: shop.id,
            whatsappEnabled: false,
            messageLimitPerDay: 3,
            timezone: "UTC",
            defaultLanguage: "en",
          },
        });

        // Register webhooks
        await shopify.registerWebhooks({ session });

        // Check if shop needs migration from env-based config
        const { shopNeedsMigration, migrateSingleShop } = await import("./lib/migration.server");
        if (await shopNeedsMigration(shop.id)) {
          logger.info("Shop needs migration from env config", { shopId: shop.id });
          await migrateSingleShop(shop.id);
        }

        logger.info("Shop setup completed", { shopId: shop.id });
      } catch (error) {
        logger.error("Error in afterAuth hook", { error, shop: session.shop });
        throw error;
      }
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;