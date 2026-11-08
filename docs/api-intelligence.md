# API Intelligence & Testing Studio

DevPulse includes a dual API solution:
1. **API Intelligence**: Real-time inbound developer telemetry monitoring HTTP traffic, error rates, and exact P95/P99 latency percentiles.
2. **API Testing Studio**: A full-featured Postman/Insomnia alternative embedded directly in VS Code for building, executing, and automating API requests.

---

## 1. API Intelligence (Live Server Telemetry)

DevPulse runs an embedded local telemetry ingestion server (default: `http://127.0.0.1:4318`) protected by HMAC service tokens.

### Connecting an Express Application
Install the DevPulse middleware in your backend service:

```bash
npm install devpulse-middleware # Or use the bundled lightweight adapter
```

```javascript
const express = require('express');
const app = express();

// Obtain your DevPulse Service Token from the API Intelligence page
const DEVPULSE_TOKEN = process.env.DEVPULSE_SERVICE_TOKEN;

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    // Send event asynchronously to local DevPulse server
    fetch('http://127.0.0.1:4318/v1/telemetry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEVPULSE_TOKEN}`
      },
      body: JSON.stringify({
        serviceName: 'order-service',
        method: req.method,
        routeTemplate: req.route ? req.route.path : req.path,
        statusCode: res.statusCode,
        durationMs: duration
      })
    }).catch(() => {}); // Never block application flow on telemetry error
  });
  next();
});
```

### Telemetry Features
- **Route Normalization**: Groups dynamic IDs (`/users/123` → `/users/:id`).
- **Latency Percentiles**: Exact mathematical P95 and P99 percentiles calculated across duration arrays.
- **Circular Ring Buffer**: Telemetry is capped in SQLite at 10,000 events via automatic circular database triggers.

---

## 2. API Testing Studio (Interactive Client)

Embedded HTTP client for testing REST, GraphQL, and microservice APIs without switching to external tools.

### Core Capabilities
- **Collections & Folders**: Organize requests by domain, microservice, or workflow.
- **Environments & Variables**: Support for global and active environment variables (`{{baseUrl}}`, `{{token}}`).
- **Secret Variable Offloading**: Variables marked as secret (`isSecret: true`) are automatically moved to VS Code `SecretStorage` with opaque SQLite references.
- **Pre-Request & Assertion Scripts**: Automated JavaScript test assertions with Chai-style syntax:
  ```javascript
  pm.test("Status is 200", () => {
    pm.response.to.have.status(200);
  });
  pm.test("Response time < 500ms", () => {
    pm.expect(pm.response.responseTime).to.be.below(500);
  });
  ```
- **Test Collection Runner**: Execute entire collections sequentially with iteration counts and pass/fail summary reports.
- **Import / Export**: Full OpenAPI 3.0, HAR, Postman Collection v2.1, and cURL import and export support.
- **Security**: Strips sensitive `Authorization` and `Cookie` headers upon cross-origin redirects.
