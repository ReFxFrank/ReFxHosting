import { ApiPropertyOptional } from '@nestjs/swagger';
import { BillingInterval } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

/**
 * Admin payload to create a Price on a product whose id comes from the route
 * (POST /admin/products/:id/prices) — so productId is NOT part of the body.
 */
export class CreateProductPriceDto {
  @ApiPropertyOptional({ enum: BillingInterval, default: 'MONTHLY' })
  @IsOptional()
  @IsEnum(BillingInterval)
  interval?: BillingInterval;

  @ApiPropertyOptional({ default: 'USD', description: 'ISO 4217 currency code.' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Price in integer minor units (cents).' })
  @IsInt()
  @Min(0)
  amountMinor!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stripePriceId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Admin payload to edit an existing Price (all fields optional). */
export class UpdatePriceDto {
  @ApiPropertyOptional({ enum: BillingInterval })
  @IsOptional()
  @IsEnum(BillingInterval)
  interval?: BillingInterval;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Price in integer minor units (cents).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  amountMinor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stripePriceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
