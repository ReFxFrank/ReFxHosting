import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  STATUS_WEBHOOK_EVENTS,
  StatusWebhookEvent,
} from '../../queues/queue.constants';

export class CreateStatusWebhookDto {
  @ApiProperty({ description: 'HTTPS endpoint that receives signed status pushes.' })
  // Allow internal hostnames (no TLD requirement) so on-prem bots work too.
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  url!: string;

  @ApiPropertyOptional({
    enum: STATUS_WEBHOOK_EVENTS,
    isArray: true,
    description: 'Events to deliver. Omit/empty = all status events.',
  })
  @IsOptional()
  @IsArray()
  @IsIn(STATUS_WEBHOOK_EVENTS, { each: true })
  events?: StatusWebhookEvent[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  description?: string;
}

export class UpdateStatusWebhookDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  url?: string;

  @ApiPropertyOptional({ enum: STATUS_WEBHOOK_EVENTS, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(STATUS_WEBHOOK_EVENTS, { each: true })
  events?: StatusWebhookEvent[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  description?: string;
}
