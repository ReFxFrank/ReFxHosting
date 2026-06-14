import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketPriority } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Payload for a customer (or staff) opening a new ticket. */
export class CreateTicketDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject!: string;

  @ApiProperty({ description: 'Body of the opening message (markdown allowed).' })
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  body!: string;

  @ApiPropertyOptional({ description: 'TicketCategory id this ticket belongs to.' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: TicketPriority, default: TicketPriority.NORMAL })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}
