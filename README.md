# WhatsApp RecoverCart - Shopify App

Turn WhatsApp into your revenue recovery engine. Automatically recover abandoned carts, send delivery updates, and boost customer engagement through WhatsApp Business messaging.

## Features

- **🛒 Cart Recovery**: Multi-step automated workflows to recover abandoned carts
- **📦 Delivery Tracking**: Real-time shipping updates via WhatsApp
- **📊 Analytics Dashboard**: Track recovery rates, revenue, and message performance
- **🎯 Smart Targeting**: Segment customers and personalize messaging
- **🌐 Multi-language**: Support for multiple languages and regions
- **⚡ Real-time**: Instant WhatsApp notifications powered by webhooks

## Installation

### Prerequisites

- Node.js 20+ 
- Redis (for production)
- WhatsApp Business Account
- Shopify Partner account

### Quick Start

1. Clone the repository
```bash
git clone https://github.com/your-org/whatsapp-recovercart-shopify.git
cd whatsapp-recovercart-shopify
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your credentials
```

4. Run database migrations
```bash
npm run prisma migrate dev
```

5. Start development server
```bash
npm run dev
```

6. In another terminal, start the worker
```bash
npm run worker
```

## Configuration

### WhatsApp Setup

1. Create a WhatsApp Business Account at [business.whatsapp.com](https://business.whatsapp.com)
2. Get your Phone Number ID from Business Manager
3. Generate a permanent access token
4. Configure webhook URL: `https://your-app.com/webhooks/whatsapp`

### Environment Variables

```env
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
WHATSAPP_ACCESS_TOKEN=your_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_id
REDIS_URL=redis://localhost:6379
```

## Usage

### Creating a Recovery Workflow

1. Navigate to **Automation** in the app
2. Click **Create Workflow**
3. Select your template and timing
4. Configure incentives for each step
5. Activate the workflow

### Message Templates

Templates must be approved by WhatsApp before use:

1. Go to **Templates**
2. Create a new template
3. Submit for WhatsApp approval
4. Wait 24-48 hours for approval

### Analytics

View performance metrics:
- Recovery rate
- Revenue recovered
- Message delivery rates
- Customer engagement

## Architecture

- **Frontend**: React Router + Polaris Web Components
- **Backend**: Node.js + Shopify App Bridge
- **Database**: PostgreSQL (Prisma ORM)
- **Queue**: Bull + Redis
- **Messaging**: WhatsApp Business API

## Development

### Project Structure

```
app/
├── routes/          # React Router pages
├── services/        # Business logic
├── components/      # Reusable UI components
├── queues/          # Background job processors
├── lib/             # Utilities
└── types/           # TypeScript definitions
```

### Testing

```bash
npm run test         # Unit tests
npm run test:e2e     # End-to-end tests
npm run typecheck    # Type checking
```

### Deployment

```bash
npm run build
npm run deploy
```

## Support

- Documentation: [docs.whatsapp-recovercart.com](https://docs.whatsapp-recovercart.com)
- Support: support@whatsapp-recovercart.com
- Response time: Within 24 hours

## License

MIT License - see LICENSE file for details

## Security

For security issues, please email security@whatsapp-recovercart.com

---

Built with ❤️ for Shopify merchants