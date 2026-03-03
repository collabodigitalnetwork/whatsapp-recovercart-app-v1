# Polaris UI/UX Guide for WhatsApp RecoverCart App

## 🎨 Polaris Web Components

This app uses **Polaris Web Components** (not React components), which is Shopify's latest approach for embedded apps.

### Key Components Used

```html
<!-- Page Layout -->
<s-page heading="Page Title">
  <s-button slot="primary-action">Primary Action</s-button>
  
  <!-- Main Content -->
  <s-section heading="Section Title">
    <s-paragraph>Content here</s-paragraph>
  </s-section>
  
  <!-- Sidebar -->
  <s-section slot="aside" heading="Sidebar">
    <!-- Sidebar content -->
  </s-section>
</s-page>

<!-- Common Components -->
<s-button onClick={handleClick}>Button</s-button>
<s-link href="/path">Link</s-link>
<s-text>Text content</s-text>
<s-heading>Heading</s-heading>
<s-stack direction="inline" gap="base">Stacked content</s-stack>
<s-box padding="base" background="subdued">Box content</s-box>
<s-card>Card content</s-card>
<s-banner tone="critical">Error message</s-banner>
<s-badge tone="success">Active</s-badge>
```

## 📐 UI/UX Best Practices

### 1. **Page Structure**
```tsx
<s-page heading="Dashboard">
  {/* Primary action in header */}
  <s-button slot="primary-action" onClick={handleSave}>
    Save changes
  </s-button>
  
  {/* Main content area */}
  <s-section heading="Abandoned Carts">
    {/* Content sections */}
  </s-section>
  
  {/* Sidebar for secondary info */}
  <s-section slot="aside" heading="Quick Stats">
    {/* Stats, help, etc */}
  </s-section>
</s-page>
```

### 2. **Typography Hierarchy**
- Page heading: Use `heading` prop on `<s-page>`
- Section headings: Use `heading` prop on `<s-section>`
- Subsection: Use `<s-heading>`
- Body text: Use `<s-paragraph>` or `<s-text>`
- Links: Always use `<s-link>` with appropriate target

### 3. **Button Patterns**
```tsx
{/* Primary action - most important */}
<s-button variant="primary" onClick={handleSubmit}>
  Send Message
</s-button>

{/* Secondary actions */}
<s-button onClick={handleCancel}>
  Cancel
</s-button>

{/* Destructive actions */}
<s-button variant="plain" tone="critical" onClick={handleDelete}>
  Delete
</s-button>

{/* Loading state */}
<s-button loading={isLoading}>
  Processing...
</s-button>
```

### 4. **Forms**
```tsx
<s-form onSubmit={handleSubmit}>
  <s-stack direction="block" gap="loose">
    <s-text-field 
      label="Store Name" 
      value={storeName}
      onChange={setStoreName}
      required
    />
    
    <s-select
      label="Message Delay"
      options={delayOptions}
      value={delay}
      onChange={setDelay}
    />
    
    <s-checkbox
      label="Enable cart recovery"
      checked={enabled}
      onChange={setEnabled}
    />
  </s-stack>
</s-form>
```

### 5. **Data Display**
```tsx
{/* Tables for structured data */}
<s-data-table
  columnContentTypes={['text', 'numeric', 'text', 'text']}
  headings={['Customer', 'Cart Value', 'Status', 'Actions']}
  rows={tableData}
/>

{/* Cards for grouped content */}
<s-card>
  <s-stack direction="block" gap="base">
    <s-heading>Recovery Stats</s-heading>
    <s-text>25% recovery rate this month</s-text>
  </s-stack>
</s-card>
```

### 6. **Empty States**
```tsx
<s-empty-state
  heading="No abandoned carts yet"
  image="/empty-cart.svg"
>
  <s-paragraph>
    When customers abandon their carts, they'll appear here.
  </s-paragraph>
  <s-button url="/app/settings">
    Configure settings
  </s-button>
</s-empty-state>
```

### 7. **Loading & Feedback**
```tsx
{/* Loading states */}
{isLoading ? (
  <s-spinner />
) : (
  <YourContent />
)}

{/* Success feedback */}
useEffect(() => {
  if (success) {
    shopify.toast.show("Settings saved successfully");
  }
}, [success, shopify]);

{/* Error handling */}
{error && (
  <s-banner tone="critical" onDismiss={() => setError(null)}>
    {error.message}
  </s-banner>
)}
```

### 8. **Navigation**
```tsx
{/* App navigation in app.tsx */}
<NavMenu>
  <Link to="/app" rel="home">Dashboard</Link>
  <Link to="/app/settings">Settings</Link>
  <Link to="/app/analytics">Analytics</Link>
</NavMenu>
```

## 🎨 Visual Design Principles

### 1. **Spacing**
- Use consistent gap values: `none`, `extra-tight`, `tight`, `base`, `loose`, `extra-loose`
- Card padding: typically `base` or `loose`
- Section spacing: `loose` or `extra-loose`

### 2. **Colors**
- Use semantic tones: `success`, `warning`, `critical`, `info`
- Background options: `default`, `subdued`, `surface`
- Let Polaris handle dark mode automatically

### 3. **Responsive Design**
- Components are mobile-first by default
- Use `direction="inline"` for horizontal layouts on desktop
- Test on Shopify Mobile app

### 4. **Accessibility**
- All interactive elements have proper labels
- Use semantic HTML elements
- Keyboard navigation works by default
- Screen reader support built-in

## 📱 Mobile Considerations

### 1. **Touch Targets**
- Buttons have minimum 44px height
- Adequate spacing between interactive elements
- Use `size="large"` for primary mobile actions

### 2. **Information Density**
- Show most important info first
- Use progressive disclosure
- Collapse secondary information on mobile

### 3. **Navigation**
- Use Shopify's mobile nav patterns
- Keep navigation items minimal
- Primary actions always visible

## 🚀 Performance Best Practices

### 1. **Lazy Loading**
```tsx
const Analytics = lazy(() => import('./routes/app.analytics'));
```

### 2. **Optimistic Updates**
```tsx
// Update UI immediately
setLocalState(newValue);
// Then sync with server
await updateServer(newValue);
```

### 3. **Data Fetching**
- Use React Router's loader pattern
- Implement proper caching
- Show loading states

## 📋 Component Checklist for Our App

### Dashboard Page
- [ ] Page with heading "WhatsApp Recovery"
- [ ] Primary action: "Send Test Message"
- [ ] Stats cards (Recovery Rate, Revenue, Messages)
- [ ] Recent messages table
- [ ] Empty state for new users
- [ ] Sidebar with quick actions

### Settings Page
- [ ] Form with message templates
- [ ] Timing configuration
- [ ] Enable/disable toggles
- [ ] Save button with loading state
- [ ] Success/error feedback

### Analytics Page
- [ ] Date range picker
- [ ] Charts for performance
- [ ] Export functionality
- [ ] Comparison metrics

### Onboarding Flow
- [ ] Step indicator
- [ ] Progressive form
- [ ] Preview of messages
- [ ] Clear CTAs

## 🎯 Key Takeaways

1. **Use Polaris web components** (`<s-*>` tags)
2. **Follow Shopify's patterns** exactly
3. **Prioritize merchant needs** in UI decisions
4. **Keep it simple** - merchants are busy
5. **Mobile-first** design approach
6. **Fast feedback** - show loading/success states
7. **Progressive disclosure** - don't overwhelm
8. **Consistent spacing** and visual hierarchy

This guide ensures our WhatsApp RecoverCart app follows Shopify's latest UI/UX standards and provides an excellent merchant experience.