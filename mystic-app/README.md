<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/59685044-8cc4-45dc-9868-bdaa738876af

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Broadcaster ranks

All broadcaster rank displays use `users/{uid}.lifetimeGemsReceived` through
`GET /api/broadcasters/:uid/rank` and the shared `useBroadcasterRank` hook.
`broadcasterStats/{uid}` is a public copy and refresh signal, never the authority.
The public profile's existing rank-visibility setting is preserved.

| Rank | Lifetime qualifying Gems |
| --- | ---: |
| New Seer | 0 |
| Mystic Adept | 1,000 |
| Oracle | 5,000 |
| High Oracle | 15,000 |
| Celestial Sage | 40,000 |
| Grand Mystic | 100,000 |
| Luna Master | 250,000 |

Early milestones remain accessible; later intervals grow to make Luna Master a
long-term achievement. These replace the previous broadcaster thresholds and can
change a displayed rank without changing anyone's stored lifetime Gems.
Only server-confirmed live gifts to another broadcaster in an active session
advance rank. Gem purchases, cash tips, Clout and non-live gifts do not.
Progress is the fraction between the current and next thresholds; Gems remaining
is the next threshold minus the authoritative total. The highest rank is 100%.

Live gifts require a client-generated `requestId`, reused on retry. The server
atomically deduplicates by sender and request ID and preserves the existing
balance deduction, recipient gift ledger and financial record. Already-matching
totals advance together atomically; a new broadcaster starts at zero.
A pre-existing missing or different public total is preserved and logged for
review, not implicitly reconciled by a new gift or promoted into the user total.
Its refresh timestamp still updates so displays load the authoritative result.

### Historical comparison and reconciliation

Run `npx tsx scripts/reconcile-broadcaster-rank.ts <uid>` for a **read-only,
single-account dry run** using the configured project and named database.
It reports both totals, rank/progress, completed qualifying gift evidence and
any historical evidence gap. It does not enumerate accounts or print customer
information.

A missing or lower public copy is eligible for correction only when the
authoritative total is valid and fully supported by the existing completed
gift records. Higher/malformed copies, malformed evidence and unsupported
legacy totals require review; the script never awards Gems or changes authority.
After explicit approval, `--apply --confirm=<dry-run token>` rechecks document
versions and gift evidence in the write transaction and changes only the public
copy and its timestamps. Any intervening change requires another dry run.
The operation then rereads the result. Never apply a historical correction
without reviewing and approving that account's report.

### Non-destructive regression tests

With the Firebase CLI and Java installed, run:

```sh
firebase emulators:exec --only firestore --project demo-mysticmentor-rank \
  "npx tsx test-broadcaster-rank.ts"
npm run lint
npm run build
```

The rank suite requires a loopback Firestore emulator and uses only a `demo-`
project. It covers all thresholds/boundaries, gift qualification, concurrent
retries, atomic rollback, historical reconciliation safeguards, and synthetic
purchase/tip events through the existing event processor. It never calls Stripe
or modifies real Firebase data. Do not substitute the real-project payment
test script for this emulator-only suite.

## Release: Admin PIN and daily content

Admin Access lives on the Member page, not in the bottom navigation. The server
requires an enabled, verified Firebase account with the existing administrator
role (or the existing verified bootstrap administrator). First-use setup creates
a four-digit PIN from that authenticated session, without another password
prompt, and cannot overwrite an existing PIN. Forgotten-PIN recovery alone
requires recent account-password verification.

Only a salted scrypt hash is stored in `adminSecurity/passcode`. Five attempts
trigger a per-administrator 15-minute lockout, reserved transactionally before
hash verification. A successful unlock issues a random token; only its SHA-256
digest is stored in `adminSessions`. Tokens are bound to the administrator UID,
PIN generation and expiry. PIN changes/recovery invalidate every previous PIN
generation. Lock & Exit revokes this device, and Security can revoke all sessions
for the signed-in administrator. Defaults are 60 minutes or 30 remembered days,
configurable with `ADMIN_SESSION_TIMEOUT_MINUTES` and
`ADMIN_REMEMBER_DEVICE_DAYS`. The browser stores a revocable session token, never
the PIN. Use remembered access only on private devices over HTTPS.

Member/staff/reader lists, financial records and totals, promotions/demotions,
reader grants/revocations, suspensions, and image administration use server APIs
requiring both administrator authorization and the PIN session. Member mutations
also create server-only audit records. Deck editing, shuffle settings and
broadcast simulations remain browser-local controls, not global publishing or
financial operations.

**Deployment gate:** the updated `firestore.rules` removes the old direct-client
administrator bypasses. These rules have not been deployed by this task. Until
an authorized operator reviews and deploys them to the existing named database,
the currently deployed rules may still permit administrator-role clients to
bypass the PIN APIs. Do not describe production administration as fully
PIN-enforced until that deployment and production smoke checks are complete.
Do not change the Firebase project or database identity when deploying.

Daily Affirmation has 6,912 distinct statements:
3 grammatical persons × 6 verbs × 8 gifts × 6 linking verbs × 8 paths. The fifth
reel's possessive follows the first reel, so it is not an independent multiplier.
All combinations are enumerated by the focused test. The shared daily statement
does not consume allowance; authenticated members can complete 10 additional
spins per UTC calendar day. Guests can view the shared statement but cannot
spin. The UI displays the UTC reset rule. The server owns spin IDs, timing,
completion counts and no-immediate-repeat selection in `affirmationDays`.
Abandoned/replaced attempts consume nothing; successful completion is atomic and
idempotent. Refreshes and multiple tabs do not reset allowance. The server can
validate elapsed time and completion requests, not prove a person watched an
animation.

Daily horoscope text comes from the existing free external API, not generated
text or a hardcoded fallback. The server checks the returned sign and UTC date,
caches a valid reading for at most 30 minutes within that day, and returns an
explicit error for unavailable/stale responses. The UI refreshes the date on
focus and a minute timer. Zodiac personality, lucky-number/time and mood metadata
remain static reference content. Life Path numerology uses the entered birth
date with the existing digit-sum convention and master numbers 11/22; it is not
supposed to change daily. Invalid/future dates are rejected.

Focused offline checks:

```sh
npx tsx test-admin-access.ts
npx tsx test-release-readiness.ts
npm run lint
npm run build
```

`test-release-emulator.mts` additionally requires loopback Auth (9099) and
Firestore (8082) emulators plus the actual server on 3099 using those emulators
and the updated rules. Run it only against clean disposable emulator fixtures,
without Stripe or service-account secrets. It verifies direct-rule denials,
administrator/PIN enforcement, concurrent lockout and completion idempotency.
