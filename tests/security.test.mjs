import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  paymentReadiness,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "../server/razorpay.js";
import { isAdmin, requireSession } from "../server/auth.js";

test("checkout signatures bind both order and payment and reject malformed signatures", () => {
  process.env.RAZORPAY_KEY_SECRET = "test-only-secret";
  const signature = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update("order_1|pay_1")
    .digest("hex");
  assert.equal(
    verifyCheckoutSignature({
      orderId: "order_1",
      paymentId: "pay_1",
      signature,
    }),
    true,
  );
  assert.equal(
    verifyCheckoutSignature({
      orderId: "order_2",
      paymentId: "pay_1",
      signature,
    }),
    false,
  );
  assert.equal(
    verifyCheckoutSignature({
      orderId: "order_1",
      paymentId: "pay_2",
      signature,
    }),
    false,
  );
  assert.equal(
    verifyCheckoutSignature({
      orderId: "order_1",
      paymentId: "pay_1",
      signature: "bad",
    }),
    false,
  );
});
test("webhook verification authenticates exact raw bytes", () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";
  const raw = Buffer.from('{"event":"payment.captured"}');
  const signature = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(raw)
    .digest("hex");
  assert.equal(verifyWebhookSignature(raw, signature), true);
  assert.equal(
    verifyWebhookSignature(Buffer.from(raw + " "), signature),
    false,
  );
  assert.equal(verifyWebhookSignature(raw, undefined), false);
});
test("Razorpay test keys are restricted to explicit non-production test mode", () => {
  const common = {
    PAYMENTS_ENABLED: "true",
    PAYMENTS_TEST_MODE: "true",
    DATABASE_URL: "postgres://db",
    RAZORPAY_KEY_ID: "rzp_test_example",
    RAZORPAY_KEY_SECRET: "secret",
    RAZORPAY_WEBHOOK_SECRET: "webhook",
  };
  assert.deepEqual(
    paymentReadiness({
      ...common,
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
    }),
    { enabled: true, mode: "test" },
  );
  assert.deepEqual(
    paymentReadiness({
      ...common,
      VERCEL_ENV: "production",
      NODE_ENV: "production",
    }),
    { enabled: false, mode: "unavailable" },
  );
});
test("Razorpay live mode requires legal, business and public seller details", () => {
  const common = {
    PAYMENTS_ENABLED: "true",
    DATABASE_URL: "postgres://db",
    RAZORPAY_KEY_ID: "rzp_live_example",
    RAZORPAY_KEY_SECRET: "secret",
    RAZORPAY_WEBHOOK_SECRET: "webhook",
  };
  assert.equal(paymentReadiness(common).enabled, false);
  const approved = {
    ...common,
    BUSINESS_DETAILS_VERIFIED: "true",
    LEGAL_TAX_APPROVED: "true",
    PUBLIC_LEGAL_NAME: "Seller",
    PUBLIC_BUSINESS_ADDRESS: "Address",
    PUBLIC_CONTACT_EMAIL: "contact@example.com",
    PUBLIC_GRIEVANCE_EMAIL: "grievance@example.com",
    PUBLIC_TAX_DISCLOSURE: "Taxes disclosed",
  };
  assert.deepEqual(paymentReadiness(approved), { enabled: true, mode: "live" });
});
test("administrator authorization requires a database role, verified identity and MFA", () => {
  process.env.ADMIN_EMAILS = "owner@example.com";
  assert.equal(
    isAdmin({
      mfaVerified: true,
      user: { email: "owner@example.com", emailVerified: false, role: "admin" },
    }),
    false,
  );
  assert.equal(
    isAdmin({
      mfaVerified: false,
      user: { email: "owner@example.com", emailVerified: true, role: "admin" },
    }),
    false,
  );
  assert.equal(
    isAdmin({
      mfaVerified: true,
      user: { email: "owner@example.com", emailVerified: true, role: "admin" },
    }),
    true,
  );
  assert.equal(
    isAdmin({
      mfaVerified: true,
      user: {
        email: "owner@example.com",
        emailVerified: true,
        role: "traveler",
      },
    }),
    false,
  );
});
test("cross-origin and anonymous account mutations fail closed", async () => {
  delete process.env.DATABASE_URL;
  process.env.APP_URL = "https://kubovista.example";
  const response = () => ({
    setHeader() {},
    end(body) {
      this.body = JSON.parse(body);
    },
  });
  const denied = response();
  assert.equal(
    await requireSession(
      { method: "POST", headers: { origin: "https://attacker.example" } },
      denied,
    ),
    null,
  );
  assert.equal(denied.statusCode, 403);
  const anonymous = response();
  assert.equal(
    await requireSession(
      { method: "POST", headers: { origin: "https://kubovista.example" } },
      anonymous,
    ),
    null,
  );
  assert.equal(anonymous.statusCode, 401);
});
test("committed environment template contains no server credentials", async () => {
  const text = await readFile(
    new URL("../.env.example", import.meta.url),
    "utf8",
  );
  for (const key of [
    "DATABASE_URL",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "FIREBASE_PRIVATE_KEY",
    "RESEND_API_KEY",
    "GEMINI_API_KEY",
  ]) {
    assert.match(text, new RegExp(`^${key}=$`, "m"));
  }
});
