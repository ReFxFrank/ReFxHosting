import { ApiPropertyOptional } from '@nestjs/swagger';
import { BugSeverity, BugStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Staff-only triage patch on a bug report. All fields optional (PATCH). */
export class UpdateBugReportDto {
  @ApiPropertyOptional({ enum: BugStatus })
  @IsOptional()
  @IsEnum(BugStatus)
  status?: BugStatus;

  @ApiPropertyOptional({ enum: BugSeverity })
  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  @ApiPropertyOptional({ description: 'Triage tag, e.g. "billing" / "console".' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  area?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Staff assignee (null clears).' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Note shown to the reporter when resolved/closed.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}
