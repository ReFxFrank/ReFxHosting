import { ApiPropertyOptional } from '@nestjs/swagger';
import { TicketPriority, TicketState } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

/** Staff-only patch of a ticket's workflow fields. All optional (PATCH). */
export class UpdateTicketDto {
  @ApiPropertyOptional({ enum: TicketState })
  @IsOptional()
  @IsEnum(TicketState)
  state?: TicketState;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({ description: 'Staff user id to assign the ticket to.' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Re-categorise the ticket.' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
