import type { Metadata } from "next";
import { LegalPage } from "@/components/public/legal-page";
import { LEGAL, SUBPROCESSORS } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Privacy Policy — ${LEGAL.brand}`,
  description: `How ${LEGAL.brand} collects, uses, and protects your data.`,
};

// DRAFT — review with legal counsel and fill the {{PLACEHOLDERS}} in lib/legal.ts before launch.
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`This Privacy Policy explains how ${LEGAL.entity} ("${LEGAL.brand}", "we") collects, uses, shares, and protects personal information when you use our websites, control panel, mobile apps, and hosting services. We are the data controller for the information described here.`}
    >
      <h2>1. Information we collect</h2>
      <ul>
        <li>
          <strong>Account &amp; profile:</strong> name, email address, password
          (stored only as a salted hash), and optional profile details, locale, and
          time zone.
        </li>
        <li>
          <strong>Billing &amp; tax:</strong> billing address and country/region
          (used to calculate tax), invoices, and subscription history.{" "}
          <strong>We do not store full card numbers</strong> — card and PayPal
          payments are handled by our payment processors, who return only limited
          details such as card brand, last four digits, and expiry.
        </li>
        <li>
          <strong>Security:</strong> multi-factor settings (TOTP/passkeys), API
          keys, sessions, and audit logs of significant account actions.
        </li>
        <li>
          <strong>Service data:</strong> the servers, files, configurations, and
          content you create. We process this to operate your servers; we do not
          monitor server contents except as needed for security, abuse handling, or
          legal compliance.
        </li>
        <li>
          <strong>Device &amp; usage:</strong> IP address, browser/app type, and
          log/telemetry data used for security, fraud prevention, and reliability.
        </li>
        <li>
          <strong>Push tokens (mobile app):</strong> if you enable notifications,
          we store your device&apos;s push token to deliver alerts (e.g. server
          status, billing, support replies) via Apple Push Notification service.
        </li>
      </ul>

      <h2>2. How we use information</h2>
      <ul>
        <li>To provide, operate, secure, and support the Service.</li>
        <li>To process payments, taxes, renewals, refunds, and credit.</li>
        <li>To send transactional messages (verification, receipts, alerts) and, where permitted, service updates.</li>
        <li>To prevent fraud and abuse and to comply with legal obligations.</li>
        <li>To improve reliability and performance.</li>
      </ul>
      <p>
        Where required, we rely on the following legal bases: performance of a
        contract (providing the Service), legitimate interests (security, fraud
        prevention, improvement), consent (e.g. optional push notifications and
        marketing, which you can withdraw), and legal obligation (tax, accounting).
      </p>

      <h2>3. Sharing &amp; sub-processors</h2>
      <p>
        We do not sell your personal information. We share it only with service
        providers who process data on our behalf under contract, and where required
        by law or to protect rights and safety. Our key sub-processors are:
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          {SUBPROCESSORS.map((s) => (
            <tr key={s.name}>
              <td>{s.name}</td>
              <td>{s.purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>4. International transfers</h2>
      <p>
        Your information may be processed in countries other than your own. Where we
        transfer personal data internationally, we use appropriate safeguards such as
        standard contractual clauses or equivalent mechanisms.
      </p>

      <h2>5. Data retention</h2>
      <p>
        We keep personal data for as long as your account is active and as needed to
        provide the Service. Billing and tax records are retained for the period
        required by law. Server data may be deleted after account closure or after
        any stated retention/grace period. Backups are rotated on a schedule.
      </p>

      <h2>6. Your rights</h2>
      <p>
        Depending on your location (including under the GDPR and CCPA/CPRA), you may
        have rights to access, correct, delete, port, or restrict the processing of
        your personal data, and to object or withdraw consent. You can:
      </p>
      <ul>
        <li>
          <strong>Export your data</strong> and <strong>delete your account</strong>{" "}
          directly from Account settings in the control panel; and
        </li>
        <li>
          Contact{" "}
          <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a> for any
          request. We will respond within the timeframe required by applicable law.
        </li>
      </ul>
      <p>
        You also have the right to lodge a complaint with your local data protection
        authority.
      </p>

      <h2>7. Cookies &amp; similar technologies</h2>
      <p>
        We use strictly necessary cookies and local storage to keep you signed in and
        to operate the panel, and limited analytics/telemetry to keep the Service
        reliable and secure. You can control cookies through your browser settings;
        disabling necessary cookies may break sign-in.
      </p>

      <h2>8. Children</h2>
      <p>
        The Service is not directed to children under 16 (or the minimum age in your
        jurisdiction), and we do not knowingly collect their personal data. If you
        believe a child has provided us data, contact us and we will delete it.
      </p>

      <h2>9. Security</h2>
      <p>
        We protect your information with measures including encryption in transit,
        encryption at rest for sensitive secrets, hashed passwords (Argon2id),
        multi-factor authentication, scoped access controls, and audit logging. No
        method of transmission or storage is perfectly secure, but we work to protect
        your data and to notify you of incidents as required by law.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update this Policy. Material changes will be notified through the
        Service or by email, and the &quot;Last updated&quot; date above will change.
      </p>

      <h2>11. Contact</h2>
      <p>
        {LEGAL.entity}
        {LEGAL.registeredAddress ? `, ${LEGAL.registeredAddress}` : ""} — privacy
        enquiries: <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>.
      </p>
    </LegalPage>
  );
}
