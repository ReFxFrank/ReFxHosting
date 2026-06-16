import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CreditReason, GlobalRole, UserState } from '@prisma/client';
import { CreateProductDto } from '../../billing/dto/create-product.dto';
import { CreateAlertDto } from '../../platform/dto/create-alert.dto';

/** Admin product update (all fields optional). */
export class UpdateProductDto extends PartialType(CreateProductDto) {}

/** Admin alert update (all create fields optional + activate/deactivate). */
export class UpdateAlertDto extends PartialType(CreateAlertDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Admin user state change. */
export class UpdateUserDto {
  @ApiPropertyOptional({ enum: UserState })
  @IsOptional()
  @IsEnum(UserState)
  state?: UserState;
}

export class SetUserRoleDto {
  @ApiPropertyOptional({ enum: GlobalRole })
  @IsOptional()
  @IsEnum(GlobalRole)
  role?: GlobalRole;

  @ApiPropertyOptional({ description: 'Assign a specific RBAC role by id (system or custom).' })
  @IsOptional()
  @IsString()
  roleId?: string;
}

export class SetGatewayConfigDto {
  @ApiPropertyOptional({ description: 'Stripe secret key (write-only; stored encrypted).' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  stripeSecretKey?: string;

  @ApiPropertyOptional({ description: 'Stripe webhook signing secret (encrypted).' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  stripeWebhookSecret?: string;

  @ApiPropertyOptional({ description: 'Stripe publishable key (not secret).' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  stripePublishableKey?: string;

  @ApiPropertyOptional({ description: 'Card-statement descriptor / branding (≤22 chars).' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  stripeStatementDescriptor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  paypalClientId?: string;

  @ApiPropertyOptional({ description: 'PayPal client secret (encrypted).' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  paypalClientSecret?: string;

  @ApiPropertyOptional({ description: 'PayPal environment.', enum: ['sandbox', 'live'] })
  @IsOptional()
  @IsIn(['sandbox', 'live'])
  paypalMode?: string;

  @ApiPropertyOptional({ description: 'PayPal webhook id (for verifying webhooks).' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  paypalWebhookId?: string;
}

/** Owner-editable SMTP / email settings. */
export class SetEmailConfigDto {
  @ApiPropertyOptional({ description: 'SMTP host (blank disables real delivery).' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string;

  @ApiPropertyOptional({ description: 'SMTP port.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  user?: string;

  @ApiPropertyOptional({ description: 'SMTP password (write-only; stored encrypted).' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  password?: string;

  @ApiPropertyOptional({ description: 'From address, e.g. "ReFx <no-reply@refx.gg>".' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  from?: string;

  @ApiPropertyOptional({ description: 'Use TLS on connect (port 465).' })
  @IsOptional()
  @IsBoolean()
  secure?: boolean;
}

export class TestEmailDto {
  @ApiProperty({ description: 'Recipient for the test email.' })
  @IsEmail()
  to!: string;
}

export class CreateRoleDto {
  @ApiProperty({ description: 'Unique key/slug, e.g. "billing-manager".' })
  @IsString()
  @Length(2, 40)
  key!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 60)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

/** Identifiers for a bulk action (e.g. deleting multiple orders at once). */
export class BulkIdsDto {
  @ApiProperty({ type: [String], description: 'Target ids.' })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

/**
 * Adjust a user's store-credit balance. A positive amount grants credit (e.g. a
 * goodwill gesture or refund-to-credit); a negative amount deducts it. Money is
 * in integer minor units (cents).
 */
export class GrantCreditDto {
  @ApiProperty({ description: 'Signed amount in minor units (cents). Positive grants, negative deducts.' })
  @IsInt()
  amountMinor!: number;

  @ApiPropertyOptional({ enum: CreditReason })
  @IsOptional()
  @IsEnum(CreditReason)
  reason?: CreditReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

/**
 * Admin "Create Server" (Pterodactyl-style): provisions a server directly from
 * an egg/template for any owner, without a billing subscription.
 */
export class AdminCreateServerDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Owner (user) id' })
  @IsString()
  ownerId!: string;

  @ApiProperty({ description: 'Node to place the server on' })
  @IsString()
  nodeId!: string;

  @ApiProperty({ description: 'GameTemplate (egg) id' })
  @IsString()
  templateId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.1)
  cpuCores!: number;

  @ApiProperty()
  @IsInt()
  @Min(256)
  memoryMb!: number;

  @ApiProperty()
  @IsInt()
  @Min(1024)
  diskMb!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  swapMb?: number;

  @ApiPropertyOptional({ description: 'Initial env var overrides' })
  @IsOptional()
  @IsObject()
  environment?: Record<string, string>;
}
