import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertSeverity } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Admin payload to raise a platform-wide banner/alert. `startsAt`/`endsAt` are
 * optional bounds; a null bound means "no lower/upper limit".
 */
export class CreateAlertDto {
  @ApiPropertyOptional({
    enum: AlertSeverity,
    default: AlertSeverity.INFO,
  })
  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MaxLength(4000)
  body!: string;

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

  @ApiPropertyOptional({ default: true, description: 'Whether the alert is active.' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
