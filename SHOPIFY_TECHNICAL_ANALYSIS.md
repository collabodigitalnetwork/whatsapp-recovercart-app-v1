# Shopify App Technical Analysis - Key Findings

## 🚨 Critical Update: Framework Change

Shopify has **officially moved away from Remix** to **React Router** as their recommended framework for building Shopify apps. This is a significant change that affects our architectural decisions.

## 📋 Key Technical Requirements from Documentation

### 1. **Framework Choice**
```
❌ OLD: @shopify/shopify-app-remix (being phased out)
✅ NEW: @shopify/shopify-app-react-router (recommended)
```

**Migration Guide Available:** https://github.com/Shopify/shopify-app-template-react-router/wiki/Upgrading-from-Remix

### 2. **Authentication Architecture**

#### New Embedded App Strategy (Recommended)
- **Shopify Managed Installation** - No more OAuth redirects!
- **Token Exchange** - Replaces authorization code flow
- **No-redirect OAuth flow** - Better UX for merchants
- **Automatic scope updates** - Shopify handles it

#### Implementation:
```typescript
// Enable in shopify.server.ts
const shopify = shopifyApp({
  // ... other config
  future: {
    unstable_newEmbeddedAuthStrategy: true
  }
});
```

### 3. **Required Components**

#### a. App Configuration (shopify.server.ts)
```typescript
import { shopifyApp } from '@shopify/shopify-app-react-router/server';

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  appUrl: process.env.SHOPIFY_APP_URL!,
  apiVersion: ApiVersion.July25,
  sessionStorage: new PrismaSessionStorage(prisma),
  future: {
    unstable_newEmbeddedAuthStrategy: true
  }
});
```

#### b. App Provider (for embedding)
```tsx
import { AppProvider } from '@shopify/shopify-app-react-router/react';

<AppProvider embedded apiKey={apiKey}>
  {/* Your app content */}
</AppProvider>
```

#### c. Required Headers
```typescript
// For CSP compliance
export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
```

### 4. **Routing Structure**

#### Admin Routes (embedded in Shopify)
- Must be prefixed with `app.` (e.g., `app.products.tsx`)
- Must be under admin layout route
- Automatically handles authentication

#### Webhook Routes
- Must NOT be under app layout
- Separate authentication flow
- Example: `/webhooks.app.product_updated.tsx`

### 5. **API Interactions**

#### GraphQL (Preferred)
```typescript
const response = await admin.graphql(
  `#graphql
    mutation createProduct($product: ProductCreateInput!) {
      productCreate(product: $product) {
        product { id }
      }
    }`,
  { variables: { product: { title: 'Test' } } }
);
```

### 6. **Session Storage Options**
- Prisma + SQLite (default template)
- PostgreSQL
- MySQL
- MongoDB
- Redis
- Memory (development only)

### 7. **App Bridge Integration**
- Required for embedded apps
- Handles navigation
- Provides UI components
- Manages app state

## 🏗️ Recommended Architecture for WhatsApp RecoverCart

### Tech Stack Decision
```yaml
Framework: React Router (not Remix!)
UI: Shopify Polaris + App Bridge React
Backend: Node.js + TypeScript
Database: PostgreSQL (for production scale)
Session Storage: Prisma
API: GraphQL (Shopify preferred)
Hosting: Vercel or AWS
Queue: Bull + Redis
```

### File Structure
```
whatsapp-recovercart-app-v1/
├── app/
│   ├── routes/
│   │   ├── app.tsx              # Admin layout
│   │   ├── app._index.tsx       # Dashboard
│   │   ├── app.settings.tsx     # Settings
│   │   ├── app.analytics.tsx    # Analytics
│   │   └── webhooks.*.tsx       # Webhook handlers
│   ├── shopify.server.ts        # Shopify config
│   ├── db.server.ts            # Database
│   └── whatsapp.server.ts      # WhatsApp integration
├── prisma/
│   └── schema.prisma
└── package.json
```

### Authentication Flow (New Strategy)
1. Merchant clicks install
2. Shopify handles installation automatically
3. App uses token exchange for API access
4. No OAuth redirects needed!

## ⚠️ Critical Compliance Points

### 1. **Must Use App Bridge**
```tsx
import { NavMenu, TitleBar } from "@shopify/app-bridge-react";
```

### 2. **CSP Headers Required**
```typescript
export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
```

### 3. **Error Boundaries**
```typescript
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
```

### 4. **Session Token Authentication**
- No API keys in frontend
- Use authenticate.admin for all routes
- Webhook routes use authenticate.webhook

### 5. **Embedded App Requirements**
- Must render inside Shopify Admin
- Use AppProvider with embedded=true
- Follow Polaris design system

## 📊 Development Approach

### Phase 1: Foundation
1. Set up React Router app template
2. Configure authentication
3. Implement session storage
4. Create base routes

### Phase 2: Core Features
1. Webhook handlers for cart events
2. WhatsApp API integration
3. Message queue system
4. Basic dashboard

### Phase 3: Polish
1. Analytics and reporting
2. Advanced settings
3. Performance optimization
4. Testing suite

## 🎯 Next Steps

1. **Use the official template**
   ```bash
   shopify app init --template=https://github.com/Shopify/shopify-app-template-react-router
   ```

2. **Enable new auth strategy**
3. **Follow Shopify's patterns exactly**
4. **Use GraphQL for all API calls**
5. **Implement proper error handling**

## ❌ What NOT to Do

1. Don't use Remix (it's being phased out)
2. Don't skip App Bridge integration
3. Don't use REST when GraphQL is available
4. Don't implement custom OAuth flows
5. Don't ignore CSP requirements

## 📚 Essential Resources

- [React Router Template](https://github.com/Shopify/shopify-app-template-react-router)
- [Migration Guide from Remix](https://github.com/Shopify/shopify-app-template-react-router/wiki/Upgrading-from-Remix)
- [App Bridge Documentation](https://shopify.dev/docs/api/app-bridge)
- [Polaris Components](https://polaris.shopify.com/)
- [GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql)

---

**Key Takeaway:** We must use React Router (not Remix) and follow Shopify's new embedded app authentication strategy for the best merchant experience and future compatibility.