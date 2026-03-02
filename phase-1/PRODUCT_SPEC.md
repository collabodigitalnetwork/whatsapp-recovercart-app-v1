# WhatsApp RecoverCart – Product Specification (Phase 1)

## 1. Product Vision
Enable lifestyle and D2C brands to turn WhatsApp into a revenue, retention, and operations channel by automating recovery, delivery, and customer-experience workflows—while giving Collabo its own intelligence layer to spot market opportunities.

## 2. User Personas
| Persona | Goals | Pains | WhatsApp Use Cases |
|---------|-------|-------|--------------------|
| **Store Owner (Founder/CEO)** | Grow revenue, run lean ops | Recovery leaks, manual CS, lack of insights | Cart recovery overview, ROI summaries, high-level analytics |
| **E-Commerce Manager** | Optimize funnels, manage campaigns | Tool overload, no single view of customer journey | Workflow builder, template library, cohort targeting |
| **Ops & CX Lead** | Reduce “Where’s my order?” tickets | Delivery blind spots, carrier inconsistency | Delivery alerts, tracking broadcasts, proactive support |
| **Collabo Internal Analyst** | Market signals, campaign effectiveness | Scattered data, no benchmarks | Intelligence dashboards, cohort insights, cross-store trends |

## 3. Core Value Pillars
1. **Recover** – Abandoned cart workflows with personalization, multi-step reminders, incentives.
2. **Reassure** – Delivery + tracking nudges that cut support tickets and increase trust.
3. **Retain** – Post-purchase check-ins, reviews, win-back flows, curated offers.
4. **Reveal** – Intelligence layer (internal) surfacing market shifts, cohort behavior, ROI signals.

## 4. Merchant-Facing Feature Set
| Module | Capabilities |
|--------|--------------|
| **Dashboard** | Recovery revenue, WhatsApp performance, delivery SLAs, actionable alerts |
| **Automation Studio** | Prebuilt workflows (cart recovery, delivery updates, reorder prompts) + rule builder (delays, discount logic, segmentation) |
| **Template Library** | Shopify-approved WhatsApp templates, localization, variable preview, A/B testing |
| **Audience & Cohorts** | Dynamic segments: behavior, geography, purchase history, CLV tiers |
| **Delivery Center** | Carrier integrations, ETA feeds, delay alerts, “nudge customer” shortcuts |
| **Message Logs** | Timeline of every WhatsApp interaction, status, replies, attribution |
| **Analytics** | Recovery attribution, cohort uplift, template performance, ROI vs channel |

## 5. Internal-Only Intelligence Layer (Collabo)
- **Market Radar**: Cross-store benchmarks, trending products, seasonality swings.
- **Behavior Lab**: Cohort churn risk, send-time optimization, discount elasticity.
- **Delivery Intelligence**: Carrier heatmaps, regional SLA violations, high-risk orders.
- **Opportunity Scanner**: Detect under-messaged segments, stock-based triggers, upsell chances.
- **Insight Workbench**: Export insights into pitch decks, client reports, growth experiments.

## 6. Use-Case Matrix
| Journey Stage | Merchant-Facing Automation | Internal Intelligence Signal |
|---------------|---------------------------|------------------------------|
| Browse → Cart | Exit-intent WhatsApp lead capture | Product interest surge by segment |
| Cart → Checkout | 3-step recovery playbook (reminder → incentive → urgency) | Optimal discount vs conversion curve |
| Checkout → Fulfillment | Order confirm + payment reminder | Fraud/anomaly detection |
| Fulfillment → Delivery | Tracking pushes, delivery nudges, missed-delivery follow-up | Carrier reliability index |
| Delivery → Post-Purchase | Review prompts, upsells, replenishment workflows | CLV forecast change |
| Dormant Customers | Win-back sequences, WhatsApp-only drops | Churn probability, reactivation timing |

## 7. Success Metrics
- **Merchant KPIs**: Recovery revenue, recovered carts %, WhatsApp-originated GMV, delivery ticket reduction %, template CTR, incremental CLV.
- **Collabo Internal KPIs**: Intelligence adoption, benchmark coverage, predictive model accuracy, time-to-insight, upsell conversions.

## 8. Constraints & Requirements
- Shopify React Router template (no Remix) + Polaris Web Components.
- WhatsApp Business API compliance, template approvals, opt-in management.
- Multi-tenant, data isolation, GDPR-ready.
- Event-driven architecture for recovery accuracy.
- Intelligence layer must never expose cross-merchant data to merchants.

## 9. Open Questions (to resolve in Phase 1)
1. WhatsApp provider choice (direct Meta API vs Twilio vs approved BSP)?
2. Shipping/tracking integrations (17track, AfterShip, direct couriers?).
3. Intelligence warehouse stack (MotherDuck, BigQuery, Snowflake?).
4. Pricing model (base fee + usage tiers? intelligence add-on?).
5. Regionalization needs (languages, compliance nuances?).

---
This spec anchors Phase 1. Next artifacts: architecture overview, data/ERD, UI flows, and intelligence blueprint.