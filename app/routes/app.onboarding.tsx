import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigate, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { useState } from "react";
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

  // Check onboarding progress
  const onboardingStatus = {
    shopConnected: true,
    whatsappConnected: shop.settings?.whatsappEnabled || false,
    testMessageSent: false, // Would check from database
    firstWorkflowCreated: await checkFirstWorkflow(shop.id),
  };

  return { shop, onboardingStatus };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const step = formData.get("step");

  const shop = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
  });

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  switch (step) {
    case "whatsapp_setup":
      // In production, this would initiate WhatsApp Business API OAuth
      return { 
        success: true, 
        whatsappAuthUrl: generateWhatsAppAuthUrl(shop.id) 
      };
      
    case "test_message":
      // Send test message
      const phoneNumber = formData.get("phoneNumber") as string;
      await sendTestMessage(shop.id, phoneNumber);
      return { success: true };
      
    case "complete":
      // Mark onboarding as complete
      await prisma.shopSettings.update({
        where: { shopId: shop.id },
        data: { 
          features: { onboardingCompleted: true } 
        },
      });
      return { success: true };
  }

  return { success: false };
};

export default function Onboarding() {
  const { shop, onboardingStatus } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [currentStep, setCurrentStep] = useState(getNextStep(onboardingStatus));

  const isSubmitting = navigation.state === "submitting";

  return (
    <s-page heading="Welcome to WhatsApp RecoverCart!">
      <s-section>
        <s-text variant="headingLg">Let's get you set up in 5 minutes</s-text>
        
        <s-stack direction="block" gap="extra-loose">
          {/* Progress indicator */}
          <s-progress-bar 
            progress={getProgress(onboardingStatus)} 
            size="small" 
          />

          {/* Step 1: Shop Connected */}
          <s-card>
            <s-box padding="base">
              <s-stack direction="inline" gap="base" align="center">
                <s-icon source={onboardingStatus.shopConnected ? "checkmark" : "clock"} />
                <s-stack direction="block" gap="tight">
                  <s-text variant="headingMd">Shop Connected</s-text>
                  <s-text>Your Shopify store is connected and ready.</s-text>
                </s-stack>
              </s-stack>
            </s-box>
          </s-card>

          {/* Step 2: WhatsApp Setup */}
          <s-card>
            <s-box padding="base">
              <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="base" align="center">
                  <s-icon source={onboardingStatus.whatsappConnected ? "checkmark" : currentStep === "whatsapp" ? "arrow-right" : "circle"} />
                  <s-text variant="headingMd">Connect WhatsApp Business</s-text>
                </s-stack>
                
                {currentStep === "whatsapp" && !onboardingStatus.whatsappConnected && (
                  <s-stack direction="block" gap="base">
                    <s-banner tone="info">
                      <s-text>
                        You'll need a WhatsApp Business Account and Facebook Business verification to send messages.
                      </s-text>
                    </s-banner>
                    
                    <s-callout-card
                      title="WhatsApp Business API Setup"
                      illustration="/whatsapp-setup.svg"
                      primaryAction={{
                        content: "Connect WhatsApp Business",
                        url: "#",
                        onAction: () => handleWhatsAppSetup(),
                      }}
                    >
                      <s-text>Connect your WhatsApp Business account to start sending cart recovery messages.</s-text>
                    </s-callout-card>

                    <s-collapsible
                      title="Manual Setup Instructions"
                      open={false}
                    >
                      <s-stack direction="block" gap="base">
                        <s-text variant="headingSm">Prerequisites:</s-text>
                        <s-ordered-list>
                          <s-list-item>Facebook Business Manager account</s-list-item>
                          <s-list-item>Verified business on Facebook</s-list-item>
                          <s-list-item>WhatsApp Business phone number (not used on WhatsApp)</s-list-item>
                        </s-ordered-list>
                        
                        <s-text variant="headingSm">Manual Configuration:</s-text>
                        <Form method="post">
                          <input type="hidden" name="step" value="manual_whatsapp" />
                          <s-stack direction="block" gap="base">
                            <s-text-field
                              label="WhatsApp Business Account ID"
                              name="businessAccountId"
                              placeholder="1234567890"
                              helpText="Found in Facebook Business Manager > WhatsApp Accounts"
                              required
                            />
                            <s-text-field
                              label="Phone Number ID"
                              name="phoneNumberId"
                              placeholder="1234567890"
                              helpText="Your WhatsApp Business phone number ID"
                              required
                            />
                            <s-text-field
                              label="Access Token"
                              name="accessToken"
                              type="password"
                              placeholder="EAAxx..."
                              helpText="Generate from Facebook Developer > Your App > WhatsApp > Getting Started"
                              required
                            />
                            <s-button submit variant="primary" disabled={isSubmitting}>
                              Save WhatsApp Configuration
                            </s-button>
                          </s-stack>
                        </Form>
                      </s-stack>
                    </s-collapsible>
                  </s-stack>
                )}
                
                {onboardingStatus.whatsappConnected && (
                  <s-text tone="success">✓ WhatsApp Business connected successfully</s-text>
                )}
              </s-stack>
            </s-box>
          </s-card>

          {/* Step 3: Test Message */}
          <s-card>
            <s-box padding="base">
              <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="base" align="center">
                  <s-icon source={onboardingStatus.testMessageSent ? "checkmark" : currentStep === "test" ? "arrow-right" : "circle"} />
                  <s-text variant="headingMd">Send Test Message</s-text>
                </s-stack>
                
                {currentStep === "test" && onboardingStatus.whatsappConnected && !onboardingStatus.testMessageSent && (
                  <Form method="post">
                    <input type="hidden" name="step" value="test_message" />
                    <s-stack direction="block" gap="base">
                      <s-text>Let's verify your WhatsApp setup by sending a test message.</s-text>
                      <s-text-field
                        label="Your WhatsApp Number"
                        name="phoneNumber"
                        type="tel"
                        placeholder="+1234567890"
                        helpText="Include country code (e.g., +1 for USA)"
                        required
                      />
                      <s-button submit variant="primary" disabled={isSubmitting}>
                        Send Test Message
                      </s-button>
                    </s-stack>
                  </Form>
                )}
                
                {onboardingStatus.testMessageSent && (
                  <s-text tone="success">✓ Test message sent successfully</s-text>
                )}
              </s-stack>
            </s-box>
          </s-card>

          {/* Step 4: Create First Workflow */}
          <s-card>
            <s-box padding="base">
              <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="base" align="center">
                  <s-icon source={onboardingStatus.firstWorkflowCreated ? "checkmark" : currentStep === "workflow" ? "arrow-right" : "circle"} />
                  <s-text variant="headingMd">Create Your First Workflow</s-text>
                </s-stack>
                
                {currentStep === "workflow" && !onboardingStatus.firstWorkflowCreated && (
                  <s-stack direction="block" gap="base">
                    <s-text>Set up your first cart recovery automation.</s-text>
                    <s-button 
                      variant="primary" 
                      onClick={() => navigate("/app/automation?setup=true")}
                    >
                      Create Recovery Workflow
                    </s-button>
                  </s-stack>
                )}
                
                {onboardingStatus.firstWorkflowCreated && (
                  <s-text tone="success">✓ First workflow created</s-text>
                )}
              </s-stack>
            </s-box>
          </s-card>

          {/* Completion */}
          {isOnboardingComplete(onboardingStatus) && (
            <s-callout-card
              title="🎉 You're All Set!"
              illustration="/celebration.svg"
              primaryAction={{
                content: "Go to Dashboard",
                url: "/app",
              }}
            >
              <s-text>
                Congratulations! WhatsApp RecoverCart is now actively monitoring abandoned carts and will automatically send recovery messages based on your workflow.
              </s-text>
            </s-callout-card>
          )}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Need Help?">
        <s-card>
          <s-box padding="base">
            <s-stack direction="block" gap="base">
              <s-text variant="headingMd">Resources</s-text>
              <s-unordered-list>
                <s-list-item>
                  <s-link url="/app/help/whatsapp-setup">WhatsApp Setup Guide</s-link>
                </s-list-item>
                <s-list-item>
                  <s-link url="/app/help/best-practices">Best Practices</s-link>
                </s-list-item>
                <s-list-item>
                  <s-link url="/app/help/troubleshooting">Troubleshooting</s-link>
                </s-list-item>
              </s-unordered-list>
              <s-button variant="plain" url="mailto:support@your-app.com">
                Contact Support
              </s-button>
            </s-stack>
          </s-box>
        </s-card>
      </s-section>
    </s-page>
  );
}

function getNextStep(status: any): string {
  if (!status.whatsappConnected) return "whatsapp";
  if (!status.testMessageSent) return "test";
  if (!status.firstWorkflowCreated) return "workflow";
  return "complete";
}

function getProgress(status: any): number {
  let steps = 0;
  if (status.shopConnected) steps++;
  if (status.whatsappConnected) steps++;
  if (status.testMessageSent) steps++;
  if (status.firstWorkflowCreated) steps++;
  return (steps / 4) * 100;
}

function isOnboardingComplete(status: any): boolean {
  return status.shopConnected && 
         status.whatsappConnected && 
         status.testMessageSent && 
         status.firstWorkflowCreated;
}

async function checkFirstWorkflow(shopId: string): Promise<boolean> {
  const workflow = await prisma.recoveryWorkflow.findFirst({
    where: { shopId },
  });
  return !!workflow;
}

function generateWhatsAppAuthUrl(shopId: string): string {
  // In production, this would generate the actual WhatsApp Business API OAuth URL
  const redirectUri = encodeURIComponent(`${process.env.APP_URL}/app/whatsapp/callback`);
  const state = Buffer.from(JSON.stringify({ shopId })).toString("base64");
  
  return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.FACEBOOK_APP_ID}&redirect_uri=${redirectUri}&state=${state}&scope=whatsapp_business_management,whatsapp_business_messaging`;
}

async function sendTestMessage(shopId: string, phoneNumber: string): Promise<void> {
  // This would send an actual test message via WhatsApp
  logger.info("Sending test message", { shopId, phoneNumber });
}

async function handleWhatsAppSetup() {
  // Initiate WhatsApp OAuth flow
  window.location.href = "/app/whatsapp/auth";
}

export const headers = (headersArgs: any) => boundary.headers(headersArgs);