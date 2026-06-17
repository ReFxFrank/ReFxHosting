import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions } from 'nodemailer';
import { SettingsService } from '../platform/settings.service';
import { buildEmail } from './email-templates';

export interface MailRecipient {
  email: string;
  firstName?: string | null;
}

/**
 * Transactional email delivery via nodemailer.
 *
 * When SMTP is configured (SMTP_HOST set) a real SMTP transport is used.
 * Otherwise — dev/test — we fall back to nodemailer's `jsonTransport`, which
 * never opens a socket: messages are serialized and logged so they're visible
 * in the console without any external dependency. The service never throws on a
 * delivery failure (auth flows must not break because email is down); failures
 * are logged instead.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly panelUrl: string;
  /** Cached transporter + the config signature it was built from. */
  private transporter?: Transporter;
  private cachedSig = '';
  private cachedConfigured = false;

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {
    this.panelUrl = (
      this.config.get<string>('panelUrl') ?? 'http://localhost:3000'
    ).replace(/\/+$/, '');
  }

  /**
   * Build (or reuse) a transporter from the EFFECTIVE SMTP config (the
   * owner-editable settings, falling back to env). Rebuilds only when the config
   * changes, so saving new SMTP settings in the panel takes effect immediately
   * without a restart. With no host configured it uses jsonTransport (logs only).
   */
  private async transport(): Promise<{ transporter: Transporter; from: string; configured: boolean }> {
    const cfg = await this.settings.emailConfig();
    const configured = Boolean(cfg.host);
    const sig = JSON.stringify([
      cfg.host,
      cfg.port,
      cfg.user,
      cfg.password ? 'set' : '',
      cfg.secure,
    ]);
    if (!this.transporter || sig !== this.cachedSig) {
      this.transporter = configured
        ? nodemailer.createTransport({
            host: cfg.host,
            // Implicit TLS on 465; STARTTLS on 587/25. If `secure` wasn't set
            // explicitly, infer it from the port so a common 465/587 mismatch
            // (the usual cause of a hanging "test email") just works.
            port: cfg.port,
            secure: cfg.secure || cfg.port === 465,
            // Enforce STARTTLS when not using implicit TLS (e.g. port 587).
            requireTLS: !(cfg.secure || cfg.port === 465),
            auth:
              cfg.user || cfg.password
                ? { user: cfg.user, pass: cfg.password }
                : undefined,
            // Fail fast with a real error instead of hanging when the port is
            // blocked or the host is wrong (cloud providers often block SMTP).
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 20_000,
          })
        : nodemailer.createTransport({ jsonTransport: true });
      this.cachedSig = sig;
      this.cachedConfigured = configured;
      this.logger.log(
        configured
          ? `SMTP transport ready (${cfg.host}:${cfg.port})`
          : 'SMTP not configured — using jsonTransport (emails logged, not sent).',
      );
    }
    return {
      transporter: this.transporter,
      from: cfg.from || 'ReFx Hosting <no-reply@refx.example>',
      configured: this.cachedConfigured,
    };
  }

  /** Send a test email to verify SMTP settings. Throws a descriptive error (so the UI can report it). */
  async sendTest(to: string): Promise<{ delivered: boolean }> {
    const { transporter, from, configured } = await this.transport();
    if (!configured) {
      throw new BadRequestException(
        'Email is not configured yet — set an SMTP host (e.g. smtp.resend.com) and save before sending a test.',
      );
    }
    const { html, text } = buildEmail({
      title: 'SMTP test successful',
      accent: 'success',
      preheader: 'Your ReFx Hosting SMTP settings are working.',
      intro: [
        'This is a test email confirming your SMTP settings are configured correctly. 🎉',
        'Transactional emails — verification, password resets, receipts — will be delivered from here.',
      ],
    });
    try {
      await transporter.sendMail({
        from,
        to,
        subject: 'ReFx Hosting — SMTP test',
        text,
        html,
      });
    } catch (err) {
      const detail = (err as Error).message ?? 'unknown error';
      this.logger.warn(`Test email to ${to} failed: ${detail}`);
      // Surface the provider's own reason (auth failure, blocked port, unverified
      // sender domain, …) instead of a generic 500 so the owner can fix it.
      throw new BadGatewayException(`Could not send test email: ${detail}`);
    }
    return { delivered: configured };
  }

  // ---- public helpers ----------------------------------------------------

  async sendPasswordReset(user: MailRecipient, token: string): Promise<void> {
    const link = `${this.panelUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
    const { html, text } = buildEmail({
      title: 'Reset your password',
      greeting: user.firstName ? `Hi ${user.firstName},` : 'Hello,',
      preheader: 'Reset your ReFx Hosting password — this link expires in 1 hour.',
      intro: [
        'We received a request to reset your ReFx Hosting password. Use the button below to choose a new one.',
        'This link expires in <strong>1 hour</strong> and can only be used once.',
      ],
      button: { label: 'Reset password', url: link },
      outro: [
        "If you didn't request this, you can safely ignore this email — your password won't change.",
      ],
    });
    await this.sendGeneric({
      to: user.email,
      subject: 'Reset your ReFx Hosting password',
      text,
      html,
    });
  }

  async sendEmailVerification(
    user: MailRecipient,
    token: string,
  ): Promise<void> {
    const link = `${this.panelUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const { html, text } = buildEmail({
      title: 'Verify your email',
      greeting: user.firstName ? `Hi ${user.firstName},` : 'Welcome to ReFx Hosting,',
      preheader: 'Confirm your email to activate your ReFx Hosting account.',
      intro: [
        'Please verify your email address to activate your account and access your hosting panel.',
        'This link expires in <strong>24 hours</strong>.',
      ],
      button: { label: 'Verify Email', url: link },
      outro: [
        'If you did not create a ReFx Hosting account, you can safely ignore this email.',
      ],
    });
    await this.sendGeneric({
      to: user.email,
      subject: 'Verify your ReFx Hosting email',
      text,
      html,
    });
  }

  /** Welcome email after a customer verifies their address. */
  async sendWelcome(user: MailRecipient): Promise<void> {
    const { html, text } = buildEmail({
      title: 'Welcome to ReFx Hosting',
      greeting: user.firstName ? `Hi ${user.firstName},` : 'Welcome,',
      accent: 'success',
      preheader: 'Your account is verified and ready to go.',
      intro: [
        'Your email is verified and your account is ready. Deploy a server, manage billing, and open support tickets any time from your dashboard.',
      ],
      button: { label: 'Open your dashboard', url: `${this.panelUrl}/dashboard` },
      outro: ['Happy hosting!'],
    });
    await this.sendGeneric({
      to: user.email,
      subject: 'Welcome to ReFx Hosting',
      text,
      html,
    });
  }

  /** Receipt after a successful payment. */
  async sendPaymentReceipt(
    user: MailRecipient,
    invoice: { number: number | string; amountMinor: number; currency: string },
  ): Promise<void> {
    const amount = this.money(invoice.amountMinor, invoice.currency);
    const { html, text } = buildEmail({
      title: 'Payment received',
      greeting: user.firstName ? `Hi ${user.firstName},` : 'Hello,',
      accent: 'success',
      preheader: `Payment received for invoice ${invoice.number}.`,
      intro: [
        `We've received your payment of <strong>${amount}</strong> for invoice <strong>${invoice.number}</strong>. Thank you!`,
      ],
      button: { label: 'View your invoices', url: `${this.panelUrl}/billing` },
    });
    await this.sendGeneric({
      to: user.email,
      subject: `Payment received — invoice ${invoice.number}`,
      text,
      html,
    });
  }

  /** Notice when a payment attempt fails (dunning). */
  async sendPaymentFailed(
    user: MailRecipient,
    invoice: {
      number: number | string;
      amountMinor: number;
      currency: string;
      reason?: string;
    },
  ): Promise<void> {
    const amount = this.money(invoice.amountMinor, invoice.currency);
    const reason = invoice.reason ? ` (${invoice.reason})` : '';
    const { html, text } = buildEmail({
      title: 'Payment failed',
      greeting: user.firstName ? `Hi ${user.firstName},` : 'Hello,',
      accent: 'danger',
      preheader: `We couldn't process your payment for invoice ${invoice.number}.`,
      intro: [
        `We couldn't process your payment of <strong>${amount}</strong> for invoice <strong>${invoice.number}</strong>${reason}.`,
        'Please update your payment method or pay the invoice to avoid service interruption.',
      ],
      button: { label: 'Go to billing', url: `${this.panelUrl}/billing` },
    });
    await this.sendGeneric({
      to: user.email,
      subject: `Payment failed — invoice ${invoice.number}`,
      text,
      html,
    });
  }

  /** Proactive reminder that a subscription is about to renew. */
  async sendRenewalReminder(
    user: MailRecipient,
    sub: {
      productName: string;
      amountMinor: number;
      currency: string;
      renewsAt: Date;
      hasPaymentMethod: boolean;
    },
  ): Promise<void> {
    const amount = this.money(sub.amountMinor, sub.currency);
    const date = sub.renewsAt.toISOString().slice(0, 10);
    const action = sub.hasPaymentMethod
      ? `We'll automatically charge your saved payment method on that date.`
      : `You don't have a saved payment method — please add one so your service isn't interrupted.`;
    const { html, text } = buildEmail({
      title: 'Upcoming renewal',
      greeting: user.firstName ? `Hi ${user.firstName},` : 'Hello,',
      preheader: `Your ${sub.productName} renews on ${date}.`,
      intro: [
        `Your <strong>${sub.productName}</strong> subscription renews on <strong>${date}</strong> for <strong>${amount}</strong>. ${action}`,
      ],
      button: { label: 'Manage billing', url: `${this.panelUrl}/billing` },
    });
    await this.sendGeneric({
      to: user.email,
      subject: `Your ${sub.productName} renews on ${date}`,
      text,
      html,
    });
  }

  /** Warn that a saved card is expiring so renewals don't fail. */
  async sendCardExpiring(
    user: MailRecipient,
    card: { brand: string | null; last4: string | null; expMonth: number; expYear: number },
  ): Promise<void> {
    const label = `${card.brand ?? 'card'} ending ${card.last4 ?? '••••'}`;
    const exp = `${String(card.expMonth).padStart(2, '0')}/${card.expYear}`;
    const { html, text } = buildEmail({
      title: 'Your card is expiring soon',
      greeting: user.firstName ? `Hi ${user.firstName},` : 'Hello,',
      preheader: `Your ${label} expires ${exp}.`,
      intro: [
        `Your <strong>${label}</strong> expires <strong>${exp}</strong>. Add an up-to-date card so your automatic renewals keep working.`,
      ],
      button: { label: 'Update payment method', url: `${this.panelUrl}/billing` },
    });
    await this.sendGeneric({
      to: user.email,
      subject: 'Your saved card is expiring soon',
      text,
      html,
    });
  }

  /** Format integer minor units as a currency string (e.g. 1999 USD → "19.99 USD"). */
  private money(amountMinor: number, currency: string): string {
    return `${(amountMinor / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }

  async sendGeneric(opts: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<void> {
    let transporter: Transporter;
    let from: string;
    let configured: boolean;
    try {
      ({ transporter, from, configured } = await this.transport());
    } catch (err) {
      this.logger.error(`Email transport unavailable: ${(err as Error).message}`);
      return; // never break the calling flow
    }
    const message: SendMailOptions = {
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    };
    try {
      const info = await transporter.sendMail(message);
      if (!configured) {
        // jsonTransport: `message` is the serialized JSON of the email — the
        // only place we are allowed to surface the (dev) email body/link.
        this.logger.debug(
          `[dev-email] ${(info as { message?: string }).message ?? JSON.stringify(message)}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to send "${opts.subject}" to ${opts.to}: ${(err as Error).message}`,
      );
      // Deliberately swallow: auth flows must not fail because email is down.
    }
  }
}
