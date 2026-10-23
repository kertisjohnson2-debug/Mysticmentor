# Stripe TEST-MODE setup: livestream tips and gem purchases

Test mode only. Use `sk_test_…` keys. Never paste secret values into chat, commits, logs or frontend code.

## Model
- **Gems**: `POST /api/create-gem-checkout-session` (authenticated). Packages and prices are defined server-side. Gems are credited **only** by the verified webhook (`checkout.session.completed`), once per Stripe event and once per Checkout session.
- **Tips**: `POST /api/live/tip-checkout` (authenticated, $1–$500). The broadcaster is read from the live session on the server. A destination charge is created on the platform account with `application_fee_amount` = 20% and `transfer_data.destination` = the broadcaster's Connect account. The broadcaster receives 80%; Stripe processing fees are paid by the platform.
- Tips are enabled for a stream only when Stripe reports the broadcaster's account as ready (details submitted, transfers active, charges and payouts enabled).
- Private-booking payments use their own Checkout session (`metadata.type = "booking_payment"`) and the same webhook endpoint and event.

## Webhook events
All three flows use Stripe Checkout with card payments and complete on **`checkout.session.completed`**. The handler routes by `metadata.type` (`gem_purchase`, `live_tip`, `booking_payment`) and records a payment only when `payment_status` is `paid` and `amount_total` matches the server-stored price. Gems and tips are recorded once per Stripe event ID and once per Checkout session; bookings are recorded once per session.
- Do **not** subscribe to `payment_intent.succeeded` as a substitute: the handler ignores it, and its payload lacks the Checkout session metadata.
- `charge.refunded` and `charge.dispute.created` are logged to the admin financial ledger only.
- The Stripe CLI listener (`scripts/dev-stripe.sh`) forwards exactly these three events.

## Environment variable NAMES
| Name | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | test secret key (`sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | signing secret (`whsec_…`) of the webhook endpoint or `stripe listen` |
| `APP_URL` | public https base URL used for Checkout/onboarding return URLs |
| `ENABLE_WEBHOOK_SIMULATION` | leave unset/false; local simulator only |

## Setting secrets
- **Codespaces**: GitHub → Settings → Codespaces → Secrets, add the names above for this repository, then rebuild/restart the codespace. Never put them in a tracked file.
- **Cloud Run**: store each value in Secret Manager, then deploy with `--set-secrets STRIPE_SECRET_KEY=<secret>:latest,STRIPE_WEBHOOK_SECRET=<secret>:latest` and `--set-env-vars APP_URL=https://<your-service-url>`. The Cloud Run service must be redeployed for the new server code.

## Stripe Dashboard (test mode)
1. Enable **Connect** (Settings → Connect) and complete the platform profile. Express accounts are used.
2. Developers → Webhooks → add endpoint `https://<APP_URL>/api/stripe-webhook`. Under **Listen to**, choose **Events on your account**: tips are destination charges, so their Checkout sessions belong to the platform account, not the connected account. Select exactly `checkout.session.completed`, `charge.refunded`, `charge.dispute.created`. Copy its signing secret to `STRIPE_WEBHOOK_SECRET`. Test-mode and live-mode endpoints have different signing secrets.
3. **Local development (no Dashboard webhook needed)**: with `STRIPE_SECRET_KEY` (an `sk_test_` key) set in the environment, run `npm run dev:stripe`. It starts the Stripe CLI listener and the server together, passes the listener's signing secret to the server as `STRIPE_WEBHOOK_SECRET`, sets `APP_URL` (Codespaces forwarded URL, else `http://localhost:3000`), and prints no secrets. No `stripe login` is needed. Do not run a second server on port 3000. In a second terminal, `STRIPE_API_KEY="$STRIPE_SECRET_KEY" npx @stripe/cli trigger checkout.session.completed` should show `[200] POST …/api/stripe-webhook`. That generic fixture has no app `metadata.type`, so it is acknowledged without recording anything.
   - Running `npx @stripe/cli listen …` alone exits immediately with "You have not configured API keys yet" unless you pass an API key via `STRIPE_API_KEY` or have run `stripe login`.
   - The listener's `whsec_` secret is only for the CLI; a server started with plain `npm run dev` has no `STRIPE_WEBHOOK_SECRET` and rejects (or, locally, simulates) webhooks.

### Verify the platform and Connect branding

The server creates its Stripe client from `STRIPE_SECRET_KEY`. It does not override the platform account or supply the platform's brand in the onboarding link. Stripe-hosted onboarding uses the selected platform's Dashboard settings, not the app's display name.

1. In the Dashboard account picker, select the intended Mysticmentor business and its testing sandbox. Confirm the sandbox is associated with that business before using its keys.
2. Check the account ID in that environment against a read-only `GET /v1/account` request made with the server's **test-mode** key. The key prefix identifies test versus live mode, but does not identify the business. Do not print the key or share the full account response.
3. In that sandbox, open **Settings > Connect > Settings** ([Connect settings](https://dashboard.stripe.com/account/applications/settings)). Configure the platform's brand name, icon, and colors for hosted onboarding. Use **Settings > Business > Public details** for the public business name and website; changing only the Dashboard/sandbox display name is not a substitute for Connect branding.
4. Generate a fresh onboarding link in an isolated test deployment and confirm the Mysticmentor branding. Do not reuse an expired link.
5. Before any live-mode switch, manually verify the intended live business/account ID and its Connect branding in the Dashboard, then verify that the deployment's secret references and webhook endpoint belong to that same live account. Test and live connected account IDs and webhook signing secrets are environment-specific; do not reuse or migrate test IDs by changing a key.

If the test key belongs to a different business, configure the intended business's sandbox separately and plan the environment change explicitly. Do not replace keys on an existing deployment speculatively: its stored Connect IDs and payment objects may belong to the current account.

## End-to-end test steps
Run these steps only against an isolated test deployment with test Firebase data and Stripe test keys. A Stripe test key does not isolate the app's Firebase writes.

**Gems**: sign in → Wallet → buy a package → pay with card `4242 4242 4242 4242`, any future expiry, any CVC/postal code → after redirect, the balance rises once the webhook arrives. Resending the event from the Dashboard must not add gems again.

**Tips**:
1. Sign in as an admin/approved reader → Profile/Dashboard Connect panel → *Connect Stripe*. Complete Stripe's test onboarding (test data: DOB 01/01/1901, SSN last4 `0000`, routing `110000000`, account `000123456789`, use Stripe's "Use test data" shortcuts). Panel should show "Ready for tips" (it reads Stripe live).
2. Start a Live broadcast with that account.
3. In a second account, open the stream → gift sheet → cash tip → pay with `4242…`.
4. Webhook records the tip: the sender and broadcaster ledgers, platform fee $2 / broadcaster $8 on a $10 tip, and the Stripe Dashboard shows the transfer to the connected account.
Decline test: `4000 0000 0000 0002`.

## Known limits
- Refunds/disputes are logged only; tips and gems are not automatically reversed.
- After paying, the tip redirect returns to the app home, not the live room.
- Automated checks do not exercise real Checkout, Connect onboarding, or Stripe-originated webhooks; these require manual testing in an isolated environment.
