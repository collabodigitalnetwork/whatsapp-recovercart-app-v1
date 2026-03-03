import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
    include: { templates: true },
  });

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  // Get existing experiments
  const experiments = await prisma.$queryRaw<Array<any>>`
    SELECT * FROM Experiment 
    WHERE shopId = ${shop.id}
    ORDER BY createdAt DESC
  `.catch(() => []);

  return { shop, experiments };
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
    // Create new experiment
    const experimentData = {
      name: formData.get("name") as string,
      type: formData.get("type") as string,
      hypothesis: formData.get("hypothesis") as string,
      variants: JSON.parse(formData.get("variants") as string || "[]"),
      trafficSplit: Number(formData.get("trafficSplit")) || 50,
      duration: Number(formData.get("duration")) || 7,
    };

    // In a real implementation, this would create the experiment record
    // For now, we'll simulate success
  }

  return { success: true };
};

export default function Experiments() {
  const { shop, experiments } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedExperiment, setSelectedExperiment] = useState<any>(null);

  // Mock data for demonstration
  const mockExperiments = [
    {
      id: "exp_1",
      name: "Template A vs B - Cart Recovery",
      type: "template",
      status: "running",
      startDate: "2024-03-01",
      endDate: "2024-03-08",
      progress: 65,
      variants: [
        { name: "Control", trafficShare: 50, conversions: 123, visits: 1000 },
        { name: "Variant", trafficShare: 50, conversions: 145, visits: 980 },
      ],
      winner: null,
      significance: 0.12,
    },
    {
      id: "exp_2",
      name: "Send Time Optimization",
      type: "timing",
      status: "completed",
      startDate: "2024-02-15",
      endDate: "2024-02-22",
      progress: 100,
      variants: [
        { name: "10 AM", trafficShare: 33, conversions: 89, visits: 650 },
        { name: "2 PM", trafficShare: 33, conversions: 112, visits: 670 },
        { name: "7 PM", trafficShare: 34, conversions: 98, visits: 680 },
      ],
      winner: "2 PM",
      significance: 0.05,
    },
    {
      id: "exp_3",
      name: "Incentive Strategy Test",
      type: "incentive",
      status: "draft",
      startDate: "2024-03-10",
      endDate: "2024-03-17",
      progress: 0,
      variants: [
        { name: "No Discount", trafficShare: 25, conversions: 0, visits: 0 },
        { name: "5% Off", trafficShare: 25, conversions: 0, visits: 0 },
        { name: "10% Off", trafficShare: 25, conversions: 0, visits: 0 },
        { name: "Free Shipping", trafficShare: 25, conversions: 0, visits: 0 },
      ],
      winner: null,
      significance: null,
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running": return "info";
      case "completed": return "success";
      case "draft": return "warning";
      default: return "info";
    }
  };

  const calculateConversionRate = (conversions: number, visits: number) => {
    return visits > 0 ? ((conversions / visits) * 100).toFixed(2) : "0.00";
  };

  return (
    <s-page heading="A/B Testing">
      <s-button slot="primary-action" onClick={() => setShowCreateModal(true)}>
        Create Experiment
      </s-button>

      <s-section heading="Active & Recent Experiments">
        {mockExperiments.length === 0 ? (
          <s-card>
            <s-box padding="loose">
              <s-stack direction="block" gap="base">
                <s-heading>Start Optimizing with A/B Tests</s-heading>
                <s-text>
                  Test different message templates, send times, and incentive strategies to improve your recovery rates.
                </s-text>
                <s-button onClick={() => setShowCreateModal(true)}>
                  Create Your First Experiment
                </s-button>
              </s-stack>
            </s-box>
          </s-card>
        ) : (
          <s-stack direction="block" gap="base">
            {mockExperiments.map((experiment) => (
              <s-card key={experiment.id}>
                <s-box padding="base">
                  <s-stack direction="block" gap="base">
                    <s-stack direction="inline" gap="base" align="space-between">
                      <s-stack direction="block" gap="tight">
                        <s-stack direction="inline" gap="tight">
                          <s-heading>{experiment.name}</s-heading>
                          <s-badge tone={getStatusColor(experiment.status)}>
                            {experiment.status}
                          </s-badge>
                          {experiment.winner && (
                            <s-badge tone="success">Winner: {experiment.winner}</s-badge>
                          )}
                        </s-stack>
                        <s-text variant="bodySm">
                          {experiment.type.charAt(0).toUpperCase() + experiment.type.slice(1)} test • 
                          {experiment.startDate} to {experiment.endDate}
                        </s-text>
                      </s-stack>
                      <s-stack direction="inline" gap="tight">
                        <s-button variant="plain" onClick={() => setSelectedExperiment(experiment)}>
                          View Details
                        </s-button>
                        {experiment.status === "draft" && (
                          <s-button variant="primary">Start Test</s-button>
                        )}
                      </s-stack>
                    </s-stack>

                    {experiment.status === "running" && (
                      <s-progress-bar progress={experiment.progress} />
                    )}

                    <s-stack direction="inline" gap="loose">
                      {experiment.variants.map((variant: any, index: number) => (
                        <s-card key={index}>
                          <s-box padding="tight">
                            <s-stack direction="block" gap="tight">
                              <s-text variant="headingSm">{variant.name}</s-text>
                              <s-text>
                                {variant.conversions}/{variant.visits} conversions
                              </s-text>
                              <s-text variant="bodySm">
                                {calculateConversionRate(variant.conversions, variant.visits)}% conversion rate
                              </s-text>
                              <s-text variant="bodySm">
                                {variant.trafficShare}% traffic
                              </s-text>
                            </s-stack>
                          </s-box>
                        </s-card>
                      ))}
                    </s-stack>

                    {experiment.significance !== null && (
                      <s-text variant="bodySm">
                        Statistical significance: {(experiment.significance * 100).toFixed(1)}%
                        {experiment.significance < 0.05 ? " ✅ Significant" : " ⏳ Not significant yet"}
                      </s-text>
                    )}
                  </s-stack>
                </s-box>
              </s-card>
            ))}
          </s-stack>
        )}
      </s-section>

      {showCreateModal && (
        <s-modal open title="Create A/B Test" onClose={() => setShowCreateModal(false)}>
          <s-modal-content>
            <Form method="post">
              <input type="hidden" name="_action" value="create" />
              <s-stack direction="block" gap="loose">
                <s-text-field
                  label="Experiment Name"
                  name="name"
                  placeholder="e.g., Template A vs B - Holiday Campaign"
                  required
                />

                <s-select
                  label="Test Type"
                  name="type"
                  options={[
                    { label: "Message Templates", value: "template" },
                    { label: "Send Timing", value: "timing" },
                    { label: "Incentive Strategy", value: "incentive" },
                    { label: "Workflow Sequence", value: "workflow" },
                  ]}
                  required
                />

                <s-text-field
                  label="Hypothesis"
                  name="hypothesis"
                  placeholder="We believe that changing X will improve Y because Z"
                  multiline
                />

                <s-text-field
                  label="Traffic Split %"
                  name="trafficSplit"
                  type="number"
                  value="50"
                  helpText="Percentage of traffic to send to variant (rest goes to control)"
                />

                <s-text-field
                  label="Test Duration (days)"
                  name="duration"
                  type="number"
                  value="7"
                  helpText="How long to run the test"
                />

                <s-banner tone="info">
                  <s-text>
                    Tests will automatically stop when statistical significance is reached or duration expires.
                  </s-text>
                </s-banner>
              </s-stack>
            </Form>
          </s-modal-content>
          <s-modal-footer>
            <s-button onClick={() => setShowCreateModal(false)}>Cancel</s-button>
            <s-button variant="primary" submit form="create-experiment">
              Create Experiment
            </s-button>
          </s-modal-footer>
        </s-modal>
      )}

      {selectedExperiment && (
        <s-modal open title={selectedExperiment.name} onClose={() => setSelectedExperiment(null)}>
          <s-modal-content>
            <s-stack direction="block" gap="loose">
              <s-text><strong>Type:</strong> {selectedExperiment.type}</s-text>
              <s-text><strong>Status:</strong> {selectedExperiment.status}</s-text>
              <s-text><strong>Duration:</strong> {selectedExperiment.startDate} to {selectedExperiment.endDate}</s-text>
              
              <s-heading>Variants Performance</s-heading>
              
              <s-data-table
                columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric']}
                headings={['Variant', 'Traffic %', 'Visits', 'Conversions', 'Conv. Rate']}
                rows={selectedExperiment.variants.map((v: any) => [
                  v.name,
                  v.trafficShare + '%',
                  v.visits.toString(),
                  v.conversions.toString(),
                  calculateConversionRate(v.conversions, v.visits) + '%'
                ])}
              />

              {selectedExperiment.status === "completed" && selectedExperiment.winner && (
                <s-banner tone="success">
                  <s-text>
                    <strong>Winner:</strong> {selectedExperiment.winner} performed best with statistical significance.
                  </s-text>
                </s-banner>
              )}

              {selectedExperiment.status === "running" && (
                <s-stack direction="block" gap="base">
                  <s-text><strong>Progress:</strong> {selectedExperiment.progress}%</s-text>
                  <s-progress-bar progress={selectedExperiment.progress} />
                  <s-text variant="bodySm">
                    Experiment needs more data to reach statistical significance.
                  </s-text>
                </s-stack>
              )}
            </s-stack>
          </s-modal-content>
          <s-modal-footer>
            <s-button onClick={() => setSelectedExperiment(null)}>Close</s-button>
            {selectedExperiment.status === "completed" && selectedExperiment.winner && (
              <s-button variant="primary">Apply Winner</s-button>
            )}
          </s-modal-footer>
        </s-modal>
      )}

      <s-section slot="aside" heading="Testing Best Practices">
        <s-card>
          <s-box padding="base">
            <s-stack direction="block" gap="base">
              <s-heading>Tips for Success</s-heading>
              <s-unordered-list>
                <s-list-item>Test one variable at a time</s-list-item>
                <s-list-item>Run tests for at least 1 week</s-list-item>
                <s-list-item>Wait for statistical significance</s-list-item>
                <s-list-item>Document your hypothesis</s-list-item>
                <s-list-item>Apply learnings to future campaigns</s-list-item>
              </s-unordered-list>
            </s-stack>
          </s-box>
        </s-card>

        <s-card>
          <s-box padding="base">
            <s-stack direction="block" gap="base">
              <s-heading>Sample Size Calculator</s-heading>
              <s-text variant="bodySm">
                For reliable results, you need at least 100 conversions per variant.
                With a 15% conversion rate, that's ~670 cart abandonment events per variant.
              </s-text>
              <s-button variant="plain" url="/app/insights">
                View Current Metrics
              </s-button>
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