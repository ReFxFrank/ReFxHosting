import type { Metadata } from "next";
import { LegalPage } from "@/components/public/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Terms of Service — ${LEGAL.brand}`,
  description: `The terms governing your use of ${LEGAL.brand}.`,
};

// DRAFT — review with legal counsel and fill the {{PLACEHOLDERS}} in lib/legal.ts before launch.
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These Terms of Service ("Terms") are a binding agreement between you and ${LEGAL.entity} ("${LEGAL.brand}", "we", "us"), governing your access to and use of the ${LEGAL.brand} websites, control panel, mobile apps, and game/voice server hosting services (the "Service"). By creating an account or using the Service, you agree to these Terms.`}
    >
      <h2>1. Eligibility &amp; accounts</h2>
      <p>
        You must be at least 18 years old, or the age of majority in your
        jurisdiction, and able to form a binding contract. You are responsible
        for the accuracy of your account information, for keeping your
        credentials secure, and for all activity under your account. Notify us
        immediately of any unauthorised use. We offer multi-factor authentication
        and encourage you to enable it.
      </p>

      <h2>2. The Service</h2>
      <p>
        We provide on-demand hosting for game and voice servers, including the
        ability to switch the game running on a server while retaining its
        identity, storage, backups, and subscription. Specifications, resources,
        and features depend on the plan and hardware tier you select. We may
        modify, improve, or discontinue features over time; material changes to a
        paid plan will be communicated in advance where reasonably possible.
      </p>

      <h2>3. Acceptable use</h2>
      <p>
        Your use of the Service is subject to our{" "}
        <a href="/acceptable-use">Acceptable Use Policy</a>, which is incorporated
        into these Terms. You are solely responsible for the content, software,
        mods, and data you upload, run, or distribute through your servers, and
        for your end users&apos; conduct. You must hold all rights and licences
        required for the games, mods, and content you deploy.
      </p>

      <h2>4. Fees, billing &amp; renewals</h2>
      <ul>
        <li>
          <strong>Subscriptions</strong> renew automatically each billing period
          (weekly through annual, as selected) until cancelled. By subscribing you
          authorise us and our payment processors to charge your selected payment
          method on each renewal.
        </li>
        <li>
          <strong>Prices</strong> are shown at checkout in the listed currency and
          may exclude taxes, which are calculated based on your billing address.
          You must provide accurate billing and tax information.
        </li>
        <li>
          <strong>Plan changes</strong> may be prorated. Upgrades are typically
          invoiced immediately and take effect once paid; downgrades typically take
          effect at the next renewal. Coupons, gift cards, and account credit apply
          as described at checkout.
        </li>
        <li>
          <strong>Non-payment</strong> may result in suspension and, after a grace
          period, termination of the affected servers and deletion of their data.
        </li>
      </ul>
      <p>
        Refunds and cancellations are governed by our{" "}
        <a href="/refunds">Refund &amp; Cancellation Policy</a>.
      </p>

      <h2>5. Your content &amp; backups</h2>
      <p>
        You retain ownership of the data you store on the Service. You grant us the
        limited licence to host, copy, transmit, and back up that data solely to
        operate and support the Service. While we provide backup features, you are
        responsible for maintaining your own copies of important data. We are not
        liable for data loss except as required by law.
      </p>

      <h2>6. Suspension &amp; termination</h2>
      <p>
        We may suspend or terminate your access for violation of these Terms or the
        Acceptable Use Policy, for non-payment, to comply with law, or to protect
        the Service, our users, or third parties. You may cancel at any time from
        the control panel. On termination, your right to use the Service ends and
        associated data may be deleted after any stated retention period.
      </p>

      <h2>7. Third-party services</h2>
      <p>
        The Service integrates third parties such as payment processors (Stripe,
        PayPal), game platforms (e.g. Steam), and app stores. Your use of those
        services is subject to their terms. We are not responsible for third-party
        services or content.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        The Service is provided <strong>&quot;as is&quot;</strong> and{" "}
        <strong>&quot;as available&quot;</strong> without warranties of any kind,
        whether express or implied, including merchantability, fitness for a
        particular purpose, and non-infringement, to the maximum extent permitted
        by law. We do not warrant that the Service will be uninterrupted, secure,
        or error-free.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, {LEGAL.brand} will not be liable
        for any indirect, incidental, special, consequential, or punitive damages,
        or for lost profits, revenue, data, or goodwill. Our aggregate liability
        arising out of or relating to the Service will not exceed the amounts you
        paid us for the Service in the three (3) months preceding the event giving
        rise to the claim.
      </p>

      <h2>10. Indemnity</h2>
      <p>
        You agree to indemnify and hold harmless {LEGAL.brand} from claims, losses,
        and expenses (including reasonable legal fees) arising from your content,
        your use of the Service, or your violation of these Terms or applicable
        law.
      </p>

      <h2>11. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be
        notified through the Service or by email. Your continued use after changes
        take effect constitutes acceptance.
      </p>

      <h2>12. Governing law</h2>
      <p>
        These Terms are governed by the laws of {LEGAL.jurisdiction}, without
        regard to conflict-of-laws rules, and the courts located there will have
        jurisdiction, except where mandatory consumer-protection laws of your
        residence provide otherwise.
      </p>

      <h2>13. Contact</h2>
      <p>
        {LEGAL.entity}
        {LEGAL.registeredAddress ? `, ${LEGAL.registeredAddress}` : ""} —{" "}
        <a href={`mailto:${LEGAL.legalEmail}`}>{LEGAL.legalEmail}</a>.
      </p>
    </LegalPage>
  );
}
