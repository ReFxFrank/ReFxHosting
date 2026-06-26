import Link from "next/link";
import { LEGAL } from "@/lib/legal";

/**
 * Shared chrome for the policy pages (terms / privacy / acceptable-use /
 * refunds). Styles nested headings, paragraphs and lists so each page can be
 * written as plain JSX without repeating typographic classes.
 */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
      <p className="refx-eyebrow">Legal</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Last updated: {LEGAL.effectiveDate}
      </p>
      {intro ? <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{intro}</p> : null}

      <div
        className="mt-10 space-y-5 text-sm leading-relaxed text-muted-foreground
          [&_h2]:mt-10 [&_h2]:scroll-mt-24 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground
          [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-foreground
          [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6
          [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6
          [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2
          [&_strong]:font-semibold [&_strong]:text-foreground
          [&_table]:w-full [&_td]:border-t [&_td]:border-white/[0.06] [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top
          [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:text-foreground"
      >
        {children}
      </div>

      <div className="mt-12 border-t border-white/[0.06] pt-6 text-xs text-muted-foreground">
        <p>
          Questions about this policy? Contact{" "}
          <a href={`mailto:${LEGAL.contactEmail}`} className="text-foreground underline">
            {LEGAL.contactEmail}
          </a>
          .
        </p>
        <p className="mt-2">
          See also:{" "}
          <Link href="/terms" className="underline">Terms</Link> ·{" "}
          <Link href="/privacy" className="underline">Privacy</Link> ·{" "}
          <Link href="/acceptable-use" className="underline">Acceptable Use</Link> ·{" "}
          <Link href="/refunds" className="underline">Refunds &amp; Cancellation</Link>
        </p>
      </div>
    </article>
  );
}
