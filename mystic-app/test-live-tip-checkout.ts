import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import crypto from "node:crypto";
import express from "express";
import { transformSync } from "esbuild";
import type Stripe from "stripe";
import { calculateTipSplit, checkoutBaseUrl, evaluateConnectReadiness, liveTipReturnUrls, parseTipAmountCents } from "./payments";

const publicOrigin = "https://example-workspace-3000.app.github.dev";
const env: Record<string, string | undefined> = { CODESPACE_NAME: "example-workspace" };
for (const origin of ["http://localhost:3000", "https://localhost:3000", "https://127.0.0.1", "https://[::1]", "https://app.local"]) {
  assert.throws(() => liveTipReturnUrls(origin));
}
assert.deepEqual(liveTipReturnUrls(publicOrigin), {
  success_url: `${publicOrigin}/?tip=success`,
  cancel_url: `${publicOrigin}/?tip=cancel`,
});

// Execute the checked-in handler and frontend functions, not copies of their logic.
const source = readFileSync(new URL("./server.ts", import.meta.url), "utf8");
const helper = source.slice(source.indexOf("  const stripeBaseUrl ="), source.indexOf("  // --- API: CREATE CHECKOUT SESSION"));
const route = source.slice(source.indexOf('  app.post("/api/live/tip-checkout"'), source.indexOf("  // --- API: SPEND GEMS"));
assert.ok(helper && route);
const app = express();
app.use(express.json());
const checkoutUrl = "https://checkout.stripe.com/c/pay/test_fixture";
let stripeCalls = 0;
let stripeFailure = false;
let ready = true;
let parameters: Stripe.Checkout.SessionCreateParams | undefined;
let recordedTip: Record<string, unknown> | undefined;
let storedSession: string | undefined;
const errors: unknown[][] = [];
runInNewContext(transformSync(`${helper}\n${route}`, { loader: "ts", format: "cjs" }).code, {
  app, crypto, checkoutBaseUrl, calculateTipSplit, liveTipReturnUrls, parseTipAmountCents, evaluateConnectReadiness,
  process: { env },
  console: { error: (...args: unknown[]) => errors.push(args) },
  isStripeConfigured: true,
  authenticateMember: async (req: express.Request, res: express.Response) => {
    if (req.headers.authorization !== "Bearer fixture-token") { res.status(401).json({ error: "Sign in." }); return null; }
    return "viewer";
  },
  resolveTipTarget: async () => ({ status: 200, recipientUid: "broadcaster", recipientName: "Broadcaster", accountId: "acct_broadcaster" }),
  retrieveConnectReadiness: async () => ({ ready }),
  db: { collection: () => ({ doc: () => ({
    set: async (data: Record<string, unknown>) => { recordedTip = data; },
    update: async (data: { stripeSessionId: string }) => { storedSession = data.stripeSessionId; },
  }) }) },
  stripe: { checkout: { sessions: { create: async (data: Stripe.Checkout.SessionCreateParams) => {
    stripeCalls++;
    parameters = data;
    if (stripeFailure) throw new Error("Stripe fixture failure");
    return { id: "cs_test_fixture", url: checkoutUrl };
  } } } },
});
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
const request = (body: object, authorized = true) => fetch(`${base}/api/live/tip-checkout`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", ...(authorized ? { Authorization: "Bearer fixture-token" } : {}) },
  body: JSON.stringify(body),
});
try {
  for (const file of ["ImmersiveLiveRoomV2.tsx", "LiveCommunity.tsx"]) {
    const frontend = readFileSync(new URL(`./src/components/${file}`, import.meta.url), "utf8");
    const start = frontend.indexOf("  const sendCashTip =");
    const end = frontend.indexOf("\n  const sendChat =", start);
    assert.ok(start >= 0 && end > start);
    const window = { location: { href: publicOrigin } };
    const notices: string[] = [];
    const sendCashTip: (amount: string) => Promise<void> = runInNewContext(transformSync(
      `${frontend.slice(start, end)}\nsendCashTip;`, { loader: "ts" },
    ).code, {
      auth: { currentUser: { isAnonymous: false, getIdToken: async () => "fixture-token" } },
      activeSession: { sessionId: "live_fixture" },
      setNotice: (message: string) => notices.push(message),
      setIsGiftSheetOpen: () => {},
      window,
      fetch: (path: string, options: RequestInit) => {
        assert.equal(path, "/api/live/tip-checkout");
        return fetch(`${base}${path}`, { ...options, headers: { ...options.headers, Origin: "http://localhost:3000" } });
      },
    });
    await sendCashTip("10");
    assert.equal(window.location.href, checkoutUrl);
    assert.equal(notices.length, 0);
    assert.equal(parameters?.success_url, `${publicOrigin}/?tip=success`);
    assert.equal(parameters?.cancel_url, `${publicOrigin}/?tip=cancel`);
    assert.equal(parameters?.payment_intent_data?.application_fee_amount, 200);
    assert.equal(parameters?.payment_intent_data?.transfer_data?.destination, "acct_broadcaster");
    assert.equal(recordedTip?.recipientShareCents, 800);
    assert.equal(storedSession, "cs_test_fixture");
    stripeFailure = true;
    window.location.href = publicOrigin;
    await sendCashTip("10");
    assert.equal(window.location.href, publicOrigin);
    assert.equal(notices.length, 1);
    stripeFailure = false;
  }
  const calls = stripeCalls;
  assert.equal((await request({ amountCents: 1000 }, false)).status, 401);
  assert.equal((await request({ amountCents: 0 })).status, 400);
  ready = false;
  assert.equal((await request({ amountCents: 1000 })).status, 409);
  ready = true;
  env.APP_URL = "http://localhost:3000";
  assert.equal((await request({ amountCents: 1000 })).status, 500);
  delete env.APP_URL;
  delete env.CODESPACE_NAME;
  assert.equal((await request({ amountCents: 1000 })).status, 500);
  assert.equal(stripeCalls, calls);
  assert.ok(errors.length >= 4);
  console.log("Live-tip integration passed: both frontend handlers -> HTTP route -> Stripe boundary -> browser redirect; public returns, 20/80 split, destination, authentication, readiness, local-URL rejection, and Stripe failures.");
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
