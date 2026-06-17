import { Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { BrandedEmail, buildEmail } from './email-templates';

/**
 * DEV-ONLY visual preview of the transactional email templates, so the ReFx
 * Glassy styling can be eyeballed in a browser without sending mail. Every route
 * 404s in production. The samples mirror each real flow's structure (the styling
 * is shared via buildEmail), with placeholder data only — no real user data.
 *
 *   GET /api/v1/dev/emails            → index with links
 *   GET /api/v1/dev/emails/:name      → rendered HTML
 *   GET /api/v1/dev/emails/:name?format=text → plain-text part
 */
const SAMPLES: Record<string, { subject: string; email: BrandedEmail }> = {
  verify: {
    subject: 'Verify your ReFx Hosting email',
    email: {
      title: 'Verify your email',
      greeting: 'Hi Frank,',
      preheader: 'Confirm your email to activate your ReFx Hosting account.',
      intro: [
        'Please verify your email address to activate your account and access your hosting panel.',
        'This link expires in <strong>24 hours</strong>.',
      ],
      button: { label: 'Verify Email', url: 'https://refx.gg/auth/verify-email?token=SAMPLE' },
      outro: ['If you did not create a ReFx Hosting account, you can safely ignore this email.'],
    },
  },
  reset: {
    subject: 'Reset your ReFx Hosting password',
    email: {
      title: 'Reset your password',
      greeting: 'Hi Frank,',
      intro: [
        'We received a request to reset your ReFx Hosting password. Use the button below to choose a new one.',
        'This link expires in <strong>1 hour</strong> and can only be used once.',
      ],
      button: { label: 'Reset password', url: 'https://refx.gg/auth/reset-password?token=SAMPLE' },
      outro: ["If you didn't request this, you can safely ignore this email — your password won't change."],
    },
  },
  welcome: {
    subject: 'Welcome to ReFx Hosting',
    email: {
      title: 'Welcome to ReFx Hosting',
      greeting: 'Hi Frank,',
      intro: [
        'Your email is verified and your account is ready. Deploy a server, manage billing, and open support tickets any time from your dashboard.',
      ],
      button: { label: 'Open your dashboard', url: 'https://refx.gg/dashboard' },
      outro: ['Happy hosting!'],
    },
  },
  'payment-receipt': {
    subject: 'Payment received — invoice 1042',
    email: {
      title: 'Payment received',
      greeting: 'Hi Frank,',
      intro: ["We've received your payment of <strong>19.99 USD</strong> for invoice <strong>1042</strong>. Thank you!"],
      button: { label: 'View your invoices', url: 'https://refx.gg/billing' },
    },
  },
  'payment-failed': {
    subject: 'Payment failed — invoice 1042',
    email: {
      title: 'Payment failed',
      greeting: 'Hi Frank,',
      intro: [
        "We couldn't process your payment of <strong>19.99 USD</strong> for invoice <strong>1042</strong> (card declined).",
        'Please update your payment method or pay the invoice to avoid service interruption.',
      ],
      button: { label: 'Go to billing', url: 'https://refx.gg/billing' },
    },
  },
  renewal: {
    subject: 'Your Minecraft Server renews on 2026-07-01',
    email: {
      title: 'Upcoming renewal',
      greeting: 'Hi Frank,',
      intro: [
        "Your <strong>Minecraft Server</strong> subscription renews on <strong>2026-07-01</strong> for <strong>9.99 USD</strong>. We'll automatically charge your saved payment method on that date.",
      ],
      button: { label: 'Manage billing', url: 'https://refx.gg/billing' },
    },
  },
  'card-expiring': {
    subject: 'Your saved card is expiring soon',
    email: {
      title: 'Your card is expiring soon',
      greeting: 'Hi Frank,',
      intro: [
        'Your <strong>Visa ending 4242</strong> expires <strong>07/2026</strong>. Add an up-to-date card so your automatic renewals keep working.',
      ],
      button: { label: 'Update payment method', url: 'https://refx.gg/billing' },
    },
  },
  'smtp-test': {
    subject: 'ReFx Hosting — SMTP test',
    email: {
      title: 'SMTP test successful',
      intro: [
        'This is a test email confirming your SMTP settings are configured correctly. 🎉',
        'Transactional emails — verification, password resets, receipts — will be delivered from here.',
      ],
    },
  },
};

@ApiExcludeController()
@Controller('dev/emails')
export class EmailPreviewController {
  constructor(private readonly config: ConfigService) {}

  private assertDev(): void {
    if (this.config.get<string>('env') === 'production') {
      throw new NotFoundException();
    }
  }

  @Public()
  @Get()
  index(@Res() res: Response): void {
    this.assertDev();
    const links = Object.keys(SAMPLES)
      .map(
        (n) =>
          `<li style="margin:6px 0;"><a style="color:#00aaff;" href="/api/v1/dev/emails/${n}">${n}</a> · <a style="color:#6f7d95;" href="/api/v1/dev/emails/${n}?format=text">text</a></li>`,
      )
      .join('');
    res
      .type('html')
      .send(
        `<body style="background:#050814;color:#a9b8d0;font-family:sans-serif;padding:32px;"><h1 style="color:#fff;">ReFx email previews</h1><ul>${links}</ul></body>`,
      );
  }

  @Public()
  @Get(':name')
  show(
    @Param('name') name: string,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ): void {
    this.assertDev();
    const sample = SAMPLES[name];
    if (!sample) throw new NotFoundException(`Unknown template: ${name}`);
    const panelUrl = (this.config.get<string>('panelUrl') ?? '').replace(/\/+$/, '');
    const { html, text } = buildEmail({
      ...sample.email,
      logoUrl: panelUrl ? `${panelUrl}/brand/refx-wordmark.png` : undefined,
    });
    if (format === 'text') {
      res.type('text/plain').send(`Subject: ${sample.subject}\n\n${text}`);
      return;
    }
    res.type('html').send(html);
  }
}
