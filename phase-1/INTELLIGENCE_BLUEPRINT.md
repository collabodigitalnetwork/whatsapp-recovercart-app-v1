# Intelligence Layer Blueprint – Internal Use (Phase 1)

## 1. Purpose
Build a Collabo-only intelligence system that aggregates multi-store behavioral data, delivery signals, and WhatsApp performance to identify market trends, optimize automations, and surface revenue opportunities—without exposing cross-merchant data to merchants.

## 2. Capabilities Map
| Pillar | Description | Output |
|--------|-------------|--------|
| **Market Radar** | Aggregate anonymized metrics across industries/regions | Trend indices, benchmark reports, opportunity alerts |
| **Behavior Lab** | Customer segmentation, churn risk, send-time optimization | Cohort scores, timing recommendations |
| **Delivery Intelligence** | Carrier performance, regional SLA tracking | Heatmaps, risk scores, proactive alerts |
| **Messaging Intelligence** | Template uplift, message tree effectiveness | Playbook recommendations, auto-A/B testing |
| **Revenue Ops** | Recovery attribution, discount elasticity, CLV forecasts | Pricing guidance, upsell targeting |

## 3. Data Architecture
1. **Event Ingestion**
   - Shopify webhooks → normalized events (`cart_abandoned`, `order_created`, `fulfillment_update`).
   - WhatsApp webhooks → `message_status`, `customer_reply` events.
   - Carrier APIs → `delivery_event` feed.
   - Optional: marketing spend, support ticket tags.

2. **Processing Pipeline**
   - Event bus (Redis Streams or Kafka) with per-tenant partitions.
   - Stream processors enrich + anonymize (hash customer IDs, mask PII).
   - Raw events stored in lake (S3/GCS) + appended to warehouse landing tables.

3. **Warehouse & Modeling**
   - Columnar warehouse (MotherDuck/BigQuery) with dbt transformations:
     - `fact_cart_recovery`, `fact_delivery_sla`, `fact_message_performance`.
     - `dim_cohort`, `dim_template`, `dim_carrier`.
   - Derived marts for dashboards + ML features.

4. **Feature Store**
   - `customer_behavior_features`: recency, frequency, monetary, response curves.
   - `workflow_performance_features`: send time, incentive type, CTA, conversion.
   - `delivery_risk_features`: carrier, lane, weather, delay history.

5. **Serving Layer**
   - Internal API (GraphQL/REST) providing aggregated insights.
   - Scheduled exports (CSV/Slides) for business teams.
   - Alerting engine pushing to Slack/Email when thresholds breached.

## 4. Analytical Models (Phase 1)
1. **Recovery Probability Model**
   - Inputs: cart value, customer score, time since abandon, workflow parameters.
   - Output: `recovery_score` per cart to prioritize manual follow-ups or experiments.

2. **Send-Time Optimization**
   - Inputs: historical engagement times, timezone, cohort behavior.
   - Output: `best_send_window` per segment.

3. **Carrier Risk Index**
   - Inputs: carrier historical SLA, region, parcel weight/class.
   - Output: `delivery_risk_score` to trigger proactive WhatsApp updates.

4. **Template Effectiveness Model**
   - Inputs: template content metadata, incentive, audience, season.
   - Output: predicted CTR/recovery to recommend winning variants.

## 5. Internal Dashboard Modules
1. **Mission Control**
   - Real-time KPIs: total carts monitored, revenue impacted, message success.
   - Alert feed: webhook failures, provider outages, anomaly detection.

2. **Market Insights**
   - Benchmark explorer (filters: industry, AOV range, region).
   - Trend chart (e.g., “WhatsApp conversions up 18% in Beauty last 30 days”).

3. **Opportunity Scanner**
   - Top segments with untapped potential.
   - Merchants with delivery risk spikes.
   - Templates overdue for refresh.

4. **Campaign Lab**
   - Experiment backlog + status.
   - A/B test summary (control vs variant performance).
   - Automated recommendations to push into merchant accounts.

5. **Data Studio**
   - Ad-hoc query interface (Metabase/Superset) with saved looks.
   - Export to Sheets/Slides for GTM teams.

## 6. Privacy & Governance
- **Isolation**: Merchant dashboards only access their own store data; intelligence portal requires internal auth (SAML/SSO).
- **PII Handling**: Hash customer identifiers before warehouse ingestion; store raw PII only in operational DB with strict access.
- **Compliance**: Respect regional data regulations; implement data-retention policies; include audit logs for all data access.
- **Benchmark Guardrails**: Only show aggregated stats when >N stores contribute to avoid deanonymization.

## 7. Implementation Roadmap
1. **MVP (Phase 1 Deliverable)**
   - Event log schema + ingestion pipeline.
   - Warehouse setup + dbt skeleton.
   - Basic dashboards: recovery vs benchmark, delivery SLA view.

2. **Phase 2 Enhancements**
   - ML models automation + feature store integration.
   - Alerting/notification workflows.
   - Intelligence API consumed by merchant app for opt-in benchmark widgets.

3. **Phase 3**
   - Predictive experimentation engine (auto-suggest flows).
   - Sales enablement package (PDF/Slides) generated from data for prospecting.
   - Integration with CRM for account-based insights.

## 8. Tooling Stack Options
| Need | Option A | Option B |
|------|----------|----------|
| Event Bus | Redis Streams | Kafka/Redpanda |
| Warehouse | MotherDuck (fast start) | BigQuery (scale) |
| Orchestration | dbt Cloud | Dagster |
| BI | Metabase (self-host) | Hex/Superset |
| Feature Store | Redis + custom | Feast |
| ML Stack | Python + Prefect | Vertex AI (if on GCP) |

---
This blueprint ensures the intelligence layer is scoped, governed, and delivers actionable value for internal teams without exposing sensitive cross-merchant data.