import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkoutBaseUrl } from "./payments";

const codespace = {
  codespaceName: "example-workspace",
  forwardingDomain: "app.github.dev",
  origin: "http://localhost:3000",
  host: "localhost:3000",
  protocol: "http",
};
const publicOrigin = "https://example-workspace-3000.app.github.dev";
assert.equal(checkoutBaseUrl(codespace), publicOrigin);
assert.equal(checkoutBaseUrl({ ...codespace, port: 8080 }), "https://example-workspace-8080.app.github.dev");
assert.equal(checkoutBaseUrl({ codespaceName: "example-workspace" }), publicOrigin);
assert.equal(checkoutBaseUrl({ ...codespace, appUrl: "https://payments.example.com/" }), "https://payments.example.com");
assert.equal(checkoutBaseUrl({ origin: "https://app.example.com" }), "https://app.example.com");
assert.equal(checkoutBaseUrl({ host: "localhost:3000", protocol: "http" }), "http://localhost:3000");
assert.equal(checkoutBaseUrl({ appUrl: "http://localhost:3111" }), "http://localhost:3111");
for (const appUrl of ["http://localhost:3000", "https://localhost:3000", "https://127.0.0.1:3000", "https://[::1]:3000"]) {
  assert.throws(() => checkoutBaseUrl({ ...codespace, appUrl }));
}
for (const appUrl of ["not-a-url", "javascript:alert(1)", "https://user:password@example.com", "https://example.com/path", "https://example.com/?foo=bar", "https://example.com/#fragment"]) {
  assert.throws(() => checkoutBaseUrl({ appUrl }));
}
assert.throws(() => checkoutBaseUrl({}));
assert.equal(`${checkoutBaseUrl(codespace)}/?tip=success`, `${publicOrigin}/?tip=success`);
assert.equal(`${checkoutBaseUrl(codespace)}/dashboard?payment=cancel`, `${publicOrigin}/dashboard?payment=cancel`);

const server = readFileSync(new URL("./server.ts", import.meta.url), "utf8");
const gems = server.slice(server.indexOf('app.post("/api/create-gem-checkout-session"'), server.indexOf("// --- STRIPE CONNECT:"));
const tips = server.slice(server.indexOf('app.post("/api/live/tip-checkout"'), server.indexOf("// --- API: SPEND GEMS"));
assert.match(gems, /const baseUrl = stripeBaseUrl\(req\)/);
assert.match(tips, /const baseUrl = stripeBaseUrl\(req\)/);
assert.match(gems, /url: session\.url/);
assert.match(gems, /!isStripeConfigured && !isSimulationAllowed\(req\.hostname\)/);
assert.match(gems, /const simulatedUrl = `\/stripe-sandbox-checkout/);
console.log("Checkout URL regressions passed: public Codespaces returns, configured origins, local development, invalid configuration, and checkout wiring.");
