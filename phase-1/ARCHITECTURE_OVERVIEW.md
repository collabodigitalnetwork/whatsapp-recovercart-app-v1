# Architecture Overview – WhatsApp RecoverCart (Phase 1)

## 1. High-Level System Diagram (Described)
```
Shopify Store  ─┐                                 ┌─> Internal Intelligence Portal
                │  Webhooks + Admin API          │
Merchant Admin ─┼─> RecoverCart App Backend ───┬─┼─> Merchant Admin UI (embedded)
WhatsApp API   ─┘   (React Router + Node)     │ │
                                              │ └─> Message Queue + Workers
Carrier APIs   ────────────────────────────────┘
```

## 2. Logical Components
1. **Presentation Layer (Embedded Shopify App)**
   - React Router + Polaris web components
   - App Bridge for navigation, modals, toasts
   - Routes: `/app`, `/app/settings`, `/app/delivery`, `/app/analytics`

2. **Application Layer**
   - `shopify.server.ts`: authentication, session storage, webhook validation
   - Route loaders/actions: data fetch, mutations, form handlers
   - Feature services: `CartRecoveryService`, `DeliveryService`, `MessagingService`, `TemplateService`

3. **Integration Layer**
   - Shopify Admin GraphQL client
   - WhatsApp Business API client (or BSP SDK)
   - Carrier/Tracking adapters (17track, Shiprocket, etc.)
   - Email/SMS fallbacks (optional future)

4. **Data & Storage**
   - **Operational DB**: PostgreSQL via Prisma (sessions, shops, carts, deliveries, templates, messages)
   - **Cache/Queue**: Redis (Bull queues, rate limiting, dedup)
   - **Analytics Warehouse**: DuckDB/MotherDuck or BigQuery for intelligence layer
   - **Blob Storage**: S3/GCS for raw webhook archives & AI training data

5. **Background Services**
   - Queue workers (Node) for message scheduling, retries, webhook processing, analytics aggregation
   - ETL jobs (dbt/Dagster) to populate warehouse tables from operational DB + event logs

6. **Intelligence Platform**
   - Feature Store (customer cohorts, scores, benchmarks)
   - ML jobs (send-time optimization, recovery probability, carrier risk)
   - Internal dashboards (Next.js + Superset/Metabase)

## 3. Data Flow Narratives
### A. Abandoned Cart Recovery
1. Shopify fires `checkouts/update` webhook → route `webhooks.checkouts.update`.
2. Payload validated → persisted (`AbandonedCart` table) → event queued.
3. Rule engine checks criteria → schedules WhatsApp workflow in Bull queue.
4. Worker sends WhatsApp template via API → logs message + delivery ID.
5. Delivery/read webhooks update message status; conversions tracked when `orders/create` event referencing same cart ID arrives.
6. Analytics job attributes revenue to workflow → surfaces in dashboard + intelligence layer.

### B. Delivery Tracking
1. Fulfillment webhook ingested → Delivery record created with tracking number.
2. Carrier adapter polls or receives webhook updates.
3. Status changes trigger notifications (e.g., out for delivery) + update SLA metrics.
4. Late/failed deliveries push alerts to merchant UI + internal portal.

### C. Intelligence Layer
1. Event log (Kafka/Redis Stream) receives normalized events from all merchants.
2. Nightly ETL aggregates anonymized metrics per industry/region.
3. ML jobs compute scores (churn risk, best send time) and store in feature tables.
4. Internal portal consumes aggregated data; merchant UI only receives store-specific insights or opt-in benchmarks.

## 4. Key Technology Choices
| Layer | Tech | Notes |
|-------|------|-------|
| UI | React Router, Polaris web components | Required by Shopify, matches template |
| App Server | Node + TypeScript | Provided by template, easy to extend |
| Auth | Shopify new embedded auth strategy | Token exchange, no redirects |
| DB | PostgreSQL (prod), SQLite (dev) | Via Prisma; scalable |
| Cache/Queue | Redis + Bull | Scheduling, retries, dedup |
| Analytics | DuckDB/MotherDuck or BigQuery | Columnar, handles large event sets |
| ETL | dbt or Dagster | Model lineage, tests |
| Intelligence | Python notebooks → scheduled jobs | Build ML incrementally |
| Internal UI | Next.js + Supabase Auth | Separate from merchant app |

## 5. Security & Compliance
- Session tokens stored in Prisma Session Storage.
- Webhook verification using HMAC + replay prevention.
- Secrets via environment variables / secret manager.
- PII minimization: hashed identifiers in intelligence warehouse.
- Regional hosting considerations (India/EU stores) – plan multi-region in Phase 2.
- GDPR/CCPA support: data erase webhooks handled, audit logs retained.

## 6. Scalability Considerations
- Horizontal scale via stateless app instances; shared Redis + Postgres.
- Bull queues partitioned per merchant tier to isolate heavy users.
- Event log streaming to warehouse for near-real-time dashboards.
- Caching layer for frequently accessed Shopify data (products, inventory).
- Feature flags for rolling out new workflows safely.

## 7. Observability
- Structured logging (Winston) with correlation IDs.
- Metrics via Prometheus/OpenTelemetry (queue depth, send latency, webhook throughput).
- Alerting for WhatsApp API errors, delayed deliveries, high failure workflows.
- Internal status page summarizing provider health, webhook backlog, intelligence freshness.

## 8. Deployment Targets
- **App Backend**: Fly.io, Render, or AWS (Fargate/Lambda) depending on latency/budget.
- **Redis/Queue**: Upstash or AWS Elasticache.
- **Database**: Neon, Supabase, or RDS.
- **Warehouse**: MotherDuck (serverless DuckDB) for quick start, scale to BigQuery if needed.
- **Internal Portal**: Separate deployment (Vercel/Netlify) with VPN/SAML auth in later phase.

---
This architecture map aligns engineering, infra, and intelligence requirements before build starts.