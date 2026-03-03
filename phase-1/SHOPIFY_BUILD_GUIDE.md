# Shopify Build Guide – RecoverCart (Enterprise-Grade)
> Author perspective: Senior Shopify App Developer (10+ years, top 10 apps)

## 1. Guiding Principles
1. **Template Fidelity**: Start from the official React Router template. Never remove Shopify-provided structure/function signatures unless documented.
2. **Embedded First**: Optimize for Shopify Admin, App Bridge, and Polaris Web Components. Avoid custom UI frameworks.
3. **GraphQL Default**: Use Admin GraphQL for all API interactions (REST only when no GraphQL equivalent).
4. **Secure by Default**: Zero API keys in frontend, strict webhook validation, new embedded auth strategy, per-shop session isolation.
5. **Performance + Observability**: Minimal bundle size, loader/action caching, structured logs, metrics, and error boundaries.
6. **App Store Compliance**: Match Shopify’s “Built for Shopify” checklist (UX, performance, support, data privacy).

## 2. Repository Structure (Required)
```
whatsapp-recovercart-shopify/
├── app/
│   ├── routes/
│   │   ├── app.tsx                # Admin layout (App Bridge, NavMenu)
│   │   ├── app._index.tsx         # Dashboard
│   │   ├── app.settings.tsx       # Settings
│   │   ├── app.delivery.tsx       # Delivery center
│   │   ├── app.analytics.tsx      # Analytics
│   │   ├── webhooks.*.tsx         # Webhook handlers
│   │   └── auth.*.tsx             # Auth flows (shopify.authenticate)
│   ├── shopify.server.ts          # shopifyApp config, auth helpers
│   ├── db.server.ts               # Prisma client
│   ├── services/                  # Business logic modules
│   ├── utils/                     # Shared helpers
│   ├── components/                # Reusable UI (Polaris wrappers)
│   └── types/                     # TS types
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── extensions/                    # App extensions (if any)
├── public/
├── package.json
├── shopify.app.toml               # Scopes, webhook config
├── shopify.web.toml               # Dev server config
├── .env.example
└── docs/
    ├── README.md
    ├── DEPLOYMENT.md
    ├── TESTING.md
    ├── SUPPORT.md
    └── SECURITY.md
```

## 3. shopify.server.ts Configuration
```ts
import { shopifyApp } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import db from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  apiVersion: "2025-01",
  scopes: process.env.SCOPES?.split(",")!,
  appUrl: process.env.SHOPIFY_APP_URL!,
  sessionStorage: new PrismaSessionStorage(db),
  authPathPrefix: "/auth",
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    unstable_newBorderlessMode: true,
  },
  hooks: {
    afterAuth: async ({ session }) => {
      // Register webhooks, ensure shop metadata, etc.
    },
  },
});

export default shopify;
export const authenticate = shopify.authenticate;
```
- Always enable `unstable_newEmbeddedAuthStrategy` to use token exchange.
- Register mandatory webhooks on install (`app/uninstalled`, `app/scopes_update`).
- Store shop metadata (plan, email) for support contact.

## 4. Route Conventions
| Route Type | File Pattern | Notes |
|------------|--------------|-------|
| Admin Pages | `app*.tsx` | Export `loader`, `action`, `default`, `headers` | 
| Webhooks | `webhooks.<topic>.tsx` | Only export `action`, use `authenticate.webhook` |
| Auth | `auth.*.tsx` | `authenticate.callback` helpers |
| API Utility | `api.*.tsx` | Optional for background tasks via fetcher |

### Example Loader/Action Pattern
```ts
export const loader = async ({ request }: LoaderArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const data = await admin.graphql(`...`);
  return typedjson({ data });
};

export const action = async ({ request }: ActionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  // mutate
  return null;
};

export default function Screen() {
  const { data } = useTypedLoaderData<typeof loader>();
  const actionData = useTypedActionData<typeof action>();
  return <s-page>...</s-page>;
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
```
- Use `typedjson` (from `@shopify/shopify-app-react-router`) for loader data to keep types.
- Always return `boundary.headers` for embedded compliance.
- Use `useFetcher` for POST actions to avoid full navigation.

## 5. Webhook Handling
```ts
export const action = async ({ request }: ActionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  switch (topic) {
    case "CHECKOUTS_UPDATE":
      await handleCheckoutUpdate(payload);
      break;
    default:
      throw new Response("Unhandled webhook", { status: 400 });
  }

  return new Response(null, { status: 200 });
};
```
- Use `authenticate.webhook` for signature verification.
- Respond within 5 seconds; offload heavy work to queue.
- Idempotency: use `payload.id` with `upsert` to avoid duplicates.
- Log event to queue/event bus for intelligence layer.

## 6. Messaging & Queues
- Use Bull and Redis for scheduling multi-step workflows.
- Queue naming: `recovercart:<shopId>:workflow` for isolation.
- Rate limit per WhatsApp policy (1 msg/sec per number, respect tier).
- Retry strategy: exponential backoff, max attempts 5, log to support.

## 7. Configuration & Environment
- `.env.example` must list all required env vars.
- Validate env at boot (e.g., zod schema) – fail fast if missing.
- Use Secrets Manager or Doppler in production (no .env deployments).

## 8. Documentation Required (for BFS tag)
1. **README.md**: Overview, install instructions, dev commands.
2. **ARCHITECTURE.md**: Runtime stack, data flow, third parties.
3. **SECURITY.md**: Data storage, encryption, access controls, incident contact.
4. **PRIVACY.md**: Data usage, retention, merchant responsibilities.
5. **SUPPORT.md**: Hours, response times, escalation.
6. **RELEASE_NOTES.md**: Version history, breaking changes.
7. **TESTING.md**: Coverage strategy, manual QA checklist.
8. **BFS_CHECKLIST.md**: Explicit mapping to Shopify “Built for Shopify” requirements (UX, performance, support, quality).

## 9. Built for Shopify (BFS) Checklist Highlights
- **Fast load** (<2s on first render, <1s subsequent) – optimize bundle, prefetch data.
- **Polaris styling** only; no custom fonts.
- **Embedded nav** (NavMenu) with translation support.
- **Data portability**: merchants can export their data via CSV.
- **Support readiness**: 24h response SLA, “Need help?” link to docs.
- **Error handling**: user-friendly messages + retry options.
- **Accessibility**: ensure ARIA compliance; Polaris web components already accessible – don’t break it.

## 10. Code Quality Practices
- ESLint + Prettier pre-commit.
- TypeScript strict mode.
- Domain-driven foldering (services per feature, not by layer only).
- Tests:
  - Unit: services (Vitest).
  - Integration: webhook flows, queue workers (Vitest + msw).
  - E2E: Playwright connecting to Shopify dev store.
- Feature flags for beta features (env or LaunchDarkly) – avoid shipping hidden logic.

## 11. Release Management
- Conventional commits + semantic versioning.
- CI pipeline: lint, test, build, typecheck.
- Staging environment hitting Shopify dev store before production.
- Rollback plan (keep previous build artifacts, DB migrations reversible).

## 12. Operational Excellence
- Monitoring dashboards (queue depth, message throughput, webhook latency).
- Error alerts to Slack/email with context (shop, shopify_domain, Shopify trace ID).
- Support runbooks for common failures (WhatsApp template rejection, webhook throttling, DB failover).
- Data retention policy documented (e.g., purge raw message content after X days).

## 13. Do/Do Not Summary
**Do:**
- Mirror Shopify coding patterns.
- Keep merchant experience simple + trustworthy.
- Document every integration and dependency.
- Build internal tooling for fast support.

**Do Not:**
- Expose non-Polaris UI.
- Run arbitrary scripts on merchant storefronts (stay in admin scope).
- Store customer PII unencrypted.
- Depend on unstable Shopify APIs without fallbacks.

---
This guide is the reference playbook during build to ensure we meet Shopify’s highest bar and breeze through the Built for Shopify review.