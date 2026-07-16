import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BugSeverity } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

/**
 * A customer bug submission. Only the reporter-supplied fields are here — the
 * server stamps the reporter, timestamps, and status. The `pageUrl`/`userAgent`
 * /`appVersion`/`serverId` are best-effort context auto-captured by the client.
 */
export class CreateBugReportDto {
  @ApiProperty({ minLength: 3, maxLength: 160 })
  @IsString()
  @Length(3, 160)
  title!: string;

  @ApiProperty({ minLength: 10, maxLength: 8000, description: 'What happened.' })
  @IsString()
  @Length(10, 8000)
  description!: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  stepsToReproduce?: string;

  @ApiPropertyOptional({
    enum: BugSeverity,
    description: 'Customer-perceived severity (staff may re-triage).',
  })
  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  // ---- auto-captured context (best-effort; all optional) ------------------

  @ApiPropertyOptional({ description: 'Page the reporter was on.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  userAgent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  appVersion?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Server in context, if any.' })
  @IsOptional()
  @IsUUID()
  serverId?: string;
}
