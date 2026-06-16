import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions } from 'nodemailer';
import { SettingsService } from '../platform/settings.service';

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
            port: cfg.port,
            secure: cfg.secure,
            auth:
              cfg.user || cfg.password
                ? { user: cfg.user, pass: cfg.password }
                : undefined,
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

  /** Send a test email to verify SMTP settings. Throws on failure (so the UI can report it). */
  async sendTest(to: string): Promise<{ delivered: boolean }> {
    const { transporter, from, configured } = await this.transport();
    await transporter.sendMail({
      from,
      to,
      subject: 'ReFx Hosting — SMTP test',
      text: 'This is a test email confirming your SMTP settings work. 🎉',
      html: '<p>This is a test email confirming your SMTP settings work. 🎉</p>',
    });
    return { delivered: configured };
  }

  // ---- public helpers ----------------------------------------------------

  async sendPasswordReset(user: MailRecipient, token: string): Promise<void> {
    const link = `${this.panelUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
    const greeting = user.firstName ? `Hi ${user.firstName},` : 'Hello,';
    await this.sendGeneric({
      to: user.email,
      subject: 'Reset your ReFx Hosting password',
      text:
        `${greeting}\n\n` +
        `We received a request to reset your password. Use the link below to choose a new one. ` +
        `This link expires in 1 hour and can only be used once.\n\n${link}\n\n` +
        `If you didn't request this, you can safely ignore this email.`,
      html:
        `<p>${greeting}</p>` +
        `<p>We received a request to reset your password. Click the button below to choose a new one. ` +
        `This link expires in 1 hour and can only be used once.</p>` +
        `<p><a href="${link}">Reset your password</a></p>` +
        `<p>If you didn't request this, you can safely ignore this email.</p>`,
    });
  }

  async sendEmailVerification(
    user: MailRecipient,
    token: string,
  ): Promise<void> {
    const link = `${this.panelUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const greeting = user.firstName ? `Hi ${user.firstName},` : 'Welcome,';
    await this.sendGeneric({
      to: user.email,
      subject: 'Verify your ReFx Hosting email address',
      text:
        `${greeting}\n\n` +
        `Please confirm your email address to activate your account. ` +
        `This link expires in 24 hours.\n\n${link}\n\n` +
        `If you didn't create this account, you can ignore this email.`,
      html:
        `<p>${greeting}</p>` +
        `<p>Please confirm your email address to activate your account. ` +
        `This link expires in 24 hours.</p>` +
        `<p><a href="${link}">Verify your email</a></p>` +
        `<p>If you didn't create this account, you can ignore this email.</p>`,
    });
  }

  /** Welcome email after a customer verifies their address. */
  async sendWelcome(user: MailRecipient): Promise<void> {
    const greeting = user.firstName ? `Hi ${user.firstName},` : 'Welcome,';
    await this.sendGeneric({
      to: user.email,
      subject: 'Welcome to ReFx Hosting',
      text:
        `${greeting}\n\n` +
        `Your email is verified and your account is ready. You can deploy a server, ` +
        `manage billing and open a support ticket any time from your dashboard:\n\n` +
        `${this.panelUrl}/dashboard\n\nHappy hosting!`,
      html:
        `<p>${greeting}</p>` +
        `<p>Your email is verified and your account is ready. You can deploy a server, ` +
        `manage billing and open a support ticket any time from your dashboard.</p>` +
        `<p><a href="${this.panelUrl}/dashboard">Open your dashboard</a></p>` +
        `<p>Happy hosting!</p>`,
    });
  }

  /** Receipt after a successful payment. */
  async sendPaymentReceipt(
    user: MailRecipient,
    invoice: { number: number | string; amountMinor: number; currency: string },
  ): Promise<void> {
    const amount = this.money(invoice.amountMinor, invoice.currency);
    const greeting = user.firstName ? `Hi ${user.firstName},` : 'Hello,';
    await this.sendGeneric({
      to: user.email,
      subject: `Payment received — invoice ${invoice.number}`,
      text:
        `${greeting}\n\n` +
        `We've received your payment of ${amount} for invoice ${invoice.number}. ` +
        `Thank you!\n\nView your invoices: ${this.panelUrl}/billing`,
      html:
        `<p>${greeting}</p>` +
        `<p>We've received your payment of <strong>${amount}</strong> for invoice ` +
        `<strong>${invoice.number}</strong>. Thank you!</p>` +
        `<p><a href="${this.panelUrl}/billing">View your invoices</a></p>`,
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
    const greeting = user.firstName ? `Hi ${user.firstName},` : 'Hello,';
    const reason = invoice.reason ? ` (${invoice.reason})` : '';
    await this.sendGeneric({
      to: user.email,
      subject: `Payment failed — invoice ${invoice.number}`,
      text:
        `${greeting}\n\n` +
        `We couldn't process your payment of ${amount} for invoice ${invoice.number}${reason}. ` +
        `Please update your payment method or pay the invoice to avoid service interruption:\n\n` +
        `${this.panelUrl}/billing`,
      html:
        `<p>${greeting}</p>` +
        `<p>We couldn't process your payment of <strong>${amount}</strong> for invoice ` +
        `<strong>${invoice.number}</strong>${reason}. Please update your payment method or ` +
        `pay the invoice to avoid service interruption.</p>` +
        `<p><a href="${this.panelUrl}/billing">Go to billing</a></p>`,
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
