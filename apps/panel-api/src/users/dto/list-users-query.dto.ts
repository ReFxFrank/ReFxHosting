import { ApiPropertyOptional } from '@nestjs/swagger';
import { GlobalRole, UserState } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * Admin user-list query. Extends PaginationDto so role/state are whitelisted
 * (bare `@Query('role')` alongside `@Query() PaginationDto` is rejected by the
 * global forbidNonWhitelisted pipe — see ListTicketsQueryDto).
 */
export class ListUsersQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: GlobalRole })
  @IsOptional()
  @IsEnum(GlobalRole)
  role?: GlobalRole;

  @ApiPropertyOptional({ enum: UserState })
  @IsOptional()
  @IsEnum(UserState)
  state?: UserState;
}
