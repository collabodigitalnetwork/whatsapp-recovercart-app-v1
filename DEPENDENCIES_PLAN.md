# Dependencies Plan for WhatsApp RecoverCart App

## 🎯 Approach

We'll use Shopify's official React Router template as our base, then add additional dependencies for WhatsApp integration and other features.

## 📦 Core Dependencies (from Shopify Template)

These come with the template:
```json
{
  "@shopify/shopify-app-react-router": "latest",
  "@shopify/polaris": "latest",
  "@shopify/app-bridge-react": "latest",
  "@shopify/cli": "latest",
  "react": "^18.2.0",
  "react-router": "^6.26.0",
  "react-router-dom": "^6.26.0",
  "vite": "^5.1.0",
  "typescript": "^5.2.2",
  "prisma": "^5.11.0",
  "@prisma/client": "^5.11.0"
}
```

## 🔧 Additional Dependencies We'll Need

### WhatsApp Integration
```json
{
  "axios": "^1.6.0",              // HTTP client for WhatsApp API
  "twilio": "^4.23.0"             // Alternative: if using Twilio for WhatsApp
}
```

### Queue Management
```json
{
  "bull": "^4.12.0",              // Job queue
  "bull-board": "^2.1.3",         // Queue monitoring UI
  "redis": "^4.6.0",              // Redis client
  "ioredis": "^5.3.0"             // Alternative Redis client
}
```

### Database & ORM
```json
{
  "@shopify/shopify-app-session-storage-prisma": "^4.0.0",
  "pg": "^8.11.0"                 // PostgreSQL client (for production)
}
```

### Utilities
```json
{
  "date-fns": "^3.3.0",           // Date manipulation
  "zod": "^3.22.0",               // Schema validation
  "winston": "^3.11.0",           // Logging
  "dotenv": "^16.4.0",            // Environment variables
  "node-cron": "^3.0.3"           // Scheduled tasks
}
```

### Development Dependencies
```json
{
  "@types/node": "^20.11.0",
  "@types/react": "^18.2.0",
  "@types/react-dom": "^18.2.0",
  "eslint": "^8.56.0",
  "prettier": "^3.2.0",
  "vitest": "^1.2.0",              // Testing framework
  "@testing-library/react": "^14.2.0",
  "@playwright/test": "^1.41.0"    // E2E testing
}
```

### Monitoring & Analytics
```json
{
  "@sentry/node": "^7.99.0",      // Error tracking
  "@sentry/react": "^7.99.0",     // React error boundary
  "posthog-node": "^3.6.0"        // Product analytics
}
```

## 🏗️ Installation Steps

### Step 1: Create the Shopify App
```bash
cd ~/.openclaw/workspace
shopify app init whatsapp-recovercart-shopify --template=https://github.com/Shopify/shopify-app-template-react-router
```

### Step 2: Install Core Additional Dependencies
```bash
cd whatsapp-recovercart-shopify
npm install axios bull ioredis date-fns zod winston
```

### Step 3: Install Dev Dependencies
```bash
npm install -D @types/bull vitest @testing-library/react @playwright/test
```

### Step 4: Install Optional Dependencies (based on choices)
```bash
# If using Twilio for WhatsApp
npm install twilio

# If using Sentry for monitoring
npm install @sentry/node @sentry/react

# If using PostHog for analytics
npm install posthog-node
```

## 💡 Dependency Decisions Needed

### 1. WhatsApp Provider
- **Option A**: Direct WhatsApp Business API (requires axios only)
- **Option B**: Twilio WhatsApp (requires twilio SDK)
- **Option C**: MessageBird (requires messagebird SDK)
- **Option D**: Custom abstraction layer

### 2. Database
- **Option A**: PostgreSQL (recommended for production)
- **Option B**: MySQL
- **Option C**: Start with SQLite, migrate later

### 3. Redis Hosting
- **Option A**: Redis Cloud
- **Option B**: AWS ElastiCache
- **Option C**: Upstash (serverless Redis)

### 4. Monitoring
- **Option A**: Sentry (error tracking)
- **Option B**: LogRocket (session replay)
- **Option C**: Custom solution

## 📊 Estimated Package Sizes

- Base Shopify template: ~150MB (with node_modules)
- Additional core deps: ~50MB
- Optional deps: ~30MB
- **Total**: ~230MB

## 🚀 Ready to Proceed?

Once you approve, I'll:
1. Create the app using Shopify CLI
2. Install all necessary dependencies
3. Set up the initial project structure
4. Configure TypeScript, ESLint, and Prettier
5. Create the base configuration files

**Should I proceed with creating the app and installing these dependencies?**