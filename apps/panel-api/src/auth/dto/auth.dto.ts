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

export class MfaVerifyDto {
  @ApiProperty({ description: 'Opaque token returned by the login MFA challenge' })
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
}
