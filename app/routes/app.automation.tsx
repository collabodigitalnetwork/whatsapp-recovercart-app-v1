import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { WorkflowStatus } from "@prisma/client";
import { useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
    include: {
      templates: {
        where: { approved: true },
      },
    },
  });

  const workflows = await prisma.recoveryWorkflow.findMany({
    where: { shopId: shop?.id ?? "" },
    include: {
      steps: true,
      _count: {
        select: { steps: true },
      },
    },
  });

  const stats = await prisma.recoveryWorkflow.groupBy({
    by: ['status'],
    where: { shopId: shop?.id ?? "" },
    _count: true,
  });

  return { shop, workflows, stats };
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
    // Create new workflow
    const workflow = await prisma.recoveryWorkflow.create({
      data: {
        shopId: shop.id,
        cartId: "", // Will be set when cart is abandoned
        templateVersion: formData.get("templateId") as string,
        rules: {
          delays: [1, 24, 72], // hours
          incentives: [null, "10%", "15%"],
        },
        status: WorkflowStatus.PENDING,
      },
    });

    // Create workflow steps
    const delays = [1, 24, 72];
    await Promise.all(
      delays.map((delayHours, index) =>
        prisma.recoveryStep.create({
          data: {
            workflowId: workflow.id,
            sequence: index + 1,
            scheduledAt: new Date(Date.now() + delayHours * 60 * 60 * 1000),
            incentive: index > 0 ? { discount: `${index * 5 + 5}%` } : null,
          },
        })
      )
    );
  }

  return { success: true };
};

export default function Automation() {
  const { shop, workflows, stats } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const activeWorkflows = stats?.find(s => s.status === WorkflowStatus.ACTIVE)?._count ?? 0;
  const completedWorkflows = stats?.find(s => s.status === WorkflowStatus.COMPLETED)?._count ?? 0;

  return (
    <s-page heading="Automation Studio">
      <s-button slot="primary-action" onClick={() => setShowCreateModal(true)}>
        Create Workflow
      </s-button>

      <s-section heading="Recovery Workflows">
        <s-stack direction="block" gap="loose">
          <s-stack direction="inline" gap="base">
            <s-badge tone="success">{activeWorkflows} Active</s-badge>
            <s-badge>{completedWorkflows} Completed</s-badge>
          </s-stack>

          {workflows?.length === 0 ? (
            <s-card>
              <s-box padding="loose">
                <s-stack direction="block" gap="base">
                  <s-heading>No workflows yet</s-heading>
                  <s-text>
                    Create your first automated cart recovery workflow to start winning back customers.
                  </s-text>
                  <s-button onClick={() => setShowCreateModal(true)}>
                    Create First Workflow
                  </s-button>
                </s-stack>
              </s-box>
            </s-card>
          ) : (
            <s-stack direction="block" gap="base">
              {/* Predefined Templates */}
              <s-card>
                <s-box padding="base">
                  <s-stack direction="block" gap="loose">
                    <s-stack direction="inline" gap="base" align="space-between">
                      <s-stack direction="block" gap="tight">
                        <s-heading>3-Step Recovery Flow</s-heading>
                        <s-text>Send 3 messages: 1hr, 24hr, 72hr with increasing incentives</s-text>
                      </s-stack>
                      <s-stack direction="inline" gap="tight">
                        <s-badge tone="success">Active</s-badge>
                        <s-button variant="plain">Edit</s-button>
                      </s-stack>
                    </s-stack>
                    
                    <s-stack direction="inline" gap="extra-loose">
                      <s-text>
                        <strong>Recovery Rate:</strong> 23.5%
                      </s-text>
                      <s-text>
                        <strong>Revenue:</strong> $12,450
                      </s-text>
                      <s-text>
                        <strong>Messages Sent:</strong> 1,234
                      </s-text>
                    </s-stack>

                    <s-stack direction="inline" gap="base">
                      <s-box
                        padding="tight"
                        background="subdued"
                        borderRadius="base"
                        borderWidth="base"
                      >
                        <s-text>Step 1: Reminder (1hr)</s-text>
                      </s-box>
                      <s-text>→</s-text>
                      <s-box
                        padding="tight"
                        background="subdued"
                        borderRadius="base"
                        borderWidth="base"
                      >
                        <s-text>Step 2: 10% Off (24hr)</s-text>
                      </s-box>
                      <s-text>→</s-text>
                      <s-box
                        padding="tight"
                        background="subdued"
                        borderRadius="base"
                        borderWidth="base"
                      >
                        <s-text>Step 3: 15% Off (72hr)</s-text>
                      </s-box>
                    </s-stack>
                  </s-stack>
                </s-box>
              </s-card>
            </s-stack>
          )}
        </s-stack>
      </s-section>

      {showCreateModal && (
        <s-modal open title="Create Recovery Workflow" onClose={() => setShowCreateModal(false)}>
          <s-modal-content>
            <Form method="post">
              <input type="hidden" name="_action" value="create" />
              <s-stack direction="block" gap="loose">
                <s-select
                  label="Template"
                  name="templateId"
                  options={shop?.templates?.map(t => ({
                    label: t.name,
                    value: t.id,
                  })) ?? []}
                  required
                />

                <s-text-field
                  label="Workflow Name"
                  name="name"
                  value="3-Step Recovery Flow"
                  helpText="Give your workflow a descriptive name"
                />

                <s-heading>Recovery Steps</s-heading>
                
                <s-card>
                  <s-box padding="base">
                    <s-stack direction="inline" gap="base" align="space-between">
                      <s-text><strong>Step 1:</strong> Send after 1 hour</s-text>
                      <s-text>No discount</s-text>
                    </s-stack>
                  </s-box>
                </s-card>

                <s-card>
                  <s-box padding="base">
                    <s-stack direction="inline" gap="base" align="space-between">
                      <s-text><strong>Step 2:</strong> Send after 24 hours</s-text>
                      <s-text>10% discount</s-text>
                    </s-stack>
                  </s-box>
                </s-card>

                <s-card>
                  <s-box padding="base">
                    <s-stack direction="inline" gap="base" align="space-between">
                      <s-text><strong>Step 3:</strong> Send after 72 hours</s-text>
                      <s-text>15% discount</s-text>
                    </s-stack>
                  </s-box>
                </s-card>
              </s-stack>
            </Form>
          </s-modal-content>
          <s-modal-footer>
            <s-button onClick={() => setShowCreateModal(false)}>Cancel</s-button>
            <s-button variant="primary" submit form="create-workflow-form">
              Create Workflow
            </s-button>
          </s-modal-footer>
        </s-modal>
      )}

      <s-section slot="aside" heading="Best Practices">
        <s-card>
          <s-box padding="base">
            <s-stack direction="block" gap="base">
              <s-heading>Timing Matters</s-heading>
              <s-text>
                Send your first message within 1-2 hours while the shopping intent is still fresh.
              </s-text>
            </s-stack>
          </s-box>
        </s-card>

        <s-card>
          <s-box padding="base">
            <s-stack direction="block" gap="base">
              <s-heading>Incentive Strategy</s-heading>
              <s-text>
                Start with a reminder, then gradually increase incentives. 
                Save your best offer for the final message.
              </s-text>
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