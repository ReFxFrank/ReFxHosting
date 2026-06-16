import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Admin payload to create a HardwareTier (Low/Mid/High package) under a
 * HARDWARE_TIER game product. The product id comes from the route, so it is NOT
 * part of the body. Per-interval pricing is added separately via the tier's
 * Price rows (POST /admin/products/:id/tiers/:tierId/prices).
 */
export class CreateHardwareTierDto {
  @ApiProperty({ example: 'Mid Tier' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'Balanced package for mid-size communities.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ description: 'vCPU cores for this tier.' })
  @IsNumber()
  @Min(0)
  cpuCores!: number;

  @ApiProperty({ description: 'Memory (MiB) for this tier.' })
  @IsInt()
  @Min(0)
  memoryMb!: number;

  @ApiProperty({ description: 'Disk (MiB) for this tier.' })
  @IsInt()
  @Min(0)
  diskMb!: number;

  @ApiPropertyOptional({
    description: 'Suggested player count (informational only — not the billing basis).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  recommendedPlayers?: number;

  @ApiPropertyOptional({ description: 'Highlight this tier as recommended/default.' })
  @IsOptional()
  @IsBoolean()
  isRecommended?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Display order (ascending).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/** Admin payload to edit an existing HardwareTier (all fields optional). */
export class UpdateHardwareTierDto extends PartialType(CreateHardwareTierDto) {}
