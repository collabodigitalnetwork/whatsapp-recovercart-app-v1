# Shopify React Router Template - Codebase Structure

## 📁 Directory Structure

```
whatsapp-recovercart-shopify/
├── app/                      # Main application code
│   ├── routes/              # React Router routes
│   │   ├── app.tsx          # Admin layout wrapper
│   │   ├── app._index.tsx   # Dashboard (main page)
│   │   ├── app.*.tsx        # Other app pages
│   │   ├── auth.*.tsx       # Authentication routes
│   │   └── webhooks.*.tsx   # Webhook handlers
│   ├── db.server.ts         # Database connection
│   ├── shopify.server.ts    # Shopify configuration
│   ├── entry.server.tsx     # Server entry point
│   ├── root.tsx            # Root component
│   └── types/              # TypeScript types
├── extensions/              # Shopify app extensions
├── prisma/                  # Database schema
│   ├── schema.prisma       # Prisma schema file
│   └── migrations/         # Database migrations
├── public/                  # Static assets
├── shopify.app.toml        # App configuration
├── shopify.web.toml        # Web server config
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config
└── vite.config.ts          # Vite bundler config
```

## 🔑 Key Files Explained

### 1. **shopify.app.toml**
- Central configuration for your Shopify app
- Defines scopes, webhooks, and app settings
- Must be kept in sync with Partner Dashboard

### 2. **app/shopify.server.ts**
```typescript
// This file configures the Shopify app instance
import { shopifyApp } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  apiVersion: LATEST_API_VERSION,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  future: {
    // Enable new embedded auth strategy
    unstable_newEmbeddedAuthStrategy: true,
  },
});

export default shopify;
export const authenticate = shopify.authenticate;
```

### 3. **app/routes/app.tsx**
- Main layout for all admin pages
- Handles App Bridge initialization
- Provides navigation structure
- Must wrap all `/app/*` routes

### 4. **app/routes/app._index.tsx**
- Dashboard/home page of your app
- Shows when merchant opens your app
- Template includes product creation example

### 5. **app/db.server.ts**
- Prisma client initialization
- Database connection management
- Ensures single instance in development

### 6. **prisma/schema.prisma**
- Database schema definition
- Default includes Session model
- Add your own models here

## 📝 Coding Standards & Patterns

### 1. **File Naming**
- Routes: `app.{feature}.tsx` for admin pages
- Webhooks: `webhooks.{topic}.tsx`
- Server utilities: `{name}.server.ts`
- Components: PascalCase `ComponentName.tsx`

### 2. **Route Structure**
```typescript
// Standard admin route pattern
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Loader - runs on page load
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  // Fetch data
  return { data };
};

// Action - handles form submissions
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  
  // Process form data
  const formData = await request.formData();
  
  // Perform mutations
  return { success: true };
};

// Component
export default function FeaturePage() {
  const { data } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  
  return (
    <s-page heading="Feature">
      {/* Page content */}
    </s-page>
  );
}

// Required for embedded apps
export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
```

### 3. **GraphQL Queries**
```typescript
// Use tagged template literals for GraphQL
const response = await admin.graphql(
  `#graphql
    query getProducts($first: Int!) {
      products(first: $first) {
        edges {
          node {
            id
            title
          }
        }
      }
    }
  `,
  {
    variables: {
      first: 10,
    },
  }
);

const data = await response.json();
```

### 4. **Webhook Handlers**
```typescript
// app/routes/webhooks.carts.update.tsx
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

  if (!admin) {
    throw new Response("Unauthorized", { status: 401 });
  }

  // Process webhook
  await processAbandonedCart(payload);

  return new Response("OK", { status: 200 });
};
```

### 5. **Environment Variables**
```env
# Required Shopify variables
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SCOPES=read_products,write_products
SHOPIFY_APP_URL=https://your-app.com

# Database
DATABASE_URL=file:dev.sqlite

# WhatsApp Integration (our addition)
WHATSAPP_BUSINESS_ID=your_business_id
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_id

# Redis for queue
REDIS_URL=redis://localhost:6379
```

### 6. **TypeScript Types**
```typescript
// app/types/index.ts
export interface Shop {
  id: string;
  domain: string;
  accessToken: string;
  whatsappEnabled: boolean;
}

export interface AbandonedCart {
  id: string;
  shopId: string;
  cartToken: string;
  customerEmail?: string;
  customerPhone?: string;
  abandonedAt: Date;
  recoveryMessageSent: boolean;
}
```

## 🎨 Polaris Web Components Usage

### 1. **Page Layout**
```tsx
<s-page 
  heading="WhatsApp Recovery"
  narrowWidth={false}
>
  <s-button slot="primary-action" onClick={handleAction}>
    Primary Action
  </s-button>
  
  <s-section heading="Main Content">
    {/* Section content */}
  </s-section>
  
  <s-section slot="aside" heading="Help">
    {/* Sidebar content */}
  </s-section>
</s-page>
```

### 2. **Forms**
```tsx
<s-form onSubmit={handleSubmit}>
  <s-stack direction="block" gap="loose">
    <s-text-field
      label="WhatsApp Number"
      value={phoneNumber}
      onChange={setPhoneNumber}
      type="tel"
      required
    />
    <s-button submit>Save</s-button>
  </s-stack>
</s-form>
```

### 3. **Data Display**
```tsx
<s-data-table
  columnContentTypes={['text', 'text', 'numeric', 'text']}
  headings={['Customer', 'Phone', 'Cart Value', 'Status']}
  rows={cartData}
  footerContent={`${carts.length} abandoned carts`}
/>
```

## 🔧 Development Workflow

### 1. **Start Development**
```bash
npm run dev
# or
shopify app dev
```

### 2. **Database Migrations**
```bash
# Create migration
npm run prisma migrate dev --name add_carts_table

# Apply migrations
npm run prisma migrate deploy

# Open Prisma Studio
npm run prisma studio
```

### 3. **GraphQL Code Generation**
```bash
npm run graphql-codegen
```

### 4. **Type Checking**
```bash
npm run typecheck
```

### 5. **Linting**
```bash
npm run lint
```

## 📦 Adding New Features

### 1. **New Admin Page**
1. Create `app/routes/app.feature.tsx`
2. Add navigation link in `app/routes/app.tsx`
3. Follow the route pattern above

### 2. **New Webhook**
1. Create `app/routes/webhooks.topic.subtopic.tsx`
2. Add to `shopify.app.toml`
3. Implement action handler

### 3. **New Database Model**
1. Add to `prisma/schema.prisma`
2. Run migration
3. Create TypeScript types

### 4. **New Component**
1. Create in `app/components/`
2. Use Polaris web components
3. Export from index file

## 🚀 Best Practices

1. **Always authenticate routes** - Use `authenticate.admin()`
2. **Use TypeScript** - Define all types
3. **Handle errors gracefully** - Show merchant-friendly messages
4. **Follow Polaris patterns** - Consistency is key
5. **Test webhooks locally** - Use ngrok for local testing
6. **Log important events** - But don't log sensitive data
7. **Optimize GraphQL queries** - Only request needed fields
8. **Use React Router patterns** - Loaders for data, actions for mutations

## 🔒 Security Considerations

1. **Never expose API credentials** in client code
2. **Always validate webhook signatures**
3. **Sanitize user inputs**
4. **Use CSRF protection** (built-in with authenticate)
5. **Implement rate limiting** for API calls
6. **Store sensitive data encrypted**

This structure and these patterns ensure your app follows Shopify's standards and can scale effectively.