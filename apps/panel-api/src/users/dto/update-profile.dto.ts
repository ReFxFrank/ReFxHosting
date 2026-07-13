import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';

/**
 * Self-service profile fields a user may edit. All optional; only supplied
 * fields are updated (PATCH semantics).
 */
export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ description: 'IETF language tag, e.g. "en", "de-DE"' })
  @IsOptional()
  @IsString()
  @MaxLength(35)
  locale?: string;

  @ApiPropertyOptional({ description: 'IANA timezone, e.g. "Europe/Berlin"' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ description: 'Avatar URL; empty string or null clears it.' })
  @IsOptional()
  // Empty string / null mean "remove the avatar" — only validate real values.
  @ValidateIf((o) => o.avatarUrl !== '' && o.avatarUrl !== null)
  @IsUrl()
  @MaxLength(2048)
  avatarUrl?: string | null;

  // ---- Contact / billing address (all optional) -------------------------

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ description: 'State / province' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({ description: 'ISO country code or name' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;
}
