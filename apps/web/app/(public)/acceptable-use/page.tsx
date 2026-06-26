import type { Metadata } from "next";
import { LegalPage } from "@/components/public/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Acceptable Use Policy — ${LEGAL.brand}`,
  description: `What you may and may not do on ${LEGAL.brand}.`,
};

// DRAFT — review with legal counsel and fill the {{PLACEHOLDERS}} in lib/legal.ts before launch.
export default function AcceptableUsePage() {
  return (
    <LegalPage
      title="Acceptable Use Policy"
      intro={`This Acceptable Use Policy ("AUP") sets out activities that are prohibited on the ${LEGAL.brand} Service. It is part of our Terms of Service. We may update it to address new forms of abuse. Violations may result in content removal, suspension, or termination without refund, and referral to authorities where appropriate.`}
    >
      <h2>1. Prohibited content</h2>
      <p>You may not use the Service to host, store, transmit, or distribute:</p>
      <ul>
        <li>Content that is illegal in any relevant jurisdiction.</li>
        <li>Child sexual abuse material (CSAM) or any sexual content involving minors — reported immediately to authorities.</li>
        <li>Content that infringes intellectual property, including pirated games, software, or unlicensed mods/assets.</li>
        <li>Malware, ransomware, exploits, phishing kits, or credential-harvesting pages.</li>
        <li>Content that promotes terrorism, violent extremism, or unlawful threats to others.</li>
      </ul>

      <h2>2. Prohibited conduct</h2>
      <ul>
        <li>
          <strong>Network abuse:</strong> denial-of-service (DoS/DDoS) attacks,
          port scanning, packet flooding, spoofing, or reflection/amplification —
          whether as source or intermediary.
        </li>
        <li>
          <strong>Unauthorised access:</strong> attempting to access systems,
          accounts, or data you are not authorised to access, including other
          tenants&apos; servers or our infrastructure.
        </li>
        <li>
          <strong>Spam &amp; fraud:</strong> bulk unsolicited messaging, payment
          fraud, chargeback abuse, or use of stolen payment methods.
        </li>
        <li>
          <strong>Resource abuse:</strong> cryptocurrency mining without prior
          written approval, deliberately evading plan limits, or activity that
          materially degrades shared infrastructure or other customers.
        </li>
        <li>
          <strong>Circumvention:</strong> evading suspensions, bans, quotas, or
          security controls.
        </li>
      </ul>

      <h2>3. Game &amp; mod licensing</h2>
      <p>
        You are responsible for ensuring you have the rights and licences required
        to run any game, server software, mod, plugin, or workshop content you
        deploy, and for complying with the applicable platform terms (for example,
        Steam, game publishers, and mod platforms). Do not use the Service to
        distribute game files you are not licensed to distribute.
      </p>

      <h2>4. Security &amp; cooperation</h2>
      <p>
        Keep your servers and software reasonably up to date and secured. You must
        not run open relays or knowingly operate compromised servers. We may take
        protective action — including isolating or suspending a server — to address
        active abuse, security incidents, or threats to the platform.
      </p>

      <h2>5. Reporting abuse</h2>
      <p>
        To report a violation, contact{" "}
        <a href={`mailto:${LEGAL.legalEmail}`}>{LEGAL.legalEmail}</a> with the server
        or content details and a description of the issue. We investigate reports and
        take appropriate action.
      </p>

      <h2>6. Enforcement</h2>
      <p>
        We may remove content, throttle or isolate resources, suspend, or terminate
        accounts that violate this AUP, with or without notice depending on severity.
        Serious or illegal violations may be reported to law enforcement. Termination
        for AUP violations is not eligible for a refund.
      </p>
    </LegalPage>
  );
}
