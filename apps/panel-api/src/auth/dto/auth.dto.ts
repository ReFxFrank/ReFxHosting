import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiKeyScope } from '@prisma/client';

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;
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

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
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
