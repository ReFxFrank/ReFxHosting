import { ApiPropertyOptional } from '@nestjs/swagger';
import { TicketPriority, TicketState } from '@prisma/client';
import { IsBooleanString, IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * Query for the ticket list. Extends PaginationDto so the filter params are
 * whitelisted — binding them as bare `@Query('state')` alongside `@Query()
 * PaginationDto` makes the global `forbidNonWhitelisted` pipe 400 the whole
 * request ("property state should not exist"), which silently broke every state
 * filter (notably "Archived" → empty, so archived tickets looked deleted).
 */
export class ListTicketsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: TicketState })
  @IsOptional()
  @IsEnum(TicketState)
  state?: TicketState;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({ description: 'Self-scope to the caller’s own tickets.' })
  @IsOptional()
  @IsBooleanString()
  mine?: string;
}
