# UI & UX Plan – WhatsApp RecoverCart (Phase 1)

## 1. Design Principles
1. **Polaris Native**: Only Shopify Polaris web components (`<s-*>`), consistent with admin.
2. **Actionable by Default**: Every metric should have a relevant CTA (e.g., “Recover remaining carts”).
3. **Progressive Disclosure**: Keep primary view simple, reveal detail via expandable cards/drawers.
4. **Responsive & Embedded**: Optimized for Shopify desktop + mobile app.
5. **Trust & Transparency**: Show exact message content, timestamps, and compliance state.

## 2. Core Screens & Flows

### 2.1 Dashboard (`app._index.tsx`)
- **Hero KPI strip**: Recovered revenue (primary), recovery rate, send success rate, delivery SLA.
- **Recovery Funnel**: Visualization of carts → messages → recovered.
- **Action Cards**:
  - “Carts pending follow-up” with CTA to view.
  - “Delivery delays detected” with CTA to message affected orders.
  - “Template opportunity” suggesting new workflow or A/B test.
- **Sidebar**:
  - Quick stats (messages today, upcoming scheduled).
  - Notifications (WhatsApp template approval, webhook health).
  - Getting started checklist for new merchants.

### 2.2 Automation Studio (`app.automation.tsx`)
- **Workflow list view** with status toggles, success metrics.
- **Create/Edit flow** (drawer or full page):
  1. Choose trigger (cart abandoned, order fulfilled, delivery delay).
  2. Select segment or audience.
  3. Configure steps (drag-drop cards): delay, template, incentive, fallback channel.
  4. Preview timeline + compliance warnings.
  5. Test send to self.
- **Template selection** integrated within steps.

### 2.3 Template Library (`app.templates.tsx`)
- Grid/list with filter (category, language, approval status).
- Template detail drawer: body, variables, preview, WhatsApp approval info.
- Quick duplication + edit history.
- CTA to request new template (opens modal with guidance).

### 2.4 Delivery Center (`app.delivery.tsx`)
- **Map/list hybrid view** for shipments grouped by status.
- **Table** showing order, customer, carrier, latest event, risk score.
- **Bulk action**: send reassurance message, escalate to support.
- **Detail panel**: timeline of delivery events, autop-run messages, notes.

### 2.5 Analytics (`app.analytics.tsx`)
- **Tabs**: Recovery, Messaging, Delivery, Cohorts.
- **Visuals**: line charts (time series), stacked bars (workflow performance), heatmaps (send-time success).
- **Segments dropdown** to compare cohorts.
- Export buttons (CSV, Google Sheets, PDF summary).

### 2.6 Settings (`app.settings.tsx`)
- WhatsApp integration status + reauth controls.
- Message limit sliders, quiet hours, languages.
- Compliance center (opt-in proof, template logs).
- Team access management (Shopify staff scopes + internal roles).

## 3. Interaction Patterns
- **Toasts** via App Bridge for confirmations.
- **Modals** for critical actions (pause workflows, delete templates).
- **Drawers** for details (message log, order tracking) to keep context.
- **Tabs & cards** for organizing data-dense views.
- **Inline alerts** for compliance warnings, quota limits, webhook issues.
- **Skeleton states** for loading around cards/tables.

## 4. Components Inventory (Polaris Web Components)
| Component | Usage |
|-----------|-------|
| `<s-page>` | Layout shell with heading + actions |
| `<s-section>` | Group content; `slot="aside"` for side panels |
| `<s-card>` | KPI cards, workflow cards |
| `<s-stack>` | Spacing management |
| `<s-button>` | Primary/secondary/destructive actions |
| `<s-banner>` | Alerts, warnings |
| `<s-data-table>` | Logs, deliveries |
| `<s-chart>` | (via Polaris Viz web components) metrics |
| `<s-text-field>`, `<s-select>`, `<s-checkbox>` | Forms |
| `<s-empty-state>` | Onboarding blanks |
| `<s-badge>` | Status indicators |
| `<s-progress-bar>` | Workflow progress |
| `<s-tabs>` | Analytics sections |
| `<s-popover>` | Quick filters, template previews |

## 5. Onboarding Journey
1. **Install App** → automatic embedded install.
2. **Welcome Screen** with 3-step checklist: connect WhatsApp, activate templates, launch first workflow.
3. **Guided Tour** (App Bridge modal) highlighting key sections.
4. **Sample data** for empty states (recovery funnel, template preview) until real data flows.
5. **Nudges** for incomplete setup (banner + email).

## 6. Accessibility & Localization
- All controls labeled and keyboard-friendly (Polaris compliance).
- Support for RTL languages (WhatsApp templates in Arabic/Hebrew) – ensure UI handles mirrored layouts.
- Date/time localized to store timezone.
- Currency formatting using Shopify shop context.

## 7. Visual Styling
- Leverage Polaris tokens: spacing (`space-200`, etc.), colors (semantic tokens), typography (Inter).
- Iconography via Polaris icon set (cart, delivery, chat, analytics).
- Avoid custom CSS wherever possible; when needed, scope via `:global(.class)` inside route CSS modules.

## 8. Merchant Feedback Hooks
- Inline “Was this helpful?” micro-feedback on analytics cards.
- Quick survey modal triggered after first recovered cart success.
- Embedded Intercom/Helpscout widget optional.

## 9. Deliverables (Phase 1)
- Low-fidelity wireframes for each core screen.
- Interaction map (click paths between modules).
- Component inventory checklist matched to Polaris docs.
- UX acceptance criteria per flow (e.g., recover workflow creation under 3 clicks per step).

---
This plan ensures the UI feels native in Shopify, prioritizes actions, and sets us up for scalable Polaris-based development.