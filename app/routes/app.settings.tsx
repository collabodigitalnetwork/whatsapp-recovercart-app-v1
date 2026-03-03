import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import prisma from "../db.server";
import { useEffect, useState } from "react";
import { getConnectionStatus, clearConfigCache } from "../services/whatsapp.server";
import { logger } from "../lib/logger.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
    include: { settings: true },
  });

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  // Get WhatsApp connection status
  let connectionStatus = null;
  if (shop.settings?.whatsappEnabled) {
    connectionStatus = await getConnectionStatus(shop.id);
  }

  return { shop, connectionStatus };
};

export const action = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("_action");

  const shop = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
  });

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  switch (action) {
    case "update_settings":
      // Update general settings (not WhatsApp credentials)
      await prisma.shopSettings.upsert({
        where: { shopId: shop.id },
        update: {
          messageLimitPerDay: Number(formData.get("messageLimitPerDay")),
          timezone: formData.get("timezone") as string,
          defaultLanguage: formData.get("defaultLanguage") as string,
        },
        create: {
          shopId: shop.id,
          whatsappEnabled: false,
          messageLimitPerDay: Number(formData.get("messageLimitPerDay")),
          timezone: formData.get("timezone") as string,
          defaultLanguage: formData.get("defaultLanguage") as string,
        },
      });
      return { success: true, message: "Settings updated successfully" };

    case "disconnect_whatsapp":
      // Disconnect WhatsApp
      await prisma.shopSettings.update({
        where: { shopId: shop.id },
        data: {
          whatsappEnabled: false,
          whatsappPhoneNumberId: null,
          businessAccountId: null,
          features: {},
        },
      });
      
      // Clear cache
      clearConfigCache(shop.id);
      
      logger.info("WhatsApp disconnected", { shopId: shop.id });
      return { success: true, message: "WhatsApp disconnected" };

    case "reconnect_whatsapp":
      // Redirect to WhatsApp OAuth flow
      return { redirect: "/app/onboarding?step=whatsapp" };

    default:
      return { success: false, error: "Invalid action" };
  }
};

export default function Settings() {
  const { shop, connectionStatus } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    if (navigation.state === "idle" && navigation.formData) {
      const success = navigation.formData.get("_action") === "update_settings";
      if (success) {
        shopify.toast.show("Settings saved successfully");
      }
    }
  }, [navigation.state, navigation.formData, shopify]);

  return (
    <s-page heading="Settings">
      <s-button slot="primary-action" form="settings-form" submit loading={isSubmitting}>
        Save settings
      </s-button>

      <s-layout>
        <s-layout-section>
          <s-card>
            <s-box padding="base">
              <s-stack direction="block" gap="extra-loose">
                <div>
                  <s-heading>General Settings</s-heading>
                  <s-text>Configure your cart recovery preferences</s-text>
                </div>

                <Form method="post" id="settings-form">
                  <input type="hidden" name="_action" value="update_settings" />
                  <s-stack direction="block" gap="base">
                    <s-text-field
                      label="Daily Message Limit"
                      type="number"
                      name="messageLimitPerDay"
                      value={String(shop?.settings?.messageLimitPerDay || 3)}
                      helpText="Maximum recovery messages per customer per day"
                      min="1"
                      max="10"
                    />

                    <s-select
                      label="Timezone"
                      name="timezone"
                      options={[
                        { label: "UTC", value: "UTC" },
                        { label: "America/New_York", value: "America/New_York" },
                        { label: "America/Chicago", value: "America/Chicago" },
                        { label: "America/Denver", value: "America/Denver" },
                        { label: "America/Los_Angeles", value: "America/Los_Angeles" },
                        { label: "Europe/London", value: "Europe/London" },
                        { label: "Europe/Paris", value: "Europe/Paris" },
                        { label: "Asia/Tokyo", value: "Asia/Tokyo" },
                        { label: "Asia/Shanghai", value: "Asia/Shanghai" },
                        { label: "Australia/Sydney", value: "Australia/Sydney" },
                      ]}
                      value={shop?.settings?.timezone || "UTC"}
                    />

                    <s-select
                      label="Default Language"
                      name="defaultLanguage"
                      options={[
                        { label: "English", value: "en" },
                        { label: "Spanish", value: "es" },
                        { label: "French", value: "fr" },
                        { label: "German", value: "de" },
                        { label: "Italian", value: "it" },
                        { label: "Portuguese", value: "pt" },
                        { label: "Dutch", value: "nl" },
                        { label: "Japanese", value: "ja" },
                        { label: "Chinese", value: "zh" },
                      ]}
                      value={shop?.settings?.defaultLanguage || "en"}
                    />
                  </s-stack>
                </Form>
              </s-stack>
            </s-box>
          </s-card>
        </s-layout-section>

        <s-layout-section>
          <s-card>
            <s-box padding="base">
              <s-stack direction="block" gap="extra-loose">
                <div>
                  <s-heading>WhatsApp Connection</s-heading>
                  <s-text>Manage your WhatsApp Business integration</s-text>
                </div>

                {shop?.settings?.whatsappEnabled && connectionStatus ? (
                  <s-stack direction="block" gap="base">
                    {connectionStatus.connected ? (
                      <>
                        <s-banner tone="success">
                          <s-stack direction="block" gap="tight">
                            <s-text>WhatsApp Business is connected and active</s-text>
                            <s-text variant="bodySm">
                              Phone: {connectionStatus.phoneNumber}
                            </s-text>
                            {connectionStatus.businessName && (
                              <s-text variant="bodySm">
                                Business: {connectionStatus.businessName}
                              </s-text>
                            )}
                          </s-stack>
                        </s-banner>

                        {connectionStatus.qualityRating && (
                          <s-stack direction="inline" gap="tight" align="center">
                            <s-text>Quality Rating:</s-text>
                            <s-badge tone={
                              connectionStatus.qualityRating === "GREEN" ? "success" :
                              connectionStatus.qualityRating === "YELLOW" ? "warning" :
                              "critical"
                            }>
                              {connectionStatus.qualityRating}
                            </s-badge>
                          </s-stack>
                        )}

                        <s-stack direction="inline" gap="tight">
                          <Form method="post" style={{ display: "inline" }}>
                            <input type="hidden" name="_action" value="disconnect_whatsapp" />
                            <s-button tone="critical" submit>
                              Disconnect WhatsApp
                            </s-button>
                          </Form>
                          <s-button url="/app/onboarding?step=test">
                            Send Test Message
                          </s-button>
                        </s-stack>
                      </>
                    ) : (
                      <>
                        <s-banner tone="warning">
                          <s-stack direction="block" gap="tight">
                            <s-text>WhatsApp connection error</s-text>
                            <s-text variant="bodySm">
                              {connectionStatus.error || "Unable to verify connection"}
                            </s-text>
                          </s-stack>
                        </s-banner>

                        <Form method="post" style={{ display: "inline" }}>
                          <input type="hidden" name="_action" value="reconnect_whatsapp" />
                          <s-button variant="primary" submit>
                            Reconnect WhatsApp
                          </s-button>
                        </Form>
                      </>
                    )}
                  </s-stack>
                ) : (
                  <s-stack direction="block" gap="base">
                    <s-banner>
                      <s-text>
                        Connect your WhatsApp Business account to start sending cart recovery messages
                      </s-text>
                    </s-banner>
                    
                    <s-button variant="primary" url="/app/onboarding">
                      Connect WhatsApp Business
                    </s-button>
                  </s-stack>
                )}
              </s-stack>
            </s-box>
          </s-card>
        </s-layout-section>

        <s-layout-section secondary>
          <s-card>
            <s-box padding="base">
              <s-stack direction="block" gap="base">
                <s-heading>Quick Actions</s-heading>
                
                <s-stack direction="block" gap="tight">
                  <s-button variant="plain" url="/app/templates">
                    Manage Message Templates
                  </s-button>
                  <s-button variant="plain" url="/app/automation">
                    Configure Workflows
                  </s-button>
                  <s-button variant="plain" url="/app/analytics">
                    View Analytics
                  </s-button>
                  <s-button variant="plain" url="/app/help">
                    Help Center
                  </s-button>
                </s-stack>
              </s-stack>
            </s-box>
          </s-card>

          <s-card>
            <s-box padding="base">
              <s-stack direction="block" gap="base">
                <s-heading>WhatsApp Requirements</s-heading>
                <s-unordered-list>
                  <s-list-item>Facebook Business Manager account</s-list-item>
                  <s-list-item>Verified business on Facebook</s-list-item>
                  <s-list-item>Dedicated phone number</s-list-item>
                  <s-list-item>Approved message templates</s-list-item>
                </s-unordered-list>
                <s-button variant="plain" url="https://business.whatsapp.com" external>
                  WhatsApp Business Portal
                </s-button>
              </s-stack>
            </s-box>
          </s-card>
        </s-layout-section>
      </s-layout>
    </s-page>
  );
}

export const headers = (headersArgs: any) => boundary.headers(headersArgs);