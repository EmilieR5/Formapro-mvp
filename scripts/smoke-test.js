#!/usr/bin/env node
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const DEMO_EMAIL = process.env.DEMO_EMAIL || "sophie.martin@formapro-beta.fr";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "FormaPro2026!";

async function jsonFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, options);
  let payload = null;

  try {
    payload = await response.json();
  } catch (_err) {
    payload = null;
  }

  return { response, payload };
}

async function run() {
  const checks = [];

  // Test 1: Health check
  const health = await jsonFetch("/health");
  checks.push({
    name: "GET /health",
    ok: health.response.ok,
    status: health.response.status,
  });

  // Test 2: Login
  const login = await jsonFetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    }),
  });

  const accessToken = login.payload?.access_token || login.payload?.accessToken;
  checks.push({
    name: "POST /api/auth/login",
    ok: login.response.ok && !!accessToken,
    status: login.response.status,
  });

  // Test 3 & 4: Protected endpoints (only if login successful)
  if (accessToken) {
    const headers = { 
      "Authorization": `Bearer ${accessToken}`,
      "content-type": "application/json"
    };

    const dashboard = await jsonFetch("/api/dashboard", { 
      method: "GET",
      headers 
    });
    checks.push({
      name: "GET /api/dashboard",
      ok: dashboard.response.ok,
      status: dashboard.response.status,
    });

    const invoices = await jsonFetch("/api/invoices", { 
      method: "GET",
      headers 
    });
    checks.push({
      name: "GET /api/invoices",
      ok: invoices.response.ok,
      status: invoices.response.status,
    });
  } else {
    checks.push({
      name: "GET /api/dashboard",
      ok: false,
      status: "No token",
    });
    checks.push({
      name: "GET /api/invoices",
      ok: false,
      status: "No token",
    });
  }

  // Display results
  let hasFailure = false;
  console.log(`\nSmoke test against ${BASE_URL}\n`);
  for (const check of checks) {
    const marker = check.ok ? "✅ OK" : "❌ FAIL";
    if (!check.ok) hasFailure = true;
    console.log(`[${marker}] ${check.name} (${check.status})`);
  }

  if (hasFailure) {
    console.error("\n⚠️  At least one smoke check failed.");
    process.exit(1);
  }

  console.log("\n✅ All smoke checks passed!");
}

run().catch((err) => {
  console.error("💥 Smoke test crashed:", err.message);
  process.exit(1);
});