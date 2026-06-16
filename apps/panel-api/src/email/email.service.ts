import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions } from 'nodemailer';
import { AppConfig } from '../config/configuration';

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
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter!: Transporter;
  private readonly from: string;
  private readonly panelUrl: string;
  private readonly smtpConfigured: boolean;

  constructor(private readonly config: ConfigService) {
    const email = this.config.get<AppConfig['email']>('email')!;
    this.from = email.from;
    this.panelUrl = (
      this.config.get<string>('panelUrl') ?? 'http://localhost:3000'
    ).replace(/\/+$/, '');
    this.smtpConfigured = Boolean(email.host);
  }

  onModuleInit(): void {
    const email = this.config.get<AppConfig['email']>('email')!;
    if (this.smtpConfigured) {
      this.transporter = nodemailer.createTransport({
        host: email.host,
        port: email.port,
        secure: email.secure,
        auth:
          email.user || email.password
            ? { user: email.user, pass: email.password }
            : undefined,
      });
      this.logger.log(
        `SMTP transport configured (${email.host}:${email.port})`,
      );
    } else {
      // Dev/test fallback: serialize messages instead of sending them.
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
      this.logger.warn(
        'SMTP not configured (SMTP_HOST empty) — using jsonTransport; emails are logged, not delivered.',
      );
    }
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
    const message: SendMailOptions = {
      from: this.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    };
    try {
      const info = await this.transporter.sendMail(message);
      if (!this.smtpConfigured) {
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
