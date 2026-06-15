import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { GlobalRole, UserState } from '@prisma/client';
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

export class SetUserRoleDto {
  @ApiPropertyOptional({ enum: GlobalRole })
  @IsOptional()
  @IsEnum(GlobalRole)
  role?: GlobalRole;

  @ApiPropertyOptional({ description: 'Assign a specific RBAC role by id (system or custom).' })
  @IsOptional()
  @IsString()
  roleId?: string;
}

export class CreateRoleDto {
  @ApiProperty({ description: 'Unique key/slug, e.g. "billing-manager".' })
  @IsString()
  @Length(2, 40)
  key!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 60)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

/**
 * Admin "Create Server" (Pterodactyl-style): provisions a server directly from
 * an egg/template for any owner, without a billing subscription.
 */
export class AdminCreateServerDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Owner (user) id' })
  @IsString()
  ownerId!: string;

  @ApiProperty({ description: 'Node to place the server on' })
  @IsString()
  nodeId!: string;

  @ApiProperty({ description: 'GameTemplate (egg) id' })
  @IsString()
  templateId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.1)
  cpuCores!: number;

  @ApiProperty()
  @IsInt()
  @Min(256)
  memoryMb!: number;

  @ApiProperty()
  @IsInt()
  @Min(1024)
  diskMb!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  swapMb?: number;

  @ApiPropertyOptional({ description: 'Initial env var overrides' })
  @IsOptional()
  @IsObject()
  environment?: Record<string, string>;
}
