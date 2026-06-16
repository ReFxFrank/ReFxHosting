import { Injectable, Logger } from '@nestjs/common';
import { Invoice } from '@prisma/client';
import { SettingsService } from '../../platform/settings.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  ChargeResult,
  CheckoutSessionParams,
  CheckoutSessionResult,
  GatewayUser,
  PaymentGateway,
} from './payment-gateway.interface';

/**
 * PayPal implementation using the Orders v2 REST API via global `fetch`. The
 * structure (OAuth token retrieval -> create order -> capture) is wired; the
 * exact request/response field handling is left as TODO(impl) since it depends
 * on the merchant account + checkout integration choices.
 */
@Injectable()
export class PayPalGateway implements PaymentGateway {
  readonly name = 'paypal';
  private readonly logger = new Logger(PayPalGateway.name);

  /** Cached OAuth token + expiry epoch ms, keyed by the client id it was for. */
  private token?: { value: string; expiresAt: number; clientId: string };

  constructor(private readonly settings: SettingsService) {}

  /** Sandbox/live base URL for the effective mode (settings → env). */
  private async resolveBaseUrl(): Promise<string> {
    const { mode } = await this.settings.paypalConfig();
    return mode === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  /**
   * Retrieve (and cache) an OAuth2 access token via client-credentials grant,
   * using the EFFECTIVE credentials + mode (owner-editable settings → env
   * fallback) so keys entered in the panel actually authenticate.
   */
  private async getAccessToken(): Promise<string> {
    const { clientId, clientSecret, mode } = await this.settings.paypalConfig();
    if (!clientId || !clientSecret) {
      throw new Error('PayPal is not configured (missing client id/secret)');
    }
    const baseUrl =
      mode === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';

    const now = Date.now();
    if (
      this.token &&
      this.token.clientId === clientId &&
      this.token.expiresAt > now + 30_000
    ) {
      return this.token.value;
    }

    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PayPal OAuth failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.token = {
      value: data.access_token,
      expiresAt: now + data.expires_in * 1000,
      clientId,
    };
    return this.token.value;
  }

  /** Authorized JSON helper against the PayPal REST base. */
  private async api<T>(
    path: string,
    init: { method: string; body?: unknown } = { method: 'GET' },
  ): Promise<T> {
    const token = await this.getAccessToken();
    const baseUrl = await this.resolveBaseUrl();
    const res = await fetch(`${baseUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PayPal ${init.method} ${path} (${res.status}): ${text}`);
    }
    return (await res.json()) as T;
  }

  /**
   * PayPal has no first-class "customer" object equivalent for orders; we use
   * the platform user id as the reference. Vaulting would change this.
   */
  async createCustomer(user: GatewayUser | AuthUser): Promise<string> {
    // TODO(impl): if using the Vault API, create/return a customer/vault id.
    return user.id;
  }

  /**
   * Charge via an existing billing agreement / vaulted payment-method token.
   * Creates and captures an order in one shot.
   */
  async charge(
    invoice: Invoice,
    paymentMethodRef: string,
  ): Promise<ChargeResult> {
    try {
      const order = await this.api<{ id: string; status: string }>(
        '/v2/checkout/orders',
        {
          method: 'POST',
          body: {
            intent: 'CAPTURE',
            purchase_units: [
              {
                custom_id: invoice.id,
                invoice_id: invoice.number,
                amount: {
                  currency_code: invoice.currency,
                  value: (invoice.totalMinor / 100).toFixed(2),
                },
              },
            ],
            // TODO(impl): supply payment_source referencing the vaulted token
            // (paymentMethodRef) for off-session merchant-initiated charges.
          },
        },
      );

      // TODO(impl): for vaulted off-session charges PayPal may auto-capture;
      // otherwise an explicit capture call is required:
      const captured = await this.api<{ id: string; status: string }>(
        `/v2/checkout/orders/${order.id}/capture`,
        { method: 'POST' },
      );

      const success = captured.status === 'COMPLETED';
      return {
        gatewayRef: captured.id,
        success,
        failureReason: success
          ? undefined
          : `PayPal order status: ${captured.status}`,
      };
    } catch (err) {
      const e = err as Error;
      this.logger.warn(
        `PayPal charge failed for invoice ${invoice.id} (pm ${paymentMethodRef}): ${e.message}`,
      );
      return { gatewayRef: '', success: false, failureReason: e.message };
    }
  }

  /** Create a PayPal order and return its approval (checkout) link. */
  async createCheckoutSession(
    params: CheckoutSessionParams,
  ): Promise<CheckoutSessionResult> {
    const { invoice, successUrl, cancelUrl } = params;

    const order = await this.api<{
      id: string;
      links: Array<{ rel: string; href: string }>;
    }>('/v2/checkout/orders', {
      method: 'POST',
      body: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            custom_id: invoice.id,
            invoice_id: invoice.number,
            amount: {
              currency_code: invoice.currency,
              value: (invoice.totalMinor / 100).toFixed(2),
            },
          },
        ],
        application_context: {
          return_url: successUrl,
          cancel_url: cancelUrl,
        },
      },
    });

    const approve = order.links.find((l) => l.rel === 'approve');
    return { sessionId: order.id, url: approve?.href ?? '' };
  }
}
