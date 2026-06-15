import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { HomepageAlertType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Admin payload for a PUBLIC storefront homepage notice. Kept separate from
 * CreateAlertDto (internal dashboard alerts) so the two surfaces never mix.
 */
export class CreateHomepageAlertDto {
  @ApiPropertyOptional({ enum: HomepageAlertType, default: HomepageAlertType.INFO })
  @IsOptional()
  @IsEnum(HomepageAlertType)
  type?: HomepageAlertType;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MaxLength(4000)
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'When the alert becomes visible (ISO-8601).' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;

  @ApiPropertyOptional({ description: 'When the alert stops showing (ISO-8601).' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  ctaLabel?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ctaUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  dismissible?: boolean;

  @ApiPropertyOptional({ description: 'Higher priority shows first.', default: 0 })
  @IsOptional()
  @IsInt()
  priority?: number;
}

export class UpdateHomepageAlertDto extends PartialType(CreateHomepageAlertDto) {}
