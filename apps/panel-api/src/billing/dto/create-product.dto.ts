import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Admin payload to create a billable Product (a plan customers subscribe to).
 * Resource fields seed the limits applied to provisioned servers.
 */
export class CreateProductDto {
  @ApiProperty({ enum: ProductType })
  @IsEnum(ProductType)
  type!: ProductType;

  @ApiProperty({ example: 'Minecraft 4GB' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'minecraft-4gb', description: 'URL-safe unique slug.' })
  @IsString()
  @MaxLength(140)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase kebab-case',
  })
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'vCPU cores applied to provisioned servers.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cpuCores?: number;

  @ApiPropertyOptional({ description: 'Memory in MiB.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  memoryMb?: number;

  @ApiPropertyOptional({ description: 'Disk in MiB.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  diskMb?: number;

  @ApiPropertyOptional({ description: 'Optional player-slot cap.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  slots?: number;

  @ApiPropertyOptional({
    type: [String],
    description: 'Game template ids allowed on this product. Empty = all.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  allowedTemplateIds?: string[];
}
