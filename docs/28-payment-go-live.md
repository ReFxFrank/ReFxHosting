# Payment go-live — sandbox verification

The billing engine (charge → settle → provision → renew → dunning/suspend →
refund) is implemented and unit/e2e-tested with mocked gateways. Before taking
real money, verify the **live wiring** against Stripe **test mode** and PayPal
**sandbox**. Nothing here needs code changes — it's config + a scripted run.

## 0. Prerequisites

1. **Keys** (Owner → Payments, or env):
   - Stripe: `sk_test_…` + publishable `pk_test_…`, and the **webhook signing
     secret** `whsec_…` for your endpoint.
   - PayPal: sandbox `client id` + `secret`, `PAYPAL_MODE=sandbox`.
2. **Register the webhook endpoints** in each dashboard (public HTTPS, through the
   reverse proxy — these are the two paths kept OUT of the `/docs`/`/metrics`
   block):
   - Stripe → `https://api.<domain>/api/v1/billing/webhooks/stripe`
   - PayPal → `https://api.<domain>/api/v1/billing/webhooks/paypal`
3. **Enable these events:**
   - Stripe: `checkout.session.completed`, `payment_intent.succeeded`,
     `invoice.payment_succeeded`, `invoice.payment_failed`, `charge.failed`,
     `charge.refunded`.
   - PayPal: `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.SALE.COMPLETED`,
     `PAYMENT.CAPTURE.REFUNDED`, `BILLING.SUBSCRIPTION.CANCELLED`,
     `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.EXPIRED`.
4. Local relay (optional, for a laptop): `stripe listen --forward-to
localhost:4000/api/v1/billing/webhooks/stripe`.

## 1. Stripe — full lifecycle

Use test cards: `4242 4242 4242 4242` (success), `4000 0000 0000 0341`
(off-session renewal **fails**), `4000 0025 0000 3155` (requires SCA).

| Step             | Do                                                                         | Expect                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Purchase         | Order a plan → hosted checkout → pay with 4242                             | `checkout.session.completed` → invoice **PAID**, a SUCCEEDED `Payment`, server leaves `PENDING_PAYMENT` → **INSTALLING → OFFLINE**       |
| Provision        | Watch the server                                                           | Installs on the node; console reachable                                                                                                  |
| Save card        | Complete a purchase with "save card"                                       | A default `PaymentMethod` stored (SetupIntent)                                                                                           |
| Renewal (ok)     | Force the sub's period end + run the hourly sweep (or `BILLING_SCHEDULER`) | Off-session charge succeeds → new period invoice PAID                                                                                    |
| Renewal (fail)   | Set the saved card to `…0341`, renew                                       | `charge.failed`/decline → sub **PAST_DUE**, dunning email, servers **SUSPENDED** (container killed, SFTP revoked, console/files blocked) |
| Recover          | Pay the past-due invoice                                                   | Sub **ACTIVE**, servers **unsuspend** (SFTP restored)                                                                                    |
| Refund           | Admin → invoice → **Refund** (full and partial)                            | Money back on the card; a REFUNDED `Payment`; full → invoice **REFUNDED**                                                                |
| Dashboard refund | Refund in the Stripe dashboard instead                                     | `charge.refunded` webhook records the same REFUNDED `Payment` (idempotent)                                                               |

## 2. PayPal — sandbox

Use a **sandbox buyer** account.

| Step           | Do                                 | Expect                                                                                                                     |
| -------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| One-off        | Pay an order with PayPal           | Order captured → `PAYMENT.CAPTURE.COMPLETED` → invoice PAID → provision                                                    |
| Recurring      | Pay a fixed-price plan with PayPal | A PayPal product+plan+subscription is created; each cycle `PAYMENT.SALE.COMPLETED` settles the period invoice + provisions |
| Cancel/suspend | Cancel the sub in PayPal           | `BILLING.SUBSCRIPTION.CANCELLED/SUSPENDED` mirrors to our sub                                                              |
| Refund         | Admin → invoice → **Refund**       | Resolves the capture id and refunds it; REFUNDED `Payment` recorded                                                        |

> PayPal subscriptions bill at the **plan (tax-free) price** and don't combine
> with coupons/gift-cards/credit or per-slot (voice) orders — those fall back to
> the one-time PayPal checkout. Verify tax on **card** orders, not PayPal subs.

## 3. Cross-cutting checks

- **Idempotency:** re-deliver a `*.completed` webhook (dashboard "resend") — the
  invoice must NOT double-pay and the plan change must NOT re-apply.
- **Tax:** order from a taxed billing address → the gateway total includes the
  computed VAT/GST/US tax (shown before checkout).
- **Signature:** a webhook with a bad signature → **400**, no state change.
- **No-map:** a `charge.failed` we can't map to an invoice logs a warning and is
  ignored (see `resolveInvoice`).

## 4. Flip to live

Swap test/sandbox keys for **live** keys, set `PAYPAL_MODE=live`, re-register the
webhook endpoints with live secrets, and do ONE real low-value purchase +
self-refund end to end before opening the storefront.
