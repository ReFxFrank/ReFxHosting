import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CouponKind } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCouponDto {
  @ApiProperty({ example: 'WELCOME10' })
  @IsString()
  @MaxLength(64)
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({ enum: CouponKind })
  @IsEnum(CouponKind)
  kind!: CouponKind;

  @ApiProperty({ description: 'PERCENT: 1–100. FIXED: amount off in minor units.' })
  @IsInt()
  @Min(1)
  value!: number;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Minimum order subtotal (minor units).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minSubtotalMinor?: number;

  @ApiPropertyOptional({ description: 'Total redemption cap.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @ApiPropertyOptional({ description: 'Per-customer redemption cap.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxPerUser?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  startsAt?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  expiresAt?: Date;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCouponDto extends PartialType(CreateCouponDto) {}

export class ValidateCouponDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  code!: string;

  @ApiProperty({ description: 'Order subtotal to validate against (minor units).' })
  @IsInt()
  @Min(0)
  subtotalMinor!: number;
}
