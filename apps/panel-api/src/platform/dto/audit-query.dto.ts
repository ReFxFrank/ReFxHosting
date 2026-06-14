import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * Filters for the admin AuditLog query. Extends PaginationDto so callers get
 * page/pageSize (and the skip/take getters) for free.
 */
export class AuditQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by the acting user id.' })
  @IsOptional()
  @IsUUID('7')
  actorId?: string;

  @ApiPropertyOptional({ description: 'Entity type, e.g. "Server".' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetType?: string;

  @ApiPropertyOptional({ description: 'Affected entity id.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetId?: string;

  @ApiPropertyOptional({ description: 'Action key, e.g. "server.power.start".' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  action?: string;

  @ApiPropertyOptional({
    description: 'Lower bound (inclusive) on createdAt, ISO-8601.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    description: 'Upper bound (inclusive) on createdAt, ISO-8601.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
