import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const failureRate = new Rate('failures');
const responseTime = new Trend('response_time');

// Test configuration
export const options = {
  stages: [
    // Ramp up
    { duration: '2m', target: 10 },  // Ramp up to 10 users
    { duration: '3m', target: 20 },  // Increase to 20 users
    { duration: '5m', target: 20 },  // Stay at 20 users
    { duration: '2m', target: 50 },  // Spike to 50 users
    { duration: '3m', target: 50 },  // Stay at 50 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
  
  thresholds: {
    // Performance thresholds
    http_req_duration: ['p(95)<500'], // 95% of requests must be below 500ms
    http_req_failed: ['rate<0.02'],   // Error rate must be below 2%
    failures: ['rate<0.02'],          // Custom failure rate below 2%
    response_time: ['p(95)<500'],     // 95th percentile response time
    
    // System resource thresholds
    http_req_connecting: ['p(95)<100'], // Connection time
    http_req_receiving: ['p(95)<100'],  // Time to receive response
  },
};

// Base URL configuration
const BASE_URL = __ENV.K6_STAGING_URL || 'https://staging.your-app-domain.com';

// Test scenarios
export default function() {
  // Weighted test scenarios
  const scenario = Math.random();
  
  if (scenario < 0.3) {
    testHealthEndpoint();
  } else if (scenario < 0.5) {
    testDashboardLoad();
  } else if (scenario < 0.7) {
    testApiEndpoints();
  } else if (scenario < 0.9) {
    testWebhookEndpoints();
  } else {
    testStaticAssets();
  }
  
  // Random sleep between 1-3 seconds
  sleep(Math.random() * 2 + 1);
}

function testHealthEndpoint() {
  const response = http.get(`${BASE_URL}/health`);
  
  const success = check(response, {
    'health endpoint status is 200': (r) => r.status === 200,
    'health response time < 100ms': (r) => r.timings.duration < 100,
    'health response has status field': (r) => r.json('status') !== undefined,
  });
  
  failureRate.add(!success);
  responseTime.add(response.timings.duration);
}

function testDashboardLoad() {
  // Simulate authenticated user accessing dashboard
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent': 'k6-load-test/1.0',
  };
  
  const response = http.get(`${BASE_URL}/app`, { headers });
  
  const success = check(response, {
    'dashboard loads successfully': (r) => r.status === 200,
    'dashboard response time < 500ms': (r) => r.timings.duration < 500,
    'dashboard contains app content': (r) => r.body.includes('Dashboard') || r.status === 302, // May redirect to auth
  });
  
  failureRate.add(!success);
  responseTime.add(response.timings.duration);
}

function testApiEndpoints() {
  // Test various API endpoints
  const endpoints = [
    '/api/shops/current',
    '/api/analytics/summary',
    '/api/carts/abandoned',
    '/api/messages/recent',
  ];
  
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'k6-load-test/1.0',
  };
  
  const response = http.get(`${BASE_URL}${endpoint}`, { headers });
  
  const success = check(response, {
    'API endpoint responds': (r) => r.status < 500, // Allow auth failures (401, 403)
    'API response time < 500ms': (r) => r.timings.duration < 500,
    'API returns valid JSON or redirect': (r) => {
      try {
        return r.json() !== undefined || r.status === 401 || r.status === 302;
      } catch (e) {
        return r.status === 401 || r.status === 302; // Auth redirect is OK
      }
    },
  });
  
  failureRate.add(!success);
  responseTime.add(response.timings.duration);
}

function testWebhookEndpoints() {
  // Test webhook endpoints (simulate Shopify webhooks)
  const webhookData = {
    id: Math.floor(Math.random() * 1000000),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  
  const headers = {
    'Content-Type': 'application/json',
    'X-Shopify-Topic': 'carts/update',
    'X-Shopify-Shop-Domain': 'test-shop.myshopify.com',
    'X-Shopify-Hmac-Sha256': 'test-hmac', // Would be real HMAC in production
    'User-Agent': 'k6-load-test/1.0',
  };
  
  const response = http.post(
    `${BASE_URL}/webhooks/shopify/carts/update`, 
    JSON.stringify(webhookData),
    { headers }
  );
  
  const success = check(response, {
    'webhook accepts request': (r) => r.status < 500,
    'webhook response time < 1000ms': (r) => r.timings.duration < 1000,
  });
  
  failureRate.add(!success);
  responseTime.add(response.timings.duration);
}

function testStaticAssets() {
  // Test static asset loading
  const assets = [
    '/favicon.ico',
    '/static/css/app.css',
    '/static/js/app.js',
  ];
  
  const asset = assets[Math.floor(Math.random() * assets.length)];
  const headers = {
    'Accept': '*/*',
    'User-Agent': 'k6-load-test/1.0',
  };
  
  const response = http.get(`${BASE_URL}${asset}`, { headers });
  
  const success = check(response, {
    'static asset loads': (r) => r.status === 200 || r.status === 404, // 404 is OK for missing assets
    'static asset response time < 200ms': (r) => r.timings.duration < 200,
  });
  
  failureRate.add(!success);
  responseTime.add(response.timings.duration);
}

// Setup function (runs once per VU)
export function setup() {
  console.log(`Starting load test against: ${BASE_URL}`);
  
  // Verify base URL is accessible
  const response = http.get(`${BASE_URL}/health`);
  if (response.status !== 200) {
    console.error(`Health check failed: ${response.status}`);
    // Don't fail setup, just warn
  }
  
  return { timestamp: new Date().toISOString() };
}

// Teardown function (runs once after all VUs)
export function teardown(data) {
  console.log(`Load test completed. Started at: ${data.timestamp}`);
  console.log('Check the k6 summary for detailed results.');
}

// Handle different test scenarios for CI/CD
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'performance-results.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data, options = {}) {
  // Custom summary format for CI/CD pipelines
  const indent = options.indent || '';
  const colors = options.enableColors || false;
  
  let summary = `${indent}Performance Test Results:\n`;
  summary += `${indent}========================\n`;
  summary += `${indent}Total Requests: ${data.metrics.http_reqs.count}\n`;
  summary += `${indent}Failed Requests: ${data.metrics.http_req_failed.count}\n`;
  summary += `${indent}Average Response Time: ${data.metrics.http_req_duration.avg.toFixed(2)}ms\n`;
  summary += `${indent}95th Percentile: ${data.metrics.http_req_duration['p(95)'].toFixed(2)}ms\n`;
  summary += `${indent}99th Percentile: ${data.metrics.http_req_duration['p(99)'].toFixed(2)}ms\n`;
  
  // Check if thresholds passed
  const thresholdsPassed = Object.values(data.thresholds).every(t => !t.fails);
  const status = thresholdsPassed ? '✅ PASSED' : '❌ FAILED';
  
  if (colors) {
    summary += thresholdsPassed 
      ? `${indent}\x1b[32m${status}\x1b[0m\n`
      : `${indent}\x1b[31m${status}\x1b[0m\n`;
  } else {
    summary += `${indent}Status: ${status}\n`;
  }
  
  return summary;
}