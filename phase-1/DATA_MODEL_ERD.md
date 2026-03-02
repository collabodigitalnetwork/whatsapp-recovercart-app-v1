# Data Model & ERD – WhatsApp RecoverCart (Phase 1)

> Textual ERD + schema notes for Prisma + analytics warehouse

## 1. Entities Overview
```
Shop (1) ──< ShopSettings (1:1)
   │
   ├──< ShopUser
   ├──< Template
   ├──< Segment
   ├──< Cart
   │       ├──< CartItem
   │       └──< RecoveryWorkflow
   │                 └──< RecoveryStep
   │                         └──< MessageLog
   ├──< Order
   │       └──< Delivery
   │               └──< DeliveryEvent
   ├──< WhatsAppMessage
   └──< AnalyticsSnapshot
```

## 2. Operational Database (Prisma) Schema Notes

### Shop & Settings
```prisma
model Shop {
  id                  String   @id
  myshopifyDomain     String   @unique
  accessToken         String
  plan                ShopPlan
  installedAt         DateTime
  lastSeenAt          DateTime
  settings            ShopSettings?
  users               ShopUser[]
  templates           Template[]
  segments            Segment[]
  carts               Cart[]
  orders              Order[]
  whatsappMessages    WhatsAppMessage[]
}

model ShopSettings {
  id                    String  @id @default(cuid())
  shopId                String  @unique
  whatsappEnabled       Boolean @default(false)
  whatsappPhoneNumberId String?
  businessAccountId     String?
  messageLimitPerDay    Int     @default(3)
  timezone              String
  defaultLanguage       String  @default("en")
  features              Json
  shop                  Shop    @relation(fields: [shopId], references: [id])
}
```

### Users & Cohorts
```prisma
model ShopUser {
  id        String   @id @default(cuid())
  shopId    String
  email     String
  role      ShopUserRole // owner, manager, ops
  lastLogin DateTime?
  shop      Shop     @relation(fields: [shopId], references: [id])
}

model Segment {
  id        String   @id @default(cuid())
  shopId    String
  name      String
  definition Json     // rules DSL
  audienceSize Int?
  updatedAt DateTime
  shop      Shop     @relation(fields: [shopId], references: [id])
}
```

### Carts & Recovery
```prisma
model Cart {
  id             String   @id
  shopId         String
  checkoutId     String   @unique
  customerId     String?
  customerEmail  String?
  customerPhone  String?
  currency       String
  subtotal       Decimal
  abandonedAt    DateTime
  recoveredAt    DateTime?
  status         CartStatus // open, recovered, expired
  metadata       Json?
  items          CartItem[]
  workflow       RecoveryWorkflow?
  shop           Shop      @relation(fields: [shopId], references: [id])
}

model CartItem {
  id        String   @id @default(cuid())
  cartId    String
  productId String
  title     String
  quantity  Int
  price     Decimal
  cart      Cart     @relation(fields: [cartId], references: [id])
}

model RecoveryWorkflow {
  id        String   @id @default(cuid())
  cartId    String   @unique
  shopId    String
  templateVersion String
  rules     Json    // delay rules, incentives
  status    WorkflowStatus
  steps     RecoveryStep[]
  shop      Shop    @relation(fields: [shopId], references: [id])
  cart      Cart    @relation(fields: [cartId], references: [id])
}

model RecoveryStep {
  id            String   @id @default(cuid())
  workflowId    String
  sequence      Int
  scheduledAt   DateTime
  executedAt    DateTime?
  channel       RecoveryChannel // whatsapp, email (future)
  incentive     Json?
  status        StepStatus
  messageLogs   MessageLog[]
  workflow      RecoveryWorkflow @relation(fields: [workflowId], references: [id])
}
```

### Messaging & Templates
```prisma
model Template {
  id          String   @id @default(cuid())
  shopId      String
  name        String
  category    TemplateCategory // marketing, utility, auth
  body        String
  language    String
  variables   Json
  approved    Boolean @default(false)
  latestMeta  Json?
  createdBy   String?
  updatedAt   DateTime
  shop        Shop    @relation(fields: [shopId], references: [id])
}

model MessageLog {
  id              String   @id @default(cuid())
  recoveryStepId  String?
  whatsappMessageId String?
  metadata        Json
  responsePayload Json?
  createdAt       DateTime
  recoveryStep    RecoveryStep? @relation(fields: [recoveryStepId], references: [id])
}

model WhatsAppMessage {
  id              String   @id @default(cuid())
  shopId          String
  wabaMessageId   String   @unique
  toPhoneNumber   String
  templateName    String?
  body            String
  variables       Json?
  status          WhatsAppStatus // queued, sent, delivered, read, replied, failed
  failureReason   String?
  context         MessageContext
  sentAt          DateTime
  updatedAt       DateTime
  shop            Shop     @relation(fields: [shopId], references: [id])
}
```

### Orders & Delivery
```prisma
model Order {
  id             String   @id
  shopId         String
  shopifyOrderId String   @unique
  cartId         String?
  customerId     String?
  totalPrice     Decimal
  currency       String
  status         OrderStatus
  placedAt       DateTime
  fulfillmentStatus String?
  deliveries     Delivery[]
  shop           Shop     @relation(fields: [shopId], references: [id])
}

model Delivery {
  id             String   @id @default(cuid())
  orderId        String
  carrier        String
  trackingNumber String
  trackingUrl    String?
  estimatedAt    DateTime?
  latestStatus   DeliveryStatus
  lastStatusAt   DateTime?
  metadata       Json?
  events         DeliveryEvent[]
  order          Order    @relation(fields: [orderId], references: [id])
}

model DeliveryEvent {
  id          String   @id @default(cuid())
  deliveryId  String
  status      DeliveryStatus
  rawPayload  Json
  occurredAt  DateTime
  delivery    Delivery  @relation(fields: [deliveryId], references: [id])
}
```

### Analytics Snapshots
```prisma
model AnalyticsSnapshot {
  id            String   @id @default(cuid())
  shopId        String
  date          DateTime
  metric        String
  value         Float
  dimension     Json?
  shop          Shop     @relation(fields: [shopId], references: [id])
}
```

## 3. Event Log Schema (for intelligence pipeline)
```
EventLog
- id (uuid)
- eventType (cart_abandoned, message_sent, delivery_delayed, order_created, etc.)
- occurredAt (ts)
- shopId
- customerHash (hashed identifier)
- payload (JSONB)
- ingestionSource (shopify, whatsapp, carrier)
```

## 4. Warehouse Models (dbt-style)
- `dim_shop`, `dim_product`, `dim_customer` (hashed IDs)
- `fact_cart_events`
- `fact_message_performance`
- `fact_delivery_events`
- `fact_revenue_attribution`
- `mart_cohort_metrics`
- `mart_market_benchmarks`

## 5. Intelligence Feature Store Concepts
| Feature | Source | Purpose |
|---------|--------|---------|
| `cart_recovery_probability` | fact_cart_events + message performance | Prioritize high-lift carts |
| `customer_send_time_score` | message engagement history | Optimize timing |
| `delivery_risk_score` | delivery events + carrier reliability | Trigger proactive outreach |
| `segment_clv_projection` | order history + cohort stats | Identify VIP segments |
| `market_trend_index` | aggregated benchmark metrics | Power internal insights |

## 6. Data Contract Highlights
- **Cart Events**: `checkout_id`, `customer`, `line_items`, `subtotal`, `abandoned_at` (ISO8601)
- **WhatsApp Events**: `message_id`, `template`, `status`, `timestamp`, `error_code`
- **Delivery Events**: `carrier`, `tracking_number`, `status`, `location`, `eta`
- **Orders**: `order_id`, `cart_id`, `total_price`, `financial_status`
- All payloads stored raw in S3 for reprocessing.

---
This ERD enables both the operational app (Prisma) and analytics/intelligence layer alignment before code is written.