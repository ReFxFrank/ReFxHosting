/**
 * ReFx "Glassy" transactional email templates.
 *
 * One reusable, email-client-safe layout (`buildEmail`) that every transactional
 * email is composed from, returning BOTH an HTML and a plain-text version from a
 * single structured description. Built for real-world email clients:
 *   - all styling is inline (no <style>/external CSS, no backdrop-filter)
 *   - table-based layout for the wrapper + the CTA button
 *   - a flat dark "glass" card (no gradients the client might drop)
 *   - a bulletproof button with a visible raw-link fallback underneath
 *   - a hidden preheader + a generated plain-text part
 *
 * Dynamic, user-controlled values (e.g. a first name) are HTML-escaped via
 * {@link esc}; body paragraphs are treated as trusted server-built HTML.
 */

// Two brand palettes. The CTA accent (#0072ff) is identical in both so emails
// stay recognisably ReFx whichever theme is selected. DARK matches the site;
// LIGHT is the safe choice for clients (e.g. Gmail) that fight dark emails.
const DARK = {
  bg: '#050814',
  card: '#0a1224',
  border: 'rgba(120, 180, 255, 0.25)',
  primary: '#0072ff',
  secondary: '#00aaff',
  textPrimary: '#ffffff',
  textSecondary: '#a9b8d0',
  muted: '#6f7d95',
  danger: '#ef4444',
  success: '#22c55e',
} as const;

const LIGHT = {
  bg: '#eef2f9',
  card: '#ffffff',
  border: '#d8e2f0',
  primary: '#0072ff',
  secondary: '#0072ff',
  textPrimary: '#0a1224',
  textSecondary: '#42526b',
  muted: '#8a97ad',
  danger: '#dc2626',
  success: '#16a34a',
} as const;

export type EmailTheme = 'dark' | 'light';

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export type EmailAccent = 'primary' | 'danger' | 'success';

export interface EmailButton {
  label: string;
  url: string;
}

export interface BrandedEmail {
  /** Card heading. */
  title: string;
  /** Optional greeting line, e.g. "Hi Frank,". HTML-escaped. */
  greeting?: string;
  /** Body paragraphs shown before the CTA (trusted HTML). */
  intro: string[];
  /** Optional call-to-action button. */
  button?: EmailButton;
  /** Raw link shown under the button (defaults to button.url). */
  fallbackUrl?: string;
  /** Paragraphs shown after the CTA, e.g. a security note (trusted HTML). */
  outro?: string[];
  /** Accent colour for the button + top glow bar. */
  accent?: EmailAccent;
  /** Hidden inbox-preview text. */
  preheader?: string;
  /** Absolute URL of the ReFx logo PNG for the header (falls back to a wordmark). */
  logoUrl?: string;
  /** Visual theme — defaults to dark (the site's scheme). */
  theme?: EmailTheme;
}

/** Escape a string for safe interpolation into HTML. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strip tags so HTML paragraphs degrade to readable plain text. */
function stripTags(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Render a {@link BrandedEmail} into `{ html, text }`. The subject is owned by
 * the caller (it isn't part of the body).
 */
export function buildEmail(c: BrandedEmail): { html: string; text: string } {
  const COLOR = c.theme === 'light' ? LIGHT : DARK;
  const accent =
    c.accent === 'danger'
      ? COLOR.danger
      : c.accent === 'success'
        ? COLOR.success
        : COLOR.primary;
  const paras = (arr: string[] | undefined, color: string) =>
    (arr ?? [])
      .map(
        (p) =>
          `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:${color};">${p}</p>`,
      )
      .join('');

  const greeting = c.greeting
    ? `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:${COLOR.textPrimary};">${esc(
        c.greeting,
      )}</p>`
    : '';

  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 18px;">
        <tr>
          <td align="center" bgcolor="${accent}" style="border-radius:10px;">
            <a href="${esc(c.button.url)}" target="_blank" rel="noopener"
               style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">
              ${esc(c.button.label)}
            </a>
          </td>
        </tr>
      </table>`
    : '';

  const fallbackUrl = c.fallbackUrl ?? c.button?.url;
  const fallback = fallbackUrl
    ? `<p style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:1.5;color:${COLOR.muted};">
         If the button doesn't work, copy and paste this link into your browser:
       </p>
       <p style="margin:0 0 18px;font-family:${FONT};font-size:12px;line-height:1.6;word-break:break-all;">
         <a href="${esc(fallbackUrl)}" target="_blank" rel="noopener" style="color:${COLOR.secondary};text-decoration:underline;">${esc(
           fallbackUrl,
         )}</a>
       </p>`
    : '';

  const preheader = c.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${COLOR.bg};">${esc(
        c.preheader,
      )}</div>`
    : '';

  const year = new Date().getFullYear();

  const header = c.logoUrl
    ? `<img src="${esc(c.logoUrl)}" alt="ReFx Hosting" height="30" style="height:30px;width:auto;border:0;outline:none;text-decoration:none;display:inline-block;" />`
    : `<span style="font-family:${FONT};font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${COLOR.textPrimary};">
         <span style="color:${COLOR.secondary};">ReFx</span>&nbsp;Hosting
       </span>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark light" />
  <meta name="supported-color-schemes" content="dark light" />
  <title>${esc(c.title)}</title>
</head>
<body bgcolor="${COLOR.bg}" style="margin:0;padding:0;background-color:${COLOR.bg};">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.bg}" style="background-color:${COLOR.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
          <!-- Brand header -->
          <tr>
            <td align="center" style="padding:8px 0 22px;">
              ${header}
            </td>
          </tr>
          <!-- Glass card -->
          <tr>
            <td bgcolor="${COLOR.card}" style="background-color:${COLOR.card};border:1px solid ${COLOR.border};border-radius:16px;overflow:hidden;">
              <!-- accent glow bar -->
              <div style="height:3px;background-color:${accent};line-height:3px;font-size:3px;">&nbsp;</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:32px 34px 30px;">
                    <h1 style="margin:0 0 18px;font-family:${FONT};font-size:21px;font-weight:700;line-height:1.3;color:${COLOR.textPrimary};">${esc(
                      c.title,
                    )}</h1>
                    ${greeting}
                    ${paras(c.intro, COLOR.textSecondary)}
                    ${button}
                    ${fallback}
                    ${paras(c.outro, COLOR.muted)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:22px 16px 8px;">
              <p style="margin:0 0 4px;font-family:${FONT};font-size:12px;line-height:1.5;color:${COLOR.muted};">
                ReFx Hosting — multi-game server hosting.
              </p>
              <p style="margin:0;font-family:${FONT};font-size:11px;line-height:1.5;color:${COLOR.muted};">
                &copy; ${year} ReFx Hosting. This is an automated message — please don't reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Plain-text equivalent.
  const lines: string[] = ['ReFx Hosting', '', c.title, ''];
  if (c.greeting) lines.push(c.greeting, '');
  for (const p of c.intro) lines.push(stripTags(p), '');
  if (c.button) lines.push(`${c.button.label}: ${c.button.url}`, '');
  else if (fallbackUrl) lines.push(fallbackUrl, '');
  for (const p of c.outro ?? []) lines.push(stripTags(p), '');
  lines.push('—', `ReFx Hosting · © ${year}`, 'Automated message — please do not reply.');
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  return { html, text };
}
