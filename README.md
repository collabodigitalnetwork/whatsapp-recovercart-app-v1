# WhatsApp RecoverCart - Shopify App

A powerful Shopify app for recovering abandoned carts through WhatsApp Business API messages with AI-powered insights and optimization.

## 🚀 Features

- **WhatsApp Cart Recovery**: Automated abandoned cart recovery via WhatsApp
- **AI-Powered Insights**: Smart recommendations and benchmarking
- **A/B Testing Platform**: Optimize messages, timing, and incentives
- **Delivery Tracking**: Keep customers informed about their orders
- **Advanced Analytics**: Real-time performance tracking and reporting
- **Multi-language Support**: Send messages in customer's preferred language

## 📋 Prerequisites

### Shopify App Requirements
- Shopify Partner account
- App created in Partner Dashboard
- API credentials (API key, API secret)

### WhatsApp Business Requirements
- Facebook Business Manager account
- Verified Facebook Business
- WhatsApp Business Account (not regular WhatsApp)
- Phone number not associated with WhatsApp
- Facebook App with WhatsApp Business API product

### Technical Requirements
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Docker (optional, for containerized deployment)

## 🛠️ Setup Instructions

### 1. Clone Repository

```bash
git clone https://github.com/your-org/whatsapp-recovercart-shopify.git
cd whatsapp-recovercart-shopify
npm install
```

### 2. Environment Configuration

Copy the example environment file:
```bash
cp .env.example .env
```

Configure essential variables:

```env
# Shopify App Configuration
SHOPIFY_API_KEY=your_api_key_from_partner_dashboard
SHOPIFY_API_SECRET=your_api_secret_from_partner_dashboard
SHOPIFY_WEBHOOK_SECRET=generated_webhook_secret
SHOPIFY_APP_URL=https://your-app-domain.com
SHOPIFY_SCOPES=read_products,write_products,read_customers,read_orders,write_orders

# Facebook/WhatsApp Configuration
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_random_verify_token
WHATSAPP_API_VERSION=v18.0

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/whatsapp_recovercart

# Redis
REDIS_URL=redis://localhost:6379

# Security (generate secure random strings)
JWT_SECRET=your_jwt_secret_min_32_chars
ENCRYPTION_KEY=your_encryption_key_exactly_32_chars
SESSION_SECRET=your_session_secret
```

### 3. Facebook App Setup

1. Go to [Facebook Developers](https://developers.facebook.com)
2. Create a new app or use existing
3. Add "WhatsApp" product to your app
4. Configure webhook URL: `https://your-app-domain.com/webhooks/whatsapp`
5. Set verify token to match `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
6. Subscribe to webhooks: messages, message_status

### 4. Database Setup

```bash
# Create database
createdb whatsapp_recovercart

# Run migrations
npx prisma migrate deploy

# Seed initial data (optional)
npx prisma db seed
```

### 5. Local Development

```bash
# Start development server
npm run dev

# In another terminal, start the worker
npm run worker

# Access the app
# https://your-ngrok-url.ngrok.io
```

### 6. Shopify App Installation Flow

1. **Create App URL in Partner Dashboard**:
   - App URL: `https://your-app-domain.com`
   - Redirect URL: `https://your-app-domain.com/auth/callback`

2. **Install on Development Store**:
   - Go to your app in Partner Dashboard
   - Click "Test on development store"
   - Select a store and install

3. **OAuth Flow**:
   - App redirects to Shopify for authorization
   - Merchant approves requested scopes
   - Redirect back to `/auth/callback`
   - App stores access token

4. **WhatsApp Setup** (Post-Installation):
   - Merchant lands on onboarding page
   - Clicks "Connect WhatsApp Business"
   - OAuth flow with Facebook/WhatsApp
   - Selects WhatsApp Business Account
   - Configuration stored encrypted

## 🚀 Production Deployment

### Using Docker

```bash
# Build production image
docker build -t whatsapp-recovercart .

# Run with docker-compose
docker-compose up -d
```

### Using Kubernetes

```bash
# Apply configurations
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n production
```

### Manual Deployment

```bash
# Build for production
npm run build

# Run migrations
NODE_ENV=production npx prisma migrate deploy

# Start production server
NODE_ENV=production npm start
```

## 📊 Monitoring & Maintenance

### Health Checks
- Main app: `https://your-app-domain.com/health`
- Detailed: `https://your-app-domain.com/health?detailed=true`

### Logs
- Application logs: Structured JSON format
- Access logs: Nginx/load balancer logs
- Error tracking: Sentry integration

### Performance Monitoring
- Response time targets: <200ms P95
- Database query monitoring
- Redis cache hit rates
- Background job processing times

## 🔒 Security Considerations

1. **Token Storage**: All sensitive tokens are encrypted at rest
2. **Webhook Verification**: All webhooks verify signatures
3. **Rate Limiting**: Prevents abuse and ensures fair usage
4. **Data Privacy**: GDPR-compliant data handling
5. **Access Control**: Role-based permissions

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Load testing
npm run test:load
```

## 📝 API Documentation

### Webhook Endpoints

- `/webhooks/shopify/*` - Shopify webhook handlers
- `/webhooks/whatsapp` - WhatsApp status updates

### Internal APIs

- `/api/shops/current` - Current shop data
- `/api/analytics/*` - Analytics endpoints
- `/api/messages/*` - Message management

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see LICENSE file for details.

## 💬 Support

- Documentation: https://docs.your-app.com
- Email: support@your-app.com
- Slack: https://slack.your-app.com

## 🚨 Common Issues

### WhatsApp Connection Fails
- Ensure Facebook Business is verified
- Check phone number is not used on WhatsApp
- Verify app has WhatsApp product added

### Webhook Signature Errors
- Confirm `FACEBOOK_APP_SECRET` is correct
- Check webhook URL in Facebook app settings
- Verify SSL certificate is valid

### Database Connection Issues
- Check PostgreSQL is running
- Verify connection string format
- Ensure database exists

## 🔄 Version History

- v1.0.0 - Initial release with core features
- v1.1.0 - Added A/B testing platform
- v1.2.0 - Intelligence layer integration
- v1.3.0 - Production optimization