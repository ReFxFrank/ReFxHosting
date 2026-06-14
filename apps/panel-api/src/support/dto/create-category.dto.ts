import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Admin payload for creating a ticket category with SLA targets. */
export class CreateCategoryDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ description: 'Unique URL slug, lowercase-with-dashes.' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with single dashes',
  })
  slug!: string;

  @ApiPropertyOptional({
    description: 'First-response SLA target in minutes.',
    default: 240,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  slaFirstResponseMin?: number;

  @ApiPropertyOptional({
    description: 'Resolution SLA target in minutes.',
    default: 2880,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  slaResolutionMin?: number;
}
