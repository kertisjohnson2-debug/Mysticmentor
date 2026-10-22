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

## Admin members, email permission, and report review

The Members tab is the primary directory of Firebase accounts, including accounts
without application profiles. Server queries return 50 accounts per page; exact
email search also includes Auth-only accounts. Case-sensitive name-prefix search
uses registered profiles only. Auth-only accounts have no profile actions; the
Admin directory never implicitly creates profiles or grants starting balances.
Staff Roster retains role
and Tarot Reader controls, with bounded lists and email-based actions. The
Overview profile count uses a server aggregate instead of downloading profiles.

Members can change their optional email-contact permission on their private
profile. Registration starts unchecked, and required Terms/Privacy acceptance
does not imply email permission. `memberEmailConsent/{uid}` and its immutable
history are server-managed; absent/false consent is never permission.
The server records the wording, version, source, and timestamp. Administrators
can view but cannot grant this permission. No provider, export, or sending
workflow is configured. A future provider must honor explicit current consent,
unsubscribe and provider suppression lists; consent is not an override of
suppression, account restrictions, or required service-notice policy.

Members includes a read-only email-preference history view (25 entries per page,
newest first), showing recorded opt-in/decline/withdrawal times, source, wording,
and version through the existing Admin role/PIN guard. Missing history is not
consent. Restriction actions use in-page confirm/cancel controls rather than
browser dialogs, which can be suppressed in embedded Preview. Successful name
edits and restrictions show a status message and reload the directory; renaming
can remove a member from a currently active name-prefix search.
Edit drafts carry their member UID, and directory reloads/page changes clear
drafts, pending confirmations, and open history panels. Member mutations are
serialized while saving. Restricted members remain in the Admin directory, and
Admin requests bypass browser caching so refreshed restrictions and private
records are not served from a cached response.
Member controls use 44px-minimum-height touch targets. The enabled "Why deletion
is unavailable" control opens a member-specific inline explanation with a Close
button; it never calls a deletion endpoint. Protected-account and missing-profile
restrictions remain enforced and explained instead of enabling unsafe actions.
All Admin accounts (including the primary and acting administrator) remain
protected from restriction changes. Suspension/ban alone never disables the
ordinary member's reversal controls. Backend mutation failures are displayed
beside the affected member, rather than only above a potentially long directory.

Public in-app starter policies are available at `/terms` and `/privacy`, linked
from registration, the landing footer and private profile settings. Versioned
source text lives in `src/lib/policies.ts`. The documents are explicitly marked
for owner/legal review; they do not invent a business contact or claim a working
mailing provider, provider-level unsubscribe, retention period, or deletion
service. Verified contact/privacy-request details, legal requirements, provider
arrangements, and payment/refund terms must be reviewed before public launch.

Registration requires explicit Terms acceptance and Privacy acknowledgment
before creating an Auth account. The existing secure consent flow atomically
records a separate `memberPolicyAcceptance/{uid}` record and history with the
accepted Terms/Privacy versions and server timestamp. Stale policy versions
are rejected. Failed saves remain in a retryable registration-completion view;
already-existing members are not assigned fabricated acceptance or consent.
Terms distinguish necessary security/account/service emails from optional
promotional permission. The private email-preference control records opt-out
without switching off essential notices. Future promotional sending still
requires a verified unsubscribe/suppression integration and legal review.

Suspend and ban are independent account restrictions, not profile deletion.
The shared API middleware rejects restricted authenticated accounts, and local
Firestore rules block their authenticated data operations except reading their
own profile to observe the restriction and sign out. Existing public content
remains public. Neither action deletes history or disables payment reconciliation.
The primary administrator, any administrator, and the acting administrator are
protected from restriction actions. Delete remains unavailable pending an
approved Auth/related-record/retention lifecycle.

Reports & Alerts reviews existing community reports only; there is no automated
monitoring. Status changes use guarded transactions, reject stale transitions,
preserve original report fields, and append report history plus `adminAudit`.
Reports, consent records and histories remain denied to direct client access.
The new endpoints use the existing role and Admin PIN-session guard.
Reports can be opened for details and paginated review history (25 events per
page, newest first). Display labels map the existing stored statuses: `open`
is New, `reviewing` is Under Review, then Resolved or Dismissed. New reports must
enter review before resolution; reviewed/closed reports can return to New.
Every committed transition preserves the submission and appends reviewer UID,
timestamp and prior/new status to history and `adminAudit`. Stale concurrent
updates are rejected. Successful saves refresh both the queue and open report,
with inline success/error feedback; no automated alerts or account actions run.

Changes to rules and server routes here are local source changes, not a
deployment. Restriction enforcement requires the corresponding reviewed rules
and backend to be released together later, under separate deployment approval.

Focused checks: `npx tsx test-admin-access.ts`,
`npx tsx test-community-reports.ts`, and the emulator-only
`test-admin-members.ts` (requires loopback Auth and Firestore emulators with a
`demo-` project). Never point the integration test at production.

## Broadcaster ranks

Admin Revenue uses a bounded, read-only `financial_records` query under the
existing Admin/PIN guard. It returns only record ID, date, type, status, currency
when stored, and the recorded gross/platform-fee/recipient-allocation amounts.
No member IDs, Stripe IDs, card details, or secrets are returned. The existing
Financials aggregate mixes sandbox activity with other entries and is not reused
as verified earnings. Missing live/test provenance, fee/refund attribution and
payout settlement prevent reliable lifetime/today/net totals; these remain
explicitly unavailable. Refund rows are cumulative charge snapshots, not additive
events. No page sums or duplicate user/global ledger totals are combined.

Admin Access remains on the private Member profile and still requires the
server-issued PIN session. A server-authorized eligibility check can restore
entry visibility when the client profile is unavailable; it never unlocks the
console. Ordinary target-action 403 denials no longer revoke an otherwise valid
Admin view; authorization/restriction errors still lock it.

Admin Gems & Rewards is a read-only, paginated profile view using the existing
Admin/PIN-protected member endpoint. Spendable `gemBalance` is displayed separately
from `lifetimeGemsReceived` and progression computed by the existing rank helper.
Missing/invalid balances are unavailable; the existing rank rule treats an absent
lifetime field as zero qualifying gifts. Auth-only accounts have no profile
wallet to display. No global sums, purchase/promotion breakdowns, or cash
conversion are inferred from the page. No safe Admin award endpoint/ledger
currently exists, so awards are explicitly unavailable: implementing them requires
atomic balance updates, idempotency, Admin/PIN enforcement and promotional-source
records plus audit history. This section never writes balances or consent.

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
