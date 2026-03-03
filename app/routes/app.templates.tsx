import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { TemplateCategory } from "@prisma/client";
import { useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
    include: {
      templates: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  return { shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("_action");

  const shop = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
  });

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  if (action === "create") {
    await prisma.template.create({
      data: {
        shopId: shop.id,
        name: formData.get("name") as string,
        category: formData.get("category") as TemplateCategory,
        body: formData.get("body") as string,
        language: formData.get("language") as string,
        variables: JSON.parse(formData.get("variables") as string || "{}"),
        approved: false,
        createdBy: session.email ?? "admin",
      },
    });
  } else if (action === "delete") {
    await prisma.template.delete({
      where: { id: formData.get("templateId") as string },
    });
  }

  return { success: true };
};

export default function Templates() {
  const { shop } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const handlePreview = (template: any) => {
    const preview = template.body.replace(/{{(\d+)}}/g, (match: string, num: string) => {
      const vars: Record<string, string> = {
        '1': 'John',
        '2': '$99.99',
        '3': '10%',
      };
      return vars[num] || match;
    });
    
    shopify.modal.show(`Preview: ${preview}`);
  };

  return (
    <s-page heading="WhatsApp Templates">
      <s-button slot="primary-action" onClick={() => setShowCreateModal(true)}>
        Create Template
      </s-button>

      <s-section heading="Message Templates">
        {shop?.templates?.length === 0 ? (
          <s-card>
            <s-box padding="loose">
              <s-stack direction="block" gap="base">
                <s-heading>No templates yet</s-heading>
                <s-text>
                  Create WhatsApp message templates for cart recovery, delivery updates, and more.
                </s-text>
                <s-button onClick={() => setShowCreateModal(true)}>
                  Create First Template
                </s-button>
              </s-stack>
            </s-box>
          </s-card>
        ) : (
          <s-stack direction="block" gap="base">
            {shop?.templates?.map((template) => (
              <s-card key={template.id}>
                <s-box padding="base">
                  <s-stack direction="block" gap="base">
                    <s-stack direction="inline" gap="base" align="space-between">
                      <s-stack direction="block" gap="tight">
                        <s-stack direction="inline" gap="tight">
                          <s-heading>{template.name}</s-heading>
                          <s-badge tone={template.approved ? "success" : "warning"}>
                            {template.approved ? "Approved" : "Pending"}
                          </s-badge>
                        </s-stack>
                        <s-text variant="bodySm">
                          {template.category} • {template.language}
                        </s-text>
                      </s-stack>
                      <s-stack direction="inline" gap="tight">
                        <s-button variant="plain" onClick={() => handlePreview(template)}>
                          Preview
                        </s-button>
                        <Form method="post" style={{ display: 'inline' }}>
                          <input type="hidden" name="_action" value="delete" />
                          <input type="hidden" name="templateId" value={template.id} />
                          <s-button variant="plain" tone="critical" submit>
                            Delete
                          </s-button>
                        </Form>
                      </s-stack>
                    </s-stack>

                    <s-box background="subdued" padding="tight" borderRadius="base">
                      <s-text fontFamily="monospace">{template.body}</s-text>
                    </s-box>

                    {template.variables && Object.keys(template.variables).length > 0 && (
                      <s-stack direction="inline" gap="tight">
                        <s-text variant="bodySm">Variables:</s-text>
                        {Object.entries(template.variables).map(([key, value]) => (
                          <s-badge key={key}>{key}: {value as string}</s-badge>
                        ))}
                      </s-stack>
                    )}
                  </s-stack>
                </s-box>
              </s-card>
            ))}
          </s-stack>
        )}
      </s-section>

      {showCreateModal && (
        <s-modal open title="Create Template" onClose={() => setShowCreateModal(false)}>
          <s-modal-content>
            <Form id="create-template-form" method="post">
              <input type="hidden" name="_action" value="create" />
              <s-stack direction="block" gap="loose">
                <s-text-field
                  label="Template Name"
                  name="name"
                  placeholder="e.g., Cart Recovery - First Reminder"
                  required
                />

                <s-select
                  label="Category"
                  name="category"
                  options={[
                    { label: "Marketing", value: TemplateCategory.MARKETING },
                    { label: "Utility", value: TemplateCategory.UTILITY },
                    { label: "Authentication", value: TemplateCategory.AUTHENTICATION },
                  ]}
                  required
                />

                <s-select
                  label="Language"
                  name="language"
                  options={[
                    { label: "English", value: "en" },
                    { label: "Spanish", value: "es" },
                    { label: "French", value: "fr" },
                    { label: "German", value: "de" },
                  ]}
                  value="en"
                />

                <s-text-field
                  label="Message Body"
                  name="body"
                  multiline
                  rows={5}
                  placeholder="Hi {{1}}, you left items worth {{2}} in your cart. Complete your purchase now and get {{3}} off!"
                  helpText="Use {{1}}, {{2}}, etc. for variables"
                  required
                />

                <s-text-field
                  label="Variables (JSON)"
                  name="variables"
                  value='{"1": "customer_name", "2": "cart_value", "3": "discount"}'
                  helpText="Map variable numbers to descriptive names"
                />

                <s-banner tone="info">
                  <s-text>
                    Templates must be approved by WhatsApp before use. 
                    This usually takes 24-48 hours.
                  </s-text>
                </s-banner>
              </s-stack>
            </Form>
          </s-modal-content>
          <s-modal-footer>
            <s-button onClick={() => setShowCreateModal(false)}>Cancel</s-button>
            <s-button variant="primary" submit form="create-template-form">
              Create Template
            </s-button>
          </s-modal-footer>
        </s-modal>
      )}

      <s-section slot="aside" heading="Template Guidelines">
        <s-card>
          <s-box padding="base">
            <s-stack direction="block" gap="base">
              <s-heading>WhatsApp Requirements</s-heading>
              <s-unordered-list>
                <s-list-item>No promotional content in utility templates</s-list-item>
                <s-list-item>Include clear opt-out instructions</s-list-item>
                <s-list-item>Avoid excessive capitalization</s-list-item>
                <s-list-item>Use customer name when available</s-list-item>
              </s-unordered-list>
              <s-link url="https://business.whatsapp.com/policy" external>
                View Full Guidelines
              </s-link>
            </s-stack>
          </s-box>
        </s-card>

        <s-card>
          <s-box padding="base">
            <s-stack direction="block" gap="base">
              <s-heading>Pre-approved Templates</s-heading>
              <s-text>
                We provide pre-approved templates for common use cases:
              </s-text>
              <s-unordered-list>
                <s-list-item>Cart abandonment (3 variants)</s-list-item>
                <s-list-item>Order confirmation</s-list-item>
                <s-list-item>Shipping updates</s-list-item>
                <s-list-item>Delivery confirmation</s-list-item>
              </s-unordered-list>
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