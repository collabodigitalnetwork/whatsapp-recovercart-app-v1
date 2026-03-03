import type { LoaderFunctionArgs } from "react-router";
import { Link } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // This is the landing page for app installation
  // Shopify will redirect here when merchants click "Add app"
  return null;
};

export default function Index() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.4" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
        <header style={{ textAlign: "center", marginBottom: "4rem" }}>
          <h1 style={{ fontSize: "3rem", marginBottom: "1rem", color: "#212529" }}>
            WhatsApp RecoverCart
          </h1>
          <p style={{ fontSize: "1.5rem", color: "#6c757d", marginBottom: "2rem" }}>
            Recover Abandoned Carts with WhatsApp Messages
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
            <Link
              to="/auth/install"
              style={{
                backgroundColor: "#007bff",
                color: "white",
                padding: "1rem 2rem",
                borderRadius: "0.5rem",
                textDecoration: "none",
                fontSize: "1.125rem",
                display: "inline-block",
              }}
            >
              Install App
            </Link>
            <a
              href="https://docs.your-app.com"
              style={{
                backgroundColor: "transparent",
                color: "#007bff",
                padding: "1rem 2rem",
                borderRadius: "0.5rem",
                textDecoration: "none",
                fontSize: "1.125rem",
                display: "inline-block",
                border: "2px solid #007bff",
              }}
            >
              View Documentation
            </a>
          </div>
        </header>

        <section style={{ marginBottom: "4rem" }}>
          <h2 style={{ fontSize: "2rem", marginBottom: "2rem", textAlign: "center" }}>
            Why Choose WhatsApp RecoverCart?
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" }}>
            <div style={{ padding: "2rem", backgroundColor: "#f8f9fa", borderRadius: "0.5rem" }}>
              <h3 style={{ marginBottom: "1rem", color: "#212529" }}>📱 98% Open Rate</h3>
              <p style={{ color: "#6c757d" }}>
                WhatsApp messages have the highest open rates compared to email and SMS, ensuring your recovery messages get seen.
              </p>
            </div>
            <div style={{ padding: "2rem", backgroundColor: "#f8f9fa", borderRadius: "0.5rem" }}>
              <h3 style={{ marginBottom: "1rem", color: "#212529" }}>🤖 AI-Powered Insights</h3>
              <p style={{ color: "#6c757d" }}>
                Get intelligent recommendations on timing, messaging, and incentives based on your customer behavior patterns.
              </p>
            </div>
            <div style={{ padding: "2rem", backgroundColor: "#f8f9fa", borderRadius: "0.5rem" }}>
              <h3 style={{ marginBottom: "1rem", color: "#212529" }}>⚡ Easy Setup</h3>
              <p style={{ color: "#6c757d" }}>
                Connect your WhatsApp Business account and start recovering carts in less than 5 minutes with our guided setup.
              </p>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: "4rem" }}>
          <h2 style={{ fontSize: "2rem", marginBottom: "2rem", textAlign: "center" }}>
            Powerful Features
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1.5rem" }}>
            <div>
              <h4>✅ Automated Workflows</h4>
              <p style={{ color: "#6c757d" }}>Create multi-step recovery sequences with customizable delays and conditions.</p>
            </div>
            <div>
              <h4>📊 Smart Analytics</h4>
              <p style={{ color: "#6c757d" }}>Track recovery rates, revenue impact, and customer engagement in real-time.</p>
            </div>
            <div>
              <h4>🧪 A/B Testing</h4>
              <p style={{ color: "#6c757d" }}>Test different messages, timings, and incentives to optimize performance.</p>
            </div>
            <div>
              <h4>🎯 Customer Segmentation</h4>
              <p style={{ color: "#6c757d" }}>Target different customer groups with personalized recovery strategies.</p>
            </div>
            <div>
              <h4>📦 Delivery Tracking</h4>
              <p style={{ color: "#6c757d" }}>Keep customers informed with automated delivery updates via WhatsApp.</p>
            </div>
            <div>
              <h4>🌍 Multi-Language</h4>
              <p style={{ color: "#6c757d" }}>Send messages in your customers' preferred language automatically.</p>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: "4rem", textAlign: "center" }}>
          <h2 style={{ fontSize: "2rem", marginBottom: "2rem" }}>Trusted by Thousands of Merchants</h2>
          <div style={{ display: "flex", justifyContent: "center", gap: "4rem", marginBottom: "2rem" }}>
            <div>
              <div style={{ fontSize: "3rem", fontWeight: "bold", color: "#007bff" }}>25%</div>
              <div style={{ color: "#6c757d" }}>Average Recovery Rate</div>
            </div>
            <div>
              <div style={{ fontSize: "3rem", fontWeight: "bold", color: "#007bff" }}>$2.5M+</div>
              <div style={{ color: "#6c757d" }}>Revenue Recovered</div>
            </div>
            <div>
              <div style={{ fontSize: "3rem", fontWeight: "bold", color: "#007bff" }}>10K+</div>
              <div style={{ color: "#6c757d" }}>Active Stores</div>
            </div>
          </div>
        </section>

        <section style={{ backgroundColor: "#007bff", color: "white", padding: "3rem", borderRadius: "0.5rem", textAlign: "center" }}>
          <h2 style={{ fontSize: "2rem", marginBottom: "1rem" }}>Ready to Recover More Sales?</h2>
          <p style={{ fontSize: "1.25rem", marginBottom: "2rem" }}>
            Join thousands of merchants using WhatsApp to recover abandoned carts
          </p>
          <Link
            to="/auth/install"
            style={{
              backgroundColor: "white",
              color: "#007bff",
              padding: "1rem 2rem",
              borderRadius: "0.5rem",
              textDecoration: "none",
              fontSize: "1.125rem",
              display: "inline-block",
              fontWeight: "bold",
            }}
          >
            Start Free Trial
          </Link>
          <p style={{ marginTop: "1rem", opacity: 0.9 }}>
            Free 7-day trial • No credit card required • Cancel anytime
          </p>
        </section>

        <footer style={{ marginTop: "4rem", paddingTop: "2rem", borderTop: "1px solid #dee2e6", color: "#6c757d", textAlign: "center" }}>
          <p>© 2024 WhatsApp RecoverCart. All rights reserved.</p>
          <div style={{ marginTop: "1rem" }}>
            <a href="/privacy" style={{ color: "#6c757d", marginRight: "2rem" }}>Privacy Policy</a>
            <a href="/terms" style={{ color: "#6c757d", marginRight: "2rem" }}>Terms of Service</a>
            <a href="mailto:support@your-app.com" style={{ color: "#6c757d" }}>Contact Support</a>
          </div>
        </footer>
      </div>
    </div>
  );
}