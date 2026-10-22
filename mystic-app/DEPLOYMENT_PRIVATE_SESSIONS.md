# Appointments, private video and shared Tarot — deployment notes

## Architecture
- Booking data: `readerSchedules/{readerUid}` and `bookings/{id}`. Both are `allow read, write: if false` in `firestore.rules`; only the Express server (Admin SDK) touches them. Booking id = `sha256(readerUid\0startMs)`, so a slot can be created only once inside a transaction.
- Video: browser-to-browser WebRTC. The server relays SDP/ICE through `bookings/{id}/signals`. Media never touches the server.
- Shared Tarot: `bookings/{id}/reading/state`, written only by the reader through `POST /api/scheduling/bookings/:id/call/reading`. Subcollections of `bookings` have no rule, so clients are denied. This is separate from the public `liveReadings` collection. Card ids, artwork, orientation and Past/Present/Future labels come from the same canonical `TAROT_DECK` and `TarotCardArt` as Live.
- Authorization (server): Firebase ID token, non-anonymous, participant of that booking, status `confirmed`, and inside the window from 10 minutes before the start to 15 minutes after the end. The client never receives the identity or orientation of unrevealed cards.

## Required before the first real end-to-end test
1. **Deploy the server** (Cloud Run rebuild from `Dockerfile`). Without it the new routes return 404.
2. **Firestore rules**: `firestore.rules` is unchanged by this feature, but the working-tree rules (including earlier profile/Community changes) must be published: `firebase deploy --only firestore:rules`. No new indexes are needed for these routes.
3. **TURN relay (not configured, no credentials invented)**. Without it, calls fail on symmetric NATs and many corporate or mobile networks. Set on the server:
   - `TURN_URL` (comma-separated, e.g. `turn:turn.example.com:3478,turns:turn.example.com:5349`)
   - `TURN_USERNAME`
   - `TURN_CREDENTIAL`
   Use a TURN provider (for example coturn, Twilio or Cloudflare). The credentials are sent only to authorized participants after join. Short-lived credentials would be preferable to static ones.
4. **Stripe (needed for paid appointments only; free ones do not use it)**:
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL` (public https URL).
   - In the Stripe Dashboard add the endpoint `https://<APP_URL>/api/stripe-webhook` for `checkout.session.completed`.
   - Paid bookings stay `pending_payment` (held 15 minutes) and become `confirmed` only when the verified webhook shows the correct payer and amount. Without these secrets the checkout route returns 503 and paid bookings cannot be confirmed.
   - Cancelling a paid booking does not refund automatically; refund in Stripe manually. `paid_needs_refund` and `payment_conflict` bookings need manual refunds as well.
   - Do not set `ENABLE_WEBHOOK_SIMULATION` in production.
5. Browsers need HTTPS (or localhost) for camera and microphone access.

## Automated tests
- `npx tsx test-scheduling.ts` — slot generation and validation (pure unit tests).
- `npx tsx test-private-appointment.ts` — with the server running and the service account set: room authorization, time windows, payment and cancelled states, reader-only card control, hidden-card redaction, appointment isolation, and no writes to `liveReadings`. It creates and deletes temporary users.

## Final end-to-end checklist (two real devices or browsers, after deploy)
1. Reader (approved, verified email) publishes availability. Client books a free slot.
2. At 10 minutes before the start, both open Appointments and tap Join. Confirm both videos, mic and camera toggles, End call, and reconnect (toggle airplane mode for about 10 seconds).
3. Reader draws a spread. Confirm the client sees face-down cards, and sees each card only after the reader reveals it, with the same orientation. Confirm only the reader sees the meanings.
4. Test from a cellular network to confirm TURN works.
5. Paid: book, pay with Stripe test mode, and confirm the booking becomes `confirmed` only after the webhook. Then try an outsider account against the room and reading URLs and confirm 404.
