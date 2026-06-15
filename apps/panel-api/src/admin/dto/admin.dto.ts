import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { UserState } from '@prisma/client';
import { CreateProductDto } from '../../billing/dto/create-product.dto';
import { CreateAlertDto } from '../../platform/dto/create-alert.dto';

/** Admin product update (all fields optional). */
export class UpdateProductDto extends PartialType(CreateProductDto) {}

/** Admin alert update (all create fields optional + activate/deactivate). */
export class UpdateAlertDto extends PartialType(CreateAlertDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Admin user state change. */
export class UpdateUserDto {
  @ApiPropertyOptional({ enum: UserState })
  @IsOptional()
  @IsEnum(UserState)
  state?: UserState;
}
