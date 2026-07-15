import { ApiPropertyOptional } from '@nestjs/swagger';
import { BugSeverity, BugStatus } from '@prisma/client';
import { IsBooleanString, IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * Query for the bug-report list. Extends PaginationDto so the filter params are
 * whitelisted (the global forbidNonWhitelisted pipe 400s bare `@Query('status')`
 * params bound alongside a `@Query() PaginationDto`).
 */
export class ListBugReportsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: BugStatus })
  @IsOptional()
  @IsEnum(BugStatus)
  status?: BugStatus;

  @ApiPropertyOptional({ enum: BugSeverity })
  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  @ApiPropertyOptional({ description: 'Self-scope to the caller’s own reports.' })
  @IsOptional()
  @IsBooleanString()
  mine?: string;
}
