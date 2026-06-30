import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceState } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * Admin invoice-list query. Extends PaginationDto so `state` is whitelisted
 * (see ListTicketsQueryDto — bare `@Query('state')` 400s under the global
 * forbidNonWhitelisted pipe).
 */
export class ListInvoicesQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: InvoiceState })
  @IsOptional()
  @IsEnum(InvoiceState)
  state?: InvoiceState;
}
