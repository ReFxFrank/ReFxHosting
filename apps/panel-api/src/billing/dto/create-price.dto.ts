import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingInterval } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

/**
 * Admin payload to attach a Price to a Product for a given interval/currency.
 */
export class CreatePriceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Hardware tier this price belongs to (game tiers). Omit for product-level prices.',
  })
  @IsOptional()
  @IsUUID()
  hardwareTierId?: string;

  @ApiProperty({ enum: BillingInterval })
  @IsEnum(BillingInterval)
  interval!: BillingInterval;

  @ApiPropertyOptional({ default: 'USD', description: 'ISO 4217 currency code.' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiProperty({ description: 'Price in integer minor units (cents).', example: 999 })
  @IsInt()
  @Min(0)
  amountMinor!: number;

  @ApiPropertyOptional({ description: 'Pre-created Stripe Price id, if any.' })
  @IsOptional()
  @IsString()
  stripePriceId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
