import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Checkout payload from the storefront buy flow: subscribe to a product at a
 * chosen price and provision a server running `templateId`.
 */
export class CreateOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  priceId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  templateId!: string;

  @ApiProperty({ description: 'Display name for the new server' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Preferred region (placement hint)' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ description: 'Stored payment method to charge' })
  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @ApiPropertyOptional({ description: 'Checkout gateway', enum: ['stripe', 'paypal'] })
  @IsOptional()
  @IsIn(['stripe', 'paypal'])
  gateway?: 'stripe' | 'paypal';

  @ApiPropertyOptional({ description: 'Initial env var overrides' })
  @IsOptional()
  @IsObject()
  environment?: Record<string, string>;
}
