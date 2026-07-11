import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsStrongPassword } from "../../auth/password.validator";
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
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { CreditReason, GlobalRole, UserState } from "@prisma/client";
import { CreateProductDto } from "../../billing/dto/create-product.dto";
import { CreateAlertDto } from "../../platform/dto/create-alert.dto";

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

/** Admin-created account (e.g. a test/reviewer login). */
export class AdminCreateUserDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({
    description:
      "Initial password (10+ chars, mixed case + number + symbol). Omit to auto-generate a strong one (returned once).",
  })
  @IsOptional()
  @IsStrongPassword()
  password?: string;

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

  @ApiPropertyOptional({
    enum: GlobalRole,
    description:
      "Global role (default CUSTOMER). Must be below your own level.",
  })
  @IsOptional()
  @IsEnum(GlobalRole)
  role?: GlobalRole;

  @ApiPropertyOptional({
    default: true,
    description:
      "Mark the email verified so the account can sign in immediately (default true).",
  })
  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;
}

export class SetUserRoleDto {
  @ApiPropertyOptional({ enum: GlobalRole })
  @IsOptional()
  @IsEnum(GlobalRole)
  role?: GlobalRole;

  @ApiPropertyOptional({
    description: "Assign a specific RBAC role by id (system or custom).",
  })
  @IsOptional()
  @IsString()
  roleId?: string;
}

export class SetGatewayConfigDto {
  @ApiPropertyOptional({
    description: "Stripe secret key (write-only; stored encrypted).",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  stripeSecretKey?: string;

  @ApiPropertyOptional({
    description: "Stripe webhook signing secret (encrypted).",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  stripeWebhookSecret?: string;

  @ApiPropertyOptional({ description: "Stripe publishable key (not secret)." })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  stripePublishableKey?: string;

  @ApiPropertyOptional({
    description: "Card-statement descriptor / branding (≤22 chars).",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  stripeStatementDescriptor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  paypalClientId?: string;

  @ApiPropertyOptional({ description: "PayPal client secret (encrypted)." })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  paypalClientSecret?: string;

  @ApiPropertyOptional({
    description: "PayPal environment.",
    enum: ["sandbox", "live"],
  })
  @IsOptional()
  @IsIn(["sandbox", "live"])
  paypalMode?: string;

  @ApiPropertyOptional({
    description: "PayPal webhook id (for verifying webhooks).",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  paypalWebhookId?: string;
}

/** Owner-editable SMTP / email settings. */
export class SetEmailConfigDto {
  @ApiPropertyOptional({
    description: "SMTP host (blank disables real delivery).",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string;

  @ApiPropertyOptional({ description: "SMTP port." })
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

  @ApiPropertyOptional({
    description: "SMTP password (write-only; stored encrypted).",
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  password?: string;

  @ApiPropertyOptional({
    description: 'From address, e.g. "ReFx <no-reply@refx.gg>".',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  from?: string;

  @ApiPropertyOptional({ description: "Use TLS on connect (port 465)." })
  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @ApiPropertyOptional({
    description: "Visual theme for transactional emails.",
    enum: ["dark", "light"],
  })
  @IsOptional()
  @IsIn(["dark", "light"])
  theme?: "dark" | "light";
}

export class TestEmailDto {
  @ApiProperty({ description: "Recipient for the test email." })
  @IsEmail()
  to!: string;
}

export class SetSteamConfigDto {
  @ApiPropertyOptional({
    description: "Steam Web API key (write-only; stored encrypted).",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  apiKey?: string;

  @ApiPropertyOptional({
    description: "Central Steam username for steamcmd Workshop downloads.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  username?: string;

  @ApiPropertyOptional({
    description: "Steam password (write-only; stored encrypted).",
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  password?: string;

  @ApiPropertyOptional({
    description:
      "One-time Steam Guard code for the game-download account. Staged and " +
      "consumed on the next install; clears the machine prompt after first use.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  guardCode?: string;
}

/** Verify + cache the game-download Steam login on a specific node. */
export class VerifySteamLoginDto {
  @ApiProperty({
    description: "Node to run the login probe on (caches the sentry there).",
  })
  @IsString()
  nodeId!: string;

  @ApiPropertyOptional({
    description:
      "Fresh Steam Guard code to use right now (recommended for mobile-authenticator " +
      "accounts). Falls back to the staged code if omitted.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  guardCode?: string;
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
  @ApiProperty({ type: [String], description: "Target ids." })
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
  @ApiProperty({
    description:
      "Signed amount in minor units (cents). Positive grants, negative deducts.",
  })
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

export class RefundInvoiceDto {
  @ApiPropertyOptional({
    description:
      "Amount to refund in minor units (cents). Omit for a full refund of the amount paid.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  amountMinor?: number;
}

/**
 * Admin "Create Server" (Pterodactyl-style): provisions a server directly from
 * an egg/template for any owner, without a billing subscription.
 */
export class AdminCreateServerDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ description: "Owner (user) id" })
  @IsString()
  ownerId!: string;

  @ApiProperty({ description: "Node to place the server on" })
  @IsString()
  nodeId!: string;

  @ApiProperty({ description: "GameTemplate (egg) id" })
  @IsString()
  templateId!: string;

  @ApiPropertyOptional({
    description:
      "CPU cores. Optional — defaults to the template's recommended spec " +
      "(used for voice/slot-based servers that size from recommended specs).",
  })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  cpuCores?: number;

  @ApiPropertyOptional({
    description:
      "Memory (MiB). Optional — defaults to the template recommended spec.",
  })
  @IsOptional()
  @IsInt()
  @Min(256)
  memoryMb?: number;

  @ApiPropertyOptional({
    description:
      "Disk (MiB). Optional — defaults to the template recommended spec.",
  })
  @IsOptional()
  @IsInt()
  @Min(1024)
  diskMb?: number;

  @ApiPropertyOptional({
    description:
      "Slot count for voice/slot-based templates (e.g. TeamSpeak max clients). " +
      "When set, resources default to the template recommended specs and the " +
      "slot cap is injected into the container environment.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  slots?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  swapMb?: number;

  @ApiPropertyOptional({ description: "Initial env var overrides" })
  @IsOptional()
  @IsObject()
  environment?: Record<string, string>;
}

/**
 * Admin "Transfer server to another node" (Pterodactyl-style). Moves the server
 * to `toNodeId` while keeping its identity (shortId, SFTP, backups, plan).
 */
export class TransferServerDto {
  @ApiProperty({
    description: "Destination node id (must differ from the current node).",
  })
  @IsUUID()
  toNodeId!: string;
}

export class SetUserPasswordDto {
  @ApiPropertyOptional({
    description:
      "New password (10+ chars, mixed case + number + symbol). Omit to auto-generate a strong temporary password.",
  })
  @IsOptional()
  @IsStrongPassword()
  password?: string;
}

/** Owner-editable custom-server-address (vanity label) settings. */
export class SetVanityConfigDto {
  @ApiPropertyOptional({ description: "Allow customers to buy custom addresses." })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: "One-time fee in minor units (e.g. 200 = $2.00). 0 = free.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  feeMinor?: number;

  @ApiPropertyOptional({
    type: [String],
    description: "Extra reserved words (merged with the built-in list).",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reservedWords?: string[];
}

/** Centrally-managed S3/R2 backup storage, distributed to every node. */
export class SetBackupStorageDto {
  @ApiPropertyOptional({
    description: 'Custom endpoint for R2/B2/MinIO; empty for AWS S3.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  endpoint?: string;

  @ApiPropertyOptional({ description: '"auto" for R2.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiPropertyOptional({
    description: 'Bucket name. Empty string clears the whole config.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  bucket?: string;

  @ApiPropertyOptional({ description: 'Write-only; omit/empty keeps current.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  accessKey?: string;

  @ApiPropertyOptional({ description: 'Write-only; omit/empty keeps current.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  secretKey?: string;

  @ApiPropertyOptional({ description: 'true for MinIO / some R2 setups.' })
  @IsOptional()
  @IsBoolean()
  usePathStyle?: boolean;
}

/** Owner-editable express-backups (offsite storage add-on) settings. */
export class SetExpressBackupsConfigDto {
  @ApiPropertyOptional({
    description:
      "Offer express backups at checkout. Nodes also need S3 credentials in their agent config.",
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: "Monthly fee in minor units (e.g. 200 = $2.00/mo).",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  monthlyMinor?: number;
}
