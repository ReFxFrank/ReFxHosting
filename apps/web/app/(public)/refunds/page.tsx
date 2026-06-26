import type { Metadata } from "next";
import { LegalPage } from "@/components/public/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Refund & Cancellation Policy — ${LEGAL.brand}`,
  description: `How cancellations, refunds, and account credit work at ${LEGAL.brand}.`,
};

// DRAFT — review with legal counsel and set the legal values via env (see
// .env.production.example) before launch. Until then {{PLACEHOLDERS}} render verbatim.
export default function RefundsPage() {
  return (
    <LegalPage
      title="Refund & Cancellation Policy"
      intro={`This policy explains how subscriptions are cancelled and when refunds or account credit may apply. It forms part of our Terms of Service. Nothing here limits rights you may have under mandatory consumer-protection law in your country.`}
    >
      <h2>1. Cancelling a subscription</h2>
      <p>
        You can cancel any subscription at any time from the control panel.
        Cancellation stops future renewals. Unless stated otherwise, your server
        remains active until the end of the current paid period, after which it is
        suspended and later deleted.
      </p>

      <h2>2. Money-back window for new orders</h2>
      <p>
        New eligible subscriptions may be refunded if you request a refund within{" "}
        <strong>{LEGAL.refundWindow}</strong> of the initial
        purchase and the service has not been abused. To request a refund, contact{" "}
        <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a> from the
        email on your account. Where consumer law grants a longer withdrawal period
        (for example, the EU/UK right of withdrawal), that period applies.
      </p>

      <h2>3. Renewals</h2>
      <p>
        Renewal charges are generally <strong>non-refundable</strong>. Please cancel
        before your renewal date if you do not wish to be charged. As a courtesy we
        may, at our discretion, issue account credit for a renewal cancelled shortly
        after it was charged.
      </p>

      <h2>4. Plan changes, coupons &amp; credit</h2>
      <ul>
        <li>
          <strong>Upgrades</strong> are charged on a prorated basis and take effect
          once the upgrade invoice is paid.
        </li>
        <li>
          <strong>Downgrades</strong> take effect at the next renewal; the
          difference is not refunded for the current period (you keep the resources
          you paid for until the period rolls over).
        </li>
        <li>
          <strong>Account credit, gift cards, and coupons</strong> are not
          redeemable for cash and are non-refundable, except where required by law.
          Credit is applied automatically to future invoices.
        </li>
      </ul>

      <h2>5. Non-refundable situations</h2>
      <ul>
        <li>Accounts terminated for violating the Terms or Acceptable Use Policy.</li>
        <li>Add-ons or usage already consumed (e.g. one-off services).</li>
        <li>Amounts paid with promotional credit, gift cards, or coupons.</li>
        <li>Chargeback or payment-fraud situations, which may also lead to suspension.</li>
      </ul>

      <h2>6. How refunds are issued</h2>
      <p>
        Approved refunds are returned to the original payment method where possible,
        or issued as account credit. Processing times depend on your payment
        provider. Taxes are refunded in line with the refunded amount where
        applicable.
      </p>

      <h2>7. Contact</h2>
      <p>
        For billing questions or refund requests, contact{" "}
        <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
      </p>
    </LegalPage>
  );
}
