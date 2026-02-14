# ATQR Functions

Firebase Cloud Functions backend for ATQR SaaS.

Handles Stripe webhooks, subscription lifecycle, and backend business logic.

---

## Responsibilities

- Stripe Checkout session handling
- Subscription activation & cancellation
- Trial period management
- Firestore user role updates
- Future: dynamic QR resolution system

---

## Tech Stack

- Firebase Cloud Functions
- Node.js
- Stripe SDK
- Firestore Admin SDK

---

## Core Flow

1. User completes Stripe Checkout
2. Stripe sends webhook event
3. Function verifies event
4. Firestore user document updated
5. Access level adjusted in platform

---

## Example Handled Events

- checkout.session.completed
- invoice.payment_succeeded
- customer.subscription.deleted
- customer.subscription.updated

---

## Local Development

```bash
firebase emulators:start
```

---

## Requires:

- Firebase project config
- Stripe webhook secret

---

### Status

- Stable billing integration.
- Dynamic QR redirection logic planned.
