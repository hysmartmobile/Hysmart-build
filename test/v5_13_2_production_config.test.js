import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("production environment validation requires live Paystack and Stripe credentials and webhook verification", async () => {
  const source = await read("../src/config/env.js");
  assert.match(source, /Production requires the Paystack live secret key/);
  assert.ok(source.includes("PAYSTACK_SECRET_KEY.startsWith('sk_live_')"));
  assert.match(source, /Production requires the Stripe live secret key/);
  assert.ok(source.includes("STRIPE_SECRET_KEY.startsWith('sk_live_')"));
  assert.match(source, /Production requires the Stripe webhook signing secret/);
  assert.match(source, /TRUST_PROXY=true/);
});

test("deployment config has SPA fallback and a Render readiness health check", async () => {
  const vercel = JSON.parse(await read(new URL("../../HySmart-Build-Web/vercel.json", import.meta.url)));
  assert.ok(vercel.rewrites.some((rule) => rule.destination === "/index.html"));
  const render = await read("../../render.yaml");
  assert.match(render, /healthCheckPath: \/api\/v1\/health\/ready/);
  assert.match(render, /rootDir: HySmart-Build-Backend/);
  assert.match(render, /sync: false/);
});

test("payment provider outbound requests have a bounded timeout", async () => {
  const source = await read("../src/services/paymentProviders.js");
  assert.match(source, /AbortSignal\.timeout\(15_000\)/);
});
