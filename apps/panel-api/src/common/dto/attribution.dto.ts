import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * First-touch acquisition data captured client-side (utm params, referral code,
 * landing path, referring site). This is a STRICT whitelist: only these keys are
 * accepted, each must be a string, and each is length-capped. Combined with the
 * global ValidationPipe (`whitelist` + `forbidNonWhitelisted`), any unknown key
 * is rejected rather than persisted. `sanitizeAttribution` trims/drops empties as
 * a second layer before storage.
 *
 * Keep the key set in lock-step with the client capture in
 * `apps/web/lib/growth.ts`.
 */
export class AttributionDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  source?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  medium?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  campaign?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  term?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  content?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ref?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  landing?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  referrer?: string;
}

/** The canonical accepted attribution keys (single source of truth). */
export const ATTRIBUTION_KEYS = [
  'source',
  'medium',
  'campaign',
  'term',
  'content',
  'ref',
  'landing',
  'referrer',
] as const;

/**
 * Whitelist + trim + length-cap arbitrary client-supplied attribution into a
 * clean `Record<string,string>` (or undefined if nothing usable remains).
 * Accepts `unknown` so it can defensively re-sanitize even values that reached
 * it without passing through `AttributionDto` validation.
 */
export function sanitizeAttribution(
  raw: unknown,
): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const v = src[key];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim().slice(0, 200);
  }
  return Object.keys(out).length ? out : undefined;
}
