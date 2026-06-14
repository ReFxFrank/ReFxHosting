import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingInterval } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

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
    description: 'Payment gateway to bill through.',
    enum: ['stripe', 'paypal'],
    default: 'stripe',
  })
  @IsOptional()
  @IsString()
  @IsIn(['stripe', 'paypal'])
  gateway?: string;
}
