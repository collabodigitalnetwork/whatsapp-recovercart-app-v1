import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { useEffect, useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
    include: { settings: true, templates: true },
  });

  return { shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const shop = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
  });

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  await prisma.shopSettings.upsert({
    where: { shopId: shop.id },
    update: {
      whatsappEnabled: formData.get("whatsappEnabled") === "on",
      whatsappPhoneNumberId: formData.get("whatsappPhoneNumberId") as string,
      businessAccountId: formData.get("businessAccountId") as string,
      messageLimitPerDay: Number(formData.get("messageLimitPerDay")),
      timezone: formData.get("timezone") as string,
      defaultLanguage: formData.get("defaultLanguage") as string,
    },
    create: {
      shopId: shop.id,
      whatsappEnabled: formData.get("whatsappEnabled") === "on",
      whatsappPhoneNumberId: formData.get("whatsappPhoneNumberId") as string,
      businessAccountId: formData.get("businessAccountId") as string,
      messageLimitPerDay: Number(formData.get("messageLimitPerDay")),
      timezone: formData.get("timezone") as string,
      defaultLanguage: formData.get("defaultLanguage") as string,
    },
  });

  return { success: true };
};

export default function Settings() {
  const { shop } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isSubmitting = navigation.state === "submitting";
  
  const [whatsappEnabled, setWhatsappEnabled] = useState(shop?.settings?.whatsappEnabled ?? false);

  useEffect(() => {
    if (navigation.state === "idle" && navigation.formData) {
      shopify.toast.show("Settings saved successfully");
    }
  }, [navigation.state, navigation.formData, shopify]);

  return (
    <s-page heading="Settings">
      <s-button slot="primary-action" form="settings-form" submit loading={isSubmitting}>
        Save settings
      </s-button>

      <Form id="settings-form" method="post">
        <s-stack direction="block" gap="extra-loose">
          <s-section heading="WhatsApp Configuration">
            <s-card>
              <s-box padding="base">
                <s-stack direction="block" gap="loose">
                  <s-checkbox
                    label="Enable WhatsApp Integration"
                    checked={whatsappEnabled}
                    onChange={(checked: boolean) => setWhatsappEnabled(checked)}
                    name="whatsappEnabled"
                  />

                  {whatsappEnabled && (
                    <>
                      <s-text-field
                        label="WhatsApp Phone Number ID"
                        name="whatsappPhoneNumberId"
                        value={shop?.settings?.whatsappPhoneNumberId ?? ""}
                        helpText="Found in your WhatsApp Business Manager"
                        required
                      />

                      <s-text-field
                        label="Business Account ID"
                        name="businessAccountId"
                        value={shop?.settings?.businessAccountId ?? ""}
                        helpText="Your WhatsApp Business Account ID"
                        required
                      />

                      <s-banner tone="info">
                        <s-text>
                          You'll need to add your WhatsApp Access Token as an environment variable: 
                          WHATSAPP_ACCESS_TOKEN
                        </s-text>
                      </s-banner>
                    </>
                  )}
                </s-stack>
              </s-box>
            </s-card>
          </s-section>

          <s-section heading="Message Settings">
            <s-card>
              <s-box padding="base">
                <s-stack direction="block" gap="loose">
                  <s-text-field
                    label="Daily Message Limit"
                    name="messageLimitPerDay"
                    type="number"
                    value={shop?.settings?.messageLimitPerDay ?? 3}
                    helpText="Maximum messages per customer per day"
                  />

                  <s-select
                    label="Timezone"
                    name="timezone"
                    options={[
                      { label: "UTC", value: "UTC" },
                      { label: "America/New_York", value: "America/New_York" },
                      { label: "America/Los_Angeles", value: "America/Los_Angeles" },
                      { label: "Europe/London", value: "Europe/London" },
                      { label: "Asia/Kolkata", value: "Asia/Kolkata" },
                    ]}
                    value={shop?.settings?.timezone ?? "UTC"}
                  />

                  <s-select
                    label="Default Language"
                    name="defaultLanguage"
                    options={[
                      { label: "English", value: "en" },
                      { label: "Spanish", value: "es" },
                      { label: "French", value: "fr" },
                      { label: "German", value: "de" },
                    ]}
                    value={shop?.settings?.defaultLanguage ?? "en"}
                  />
                </s-stack>
              </s-box>
            </s-card>
          </s-section>

          <s-section heading="Templates">
            <s-card>
              <s-box padding="base">
                <s-stack direction="block" gap="base">
                  <s-text variant="headingMd">WhatsApp Message Templates</s-text>
                  <s-text>
                    You have {shop?.templates?.length ?? 0} templates configured.
                  </s-text>
                  <s-button url="/app/templates">Manage Templates</s-button>
                </s-stack>
              </s-box>
            </s-card>
          </s-section>
        </s-stack>
      </Form>

      <s-section slot="aside" heading="Setup Guide">
        <s-card>
          <s-box padding="base">
            <s-stack direction="block" gap="base">
              <s-heading>Getting Started</s-heading>
              <s-unordered-list>
                <s-list-item>Create a WhatsApp Business account</s-list-item>
                <s-list-item>Get your Phone Number ID</s-list-item>
                <s-list-item>Generate an access token</s-list-item>
                <s-list-item>Configure message templates</s-list-item>
              </s-unordered-list>
              <s-link url="https://developers.facebook.com/docs/whatsapp" external>
                View WhatsApp Documentation
              </s-link>
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