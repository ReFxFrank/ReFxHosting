import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

/**
 * Register a tokenized payment method against the caller's account. The raw card
 * never touches our servers; `gatewayRef` is the processor token (pm_xxx, etc.).
 */
export class AddPaymentMethodDto {
  @ApiProperty({ enum: ['stripe', 'paypal'] })
  @IsString()
  @IsIn(['stripe', 'paypal'])
  gateway!: string;

  @ApiProperty({ description: 'Processor token (e.g. Stripe pm_xxx).' })
  @IsString()
  gatewayRef!: string;

  @ApiPropertyOptional({ example: 'visa' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: '4242' })
  @IsOptional()
  @IsString()
  @Length(2, 4)
  last4?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  expMonth?: number;

  @ApiPropertyOptional({ example: 2030 })
  @IsOptional()
  @IsInt()
  @Min(2000)
  expYear?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
