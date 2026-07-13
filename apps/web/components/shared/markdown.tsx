import Link from "next/link";
import { Fragment, type ReactNode } from "react";

/**
 * A small, dependency-free markdown renderer for knowledge-base articles. It
 * supports the deliberately-limited subset our articles are authored in:
 * `##`/`###` headings, paragraphs, `-`/`1.` lists, **bold**, `inline code`,
 * fenced code blocks, > blockquotes, [links](/path), and `---` dividers.
 * (No tables/images/HTML — keeps the surface tiny and safe to render.)
 */
export function Markdown({ content }: { content: string }) {
  return <div className="refx-md space-y-4">{renderBlocks(content)}</div>;
}

function renderBlocks(src: string): ReactNode[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line — skip (spacing handled by container).
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block.
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(lines[i]);
        i++;
      }
      i++; // closing fence
      out.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-lg border border-white/[0.08] bg-black/30 p-3 text-xs leading-relaxed"
        >
          <code className="font-mono text-foreground/90">{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Horizontal rule.
    if (/^---+$/.test(line.trim())) {
      out.push(<hr key={key++} className="border-white/[0.08]" />);
      i++;
      continue;
    }

    // Headings.
    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    if (h) {
      const text = h[2];
      if (h[1].length === 2) {
        out.push(
          <h2 key={key++} className="mt-8 scroll-mt-24 text-xl font-bold tracking-tight">
            {renderInline(text)}
          </h2>,
        );
      } else {
        out.push(
          <h3 key={key++} className="mt-6 text-base font-semibold">
            {renderInline(text)}
          </h3>,
        );
      }
      i++;
      continue;
    }

    // Blockquote (one or more consecutive `> ` lines).
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(
        <blockquote
          key={key++}
          className="rounded-r-lg border-l-2 border-primary/60 bg-primary/[0.06] py-2 pl-4 pr-3 text-sm text-foreground/85"
        >
          {renderInline(quote.join(" "))}
        </blockquote>,
      );
      continue;
    }

    // Unordered list.
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      out.push(
        <ul key={key++} className="list-disc space-y-1.5 pl-6 text-sm text-muted-foreground">
          {items.map((it, n) => (
            <li key={n}>{renderInline(it)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list.
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      out.push(
        <ol key={key++} className="list-decimal space-y-1.5 pl-6 text-sm text-muted-foreground">
          {items.map((it, n) => (
            <li key={n}>{renderInline(it)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraph — gather consecutive non-blank, non-special lines.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    out.push(
      <p key={key++} className="text-sm leading-relaxed text-muted-foreground">
        {renderInline(para.join(" "))}
      </p>,
    );
  }

  return out;
}

function isBlockStart(line: string): boolean {
  return (
    /^(#{2,3})\s+/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^---+$/.test(line.trim()) ||
    line.trim().startsWith("```")
  );
}

/** Inline: **bold**, `code`, and [text](href). Processed left-to-right. */
function renderInline(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let rest = text;
  let key = 0;
  // Earliest of: code span, link, bold.
  const pattern = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)/;

  while (rest.length) {
    const m = pattern.exec(rest);
    if (!m) {
      nodes.push(<Fragment key={key++}>{rest}</Fragment>);
      break;
    }
    if (m.index > 0) {
      nodes.push(<Fragment key={key++}>{rest.slice(0, m.index)}</Fragment>);
    }
    const token = m[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.85em] text-foreground/90"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)!;
      const label = lm[1];
      const href = lm[2];
      // SECURITY (SEC-07): allowlist link schemes. Same-origin paths must be a
      // single leading slash (NOT "//host", which is protocol-relative and
      // off-origin); external links must be http(s)/mailto. Anything else
      // (javascript:, data:, vbscript:) renders as plain text so a KB article
      // can't smuggle a click-to-execute link.
      const internal = href.startsWith("/") && !href.startsWith("//");
      const externalOk = /^(https?:|mailto:)/i.test(href);
      if (!internal && !externalOk) {
        nodes.push(<span key={key++}>{label}</span>);
        rest = rest.slice(m.index + token.length); // keep the loop advancing
        continue;
      }
      nodes.push(
        internal ? (
          <Link key={key++} href={href} className="text-primary underline underline-offset-2 hover:text-foreground">
            {label}
          </Link>
        ) : (
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2 hover:text-foreground"
          >
            {label}
          </a>
        ),
      );
    } else {
      nodes.push(
        <strong key={key++} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    }
    rest = rest.slice(m.index + token.length);
  }

  return nodes;
}
