import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingInterval } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

/**
 * Customer payload to start a subscription to a product at a chosen price.
 */
export class CreateSubscriptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  priceId!: string;

  @ApiProperty({ enum: BillingInterval })
  @IsEnum(BillingInterval)
  interval!: BillingInterval;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Chosen hardware tier (HARDWARE_TIER game products).',
  })
  @IsOptional()
  @IsUUID()
  hardwareTierId?: string;

  @ApiPropertyOptional({ description: 'Slot quantity for per-slot products.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  slots?: number;

  @ApiPropertyOptional({
    description: 'Payment gateway to bill through.',
    enum: ['stripe', 'paypal'],
    default: 'stripe',
  })
  @IsOptional()
  @IsString()
  @IsIn(['stripe', 'paypal'])
  gateway?: string;
}
