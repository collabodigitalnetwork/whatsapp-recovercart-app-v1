import prisma from "../db.server";
import { encrypt } from "./encryption.server";
import { logger } from "./logger.server";

/**
 * Migrate shops from environment variable configuration to OAuth-based configuration
 * This is for backward compatibility with existing installations
 */
export async function migrateFromEnvConfig(): Promise<void> {
  // Only run if environment variables are set
  if (!process.env.WHATSAPP_API_TOKEN || 
      !process.env.WHATSAPP_PHONE_NUMBER_ID || 
      !process.env.WHATSAPP_BUSINESS_ACCOUNT_ID) {
    logger.info("No legacy WhatsApp environment variables found, skipping migration");
    return;
  }

  logger.info("Starting migration from environment variables to OAuth configuration");

  try {
    // Find shops that have WhatsApp enabled but no OAuth config
    const shopsToMigrate = await prisma.shopSettings.findMany({
      where: {
        whatsappEnabled: true,
        OR: [
          { features: null },
          { features: { equals: {} } },
          { features: { path: ["whatsapp"], equals: null } },
        ],
      },
      include: { shop: true },
    });

    logger.info(`Found ${shopsToMigrate.length} shops to migrate`);

    for (const settings of shopsToMigrate) {
      try {
        // Encrypt the access token from environment
        const encryptedToken = encrypt(process.env.WHATSAPP_API_TOKEN!);

        // Update settings with OAuth-style configuration
        await prisma.shopSettings.update({
          where: { id: settings.id },
          data: {
            whatsappPhoneNumberId: settings.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID,
            businessAccountId: settings.businessAccountId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
            features: {
              ...(settings.features as object || {}),
              whatsapp: {
                accessToken: encryptedToken,
                phoneNumber: process.env.WHATSAPP_PHONE_NUMBER || "Unknown",
                businessName: "Migrated from Environment",
                connectedAt: new Date().toISOString(),
                migratedFromEnv: true,
              },
            },
          },
        });

        logger.info("Migrated shop to OAuth configuration", {
          shopId: settings.shopId,
          shopDomain: settings.shop.myshopifyDomain,
        });
      } catch (error) {
        logger.error("Failed to migrate shop", {
          error,
          shopId: settings.shopId,
        });
      }
    }

    logger.info("Migration completed", {
      migrated: shopsToMigrate.length,
    });
  } catch (error) {
    logger.error("Migration failed", { error });
    throw error;
  }
}

/**
 * Check if a shop needs migration
 */
export async function shopNeedsMigration(shopId: string): Promise<boolean> {
  const settings = await prisma.shopSettings.findUnique({
    where: { shopId },
  });

  if (!settings?.whatsappEnabled) {
    return false;
  }

  // Check if using legacy configuration
  const hasOAuthConfig = settings.features && 
    typeof settings.features === "object" && 
    "whatsapp" in settings.features;

  return !hasOAuthConfig && !!process.env.WHATSAPP_API_TOKEN;
}

/**
 * Migrate a single shop on-demand
 */
export async function migrateSingleShop(shopId: string): Promise<boolean> {
  if (!await shopNeedsMigration(shopId)) {
    return false;
  }

  try {
    const settings = await prisma.shopSettings.findUnique({
      where: { shopId },
    });

    if (!settings) {
      return false;
    }

    const encryptedToken = encrypt(process.env.WHATSAPP_API_TOKEN!);

    await prisma.shopSettings.update({
      where: { shopId },
      data: {
        whatsappPhoneNumberId: settings.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID,
        businessAccountId: settings.businessAccountId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
        features: {
          ...(settings.features as object || {}),
          whatsapp: {
            accessToken: encryptedToken,
            phoneNumber: process.env.WHATSAPP_PHONE_NUMBER || "Unknown",
            businessName: "Migrated from Environment",
            connectedAt: new Date().toISOString(),
            migratedFromEnv: true,
          },
        },
      },
    });

    logger.info("Successfully migrated shop", { shopId });
    return true;
  } catch (error) {
    logger.error("Failed to migrate shop", { error, shopId });
    return false;
  }
}

/**
 * Clean up legacy configuration after successful migration
 */
export async function cleanupLegacyConfig(shopId: string): Promise<void> {
  try {
    const settings = await prisma.shopSettings.findUnique({
      where: { shopId },
    });

    if (!settings?.features || typeof settings.features !== "object") {
      return;
    }

    const features = settings.features as any;
    
    // Only clean up if OAuth config exists and migration flag is set
    if (features.whatsapp?.migratedFromEnv) {
      // Remove migration flag
      delete features.whatsapp.migratedFromEnv;

      await prisma.shopSettings.update({
        where: { shopId },
        data: { features },
      });

      logger.info("Cleaned up legacy configuration", { shopId });
    }
  } catch (error) {
    logger.error("Failed to cleanup legacy config", { error, shopId });
  }
}

/**
 * Run migrations on app startup
 */
export async function runStartupMigrations(): Promise<void> {
  try {
    // Run environment variable migration
    await migrateFromEnvConfig();

    // Add other migrations here as needed
    logger.info("Startup migrations completed");
  } catch (error) {
    logger.error("Startup migrations failed", { error });
    // Don't throw - app should still start even if migrations fail
  }
}