import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiKeyScope } from '@prisma/client';
import { IsStrongPassword } from '../password.validator';
import { AttributionDto } from '../../common/dto/attribution.dto';

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({
    minLength: 10,
    description: '10–128 chars with a lowercase, uppercase, number and symbol',
  })
  @IsStrongPassword()
  password!: string;

  @ApiPropertyOptional({
    description: 'Referral code from a share link (?ref=...). Best-effort.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  referralCode?: string;

  @ApiPropertyOptional({
    type: AttributionDto,
    description:
      'First-touch acquisition data captured client-side (utm params, ref, landing). Strictly whitelisted.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AttributionDto)
  attribution?: AttributionDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  // ---- Billing address (required: needed for tax + any purchase) ----------

  @ApiProperty({ description: 'Street address' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  addressLine1!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city!: string;

  @ApiPropertyOptional({ description: 'State / province (required for US)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  postalCode!: string;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2 country code (e.g. US, GB, DE)' })
  @IsString()
  @Length(2, 2)
  country!: string;
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;

  @ApiPropertyOptional({ description: 'TOTP code if MFA enabled' })
  @IsOptional()
  @IsString()
  totp?: string;

  @ApiPropertyOptional({
    description:
      'Trust this device: issue a long-lived (90-day) session so the user stays signed in.',
  })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Raw reset token from the emailed link' })
  @IsString()
  token!: string;

  @ApiProperty({
    minLength: 10,
    description: '10–128 chars with a lowercase, uppercase, number and symbol',
  })
  @IsStrongPassword()
  newPassword!: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'Raw verification token from the emailed link' })
  @IsString()
  token!: string;
}

export class ResendVerificationDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class MfaVerifyDto {
  @ApiProperty({
    description: 'Signed, short-lived MFA challenge token returned by login',
  })
  @IsString()
  mfaToken!: string;

  @ApiProperty({ description: 'TOTP or recovery code' })
  @IsString()
  code!: string;

  @ApiPropertyOptional({ enum: ['totp', 'recovery'], default: 'totp' })
  @IsOptional()
  @IsIn(['totp', 'recovery'])
  method?: 'totp' | 'recovery';
}

export class TotpVerifyDto {
  @ApiProperty()
  @IsString()
  code!: string;
}

export class WebAuthnVerifyDto {
  @ApiProperty({ description: 'Serialized attestation/assertion response' })
  @IsObject()
  response!: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;
}

/** Begin a passkey assertion at sign-in (after the password factor cleared). */
export class WebAuthnLoginOptionsDto {
  @ApiProperty({ description: 'Short-lived MFA challenge token from /auth/login' })
  @IsString()
  mfaToken!: string;
}

/** Complete a passkey assertion at sign-in. */
export class WebAuthnLoginVerifyDto {
  @ApiProperty({ description: 'Short-lived MFA challenge token from /auth/login' })
  @IsString()
  mfaToken!: string;

  @ApiProperty({ description: 'Serialized assertion response' })
  @IsObject()
  response!: Record<string, unknown>;
}

export class CreateApiKeyDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ enum: ApiKeyScope, isArray: true })
  @IsArray()
  @IsEnum(ApiKeyScope, { each: true })
  scopes!: ApiKeyScope[];

  @ApiPropertyOptional({ type: [String], description: 'CIDR allowlist' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedIps?: string[];

  @ApiPropertyOptional({
    description: 'ISO-8601 expiry timestamp. Omit for a non-expiring key.',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class TokenResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  expiresIn!: number;

  @ApiPropertyOptional({ description: 'True when MFA challenge still required' })
  @IsOptional()
  @IsBoolean()
  mfaRequired?: boolean;

  @ApiPropertyOptional({
    description: 'Signed, short-lived MFA challenge token (present iff mfaRequired)',
  })
  @IsOptional()
  @IsString()
  mfaToken?: string;

  @ApiPropertyOptional({
    description: 'Second-factor methods the user can satisfy (present iff mfaRequired)',
    enum: ['totp', 'recovery', 'webauthn'],
    isArray: true,
  })
  @IsOptional()
  methods?: ('totp' | 'recovery' | 'webauthn')[];
}
