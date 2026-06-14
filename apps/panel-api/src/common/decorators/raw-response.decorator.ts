import { SetMetadata } from '@nestjs/common';
import { RAW_RESPONSE_KEY } from '../interceptors/transform.interceptor';

/**
 * Opt a route out of the `{ success, data }` envelope (e.g. Prometheus metrics,
 * Stripe webhooks, file downloads).
 */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
